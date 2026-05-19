/**
 * notes:
 * - backend: change table columns
 * - Manage Kiosks is not yet finalized. Video streams should come from nodes.
 * - also, change ui if need be
 * 
 * references:
 * - table: https://stackoverflow.com/questions/60518353/how-to-display-mysql-table-in-react-js-table
 * - table: https://github.com/machadop1407/react-table-tutorial.git
 * - table: https://youtu.be/Q3ixb1w-QaY?si=AhrthqljoNJg1D6u
 **/

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";
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
import React from "react";

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

type TabKey = "food" | "stats" | "kiosks" | "participants";
type SessionStatus = "pending" | "active" | "completed" | "cancelled";
type Gender = "male" | "female" | "other";

type Session = {
  id: number;
  userId: number;
  startTime: string | null;
  endTime: string | null;
  status: SessionStatus;
  frames: number;
  meanConfidence: number | null; // 0-1
};

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

type Analytics = {
  meanConfidence: number;
  meanHedonic: number;
  distribution: { label: string; value: number; color: string }[];
  radar: { label: string; score: number }[];
  timeline: { label: string; score: number; sub: string }[];
  byAge: { label: string; score: number }[];
  byGender: { label: string; score: number }[];
  sampleSize: number;
  sessionCount: number;
  frameLogCount: number;
  surveyCount: number;
};

type Participant = {
  id: number;
  testerLabel: string | null;
  age: number;
  gender: Gender;
  createdAt: string | null;
}

type KioskStatus = "recording" | "paused" | "not_connected";

type Kiosk = {
  id: number;
  status: KioskStatus;
  elapsedSeconds: number;
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

const API_BASE = "http://localhost:8080";
const toApiUrl = (url: string | null) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
};

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabKey>("food");
  const [foods, setFoods] = useState<Food[]>([]);
  const [expandedFoodId, setExpandedFoodId] = useState<number | null>(null);
  const [showAddFood, setShowAddFood] = useState(false);
  const [newFood, setNewFood] = useState({
    name: "",
    category: ""
  });
  const [newFoodImageFile, setNewFoodImageFile] = useState<File | null>(null);
  const [sessionsByFoodId, setSessionsByFoodId] = useState<Record<number, Session[]>>({});
  const [analyticsByFoodId, setAnalyticsByFoodId] = useState<Record<number, Analytics>>({});
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState<Record<number, boolean>>({});
  const [analyticsLoading, setAnalyticsLoading] = useState<Record<number, boolean>>({});
  const [statsError, setStatsError] = useState<string | null>(null);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
  const [deletingFoodId, setDeletingFoodId] = useState<number | null>(null);
  const [deleteFoodError, setDeleteFoodError] = useState<string | null>(null);
  const foodsAbortRef = useRef<AbortController | null>(null);

  // NEW : Participant consts
  const parAbortRef = useRef<AbortController | null>(null);
  const [parLoading, setParLoading] = useState(true);
  const [parError, setParError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [expandedParId, setExpandedParId] = useState<number | null>(null);
  const [deletingParId, setDeletingParId] = useState<number | null>(null);
  const [deleteParError, setDeleteParError] = useState<string | null>(null);
  const [parToDelete, setParToDelete] = useState<Participant | null>(null);
  const [newParticipant, setNewParticipant] = useState({
    name: "",
    age: "",
    gender: ""
  });
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [editingParId, setEditingParId] = useState<number | null>(null);
  const [editParError, setEditParError] = useState<string | null>(null);
  const [parToEdit, setParToEdit] = useState<Participant | null>(null);

  // NEW : (placeholder) Manage Kiosk consts
  const [kiosks, setKiosks] = useState<Kiosk[]>([
    { id: 1, status: "recording", elapsedSeconds: 25 },
    { id: 2, status: "recording", elapsedSeconds: 25 },
    { id: 3, status: "recording", elapsedSeconds: 25 },
    { id: 4, status: "recording", elapsedSeconds: 25 },
    { id: 5, status: "recording", elapsedSeconds: 25 },
    { id: 6, status: "recording", elapsedSeconds: 25 },
    { id: 7, status: "not_connected", elapsedSeconds: 0 },
    { id: 8, status: "not_connected", elapsedSeconds: 0 },
  ]);

  // recording timers
  useEffect(() => {
    const interval = setInterval(() => {
      setKiosks((prev) =>
        prev.map((k) =>
          k.status === "recording"
            ? { ...k, elapsedSeconds: k.elapsedSeconds + 1 }
            : k
        )
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // recording handlers
  const onPauseKiosk = (id: number) => {
    setKiosks((prev) =>
      prev.map((k) =>
        k.id === id
          ? { ...k, status: k.status === "recording" ? "paused" : "recording" }
          : k
      )
    );
  };

  const onStopKiosk = (id: number) => {
    setKiosks((prev) =>
      prev.map((k) =>
        k.id === id ? { ...k, status: "not_connected", elapsedSeconds: 0 } : k
      )
    );
  };

  // recording helper : time formatting
  function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  useEffect(() => {
    foodsAbortRef.current?.abort();
    const ac = new AbortController();
    foodsAbortRef.current = ac;

    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const res = await fetch(`${API_BASE}/api/foods`, { signal: ac.signal });
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
    parAbortRef.current?.abort();
    const ac = new AbortController();
    parAbortRef.current = ac;

    async function loadParticipants() {
      setParLoading(true);
      setParError(null);
      try {
        const res = await fetch(`${API_BASE}/api/participants`, { signal: ac.signal });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load participants.");
        }
        const list: Participant[] = (json.participants ?? []).map((p: any) => ({
          id: Number(p.id ?? p.participant_id),
          testerLabel: p.testerLabel ?? p.tester_label ?? null,
          age: p.age ?? 0,
          gender: (p.gender ?? "other") as Gender,
          createdAt: p.createdAt ?? p.created_at ?? null,
        }));
        setParticipants(list);
        setExpandedParId((prev) => {
          if (prev && list.some((p) => p.id === prev)) return prev;
          return null;
        });
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setParError(err?.message || "Failed to load participants.");
      } finally {
        setParLoading(false);
      }
    }

    void loadParticipants();
    return () => ac.abort();
  }, []);

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
        const res = await fetch(`${API_BASE}/api/foods/${foodId}/analytics`);
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
    if (!selectedFood) {
      return {
        meanConfidence: 0,
        meanHedonic: 0,
        distribution: [
          { label: "Positive (7-9)", value: 0, color: "#22c55e" },
          { label: "Neutral (5-6)", value: 0, color: "#eab308" },
          { label: "Negative (1-4)", value: 0, color: "#ef4444" },
        ],
        radar: [
          { label: "Color", score: 0 },
          { label: "Flavor/Aroma", score: 0 },
          { label: "Salt/Sweet", score: 0 },
          { label: "Texture", score: 0 },
          { label: "Overall", score: 0 },
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
      };
    }
    return (
      analyticsByFoodId[selectedFood.id] ?? {
        meanConfidence: 0,
        meanHedonic: 0,
        distribution: [
          { label: "Positive (7-9)", value: 0, color: "#22c55e" },
          { label: "Neutral (5-6)", value: 0, color: "#eab308" },
          { label: "Negative (1-4)", value: 0, color: "#ef4444" },
        ],
        radar: [
          { label: "Color", score: 0 },
          { label: "Flavor/Aroma", score: 0 },
          { label: "Salt/Sweet", score: 0 },
          { label: "Texture", score: 0 },
          { label: "Overall", score: 0 },
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
      }
    );
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

  // Hide analytics visuals when critical data is missing
  const hideAnalyticsGraphs = useMemo(() => {
    if (!selectedFood) return true;
    const sessionCount = Number(stats.sessionCount ?? 0);
    const frameLogCount = Number(stats.frameLogCount ?? 0);
    const surveyCount = Number(stats.surveyCount ?? 0);
    return sessionCount <= 0 || frameLogCount <= 0 || surveyCount <= 0;
  }, [selectedFood, stats.sessionCount, stats.frameLogCount, stats.surveyCount]);

  const radarChartData = useMemo(() => {
    const labels = stats.radar.map((r) => r.label);
    const values = stats.radar.map((r) => Number.isFinite(r.score) ? r.score : 0);
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
  }, [stats.radar]);

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
            font: { size: 11, weight: 600 as any },
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

    return {
      labels,
      datasets: [
        {
          label: "FER hedonic (avg)",
          data: stats.timeline.map((t) => (Number.isFinite(t.score) ? t.score : 0)),
          borderColor: "rgb(232, 23, 74)",
          backgroundColor: "rgb(232, 23, 74)",
          pointBackgroundColor: "rgb(232, 23, 74)",
          pointBorderColor: "rgb(232, 23, 74)",
          pointRadius: 6,
          pointHoverRadius: 7,
          borderWidth: 3,
          tension: 0.35,
          fill: false,
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
          min: 0,
          max: 9,
          ticks: { stepSize: 1, color: "#9ca3af", font: { size: 11 } },
          grid: { color: "rgba(156, 163, 175, 0.25)" },
          border: { color: "rgba(156, 163, 175, 0.35)" },
        },
      },
    } as const;
  }, []);

  const ensureSessionsLoaded = async (foodId: number) => {
    if (sessionsByFoodId[foodId]) return;
    if (sessionsLoading[foodId]) return;
    setSessionsLoading((p) => ({ ...p, [foodId]: true }));
    try {
      const res = await fetch(`${API_BASE}/api/foods/${foodId}/sessions`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load sessions.");
      }
      setSessionsByFoodId((p) => ({ ...p, [foodId]: (json.sessions ?? []) as Session[] }));
    } finally {
      setSessionsLoading((p) => ({ ...p, [foodId]: false }));
    }
  };

  const onDeleteFood = async (foodId: number) => {
    try {
      setDeletingFoodId(foodId);
      setDeleteFoodError(null);
      const res = await fetch(`${API_BASE}/api/foods/${foodId}`, { method: "DELETE" });
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
      const res = await fetch(`${API_BASE}/api/foods`, {
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
        const imgRes = await fetch(`${API_BASE}/api/foods/${created.id}/image`, {
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
      setShowAddFood(false);
      setTab("food");
      setNewFood({ name: "", category: "" });
      setNewFoodImageFile(null);
    } catch (err) {
      console.error(err);
    }
  };

  // NEW : Manage Participant Functions
  const onDeleteParticipant = async (participantId: number) => {
    if (!participantId) return;  
    try {
      setDeletingParId(participantId);
      setDeleteParError(null);
      const res = await fetch(`${API_BASE}/api/participants/${participantId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete participant.");
      }
      setParticipants((prev) => prev.filter((p) => p.id !== participantId));
      setExpandedParId((prev) => {
        if (prev !== participantId) return prev;
        const remaining = participants.filter((p) => p.id !== participantId);
        return remaining[0]?.id ?? null;
      });
    } catch (err) {
      setDeleteParError((err as any)?.message || "Failed to delete participant.");
    } finally {
      setDeletingParId(null);
      setParToDelete(null);
    }
  };

  const onAddParticipant = async () => {
    const name = newParticipant.name.trim();
    const age = newParticipant.age;
    const gender = newParticipant.gender;
    // other fields
    if (!name || !age || !gender) return;

    try {
      const res = await fetch(`${API_BASE}/api/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerLabel: name, age: Number(age), gender }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to add participant.");
      }
      const created = json.participant as { id: number; testerLabel: string | null; age: number | null; gender: Gender | null; createdAt: string };
      const newRow: Participant = {
        id: created.id,
        testerLabel: created.testerLabel,
        age: created.age ?? 0,
        gender: created.gender ?? "other",
        createdAt: created.createdAt,
      };
    
      setParticipants((prev) => [newRow, ...prev]);
      setExpandedParId(created.id);
      setShowAddParticipant(false);
      setTab("participants");
      setNewParticipant({ name: "", age: "", gender: ""});
    } catch (err) {
      console.error(err);
    }
  };

  const onEditParticipant = async () => {
    if (!parToEdit) return;
    const name = parToEdit.testerLabel?.trim() ?? "";
    if (!name) return;
    if (!parToEdit.id) return;  

    try {
      setEditingParId(parToEdit.id);
      setEditParError(null);
      const res = await fetch(`${API_BASE}/api/participants/${parToEdit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testerLabel: name, age: parToEdit.age, gender: parToEdit.gender }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update participant.");
      }
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === parToEdit.id
            ? { ...p, testerLabel: name, age: parToEdit.age, gender: parToEdit.gender }
            : p
        )
      );
      setParToEdit(null);
    } catch (err) {
      setEditParError((err as any)?.message || "Failed to update participant.");
    } finally {
      setEditingParId(null);
    }
  };

  // NOTE : eto yung ui
  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      {/* Top bar */}
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3"
            aria-label="Go to dashboard"
          >
            <img src={logo} alt="FaMiLis logo" className="w-[44px] h-[44px] object-contain" />
            <span className="text-white text-[22px] font-bold tracking-wide">FaMiLis</span>
          </button>

          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-3xl mx-auto">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-[26px] font-bold text-gray-900">Food Testing Hub</h1>
            <p className="text-[12px] text-gray-500 mt-1">Add and Manage Food for Testing</p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <button
              type="button"
              onClick={() => setShowAddFood(true)}
              className="inline-flex items-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
            >
              <span aria-hidden="true">➕</span>
              Add New Food
            </button>
            <button
              type="button"
              onClick={() => navigate("/setup")}
              className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
            >
              <span aria-hidden="true">📷</span>
              Camera Recording
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-4 mb-5">
            <StatCard icon="🍽️" label="Total Foods" value={totalFoods} />
            <StatCard icon="✅" label="Active Foods" value={activeFoods} />
            <StatCard icon="🏷️" label="Categories" value={categories} />
          </div>

          {/* Tabs */}
          <div className="flex rounded-md overflow-hidden border border-gray-200 bg-white mb-5">
            <TabButton active={tab === "food"} onClick={() => setTab("food")}>
              Food Management
            </TabButton>
            <TabButton active={tab === "kiosks"} onClick={() => setTab("kiosks")}>
              Manage Kiosks
            </TabButton>
            <TabButton active={tab === "participants"} onClick={() => setTab("participants")}>
              Manage Participants
            </TabButton>
            <TabButton active={tab === "stats"} onClick={() => setTab("stats")}>
              Statistics &amp; Analytics
            </TabButton>
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
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">No foods added yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {foods.map((food) => {
                    const isExpanded = expandedFoodId === food.id;
                    const sessions = sessionsByFoodId[food.id] ?? [];
                    return (
                      <div key={food.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[14px] font-semibold text-gray-900 truncate">
                                <span className="inline-flex items-center gap-2">
                                  {food.imageUrl ? (
                                    <img
                                      src={toApiUrl(food.imageUrl) ?? undefined}
                                      alt={food.name}
                                      className="w-8 h-8 rounded-md border border-gray-200 object-cover"
                                    />
                                  ) : (
                                    <span className="w-8 h-8 rounded-md border border-dashed border-gray-300 bg-gray-50 inline-flex items-center justify-center text-[10px] text-gray-400">
                                      IMG
                                    </span>
                                  )}
                                  <span className="truncate">{food.name}</span>
                                </span>
                              </p>
                              <Badge
                                className={
                                  food.sessionsActive > 0
                                    ? "bg-green-50 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }
                              >
                                {food.sessionsActive > 0 ? "Active session" : "No active sessions"}
                              </Badge>
                              <Badge className="bg-blue-50 text-blue-700">
                                {food.sessionsTotal} session{food.sessionsTotal === 1 ? "" : "s"}
                              </Badge>
                            </div>

                            <div className="mt-2 space-y-0.5 text-[12px] text-gray-500">
                              <p>
                                <span className="text-gray-700 font-semibold">Category:</span>{" "}
                                {food.category}
                              </p>
                              <p>
                                <span className="text-gray-700 font-semibold">Duration:</span>{" "}
                                {food.avgDurationMin == null ? "-" : `${Math.round(food.avgDurationMin)} minutes (avg)`}
                              </p>
                              <p>
                                <span className="text-gray-700 font-semibold">Created:</span>{" "}
                                {formatDate(food.createdAt)}
                              </p>
                            </div>

                            <div className="flex items-center gap-4 mt-3">
                              <button
                                type="button"
                                onClick={() => setFoodToDelete(food)}
                                className="text-[12px] font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">🗑️</span>
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const next = isExpanded ? null : food.id;
                                  setExpandedFoodId(next);
                                  if (next != null) await ensureSessionsLoaded(next);
                                }}
                                className="text-[12px] font-semibold text-gray-600 hover:text-gray-900 transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">{isExpanded ? "🔼" : "🔽"}</span>
                                {isExpanded ? "Hide Sessions" : "View Sessions"}
                              </button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <h3 className="text-[12px] text-gray-700 font-bold mb-2">
                              Testing Sessions
                            </h3>

                            {sessionsLoading[food.id] ? (
                              <div className="text-[12px] text-gray-500">Loading sessions…</div>
                            ) : sessions.length === 0 ? (
                              <div className="text-[12px] text-gray-500">No sessions yet.</div>
                            ) : (
                              <div className="space-y-2">
                                {sessions.map((s) => (
                                  <div
                                    key={s.id}
                                    className="bg-gray-50 rounded-md p-3 hover:bg-gray-100 transition-colors"
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div className="flex items-center gap-2">
                                        <p className="text-[12px] font-semibold text-gray-900">
                                          S-{s.id}
                                        </p>
                                        <Badge className={statusClasses(s.status)}>{formatStatus(s.status)}</Badge>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => navigate(`/session-detail?sessionId=${s.id}`)}
                                        className="text-[12px] font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors"
                                      >
                                        View Details
                                      </button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[12px] text-gray-600">
                                      <div>
                                        <span className="text-gray-500">Start:</span>{" "}
                                        <span className="text-gray-700">{formatDateTime(s.startTime)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">End:</span>{" "}
                                        <span className="text-gray-700">{formatDateTime(s.endTime)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Frames:</span>{" "}
                                        <span className="text-gray-700">{s.frames}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Confidence:</span>{" "}
                                        <span className="text-gray-700">
                                          {s.meanConfidence == null ? "-" : `${Math.round(s.meanConfidence * 100)}%`}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : tab === "stats" ? (
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-gray-900 font-bold">
                      {selectedFood ? selectedFood.name : "Statistics & Analytics"}
                    </h2>
                    <p className="text-[12px] text-gray-500 mt-1">
                      {selectedFood
                        ? `Live analytics from DB${stats.sampleSize ? ` • ${stats.sampleSize} survey(s)` : ""}`
                        : "Live analytics from DB"}
                    </p>
                  </div>

                  {foods.length > 1 && (
                    <select
                      value={selectedFood?.id ?? ""}
                      onChange={(e) => setExpandedFoodId(Number(e.target.value))}
                      className="text-[12px] border border-gray-200 rounded-md px-3 py-2 bg-white"
                      aria-label="Select food"
                    >
                      {foods.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-6">
                {selectedFood && analyticsLoading[selectedFood.id] ? (
                  <div className="text-[12px] text-gray-500">Loading analytics…</div>
                ) : null}
                {statsError ? (
                  <div className="text-[12px] text-gray-500">
                    Failed to load analytics. <span className="text-gray-400">{statsError}</span>
                  </div>
                ) : null}
                {analyticsIssues.length > 0 ? (
                  <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    {analyticsIssues.join(" ")}
                  </div>
                ) : null}

                {hideAnalyticsGraphs ? (
                  <div className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
                    Graphs are hidden until required analytics data is available.
                  </div>
                ) : (
                  <>
                    {/* A */}
                    <div>
                      <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                        A. Frame-by-Frame Hedonic Score Distribution Report
                      </h3>
                      <p className="text-[12px] text-gray-500 mb-4">
                        Do consumers like this product?
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <MetricCard title="Mean Hedonic Scale" subtitle="Out of 9">
                            <p className="text-[44px] leading-none font-bold text-[#e8174a]">
                              {stats.meanHedonic.toFixed(1)}
                            </p>
                          </MetricCard>

                          <MetricCard title="Mean FER Confidence Level" subtitle="">
                            <div className="flex items-end justify-between gap-3">
                              <p className="text-[40px] leading-none font-bold text-gray-900">
                                {Math.round(stats.meanConfidence * 100)}%
                              </p>
                              <p className="text-[12px] text-gray-500">(from frame logs)</p>
                            </div>
                            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#e8174a]"
                                style={{
                                  width: `${clampPct(stats.meanConfidence * 100)}%`,
                                }}
                              />
                            </div>
                          </MetricCard>
                        </div>

                        <div>
                          <p className="text-[12px] text-gray-600 mb-2 text-center">
                            Reaction Distribution
                          </p>
                          <div className="flex items-center justify-center">
                            <div
                              className="w-[190px] h-[190px] rounded-full border border-gray-100 shadow-sm"
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
                              aria-label="Pie chart"
                            />
                          </div>

                          <div className="mt-3 space-y-1">
                            {stats.distribution.map((d) => (
                              <div key={d.label} className="flex items-center gap-2 text-[12px]">
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: d.color }}
                                  aria-hidden="true"
                                />
                                <span className="text-gray-600">
                                  {d.label}: {d.value}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* B */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                        B. Survey-Based Attribute Radar Report
                      </h3>
                      <p className="text-[12px] text-gray-500 mb-4">
                        What consumers like about the product (based on session survey logs)
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                          <p className="text-[12px] text-gray-700 font-semibold mb-2">Spider chart</p>
                          <div className="h-[240px]">
                            <Radar data={radarChartData as any} options={radarChartOptions as any} />
                          </div>
                        </div>

                        <div className="space-y-3">
                          {stats.radar.map((r) => (
                            <div key={r.label}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[12px] text-gray-600">{r.label}</span>
                                <span className="text-[12px] text-gray-900 font-semibold">
                                  {r.score.toFixed(1)} / 9
                                </span>
                              </div>
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#e8174a]"
                                  style={{ width: `${clampPct((r.score / 9) * 100)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* C */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                        C. FER Timeline Report
                      </h3>
                      <p className="text-[12px] text-gray-500 mb-4">
                        Emotion over time during testing
                      </p>

                      <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="h-[190px]">
                          <Line data={lineChartData as any} options={lineChartOptions as any} />
                        </div>
                      </div>
                    </div>

                    {/* D */}
                    <div className="border-t border-gray-100 pt-6">
                      <h3 className="text-[13px] font-bold text-gray-900 mb-1">
                        D. Demographics Report
                      </h3>
                      <p className="text-[12px] text-gray-500 mb-4">
                        Consumer profile and survey-based hedonic scores
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <p className="text-[12px] text-gray-700 font-semibold mb-3">
                            Hedonic Score by Age Group
                          </p>
                          <div className="space-y-2">
                            {stats.byAge.map((a) => (
                              <div key={a.label}>
                                <div className="flex items-center justify-between text-[12px] mb-1">
                                  <span className="text-gray-600">{a.label}</span>
                                  <span className="text-gray-900 font-semibold">
                                    {a.score.toFixed(1)}
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#e8174a]"
                                    style={{ width: `${clampPct((a.score / 9) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <p className="text-[12px] text-gray-700 font-semibold mb-3">
                            Hedonic Score by Gender
                          </p>
                          <div className="space-y-2">
                            {stats.byGender.map((g) => (
                              <div key={g.label}>
                                <div className="flex items-center justify-between text-[12px] mb-1">
                                  <span className="text-gray-600">{g.label}</span>
                                  <span className="text-gray-900 font-semibold">
                                    {g.score.toFixed(1)}
                                  </span>
                                </div>
                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#e8174a]"
                                    style={{ width: `${clampPct((g.score / 9) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : tab === "kiosks" ? (
            // NEW : temp Manage Kiosks Tab
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="text-gray-900 font-bold mb-4">Manage Kiosks</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {kiosks.map((kiosk) => {
                  const isConnected = kiosk.status !== "not_connected";
                  const isRecording = kiosk.status === "recording";
                  const isPaused = kiosk.status === "paused";

                  return (
                    <div key={kiosk.id} className="flex flex-col gap-2">
                      {/* Camera card */}
                      <div className="bg-gray-200 rounded-xl overflow-hidden relative aspect-[4/3]">
                        {/* Timer + status badge */}
                        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
                          <span className="text-[13px] font-bold text-gray-900">
                            {formatElapsed(kiosk.elapsedSeconds)}
                          </span>
                          {isRecording && (
                            <span className="inline-flex items-center gap-1.5 bg-[#e8174a] text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              recording
                            </span>
                          )}
                          {isPaused && (
                            <span className="inline-flex items-center gap-1.5 bg-orange-400 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              paused
                            </span>
                          )}
                          {!isConnected && (
                            <span className="inline-flex items-center gap-1.5 bg-gray-400 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                              not connected
                            </span>
                          )}
                        </div>

                        {/* Camera feed / placeholder */}
                        <div className="w-full h-full flex items-center justify-center">
                          {isConnected ? (
                            /* Person silhouette */
                            <svg viewBox="0 0 80 90" className="w-2/3 h-2/3 text-gray-500" fill="currentColor">
                              <circle cx="40" cy="28" r="18" />
                              <ellipse cx="40" cy="80" rx="32" ry="22" />
                            </svg>
                          ) : (
                            /* Camera off icon */
                            <svg viewBox="0 0 24 24" className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M3 3l18 18M10.5 10.677A2 2 0 0 0 10 12a2 2 0 0 0 2 2c.48 0 .92-.17 1.255-.45M6.228 6.228A10.5 10.5 0 0 0 3 12c0 1.68.41 3.26 1.13 4.65M6.228 6.228A10.5 10.5 0 0 1 12 4.5c4.756 0 8.773 3.162 10.13 7.5-.47 1.47-1.24 2.8-2.23 3.9M6.228 6.228 3 3m3.228 3.228 3.65 3.65M16.5 16.5l2.272 2.272" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => onPauseKiosk(kiosk.id)}
                          disabled={!isConnected}
                          className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                            isConnected
                              ? "bg-orange-400 hover:bg-orange-500 text-white"
                              : "bg-gray-300 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          {isPaused ? "Resume" : "Pause"} recording
                        </button>
                        <button
                          type="button"
                          onClick={() => onStopKiosk(kiosk.id)}
                          disabled={!isConnected}
                          className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
                            isConnected
                              ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                              : "bg-gray-300 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          Stop recording
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : tab === "participants" ? (
            // NEW : Manage Participants Tab
            <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 overflow-x-auto">
              {parLoading ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Loading participants…</p>
                </div>
              ) : parError ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">Failed to load participants.</p>
                  <p className="text-xs mt-2 text-gray-400">{parError}</p>
                </div>
              ) : participants.length === 0 ? (
                <div className="text-center py-14 text-gray-500">
                  <p className="text-sm">No participants added yet.</p>
                </div>
              ) : (
                <div>
                  <div className="flex w-225 h-15 items-center justify-between">
                    <h2 className="text-gray-900 font-bold mb-4">Food Management</h2>
                    <button
                      type="button"
                      onClick={() => setShowAddParticipant(true)}
                      className="inline-flex items-center gap-2 bg-[#e8174a] hover:bg-[#c9143f] text-white px-4 py-2.5 rounded-md text-sm font-semibold transition-colors"
                    >
                      <span aria-hidden="true">➕</span>
                      Add New Participant
                    </button>
                  </div>

                  <table className="min-w-max w-full text-center text-[12px] border-separate border-spacing-x-4 gap-10">
                    <thead>
                      <tr>
                        <th scope="col">Participant ID</th>
                        <th scope="col">Session Number</th>
                        <th scope="col">Kiosk Number</th>
                        <th scope="col">Name</th>
                        <th scope="col">Contact Number</th>
                        <th scope="col">GCash Number</th>
                        <th scope="col">Date & Time</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participants.sort((a, b) => a.id-b.id).map(p => {
                        return (
                          <tr key={p.id}>
                            <td>{p.id}</td>
                            <td>-</td>                {/*session_id*/}
                            <td>-</td>                {/*kiosk_id*/}
                            <td>{p.testerLabel}</td> {/*name*/}
                            <td>-</td>                {/*contact_number*/}
                            <td>-</td>                {/*gcash_number*/}
                            <td>{formatDateTime(p.createdAt)}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setParToEdit(p)}
                                className="text-[12px] font-semibold text-black hover:text-green transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">✍️</span>
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setParToDelete(p)}
                                className="text-[12px] font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors inline-flex items-center gap-1"
                              >
                                <span aria-hidden="true">🗑️</span>
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </main>

      {/* Add Food Modal */}
      {showAddFood && (
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
                onClick={() => setShowAddFood(false)}
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
      {foodToDelete ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-2">Delete food?</h2>
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
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {deletingFoodId === foodToDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add Participant Modal */}
      {showAddParticipant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Add New Participant</h2>

            <div className="space-y-3">
              <Field label="Participant Name *">
                <input
                  type="text"
                  value={newParticipant.name}
                  onChange={(e) => setNewParticipant((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. John Doe"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Age *">
                <input
                  type="number"
                  value={newParticipant.age}
                  onChange={(e) => setNewParticipant((p) => ({ ...p, age: e.target.value }))}
                  placeholder="e.g. 21"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Gender *">
                <select
                  value={newParticipant.gender}
                  onChange={(e) => setNewParticipant((p) => ({ ...p, gender: e.target.value }))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                >
                  <option value="">Select gender…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setShowAddParticipant(false)}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onAddParticipant}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Add Participant
              </button>
            </div>
          </div>
        </div>
      )}
      {parToDelete ? (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-2">Delete participant?</h2>
            <p className="text-sm text-gray-600">
              This will permanently remove <span className="font-semibold">{parToDelete.testerLabel}</span> and
              its related sessions.
            </p>
            {deleteParError ? <p className="text-xs text-red-600 mt-2">{deleteParError}</p> : null}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => setParToDelete(null)}
                disabled={deletingParId === parToDelete.id}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDeleteParticipant(parToDelete.id)}
                disabled={deletingParId === parToDelete.id}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {deletingParId === parToDelete.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {parToEdit && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-gray-900 font-bold mb-4">Edit Participant</h2>

            <div className="space-y-3">
              <Field label="Participant Name *">
                <input
                  type="text"
                  value={parToEdit.testerLabel ?? ""}
                  onChange={(e) =>
                    setParToEdit((p) => p ? { ...p, testerLabel: e.target.value } : p)
                  }
                  placeholder="e.g. John Doe"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Age *">
                <input
                  type="number"
                  value={parToEdit.age ?? ""}
                  onChange={(e) => setParToEdit((p) => p ? { ...p, age: Number(e.target.value) } : p)}
                  placeholder="e.g. 21"
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                />
              </Field>

              <Field label="Gender *">
                <select
                  value={parToEdit.gender ?? ""}
                  onChange={(e) => setParToEdit((p) => p ? { ...p, gender: e.target.value as Gender } : p)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                >
                  <option value="">Select gender…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
            </div>

            {editParError && (
              <p className="text-xs text-red-600 mt-2">{editParError}</p>
            )}

            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={() => { setParToEdit(null); setEditParError(null); }}
                disabled={editingParId === parToEdit.id}
                className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onEditParticipant}
                disabled={editingParId === parToEdit.id}
                className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white py-2 rounded-md text-sm font-semibold transition-colors"
              >
                {editingParId === parToEdit.id ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-red-50">
        {icon}
      </span>
      <div>
        <p className="text-[12px] text-gray-500 font-semibold">{label}</p>
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
  children: React.ReactNode;
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

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
      <p className="text-[12px] text-gray-500 font-semibold">{title}</p>
      {subtitle ? <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p> : null}
      <div className="mt-2">{children}</div>
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