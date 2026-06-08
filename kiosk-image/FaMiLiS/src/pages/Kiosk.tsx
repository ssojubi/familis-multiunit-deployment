import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_BASE = API_BASE.replace("http", "ws");

interface KioskProps {
  kioskId?: string;
  foodId?: number;
  foodName?: string;
}

export default function Kiosk({
  kioskId: propKioskId,
  foodId,
  foodName,
}: KioskProps) {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState<number>(0);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");
  const [error, setError] = useState<string | null>(null);

  // Live emotion display
  const [liveHedonic, setLiveHedonic] = useState<number | null>(null);
  const [liveSentiment, setLiveSentiment] = useState<string | null>(null);
  const [liveConfidence, setLiveConfidence] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));

  // Generate or retrieve kiosk ID
  const effectiveKioskId =
    propKioskId ||
    localStorage.getItem("kiosk_id") ||
    `kiosk_${Math.random().toString(36).substring(2, 10)}`;

  useEffect(() => {
    if (!propKioskId && !localStorage.getItem("kiosk_id")) {
      localStorage.setItem("kiosk_id", effectiveKioskId);
    }
  }, [effectiveKioskId, propKioskId]);

  // Connect to central server WebSocket
  const connectWebSocket = useCallback(() => {
    const wsUrl = `${WS_BASE}/ws/kiosk/${effectiveKioskId}`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setConnectionStatus("connected");
      console.log("WebSocket connected");
    };

    wsRef.current.onerror = (err) => {
      setConnectionStatus("error");
      console.error("WebSocket error:", err);
    };

    wsRef.current.onclose = () => {
      setConnectionStatus("disconnected");
      setTimeout(connectWebSocket, 5000);
    };

    wsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "start_session") {
        startSession(data.session_id, data.food_name);
      } else if (data.type === "stop_session") {
        stopSession();
      }
    };
  }, [effectiveKioskId]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((track) => track.stop());
    };
  }, [connectWebSocket]);

  // Start webcam and session
  const startSession = async (sid: string, food?: string) => {
    if (isRecording) return;

    setSessionId(sid);
    setIsRecording(true);
    setFrameCount(0);
    setLiveHedonic(null);
    setLiveSentiment(null);
    setError(null);

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

      // Start sending frames
      intervalRef.current = setInterval(sendFrame, 33); // ~30 FPS
    } catch (err) {
      setError("Camera access denied or unavailable");
      setIsRecording(false);
    }
  };

  // Stop session and release camera
  const stopSession = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsRecording(false);
    setSessionId(null);
    setLiveHedonic(null);
    setLiveSentiment(null);
  };

  // Capture and send frame, then update live display with result
  const sendFrame = async () => {
    if (!isRecording || !videoRef.current || !videoRef.current.videoWidth)
      return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror image for natural preview
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
            const response = await axios.post(`${API_BASE}/api/ingest/frame`, {
              kiosk_id: effectiveKioskId,
              session_id: sessionId,
              frame: base64,
              timestamp: new Date().toISOString(),
            });
            setFrameCount((prev) => prev + 1);

            // If the response contains emotion data, update live display
            if (response.data) {
              // The response from /api/ingest/frame is just queued status
              // Actual emotion results come from WebSocket or separate endpoint
            }
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

  // Function to fetch live emotion from central server (poll every 2 seconds)
  const fetchLiveEmotion = useCallback(async () => {
    if (!sessionId) return;
    try {
      const response = await axios.get(
        `${API_BASE}/api/sessions/${sessionId}/latest-emotion`,
      );
      if (response.data) {
        setLiveHedonic(response.data.hedonic_score);
        setLiveSentiment(response.data.sentiment);
        setLiveConfidence(response.data.confidence);
      }
    } catch (err) {
      // Silent fail – no live data yet
    }
  }, [sessionId]);

  // Poll for live emotion results every 2 seconds when recording
  useEffect(() => {
    if (!isRecording || !sessionId) return;
    const pollInterval = setInterval(fetchLiveEmotion, 2000);
    return () => clearInterval(pollInterval);
  }, [isRecording, sessionId, fetchLiveEmotion]);

  // Helper to convert hedonic (0-1) to display (1-9)
  const hedonicToDisplay = (hedonic: number | null) => {
    if (hedonic === null) return "—";
    return (hedonic * 8 + 1).toFixed(1);
  };

  return (
    <div
      className="kiosk-container"
      style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}
    >
      <div className="kiosk-header" style={{ marginBottom: "20px" }}>
        <h2>Kiosk Mode</h2>
        <p>
          Kiosk ID: <strong>{effectiveKioskId}</strong>
        </p>
        <p>
          Status:{" "}
          <span className={`status-${connectionStatus}`}>
            {connectionStatus}
          </span>
        </p>
        {sessionId && <p>Session: {sessionId}</p>}
      </div>

      <div
        className="kiosk-main"
        style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}
      >
        {/* Video Preview */}
        <div className="video-section" style={{ flex: 2, minWidth: "300px" }}>
          <div
            className="video-container"
            style={{
              position: "relative",
              background: "#000",
              borderRadius: "12px",
              overflow: "hidden",
            }}
          >
            <video
              ref={videoRef}
              style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover" }}
              muted
              playsInline
              autoPlay
            />
            {isRecording && (
              <div
                className="recording-badge"
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  background: "red",
                  color: "white",
                  padding: "4px 12px",
                  borderRadius: "20px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                🔴 REC {frameCount} frames
              </div>
            )}
          </div>

          <div
            className="controls"
            style={{
              marginTop: "16px",
              display: "flex",
              gap: "12px",
              justifyContent: "center",
            }}
          >
            {!isRecording ? (
              <button
                onClick={() => {
                  if (
                    wsRef.current &&
                    wsRef.current.readyState === WebSocket.OPEN
                  ) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "register",
                        kiosk_id: effectiveKioskId,
                      }),
                    );
                  }
                }}
                style={{
                  padding: "12px 24px",
                  background: "#4CAF50",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                🎥 Start Session
              </button>
            ) : (
              <button
                onClick={() => {
                  if (wsRef.current) {
                    wsRef.current.send(
                      JSON.stringify({
                        type: "stop_request",
                        session_id: sessionId,
                      }),
                    );
                  }
                  stopSession();
                }}
                style={{
                  padding: "12px 24px",
                  background: "#f44336",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "16px",
                  cursor: "pointer",
                }}
              >
                ⏹️ Stop Session
              </button>
            )}
          </div>
        </div>

        {/* Live Emotion Display */}
        <div
          className="emotion-section"
          style={{
            flex: 1,
            minWidth: "250px",
            background: "#f5f5f5",
            borderRadius: "12px",
            padding: "20px",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: "16px" }}>
            Live Emotion Analysis
          </h3>

          <div
            className="emotion-metrics"
            style={{ display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="metric">
              <div
                className="metric-label"
                style={{ fontSize: "14px", color: "#666" }}
              >
                Hedonic Score (1-9)
              </div>
              <div
                className="metric-value"
                style={{
                  fontSize: "48px",
                  fontWeight: "bold",
                  color: "#4CAF50",
                }}
              >
                {hedonicToDisplay(liveHedonic)}
              </div>
              <div
                className="metric-bar"
                style={{
                  marginTop: "8px",
                  height: "8px",
                  background: "#e0e0e0",
                  borderRadius: "4px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(liveHedonic || 0) * 100}%`,
                    height: "100%",
                    background: "#4CAF50",
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>

            <div className="metric">
              <div
                className="metric-label"
                style={{ fontSize: "14px", color: "#666" }}
              >
                Sentiment
              </div>
              <div
                className="metric-value"
                style={{
                  fontSize: "24px",
                  fontWeight: "bold",
                  color:
                    liveSentiment === "Positive"
                      ? "#4CAF50"
                      : liveSentiment === "Negative"
                        ? "#f44336"
                        : "#FF9800",
                }}
              >
                {liveSentiment || "—"}
              </div>
            </div>

            <div className="metric">
              <div
                className="metric-label"
                style={{ fontSize: "14px", color: "#666" }}
              >
                Confidence
              </div>
              <div
                className="metric-value"
                style={{ fontSize: "24px", fontWeight: "bold" }}
              >
                {liveConfidence ? `${Math.round(liveConfidence * 100)}%` : "—"}
              </div>
            </div>

            <div className="metric">
              <div
                className="metric-label"
                style={{ fontSize: "14px", color: "#666" }}
              >
                Frames Processed
              </div>
              <div
                className="metric-value"
                style={{ fontSize: "24px", fontWeight: "bold" }}
              >
                {frameCount}
              </div>
            </div>
          </div>

          {error && (
            <div
              className="error"
              style={{
                marginTop: "16px",
                padding: "8px",
                background: "#ffebee",
                color: "#c62828",
                borderRadius: "8px",
                fontSize: "12px",
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
