import { useMemo, useState } from "react";
import { hedonicColor } from "../../lib/ratingLabels";
import type { IndexedFrameLog } from "./useFrameGroups";

function formatTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString();
}

/** Paginated thumbnail grid used inside an expanded frame folder. */
export function FrameGalleryGrid({
  frames,
  pageSize = 20,
  toApiUrl,
  onPreview,
  onEdit,
  onDelete,
}: {
  frames: IndexedFrameLog[];
  pageSize?: number;
  toApiUrl: (url: string | null | undefined) => string | null;
  onPreview: (frame: IndexedFrameLog) => void;
  onEdit?: (frame: IndexedFrameLog) => void;
  onDelete?: (frame: IndexedFrameLog) => void;
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(frames.length / pageSize));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageFrames = useMemo(
    () => frames.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize),
    [frames, clampedPage, pageSize]
  );

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2">
        {pageFrames.map((f) => {
          const hedonic = f.hedonicScore == null ? null : f.hedonicScore * 8 + 1;
          return (
            <div key={f.frameLogId} className="space-y-1">
              <button
                type="button"
                onClick={() => onPreview(f)}
                className="relative group rounded-md overflow-hidden border border-gray-200 aspect-square bg-gray-100 w-full"
                title={formatTime(f.timestamp)}
              >
                {f.frameImageUrl ? (
                  <img
                    src={toApiUrl(f.frameImageUrl) ?? undefined}
                    alt={`Frame at ${formatTime(f.timestamp)}`}
                    className="w-full h-full object-cover group-hover:opacity-90"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-[10px]">
                    No image
                  </div>
                )}
                {hedonic != null ? (
                  <span
                    className="absolute bottom-0.5 right-0.5 text-[9px] font-bold px-1 rounded text-white"
                    style={{ backgroundColor: hedonicColor(hedonic) }}
                  >
                    {hedonic.toFixed(1)}
                  </span>
                ) : null}
                {f.faceDetected === false ? (
                  <span className="absolute top-0.5 left-0.5 text-[9px] font-bold px-1 rounded bg-red-500/90 text-white">
                    No face
                  </span>
                ) : null}
              </button>
              {onEdit || onDelete ? (
                <div className="flex items-center justify-center gap-2">
                  {onEdit ? (
                    <button
                      type="button"
                      onClick={() => onEdit(f)}
                      className="text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Edit
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(f)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={clampedPage === 0}
            className="px-2.5 py-1 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            ← Prev
          </button>
          <span>
            Page {clampedPage + 1} of {totalPages} · {frames.length} frames
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={clampedPage >= totalPages - 1}
            className="px-2.5 py-1 rounded-md border border-gray-200 text-xs font-semibold text-gray-700 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
