import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE, apiFetch } from "../lib/api";
import { getStoredRole, isAdminRole } from "../RequireAuth";
import { PageHeader } from "../components/PageHeader";
import { ExportButton } from "../components/ExportButton";
import { FoodCard } from "../components/dashboard";
import {
  ColoredRatingBar,
  FerConfidenceCard,
  HedonicInterpretationCard,
  HeroHedonicCard,
  InsightCard,
  MeanFerHedonicCard,
  MeanSurveyHedonicCard,
  MetricCard,
  SectionPill,
  SessionTrendChart,
  StatsCategoryRibbon,
  type StatsCategory,
} from "../components/analytics";
import { RATING_LABELS, buildDemographicsInterpretation, buildFerInterpretation, buildHedonicInterpretation, buildSurveyInterpretation, hedonicColor } from "../lib/ratingLabels";
import { InfoTip } from "../components/InfoTip";
import type { GlossaryTerm } from "../lib/glossary";
import { ATTRIBUTE_COLORS, getDemoColor } from "../lib/attributeColors";
import {
  Chart as ChartJS,
  Filler,
  Legend,
  LineElement,
  PointElement,
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Line, Radar } from "react-chartjs-2";

ChartJS.register(
  RadialLinearScale,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

type TabKey = "food" | "stats";

type Food = {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  createdAt: string | null;
  sessionsTotal: number;
  sessionsActive: number;
  avgDurationMin: number | null;
};

type AspectStat = { mean: number; stdDev: number; n: number };

type AspectStats = {
  color: AspectStat;
  flavorAroma: AspectStat;
  saltSweet: AspectStat;
  texture: AspectStat;
  overall: AspectStat;
};

type SessionTrendPoint = {
  sessionId: number;
  sessionDate: string | null;
  overallRating: number | null;
  color: number | null;
  flavorAroma: number | null;
  saltSweet: number | null;
  texture: number | null;
  meanFerHedonic: number | null;
};

type Analytics = {
  meanConfidence: number;
  meanHedonic: number;
  distribution: { label: string; value: number; color: string; count?: number }[];
  reactionCounts?: { positive: number; neutral: number; negative: number };
  radar: { label: string; score: number }[];
  timeline: { label: string; score: number; sub: string }[];
  byAge: { label: string; score: number }[];
  byGender: { label: string; score: number }[];
  sampleSize: number;
  sessionCount: number;
  frameLogCount: number;
  surveyCount: number;
  aspectStats: AspectStats;
  sessionTrends: SessionTrendPoint[];
};

const EMPTY_ASPECT_STAT: AspectStat = { mean: 0, stdDev: 0, n: 0 };

const EMPTY_ASPECT_STATS: AspectStats = {
  color: EMPTY_ASPECT_STAT,
  flavorAroma: EMPTY_ASPECT_STAT,
  saltSweet: EMPTY_ASPECT_STAT,
  texture: EMPTY_ASPECT_STAT,
  overall: EMPTY_ASPECT_STAT,
};

/** Maps radar/bar labels to their aspectStats key for N / stdDev lookups. */
const ASPECT_KEY_BY_LABEL: Record<string, keyof AspectStats> = {
  Color: "color",
  "Flavor/Aroma": "flavorAroma",
  "Salt/Sweet": "saltSweet",
  Texture: "texture",
  Overall: "overall",
};

/** Per-attribute InfoTip terms for survey sensory bars. */
const ASPECT_INFO_BY_LABEL: Record<string, GlossaryTerm> = {
  Color: "surveyColor",
  "Flavor/Aroma": "surveyFlavorAroma",
  "Salt/Sweet": "surveySaltSweet",
  Texture: "surveyTexture",
  Overall: "overallProfile",
};

const EMPTY_ANALYTICS: Analytics = {
  meanConfidence: 0,
  meanHedonic: 0,
  distribution: [
    { label: "Positive (7-9)", value: 0, color: "#22c55e", count: 0 },
    { label: "Neutral (5-6)", value: 0, color: "#eab308", count: 0 },
    { label: "Negative (1-4)", value: 0, color: "#ef4444", count: 0 },
  ],
  reactionCounts: { positive: 0, neutral: 0, negative: 0 },
  radar: [
    { label: "Overall", score: 0 },
    { label: "Color", score: 0 },
    { label: "Flavor/Aroma", score: 0 },
    { label: "Salt/Sweet", score: 0 },
    { label: "Texture", score: 0 },
  ],
  timeline: [
    { label: "First taste", score: 0, sub: "Early" },
    { label: "Mid", score: 0, sub: "Middle" },
    { label: "Aftertaste", score: 0, sub: "Late" },
  ],
  byAge: [],
  byGender: [],
  sampleSize: 0,
  sessionCount: 0,
  frameLogCount: 0,
  surveyCount: 0,
  aspectStats: EMPTY_ASPECT_STATS,
  sessionTrends: [],
};

const toApiUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canExport = isAdminRole(getStoredRole());

  const tabFromUrl = searchParams.get("tab") === "stats" ? "stats" : "food";
  const [tab, setTab] = useState<TabKey>(tabFromUrl);
  const [statsCategory, setStatsCategory] = useState<StatsCategory>("overall");
  const [foods, setFoods] = useState<Food[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newFood, setNewFood] = useState({
    name: "",
    category: "",
  });
  const [newFoodImageFile, setNewFoodImageFile] = useState<File | null>(null);
  const [analyticsByFoodId, setAnalyticsByFoodId] = useState<Record<number, Analytics>>({});
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState<Record<number, boolean>>({});
  const [statsError, setStatsError] = useState<string | null>(null);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
  const [deletingFoodId, setDeletingFoodId] = useState<number | null>(null);
  const [deleteFoodError, setDeleteFoodError] = useState<string | null>(null);
  const [sessionStatsLoadingFoodId, setSessionStatsLoadingFoodId] = useState<number | null>(null);
  const [editingFoodImage, setEditingFoodImage] = useState<Food | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageModalError, setImageModalError] = useState<string | null>(null);
  const [imageSaving, setImageSaving] = useState(false);
  const [imageRemoving, setImageRemoving] = useState(false);

  // Edit food modal state
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [editFoodFields, setEditFoodFields] = useState({ name: "", category: "" });
  const [editFoodImageFile, setEditFoodImageFile] = useState<File | null>(null);
  const [editFoodImagePreview, setEditFoodImagePreview] = useState<string | null>(null);
  const [editFoodSaving, setEditFoodSaving] = useState(false);
  const [editFoodError, setEditFoodError] = useState<string | null>(null);
  const editFoodImageInputRef = useRef<HTMLInputElement | null>(null);

  const foodsAbortRef = useRef<AbortController | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    foodsAbortRef.current?.abort();
    const ac = new AbortController();
    foodsAbortRef.current = ac;

    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await apiFetch(`/api/foods`, { signal: ac.signal });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load foods.");
        }
        const list: Food[] = json.foods ?? [];
        setFoods(list);
        setExpandedFoodId((prev) => {
          if (prev && list.some((f) => f.id === prev)) return prev;
          return null;
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setFoodsError(err?.message || "Failed to load foods.");
      } finally {
        setFoodsLoading(false);
      }
    }

    void loadFoods();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const closeImageModal = () => {
    setEditingFoodImage(null);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageModalError(null);
    setImageSaving(false);
    setImageRemoving(false);
    if (imageFileInputRef.current) imageFileInputRef.current.value = "";
  };

  const openImageModal = (food: Food) => {
    setEditingFoodImage(food);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageModalError(null);
    if (imageFileInputRef.current) imageFileInputRef.current.value = "";
  };

  useEffect(() => {
    if (!editFoodImageFile) {
      setEditFoodImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(editFoodImageFile);
    setEditFoodImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [editFoodImageFile]);

  const openEditFoodModal = (food: Food) => {
    setEditingFood(food);
    setEditFoodFields({ name: food.name, category: food.category });
    setEditFoodImageFile(null);
    setEditFoodImagePreview(null);
    setEditFoodError(null);
    setEditFoodSaving(false);
    if (editFoodImageInputRef.current) editFoodImageInputRef.current.value = "";
  };

  const closeEditFoodModal = () => {
    setEditingFood(null);
    setEditFoodImageFile(null);
    setEditFoodImagePreview(null);
    setEditFoodError(null);
    setEditFoodSaving(false);
    if (editFoodImageInputRef.current) editFoodImageInputRef.current.value = "";
  };

  const onSaveEditFood = async () => {
    if (!editingFood) return;
    const name = editFoodFields.name.trim();
    const category = editFoodFields.category.trim();
    if (!name || !category) {
      setEditFoodError("Name and category are required.");
      return;
    }
    setEditFoodSaving(true);
    setEditFoodError(null);
    try {
      // Update metadata if changed.
      if (name !== editingFood.name || category !== editingFood.category) {
        const res = await apiFetch(`/api/foods/${editingFood.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update food.");
        }
      }

      // Upload new image if one was chosen.
      let updatedImageUrl = editingFood.imageUrl;
      if (editFoodImageFile) {
        const fd = new FormData();
        fd.append("image", editFoodImageFile);
        const imgRes = await apiFetch(`/api/foods/${editingFood.id}/image`, {
          method: "POST",
          body: fd,
        });
        const imgJson = await imgRes.json().catch(() => null);
        if (imgRes.ok && imgJson?.ok) {
          updatedImageUrl = String(imgJson.imageUrl ?? "");
        }
      }

      setFoods((prev) =>
        prev.map((f) =>
          f.id === editingFood.id ? { ...f, name, category, imageUrl: updatedImageUrl } : f
        )
      );
      closeEditFoodModal();
    } catch (err: any) {
      setEditFoodError(err?.message || "Failed to save changes.");
    } finally {
      setEditFoodSaving(false);
    }
  };

  const onRemoveEditFoodImage = async () => {
    if (!editingFood) return;
    setEditFoodSaving(true);
    setEditFoodError(null);
    try {
      const res = await apiFetch(`/api/foods/${editingFood.id}/image`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to remove image.");
      }
      setFoods((prev) =>
        prev.map((f) => (f.id === editingFood.id ? { ...f, imageUrl: null } : f))
      );
      setEditingFood((prev) => (prev ? { ...prev, imageUrl: null } : prev));
    } catch (err: any) {
      setEditFoodError(err?.message || "Failed to remove image.");
    } finally {
      setEditFoodSaving(false);
    }
  };

  const updateFoodImageUrl = (foodId: number, imageUrl: string | null) => {
    setFoods((prev) => prev.map((f) => (f.id === foodId ? { ...f, imageUrl } : f)));
  };

  const onSaveFoodImage = async () => {
    if (!editingFoodImage || !imageFile) return;
    setImageSaving(true);
    setImageModalError(null);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);
      const res = await apiFetch(`/api/foods/${editingFoodImage.id}/image`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to upload image.");
      }
      updateFoodImageUrl(editingFoodImage.id, String(json.imageUrl ?? ""));
      closeImageModal();
    } catch (err: any) {
      setImageModalError(err?.message || "Failed to upload image.");
    } finally {
      setImageSaving(false);
    }
  };

  const onRemoveFoodImage = async () => {
    if (!editingFoodImage?.imageUrl) return;
    setImageRemoving(true);
    setImageModalError(null);
    try {
      const res = await apiFetch(`/api/foods/${editingFoodImage.id}/image`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to remove image.");
      }
      updateFoodImageUrl(editingFoodImage.id, null);
      closeImageModal();
    } catch (err: any) {
      setImageModalError(err?.message || "Failed to remove image.");
    } finally {
      setImageRemoving(false);
    }
  };

  const totalFoods = foods.length;
  const activeFoods = foods.filter((f) => f.sessionsActive > 0).length;
  const categories = new Set(foods.map((f) => f.category)).size;

  const selectedFood = useMemo(() => {
    const candidate = foods.find((f) => f.id === expandedFoodId) ?? foods[0];
    return candidate ?? null;
  }, [foods, expandedFoodId]);

  useEffect(() => {
    if (tab !== "stats") return;
    if (!selectedFood) return;
    const foodId = selectedFood.id;
    if (analyticsByFoodId[foodId]) return;
    if (analyticsLoading[foodId]) return;

    async function loadAnalytics() {
      setStatsError(null);
      setAnalyticsLoading((p) => ({ ...p, [foodId]: true }));
      try {
        const res = await apiFetch(`/api/foods/${foodId}/analytics`);
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load analytics.");
        }
        setAnalyticsByFoodId((p) => ({ ...p, [foodId]: json.analytics as Analytics }));
      } catch (err: any) {
        setStatsError(err?.message || "Failed to load analytics.");
      } finally {
        setAnalyticsLoading((p) => ({ ...p, [foodId]: false }));
      }
    }

    void loadAnalytics();
  }, [tab, selectedFood, analyticsByFoodId, analyticsLoading]);

  const stats = useMemo(() => {
    if (!selectedFood) return EMPTY_ANALYTICS;
    return analyticsByFoodId[selectedFood.id] ?? EMPTY_ANALYTICS;
  }, [selectedFood, analyticsByFoodId]);

  const analyticsIssues = useMemo(() => {
    const issues: string[] = [];
    const sessionCount = Number(stats.sessionCount ?? 0);
    const frameLogCount = Number(stats.frameLogCount ?? 0);
    const surveyCount = Number(stats.surveyCount ?? 0);
    if (!selectedFood) {
      issues.push("Select a food product to view analytics.");
      return issues;
    }
    if (sessionCount <= 0) {
      issues.push("No sessions yet for this food product.");
    }
    if (frameLogCount <= 0) {
      issues.push("No frame logs found. FER charts may be empty.");
    }
    if (surveyCount <= 0) {
      issues.push("No survey submissions yet. Survey-based charts may be empty.");
    }
    return issues;
  }, [selectedFood, stats.frameLogCount, stats.sessionCount, stats.surveyCount]);

  // Hide analytics visuals only when there is no usable session/frame signal at all.
  // Low survey counts still render so LowSampleOverlay can cover chart panes.
  const hideAnalyticsGraphs = useMemo(() => {
    if (!selectedFood) return true;
    const sessionCount = Number(stats.sessionCount ?? 0);
    const frameLogCount = Number(stats.frameLogCount ?? 0);
    return sessionCount <= 0 && frameLogCount <= 0;
  }, [selectedFood, stats.sessionCount, stats.frameLogCount]);

  const surveyCountN = Number(stats.surveyCount ?? 0);
  const lowSample = surveyCountN < 5;

  const ferInterpretation = useMemo(() => {
    if (stats.frameLogCount <= 0) return null;
    // Prefer explicit counts from the API; fall back to per-bucket counts, then
    // derive from percentages so we never render "0, 0, and 0" beside a live pie.
    const bucketCount = (prefix: string): number | null => {
      const bucket = stats.distribution.find((d) => d.label.startsWith(prefix));
      if (!bucket) return null;
      if (typeof bucket.count === "number" && Number.isFinite(bucket.count)) return bucket.count;
      return Math.round((bucket.value / 100) * stats.frameLogCount);
    };
    const rc = stats.reactionCounts;
    const hasExplicit =
      rc != null && rc.positive + rc.neutral + rc.negative > 0;
    return buildFerInterpretation({
      ferMean: stats.meanHedonic,
      confidence: stats.meanConfidence,
      positiveCount: hasExplicit ? rc!.positive : bucketCount("Positive") ?? 0,
      neutralCount: hasExplicit ? rc!.neutral : bucketCount("Neutral") ?? 0,
      negativeCount: hasExplicit ? rc!.negative : bucketCount("Negative") ?? 0,
    });
  }, [
    stats.frameLogCount,
    stats.meanHedonic,
    stats.meanConfidence,
    stats.distribution,
    stats.reactionCounts,
  ]);

  const surveyInterpretation = useMemo(() => {
    return buildSurveyInterpretation({
      overallMean: stats.surveyCount > 0 ? stats.aspectStats.overall.mean : null,
      surveyCount: stats.surveyCount,
      aspectStats: stats.aspectStats,
    });
  }, [stats.surveyCount, stats.aspectStats]);

  const demographicsInterpretation = useMemo(() => {
    return buildDemographicsInterpretation({
      byAge: stats.byAge,
      byGender: stats.byGender,
      surveyCount: stats.surveyCount,
    });
  }, [stats.byAge, stats.byGender, stats.surveyCount]);

  const PAIR_DIFF_THRESHOLD = 1.5;
  const PAIR_PREVIEW_COUNT = 5;
  const [showAllPairs, setShowAllPairs] = useState(false);

  // Latest-first FER vs survey pairs per valid session (sessionTrends is P1a-filtered).
  const sessionPairs = useMemo(() => {
    return stats.sessionTrends
      .map((t) => {
        const fer = t.meanFerHedonic;
        const survey = t.overallRating;
        const hasFer = fer != null && Number.isFinite(fer);
        const hasSurvey = survey != null && Number.isFinite(survey);
        const diff = hasFer && hasSurvey ? fer! - survey! : null;
        return { ...t, hasFer, hasSurvey, diff };
      })
      .filter((t) => t.hasFer || t.hasSurvey)
      .sort((a, b) => {
        const ta = a.sessionDate ? new Date(a.sessionDate).getTime() : 0;
        const tb = b.sessionDate ? new Date(b.sessionDate).getTime() : 0;
        return tb - ta || b.sessionId - a.sessionId;
      });
  }, [stats.sessionTrends]);

  const visiblePairs = showAllPairs ? sessionPairs : sessionPairs.slice(0, PAIR_PREVIEW_COUNT);

  // Exclude "Overall" from the radar chart — keep only the 4 attribute axes.
  const radarAttributes = useMemo(
    () => stats.radar.filter((r) => r.label !== "Overall"),
    [stats.radar]
  );

  const radarChartData = useMemo(() => {
    const labels = radarAttributes.map((r) => r.label);
    const values = radarAttributes.map((r) => (Number.isFinite(r.score) ? r.score : 0));
    return {
      labels,
      datasets: [
        {
          label: "Survey attributes",
          data: values,
          fill: true,
          backgroundColor: "rgba(232, 23, 74, 0.18)",
          borderColor: "rgb(232, 23, 74)",
          pointBackgroundColor: "rgb(232, 23, 74)",
          pointBorderColor: "#fff",
          pointHoverBackgroundColor: "#fff",
          pointHoverBorderColor: "rgb(232, 23, 74)",
          borderWidth: 2,
        },
      ],
    };
  }, [radarAttributes]);

  const radarChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${ctx.label}: ${Number(ctx.raw ?? 0).toFixed(1)} / 9`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 9,
          ticks: {
            stepSize: 1,
            showLabelBackdrop: false,
            color: "#9ca3af",
            font: { size: 10 },
          },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          angleLines: { color: "rgba(156, 163, 175, 0.25)" },
          pointLabels: {
            color: "#6b7280",
            font: { size: 12, weight: 600 as any },
          },
        },
      },
    } as const;
  }, []);

  const lineChartData = useMemo(() => {
    const labels = stats.timeline.map((t) => {
      const raw = t.label.toLowerCase();
      if (raw.includes("first")) return "1st Taste (Initial)";
      if (raw.includes("mid")) return "Chewing/Tasting (Mid)";
      if (raw.includes("after")) return "Aftertaste (End)";
      return t.label;
    });

    const scores = stats.timeline.map((t) => (Number.isFinite(t.score) ? t.score : 0));

    return {
      labels,
      datasets: [
        {
          label: "FER hedonic (avg)",
          data: scores,
          // Per-segment color based on the average of the two endpoint scores
          segment: {
            borderColor: (ctx: any) => {
              const avg = (ctx.p0.parsed.y + ctx.p1.parsed.y) / 2;
              return hedonicColor(avg);
            },
          },
          pointBackgroundColor: scores.map((s) => hedonicColor(s)),
          pointBorderColor: "#fff",
          pointRadius: 7,
          pointHoverRadius: 8,
          borderWidth: 3,
          tension: 0.35,
          fill: false,
          // borderColor is overridden per-segment; this is a fallback
          borderColor: "transparent",
          backgroundColor: "transparent",
        },
      ],
    };
  }, [stats.timeline]);

  const lineChartOptions = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => `${Number(ctx.raw ?? 0).toFixed(1)} / 9`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#6b7280", font: { size: 11 } },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
        y: {
          min: 1,
          max: 9,
          ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
      },
    } as const;
  }, []);

  const onDeleteFood = async (foodId: number) => {
    try {
      setDeletingFoodId(foodId);
      setDeleteFoodError(null);
      const res = await apiFetch(`/api/foods/${foodId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete food.");
      }
      setFoods((prev) => prev.filter((f) => f.id !== foodId));
      setExpandedFoodId((prev) => {
        if (prev !== foodId) return prev;
        const remaining = foods.filter((f) => f.id !== foodId);
        return remaining[0]?.id ?? null;
      });
    } catch (err) {
      setDeleteFoodError((err as any)?.message || "Failed to delete food.");
    } finally {
      setDeletingFoodId(null);
      setFoodToDelete(null);
    }
  };

  const onAddFood = async () => {
    const name = newFood.name.trim();
    const category = newFood.category.trim();
    if (!name || !category) return;

    try {
      const res = await apiFetch(`/api/foods`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add food.");
      }
      const created = json.food as { id: number; name: string; category: string; createdAt: string };
      let uploadedImageUrl: string | null = null;
      if (newFoodImageFile) {
        const fd = new FormData();
        fd.append("image", newFoodImageFile);
        const imgRes = await apiFetch(`/api/foods/${created.id}/image`, {
          method: "POST",
          body: fd,
        });
        const imgJson = await imgRes.json().catch(() => null);
        if (imgRes.ok && imgJson?.ok) {
          uploadedImageUrl = String(imgJson.imageUrl ?? "");
        }
      }
      const newRow: Food = {
        id: created.id,
        name: created.name,
        category: created.category,
        imageUrl: uploadedImageUrl,
        createdAt: created.createdAt,
        sessionsTotal: 0,
        sessionsActive: 0,
        avgDurationMin: null,
      };
      setFoods((prev) => [newRow, ...prev]);
      setExpandedFoodId(created.id);
      setShowAdd(false);
      setTab("food");
      setSearchParams({}, { replace: true });
      setNewFood({ name: "", category: "" });
      setNewFoodImageFile(null);
    } catch (err) {
      console.error(err);
    }
  };

  const onOpenLatestSession = async (food: Food) => {
    if (food.sessionsTotal === 0 || sessionStatsLoadingFoodId != null) return;
    setSessionStatsLoadingFoodId(food.id);
    try {
      const res = await apiFetch(`/api/foods/${food.id}/sessions`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load sessions.");
      }
      const sessions = (json.sessions ?? []) as { id: number }[];
      const latest = sessions[0];
      if (!latest) return;
      navigate(`/session-detail?sessionId=${latest.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSessionStatsLoadingFoodId(null);
    }
  };

  return (
    <PageHeader variant="expanded">
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Title + actions */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">Manage and statistically analyze food for testing.</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => navigate("/setup")}
                className="inline-flex items-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
              >
                <span aria-hidden="true">📷</span>
                Camera Recording
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
              >
                <span aria-hidden="true">➕</span>
                Add New Food
              </button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <MetricCard icon="🍽️" iconBg="bg-red-50 text-[#e8174a]" title="Total Foods" value={String(totalFoods)} />
            <MetricCard icon="✅" iconBg="bg-green-50 text-green-600" title="Active Foods" value={String(activeFoods)} />
            <MetricCard icon="🏷️" iconBg="bg-blue-50 text-blue-600" title="Categories" value={String(categories)} />
          </div>

          {tab === "food" ? (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-gray-900 font-bold mb-4">Food Management</h2>

              {foodsLoading ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Loading foods…</p>
                </div>
              ) : foodsError ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Failed to load foods.</p>
                  <p className="text-xs mt-2 text-gray-400">{foodsError}</p>
                </div>
              ) : foods.length === 0 ? (
                <div className="text-center py-14 text-gray-400">
                  <div className="text-4xl mb-3" aria-hidden="true">🍽️</div>
                  <p className="text-sm font-semibold text-gray-600">No food products yet</p>
                  <p className="text-xs mt-1">Click "Add New Food" to register your first product for testing.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 lg:grid-cols-3 gap-4">
                  {foods.map((food) => (
                    <FoodCard
                      key={food.id}
                      food={food}
                      imageSrc={toApiUrl(food.imageUrl)}
                      isSelected={expandedFoodId === food.id}
                      formatDate={formatDate}
                      onSelect={() => setExpandedFoodId(food.id)}
                      onEdit={() => openEditFoodModal(food)}
                      onImageClick={() => openImageModal(food)}
                      onDelete={() => setFoodToDelete(food)}
                      onStartSession={() => navigate("/setup", { state: { foodId: food.id } })}
                      onSessionStats={() => void onOpenLatestSession(food)}
                      sessionStatsLoading={sessionStatsLoadingFoodId === food.id}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-gray-900 font-bold">
                      {selectedFood ? selectedFood.name : "Statistics & Analytics"}
                    </h2>
                    <p className="text-s text-gray-500 mt-1">
                      Live analytics from DB
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {foods.length > 1 && (
                      <select
                        value={selectedFood?.id ?? ""}
                        onChange={(e) => setExpandedFoodId(Number(e.target.value))}
                        className="text-xs border border-gray-200 rounded-md px-3 py-2 bg-white"
                        aria-label="Select food"
                      >
                        {foods.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {selectedFood && canExport ? <ExportButton kind="food" foodId={selectedFood.id} /> : null}
                  </div>
                </div>
              </div>

              <div className="p-5 space-y-5">
                <StatsCategoryRibbon active={statsCategory} onChange={setStatsCategory} />

                {selectedFood && analyticsLoading[selectedFood.id] ? (
                  <AnalyticsSkeleton />
                ) : null}
                {statsError ? (
                  <div className="text-xs text-gray-500">
                    Failed to load analytics. <span className="text-gray-400">{statsError}</span>
                  </div>
                ) : null}

                {analyticsIssues.length > 0 ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
                    {analyticsIssues.join(" ")}
                  </div>
                ) : null}

                {selectedFood && !analyticsLoading[selectedFood.id] && !hideAnalyticsGraphs ? (
                  <>
                    {statsCategory === "overall" ? (
                      <div className="space-y-6">
                        <div>
                          <SectionPill>Product Analytics</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            How much consumers like this product
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <MeanFerHedonicCard
                              title="Mean FER Hedonic Score"
                              score={stats.frameLogCount > 0 ? stats.meanHedonic : null}
                              confidence={stats.frameLogCount > 0 ? stats.meanConfidence : null}
                              emptyLabel="No frame data yet"
                            />
                            <MeanSurveyHedonicCard
                              title="Mean Overall Survey Ratings"
                              score={stats.surveyCount > 0 ? stats.aspectStats.overall.mean : null}
                              showHedonicLabel
                              emptyLabel="No survey data yet"
                            />
                          </div>
                          <p className="text-xs text-gray-500 -mt-2 mb-4">
                            Averages across valid sessions only (invalidated excluded).
                          </p>

                          <div className="mb-4">
                            <HedonicInterpretationCard
                              text={buildHedonicInterpretation({
                                surveyOverall:
                                  stats.surveyCount > 0 ? stats.aspectStats.overall.mean : null,
                                ferMean: stats.frameLogCount > 0 ? stats.meanHedonic : null,
                                confidence: stats.frameLogCount > 0 ? stats.meanConfidence : null,
                                aspectStats: stats.aspectStats,
                              })}
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <InsightCard
                              variant="default"
                              title="Valid Taster Responses (N)"
                              value={String(stats.surveyCount)}
                              infoTerm="sampleSize"
                              sub={
                                stats.surveyCount < 5
                                  ? "Need at least 5 responses for reliable trends"
                                  : undefined
                              }
                            />
                            <MetricCard
                              icon="📋"
                              iconBg="bg-blue-50 text-blue-600"
                              title="Testing Sessions"
                              value={String(stats.sessionCount)}
                              infoTerm="testingSessions"
                            />
                            <MetricCard
                              icon="📷"
                              iconBg="bg-green-50 text-green-600"
                              title="Frames Analyzed"
                              value={String(stats.frameLogCount)}
                              infoTerm="framesAnalyzed"
                            />
                          </div>
                        </div>

                        <LowSampleOverlay active={lowSample} sampleSize={surveyCountN}>
                          <div>
                            <SectionPill infoTerm="sessionTrends">Session Survey Trends (Over Time)</SectionPill>
                            <p className="text-s text-gray-500 -mt-1 mb-4">
                              How survey ratings change across testing sessions for this product
                            </p>
                            <SessionTrendChart sessionTrends={stats.sessionTrends} />
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-3">
                              <SectionPill infoTerm="ferVsSurvey">Per-session pairs</SectionPill>
                              {sessionPairs.length > PAIR_PREVIEW_COUNT ? (
                                <button
                                  type="button"
                                  onClick={() => setShowAllPairs((v) => !v)}
                                  className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors whitespace-nowrap"
                                >
                                  {showAllPairs
                                    ? "Show less"
                                    : `Show all (${sessionPairs.length})`}
                                </button>
                              ) : null}
                            </div>
                            <p className="text-s text-gray-500 -mt-1 mb-4">
                              FER hedonic vs survey overall for the latest valid sessions (invalidated excluded)
                            </p>
                            {sessionPairs.length === 0 ? (
                              <p className="text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-4 py-6 text-center">
                                No paired session data yet. Complete tasting sessions with frames and surveys to compare.
                              </p>
                            ) : (
                              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                                <table className="min-w-[640px] w-full text-left">
                                  <thead>
                                    <tr className="text-xs text-gray-500 bg-gray-50">
                                      <th className="px-3 py-2.5 font-semibold">Session</th>
                                      <th className="px-3 py-2.5 font-semibold">Date</th>
                                      <th className="px-3 py-2.5 font-semibold">FER hedonic</th>
                                      <th className="px-3 py-2.5 font-semibold">Survey overall</th>
                                      <th className="px-3 py-2.5 font-semibold">Δ (FER − Survey)</th>
                                      <th className="px-3 py-2.5 font-semibold">Note</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {visiblePairs.map((row) => {
                                      const note =
                                        !row.hasFer
                                          ? "Missing FER"
                                          : !row.hasSurvey
                                            ? "Missing survey"
                                            : row.diff != null && Math.abs(row.diff) >= PAIR_DIFF_THRESHOLD
                                              ? row.diff < 0
                                                ? "FER lower"
                                                : "FER higher"
                                              : "Aligned";
                                      return (
                                        <tr key={row.sessionId} className="border-t border-gray-100 text-sm">
                                          <td className="px-3 py-2.5 font-semibold text-gray-900">
                                            #{row.sessionId}
                                          </td>
                                          <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                            {formatDate(row.sessionDate)}
                                          </td>
                                          <td className="px-3 py-2.5 tabular-nums text-gray-800">
                                            {row.hasFer ? row.meanFerHedonic!.toFixed(1) : "—"}
                                          </td>
                                          <td className="px-3 py-2.5 tabular-nums text-gray-800">
                                            {row.hasSurvey ? row.overallRating!.toFixed(1) : "—"}
                                          </td>
                                          <td className="px-3 py-2.5 tabular-nums text-gray-800">
                                            {row.diff == null
                                              ? "—"
                                              : `${row.diff > 0 ? "+" : ""}${row.diff.toFixed(1)}`}
                                          </td>
                                          <td className="px-3 py-2.5 text-gray-600">{note}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>

                          <div>
                            <SectionPill>9-Point Hedonic Scale Reference</SectionPill>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-3">
                              {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => {
                                const isPositive = score >= 7;
                                const isNegative = score <= 4;
                                return (
                                  <div
                                    key={score}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                                      isPositive
                                        ? "bg-green-50 text-green-800"
                                        : isNegative
                                          ? "bg-red-50 text-red-800"
                                          : "bg-yellow-50 text-yellow-800"
                                    }`}
                                  >
                                    <span className="font-bold w-4 text-center tabular-nums">{score}</span>
                                    <span>{RATING_LABELS[score]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </LowSampleOverlay>
                      </div>
                    ) : null}

                    {statsCategory === "frames" ? (
                      <LowSampleOverlay active={lowSample} sampleSize={surveyCountN}>
                        <div className="mb-6">
                          <SectionPill>Facial Emotion Recognition (FER) Results</SectionPill>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.2fr] gap-4 mt-4">
                            <MeanFerHedonicCard
                              title="Mean FER Hedonic Score"
                              score={stats.frameLogCount > 0 ? stats.meanHedonic : null}
                              emptyLabel="No frame data yet"
                              showConfidenceBar={false}
                            />
                            <FerConfidenceCard meanConfidence={stats.meanConfidence} />
                          </div>
                          {ferInterpretation ? (
                            <div className="mt-4">
                              <HedonicInterpretationCard text={ferInterpretation} />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mt-4">
                              No FER interpretation yet. Capture frames with hedonic and confidence scores to fill this summary.
                            </p>
                          )}
                        </div>

                        <div>
                          <SectionPill>Reaction Distribution</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Do consumers like this product? (frame-by-frame FER)
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                              <p className="text-s text-gray-600 font-semibold mb-2">
                                Reaction distribution
                              </p>
                              <div className="min-h-[200px] h-[240px] flex items-center justify-center">
                                <div
                                  className="aspect-square h-full max-h-[220px] w-auto max-w-full rounded-full border border-gray-100 shadow-sm"
                                  style={{
                                    background:
                                      Number(stats.frameLogCount ?? 0) <= 0
                                        ? "conic-gradient(#e5e7eb 0% 100%)"
                                        : `conic-gradient(${stats.distribution
                                            .map((d, i) => {
                                              const start =
                                                i === 0
                                                  ? 0
                                                  : stats.distribution
                                                      .slice(0, i)
                                                      .reduce((a, b) => a + b.value, 0);
                                              const end = start + d.value;
                                              return `${d.color} ${start}% ${end}%`;
                                            })
                                            .join(", ")})`,
                                  }}
                                  aria-label="Reaction distribution pie chart"
                                />
                              </div>
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-600 font-semibold mb-2">Breakdown</p>
                              <div className="min-h-[200px] h-[240px] flex flex-col justify-center">
                                {stats.distribution.map((d) => (
                                  <div key={d.label} className="mb-4 last:mb-0">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
                                        <span
                                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{ backgroundColor: d.color }}
                                          aria-hidden="true"
                                        />
                                        {d.label}
                                      </span>
                                      <span className="text-sm text-gray-900 font-semibold tabular-nums">
                                        {d.value}%
                                        {typeof d.count === "number" ? (
                                          <span className="text-gray-500 font-normal"> ({d.count})</span>
                                        ) : null}
                                      </span>
                                    </div>
                                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{ width: `${d.value}%`, backgroundColor: d.color }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <SectionPill infoTerm="fer">FER Timeline (In-Session Reactions)</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Average hedonics over time over a single testing session
                          </p>
                          <div className="bg-gray-50 rounded-lg border border-gray-100 p-4">
                            <p className="text-xs text-gray-600 font-semibold mb-2">
                              Hedonic score over session phases
                            </p>
                            <div className="min-h-[180px] h-[220px]">
                              <Line data={lineChartData as any} options={lineChartOptions as any} />
                            </div>
                          </div>
                        </div>

                        <div>
                            <SectionPill>9-Point Hedonic Scale Reference</SectionPill>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 mt-3">
                              {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => {
                                const isPositive = score >= 7;
                                const isNegative = score <= 4;
                                return (
                                  <div
                                    key={score}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                                      isPositive
                                        ? "bg-green-50 text-green-800"
                                        : isNegative
                                          ? "bg-red-50 text-red-800"
                                          : "bg-yellow-50 text-yellow-800"
                                    }`}
                                  >
                                    <span className="font-bold w-4 text-center tabular-nums">{score}</span>
                                    <span>{RATING_LABELS[score]}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                      </LowSampleOverlay>
                    ) : null}

                    {statsCategory === "survey" ? (
                      <LowSampleOverlay active={lowSample} sampleSize={surveyCountN}>
                        <div>
                          <SectionPill infoTerm="sensoryAttributes">Survey Results (with Sensory Attributes)</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            What consumers liked about the product? (from survey results)
                          </p>
                          {surveyInterpretation ? (
                            <div className="mb-4">
                              <HedonicInterpretationCard text={surveyInterpretation} />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mb-4">
                              No survey interpretation yet. Collect taster survey responses to fill this summary.
                            </p>
                          )}
                          {/* Figma-inspired: radar left; hero + attribute bars stacked right */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                            <div className="bg-gray-50 rounded-lg border border-gray-100 p-4 h-full flex flex-col">
                              <p className="text-s text-gray-600 font-semibold mb-2 shrink-0 inline-flex items-center gap-1.5">
                                Spider chart
                                <InfoTip term="spiderChart" align="left" />
                              </p>
                              <div className="relative flex-1 min-h-[280px] md:min-h-[420px] w-full">
                                <div className="absolute inset-0">
                                  <Radar data={radarChartData as any} options={radarChartOptions as any} />
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-4">
                              <HeroHedonicCard
                                score={stats.surveyCount > 0 ? stats.aspectStats.overall.mean : null}
                              />
                              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                                {radarAttributes.map((r, i) => {
                                  const aspectKey = ASPECT_KEY_BY_LABEL[r.label];
                                  const aspect = aspectKey ? stats.aspectStats[aspectKey] : undefined;
                                  return (
                                    <ColoredRatingBar
                                      key={r.label}
                                      label={r.label}
                                      rating={r.score}
                                      color={ATTRIBUTE_COLORS[r.label] ?? "#e8174a"}
                                      n={aspect?.n}
                                      stdDev={aspect?.stdDev}
                                      showStatsTips={i === 0}
                                      infoTerm={ASPECT_INFO_BY_LABEL[r.label]}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </LowSampleOverlay>
                    ) : null}

                    {statsCategory === "demographics" ? (
                      <LowSampleOverlay active={lowSample} sampleSize={surveyCountN}>
                        <div>
                          <SectionPill infoTerm="demographicsHedonic">Survey Demographics</SectionPill>
                          <p className="text-s text-gray-500 -mt-1 mb-4">
                            Consumer profile with hedonic scores from survey responses by age and gender
                          </p>
                          {demographicsInterpretation ? (
                            <div className="mb-4">
                              <HedonicInterpretationCard text={demographicsInterpretation} />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mb-4">
                              No demographics interpretation yet. Collect responses with age and gender on the taster profile to fill this summary.
                            </p>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-700 font-semibold mb-3">
                                Hedonic Score by Age Group
                              </p>
                              {stats.byAge.length === 0 ? (
                                <p className="text-xs text-gray-500">No age data yet.</p>
                              ) : (
                                stats.byAge.map((a, i) => (
                                  <ColoredRatingBar
                                    key={a.label}
                                    label={a.label}
                                    rating={a.score}
                                    color={getDemoColor(i)}
                                  />
                                ))
                              )}
                            </div>
                            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                              <p className="text-s text-gray-700 font-semibold mb-3">
                                Hedonic Score by Gender
                              </p>
                              {stats.byGender.length === 0 ? (
                                <p className="text-xs text-gray-500">No gender data yet.</p>
                              ) : (
                                stats.byGender.map((g, i) => (
                                  <ColoredRatingBar
                                    key={g.label}
                                    label={g.label}
                                    rating={g.score}
                                    color={getDemoColor(i + 3)}
                                  />
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </LowSampleOverlay>
                    ) : null}
                  </>
                ) : selectedFood && !analyticsLoading[selectedFood.id] && hideAnalyticsGraphs ? (
                  <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-4 py-2">
                    Graphs are hidden until required analytics data is available.
                  </div>
                ) : null}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Add Food Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Add New Food</h2>

            <div className="space-y-3">
              <Field label="Food Name *">
                <input
                  type="text"
                  value={newFood.name}
                  onChange={(e) => setNewFood((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Ice Cream"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Category">
                <input
                  type="text"
                  value={newFood.category}
                  onChange={(e) => setNewFood((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. dessert"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Food Image (optional)">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewFoodImageFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onAddFood}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Add Food
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit Food Modal */}
      {editingFood ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Edit Food</h2>

            <div className="space-y-3">
              <Field label="Food Name *">
                <input
                  type="text"
                  value={editFoodFields.name}
                  onChange={(e) => setEditFoodFields((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Ice Cream"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Category *">
                <input
                  type="text"
                  value={editFoodFields.category}
                  onChange={(e) => setEditFoodFields((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. dessert"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Replace Image (optional)">
                {editingFood.imageUrl && !editFoodImageFile ? (
                  <div className="mb-2 flex items-center gap-3">
                    <img
                      src={toApiUrl(editingFood.imageUrl) ?? undefined}
                      alt={editingFood.name}
                      className="h-14 w-20 object-cover rounded border border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => void onRemoveEditFoodImage()}
                      disabled={editFoodSaving}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
                    >
                      Remove image
                    </button>
                  </div>
                ) : null}
                {editFoodImagePreview ? (
                  <div className="mb-2">
                    <img
                      src={editFoodImagePreview}
                      alt="Preview"
                      className="h-14 w-20 object-cover rounded border border-gray-200"
                    />
                  </div>
                ) : null}
                <input
                  ref={editFoodImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditFoodImageFile(e.target.files?.[0] ?? null)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>
            </div>

            {editFoodError ? (
              <p className="text-xs text-red-600 mt-3">{editFoodError}</p>
            ) : null}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={closeEditFoodModal}
                disabled={editFoodSaving}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSaveEditFood()}
                disabled={editFoodSaving}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editFoodSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {foodToDelete ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="food-delete-title"
          >
            <h2 id="food-delete-title" className="text-gray-900 font-bold mb-2">
              Delete food?
            </h2>
            <p className="text-sm text-gray-600">
              This will permanently remove <span className="font-semibold">{foodToDelete.name}</span> and
              its related sessions.
            </p>
            {deleteFoodError ? <p className="text-xs text-red-600 mt-2">{deleteFoodError}</p> : null}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setFoodToDelete(null)}
                disabled={deletingFoodId === foodToDelete.id}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDeleteFood(foodToDelete.id)}
                disabled={deletingFoodId === foodToDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {deletingFoodId === foodToDelete.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingFoodImage ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-1">Food image</h2>
            <p className="text-sm text-gray-500 mb-4">{editingFoodImage.name}</p>

            <div className="aspect-[3/2] rounded-lg overflow-hidden border border-gray-200 bg-gray-50 mb-4">
              {imagePreviewUrl || toApiUrl(editingFoodImage.imageUrl) ? (
                <img
                  src={imagePreviewUrl ?? toApiUrl(editingFoodImage.imageUrl) ?? undefined}
                  alt={editingFoodImage.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <span className="text-3xl mb-1" aria-hidden="true">
                    🍽️
                  </span>
                  <span className="text-xs font-medium">No image</span>
                </div>
              )}
            </div>

            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              onClick={() => imageFileInputRef.current?.click()}
              disabled={imageSaving || imageRemoving}
              className="w-full border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {editingFoodImage.imageUrl || imageFile ? "Choose new image" : "Choose image"}
            </button>

            {imageModalError ? (
              <p className="text-xs text-red-600 mt-3">{imageModalError}</p>
            ) : null}

            <div className="flex flex-wrap gap-3 mt-5">
              <button
                type="button"
                onClick={closeImageModal}
                disabled={imageSaving || imageRemoving}
                className="flex-1 min-w-[100px] border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              {editingFoodImage.imageUrl ? (
                <button
                  type="button"
                  onClick={() => void onRemoveFoodImage()}
                  disabled={imageSaving || imageRemoving}
                  className="flex-1 min-w-[100px] border border-red-200 text-red-700 hover:bg-red-50 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  {imageRemoving ? "Removing…" : "Remove image"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void onSaveFoodImage()}
                disabled={!imageFile || imageSaving || imageRemoving}
                className="flex-1 min-w-[100px] bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {imageSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageHeader>
  );
}

function LowSampleOverlay({
  active,
  sampleSize,
  children,
}: {
  active: boolean;
  sampleSize: number;
  children: ReactNode;
}) {
  if (!active) {
    return <div className="space-y-6">{children}</div>;
  }

  return (
    <div className="relative isolate min-h-[220px]">
      <div className="opacity-30 pointer-events-none select-none space-y-6" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 z-20 flex items-center justify-center p-4">
        <div className="bg-white/95 border border-gray-200 rounded-xl shadow-md px-5 py-4 text-center max-w-xs">
          <p className="text-sm font-bold text-gray-800 mb-1">Low sample size</p>
          <p className="text-xs text-gray-500">
            Need at least 5 surveys for reliable trends.{" "}
            <span className="font-semibold text-gray-700">Currently: {sampleSize}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden="true">
      <div className="h-6 bg-gray-100 rounded-full w-40" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-40 bg-gray-100 rounded-xl" />
        <div className="h-40 bg-gray-100 rounded-xl" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-4 bg-gray-100 rounded w-1/3" />
      <div className="h-40 bg-gray-100 rounded-xl" />
      <div className="h-4 bg-gray-100 rounded w-1/4" />
      <div className="h-32 bg-gray-100 rounded-xl" />
    </div>
  );
}