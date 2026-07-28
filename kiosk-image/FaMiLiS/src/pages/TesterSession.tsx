import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";

import {
  getApiBase,
  getCentralWsBase,
  getSocketUrl,
} from "../apiConfig";
import {
  captureTesterContext,
  getOrCreateBrowserKioskId,
} from "../testerContext";

const SESSIONS_API_BASE = getApiBase();
const WS_BASE = getCentralWsBase();
const SOCKET_SERVER_URL = getSocketUrl();
const FRAME_CAPTURE_MS = 750;
const MAX_FRAME_WIDTH = 960;

type ServerToClientEvents = {
  "viewer-connected": (viewerId: string) => void;
  "user-disconnected": (peerId: string) => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
};

type ClientToServerEvents = {
  "join-room": (roomId: string, role: "host") => void;
  signal: (data: {
    room: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
  "tester-session-status": (data: {
    room: string;
    status: "recording" | "completed";
    sessionId?: number;
    foodName?: string;
  }) => void;
};

const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

function getStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem("familis.user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const candidate = parsed?.id ?? parsed?.userId ?? parsed?.user_id;
    const numeric = Number(candidate);
    return Number.isFinite(numeric) ? numeric : null;
  } catch {
    return null;
  }
}

export default function TesterSession() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("ready");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>("Camera starting...");
  const [isRecording, setIsRecording] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [foodName, setFoodName] = useState<string | undefined>(undefined);
  const [startError, setStartError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerIdsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const isRecordingRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const lastRegistryNotifyRef = useRef(0);
  const frameInFlightRef = useRef(false);

  const [testerContext] = useState(() =>
    captureTesterContext(window.location.search),
  );
  const roomId = testerContext.roomId || "default-tester-room";
  const foodId = testerContext.foodId;
  const kioskId = getOrCreateBrowserKioskId(testerContext.kioskId);

  useEffect(() => {
    let disposed = false;

    localStorage.setItem("kiosk_id", kioskId);

    ensureCameraStream()
      .then(() => {
        if (disposed) return;
        setMessage("Camera ready. Start whenever you're ready to taste.");
      })
      .catch((err) => {
        if (disposed) return;
        console.error("Camera error:", err);
        setMessage("Camera access denied. Please allow camera access.");
      });

    const wsUrl = `${WS_BASE}/ws/kiosk/${kioskId}`;
    console.log("Connecting to central server WS:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposed) return;
      console.log("Central server WebSocket connected");
      if (isRecordingRef.current && sessionIdRef.current != null) {
        notifyCentralSessionStarted(sessionIdRef.current);
      }
    };

    ws.onerror = (err) => {
      if (disposed) return;
      console.error("WebSocket error:", err);
    };

    ws.onclose = () => {
      if (disposed) return;
      console.log("WebSocket closed");
    };

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_SERVER_URL,
      {
        reconnection: true,
        transports: ["websocket", "polling"],
      },
    );
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disposed) return;
      console.log(
        `[TesterSession] Socket.IO connected. Joining room "${roomId}" as host`,
      );
      socket.emit("join-room", roomId, "host");
    });

    socket.on("viewer-connected", (viewerId) => {
      viewerIdsRef.current.add(viewerId);
      if (isRecordingRef.current) {
        void publishCameraStream(viewerId);
      }
    });

    socket.on("signal", async (data) => {
      if (disposed) return;
      const peerId = data.from;
      if (!peerId) return;
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc) return;

      if (data.sdp?.type === "answer" && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error("ICE candidate error:", err);
        }
      }
    });

    socket.on("user-disconnected", (peerId) => {
      viewerIdsRef.current.delete(peerId);
      cleanupPeerConnection(peerId);
    });

    return () => {
      disposed = true;
      ws.close();
      socket.disconnect();
      cleanupPeerConnection();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function ensureCameraStream(): Promise<MediaStream> {
    if (streamRef.current?.active) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640, max: 960 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 12, max: 15 },
      },
      audio: false,
    });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    return stream;
  }

  function createPeerConnection(viewerId: string): RTCPeerConnection {
    const existing = peerConnectionsRef.current.get(viewerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(WEBRTC_CONFIG);
    peerConnectionsRef.current.set(viewerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit("signal", {
          room: roomId,
          to: viewerId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[TesterSession] WebRTC connection:", pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[TesterSession] ICE state:", pc.iceConnectionState);
    };

    return pc;
  }

  async function publishCameraStream(viewerId: string) {
    const socket = socketRef.current;
    if (!socket) return;

    const stream = await ensureCameraStream();
    cleanupPeerConnection(viewerId);
    const pc = createPeerConnection(viewerId);
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { room: roomId, to: viewerId, sdp: offer });
    console.log("[TesterSession] Sent WebRTC offer", { roomId, viewerId });
  }

  function cleanupPeerConnection(peerId?: string) {
    if (peerId) {
      peerConnectionsRef.current.get(peerId)?.close();
      peerConnectionsRef.current.delete(peerId);
      return;
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
  }

  function notifyCentralSessionStarted(sid: string | number) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;

    wsRef.current.send(
      JSON.stringify({
        type: "session_started",
        session_id: String(sid),
      }),
    );
    lastRegistryNotifyRef.current = Date.now();
    console.log("[TesterSession] Notified central registry session_started", {
      kioskId,
      sessionId: String(sid),
    });
    return true;
  }

  function broadcastStatus(
    statusValue: "recording" | "completed",
    sid?: number,
    fName?: string,
  ) {
    socketRef.current?.emit("tester-session-status", {
      room: roomId,
      status: statusValue,
      sessionId: sid,
      foodName: fName,
    });
  }

  const handleStartSession = async () => {
    if (isRecording || isStarting) return;
    setStartError(null);

    const uId = getStoredUserId();
    const fId = foodId ? Number(foodId) : NaN;

    if (!Number.isFinite(fId)) {
      setStartError(
        "No food selected for this session. Ask staff to re-share your session link.",
      );
      return;
    }
    if (!Number.isFinite(uId as number)) {
      setStartError("Could not identify your account. Please log in again.");
      return;
    }

    setIsStarting(true);
    try {
      const res = await fetch(`${SESSIONS_API_BASE}/api/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uId,
          foodId: fId,
          browserKioskId: kioskId,
          roomCode: roomId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to start session.");
      }

      const newSessionId = Number(json.session.id);
      const newFoodName: string | undefined = json.food?.name ?? undefined;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      setFoodName(newFoodName);

      notifyCentralSessionStarted(newSessionId);
      setIsRecording(true);
      isRecordingRef.current = true;
      setStatus("recording");
      setMessage(
        newFoodName
          ? `Session started! Please taste: ${newFoodName}`
          : "Session started! Please taste the product.",
      );
      setFrameCount(0);

      broadcastStatus("recording", newSessionId, newFoodName);

      viewerIdsRef.current.forEach((viewerId) => {
        void publishCameraStream(viewerId);
      });

      void sendFrame();
      intervalRef.current = setInterval(sendFrame, FRAME_CAPTURE_MS);
    } catch (err: unknown) {
      console.error("Failed to start session:", err);
      setStartError(
        err instanceof Error ? err.message : "Failed to start session.",
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSession = async () => {
    const completedSessionId = sessionIdRef.current;
    if (!isRecordingRef.current || completedSessionId == null) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    isRecordingRef.current = false;
    sessionIdRef.current = null;
    cleanupPeerConnection();
    setIsRecording(false);
    setSessionId(null);
    setStatus("completed");
    setMessage("Session completed. Redirecting to survey...");

    try {
      const res = await fetch(
        `${SESSIONS_API_BASE}/api/sessions/${completedSessionId}/stop`,
        { method: "POST" },
      );
      if (!res.ok) {
        console.error("Failed to stop session on server:", res.status);
      }
    } catch (err) {
      console.error("Failed to stop session:", err);
    }

    broadcastStatus("completed", completedSessionId, foodName);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session_stopped" }));
    }

    setTimeout(() => {
      navigate("/tester-survey", {
        state: { sessionId: completedSessionId },
      });
    }, 1500);
  };

  const sendFrame = async () => {
    if (
      frameInFlightRef.current ||
      !isRecordingRef.current ||
      !sessionIdRef.current ||
      !videoRef.current ||
      !videoRef.current.videoWidth
    ) return;

    frameInFlightRef.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.7);
      });
      const sid = sessionIdRef.current;
      if (!blob || !sid || !isRecordingRef.current) return;

      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");
      fd.append("kiosk_id", kioskId);

      const res = await fetch(`/api/sessions/${sid}/frames`, {
        method: "POST",
        body: fd,
      });
      if (res.status === 409) {
        const now = Date.now();
        if (now - lastRegistryNotifyRef.current > 1000) {
          notifyCentralSessionStarted(String(sid));
        }
        return;
      }
      if (!res.ok) throw new Error(`Frame upload HTTP ${res.status}`);
      setFrameCount((prev) => prev + 1);
    } catch (err) {
      console.error("Frame upload failed:", err);
    } finally {
      frameInFlightRef.current = false;
    }
  };

  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={logo}
              alt="FaMiLis logo"
              className="w-[44px] h-[44px] object-contain"
            />
            <span className="text-white text-[22px] font-bold tracking-wide">
              FaMiLis
            </span>
          </div>
          <button
            onClick={() => performLogout(navigate)}
            className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                Product Testing Session
              </h1>
              <p className="text-gray-500 text-sm">Kiosk ID: {kioskId}</p>
              <p className="text-gray-500 text-sm">Room ID: {roomId}</p>

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700">{message}</p>
                {sessionId && (
                  <p className="text-sm text-gray-500 mt-2">
                    Active session: #{sessionId}
                  </p>
                )}
                {status === "recording" && (
                  <p className="text-sm text-green-600 mt-2">
                    Frames captured: {frameCount}
                  </p>
                )}
                {startError && (
                  <p className="text-sm text-red-600 mt-2">{startError}</p>
                )}
              </div>

              <div className="mt-6">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    autoPlay
                  />
                  {isRecording && (
                    <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-sm font-semibold animate-pulse">
                      ● RECORDING
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  Your camera is on. Start recording whenever you're ready to
                  taste — the administrator can only watch, not control it.
                </p>
              </div>

              <div className="mt-6 flex gap-4">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={handleStartSession}
                    disabled={isStarting}
                    className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors ${
                      isStarting
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                    }`}
                  >
                    {isStarting ? "Starting..." : "▶ Start Session"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopSession}
                    className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-semibold transition-colors"
                  >
                    ⏹ Stop Session
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
