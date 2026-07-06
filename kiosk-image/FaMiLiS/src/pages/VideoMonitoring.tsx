import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import logo from "../assets/logo.png";
import { performLogout } from "../RequireAuth";
import { useNavigate, useSearchParams } from "react-router-dom";

type Role = "host" | "viewer" | null;

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

interface ServerToClientEvents {
  "viewer-connected": () => void;
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
  "join-room": (roomId: string, role: Role) => void;
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
  foodName: string | null;
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

  // Food selected on the Dashboard, carried over via ?foodId= — informational only now.
  const foodIdParam = searchParams.get("foodId");

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

  // build the tester share link (carries the room, and the food if we have one)
  useEffect(() => {
    if (roomId) {
      const params = new URLSearchParams({ room: roomId });
      if (foodIdParam) params.set("foodId", foodIdParam);
      setShareUrl(`${window.location.origin}/tester-consent?${params.toString()}`);
    }
  }, [roomId, foodIdParam]);

  const copyLinkToClipboard = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    alert("Share link copied! Open it on the kiosk/remote device. The tester starts and stops their own recording.");
  };

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
        return [...prev, { peerId, stream, label, sessionId: null, foodName: null }];
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

    // Tester started/stopped their own recording — reflect it on that kiosk's tile.
    socket.on("tester-session-status", (data) => {
      const { from, status, sessionId, foodName } = data;
      if (!from) return;

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
  }, [roomId, role]);

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
            Live feeds from every connected kiosk. Testers start and stop their own
            recording — this screen is for watching only.
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

            {shareUrl && (
              <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 break-all">
                <span className="font-semibold text-gray-700">Active Channel Node Link: </span>
                <span className="text-gray-600">{shareUrl}</span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Open this link on each kiosk device's browser. Every kiosk that
                  joins this room automatically appears above.
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
