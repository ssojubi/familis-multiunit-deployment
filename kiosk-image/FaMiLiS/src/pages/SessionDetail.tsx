import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

const API_BASE = "http://localhost:8080";
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

type SessionDetailPayload = {
  session: {
    id: number;
    userId: number;
    foodId: number;
    status: SessionStatus;
    startTime: string | null;
    endTime: string | null;
  };
  food: Food | null;
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

function toApiUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

export default function SessionDetail() {
  const navigate = useNavigate();
  const location = useLocation();

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
        const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/details`, {
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
  const frameLineData = useMemo(() => {
    const labels = (content?.frameLogs ?? []).map((f, idx) => {
      if (!f.timestamp) return `Frame ${idx + 1}`;
      const d = new Date(f.timestamp);
      if (Number.isNaN(d.getTime())) return `Frame ${idx + 1}`;
      return d.toLocaleTimeString();
    });
    return {
      labels,
      datasets: [
        {
          label: "Hedonic score",
          data: (content?.frameLogs ?? []).map((f) =>
            f.hedonicScore == null ? null : Number((f.hedonicScore * 8 + 1).toFixed(1))
          ),
          borderColor: "rgb(232, 23, 74)",
          backgroundColor: "rgba(232, 23, 74, 0.25)",
          borderWidth: 2,
          spanGaps: true,
          tension: 0.25,
          pointRadius: 3,
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
      const res = await fetch(`${API_BASE}/api/sessions/${content.session.id}/status`, {
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
      const res = await fetch(`${API_BASE}/api/sessions/${content.session.id}`, { method: "DELETE" });
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

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm transition-colors"
          >
            <span aria-hidden="true">←</span>
            Back to Dashboard
          </button>

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
                    <h1 className="text-[26px] font-bold text-gray-900">
                      S-{content.session.id}
                    </h1>
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-semibold ${statusClasses(
                        status
                      )}`}
                    >
                      {formatStatus(status)}
                    </span>
                  </div>
                  <p className="text-[14px] text-gray-600 mt-1">
                    {content.food ? `${content.food.name} - ${content.food.category}` : "Session"}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-1">
                    {formatDateTime(content.session.startTime)} - {formatDateTime(content.session.endTime)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={status}
                    onChange={(e) => onChangeStatus(e.target.value as SessionStatus)}
                    disabled={statusSaving}
                    className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white"
                    aria-label="Session status"
                  >
                    {statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {formatStatus(s)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="text-sm border border-red-200 text-red-700 hover:bg-red-50 rounded-md px-3 py-2"
                  >
                    Delete Session
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mb-4 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-md">
                  {error}
                </div>
              ) : null}

              {/* Metric cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <MetricCard
                  icon="📷"
                  iconBg="bg-blue-50 text-blue-600"
                  title="Total Frames Analyzed"
                  value={`${content.metrics.totalFrames}`}
                />
                <MetricCard
                  icon="📈"
                  iconBg="bg-green-50 text-green-600"
                  title="Avg Confidence Score"
                  value={meanConfidencePct == null ? "-" : `${meanConfidencePct}%`}
                />
                <MetricCard
                  icon="🍦"
                  iconBg="bg-red-50 text-[#e8174a]"
                  title="Avg Hedonic Score"
                  value={meanHedonicOutOf9 == null ? "-" : `${meanHedonicOutOf9.toFixed(1)}`}
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
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">Frame Logs</h2>
                    <p className="text-[12px] text-gray-500 mb-4">
                      Captured frames with face detection and emotion analysis
                    </p>
                    {content.frameLogs.length === 0 ? (
                      <div className="text-[12px] text-gray-500">No frame logs available.</div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-gray-50 rounded-lg border border-gray-100 p-3">
                          <p className="text-[12px] text-gray-600 mb-2 font-semibold">
                            Hedonic score over time
                          </p>
                          <div className="h-[220px]">
                            <Line data={frameLineData as any} options={frameLineOptions as any} />
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-[720px] w-full text-left">
                          <thead>
                            <tr className="text-[12px] text-gray-500 bg-gray-50">
                              <th className="px-3 py-3 font-semibold">Timestamp</th>
                              <th className="px-3 py-3 font-semibold">Face Detected</th>
                              <th className="px-3 py-3 font-semibold">Confidence Score</th>
                              <th className="px-3 py-3 font-semibold">Hedonic Score</th>
                              <th className="px-3 py-3 font-semibold">Frame Image</th>
                            </tr>
                          </thead>
                          <tbody>
                            {content.frameLogs.map((f, idx) => {
                              const confPct = f.confidenceScore == null ? 0 : clampPct(f.confidenceScore * 100);
                              const hedonic =
                                f.hedonicScore == null ? null : Number((f.hedonicScore * 8 + 1).toFixed(1));
                              return (
                                <tr key={`${f.timestamp ?? "t"}-${idx}`} className="border-t border-gray-100">
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {formatDateTime(f.timestamp)}
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {f.faceDetected === true ? (
                                      <span className="text-green-700 font-semibold">✓ Yes</span>
                                    ) : f.faceDetected === false ? (
                                      <span className="text-red-600 font-semibold">✗ No</span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    <div className="w-full">
                                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#e8174a]"
                                          style={{ width: `${confPct}%` }}
                                          aria-label={`Confidence ${Math.round(confPct)}%`}
                                        />
                                      </div>
                                      <div className="mt-1 text-right text-[12px] text-gray-500">
                                        {f.confidenceScore == null ? "0%" : `${Math.round(f.confidenceScore * 100)}%`}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {hedonic == null ? (
                                      <span className="text-gray-400">- / 9</span>
                                    ) : (
                                      <span className="font-semibold">
                                        {hedonic} / 9
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-[12px] text-gray-700">
                                    {f.frameImageUrl ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setPreviewImage({
                                            url: toApiUrl(f.frameImageUrl) ?? "",
                                            label: formatDateTime(f.timestamp),
                                          })
                                        }
                                        className="group"
                                      >
                                        <img
                                          src={toApiUrl(f.frameImageUrl) ?? undefined}
                                          alt={`Frame at ${formatDateTime(f.timestamp)}`}
                                          className="w-12 h-12 rounded-md border border-gray-200 object-cover group-hover:opacity-90"
                                        />
                                      </button>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : tab === "system" ? (
                  <div>
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">System Logs</h2>
                    <p className="text-[12px] text-gray-500 mb-4">System-generated logs and events</p>

                    {content.systemLogs.length === 0 ? (
                      <div className="text-[12px] text-gray-500">No system logs available.</div>
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
                              <p className="text-[12px] text-gray-800 font-semibold">{l.message}</p>
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
                  <div>
                    <h2 className="text-[14px] font-bold text-gray-900 mb-1">Survey Results</h2>
                    <p className="text-[12px] text-gray-500 mb-4">
                      Participant profile, ratings breakdown, and remarks
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                      <InfoCard label="Participant Age" value={content.surveyResults?.age ?? null} />
                      <InfoCard
                        label="Gender"
                        value={
                          content.surveyResults?.gender
                            ? content.surveyResults.gender.charAt(0).toUpperCase() +
                              content.surveyResults.gender.slice(1)
                            : null
                        }
                      />
                    </div>

                    {content.surveyResults ? (
                      <>
                        <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 mb-5">
                          <h3 className="text-[13px] font-bold text-gray-900 mb-3">Ratings Breakdown</h3>

                          <RatingRow
                            label="Color"
                            rating={content.surveyResults.colorRating}
                          />
                          <RatingRow
                            label="Flavor/Aroma"
                            rating={content.surveyResults.flavorAromaRating}
                          />
                          <RatingRow
                            label="Salt/Sweet Balance"
                            rating={content.surveyResults.saltSweetRating}
                          />
                          <RatingRow
                            label="Texture"
                            rating={content.surveyResults.textureRating}
                          />

                          <div className="mt-4 pt-3 border-t border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[12px] text-gray-700 font-semibold">Overall Rating</p>
                              <p className="text-[12px] text-gray-700 font-semibold">
                                {formatRatingOutOf9(content.surveyResults.finalOverallRating)}
                                {" / 9"}
                              </p>
                            </div>
                            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#e8174a]"
                                style={{
                                  width: `${clampPct(
                                    (ratingToOutOf9(content.surveyResults.finalOverallRating) / 9) * 100
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="bg-white rounded-lg border border-gray-100 p-4">
                          <h3 className="text-[13px] font-bold text-gray-900 mb-2">Remarks</h3>
                          <p className="text-[12px] text-gray-500">
                            {content.surveyResults.remarks ??
                              "No remarks provided for this session."}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-[12px] text-gray-500">
                        No survey results available for this session yet.
                      </div>
                    )}
                  </div>
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
                className="text-xs text-gray-600 hover:text-gray-900"
              >
                Close
              </button>
            </div>
            <img src={previewImage.url} alt="Frame preview" className="w-full max-h-[70vh] object-contain rounded-lg" />
          </div>
        </div>
      ) : null}
      {deleteOpen && content ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-2">Delete this session?</h2>
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
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {deletePending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  iconBg,
  title,
  value,
}: {
  icon: string;
  iconBg: string;
  title: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg ${iconBg}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] text-gray-500 font-semibold">{title}</p>
        <p className="text-[26px] leading-none text-gray-900 font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2.5 text-[13px] font-semibold transition-colors ${
        active ? "bg-[#e8174a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function InfoCard({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4">
      <p className="text-[12px] text-gray-500 font-semibold">{label}</p>
      <p className="text-[16px] text-gray-900 font-bold mt-1">{value == null ? "-" : value}</p>
    </div>
  );
}

function ratingToOutOf9(rating1to9: number | null) {
  if (rating1to9 == null) return 0;
  return rating1to9;
}

function formatRatingOutOf9(rating1to9: number | null) {
  return Math.round(ratingToOutOf9(rating1to9));
}

function RatingRow({ label, rating }: { label: string; rating: number | null }) {
  const outOf9 = ratingToOutOf9(rating);
  const pct = clampPct((outOf9 / 9) * 100);
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] text-gray-700 font-semibold">{label}</p>
        <p className="text-[12px] text-gray-600 font-semibold">
          {formatRatingOutOf9(rating)} / 9
        </p>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-[#e8174a]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}