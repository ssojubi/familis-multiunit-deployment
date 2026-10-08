import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSearchParams } from "react-router-dom";
import { getApiBase, getSocketUrl, toApiUrl } from "../apiConfig";
import { apiFetch } from "../lib/api";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { getAdminRoomContext, saveAdminRoomContext } from "../adminRoomContext";
import { WEBRTC_CONFIGURATION } from "../webrtcConfig";

/* ───────────────────────── Shared types ───────────────────────── */

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

/** Registered kiosk record from the database. */
type RegisteredKiosk = {
  id: number;
  name: string;
  location: string | null;
  imageUrl: string | null;
  createdAt: string | null;
};

/* ═══════════════════════════════════════════════════════════════
   Root component — switches between Overview and Detail views
   ═══════════════════════════════════════════════════════════════ */

export default function VideoMonitoring() {
  const [selectedKioskId, setSelectedKioskId] = useState<number | null>(null);

  if (selectedKioskId !== null) {
    return (
      <KioskMonitorDetail
        kioskId={selectedKioskId}
        onBack={() => setSelectedKioskId(null)}
      />
    );
  }

  return <KioskOverviewDashboard onSelectKiosk={setSelectedKioskId} />;
}

/* ═══════════════════════════════════════════════════════════════
   VIEW 1 — Kiosk Overview Dashboard
   Lightweight grid of kiosk cards. No WebRTC / live streams.
   ═══════════════════════════════════════════════════════════════ */

function KioskOverviewDashboard({
  onSelectKiosk,
}: {
  onSelectKiosk: (kioskId: number) => void;
}) {
  const [kiosks, setKiosks] = useState<RegisteredKiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRoomCount, setActiveRoomCount] = useState(0);

  /* Fetch registered kiosks from DB */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiFetch("/api/kiosks")
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to load kiosks.");
        if (!cancelled) setKiosks(payload.kiosks ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load kiosks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* Fetch active room count for status indicator */
  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/testing-rooms?status=active")
      .then(async (res) => {
        const payload = await res.json();
        if (res.ok && payload?.ok) {
          if (!cancelled) setActiveRoomCount((payload.rooms ?? []).length);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <PageHeader variant="expanded">
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <PageTitle
              title="Monitor Kiosks"
              subtitle="Select a kiosk to view its live camera stream. Camera frames continue through the central FER pipeline."
            />
            <p className="text-[12px] text-gray-500 mt-1">
              Click a kiosk card to open its monitoring view. Live video streams are only loaded when you select a specific kiosk.
            </p>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
              <span className="text-[13px] font-semibold text-gray-700">
                {kiosks.length} kiosk{kiosks.length === 1 ? "" : "s"} registered
              </span>
            </div>
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeRoomCount > 0 ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
              <span className="text-[13px] font-semibold text-gray-700">
                {activeRoomCount} active room{activeRoomCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Loading / Error states */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-gray-300 border-t-[#e8174a] rounded-full animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Loading kiosks…</p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Kiosk grid */}
          {!loading && !error && kiosks.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <KioskEmptyIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm font-medium">
                No kiosks registered yet.
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Add kiosks in the Food Management &rarr; Setup section.
              </p>
            </div>
          )}

          {!loading && !error && kiosks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {kiosks.map((kiosk) => (
                <KioskCard
                  key={kiosk.id}
                  kiosk={kiosk}
                  onClick={() => onSelectKiosk(kiosk.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </PageHeader>
  );
}

/* ─── Kiosk Card ─── */

function KioskCard({
  kiosk,
  onClick,
}: {
  kiosk: RegisteredKiosk;
  onClick: () => void;
}) {
  const resolvedImage = toApiUrl(kiosk.imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 text-left overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 focus:ring-offset-2"
    >
      {/* Thumbnail / Icon area */}
      <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative overflow-hidden">
        {resolvedImage ? (
          <img
            src={resolvedImage}
            alt={kiosk.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <KioskPlaceholderIcon className="w-12 h-12 text-gray-300 group-hover:text-gray-400 transition-colors" />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
            Open Monitor →
          </span>
        </div>
      </div>

      {/* Info area */}
      <div className="px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-[#e8174a] transition-colors">
          {kiosk.name}
        </h3>
        {kiosk.location && (
          <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
            <LocationPinIcon className="w-3 h-3 text-gray-400 shrink-0" />
            {kiosk.location}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
            ID: {kiosk.id}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW 2 — Individual Kiosk Monitoring Detail
   Opens the WebRTC stream for the selected room. Reuses all
   existing Socket.IO signaling and peer connection logic.
   ═══════════════════════════════════════════════════════════════ */

function KioskMonitorDetail({
  kioskId,
  onBack,
}: {
  kioskId: number;
  onBack: () => void;
}) {
  const [searchParams] = useSearchParams();

  /* Kiosk metadata from DB */
  const [kioskInfo, setKioskInfo] = useState<RegisteredKiosk | null>(null);

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

  /* Load kiosk metadata */
  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/kiosks")
      .then(async (res) => {
        const payload = await res.json();
        if (res.ok && payload?.ok) {
          const match = (payload.kiosks ?? []).find((k: RegisteredKiosk) => k.id === kioskId);
          if (!cancelled && match) setKioskInfo(match);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [kioskId]);

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

  const createPeerConnectionFor = useCallback((peerId: string): RTCPeerConnection => {
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
  }, [roomId]);

  const removeKiosk = useCallback((peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    sessionStatusByPeerRef.current.delete(peerId);
    setRemoteKiosks((prev) => prev.filter((k) => k.peerId !== peerId));
  }, []);

  const cleanupAllPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    sessionStatusByPeerRef.current.clear();
    setRemoteKiosks([]);
  }, []);

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
        {/* Back navigation */}
        <div className="mb-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm transition-colors group"
          >
            <span aria-hidden="true" className="group-hover:-translate-x-0.5 transition-transform">←</span>
            Back to Kiosk Overview
          </button>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                {kioskInfo?.name ?? `Kiosk #${kioskId}`}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {kioskInfo?.location && (
                  <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                    <LocationPinIcon className="w-3.5 h-3.5 text-gray-400" />
                    {kioskInfo.location}
                  </span>
                )}
                <span className="text-sm text-gray-400">
                  ID: {kioskId}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-gray-500 mt-2">
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

/* ═══════════════════════════════════════════════════════════════
   KioskVideoTile — unchanged from original
   ═══════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════
   SVG Icon Components
   ═══════════════════════════════════════════════════════════════ */

function KioskPlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      <circle cx="12" cy="10" r="2.5" />
      <path strokeLinecap="round" d="M7 7h.01" />
    </svg>
  );
}

function KioskEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2.5" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6M12 7v6" />
    </svg>
  );
}

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}
