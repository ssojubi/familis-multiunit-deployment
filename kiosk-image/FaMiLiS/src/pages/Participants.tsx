import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, PageTitle } from "../components/PageHeader";
import {
  ParticipantDeleteDialog,
  ParticipantFormModal,
  ParticipantRow,
  type ParticipantFormValues,
  type ParticipantListItem,
} from "../components/participants";
import { apiFetch } from "../lib/api";

const SORT_STORAGE_KEY = "familis.participants.sort";

type SortKey = "label" | "age" | "gender" | "sessionCount" | "lastSessionAt" | "createdAt";
type SortDir = "asc" | "desc";
type GenderFilter = "" | "male" | "female" | "other";

function readStoredSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return { key: "label", dir: "asc" };
    const parsed = JSON.parse(raw) as { key?: string; dir?: string };
    const key = (
      ["label", "age", "gender", "sessionCount", "lastSessionAt", "createdAt"] as SortKey[]
    ).includes(parsed.key as SortKey)
      ? (parsed.key as SortKey)
      : "label";
    const dir = parsed.dir === "desc" ? "desc" : "asc";
    return { key, dir };
  } catch {
    return { key: "label", dir: "asc" };
  }
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-4 py-3 font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-gray-800 transition-colors"
      >
        {label}
        <span className={`text-[10px] ${active ? "text-[#e8174a]" : "text-gray-300"}`} aria-hidden="true">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export default function Participants() {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<ParticipantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("");
  const initialSort = readStoredSort();
  const [sortKey, setSortKey] = useState<SortKey>(initialSort.key);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.dir);
  const [toast, setToast] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<ParticipantListItem | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<ParticipantListItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadParticipants = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/participants`, { signal });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load tasters.");
      }
      setParticipants((json.participants ?? []) as ParticipantListItem[]);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load tasters.");
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadParticipants(ac.signal);
    return () => ac.abort();
  }, [loadParticipants]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ key: sortKey, dir: sortDir }));
    } catch {
      /* ignore */
    }
  }, [sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "lastSessionAt" || key === "sessionCount" || key === "createdAt" ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = participants;
    if (genderFilter) {
      list = list.filter((p) => (p.gender ?? "").toLowerCase() === genderFilter);
    }
    if (q) {
      list = list.filter((p) => {
        const label = (p.testerLabel ?? `P-${p.id}`).toLowerCase();
        const gender = (p.gender ?? "").toLowerCase();
        const age = p.age != null ? String(p.age) : "";
        const lastFood = (p.lastFoodName ?? "").toLowerCase();
        return (
          label.includes(q) ||
          gender.includes(q) ||
          age.includes(q) ||
          lastFood.includes(q)
        );
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "label": {
          const la = (a.testerLabel ?? `P-${a.id}`).toLowerCase();
          const lb = (b.testerLabel ?? `P-${b.id}`).toLowerCase();
          cmp = la.localeCompare(lb);
          break;
        }
        case "age":
          cmp = (a.age ?? -1) - (b.age ?? -1);
          break;
        case "gender":
          cmp = (a.gender ?? "").localeCompare(b.gender ?? "", undefined, { sensitivity: "base" });
          break;
        case "sessionCount":
          cmp = (a.sessionCount ?? 0) - (b.sessionCount ?? 0);
          break;
        case "lastSessionAt": {
          const ta = a.lastSessionAt ? new Date(a.lastSessionAt).getTime() : 0;
          const tb = b.lastSessionAt ? new Date(b.lastSessionAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "createdAt": {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
      }
      return cmp * dir;
    });
  }, [participants, search, genderFilter, sortKey, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setFormMode("create");
  };

  const openEdit = (p: ParticipantListItem) => {
    setEditing(p);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const handleFormSubmit = async (values: ParticipantFormValues) => {
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

    const gender = values.gender || null;
    const dietaryRestrictions = values.dietaryRestrictions.trim() || null;
    setFormSaving(true);
    setFormError(null);

    try {
      if (formMode === "create") {
        const res = await apiFetch(`/api/participants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testerLabel: label,
            age,
            gender,
            dietaryRestrictions,
            createOnly: true,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to add taster.");
        }
        setToast("Taster added");
      } else if (formMode === "edit" && editing) {
        const res = await apiFetch(`/api/participants/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testerLabel: label, age, gender, dietaryRestrictions }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update taster.");
        }
        setToast("Taster updated");
      }

      setFormMode(null);
      setEditing(null);
      await loadParticipants();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save taster.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/participants/${deleting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to delete taster.");
      }
      setDeleting(null);
      setToast("Taster deleted");
      await loadParticipants();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete taster.");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <PageHeader variant="expanded">
      {toast ? (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold">
          {toast}
        </div>
      ) : null}

      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <PageTitle
            title="Tasters"
            subtitle="Manage tasting profiles and open their session history."
            hideBack
          />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by label, age, or gender…"
                  className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                />
                <select
                  value={genderFilter}
                  onChange={(e) => setGenderFilter(e.target.value as GenderFilter)}
                  className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                  aria-label="Filter by gender"
                >
                  <option value="">All genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap"
              >
                Add taster
              </button>
            </div>

            {loading ? (
              <div className="text-center text-gray-500 text-sm py-10">Loading tasters…</div>
            ) : error ? (
              <div className="text-center text-red-600 text-sm py-10">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                {participants.length === 0
                  ? "No tasters yet. Add one here, or create them when starting a session in Setup."
                  : "No tasters match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1040px] w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50">
                      <SortHeader label="Label" column="label" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-8" />
                      <SortHeader label="Age" column="age" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-16" />
                      <SortHeader label="Gender" column="gender" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24" />
                      <SortHeader label="Created" column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-28" />
                      <SortHeader label="Sessions" column="sessionCount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-20" />
                      <SortHeader label="Last Session" column="lastSessionAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-28" />
                      <th className="px-4 py-3 font-semibold w-14">Last Tasted Food</th>
                      <th className="px-4 py-3 font-semibold w-[1%] whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <ParticipantRow
                        key={p.id}
                        participant={p}
                        onOpen={() => navigate(`/participants/${p.id}`)}
                        onEdit={() => openEdit(p)}
                        onDelete={() => {
                          setDeleteError(null);
                          setDeleting(p);
                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {formMode ? (
        <ParticipantFormModal
          mode={formMode}
          initial={
            formMode === "edit" && editing
              ? {
                  testerLabel: editing.testerLabel,
                  age: editing.age,
                  gender: editing.gender,
                  dietaryRestrictions: editing.dietaryRestrictions ?? null,
                }
              : null
          }
          saving={formSaving}
          error={formError}
          onClose={closeForm}
          onSubmit={(values) => void handleFormSubmit(values)}
        />
      ) : null}

      {deleting ? (
        <ParticipantDeleteDialog
          label={deleting.testerLabel ?? `P-${deleting.id}`}
          deleting={deletePending}
          error={deleteError}
          onClose={() => {
            if (deletePending) return;
            setDeleting(null);
            setDeleteError(null);
          }}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </PageHeader>
  );
}
