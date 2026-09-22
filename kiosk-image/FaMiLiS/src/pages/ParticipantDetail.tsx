import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { ProfileCard } from "../components/analytics";
import {
  FoodsTastedChips,
  ParticipantDeleteDialog,
  ParticipantFormModal,
  ParticipantSessionTable,
  type ParticipantFormValues,
  type ParticipantSessionRow,
  type TastedFood,
} from "../components/participants";
import { apiFetch } from "../lib/api";

type Participant = {
  id: number;
  testerLabel: string | null;
  age: number | null;
  gender: string | null;
  dietaryRestrictions: string | null;
  createdAt: string | null;
};

function formatGender(gender: string | null) {
  if (!gender) return "-";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function ParticipantDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const participantId = Number.parseInt(id ?? "", 10);

  const [participant, setParticipant] = useState<Participant | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [lastSessionAt, setLastSessionAt] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ParticipantSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(participantId)) {
      setLoading(false);
      setError("Invalid taster.");
      return;
    }

    const ac = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [profileRes, sessionsRes] = await Promise.all([
          apiFetch(`/api/participants/${participantId}`, { signal: ac.signal }),
          apiFetch(`/api/participants/${participantId}/sessions`, { signal: ac.signal }),
        ]);
        const profileJson = await profileRes.json().catch(() => null);
        if (!profileRes.ok || !profileJson?.ok) {
          throw new Error(profileJson?.error || "Failed to load taster.");
        }
        const sessionsJson = await sessionsRes.json().catch(() => null);
        if (!sessionsRes.ok || !sessionsJson?.ok) {
          throw new Error(sessionsJson?.error || "Failed to load taster sessions.");
        }

        setParticipant(profileJson.participant as Participant);
        setSessionCount(Number(profileJson.sessionCount ?? 0));
        setLastSessionAt(profileJson.lastSessionAt ?? null);
        setSessions((sessionsJson.sessions ?? []) as ParticipantSessionRow[]);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load taster.");
        setParticipant(null);
        setSessions([]);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ac.abort();
  }, [participantId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const foodsTasted = useMemo<TastedFood[]>(() => {
    const byFoodId = new Map<number, TastedFood>();
    for (const session of sessions) {
      if (session.foodId == null || byFoodId.has(session.foodId)) continue;
      byFoodId.set(session.foodId, {
        foodId: session.foodId,
        foodName: session.foodName ?? "Unknown food",
        foodCategory: session.foodCategory,
      });
    }
    return Array.from(byFoodId.values());
  }, [sessions]);

  const handleStartNewSession = () => {
    if (!participant) return;
    navigate("/setup", {
      state: {
        participantId: participant.id,
        testerLabel: participant.testerLabel,
        age: participant.age,
        gender: participant.gender,
      },
    });
  };

  const handleEditSubmit = async (values: ParticipantFormValues) => {
    if (!participant) return;
    const label = values.testerLabel.trim();
    if (!label) {
      setFormError("Taster label is required.");
      return;
    }

    const age =
      values.age.trim() === ""
        ? null
        : Number.isFinite(Number(values.age))
          ? Math.round(Number(values.age))
          : null;
    if (values.age.trim() !== "" && age == null) {
      setFormError("Age must be a number between 0 and 120.");
      return;
    }
    if (age != null && (age < 0 || age > 120)) {
      setFormError("Age must be between 0 and 120.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/participants/${participant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testerLabel: label,
          age,
          gender: values.gender || null,
          dietaryRestrictions: values.dietaryRestrictions.trim() || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.participant) {
        throw new Error(json?.error || "Failed to update taster.");
      }
      setParticipant(json.participant as Participant);
      setEditOpen(false);
      setToast("Taster updated");
    } catch (err: any) {
      setFormError(err?.message || "Failed to update taster.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!participant) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/participants/${participant.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete taster.");
      }
      navigate("/participants", { replace: true });
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete taster.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <PageHeader
      variant="collapsed"
      backLabel="Back to Tasters"
      backTo="/participants"
    >
      {toast ? (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold">
          {toast}
        </div>
      ) : null}

      <main className="px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <PageTitle
            title={participant?.testerLabel ?? (loading ? "Loading…" : `Taster P-${participantId}`)}
            subtitle="Taster profile and session history"
            hideBack
          />

          {loading ? (
            <div className="text-center text-gray-500 text-sm py-10">Loading taster…</div>
          ) : error || !participant ? (
            <div className="text-center text-red-600 text-sm py-10">{error ?? "Taster not found."}</div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 flex-1">
                  <ProfileCard label="Age" value={participant.age != null ? String(participant.age) : "-"} />
                  <ProfileCard label="Gender" value={formatGender(participant.gender)} />
                  <ProfileCard label="Created" value={formatDate(participant.createdAt)} />
                  <ProfileCard label="Sessions" value={String(sessionCount)} />
                  <ProfileCard label="Last Session" value={formatDate(lastSessionAt)} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setEditOpen(true);
                    }}
                    className="border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm font-semibold px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteOpen(true);
                    }}
                    className="border border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold px-4 py-2 rounded-md transition-colors whitespace-nowrap"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={handleStartNewSession}
                    className="bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap"
                  >
                    Start new session
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-1">Dietary restrictions</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {participant.dietaryRestrictions?.trim()
                    ? participant.dietaryRestrictions
                    : "None recorded."}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-1">Foods Tasted</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Distinct foods tried across all of this taster's sessions.
                </p>
                <FoodsTastedChips foods={foodsTasted} />
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-1">Session History</h2>
                <p className="text-xs text-gray-500 mb-4">Every tasting session for this taster.</p>
                <ParticipantSessionTable
                  sessions={sessions}
                  onOpenSession={(sessionId) => navigate(`/session-detail?sessionId=${sessionId}`)}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {editOpen && participant ? (
        <ParticipantFormModal
          mode="edit"
          initial={{
            testerLabel: participant.testerLabel,
            age: participant.age,
            gender: participant.gender,
            dietaryRestrictions: participant.dietaryRestrictions,
          }}
          saving={formSaving}
          error={formError}
          onClose={() => {
            if (formSaving) return;
            setEditOpen(false);
            setFormError(null);
          }}
          onSubmit={(values) => void handleEditSubmit(values)}
        />
      ) : null}

      {deleteOpen && participant ? (
        <ParticipantDeleteDialog
          label={participant.testerLabel ?? `P-${participant.id}`}
          deleting={deletePending}
          error={deleteError}
          onClose={() => {
            if (deletePending) return;
            setDeleteOpen(false);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </PageHeader>
  );
}
