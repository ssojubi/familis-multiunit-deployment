import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";

import {
  getApiBase,
  getSocketUrl,
} from "../apiConfig";
import {
  captureTesterContext,
  getOrCreateBrowserKioskId,
} from "../testerContext";
import { WEBRTC_CONFIGURATION } from "../webrtcConfig";
import { receivePeerSignal } from "../lib/peerSignaling";

const SESSIONS_API_BASE = getApiBase();
const SOCKET_SERVER_URL = getSocketUrl();
const FRAME_CAPTURE_MS = 750;
const MAX_FRAME_WIDTH = 960;
const ACTIVE_TESTER_SESSION_KEY = "familis.activeTesterRecording";
const RECONNECT_TIMEOUT_MS = 90_000;

type ServerToClientEvents = {
  "session-reconnect-lease": (data: { sessionId: number; deadline: number; serverNow: number }) => void;
  "room-joined": () => void;
  "viewer-connected": (viewerId: string) => void;
  "stream-request": (data: { from?: string }) => void;
  "stream-stop": (data: { from?: string }) => void;
  "user-disconnected": (peerId: string) => void;
  "session-reconnect-expired": (data: { sessionId?: number }) => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
};

type ClientToServerEvents = {
  "tester-recording-heartbeat": () => void;
  "join-room": (roomId: string) => void;
  signal: (data: {
    room: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
  "tester-session-status": (data: {
    room: string;
    status: "ready" | "recording" | "completed";
    sessionId?: number;
    foodName?: string;
  }) => void;
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

type StoredTesterRecording = {
  id: number;
  userId: number;
  foodId: number;
  roomId: string;
  kioskId: string;
  foodName?: string;
};

function readStoredRecording(): StoredTesterRecording | null {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_TESTER_SESSION_KEY) || "null") as StoredTesterRecording | null;
    return value && Number.isFinite(value.id) && Number.isFinite(value.userId) ? value : null;
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
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const viewerIdsRef = useRef<Set<string>>(new Set());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const isRecordingRef = useRef(false);
  const latestStatusRef = useRef<Parameters<ClientToServerEvents["tester-session-status"]>[0] | null>(null);
  const sessionIdRef = useRef<number | null>(null);
  const frameInFlightRef = useRef(false);
  const reconnectLeaseRef = useRef<number | null>(null);
  const reconnectDeadlineRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [testerContext] = useState(() =>
    captureTesterContext(window.location.search),
  );
  const roomId = testerContext.roomId || "default-tester-room";
  const foodId = testerContext.foodId;
  const kioskId = getOrCreateBrowserKioskId(testerContext.kioskId);

  useEffect(() => {
    let disposed = false;

    const clearReconnectCountdown = () => {
      reconnectDeadlineRef.current = null;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
      reconnectTimeoutRef.current = null;
      reconnectIntervalRef.current = null;
    };

    const expireDisconnectedSession = () => {
      if (!isRecordingRef.current) { clearReconnectCountdown(); return; }
      const abandonedSessionId = sessionIdRef.current;
      clearReconnectCountdown();
      reconnectLeaseRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      isRecordingRef.current = false;
      sessionIdRef.current = null;
      localStorage.removeItem(ACTIVE_TESTER_SESSION_KEY);
      setIsRecording(false);
      setSessionId(null);
      setStatus("completed");
      setMessage("Connection was not restored. Your session is incomplete and you are being logged out.");
      if (abandonedSessionId != null) {
        void fetch(`${SESSIONS_API_BASE}/api/sessions/${abandonedSessionId}/stop`, {
          method: "POST",
          credentials: "include",
          keepalive: true,
        }).catch(() => undefined);
      }
      window.setTimeout(() => performLogout(navigate), 1500);
    };

    const beginReconnectCountdown = () => {
      if (!isRecordingRef.current || reconnectDeadlineRef.current != null) return;
      reconnectDeadlineRef.current = reconnectLeaseRef.current ?? Date.now() + RECONNECT_TIMEOUT_MS;
      const updateMessage = () => {
        const seconds = Math.max(0, Math.ceil(((reconnectDeadlineRef.current ?? Date.now()) - Date.now()) / 1000));
        setMessage(`Wi-Fi/network connection lost. Reconnecting… You will be logged out in ${seconds}s and this session will be marked incomplete if the connection is not restored.`);
      };
      updateMessage();
      reconnectIntervalRef.current = setInterval(updateMessage, 1000);
      reconnectTimeoutRef.current = setTimeout(expireDisconnectedSession, Math.max(0, reconnectDeadlineRef.current - Date.now()));
    };

    localStorage.setItem("kiosk_id", kioskId);

    ensureCameraStream()
      .then(() => {
        if (disposed) return;
        setMessage(isRecordingRef.current
          ? "Session restored. Recording will continue under the same session."
          : "Camera ready. Start whenever you're ready to taste.");
      })
      .catch((err) => {
        if (disposed) return;
        console.error("Camera error:", err);
        setMessage("Camera access denied. Please allow camera access.");
      });

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
      if (disposed) return;
      const wasReconnecting = reconnectDeadlineRef.current != null;
      if (wasReconnecting && isRecordingRef.current) {
        setMessage("Connection restored. Resuming camera and frame uploads…");
      }
      console.log(
        `[TesterSession] Socket.IO connected. Joining room "${roomId}" as host`,
      );
      socket.emit("join-room", roomId);
    });

    socket.on("session-reconnect-lease", ({ sessionId: leaseSessionId, deadline, serverNow }) => {
      if (!isRecordingRef.current || sessionIdRef.current !== leaseSessionId) return;
      reconnectLeaseRef.current = Date.now() + (deadline - serverNow);
      const wasReconnecting = reconnectDeadlineRef.current != null;
      clearReconnectCountdown();
      setStatus("recording");
      setIsRecording(true);
      if (wasReconnecting) setMessage("Connection restored. Recording continues.");
    });
    const heartbeat = window.setInterval(() => {
      if (socket.connected && isRecordingRef.current) socket.emit("tester-recording-heartbeat");
    }, 3000);

    socket.on("room-joined", () => {
      if (latestStatusRef.current) socket.emit("tester-session-status", latestStatusRef.current);
    });
    socket.on("disconnect", () => {
      cleanupPeerConnection();
      viewerIdsRef.current.clear();
      if (isRecordingRef.current) {
        beginReconnectCountdown();
      }
    });

    socket.on("viewer-connected", (viewerId) => {
      viewerIdsRef.current.add(viewerId);
      if (isRecordingRef.current) void publishCameraStream(viewerId);
    });

    socket.on("stream-request", (data) => {
      if (data.from && isRecordingRef.current) {
        viewerIdsRef.current.add(data.from);
        void publishCameraStream(data.from);
      }
    });

    socket.on("stream-stop", (data) => {
      if (data.from) {
        viewerIdsRef.current.delete(data.from);
        cleanupPeerConnection(data.from);
      }
    });

    socket.on("signal", async (data) => {
      if (disposed) return;
      const peerId = data.from;
      if (!peerId) return;
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc) return;

      try {
        await receivePeerSignal(pc, data);
      } catch (error) {
        console.warn("Monitor connection setup failed", error);
      }
    });

    socket.on("user-disconnected", (peerId) => {
      viewerIdsRef.current.delete(peerId);
      cleanupPeerConnection(peerId);
    });
    socket.on("session-reconnect-expired", () => expireDisconnectedSession());

    const handleOffline = () => {
      if (isRecordingRef.current) {
        beginReconnectCountdown();
      }
    };
    const handleOnline = () => {
      if (!isRecordingRef.current) return;
      setMessage("Internet connection restored. Reconnecting camera and frame uploads…");
      if (!socket.connected) socket.connect();
      void ensureCameraStream();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      clearReconnectCountdown();
      socket.disconnect();
      cleanupPeerConnection();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stored = readStoredRecording();
    const currentUserId = getStoredUserId();
    if (currentUserId == null) return;
    const storedMatches = stored?.userId === currentUserId
      && stored.roomId === roomId
      && String(stored.foodId) === String(foodId);
    const controller = new AbortController();
    const recoveryUrl = storedMatches
      ? `${SESSIONS_API_BASE}/api/sessions/${stored.id}`
      : `${SESSIONS_API_BASE}/api/sessions/booth/active`;
    void fetch(recoveryUrl, {
      credentials: "include",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok || payload.session?.status !== "active" || payload.session?.invalidatedAt) {
        if (response.ok || response.status === 404) localStorage.removeItem(ACTIVE_TESTER_SESSION_KEY);
        return;
      }
      const recoveredId = Number(payload.session.id);
      const recoveredFoodId = Number(payload.session.foodId);
      const recoveredRoomId = String(payload.session.roomCode || "");
      if (!Number.isFinite(recoveredId) || recoveredFoodId !== Number(foodId) || recoveredRoomId !== roomId) return;
      const restoredFoodName = payload.food?.name || stored?.foodName;
      const recovered: StoredTesterRecording = {
        id: recoveredId,
        userId: currentUserId,
        foodId: recoveredFoodId,
        roomId: recoveredRoomId,
        kioskId,
        foodName: restoredFoodName,
      };
      localStorage.setItem(ACTIVE_TESTER_SESSION_KEY, JSON.stringify(recovered));
      sessionIdRef.current = recoveredId;
      isRecordingRef.current = true;
      setSessionId(recoveredId);
      setFoodName(restoredFoodName);
      setIsRecording(true);
      setStatus("recording");
      setMessage("Session restored. Reconnecting camera and frame uploads…");
      latestStatusRef.current = {
        room: roomId,
        status: "recording",
        sessionId: recoveredId,
        foodName: restoredFoodName,
      };
      if (socketRef.current?.connected) {
        socketRef.current.emit("tester-session-status", latestStatusRef.current);
      }
      await ensureCameraStream();
      if (!intervalRef.current) {
        void sendFrame();
        intervalRef.current = setInterval(sendFrame, FRAME_CAPTURE_MS);
      }
    }).catch((error) => {
      if ((error as { name?: string })?.name !== "AbortError") {
        setMessage("Could not verify the active session yet. Waiting for the network…");
      }
    });
    return () => controller.abort();
    // Restore once for this tester page; active refs handle later reconnects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const pc = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    peerConnectionsRef.current.set(viewerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId && peerConnectionsRef.current.get(viewerId) === pc) {
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

    try {
      const stream = await ensureCameraStream();
      if (!socket.connected || !isRecordingRef.current || !viewerIdsRef.current.has(viewerId)) return;
      cleanupPeerConnection(viewerId);
      const pc = createPeerConnection(viewerId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const offer = await pc.createOffer();
      if (peerConnectionsRef.current.get(viewerId) !== pc) return;
      await pc.setLocalDescription(offer);
      if (peerConnectionsRef.current.get(viewerId) !== pc) return;
      socket.emit("signal", { room: roomId, to: viewerId, sdp: pc.localDescription ?? offer });
    } catch (error) {
      console.warn("Could not offer monitor video", error);
    }
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

  function broadcastStatus(
    statusValue: "ready" | "recording" | "completed",
    sid?: number,
    fName?: string,
  ) {
    const payload = { room: roomId, status: statusValue, sessionId: sid, foodName: fName };
    latestStatusRef.current = payload;
    if (socketRef.current?.connected) socketRef.current.emit("tester-session-status", payload);
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
      let savedConsent: { answers?: Record<string, boolean>; copy?: Record<string, { label: string; helper: string }>; version?: string } | null = null;
      try { const storedConsent = localStorage.getItem("familis.consent"); savedConsent = storedConsent ? JSON.parse(storedConsent) : null; } catch { savedConsent = null; }
      const res = await fetch(`${SESSIONS_API_BASE}/api/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: uId,
          foodId: fId,
          browserKioskId: kioskId,
          roomCode: roomId,
          consentAnswers: savedConsent?.answers,
          consentCopy: savedConsent?.copy,
          consentVersion: savedConsent?.version,
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
      localStorage.setItem(ACTIVE_TESTER_SESSION_KEY, JSON.stringify({
        id: newSessionId,
        userId: Number(uId),
        foodId: fId,
        roomId,
        kioskId,
        foodName: newFoodName,
      } satisfies StoredTesterRecording));

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
    localStorage.removeItem(ACTIVE_TESTER_SESSION_KEY);
    cleanupPeerConnection();
    setIsRecording(false);
    setSessionId(null);
    setStatus("completed");
    setMessage("Recording ended. Please complete the survey to finish your session.");

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

    // The recording has ended, but the session is not complete until its survey is submitted.
    broadcastStatus("ready", completedSessionId, foodName);

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

      const res = await fetch(`${SESSIONS_API_BASE}/api/sessions/${sid}/frames`, {
        method: "POST",
        body: fd,
      });
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
