import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import logo from "../assets/logo.png";
import { performLogout } from "../RequireAuth";
import { useNavigate, useSearchParams } from "react-router-dom";

type Role = "host" | "viewer" | null;

type Food = {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  createdAt: string | null;
  sessionsTotal: number;
  sessionsActive: number;
  avgDurationMin: number | null;
};

const API_BASE =
  window.location.hostname === "localhost"
    ? "https://localhost:8080"
    : `https://${window.location.hostname}:8080`;

const SOCKET_SERVER_URL = API_BASE;

const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// how often each connected kiosk grabs a frame for FER scoring.
const FRAME_CAPTURE_INTERVAL_MS = 3000;

interface ServerToClientEvents {
  "viewer-connected": () => void;
  "user-disconnected": (peerId: string) => void;
  "host-disconnected": () => void;
  "admin-start-stream": (data?: {
    sessionId?: number | string;
    foodName?: string;
  }) => void;
  "admin-stop-stream": () => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
}

interface ClientToServerEvents {
  "join-room": (roomId: string, role: Role) => void;
  "admin-start-stream": (data: {
    room: string;
    sessionId?: number | string;
    foodName?: string;
  }) => void;
  "admin-stop-stream": (data: { room: string; sessionId?: number | string }) => void;
  signal: (data: {
    room: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
}

type RemoteKiosk = {
  peerId: string;
  stream: MediaStream;
  label: string;
  sessionId: number | null;
};

export default function VideoMonitoring() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [kioskStatus, setKioskStatus] = useState<string>("Connecting…");
  const [role, setRole] = useState<Role>(null);
  const [roomId, setRoomId] = useState<string>("");
  const [shareUrl, setShareUrl] = useState<string>("");

  const [remoteKiosks, setRemoteKiosks] = useState<RemoteKiosk[]>([]);
  const remoteKiosksRef = useRef<RemoteKiosk[]>([]);
  useEffect(() => {
    remoteKiosksRef.current = remoteKiosks;
  }, [remoteKiosks]);

  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(
    null,
  );
  // Map<peerId, RTCPeerConnection> ensures one connection per kiosk, grown/shrunk dynamically as kiosks join or leave the room.
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Food selected on the Dashboard, carried over via ?foodId=
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [kioskFoodId, setKioskFoodId] = useState<number | null>(null);

  const [kioskCmdLoading, setKioskCmdLoading] = useState(false);
  const [kioskCmdError, setKioskCmdError] = useState<string | null>(null);

  const selectedFood = useMemo(
    () => foods.find((f) => f.id === kioskFoodId) ?? null,
    [foods, kioskFoodId],
  );

  const anyKioskRecording = remoteKiosks.some((k) => k.sessionId != null);

  // get chosen food from dashboard
  useEffect(() => {
    const ac = new AbortController();

    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await fetch(`${API_BASE}/api/foods`, { signal: ac.signal });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load foods.");
        }
        const list: Food[] = json.foods ?? [];
        setFoods(list);

        const foodIdParam = searchParams.get("foodId");
        const parsed = foodIdParam ? Number.parseInt(foodIdParam, 10) : NaN;
        if (Number.isFinite(parsed) && list.some((f) => f.id === parsed)) {
          setKioskFoodId(parsed);
        } else {
          // if no food
          setKioskFoodId(list[0]?.id ?? null);
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setFoodsError(err?.message || "Failed to load foods.");
      } finally {
        setFoodsLoading(false);
      }
    }

    void loadFoods();
    return () => ac.abort();
  }, []);

  // set role and room
  useEffect(() => {
    const storedUser =
      localStorage.getItem("familis.user") || localStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userRole = user?.role;

    const urlRoom = searchParams.get("room");

    if (userRole === "admin") {
      setRole("viewer");
      setRoomId(urlRoom || Math.random().toString(36).substring(2, 9));
    } else if (userRole === "staff" || userRole === "tester") {
      setRole("host");
      setRoomId(urlRoom || "default-staff-room");
    } else if (urlRoom) {
      setRoomId(urlRoom);
      setRole("viewer");
    }
  }, []);

  // redirect testers to consent
  useEffect(() => {
    if (roomId) {
      setShareUrl(`${window.location.origin}/tester-consent?room=${roomId}`);
    }
  }, [roomId]);

  const copyLinkToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    alert("Share link copied! Open it on the kiosk/remote device.");
  };

  // fallback lang naman
  const copyRoomIdToClipboard = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    alert("Room ID copied!");
  };

  // WebRTC peer connection
  const createPeerConnectionFor = (peerId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(WEBRTC_CONFIG);
    peerConnectionsRef.current.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit("signal", {
          room: roomId,
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
        return [...prev, { peerId, stream, label, sessionId: null }];
      });
    };

    return pc;
  };

  const removeKiosk = (peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    setRemoteKiosks((prev) => prev.filter((k) => k.peerId !== peerId));
  };

  const cleanupAllPeerConnections = () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteKiosks([]);
  };

  // socket / signalling
  useEffect(() => {
    if (!roomId || !role) return;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_SERVER_URL,
      { reconnection: true, transports: ["websocket", "polling"] },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      setKioskStatus(`Connected as ${role}. Room: ${roomId}`);
      socket.emit("join-room", roomId, role);
    });

    socket.on("connect_error", () => {
      setKioskStatus("Connection failed — check that server.js is running.");
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
          socket.emit("signal", { room: roomId, sdp: answer });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("ICE candidate error:", e);
        }
      }
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
  }, [roomId, role]);

  // start and stopping videos
  const startAllKiosks = async () => {
    if (!kioskFoodId) {
      setKioskCmdError("Select a food before starting.");
      return;
    }
    if (remoteKiosks.length === 0) {
      setKioskCmdError("No kiosks are connected yet.");
      return;
    }

    const storedUser =
      localStorage.getItem("familis.user") || localStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userId = user?.id;
    if (!userId) {
      setKioskCmdError("Could not read user ID. Try logging out and back in.");
      return;
    }

    setKioskCmdLoading(true);
    setKioskCmdError(null);
    try {
      const results = await Promise.all(
        remoteKiosksRef.current
          .filter((k) => k.sessionId == null)
          .map(async (kiosk) => {
            const res = await fetch(`${API_BASE}/api/sessions/start`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                foodId: kioskFoodId,
                agentKioskId: kiosk.peerId,
                webKiosk: true,
              }),
            });
            const json = await res.json();
            if (!res.ok || !json?.ok) {
              throw new Error(json?.error || `Failed to start ${kiosk.label}.`);
            }
            return { peerId: kiosk.peerId, sessionId: json.session.id as number };
          }),
      );

      setRemoteKiosks((prev) =>
        prev.map((k) => {
          const match = results.find((r) => r.peerId === k.peerId);
          return match ? { ...k, sessionId: match.sessionId } : k;
        }),
      );

      if (socketRef.current && roomId) {
        socketRef.current.emit("admin-start-stream", {
          room: roomId,
          sessionId: results[0]?.sessionId,
          foodName: selectedFood?.name,
        });
      }

      setKioskStatus(`Started ${results.length} kiosk session(s).`);
    } catch (err: any) {
      setKioskCmdError(err?.message || "Failed to start session(s).");
    } finally {
      setKioskCmdLoading(false);
    }
  };

  const stopAllKiosks = async () => {
    const active = remoteKiosksRef.current.filter((k) => k.sessionId != null);
    if (active.length === 0) return;

    setKioskCmdLoading(true);
    setKioskCmdError(null);
    try {
      await Promise.all(
        active.map(async (kiosk) => {
          const res = await fetch(
            `${API_BASE}/api/sessions/${kiosk.sessionId}/stop`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agentKioskId: kiosk.peerId }),
            },
          );
          const json = await res.json();
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || `Failed to stop ${kiosk.label}.`);
          }
        }),
      );

      setRemoteKiosks((prev) => prev.map((k) => ({ ...k, sessionId: null })));

      if (socketRef.current && roomId) {
        socketRef.current.emit("admin-stop-stream", { room: roomId });
      }

      setKioskStatus("All kiosk sessions stopped.");
    } catch (err: any) {
      setKioskCmdError(err?.message || "Failed to stop session(s).");
    } finally {
      setKioskCmdLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3"
            aria-label="Go to dashboard"
          >
            <img src={logo} alt="FaMiLis logo" className="w-[44px] h-[44px] object-contain" />
            <span className="text-white text-[22px] font-bold tracking-wide">FaMiLis</span>
          </button>
          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-8 max-w-5xl mx-auto">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm transition-colors"
        >
          <span aria-hidden="true">←</span>
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-[26px] font-bold text-gray-900">Monitor Kiosks</h1>
          <p className="text-[12px] text-gray-500 mt-1">
            Live feeds from every connected kiosk. Pause or stop recordings.
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
              <button
                type="button"
                onClick={copyLinkToClipboard}
                disabled={!shareUrl}
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🔗 Copy Kiosk Share Link
              </button>
              <button
                type="button"
                onClick={copyRoomIdToClipboard}
                disabled={!roomId}
                className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🔗 Copy Room ID
              </button>
            </div>
          </div>

          {/* Food being tested — loaded from the Dashboard's selection */}
          <div className="mb-5">
            <label className="block text-[13px] font-semibold text-gray-700 mb-2">
              Food being tested
            </label>
            {foodsLoading ? (
              <p className="text-[12px] text-gray-500">Loading foods…</p>
            ) : foodsError ? (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {foodsError}
              </p>
            ) : foods.length === 0 ? (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                No foods added yet. Add a food in Food Management first.
              </p>
            ) : (
              <div className="relative">
                <select
                  value={kioskFoodId ?? ""}
                  onChange={(e) => setKioskFoodId(Number(e.target.value))}
                  disabled={anyKioskRecording}
                  className="w-full appearance-none text-[14px] text-gray-900 border border-gray-200 rounded-lg pl-4 pr-10 py-3 bg-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#e8174a]/20 focus:border-[#e8174a]/40"
                >
                  {foods.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M5 7.5L10 12.5L15 7.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Dynamic grid: one tile per connected kiosk, no fixed count */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {remoteKiosks.length === 0 ? (
                <div className="col-span-full bg-black aspect-video rounded-lg flex items-center justify-center">
                  <p className="text-gray-500 text-sm">Waiting for kiosks to connect…</p>
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

            {kioskCmdError && (
              <p className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {kioskCmdError}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={
                  kioskCmdLoading ||
                  !kioskFoodId ||
                  remoteKiosks.length === 0 ||
                  anyKioskRecording
                }
                onClick={startAllKiosks}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-md text-sm font-semibold transition-colors text-center"
              >
                {kioskCmdLoading && !anyKioskRecording
                  ? "Starting…"
                  : "▶ Start Recording (All Kiosks)"}
              </button>

              <button
                type="button"
                disabled={kioskCmdLoading || !anyKioskRecording}
                onClick={stopAllKiosks}
                className="flex-1 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 border border-gray-200 py-2.5 rounded-md text-sm font-semibold transition-colors text-center"
              >
                {kioskCmdLoading && anyKioskRecording ? "Stopping…" : "⏹ Stop Recording (All)"}
              </button>
            </div>

            {shareUrl && (
              <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 break-all">
                <span className="font-semibold text-gray-700">Active Channel Node Link: </span>
                <span className="text-gray-600">{shareUrl}</span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Open this link on each kiosk device's browser. Every kiosk that
                  joins this room automatically appears above — no fixed limit.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function KioskVideoTile({
  kiosk,
  onStop,
}: {
  kiosk: RemoteKiosk;
  onStop: () => void;
}) {
  const { peerId, stream, label, sessionId } = kiosk;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

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

  // capture frames from each kiosk
  useEffect(() => {
    if (!sessionId || paused) return;

    const video = videoRef.current;
    if (!video) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    const captureFrame = async () => {
      if (!video.videoWidth || !video.videoHeight) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          try {
            const fd = new FormData();
            fd.append("frame", blob, `${peerId}-${Date.now()}.jpg`);
            const res = await fetch(
              `${API_BASE}/api/sessions/${sessionId}/frames`,
              { method: "POST", body: fd },
            );
            if (!res.ok) {
              const json = await res.json().catch(() => null);
              setCaptureError(json?.error || `Frame upload failed (${res.status}).`);
            } else {
              setCaptureError(null);
            }
          } catch (err: any) {
            setCaptureError(err?.message || "Frame upload failed.");
          }
        },
        "image/jpeg",
        0.85,
      );
    };

    const intervalId = window.setInterval(captureFrame, FRAME_CAPTURE_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [sessionId, paused, peerId]);

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
          Recording · S-{sessionId}
        </span>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-white text-sm font-semibold">Paused</span>
        </div>
      )}

      {captureError && (
        <div className="absolute bottom-9 left-2 right-2 text-[10px] text-white bg-red-600/80 px-2 py-1 rounded">
          {captureError}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={togglePause}
          className="flex-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          {paused ? "▶ Resume" : "⏸ Pause"}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex-1 bg-red-500/80 hover:bg-red-600 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          ⏹ Disconnect
        </button>
      </div>
    </div>
  );
}
