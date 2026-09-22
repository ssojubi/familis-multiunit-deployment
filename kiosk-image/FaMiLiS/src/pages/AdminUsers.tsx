import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader, PageTitle } from "../components/PageHeader";
import {
  UserDeactivateDialog,
  UserFormModal,
  UserPasswordModal,
  UserRoleDialog,
  UserRow,
  type UserFormValues,
  type UserListItem,
} from "../components/users";
import { apiFetch } from "../lib/api";
import { roleLabel } from "../lib/roleLabels";
import { FAMILIS_USER_KEY } from "../RequireAuth";

const SORT_STORAGE_KEY = "familis.adminUsers.sort";

type SortKey = "username" | "email" | "role" | "createdAt" | "isActive";
type SortDir = "asc" | "desc";
type RoleFilter = "" | UserListItem["role"];

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "staff", label: "Operator" },
  { value: "tester", label: "Taster account" },
];

const ROLE_SORT_ORDER: Record<UserListItem["role"], number> = {
  admin: 0,
  staff: 1,
  tester: 2,
};

function getStoredUserId(): number | null {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { id?: unknown };
    const id = u?.id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
    if (typeof id === "string") {
      const n = Number.parseInt(id, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

function readStoredSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return { key: "username", dir: "asc" };
    const parsed = JSON.parse(raw) as { key?: string; dir?: string };
    const key = (
      ["username", "email", "role", "createdAt", "isActive"] as SortKey[]
    ).includes(parsed.key as SortKey)
      ? (parsed.key as SortKey)
      : "username";
    const dir = parsed.dir === "desc" ? "desc" : "asc";
    return { key, dir };
  } catch {
    return { key: "username", dir: "asc" };
  }
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className="px-4 py-3 font-semibold">
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

export default function AdminUsers() {
  const selfId = getStoredUserId();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("");
  const initialSort = readStoredSort();
  const [sortKey, setSortKey] = useState<SortKey>(initialSort.key);
  const [sortDir, setSortDir] = useState<SortDir>(initialSort.dir);
  const [toast, setToast] = useState<string | null>(null);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [roleTarget, setRoleTarget] = useState<UserListItem | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  const [passwordTarget, setPasswordTarget] = useState<UserListItem | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [activeTarget, setActiveTarget] = useState<UserListItem | null>(null);
  const [activePending, setActivePending] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/users`, { signal });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to load users.");
      }
      setUsers((json.users ?? []) as UserListItem[]);
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setError(err?.message || "Failed to load users.");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void loadUsers(ac.signal);
    return () => ac.abort();
  }, [loadUsers]);

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
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users;
    if (roleFilter) {
      list = list.filter((u) => u.role === roleFilter);
    }
    if (q) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          roleLabel(u.role).toLowerCase().includes(q) ||
          (u.role === "tester" && "taster account".includes(q)) ||
          (u.role === "staff" && "operator".includes(q))
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "username":
          cmp = a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
          break;
        case "email":
          cmp = a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
          break;
        case "role":
          cmp = ROLE_SORT_ORDER[a.role] - ROLE_SORT_ORDER[b.role];
          break;
        case "createdAt": {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = ta - tb;
          break;
        }
        case "isActive":
          cmp = Number(a.isActive) - Number(b.isActive);
          break;
      }
      return cmp * dir;
    });
  }, [users, search, roleFilter, sortKey, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setFormError(null);
    setFormMode("create");
  };

  const openEdit = (u: UserListItem) => {
    setEditing(u);
    setFormError(null);
    setFormMode("edit");
  };

  const closeForm = () => {
    if (formSaving) return;
    setFormMode(null);
    setEditing(null);
    setFormError(null);
  };

  const handleFormSubmit = async (values: UserFormValues) => {
    const username = values.username.trim();
    const email = values.email.trim();
    if (!username || !email) {
      setFormError("Username and email are required.");
      return;
    }
    if (formMode === "create" && values.password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    setFormSaving(true);
    setFormError(null);
    try {
      if (formMode === "create") {
        const res = await apiFetch(`/api/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            email,
            password: values.password,
            role: values.role,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to add user.");
        }
        setToast("User added");
      } else if (formMode === "edit" && editing) {
        const res = await apiFetch(`/api/users/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to update user.");
        }
        setToast("User updated");
      }

      setFormMode(null);
      setEditing(null);
      await loadUsers();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save user.");
    } finally {
      setFormSaving(false);
    }
  };

  const handleRoleSubmit = async (role: UserListItem["role"]) => {
    if (!roleTarget) return;
    setRoleSaving(true);
    setRoleError(null);
    try {
      const res = await apiFetch(`/api/users/${roleTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update role.");
      }
      setRoleTarget(null);
      setToast("Role updated");
      await loadUsers();
    } catch (err: any) {
      setRoleError(err?.message || "Failed to update role.");
    } finally {
      setRoleSaving(false);
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (!passwordTarget) return;
    setPasswordSaving(true);
    setPasswordError(null);
    try {
      const res = await apiFetch(`/api/users/${passwordTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update password.");
      }
      setPasswordTarget(null);
      setToast("Password updated");
      await loadUsers();
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleActiveConfirm = async () => {
    if (!activeTarget) return;
    setActivePending(true);
    setActiveError(null);
    try {
      const res = await apiFetch(`/api/users/${activeTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !activeTarget.isActive }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to update account status.");
      }
      setActiveTarget(null);
      setToast(activeTarget.isActive ? "User deactivated" : "User reactivated");
      await loadUsers();
    } catch (err: any) {
      setActiveError(err?.message || "Failed to update account status.");
    } finally {
      setActivePending(false);
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
            title="Users"
            subtitle="Manage Admin, Operator, and Taster accounts. Their details, roles and passwords can be changed here."
            hideBack
          />

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by username, email, or role…"
                  className="w-full max-w-sm border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                />
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
                  className="border border-gray-200 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30"
                  aria-label="Filter by role"
                >
                  {ROLE_FILTER_OPTIONS.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold px-4 py-2 rounded-md shadow-sm transition-colors whitespace-nowrap"
              >
                Add user
              </button>
            </div>

            {loading ? (
              <div className="text-center text-gray-500 text-sm py-10">Loading users…</div>
            ) : error ? (
              <div className="text-center text-red-600 text-sm py-10">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-10">
                {users.length === 0
                  ? "No users yet. Add an Admin, Operator, or Taster account."
                  : "No users match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left">
                  <thead>
                    <tr className="text-xs text-gray-500 bg-gray-50">
                      <SortHeader label="Username" column="username" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Email" column="email" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Role" column="role" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortHeader label="Created" column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 font-semibold">Last login</th>
                      <SortHeader label="Status" column="isActive" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u) => (
                      <UserRow
                        key={u.id}
                        user={u}
                        isSelf={selfId != null && selfId === u.id}
                        onEdit={() => openEdit(u)}
                        onChangeRole={() => {
                          setRoleError(null);
                          setRoleTarget(u);
                        }}
                        onSetPassword={() => {
                          setPasswordError(null);
                          setPasswordTarget(u);
                        }}
                        onToggleActive={() => {
                          setActiveError(null);
                          setActiveTarget(u);
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
        <UserFormModal
          mode={formMode}
          initial={
            formMode === "edit" && editing
              ? { username: editing.username, email: editing.email }
              : null
          }
          saving={formSaving}
          error={formError}
          onClose={closeForm}
          onSubmit={(values) => void handleFormSubmit(values)}
        />
      ) : null}

      {roleTarget ? (
        <UserRoleDialog
          username={roleTarget.username}
          currentRole={roleTarget.role}
          isSelf={selfId != null && selfId === roleTarget.id}
          saving={roleSaving}
          error={roleError}
          onClose={() => {
            if (roleSaving) return;
            setRoleTarget(null);
            setRoleError(null);
          }}
          onSubmit={(role) => void handleRoleSubmit(role)}
        />
      ) : null}

      {passwordTarget ? (
        <UserPasswordModal
          username={passwordTarget.username}
          saving={passwordSaving}
          error={passwordError}
          onClose={() => {
            if (passwordSaving) return;
            setPasswordTarget(null);
            setPasswordError(null);
          }}
          onSubmit={(password) => void handlePasswordSubmit(password)}
        />
      ) : null}

      {activeTarget ? (
        <UserDeactivateDialog
          username={activeTarget.username}
          deactivate={activeTarget.isActive}
          pending={activePending}
          error={activeError}
          onClose={() => {
            if (activePending) return;
            setActiveTarget(null);
            setActiveError(null);
          }}
          onConfirm={() => void handleActiveConfirm()}
        />
      ) : null}
    </PageHeader>
  );
}
