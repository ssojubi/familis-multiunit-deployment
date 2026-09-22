export type ParticipantListItem = {
  id: number;
  testerLabel: string | null;
  age: number | null;
  gender: string | null;
  dietaryRestrictions?: string | null;
  createdAt: string | null;
  sessionCount?: number;
  lastSessionAt?: string | null;
  lastFoodName?: string | null;
  foodsTastedCount?: number;
};

function formatGender(gender: string | null) {
  if (!gender) return "-";
  return gender.charAt(0).toUpperCase() + gender.slice(1);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export function ParticipantRow({
  participant,
  onOpen,
  onEdit,
  onDelete,
}: {
  participant: ParticipantListItem;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sessionCount = participant.sessionCount ?? 0;
  const lastFoodName = participant.lastFoodName?.trim() || null;

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-2.5">
        <button
          type="button"
          onClick={onOpen}
          className="text-sm font-semibold text-gray-900 hover:text-[#e8174a] transition-colors"
        >
          {participant.testerLabel ?? `P-${participant.id}`}
        </button>
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap w-16">
        {participant.age ?? "-"}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap w-24">
        {formatGender(participant.gender)}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap w-28">
        {formatDate(participant.createdAt)}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap w-20">
        {sessionCount}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap w-28">
        {participant.lastSessionAt ? formatDate(participant.lastSessionAt) : "—"}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-600 whitespace-nowrap max-w-[10rem]">
        <span className="block truncate" title={lastFoodName ?? undefined}>
          {lastFoodName ?? "-"}
        </span>
      </td>
      <td className="px-4 py-2.5 w-[1%] whitespace-nowrap">
        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onOpen}
            className="text-sm font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors whitespace-nowrap"
          >
            View
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-sm font-semibold text-red-600 hover:text-red-700 transition-colors whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
