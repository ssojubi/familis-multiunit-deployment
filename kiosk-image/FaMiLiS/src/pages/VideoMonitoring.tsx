import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useSearchParams } from "react-router-dom";
import { getApiBase, getSocketUrl } from "../apiConfig";
import { apiFetch } from "../lib/api";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { getAdminRoomContext, saveAdminRoomContext } from "../adminRoomContext";
import { WEBRTC_CONFIGURATION } from "../webrtcConfig";

type Role = "host" | "viewer" | null;

const SOCKET_SERVER_URL = getSocketUrl();
const API_BASE = getApiBase();

interface ServerToClientEvents {
  "room-error": (data: { error?: string }) => void;
  "viewer-connected": (viewerId: string) => void;
  "user-disconnected": (peerId: string) => void;
  "host-disconnected": () => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
  
  "tester-session-status": (data: {
    from?: string;
    status: "recording" | "completed";
    sessionId?: number;
    foodName?: string;
  }) => void;
}

interface ClientToServerEvents {
  "join-room": (roomId: string) => void;
  signal: (data: {
    room: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
}

type RemoteKiosk = {
  peerId: string;
  stream: MediaStream;
  label: string;
  sessionId: number | null;
  foodName: string | null;
};

type ActiveRoom = { id: number; roomCode: string; foodId: number; foodName: string; sessionsActive: number };
type MonitorFood = { id: number; name: string };

export default function VideoMonitoring() {
  const [searchParams] = useSearchParams();

  const [kioskStatus, setKioskStatus] = useState<string>("Connecting…");
  const [{ role }] = useState<{ role: Role }>(() => {
    const storedUser =
      localStorage.getItem("familis.user") || localStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userRole = user?.role;
    if (userRole === "admin") return { role: "viewer" };
    if (userRole === "staff" || userRole === "tester") {
      return { role: "host" };
    }
    return { role: null };
  });
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [foods, setFoods] = useState<MonitorFood[]>([]);
  const [newRoomFoodId, setNewRoomFoodId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(() => searchParams.get("room") || getAdminRoomContext().roomId);
  const [publicAccessUrl, setPublicAccessUrl] = useState<string>("");
  const [remoteKiosks, setRemoteKiosks] = useState<RemoteKiosk[]>([]);
  const sessionStatusByPeerRef = useRef<Map<string, { sessionId: number | null; foodName: string | null }>>(new Map());
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(
    null,
  );
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  const selectedRoom = activeRooms.find((room) => room.roomCode === roomId);
  const validFoodId = selectedRoom?.foodId ?? null;

  useEffect(() => {
    if (role !== "viewer") return;
    let cancelled = false;
    void apiFetch("/api/testing-rooms?status=active")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Could not load active testing rooms.");
        const rooms = (payload.rooms ?? []) as ActiveRoom[];
        if (cancelled) return;
        setActiveRooms(rooms);
        setRoomId((current) => rooms.some((room) => room.roomCode === current) ? current : rooms[0]?.roomCode ?? "");
      })
      .catch(() => { if (!cancelled) setActiveRooms([]); });
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role !== "viewer") return;
    let cancelled = false;
    void apiFetch("/api/foods")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Could not load foods.");
        const list = (payload.foods ?? []).map((food: { id: number; name: string }) => ({ id: Number(food.id), name: String(food.name) })) as MonitorFood[];
        if (cancelled) return;
        setFoods(list);
        setNewRoomFoodId((current) => current || String(list[0]?.id ?? ""));
      })
      .catch(() => { if (!cancelled) setFoods([]); });
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role === "viewer" && roomId) {
      saveAdminRoomContext(roomId, validFoodId);
    }
  }, [role, roomId, validFoodId]);

  useEffect(() => {
    async function loadPublicAccessUrl() {
      try {
        const response = await fetch(`${API_BASE}/api/public-access`);
        const payload = await response.json();
        if (response.ok && payload?.ok && payload?.enabled && payload?.url) {
          setPublicAccessUrl(String(payload.url));
        }
      } catch {
        setPublicAccessUrl("");
      }
    }

    void loadPublicAccessUrl();
  }, []);

  const copyPublicAccessUrl = () => {
    if (!publicAccessUrl) return;
    navigator.clipboard.writeText(publicAccessUrl);
    alert("Public mobile access URL copied.");
  };

  const copyRoomCodeToClipboard = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    alert("Room code copied.");
  };

  const createTestingRoom = async () => {
    if (!newRoomFoodId || creatingRoom) return;
    setCreatingRoom(true);
    setRoomMessage(null);
    try {
      const response = await apiFetch("/api/testing-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: Number(newRoomFoodId) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload.room) throw new Error(payload?.error || "Could not create the testing room.");
      const room = payload.room as ActiveRoom;
      setActiveRooms((rooms) => [room, ...rooms.filter((item) => item.id !== room.id)]);
      setRoomId(room.roomCode);
      setRoomMessage(`Room ready for ${room.foodName}. Share code ${room.roomCode} with tasters.`);
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Could not create the testing room.");
    } finally {
      setCreatingRoom(false);
    }
  };

  const createPeerConnectionFor = (peerId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    peerConnectionsRef.current.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit("signal", {
          room: roomId,
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      setKioskStatus(`Kiosk ${peerId.slice(0, 6)}: ${pc.connectionState}`);
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setRemoteKiosks((prev) => {
        if (prev.find((k) => k.peerId === peerId)) return prev;
        const label = `Kiosk ${prev.length + 1}`;
        const sessionStatus = sessionStatusByPeerRef.current.get(peerId);
        return [...prev, { peerId, stream, label, sessionId: sessionStatus?.sessionId ?? null, foodName: sessionStatus?.foodName ?? null }];
      });
    };

    return pc;
  };

  const removeKiosk = (peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    sessionStatusByPeerRef.current.delete(peerId);
    setRemoteKiosks((prev) => prev.filter((k) => k.peerId !== peerId));
  };

  const cleanupAllPeerConnections = () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    sessionStatusByPeerRef.current.clear();
    setRemoteKiosks([]);
  };

  useEffect(() => {
    if (!roomId || !role) return;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_SERVER_URL,
      {
        reconnection: true,
        transports: ["websocket", "polling"],
        withCredentials: true,
      },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      setKioskStatus(`Connected as ${role}. Room: ${roomId}`);
      socket.emit("join-room", roomId);
    });

    socket.on("connect_error", () => {
      setKioskStatus("Connection failed — check that server.js is running.");
    });

    socket.on("room-error", (data) => {
      setKioskStatus(data.error || "This testing room is no longer active.");
    });

    socket.on("signal", async (data) => {
      if (role !== "viewer") return;
      const peerId = data.from;
      if (!peerId) return;

      const pc = createPeerConnectionFor(peerId);

      if (data.sdp) {
        if (data.sdp.type === "offer") {
          setKioskStatus("Receiving stream…");
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("signal", { room: roomId, to: peerId, sdp: answer });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("ICE candidate error:", e);
        }
      }
    });

    socket.on("tester-session-status", (data) => {
      const { from, status, sessionId, foodName } = data;
      if (!from) return;

      sessionStatusByPeerRef.current.set(from, status === "recording"
        ? { sessionId: sessionId ?? null, foodName: foodName ?? null }
        : { sessionId: null, foodName: null });

      setRemoteKiosks((prev) =>
        prev.map((k) =>
          k.peerId === from
            ? {
                ...k,
                sessionId: status === "recording" ? sessionId ?? null : null,
                foodName: status === "recording" ? foodName ?? null : null,
              }
            : k,
        ),
      );

      setKioskStatus(
        status === "recording"
          ? foodName
            ? `Tester started tasting: ${foodName} (session #${sessionId ?? "?"})`
            : `Tester started their session (session #${sessionId ?? "?"})`
          : "Tester completed their session.",
      );
    });

    socket.on("user-disconnected", (peerId) => {
      removeKiosk(peerId);
      setKioskStatus("A kiosk disconnected.");
    });

    socket.on("host-disconnected", () => {
      setKioskStatus("Host disconnected.");
    });

    return () => {
      socket.disconnect();
      cleanupAllPeerConnections();
    };
    // Reconnect only when the selected room or role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, role]);

  return (
    <PageHeader variant="expanded">
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <PageTitle title="Monitor Kiosks" subtitle="Watch connected tasters while they record. Camera frames continue through the central FER pipeline." />
          <p className="text-[12px] text-gray-500 mt-1">
            Open a food test, share its room code, then tasters log in, join, consent, and start recording. Their camera feed and captured frames go through the existing kiosk and FER pipeline.
          </p>
        </div>

        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <p className="text-[14px] text-gray-500">
              Status: <span className="font-semibold text-gray-700">{kioskStatus}</span>
              {" · "}
              <span className="font-semibold text-gray-700">
                {remoteKiosks.length} kiosk{remoteKiosks.length === 1 ? "" : "s"} connected
              </span>
            </p>

            <div className="inline-flex items-center gap-2">
              <select aria-label="Active food test" value={roomId} onChange={(event) => setRoomId(event.target.value)} className="max-w-[260px] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700" disabled={!activeRooms.length}>
                {activeRooms.length ? activeRooms.map((room) => <option key={room.id} value={room.roomCode}>{room.foodName} · {room.roomCode}</option>) : <option value="">No active food tests</option>}
              </select>
              <button
                type="button"
                onClick={copyPublicAccessUrl}
                disabled={!publicAccessUrl}
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Copy Mobile Access URL
              </button>
              <button
                type="button"
                onClick={copyRoomCodeToClipboard}
                disabled={!roomId}
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Copy Room Code
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {role === "viewer" ? (
              <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs font-semibold text-gray-700">
                  Open a food test for tasters
                  <select value={newRoomFoodId} onChange={(event) => setNewRoomFoodId(event.target.value)} disabled={!foods.length || creatingRoom} className="mt-1.5 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-normal">
                    {foods.length ? foods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>) : <option value="">No foods available</option>}
                  </select>
                </label>
                <button type="button" onClick={() => void createTestingRoom()} disabled={!newRoomFoodId || creatingRoom} className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40">
                  {creatingRoom ? "Opening…" : "Open / Create Room"}
                </button>
              </div>
            ) : null}
            {roomMessage ? <p role="status" className={`text-xs ${roomMessage.startsWith("Room ready") ? "text-green-700" : "text-red-600"}`}>{roomMessage}</p> : null}
            {/* Dynamic grid: one tile per connected kiosk, no fixed count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remoteKiosks.length === 0 ? (
                <div className="col-span-full bg-black aspect-video rounded-lg flex items-center justify-center">
                  <p className="text-gray-300 text-sm">{roomId ? "Waiting for tasters to connect…" : "Start a food test to monitor its kiosks."}</p>
                </div>
              ) : (
                remoteKiosks.map((kiosk) => (
                  <KioskVideoTile
                    key={kiosk.peerId}
                    kiosk={kiosk}
                    onStop={() => removeKiosk(kiosk.peerId)}
                  />
                ))
              )}
            </div>

            {publicAccessUrl ? (
              <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 break-all">
                <span className="font-semibold text-gray-700">Mobile Access URL: </span>
                <span className="text-gray-600">{publicAccessUrl}</span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Testers open this address, log in, select the active food test,
                  and enter room {roomId}.
                </p>
              </div>
            ) : (
              <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
                Public mobile access is not running.
              </div>
            )}
          </div>
        </section>
        </div>
      </main>
    </PageHeader>
  );
}

function KioskVideoTile({
  kiosk,
  onStop,
}: {
  kiosk: RemoteKiosk;
  onStop: () => void;
}) {
  const { stream, label, sessionId, foodName } = kiosk;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play();
        }
      });
    }
  }, [stream]);

  const togglePause = () => {
    if (!videoRef.current) return;
    if (paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
    setPaused((p) => !p);
  };

  return (
    <div className="relative bg-black aspect-video rounded-lg overflow-hidden border border-gray-200 group">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />

      <span className="absolute top-2 left-2 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded font-semibold">
        {label}
      </span>

      {sessionId != null && (
        <span className="absolute top-2 right-2 text-[10px] text-white bg-green-600/80 px-2 py-0.5 rounded font-semibold">
          Recording{foodName ? ` · ${foodName}` : ""} · S-{sessionId}
        </span>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-white text-sm font-semibold">Paused</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={togglePause}
          className="flex-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          {paused ? "▶ Resume" : "⏸ Pause View"}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex-1 bg-red-500/80 hover:bg-red-600 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          ⏹ Stop Watching
        </button>
      </div>
    </div>
  );
}
