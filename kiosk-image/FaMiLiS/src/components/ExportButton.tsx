import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";
import {
  downloadFoodExport,
  downloadSessionExport,
  type ExportFormat,
  type FoodExportPayload,
  type SessionExportPayload,
} from "../lib/export";

type ExportButtonProps =
  | { kind: "food"; foodId: number }
  | { kind: "session"; sessionId: number };

/**
 * Export dropdown (CSV / XLSX) for admin/staff. Fetches the flat export JSON
 * for the given food or session and builds the spreadsheet client-side.
 * Food XLSX is the ready-made multi-sheet report; CSV is a quick Sessions dump.
 * Callers are responsible for role-gating (testers must not see this).
 */
export function ExportButton(props: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const runExport = async (format: ExportFormat) => {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      if (props.kind === "food") {
        const res = await apiFetch(`/api/foods/${props.foodId}/export?format=json`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to export.");
        downloadFoodExport(json as FoodExportPayload, format);
      } else {
        const res = await apiFetch(`/api/sessions/${props.sessionId}/export?format=json`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to export.");
        downloadSessionExport(json as SessionExportPayload, format);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export.");
    } finally {
      setLoading(false);
    }
  };

  const isFood = props.kind === "food";

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        aria-expanded={open}
        className="inline-flex items-center text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-md px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Exporting…" : isFood ? "Download report" : "Export"}
      </button>
      {open ? (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-20 overflow-hidden">
          <button
            type="button"
            onClick={() => void runExport("xlsx")}
            className="w-full text-left text-xs font-semibold px-3 py-2 text-gray-700 hover:bg-gray-50"
          >
            {isFood ? "XLSX" : "XLSX"}
          </button>
          <button
            type="button"
            onClick={() => void runExport("csv")}
            className="w-full text-left text-xs font-semibold px-3 py-2 text-gray-700 hover:bg-gray-50"
          >
            {isFood ? "CSV" : "CSV"}
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="absolute right-0 top-full mt-1 w-48 text-[11px] text-red-600 text-right">{error}</p>
      ) : null}
    </div>
  );
}
