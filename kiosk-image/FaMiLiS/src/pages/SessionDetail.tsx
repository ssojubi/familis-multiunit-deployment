import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { InfoTip } from "../components/InfoTip";
import { ExportButton } from "../components/ExportButton";
import { getStoredRole, isAdminRole } from "../RequireAuth";
import { SessionMultiSelect, type SessionOption } from "../components/dashboard";
import {
  ColoredRatingBar,
  HeroHedonicCard,
  InsightCard,
  MetricCard,
  ProfileCard,
  SectionPill,
  TabButton,
} from "../components/analytics";
import { API_BASE, apiFetch } from "../lib/api";
import { hedonicColor } from "../lib/ratingLabels";
import { ATTRIBUTE_COLORS } from "../lib/attributeColors";
import { confidenceToTier } from "../lib/confidence";
import {
  FrameDeleteDialog,
  FrameFolderAccordion,
  FrameGroupToolbar,
  useFrameGroups,
  type FrameGroupBy,
  type FrameViewMode,
  type IndexedFrameLog,
} from "../components/session";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

type TabKey = "frame" | "system" | "survey";
type SessionStatus = "pending" | "active" | "completed" | "cancelled";

type Food = {
  id: number;
  name: string;
  category: string;
  imageUrl?: string | null;
};

type FrameLog = {
  frameLogId: number;
  timestamp: string | null;
  faceDetected: boolean | null;
  confidenceScore: number | null; // 0..1
  hedonicScore: number | null; // 0..1
  frameImageUrl?: string | null;
};

type SystemLog = {
  logType: "error" | "warning" | "info";
  message: string;
  createdAt: string | null;
};

type SurveyResults = {
  age: number | null;
  gender: string | null;
  colorRating: number | null; // 1..9
  flavorAromaRating: number | null; // 1..9
  saltSweetRating: number | null; // 1..9
  textureRating: number | null; // 1..9
  finalOverallRating: number | null; // 1..9
  remarks: string | null;
};

type Participant = {
  id: number;
  testerLabel: string | null;
  dietaryRestrictions?: string | null;
};

type SessionDetailPayload = {
  session: {
    id: number;
    userId: number;
    foodId: number;
    status: SessionStatus;
    invalidatedAt: string | null;
    retentionStatus: "active" | "pending_deletion" | "anonymized";
    startTime: string | null;
    endTime: string | null;
  };
  food: Food | null;
  participant: Participant | null;
  metrics: {
    totalFrames: number;
    meanConfidence: number | null; // 0..1
    meanHedonic: number | null; // 0..1
  };
  frameLogs: FrameLog[];
  systemLogs: SystemLog[];
  surveyResults: SurveyResults | null;
};

function clampPct(n: number) {
  return Math.max(0, Math.min(100, n));
}

function formatStatus(status: SessionStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status: SessionStatus) {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-700";
    case "active":
      return "bg-green-50 text-green-700";
    case "completed":
      return "bg-gray-100 text-gray-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

const MAX_CHART_POINTS = 50;

function toApiUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

export default function SessionDetail() {
  const navigate = useNavigate();
  const location = useLocation();
  const canExport = isAdminRole(getStoredRole());

  const storedCurrent = useMemo(() => {
    try {
      const raw = localStorage.getItem("familis.currentSession");
      if (!raw) return null;
      return JSON.parse(raw) as { id?: number; startTime?: string; endTime?: string; foodId?: number };
    } catch {
      return null;
    }
  }, []);

  const sessionId = useMemo<number | null>(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("sessionId");
    if (q && Number.isFinite(Number(q))) return Number(q);

    const stateId = (location.state as any)?.sessionId ?? (location.state as any)?.id;
    if (stateId != null && Number.isFinite(Number(stateId))) return Number(stateId);

    if (storedCurrent?.id != null && Number.isFinite(Number(storedCurrent.id))) return Number(storedCurrent.id);
    return null;
  }, [location.search, location.state, storedCurrent?.id]);

  const [tab, setTab] = useState<TabKey>("frame");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SessionDetailPayload | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [invalidateOpen, setInvalidateOpen] = useState(false);
  const [invalidatePending, setInvalidatePending] = useState(false);
  const [revalidateOpen, setRevalidateOpen] = useState(false);
  const [revalidatePending, setRevalidatePending] = useState(false);
  const [siblingSessions, setSiblingSessions] = useState<SessionOption[]>([]);
  const [siblingSessionsLoading, setSiblingSessionsLoading] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<number[]>([]);
  const [frameViewMode, setFrameViewMode] = useState<FrameViewMode>("list");
  const [frameGroupBy, setFrameGroupBy] = useState<FrameGroupBy>("time");
  const [frameFaceOnly, setFrameFaceOnly] = useState(false);
  const [frameLowConfidenceOnly, setFrameLowConfidenceOnly] = useState(false);
  const [deletingFrame, setDeletingFrame] = useState<IndexedFrameLog | null>(null);
  const [frameDeletePending, setFrameDeletePending] = useState(false);
  const [frameDeleteError, setFrameDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId == null) return;
    setSelectedSessionIds([sessionId]);
  }, [sessionId]);

  useEffect(() => {
    const foodId = data?.session.foodId;
    if (foodId == null) {
      setSiblingSessions([]);
      return;
    }

    const ac = new AbortController();

    async function loadSiblingSessions() {
      setSiblingSessionsLoading(true);
      try {
        const res = await apiFetch(`/api/foods/${foodId}/sessions`, { signal: ac.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load sessions.");
        }
        const list = (json.sessions ?? []) as SessionOption[];
        setSiblingSessions(list);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setSiblingSessions([]);
      } finally {
        setSiblingSessionsLoading(false);
      }
    }

    void loadSiblingSessions();
    return () => ac.abort();
  }, [data?.session.foodId]);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setData(null);
      setError("No session selected.");
      return;
    }

    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}/details`, {
          signal: ac.signal,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load session details.");
        }
        setData(json as SessionDetailPayload);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load session details.");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ac.abort();
  }, [sessionId]);

  const content = data;
  const status = content?.session.status ?? "completed";
  const statusOptions: SessionStatus[] = ["pending", "active", "completed", "cancelled"];

  const meanConfidencePct =
    content?.metrics.meanConfidence == null ? null : Math.round(content.metrics.meanConfidence * 100);
  const meanHedonicOutOf9 =
    content?.metrics.meanHedonic == null ? null : content.metrics.meanHedonic * 8 + 1;

  const indexedFrameLogs = useMemo<IndexedFrameLog[]>(
    () => (content?.frameLogs ?? []).map((f, index) => ({ ...f, index })),
    [content?.frameLogs]
  );

  const filteredFrameLogs = useMemo(() => {
    return indexedFrameLogs.filter((f) => {
      if (frameFaceOnly && f.faceDetected !== true) return false;
      if (frameLowConfidenceOnly && !(f.confidenceScore != null && f.confidenceScore < 0.5)) return false;
      return true;
    });
  }, [indexedFrameLogs, frameFaceOnly, frameLowConfidenceOnly]);

  const frameGroups = useFrameGroups(filteredFrameLogs, frameGroupBy);

  // Downsample to ~50 points so the chart stays responsive on long sessions (hundreds of frames).
  const frameLineData = useMemo(() => {
    const logs = content?.frameLogs ?? [];
    const bucketSize = Math.max(1, Math.ceil(logs.length / MAX_CHART_POINTS));
    const buckets: FrameLog[][] = [];
    for (let i = 0; i < logs.length; i += bucketSize) {
      buckets.push(logs.slice(i, i + bucketSize));
    }

    const labels = buckets.map((bucket, idx) => {
      const rep = bucket[Math.floor(bucket.length / 2)] ?? bucket[0];
      if (!rep?.timestamp) return `Frame ${idx + 1}`;
      const d = new Date(rep.timestamp);
      if (Number.isNaN(d.getTime())) return `Frame ${idx + 1}`;
      return d.toLocaleTimeString();
    });
    const scores = buckets.map((bucket) => {
      const vals = bucket.map((f) => f.hedonicScore).filter((v): v is number => v != null);
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      return Number((avg * 8 + 1).toFixed(1));
    });
    return {
      labels,
      datasets: [
        {
          label: "Hedonic score",
          data: scores,
          // Per-segment gradient: red at low scores, green at high
          segment: {
            borderColor: (ctx: any) => {
              const y0: number | null = ctx.p0.parsed.y;
              const y1: number | null = ctx.p1.parsed.y;
              if (y0 == null || y1 == null) return "#d1d5db";
              return hedonicColor((y0 + y1) / 2);
            },
          },
          pointBackgroundColor: scores.map((s) => (s == null ? "#d1d5db" : hedonicColor(s))),
          pointBorderColor: "#fff",
          pointBorderWidth: 1,
          borderWidth: 2.5,
          spanGaps: true,
          tension: 0.25,
          pointRadius: 3,
          pointHoverRadius: 5,
          // borderColor fallback (overridden by segment)
          borderColor: "transparent",
          backgroundColor: "transparent",
        },
      ],
    };
  }, [content?.frameLogs]);
  const frameLineOptions = useMemo(
    () =>
      ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { min: 1, max: 9, ticks: { stepSize: 1 } },
        },
      }) as const,
    []
  );

  const onChangeStatus = async (nextStatus: SessionStatus) => {
    if (!content || statusSaving || nextStatus === content.session.status) return;
    setStatusSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${content.session.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.session) {
        throw new Error(json?.error || "Failed to update session status.");
      }
      setData((prev) => (prev ? { ...prev, session: json.session } : prev));
    } catch (err: any) {
      setError(err?.message || "Failed to update session status.");
    } finally {
      setStatusSaving(false);
    }
  };

  const onDeleteSession = async () => {
    if (!content) return;
    setDeletePending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${content.session.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete session.");
      }
      localStorage.removeItem("familis.currentSession");
      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Failed to delete session.");
    } finally {
      setDeletePending(false);
      setDeleteOpen(false);
    }
  };

  const onInvalidateSession = async () => {
    if (!content) return;
    setInvalidatePending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${content.session.id}/invalidate`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.session) {
        throw new Error(json?.error || "Failed to invalidate session.");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              session: {
                ...prev.session,
                status: json.session.status,
                invalidatedAt: json.session.invalidatedAt,
                retentionStatus: json.session.retentionStatus,
              },
            }
          : prev
      );
    } catch (err: any) {
      setError(err?.message || "Failed to invalidate session.");
    } finally {
      setInvalidatePending(false);
      setInvalidateOpen(false);
    }
  };

  const onRevalidateSession = async () => {
    if (!content) return;
    setRevalidatePending(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/sessions/${content.session.id}/revalidate`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.session) {
        throw new Error(json?.error || "Failed to revalidate session.");
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              session: {
                ...prev.session,
                status: json.session.status,
                invalidatedAt: json.session.invalidatedAt,
                retentionStatus: json.session.retentionStatus,
              },
            }
          : prev
      );
    } catch (err: any) {
      setError(err?.message || "Failed to revalidate session.");
    } finally {
      setRevalidatePending(false);
      setRevalidateOpen(false);
    }
  };

  const applyFrameMetrics = (
    prev: SessionDetailPayload,
    metrics: SessionDetailPayload["metrics"]
  ): SessionDetailPayload => ({
    ...prev,
    metrics: {
      totalFrames: Number(metrics.totalFrames ?? 0),
      meanConfidence: metrics.meanConfidence == null ? null : Number(metrics.meanConfidence),
      meanHedonic: metrics.meanHedonic == null ? null : Number(metrics.meanHedonic),
    },
  });

  const onConfirmFrameDelete = async () => {
    if (!content || !deletingFrame) return;
    setFrameDeletePending(true);
    setFrameDeleteError(null);
    try {
      const frameLogId = deletingFrame.frameLogId;
      const res = await apiFetch(`/api/sessions/${content.session.id}/frames/${frameLogId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.metrics) {
        throw new Error(json?.error || "Failed to delete frame.");
      }
      setData((prev) => {
        if (!prev) return prev;
        const next = applyFrameMetrics(prev, json.metrics);
        return {
          ...next,
          frameLogs: prev.frameLogs.filter((f) => f.frameLogId !== frameLogId),
          systemLogs: [
            ...prev.systemLogs,
            {
              logType: "info" as const,
              message: `Frame ${frameLogId} manually deleted.`,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
      setDeletingFrame(null);
    } catch (err: any) {
      setFrameDeleteError(err?.message || "Failed to delete frame.");
    } finally {
      setFrameDeletePending(false);
    }
  };

  return (
    <PageHeader variant="collapsed" backLabel="Back to Dashboard" backTo="/dashboard">
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {loading && !content ? (
            <div className="text-center text-gray-600 text-sm">Loading session details…</div>
          ) : error && !content ? (
            <div className="text-center text-red-600 text-sm">{error}</div>
          ) : null}

          {content ? (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {content.food?.imageUrl ? (
                      <img
                        src={toApiUrl(content.food.imageUrl) ?? undefined}
                        alt={content.food.name}
                        className="w-16 h-16 rounded-lg border border-gray-200 object-cover"
                      />
                    ) : null}
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                      S-{content.session.id}
                    </h1>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${statusClasses(
                        status
                      )}`}
                    >
                      {formatStatus(status)}
                    </span>
                    {content.session.invalidatedAt ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                        Invalidated
                        <InfoTip term="invalidated" />
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                      Retention: {content.session.retentionStatus.replace("_", " ")}
                      <InfoTip term="retentionStatus" />
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {content.food ? `${content.food.name} - ${content.food.category}` : "Session"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDateTime(content.session.startTime)} - {formatDateTime(content.session.endTime)}
                  </p>
                  {content.participant ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/participants/${content.participant!.id}`)}
                      className="mt-2 inline-flex items-center text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors"
                    >
                      View taster{content.participant.testerLabel ? ` (${content.participant.testerLabel})` : ""}
                    </button>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <SessionMultiSelect
                    sessions={siblingSessions}
                    currentSessionId={content.session.id}
                    selectedIds={selectedSessionIds}
                    loading={siblingSessionsLoading}
                    onSelectedIdsChange={setSelectedSessionIds}
                    onNavigateToSession={(id) => navigate(`/session-detail?sessionId=${id}`)}
                  />
                  {canExport ? <ExportButton kind="session" sessionId={content.session.id} /> : null}
                  <select
                    value={status}
                    onChange={(e) => onChangeStatus(e.target.value as SessionStatus)}
                    disabled={statusSaving}
                    className="text-sm font-semibold border border-gray-200 rounded-md px-3 py-2 bg-white"
                    aria-label="Session status"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {formatStatus(s)}
                      </option>
                    ))}
                  </select>
                  {content.session.invalidatedAt ? (
                    <button
                      type="button"
                      onClick={() => setRevalidateOpen(true)}
                      disabled={revalidatePending}
                      className="text-sm font-semibold border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded-md px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Revalidate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInvalidateOpen(true)}
                      disabled={invalidatePending}
                      className="text-sm font-semibold border border-amber-300 text-amber-700 hover:bg-amber-50 rounded-md px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Invalidate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="text-sm font-semibold border border-red-200 text-red-700 hover:bg-red-50 rounded-md px-3 py-2 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {error ? (
                  <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-md">
                  {error}
                </div>
              ) : null}

              {/* Metric cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <MetricCard
                  icon="📈"
                  iconBg="bg-green-50 text-green-600"
                  title="Mean FER Confidence Score"
                  value={meanConfidencePct == null ? "-" : `${meanConfidencePct}%`}
                  infoTerm="confidenceScore"
                />
                <MetricCard
                  icon="🍦"
                  iconBg="bg-red-50 text-[#e8174a]"
                  title="Mean FER Hedonic Score"
                  value={meanHedonicOutOf9 == null ? "-" : `${meanHedonicOutOf9.toFixed(1)}`}
                  infoTerm="hedonicScore"
                />
                <MetricCard
                  icon="📝"
                  iconBg="bg-red-50 text-[#e8174a]"
                  title="Overall Survey Hedonic Rating"
                  value={
                    content?.surveyResults?.finalOverallRating == null
                      ? "-"
                      : `${content.surveyResults.finalOverallRating.toFixed(1)}`
                  }
                  infoTerm="hedonicScore"
                />
              </div>

              {/* Tabs */}
              <div className="flex rounded-md overflow-hidden border border-gray-200 bg-white mb-5">
                <TabButton active={tab === "frame"} onClick={() => setTab("frame")}>
                  Frame Logs
                </TabButton>
                <TabButton active={tab === "system"} onClick={() => setTab("system")}>
                  System Logs
                </TabButton>
                <TabButton active={tab === "survey"} onClick={() => setTab("survey")}>
                  Survey Results
                </TabButton>
              </div>

              {/* Tab content */}
              <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                {tab === "frame" ? (
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Frame Logs</h2>
                    <p className="text-xs text-gray-500 mb-4">
                      Captured frames with face detection and emotion analysis
                    </p>
                    {content.frameLogs.length === 0 ? (
                      <div className="text-[12px] text-gray-500">No frame logs available.</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                          <p className="text-xs text-gray-600 mb-2 font-semibold inline-flex items-center gap-1.5">
                            Hedonic score over time
                            <InfoTip term="fer" align="left" />
                          </p>
                          <div className="min-h-[180px] h-[220px]">
                            <Line data={frameLineData as any} options={frameLineOptions as any} />
                          </div>
                        </div>

                        <FrameGroupToolbar
                          viewMode={frameViewMode}
                          onViewModeChange={setFrameViewMode}
                          groupBy={frameGroupBy}
                          onGroupByChange={setFrameGroupBy}
                          faceOnly={frameFaceOnly}
                          onFaceOnlyChange={setFrameFaceOnly}
                          lowConfidenceOnly={frameLowConfidenceOnly}
                          onLowConfidenceOnlyChange={setFrameLowConfidenceOnly}
                        />

                        {frameViewMode === "folders" ? (
                          <FrameFolderAccordion
                            groups={frameGroups}
                            toApiUrl={toApiUrl}
                            onPreview={(f) =>
                              setPreviewImage({
                                url: toApiUrl(f.frameImageUrl) ?? "",
                                label: formatDateTime(f.timestamp),
                              })
                            }
                            onDelete={(f) => {
                              setFrameDeleteError(null);
                              setDeletingFrame(f);
                            }}
                          />
                        ) : filteredFrameLogs.length === 0 ? (
                          <div className="text-[12px] text-gray-500 py-8 text-center bg-gray-50 rounded-lg border border-gray-100">
                            No frames match the current filters.
                          </div>
                        ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-[820px] w-full text-left">
                          <thead>
                            <tr className="text-xs text-gray-500 bg-gray-50">
                              <th className="px-2 py-3 font-semibold">Timestamp</th>
                              <th className="px-1 py-3 font-semibold">Face Detected</th>
                              <th className="px-6 py-3 text-center font-semibold">Confidence Score</th>
                              <th className="px-1 py-3 text-center font-semibold">Hedonic Score</th>
                              <th className="px-3 py-3 font-semibold">Frame Image</th>
                              <th className="px-3 py-3 font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredFrameLogs.map((f) => {
                              const confPct = f.confidenceScore == null ? 0 : clampPct(f.confidenceScore * 100);
                              const hedonic =
                                f.hedonicScore == null ? null : Number((f.hedonicScore * 8 + 1).toFixed(1));
                              return (
                                <tr key={f.frameLogId} className="border-t border-gray-100">
                                  <td className="px-3 py-3 text-xs text-gray-700">
                                    {formatDateTime(f.timestamp)}
                                  </td>
                                  <td className="px-3 py-3 text-s text-gray-700">
                                    {f.faceDetected === true ? (
                                      <span className="text-green-700 font-semibold">✓ Yes</span>
                                    ) : f.faceDetected === false ? (
                                      <span className="text-red-600 font-semibold">✗ No</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-s text-gray-700">
                                    <div className="w-full">
                                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full ${confidenceToTier(f.confidenceScore ?? 0).colorClass}`}
                                          style={{ width: `${confPct}%` }}
                                          aria-label={`Confidence ${Math.round(confPct)}%`}
                                        />
                                      </div>
                                      <div className="mt-1 text-right text-s text-gray-500">
                                        {f.confidenceScore == null ? "0%" : `${Math.round(f.confidenceScore * 100)}%`}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-lg text-center text-gray-700">
                                    {hedonic == null ? (
                                      <span className="text-gray-400 text-lg">- / 9</span>
                                    ) : (
                                      <span className="font-semibold text-lg">
                                        {hedonic} / 9
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-xs text-gray-700">
                                    {f.frameImageUrl ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewImage({
                                            url: toApiUrl(f.frameImageUrl) ?? "",
                                            label: formatDateTime(f.timestamp),
                                          })
                                        }
                                        className="group block w-full"
                                      >
                                        <img
                                          src={toApiUrl(f.frameImageUrl) ?? undefined}
                                          alt={`Frame at ${formatDateTime(f.timestamp)}`}
                                          className="w-full h-24 rounded-md border border-gray-200 object-cover group-hover:opacity-90"
                                        />
                                      </button>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-xs text-gray-700">
                                    <div className="flex items-center gap-3 whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setFrameDeleteError(null);
                                          setDeletingFrame(f);
                                        }}
                                        className="text-s font-semibold text-red-600 hover:text-red-700 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          </table>
                        </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : tab === "system" ? (
                  <div>
                    <h2 className="text-sm font-bold text-gray-900 mb-1">System Logs</h2>
                    <p className="text-xs text-gray-500 mb-4">System-generated logs and events</p>

                    {content.systemLogs.length === 0 ? (
                      <div className="text-xs text-gray-500">No system logs available.</div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
                        {content.systemLogs.map((l, idx) => (
                          <div key={`${l.createdAt ?? "t"}-${idx}`} className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 px-3 py-1 rounded-md text-[11px] font-bold ${
                                l.logType === "warning"
                                  ? "bg-yellow-50 text-yellow-700"
                                  : l.logType === "error"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              {l.logType.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-800 font-semibold">{l.message}</p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {formatDateTime(l.createdAt)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <SurveyResultsPanel
                    surveyResults={content.surveyResults}
                    sessionId={content.session.id}
                    dietaryRestrictions={content.participant?.dietaryRestrictions ?? null}
                  />
                )}
              </section>
            </div>
          ) : (
            <div className="text-center text-gray-600 text-sm">No session data.</div>
          )}
        </div>
      </main>
      {previewImage ? (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl p-3 max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-800">Frame Preview ({previewImage.label})</p>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
              >
                Close
              </button>
            </div>
            <img src={previewImage.url} alt="Frame preview" className="w-full max-h-[70vh] object-contain rounded-lg" />
          </div>
        </div>
      ) : null}
      {deletingFrame ? (
        <FrameDeleteDialog
          frameLogId={deletingFrame.frameLogId}
          timestampLabel={formatDateTime(deletingFrame.timestamp)}
          pending={frameDeletePending}
          error={frameDeleteError}
          onClose={() => {
            if (frameDeletePending) return;
            setDeletingFrame(null);
            setFrameDeleteError(null);
          }}
          onConfirm={onConfirmFrameDelete}
        />
      ) : null}
      {deleteOpen && content ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-delete-title"
          >
            <h2 id="session-delete-title" className="text-gray-900 font-bold mb-2">
              Delete this session?
            </h2>
            <p className="text-sm text-gray-600">
              This permanently deletes session <span className="font-semibold">S-{content.session.id}</span>.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                disabled={deletePending}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDeleteSession}
                disabled={deletePending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {deletePending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {invalidateOpen && content ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-invalidate-title"
          >
            <h2 id="session-invalidate-title" className="text-gray-900 font-bold mb-2">
              Invalidate this session?
            </h2>
            <p className="text-sm text-gray-600">
              This marks session <span className="font-semibold">S-{content.session.id}</span> as
              unusable for reports. It is excluded from analytics and exports, and no new frames can be
              recorded. The session is not deleted immediately.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setInvalidateOpen(false)}
                disabled={invalidatePending}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onInvalidateSession}
                disabled={invalidatePending}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {invalidatePending ? "Invalidating…" : "Invalidate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {revalidateOpen && content ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-revalidate-title"
          >
            <h2 id="session-revalidate-title" className="text-gray-900 font-bold mb-2">
              Revalidate this session?
            </h2>
            <p className="text-sm text-gray-600">
              This restores session <span className="font-semibold">S-{content.session.id}</span> as the
              valid record for this taster and food. Any other valid sessions for the same pair will
              be invalidated and excluded from reports.
            </p>
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setRevalidateOpen(false)}
                disabled={revalidatePending}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onRevalidateSession}
                disabled={revalidatePending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {revalidatePending ? "Revalidating…" : "Revalidate"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageHeader>
  );
}

function buildInsightSummary(ratings: (number | null)[]): string {
  const valid = ratings.filter((r): r is number => r != null);
  if (valid.length === 0) return "No ratings available.";
  const allPositive = valid.every((r) => r >= 6);
  const allNegative = valid.every((r) => r <= 4);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  if (allPositive) return "Taster rated all attributes positively.";
  if (allNegative) return "Taster rated most attributes below average.";
  if (avg >= 6) return "Generally positive ratings with some variation.";
  if (avg <= 4) return "Mixed or below-average ratings across attributes.";
  return "Ratings are neutral to mixed across attributes.";
}

function SurveyResultsPanel({
  surveyResults,
  sessionId,
  dietaryRestrictions,
}: {
  surveyResults: SurveyResults | null;
  sessionId: number;
  dietaryRestrictions?: string | null;
}) {
  if (!surveyResults) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        No survey results available for this session yet.
      </div>
    );
  }

  const sr = surveyResults;
  const gender = sr.gender
    ? sr.gender.charAt(0).toUpperCase() + sr.gender.slice(1)
    : null;

  // Sensory attributes
  const attributes: {
    label: string;
    key: keyof SurveyResults;
    color: string;
    infoTerm: "surveyColor" | "surveyFlavorAroma" | "surveySaltSweet" | "surveyTexture";
  }[] = [
    { label: "Color",         key: "colorRating",       color: ATTRIBUTE_COLORS["Color"],         infoTerm: "surveyColor" },
    { label: "Flavor/Aroma",  key: "flavorAromaRating", color: ATTRIBUTE_COLORS["Flavor/Aroma"],  infoTerm: "surveyFlavorAroma" },
    { label: "Salt/Sweet",    key: "saltSweetRating",   color: ATTRIBUTE_COLORS["Salt/Sweet"],    infoTerm: "surveySaltSweet" },
    { label: "Texture",       key: "textureRating",     color: ATTRIBUTE_COLORS["Texture"],       infoTerm: "surveyTexture" },
  ];

  // Key Insights
  const attrRatings = attributes.map((a) => sr[a.key] as number | null);
  const validRatings = attrRatings.filter((r): r is number => r != null);
  const maxScore = validRatings.length > 0 ? Math.max(...validRatings) : null;
  const highestAttrs =
    maxScore != null
      ? attributes.filter((a) => (sr[a.key] as number | null) === maxScore).map((a) => a.label)
      : [];
  const highestLabel =
    highestAttrs.length === 0
      ? null
      : highestAttrs.length === 1
        ? highestAttrs[0]
        : highestAttrs.length === 2
          ? `${highestAttrs[0]} and ${highestAttrs[1]}`
          : `${highestAttrs.slice(0, -1).join(", ")}, and ${highestAttrs[highestAttrs.length - 1]}`;

  const overallVal = sr.finalOverallRating ?? null;
  const summaryText = buildInsightSummary(attrRatings);
  const dietaryText = dietaryRestrictions?.trim() || null;

  return (
    <div className="space-y-6">
      {/* A. Taster Profile */}
      <div>
        <SectionPill>Taster Profile</SectionPill>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ProfileCard label="Taster ID" value={`P-${sessionId}`} />
          <ProfileCard label="Age" value={sr.age != null ? String(sr.age) : "—"} />
          <ProfileCard label="Gender" value={gender ?? "—"} />
        </div>
        <div className="mt-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-1">Dietary restrictions</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {dietaryText ?? "None recorded."}
          </p>
        </div>
      </div>

      {/* B. Sensory breakdown: bars left, overall hero right */}
      <div>
        <SectionPill infoTerm="sensoryAttributes">Sensory Rating Breakdown</SectionPill>
        <p className="text-s text-gray-500 -mt-1 mb-4">
          What consumers liked about the product (from survey results)
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            {attributes.map((a) => (
              <ColoredRatingBar
                key={a.label}
                label={a.label}
                rating={sr[a.key] as number | null}
                color={a.color}
                infoTerm={a.infoTerm}
              />
            ))}
          </div>
          <HeroHedonicCard
            score={overallVal}
            label="Overall Survey Hedonic Rating"
            infoTerm="overallProfile"
          />
        </div>
      </div>

      {/* D. Key Insights */}
      <div>
        <SectionPill>Key Insights</SectionPill>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InsightCard
            variant="metric"
            title="Highest Score"
            value={maxScore != null ? `${maxScore}/9` : "—"}
            sub={highestLabel ?? undefined}
          />
          <InsightCard
            variant="metric"
            title="Overall Acceptance"
            value={overallVal != null ? `${Math.round(overallVal)}/9` : "—"}
            infoTerm="overallProfile"
          />
          <InsightCard variant="narrative" text={summaryText} />
        </div>
      </div>

      {/* E. Manual survey remarks — not FER hedonic / confidence */}
      <div>
        <SectionPill>Manual Overall Feedback (Survey Remarks)</SectionPill>
        <p className="text-s text-gray-500 -mt-1 mb-3">
          Free-text comments from the survey. Separate from Mean FER Hedonic and Mean FER Confidence above.
        </p>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            {sr.remarks ?? "No remarks provided for this session."}
          </p>
        </div>
      </div>
    </div>
  );
}
