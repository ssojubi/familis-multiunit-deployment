/**
 * Tester Session Page
 * Admin controls start/stop via central server WebSocket and Socket.IO room commands
 * Frames go to central server → Kafka → FER pipeline
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, Socket } from "socket.io-client";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";

import {
  getCentralApiBase,
  getCentralWsBase,
  getSocketUrl,
} from "../apiConfig";

const API_BASE = getCentralApiBase();
const WS_BASE = getCentralWsBase();
const SOCKET_SERVER_URL = getSocketUrl();

type ServerToClientEvents = {
  "admin-start-stream": (data?: {
    sessionId?: number | string;
    session_id?: number | string;
    foodName?: string;
    food_name?: string;
  }) => void;
  "admin-stop-stream": () => void;
  signal: (data: {
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
};

type ClientToServerEvents = {
  "join-room": (roomId: string, role: "host") => void;
  signal: (data: {
    room: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
};

const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export default function TesterSession() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("waiting");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [message, setMessage] = useState<string>(
    "Waiting for admin to start the session...",
  );
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const socketRef = useRef<Socket<
    ServerToClientEvents,
    ClientToServerEvents
  > | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const isRecordingRef = useRef(false); // ref mirror to avoid stale closure in setInterval
  const sessionIdRef = useRef<number | null>(null); // same reason
  const lastRegistryNotifyRef = useRef(0);

  const urlParams = new URLSearchParams(window.location.search);
  const roomId = (urlParams.get("room") || "default-tester-room").trim();
  const kioskId =
    (
      urlParams.get("kiosk_id") ||
      localStorage.getItem("kiosk_id") ||
      "kiosk-01"
    ).trim();

  useEffect(() => {
    let disposed = false;

    // Persist kiosk ID
    localStorage.setItem("kiosk_id", kioskId);

    // Start camera immediately so tester is ready
    ensureCameraStream()
      .then(() => {
        if (disposed) return;
        setMessage("Camera ready. Waiting for admin...");
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
      setMessage("Camera ready. Waiting for admin...");
    };

    ws.onmessage = (event) => {
      if (disposed) return;
      try {
        const data = JSON.parse(event.data);
        console.log("WS message:", data);

        if (data.type === "start_session") {
          handleStartSession(data.session_id, data.food_name);
        } else if (data.type === "stop_session") {
          handleStopSession();
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };

    ws.onerror = (err) => {
      if (disposed) return;
      console.error("WebSocket error:", err);
      setMessage("Connection error. Check central server.");
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

    socket.on("admin-start-stream", (data = {}) => {
      if (disposed) return;
      console.log("[TesterSession] Received admin-start-stream", {
        roomId,
        kioskId,
        data,
      });
      const incomingSessionId = data.sessionId ?? data.session_id;
      if (!incomingSessionId) {
        setMessage("Start command received without a session ID.");
        return;
      }
      handleStartSession(incomingSessionId, data.foodName ?? data.food_name);
      void publishCameraStream();
    });

    socket.on("admin-stop-stream", () => {
      if (disposed) return;
      console.log("[TesterSession] Received admin-stop-stream", {
        roomId,
        kioskId,
      });
      handleStopSession();
    });

    socket.on("signal", async (data) => {
      if (disposed) return;
      const pc = peerConnectionRef.current;
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

  const ensureCameraStream = async (): Promise<MediaStream> => {
    if (streamRef.current?.active) {
      return streamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {});
    }

    return stream;
  };

  const createPeerConnection = (): RTCPeerConnection => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    const pc = new RTCPeerConnection(WEBRTC_CONFIG);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit("signal", {
          room: roomId,
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
  };

  const publishCameraStream = async () => {
    const socket = socketRef.current;
    if (!socket) return;

    const stream = await ensureCameraStream();
    cleanupPeerConnection();
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { room: roomId, sdp: offer });
    console.log("[TesterSession] Sent WebRTC offer", { roomId });
  };

  const cleanupPeerConnection = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const notifyCentralSessionStarted = (sid: string | number) => {
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
  };

  const handleStartSession = (sid: string | number, foodName?: string) => {
    const numericId = Number(sid);
    if (!Number.isFinite(numericId)) {
      setMessage(`Invalid session ID received: ${sid}`);
      return;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setSessionId(numericId);
    sessionIdRef.current = numericId;

    notifyCentralSessionStarted(sid);
    setIsRecording(true);
    isRecordingRef.current = true;
    setStatus("recording");
    setMessage(
      foodName
        ? `Session started! Please taste: ${foodName}`
        : "Session started! Please taste the product.",
    );
    setFrameCount(0);

    intervalRef.current = setInterval(sendFrame, 33);
  };

  const handleStopSession = () => {
    const completedSessionId = sessionIdRef.current;
    if (!isRecordingRef.current && completedSessionId == null) return;

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

    // Then notify registry
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
    // Use refs to avoid stale closure inside setInterval
    if (
      !isRecordingRef.current ||
      !sessionIdRef.current ||
      !videoRef.current ||
      !videoRef.current.videoWidth
    )
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    canvas.toBlob(
      async (blob) => {
        if (!blob) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(",")[1];

          try {
            // ✅ Frames go to central server → Kafka → FER
            const res = await fetch(`${API_BASE}/api/ingest/frame`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kiosk_id: kioskId,
                session_id: String(sessionIdRef.current),
                frame: base64,
                timestamp: new Date().toISOString(),
              }),
            });
            if (res.status === 409) {
              const now = Date.now();
              if (now - lastRegistryNotifyRef.current > 1000) {
                notifyCentralSessionStarted(String(sessionIdRef.current));
              }
              return;
            }
            if (!res.ok) {
              throw new Error(`Frame upload HTTP ${res.status}`);
            }
            setFrameCount((prev) => prev + 1);
          } catch (err) {
            console.error("Frame upload failed:", err);
          }
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      0.7,
    );
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
                  Your camera is on. The administrator will start the session
                  when ready.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
