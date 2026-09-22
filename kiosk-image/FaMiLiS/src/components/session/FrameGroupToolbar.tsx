import type { FrameGroupBy } from "./useFrameGroups";

export type FrameViewMode = "list" | "folders";

export function FrameGroupToolbar({
  viewMode,
  onViewModeChange,
  groupBy,
  onGroupByChange,
  faceOnly,
  onFaceOnlyChange,
  lowConfidenceOnly,
  onLowConfidenceOnlyChange,
}: {
  viewMode: FrameViewMode;
  onViewModeChange: (mode: FrameViewMode) => void;
  groupBy: FrameGroupBy;
  onGroupByChange: (groupBy: FrameGroupBy) => void;
  faceOnly: boolean;
  onFaceOnlyChange: (value: boolean) => void;
  lowConfidenceOnly: boolean;
  onLowConfidenceOnlyChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <div className="flex items-center rounded-md overflow-hidden border border-gray-200 flex-shrink-0">
        <button
          type="button"
          onClick={() => onViewModeChange("list")}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            viewMode === "list" ? "bg-[#e8174a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          List
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange("folders")}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
            viewMode === "folders" ? "bg-[#e8174a] text-white" : "bg-white text-gray-600 hover:bg-gray-50"
          }`}
        >
          Folders
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {viewMode === "folders" ? (
          <select
            value={groupBy}
            onChange={(e) => onGroupByChange(e.target.value as FrameGroupBy)}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white"
            aria-label="Group frames by"
          >
            <option value="time">Group by time (30s)</option>
            <option value="hedonic">Group by hedonic band</option>
            <option value="face">Group by face detected</option>
          </select>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-gray-600 font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={faceOnly}
            onChange={(e) => onFaceOnlyChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          Face only
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={lowConfidenceOnly}
            onChange={(e) => onLowConfidenceOnlyChange(e.target.checked)}
            className="rounded border-gray-300"
          />
          Low confidence (&lt;50%)
        </label>
      </div>
    </div>
  );
}
