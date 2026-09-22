export function ProfileCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-500 font-semibold mb-1">{label}</p>
      <p className="text-base font-bold text-gray-900 truncate">{value}</p>
    </div>
  );
}
