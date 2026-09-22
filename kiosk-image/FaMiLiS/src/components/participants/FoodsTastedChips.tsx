export type TastedFood = {
  foodId: number;
  foodName: string;
  foodCategory: string | null;
};

/**
 * Deduplicated chips of every distinct food a participant has tasted across
 * all of their sessions ("snacks" = distinct foods, not distinct sessions).
 */
export function FoodsTastedChips({ foods }: { foods: TastedFood[] }) {
  if (foods.length === 0) {
    return <p className="text-sm text-gray-500">No foods tasted yet.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {foods.map((food) => (
        <span
          key={food.foodId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#fde8ed] border border-[#e8174a]/20 text-xs font-semibold text-[#c9143f]"
        >
          {food.foodName}
          {food.foodCategory ? (
            <span className="text-[#c9143f]/60 font-medium">· {food.foodCategory}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
