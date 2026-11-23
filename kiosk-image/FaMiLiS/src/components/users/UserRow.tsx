import { roleLabel } from "../../lib/roleLabels";

export type UserListItem = {
  id: number;
  username: string;
  email: string;
  contactNumber?: string | null;
  gcashNumber?: string | null;
  role: string;
  createdAt: string | null;
  lastLogin: string | null;
  isActive: boolean;
  kioskEnabled?: boolean;
  cameraEnabled?: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

export function UserRow({
  user,
  isSelf,
  onEdit,
  onChangeRole,
  onResetAccess,
  onToggleActive,
  onDelete,
}: {
  user: UserListItem;
  isSelf?: boolean;
  onEdit: () => void;
  onChangeRole: () => void;
  onResetAccess: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm font-semibold text-gray-900">
        {user.username}
        {isSelf ? (
          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            you
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{user.email}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{user.role === "tester" ? user.contactNumber || "—" : "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{user.role === "tester" ? user.gcashNumber || "—" : "—"}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{roleLabel(user.role)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(user.createdAt)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(user.lastLogin)}</td>
      <td className="px-4 py-3 text-sm">
        {user.isActive ? (
          <span className="text-green-700 font-semibold">Active</span>
        ) : (
          <span className="text-gray-400 font-semibold">Inactive</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 w-[13rem] ml-auto">
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8174a]/40 rounded-sm"
          >
            Edit user
          </button>
          <button
            type="button"
            onClick={onChangeRole}
            disabled={isSelf}
            title={isSelf ? "You cannot change your own role" : undefined}
            className="disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8174a]/40 rounded-sm"
          >
            Change role
          </button>
          <button
            type="button"
            onClick={onResetAccess}
            className="text-sm font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8174a]/40 rounded-sm"
          >
            Reset access
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={isSelf && user.isActive}
            className={`text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e8174a]/40 rounded-sm ${
              isSelf && user.isActive
                ? "text-gray-300 cursor-not-allowed"
                : user.isActive
                  ? "text-red-600 hover:text-red-700"
                  : "text-green-700 hover:text-green-800"
            }`}
          >
            {user.isActive ? "Deactivate" : "Reactivate"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isSelf}
            title={isSelf ? "You cannot delete your own account" : undefined}
            className={`text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 rounded-sm ${
              isSelf ? "text-gray-300 cursor-not-allowed" : "text-red-700 hover:text-red-800"
            }`}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
