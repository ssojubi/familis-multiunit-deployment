import { useEffect, useId, useRef, useState } from "react";

type SessionStatus = "pending" | "active" | "completed" | "cancelled";

export type SessionOption = {
  id: number;
  status: SessionStatus;
  startTime: string | null;
};

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

  const triggerLabel =
    otherSelected.length === 0
      ? `Sessions (${sessions.length})`
      : `S-${currentSessionId} · ${selectedIds.length} selected`;

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
    onSelectedIdsChange(sessions.map((s) => s.id));
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
          className="absolute left-0 top-full mt-1 z-20 w-72 bg-white border border-gray-200 rounded-lg shadow-lg py-2 max-h-80 overflow-y-auto"
        >
          <div className="flex items-center justify-between px-3 pb-2 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-700">Food sessions</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-[11px] font-semibold text-[#e8174a] hover:text-[#c9143f]"
              >
                Select all
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

          {sessions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No sessions for this product.</p>
          ) : (
            <ul className="py-1">
              {sessions.map((s) => {
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
                          <span className="text-xs font-semibold text-gray-900">S-{s.id}</span>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusClasses(
                              s.status
                            )}`}
                          >
                            {formatStatus(s.status)}
                          </span>
                          {isCurrent ? (
                            <span className="text-[10px] font-semibold text-[#e8174a]">Viewing</span>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{formatShortDate(s.startTime)}</p>
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
