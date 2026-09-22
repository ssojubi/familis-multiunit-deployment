export type FoodCardData = {
  id: number;
  name: string;
  category: string;
  imageUrl: string | null;
  createdAt: string | null;
  sessionsTotal: number;
  sessionsActive: number;
  avgDurationMin: number | null;
};

type FoodCardProps = {
  food: FoodCardData;
  imageSrc: string | null;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onImageClick: () => void;
  onDelete: () => void;
  onStartSession: () => void;
  onSessionStats: () => void;
  sessionStatsLoading?: boolean;
  formatDate: (iso: string | null) => string;
};

export function FoodCard({
  food,
  imageSrc,
  isSelected,
  onSelect,
  onEdit,
  onImageClick,
  onDelete,
  onStartSession,
  onSessionStats,
  sessionStatsLoading = false,
  formatDate,
}: FoodCardProps) {
  const durationLabel =
    food.avgDurationMin == null ? "—" : `${Math.round(food.avgDurationMin)} minutes`;
  const sessionStatsDisabled = food.sessionsTotal === 0 || sessionStatsLoading;

  return (
    <article
      className={`bg-white rounded-[10px] border shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md ${
        isSelected ? "border-[#e8174a] ring-2 ring-[#e8174a]/30" : "border-gray-100"
      }`}
    >
      <div className="relative w-full aspect-[3/2] bg-gray-100 overflow-hidden group">
        <button
          type="button"
          onClick={onImageClick}
          className="absolute inset-0 w-full h-full"
          aria-label={`Edit image for ${food.name}`}
        >
          {imageSrc ? (
            <img src={imageSrc} alt={food.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center border-b border-dashed border-gray-200 bg-gray-50 text-gray-400">
              <span className="text-3xl mb-1" aria-hidden="true">
                🍽️
              </span>
              <span className="text-xs font-medium">No image</span>
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center pointer-events-none">
            <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded bg-black/50">
              Click to edit image
            </span>
          </div>
        </button>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
          {food.sessionsActive > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100">
              Active
            </span>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            title="Delete"
            aria-label={`Delete ${food.name}`}
            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-black/50 text-white hover:bg-[#e8174a] transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onSelect}
        className="px-4 pt-4 pb-3 text-center flex-1 w-full hover:bg-gray-50/80 transition-colors"
        aria-label={`Select ${food.name}`}
      >
        <div className="flex items-center justify-center gap-1.5">
          <h3 className="text-lg font-bold text-gray-900 leading-tight">{food.name}</h3>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            title="Edit food"
            className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors p-0.5 rounded"
            aria-label={`Edit ${food.name}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-1">{food.category}</p>
        <div className="mt-2 space-y-0.5 text-sm text-gray-600">
          <p className="font-bold">Latest Session Details</p>     
          <p>Duration: {durationLabel}</p>
          <p>Created: {formatDate(food.createdAt)}</p>
        </div>

        <div className="mt-3 border border-gray-200 rounded-[10px] px-4 py-2 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-[11px] text-gray-400 font-medium">Sessions</p>
            <p className="text-lg font-bold text-gray-900">{food.sessionsTotal}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" aria-hidden="true" />
          <div className="text-center flex-1">
            <p className="text-[11px] text-gray-400 font-medium">Active</p>
            <p className="text-lg font-bold text-gray-900">{food.sessionsActive}</p>
          </div>
        </div>
      </button>

      <div className="border-t border-gray-200 px-4 py-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onStartSession}
          className="flex-1 bg-[#e8174a] hover:bg-[#c9143f] text-white text-sm font-semibold py-2 rounded-[10px] transition-colors"
        >
          Start Session
        </button>
        <button
          type="button"
          onClick={onSessionStats}
          disabled={sessionStatsDisabled}
          className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-900 text-sm font-semibold py-2 rounded-[10px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          {sessionStatsLoading ? "Loading…" : "Session Stats"}
        </button>
      </div>
    </article>
  );
}
