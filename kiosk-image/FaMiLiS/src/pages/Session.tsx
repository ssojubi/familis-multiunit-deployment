import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { apiFetch } from "../lib/api";
import { InfoTip } from "../components/InfoTip";
import { confidenceToTier, confidenceTooltip } from "../lib/confidence";
import { hedonicLabel } from "../lib/ratingLabels";
import {
  FAMILIS_CURRENT_SESSION_KEY,
  getStoredRole,
  hasSessionConsent,
  markSessionConsented,
  performLogout,
} from "../RequireAuth";

const FRAME_CAPTURE_MS = 750;
// Seconds without a detected face before auto-pausing; increase to reduce sensitivity.
const NO_FACE_PAUSE_MS = 20000;
// Consecutive frame-upload failures before treating the emotion service as offline.
const INFERENCE_FAILURE_PAUSE_COUNT = 8;
// Set false to prevent alt-tab / window blur from auto-pausing the session.
const FOCUS_AUTO_PAUSE_ENABLED = false;
// Grace period (ms) before a focus-based pause fires when FOCUS_AUTO_PAUSE_ENABLED is true; set 0 for immediate.
const AUTO_PAUSE_GRACE_MS = 0;
const USE_DB = true;

type PauseReason =
  | "initial"
  | "manual"
  | "tab-hidden"
  | "window-blur"
  | "camera-error"
  | "camera-ended"
  | "emotion-offline"
  | "offline"
  | "no-face"
  | "confirm-stop";

type StoredPauseState = {
  isPaused: boolean;
  pauseReason: PauseReason | null;
  totalPausedMs: number;
  pauseStartMs: number | null;
  hasEverResumed: boolean;
};

const PAUSE_MESSAGES: Record<PauseReason, string> = {
  initial: "Ready — press Resume to begin recording. No frames are being captured yet.",
  manual: "Data collection paused — no frames are being captured.",
  "tab-hidden": "Tab was hidden — recording paused. Resume when ready.",
  "window-blur": "Window lost focus — recording paused. Resume when ready.",
  "camera-error": "Camera unavailable — recording paused. Resume after fixing camera access.",
  "camera-ended": "Camera stream ended — refresh or re-enable the camera, then resume.",
  "emotion-offline": "Emotion service offline — recording paused. Start the service, then resume.",
  offline: "Network offline — recording paused. Reconnect, then resume.",
  "no-face": "Face not visible — recording paused. Position yourself in frame, then resume.",
  "confirm-stop": "Confirm stop dialog open — recording paused.",
};

function pauseStorageKey(sessionId: number) {
  return `familis.sessionPause.${sessionId}`;
}

function readStoredPauseState(sessionId: number): StoredPauseState | null {
  try {
    const raw = sessionStorage.getItem(pauseStorageKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredPauseState;
  } catch {
    return null;
  }
}

function computeInitialPause(sessionId: number | null) {
  if (sessionId == null) {
    return {
      isPaused: true,
      pauseReason: "initial" as PauseReason,
      totalPausedMs: 0,
      hasEverResumed: false,
      pauseStartMs: Date.now(),
    };
  }

  const stored = readStoredPauseState(sessionId);
  if (!stored) {
    return {
      isPaused: true,
      pauseReason: "initial" as PauseReason,
      totalPausedMs: 0,
      hasEverResumed: false,
      pauseStartMs: Date.now(),
    };
  }

  if (stored.isPaused) {
    let totalPausedMs = stored.totalPausedMs ?? 0;
    if (stored.pauseStartMs != null) {
      totalPausedMs += Date.now() - stored.pauseStartMs;
    }
    return {
      isPaused: true,
      pauseReason: stored.pauseReason ?? ("manual" as PauseReason),
      totalPausedMs,
      hasEverResumed: stored.hasEverResumed ?? false,
      pauseStartMs: Date.now(),
    };
  }

  return {
    isPaused: false,
    pauseReason: null,
    totalPausedMs: stored.totalPausedMs ?? 0,
    hasEverResumed: stored.hasEverResumed ?? true,
    pauseStartMs: null,
  };
}

type Food = {
  id: number;
  name: string;
  category: string;
};

type SessionRow = {
  id: number;
  userId: number;
  foodId: number;
  status: "pending" | "active" | "completed" | "cancelled";
  startTime: string | null;
  endTime: string | null;
  hasConsent?: boolean;
};

type StoredSession = {
  id: number;
  userId: number;
  foodId: number;
  status: SessionRow["status"];
  startTime: string;
};

function formatMmSs(totalSeconds: number) {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function hedonic01ToScale(hedonic01: number) {
  return Number((hedonic01 * 8 + 1).toFixed(1));
}

type SentimentKey = "Positive" | "Negative" | "Neutral";

const SENTIMENT_STYLES: Record<SentimentKey, { bg: string; text: string; icon: string; ring: string }> = {
  Positive: { bg: "bg-green-100", text: "text-green-800", icon: "↑", ring: "ring-green-400" },
  Negative: { bg: "bg-red-100",   text: "text-red-800",   icon: "↓", ring: "ring-red-400" },
  Neutral:  { bg: "bg-gray-100",  text: "text-gray-700",  icon: "→", ring: "ring-gray-300" },
};

function SentimentChip({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const key = (sentiment.charAt(0).toUpperCase() + sentiment.slice(1)) as SentimentKey;
  const style = SENTIMENT_STYLES[key] ?? SENTIMENT_STYLES.Neutral;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
      aria-label={`Sentiment: ${sentiment}`}
    >
      <span aria-hidden="true">{style.icon}</span>
      {key}
    </span>
  );
}

export default function Session() {
  const navigate = useNavigate();
  const location = useLocation();
  const role = getStoredRole();
  const isTester = role === "tester";

  const storedCurrent = useMemo((): StoredSession | null => {
    try {
      const raw = localStorage.getItem("familis.currentSession");
      if (!raw) return null;
      return JSON.parse(raw) as StoredSession;
    } catch {
      return null;
    }
  }, []);

  const initialSession = (location.state as any)?.session as SessionRow | undefined;
  const initialFood = (location.state as any)?.food as Food | undefined;

  const initialSessionId = initialSession?.id ?? storedCurrent?.id ?? null;
  const sessionId = initialSessionId;
  const initialPause = useMemo(() => computeInitialPause(initialSessionId), [initialSessionId]);

  const [session, setSession] = useState<SessionRow | null>(initialSession ?? null);
  const [food, setFood] = useState<Food | null>(initialFood ?? null);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isRecording, setIsRecording] = useState((initialSession?.status ?? "active") === "active");
  const [isPaused, setIsPaused] = useState(initialPause.isPaused);
  const [pauseReason, setPauseReason] = useState<PauseReason | null>(initialPause.pauseReason);
  const [hasEverResumed, setHasEverResumed] = useState(initialPause.hasEverResumed);
  const pauseStartRef = useRef<number | null>(initialPause.pauseStartMs);
  const totalPausedMsRef = useRef(initialPause.totalPausedMs);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stopPending, setStopPending] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  const [emotionServiceOk, setEmotionServiceOk] = useState<boolean | null>(null);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [liveHedonic01, setLiveHedonic01] = useState<number | null>(null);
  const [liveConfidence01, setLiveConfidence01] = useState<number | null>(null);
  const [liveSentiment, setLiveSentiment] = useState<string | null>(null);
  const [lastInferenceError, setLastInferenceError] = useState<string | null>(null);

  const frameInFlightRef = useRef(false);
  const cameraSessionActiveRef = useRef(true);
  const isRecordingRef = useRef(isRecording);
  const isPausedRef = useRef(isPaused);
  const hasEverResumedRef = useRef(hasEverResumed);
  const consecutiveNoFaceRef = useRef(0);
  const consecutiveInferenceFailuresRef = useRef(0);
  const autoPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    hasEverResumedRef.current = hasEverResumed;
  }, [hasEverResumed]);

  const startEpochMs = useMemo(() => {
    if (!session?.startTime) return null;
    const t = new Date(session.startTime).getTime();
    return Number.isNaN(t) ? null : t;
  }, [session?.startTime]);

  const hasConsent =
    session?.hasConsent === true ||
    (sessionId != null && hasSessionConsent(sessionId));

  const consentBlocked = isTester && !loading && session != null && !hasConsent;
  const sessionReady = !isTester || hasConsent;

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (startEpochMs == null || !sessionReady) return;
    const tick = () => {
      const now = Date.now();
      let pausePortion = 0;
      if (isPaused && pauseStartRef.current != null) {
        pausePortion = now - pauseStartRef.current;
      }
      const sec = Math.max(
        0,
        Math.floor((now - startEpochMs - totalPausedMsRef.current - pausePortion) / 1000)
      );
      setElapsedSeconds(sec);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startEpochMs, isPaused, sessionReady]);

  const persistPauseState = useCallback(() => {
    if (sessionId == null) return;
    const state: StoredPauseState = {
      isPaused: isPausedRef.current,
      pauseReason,
      totalPausedMs: totalPausedMsRef.current,
      pauseStartMs: pauseStartRef.current,
      hasEverResumed: hasEverResumedRef.current,
    };
    sessionStorage.setItem(pauseStorageKey(sessionId), JSON.stringify(state));
  }, [sessionId, pauseReason]);

  const pauseRecording = useCallback((reason: PauseReason) => {
    if (!isRecordingRef.current) return;
    if (!isPausedRef.current) {
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    }
    setPauseReason(reason);
  }, []);

  const resumeBlocked =
    Boolean(cameraError) ||
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    emotionServiceOk === false;

  const resumeBlockedTooltip = cameraError
    ? "Fix camera access before resuming."
    : typeof navigator !== "undefined" && !navigator.onLine
      ? "Reconnect to the network before resuming."
      : emotionServiceOk === false
        ? "Start the emotion service before resuming."
        : null;

  const resumeRecording = useCallback(() => {
    if (!isRecordingRef.current || resumeBlocked) return;
    if (!isPausedRef.current) return;

    if (pauseStartRef.current != null) {
      totalPausedMsRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    consecutiveNoFaceRef.current = 0;
    consecutiveInferenceFailuresRef.current = 0;
    setIsPaused(false);
    setPauseReason(null);
    hasEverResumedRef.current = true;
    setHasEverResumed(true);
  }, [resumeBlocked]);

  // Schedules a focus-based pause after AUTO_PAUSE_GRACE_MS; cancels if user returns in time.
  const scheduleAutoPause = useCallback((reason: PauseReason) => {
    if (autoPauseTimerRef.current != null) return;
    if (AUTO_PAUSE_GRACE_MS <= 0) {
      pauseRecording(reason);
      return;
    }
    autoPauseTimerRef.current = setTimeout(() => {
      autoPauseTimerRef.current = null;
      pauseRecording(reason);
    }, AUTO_PAUSE_GRACE_MS);
  }, [pauseRecording]);

  const cancelAutoPause = useCallback(() => {
    if (autoPauseTimerRef.current != null) {
      clearTimeout(autoPauseTimerRef.current);
      autoPauseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    persistPauseState();
  }, [isPaused, pauseReason, hasEverResumed, persistPauseState]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      const obj = v.srcObject;
      if (obj instanceof MediaStream) obj.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (!cameraSessionActiveRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          if (!cameraSessionActiveRef.current) return;
          setCameraError("Camera stream ended. Refresh or re-enable the camera.");
          pauseRecording("camera-ended");
        };
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      if (!cameraSessionActiveRef.current) return;
      const message =
        err?.message || "Camera permission denied or not available. Please allow access and try again.";
      setCameraError(message);
      pauseRecording("camera-error");
    }
  };

  useEffect(() => {
    if (!USE_DB) return;
    if (sessionId == null) return;
    setLoading(true);
    setLoadError(null);

    async function loadSession() {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}`);
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load session.");
        const loaded = json.session as SessionRow;
        if (loaded.hasConsent && loaded.id) {
          markSessionConsented(loaded.id);
        }
        setSession(loaded);
        setFood((prev) => prev ?? (json.food as Food | null));
        setIsRecording((loaded.status ?? "active") === "active");

        if (loaded.startTime) {
          try {
            const raw = localStorage.getItem(FAMILIS_CURRENT_SESSION_KEY);
            if (raw) {
              const stored = JSON.parse(raw) as Record<string, unknown>;
              stored.startTime = loaded.startTime;
              localStorage.setItem(FAMILIS_CURRENT_SESSION_KEY, JSON.stringify(stored));
            }
          } catch {
            /* ignore */
          }
        }
      } catch (err: any) {
        setLoadError(err?.message || "Failed to load session.");
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, [sessionId]);

  useEffect(() => {
    async function checkEmotion() {
      try {
        const res = await apiFetch(`/api/emotion/health`);
        const json = await res.json();
        const loaded = Boolean(json?.emotion?.modelLoaded);
        setEmotionServiceOk(Boolean(json?.ok && loaded));
      } catch {
        setEmotionServiceOk(false);
      }
    }
    void checkEmotion();
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    cameraSessionActiveRef.current = true;
    void startCamera();
    return () => {
      cameraSessionActiveRef.current = false;
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady]);

  useLayoutEffect(() => {
    return () => {
      cameraSessionActiveRef.current = false;
      stopCamera();
      if (autoPauseTimerRef.current != null) {
        clearTimeout(autoPauseTimerRef.current);
        autoPauseTimerRef.current = null;
      }
    };
  }, []);

  const sendFrame = useCallback(async () => {
    if (sessionId == null || frameInFlightRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    frameInFlightRef.current = true;
    try {
      const w = Math.min(vw, 960);
      const h = Math.round((vh / vw) * w);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82);
      });
      if (!blob) return;

      const fd = new FormData();
      fd.append("frame", blob, "frame.jpg");

      const res = await apiFetch(`/api/sessions/${sessionId}/frames`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setLastInferenceError(json?.error || `Frame upload failed (${res.status})`);
        consecutiveInferenceFailuresRef.current += 1;
        if (consecutiveInferenceFailuresRef.current >= INFERENCE_FAILURE_PAUSE_COUNT) {
          pauseRecording("emotion-offline");
        }
        return;
      }

      consecutiveInferenceFailuresRef.current = 0;
      setFramesCaptured((c) => c + 1);
      setLastInferenceError(json.inferenceError || null);

      if (json.faceDetected === true && json.hedonicScore != null && json.confidenceScore != null) {
        consecutiveNoFaceRef.current = 0;
        setLiveHedonic01(Number(json.hedonicScore));
        setLiveConfidence01(Number(json.confidenceScore));
        setLiveSentiment(typeof json.sentiment === "string" ? json.sentiment : null);
      } else if (json.faceDetected === false) {
        consecutiveNoFaceRef.current += 1;
        setLiveHedonic01(null);
        setLiveConfidence01(null);
        setLiveSentiment(null);
        if (consecutiveNoFaceRef.current * FRAME_CAPTURE_MS >= NO_FACE_PAUSE_MS) {
          pauseRecording("no-face");
        }
      }
    } catch (e: any) {
      setLastInferenceError(e?.message || "Frame capture failed.");
      consecutiveInferenceFailuresRef.current += 1;
      if (consecutiveInferenceFailuresRef.current >= INFERENCE_FAILURE_PAUSE_COUNT) {
        pauseRecording("emotion-offline");
      }
    } finally {
      frameInFlightRef.current = false;
    }
  }, [sessionId, pauseRecording]);

  useEffect(() => {
    if (!sessionId || !isRecording || isPaused || cameraError) return;
    const id = window.setInterval(() => { void sendFrame(); }, FRAME_CAPTURE_MS);
    return () => window.clearInterval(id);
  }, [sessionId, isRecording, isPaused, cameraError, sendFrame]);

  const togglePause = () => {
    if (!isRecording) return;
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording("manual");
    }
  };

  useEffect(() => {
    if (cameraError && isRecording) {
      pauseRecording("camera-error");
    }
  }, [cameraError, isRecording, pauseRecording]);

  useEffect(() => {
    if (emotionServiceOk === false && isRecording) {
      pauseRecording("emotion-offline");
    }
  }, [emotionServiceOk, isRecording, pauseRecording]);

  useEffect(() => {
    if (confirmOpen && isRecording) {
      pauseRecording("confirm-stop");
    }
  }, [confirmOpen, isRecording, pauseRecording]);

  useEffect(() => {
    if (!confirmOpen && isPaused && pauseReason === "confirm-stop") {
      setPauseReason("manual");
    }
  }, [confirmOpen, isPaused, pauseReason]);

  useEffect(() => {
    if (!FOCUS_AUTO_PAUSE_ENABLED) return;
    const onVisibilityChange = () => {
      if (document.hidden && isRecordingRef.current) {
        scheduleAutoPause("tab-hidden");
      } else if (!document.hidden) {
        cancelAutoPause();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [scheduleAutoPause, cancelAutoPause]);

  useEffect(() => {
    if (!FOCUS_AUTO_PAUSE_ENABLED) return;
    const onWindowBlur = () => {
      if (document.hidden) return;
      if (isRecordingRef.current) {
        scheduleAutoPause("window-blur");
      }
    };
    const onWindowFocus = () => {
      cancelAutoPause();
    };
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [scheduleAutoPause, cancelAutoPause]);

  useEffect(() => {
    const onOffline = () => {
      if (isRecordingRef.current) {
        pauseRecording("offline");
      }
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [pauseRecording]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine && isRecording) {
      pauseRecording("offline");
    }
  }, [isRecording, pauseRecording]);

  const handleStopClick = () => {
    if (!sessionId) return;
    setStopError(null);
    setConfirmOpen(true);
  };

  const handleConfirmStop = async () => {
    if (!sessionId) return;
    setStopPending(true);
    setConfirmOpen(false);
    setStopError(null);
    try {
      stopCamera();
      setIsRecording(false);
      setIsPaused(false);
      setPauseReason(null);
      pauseStartRef.current = null;
      if (sessionId != null) {
        sessionStorage.removeItem(pauseStorageKey(sessionId));
      }

      const res = await apiFetch(`/api/sessions/${sessionId}/stop`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to stop the session in the database.");
      }
      navigate("/survey", { state: { sessionId } });
    } catch (err: any) {
      setStopError(err?.message || "Unable to stop the session.");
      setConfirmOpen(true);
    } finally {
      setStopPending(false);
    }
  };

  const handleBackToDashboard = () => {
    stopCamera();
    navigate("/dashboard");
  };

  const hedonicDisplay = liveHedonic01 == null ? null : hedonic01ToScale(liveHedonic01);
  const confidencePct  = liveConfidence01 == null ? null : Math.round(liveConfidence01 * 100);
  const confidenceTier = liveConfidence01 == null ? null : confidenceToTier(liveConfidence01);
  const confTooltipText = liveConfidence01 == null ? null : confidenceTooltip(liveConfidence01);

  const hedonicLabelText =
    hedonicDisplay == null ? null : hedonicLabel(hedonicDisplay);

  const pauseBannerMessage =
    pauseReason != null
      ? PAUSE_MESSAGES[pauseReason]
      : "Data collection paused — no frames are being captured.";

  return (
    <PageHeader
      variant="collapsed"
      onLogoClick={handleBackToDashboard}
      backLabel="Back to Dashboard"
      onBack={handleBackToDashboard}
    >
      <main className="px-6 py-8">
        <div className="max-w-7xl mx-auto">
          <PageTitle
            title="Camera Recording"
            subtitle={food ? `${food.name} · ${food.category}` : "Session"}
            hideBack
          />

          {/* Pause banner — full width, above grid */}
          {isRecording && isPaused && (
            <div className="mb-4 flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-800">{pauseBannerMessage}</p>
              <button
                type="button"
                onClick={togglePause}
                disabled={resumeBlocked}
                title={resumeBlocked ? resumeBlockedTooltip ?? undefined : undefined}
                className={`ml-auto text-xs font-semibold underline underline-offset-2 ${
                  resumeBlocked
                    ? "text-amber-400 cursor-not-allowed no-underline"
                    : "text-amber-700 hover:text-amber-900"
                }`}
              >
                Resume
              </button>
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-600 text-sm">Loading session…</div>
          ) : loadError ? (
            <div className="text-center text-red-600 text-sm">
              {loadError}{" "}
              <button type="button" onClick={() => navigate("/dashboard")} className="text-red-700 underline ml-2">
                Go back
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-6">
              {/* Left column — stats + FER */}
              <div className="space-y-5 order-2 md:order-1">
                {/* Timer */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider">Session Timer</p>
                  <p className="text-[clamp(2rem,5vw,2.5rem)] leading-none font-extrabold text-gray-900 mt-2 tabular-nums">
                    {formatMmSs(elapsedSeconds)}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-2">
                    Timer pauses while recording is paused.
                  </p>
                </div>

                {/* FER panel */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-700 font-bold inline-flex items-center gap-1.5">
                      Live Emotion (FER)
                      <InfoTip term="fer" align="left" />
                    </p>
                    {emotionServiceOk === false && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                        Service offline
                      </span>
                    )}
                  </div>

                  {emotionServiceOk === false && (
                    <div className="mb-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-md p-2.5">
                      Start the emotion service:{" "}
                      <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">npm run emotion-service</code>{" "}
                      (run{" "}
                      <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">python backend/emotion_service.py</code>{" "}
                      after training{" "}
                      <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">*.pkl</code>{" "}
                      in <code className="text-[10px] bg-amber-100 px-1 py-0.5 rounded">backend/</code>).
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Hedonic metric card */}
                    <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-gray-500 font-semibold inline-flex items-center gap-1">
                          Hedonic Score
                          <InfoTip term="hedonicScore" align="left" />
                        </span>
                          <span className="text-sm font-bold text-gray-900">
                            {hedonicDisplay == null ? "—" : `${hedonicDisplay} / 9`}
                          </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#e8174a] rounded-full transition-all duration-300"
                          style={{ width: hedonicDisplay == null ? "0%" : `${((hedonicDisplay - 1) / 8) * 100}%` }}
                        />
                      </div>
                      {hedonicLabelText && (
                        <p className="text-[10px] text-gray-500 mt-1">{hedonicLabelText}</p>
                      )}
                    </div>

                    {/* Confidence metric card */}
                    <div className="bg-gray-50 rounded-lg border border-gray-100 px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] text-gray-500 font-semibold inline-flex items-center gap-1">
                          Confidence
                          <InfoTip term="confidenceScore" align="left" />
                        </span>
                        <div className="flex items-center gap-1.5">
                          {confidenceTier && (
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${confidenceTier.bgClass} ${confidenceTier.textClass}`}
                              title={confTooltipText ?? undefined}
                            >
                              {confidenceTier.label}
                            </span>
                          )}
                          <span className="text-sm font-bold text-gray-900">
                            {confidencePct == null ? "—" : `${confidencePct}%`}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${confidenceTier?.colorClass ?? "bg-gray-300"}`}
                          style={{ width: confidencePct == null ? "0%" : `${confidencePct}%` }}
                        />
                      </div>
                      {confTooltipText && (
                        <p className="text-[10px] text-gray-500 mt-1">{confTooltipText}</p>
                      )}
                    </div>

                    {/* Sentiment */}
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] text-gray-500 font-semibold inline-flex items-center gap-1">
                        Sentiment
                        <InfoTip term="sentiment" align="left" />
                      </span>
                      <SentimentChip sentiment={liveSentiment} />
                    </div>

                    <p className="text-[11px] text-gray-400 px-1">
                      Frames logged: {framesCaptured}
                    </p>

                    {lastInferenceError ? (
                      <p className="text-[11px] text-red-600 px-1">{lastInferenceError}</p>
                    ) : null}
                  </div>
                </div>

                {/* Status card */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs text-gray-700 font-bold mb-2">Recording Status</p>
                    <div className="flex items-center gap-2">
                    {isRecording && !isPaused ? (
                      <>
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 motion-safe:animate-pulse"
                          aria-hidden="true"
                        />
                        <span className="text-xs text-gray-700 font-semibold">Recording</span>
                      </>
                    ) : isRecording && isPaused ? (
                      <>
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                        <span className="text-xs text-amber-700 font-semibold">Paused</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-400" aria-hidden="true" />
                        <span className="text-xs text-gray-500">Stopped</span>
                      </>
                    )}
                  </div>
                  {session?.id ? (
                    <p className="text-[11px] text-gray-400 mt-2">Session ID: S-{session.id}</p>
                  ) : null}
                </div>
              </div>

              {/* Right column — camera + controls */}
              <div className="space-y-5 order-1 md:order-2">
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                  <h3 className="text-sm text-gray-700 font-semibold mb-3">Camera Preview</h3>

                  {/* Video container with recording ring */}
                  <div
                    className={`aspect-video bg-gray-100 rounded-lg overflow-hidden relative transition-all duration-200 ${
                      isRecording && !isPaused
                        ? "ring-4 ring-red-600 ring-offset-1"
                        : isRecording && isPaused
                          ? "border-2 border-dashed border-amber-400"
                          : "border border-gray-200"
                    }`}
                  >
                    {cameraError ? (
                      <div className="text-center px-6 h-full flex items-center justify-center">
                        <div>
                          <p className="text-sm text-gray-700 font-semibold">Camera unavailable</p>
                          <p className="text-xs text-gray-500 mt-1">{cameraError}</p>
                        </div>
                      </div>
                    ) : (
                      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                    )}

                    {/* Recording badge */}
                    {isRecording && !isPaused ? (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-full shadow">
                        <div className="w-2 h-2 bg-white rounded-full motion-safe:animate-pulse" aria-hidden="true" />
                        <span className="text-[11px] font-bold tracking-wide">REC</span>
                      </div>
                    ) : null}

                    {/* Paused overlay badge */}
                    {isRecording && isPaused ? (
                      <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-amber-500 text-white px-3 py-1.5 rounded-full shadow">
                        <span className="text-[11px] font-bold">Paused</span>
                      </div>
                    ) : null}
                  </div>

                  <p className="text-[11px] text-gray-500 mt-2">
                    Keep your face visible and lighting even. Captures every {FRAME_CAPTURE_MS / 1000}s while recording.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={togglePause}
                    disabled={!isRecording || stopPending || (isPaused && resumeBlocked)}
                    title={isPaused && resumeBlocked ? resumeBlockedTooltip ?? undefined : undefined}
                    className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                      !isRecording || stopPending || (isPaused && resumeBlocked)
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : isPaused
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-amber-500 hover:bg-amber-600 text-white"
                    }`}
                  >
                    {isPaused
                      ? hasEverResumed
                        ? "Resume recording"
                        : "Start recording"
                      : "Pause recording"}
                  </button>
                  <button
                    type="button"
                    onClick={handleStopClick}
                    disabled={!isRecording || stopPending}
                    className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                      isRecording
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {stopPending ? "Stopping..." : "Stop recording"}
                  </button>
                </div>
                {stopError ? <p className="text-xs text-red-600 text-center">{stopError}</p> : null}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Consent required modal (tester flow) */}
      {consentBlocked ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-gray-200">
            <h2 className="text-gray-900 font-bold text-lg">Consent required</h2>
            <p className="text-gray-600 text-sm mt-2">
              You need to review and agree to the consent form before recording can begin.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => performLogout(navigate)}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Log out
              </button>
              <button
                type="button"
                onClick={() => navigate("/consent")}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Go to consent form
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Stop confirm modal */}
      {confirmOpen ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4 border border-gray-200">
            <h2 className="text-gray-900 font-bold text-lg">Stop the session?</h2>
            <p className="text-gray-600 text-sm mt-2">
              Stopping the session will take you to the survey page.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={stopPending}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStop}
                disabled={stopPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {stopPending ? "Stopping..." : "Yes, stop"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageHeader>
  );
}
