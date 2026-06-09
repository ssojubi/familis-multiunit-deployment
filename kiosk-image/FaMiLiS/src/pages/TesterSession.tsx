/**
 * Tester Session Page
 * Admin controls start/stop via central server WebSocket (port 8000)
 * Frames go to central server → Kafka → FER pipeline
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";

import { getCentralApiBase, getCentralWsBase } from "../apiConfig";

const API_BASE = getCentralApiBase();
const WS_BASE = getCentralWsBase();

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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));
  const isRecordingRef = useRef(false); // ref mirror to avoid stale closure in setInterval
  const sessionIdRef = useRef<number | null>(null); // same reason

  const kioskId =
    localStorage.getItem("kiosk_id") ||
    `tester_${Math.random().toString(36).substring(2, 8)}`;

  useEffect(() => {
    // Persist kiosk ID
    if (!localStorage.getItem("kiosk_id")) {
      localStorage.setItem("kiosk_id", kioskId);
    }

    // Start camera immediately so tester is ready
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setMessage("Camera ready. Waiting for admin...");
      } catch (err) {
        console.error("Camera error:", err);
        setMessage("Camera access denied. Please allow camera access.");
      }
    };
    startCamera();

    const wsUrl = `${WS_BASE}/ws/kiosk/${kioskId}`;
    console.log("Connecting to central server WS:", wsUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("Central server WebSocket connected");
      setMessage("Camera ready. Waiting for admin...");
    };

    ws.onmessage = (event) => {
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
      console.error("WebSocket error:", err);
      setMessage("Connection error. Check central server.");
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };

    return () => {
      ws.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStartSession = (sid: string, foodName?: string) => {
    const numericId = Number(sid);
    setSessionId(numericId);
    sessionIdRef.current = numericId;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "session_started",
          session_id: sid,
        }),
      );
    }
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
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    isRecordingRef.current = false;
    setIsRecording(false);
    setStatus("completed");
    setMessage("Session completed. Redirecting to survey...");

    // Then notify registry
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session_stopped" }));
    }

    setTimeout(() => {
      navigate("/tester-survey", {
        state: { sessionId: sessionIdRef.current },
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
            await fetch(`${API_BASE}/api/ingest/frame`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kiosk_id: kioskId,
                session_id: String(sessionIdRef.current),
                frame: base64,
                timestamp: new Date().toISOString(),
              }),
            });
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

              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-700">{message}</p>
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
