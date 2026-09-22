import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export type QuickPickFood = {
  id: number;
  name: string;
  category: string;
};

type FoodQuickPickerProps = {
  excludeFoodId?: number | null;
  starting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (food: QuickPickFood) => void;
};

/**
 * Inline modal for the Survey continuation card's "different product" path.
 * Participant is locked (no demographics editing here) — only the food changes.
 */
export function FoodQuickPicker({
  excludeFoodId = null,
  starting,
  error,
  onClose,
  onConfirm,
}: FoodQuickPickerProps) {
  const [foods, setFoods] = useState<QuickPickFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await apiFetch(`/api/foods`, { signal: ac.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load foods.");
        }
        const list = (json.foods ?? []) as any[];
        setFoods(
          list.map((f) => ({
            id: Number(f.id),
            name: String(f.name),
            category: String(f.category),
          }))
        );
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setLoadError(err?.message || "Failed to load foods.");
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !starting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [starting, onClose]);

  const selectableFoods = foods;
  const selected = selectableFoods.find((f) => f.id === selectedId) ?? null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={() => {
        if (!starting) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-quick-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="food-quick-picker-title" className="text-gray-900 font-bold mb-1">
          Try a different product
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Pick the next food for this participant. Their demographics stay the same.
        </p>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading ? (
            <div className="text-center text-gray-500 text-sm py-8">Loading foods…</div>
          ) : loadError ? (
            <div className="text-center text-red-600 text-sm py-8">{loadError}</div>
          ) : selectableFoods.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">No foods available.</div>
          ) : (
            <div className="space-y-1.5">
              {selectableFoods.map((food) => {
                const isSelected = food.id === selectedId;
                const isJustFinished = food.id === excludeFoodId;
                return (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => setSelectedId(food.id)}
                    disabled={starting}
                    className={`w-full text-left px-3.5 py-2.5 rounded-md border transition-colors ${
                      isSelected
                        ? "border-[#e8174a] bg-[#fde8ed]"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900">
                      {food.name}
                      {isJustFinished ? (
                        <span className="ml-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          Just tasted
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-gray-500">{food.category}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error ? <p className="text-xs text-red-600 mt-3">{error}</p> : null}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={starting}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || starting}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              selected && !starting
                ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {starting ? "Starting…" : "Start session"}
          </button>
        </div>
      </div>
    </div>
  );
}
