import { useState } from "react";
import type { FrameGroup, IndexedFrameLog } from "./useFrameGroups";
import { FrameGalleryGrid } from "./FrameGalleryGrid";

/** Folder-style accordion of grouped frames, expandable into a paginated thumbnail grid. */
export function FrameFolderAccordion({
  groups,
  toApiUrl,
  onPreview,
  onEdit,
  onDelete,
}: {
  groups: FrameGroup[];
  toApiUrl: (url: string | null | undefined) => string | null;
  onPreview: (frame: IndexedFrameLog) => void;
  onEdit?: (frame: IndexedFrameLog) => void;
  onDelete?: (frame: IndexedFrameLog) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(groups[0]?.key ?? null);

  if (groups.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-8 text-center bg-gray-50 rounded-lg border border-gray-100">
        No frames match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => {
        const isOpen = openKey === group.key;
        const thumbFrames = group.frames.slice(0, 4);
        return (
          <div key={group.key} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : group.key)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 flex-shrink-0" aria-hidden="true">
                  {isOpen ? "▾" : "▸"}
                </span>
                <div className="text-left min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{group.label}</p>
                  <p className="text-xs text-gray-500">{group.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center -space-x-2 flex-shrink-0">
                {thumbFrames.map((f) =>
                  f.frameImageUrl ? (
                    <img
                      key={f.frameLogId}
                      src={toApiUrl(f.frameImageUrl) ?? undefined}
                      alt=""
                      className="w-8 h-8 rounded-md border-2 border-white object-cover"
                    />
                  ) : (
                    <div key={f.frameLogId} className="w-8 h-8 rounded-md border-2 border-white bg-gray-100" />
                  )
                )}
              </div>
            </button>
            {isOpen ? (
              <div className="border-t border-gray-100 p-4">
                <FrameGalleryGrid
                  frames={group.frames}
                  toApiUrl={toApiUrl}
                  onPreview={onPreview}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
