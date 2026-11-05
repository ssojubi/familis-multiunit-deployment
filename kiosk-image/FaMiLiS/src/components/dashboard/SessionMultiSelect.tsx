import { useEffect, useId, useMemo, useRef, useState } from "react";

type SessionStatus = "pending" | "active" | "completed" | "cancelled";
type DisplayStatus = SessionStatus | "incomplete";

export type SessionOption = {
  id: number;
  displayNumber: number;
  testerLabel: string | null;
  status: SessionStatus;
  completionStatus?: DisplayStatus;
  startTime: string | null;
};

function formatStatus(status: DisplayStatus) {
  if (status === "pending") return "Incomplete";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusClasses(status: DisplayStatus) {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700";
    case "active":
      return "bg-green-50 text-green-700";
    case "completed":
      return "bg-gray-100 text-gray-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    case "incomplete":
      return "bg-amber-50 text-amber-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

type SessionMultiSelectProps = {
  sessions: SessionOption[];
  currentSessionId: number;
  selectedIds: number[];
  loading?: boolean;
  onSelectedIdsChange: (ids: number[]) => void;
  onNavigateToSession: (sessionId: number) => void;
};

export function SessionMultiSelect({
  sessions,
  currentSessionId,
  selectedIds,
  loading = false,
  onSelectedIdsChange,
  onNavigateToSession,
}: SessionMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "incomplete" | "active" | "completed" | "cancelled">("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const selectedSet = new Set(selectedIds);
  const otherSelected = selectedIds.filter((id) => id !== currentSessionId);
  const currentSession = sessions.find((session) => session.id === currentSessionId);
  const filteredSessions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const visibleStatus = session.completionStatus === "incomplete" || session.status === "pending"
        ? "incomplete"
        : session.completionStatus ?? session.status;
      if (statusFilter !== "all" && visibleStatus !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return String(session.testerLabel || "").toLowerCase().includes(normalizedQuery)
        || `s-${session.displayNumber ?? session.id}`.includes(normalizedQuery)
        || String(session.displayNumber ?? session.id) === normalizedQuery;
    });
  }, [sessions, query, statusFilter]);

  const triggerLabel =
    otherSelected.length === 0
      ? `Sessions (${sessions.length})`
      : `S-${currentSession?.displayNumber ?? currentSessionId} · ${selectedIds.length} selected`;

  const toggleSession = (sessionId: number) => {
    if (sessionId === currentSessionId) return;

    const isChecked = selectedSet.has(sessionId);
    let next: number[];

    if (isChecked) {
      next = selectedIds.filter((id) => id !== sessionId);
      if (!next.includes(currentSessionId)) next = [currentSessionId, ...next];
    } else {
      next = [...selectedIds, sessionId];
      const others = next.filter((id) => id !== currentSessionId);
      if (others.length === 1) {
        onNavigateToSession(others[0]!);
        setOpen(false);
        return;
      }
    }

    onSelectedIdsChange(next);
  };

  const selectAll = () => {
    onSelectedIdsChange(filteredSessions.map((s) => s.id));
  };

  const clearSelection = () => {
    onSelectedIdsChange([currentSessionId]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={loading || sessions.length === 0}
        className="text-sm border border-gray-200 rounded-md px-3 py-2 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 min-w-[140px] justify-between"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label="Select sessions for this food product"
      >
        <span className="truncate">{loading ? "Loading…" : triggerLabel}</span>
        <span aria-hidden="true" className="text-gray-400 text-xs">
          ▼
        </span>
      </button>

      {open && !loading ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 top-full mt-1 z-20 w-80 bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-[28rem] overflow-y-auto"
        >
          <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Find a tester session</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-semibold text-[#e8174a] hover:text-[#c9143f]"
              >
                Select shown
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] font-semibold text-gray-500 hover:text-gray-800"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="px-3 py-2 space-y-2 border-b border-gray-100">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tester or S-#"
              className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#e8174a]/20 focus:border-[#e8174a]"
              aria-label="Search sessions by tester or session number"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-2 bg-white"
              aria-label="Filter food sessions by status"
            >
              <option value="all">All statuses ({sessions.length})</option>
              <option value="incomplete">Incomplete</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <p className="text-[11px] text-gray-500">Showing {filteredSessions.length} of {sessions.length}</p>
          </div>

          {filteredSessions.length === 0 ? (
            <p className="px-3 py-3 text-xs text-gray-500">No sessions match this search and status.</p>
          ) : (
            <ul className="py-1">
              {filteredSessions.map((s) => {
                const isCurrent = s.id === currentSessionId;
                const isChecked = selectedSet.has(s.id);
                return (
                  <li key={s.id}>
                    <div
                      className={`flex items-center gap-2 px-3 py-2 hover:bg-gray-50 ${
                        isCurrent ? "bg-red-50/50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        id={`session-opt-${s.id}`}
                        checked={isChecked}
                        disabled={isCurrent}
                        onChange={() => toggleSession(s.id)}
                        className="rounded border-gray-300 text-[#e8174a] focus:ring-[#e8174a]"
                        aria-label={`Select session S-${s.id}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onNavigateToSession(s.id);
                          setOpen(false);
                        }}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-900">S-{s.displayNumber ?? s.id}</span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusClasses(
                              s.completionStatus ?? s.status
                            )}`}
                          >
                            {formatStatus(s.completionStatus === "incomplete" || s.status === "pending" ? "incomplete" : (s.completionStatus ?? s.status))}
                          </span>
                          {isCurrent ? (
                            <span className="text-[10px] font-semibold text-[#e8174a]">Viewing</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {s.testerLabel || "Unknown tester"} · {formatShortDate(s.startTime)}
                        </p>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
