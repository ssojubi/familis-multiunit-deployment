/**
 * Tester Session Page
 * Admin controls start/stop via WebSocket
 * Tester just waits for session to start
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";

import { getApiBase, getWsBase } from "../apiConfig";

const API_BASE = getApiBase();
const WS_BASE = getWsBase();

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

  const kioskId =
    localStorage.getItem("kiosk_id") ||
    `tester_${Math.random().toString(36).substring(2, 8)}`;

  useEffect(() => {
    // Store kiosk ID
    if (!localStorage.getItem("kiosk_id")) {
      localStorage.setItem("kiosk_id", kioskId);
    }

    // Start camera immediately (tester just needs to be ready)
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setMessage("Camera ready. Waiting for admin...");
      } catch (err) {
        console.error("Camera error:", err);
        setMessage("Camera access denied. Please allow camera access.");
      }
    };
    startCamera();

    // Connect WebSocket to listen for start/stop commands
    const wsUrl = `${WS_BASE}/ws/kiosk/${kioskId}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log("WebSocket connected");
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "start_session") {
        handleStartSession(data.session_id);
      } else if (data.type === "stop_session") {
        handleStopSession();
      }
    };

    wsRef.current.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStartSession = async (sid: string) => {
    setSessionId(Number(sid));
    setIsRecording(true);
    setStatus("recording");
    setMessage("Session started! Please taste the product.");
    setFrameCount(0);

    // Start sending frames
    intervalRef.current = setInterval(sendFrame, 33); // ~30 FPS
  };

  const handleStopSession = () => {
    setIsRecording(false);
    setStatus("completed");
    setMessage("Session completed. Redirecting to survey...");

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Redirect to survey after brief delay
    setTimeout(() => {
      navigate("/tester-survey", { state: { sessionId } });
    }, 1500);
  };

  const sendFrame = async () => {
    if (!isRecording || !videoRef.current || !videoRef.current.videoWidth)
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
            await fetch(`${API_BASE}/api/ingest/frame`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kiosk_id: kioskId,
                session_id: sessionId,
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
