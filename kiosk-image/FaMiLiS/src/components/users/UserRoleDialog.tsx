import { useState } from "react";
import type { UserListItem } from "./UserRow";

type UserRoleDialogProps = {
  username: string;
  currentRole: UserListItem["role"];
  isSelf?: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (role: UserListItem["role"]) => void;
};

const inputClass =
  "w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white";

export function UserRoleDialog({
  username,
  currentRole,
  isSelf = false,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: UserRoleDialogProps) {
  const [role, setRole] = useState<UserListItem["role"]>(currentRole);
  const canSubmit = role !== currentRole && !saving && !(isSelf && role !== "admin");

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-role-title"
      >
        <h2 id="user-role-title" className="text-gray-900 font-bold mb-1">
          Change role
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Update the role for <span className="font-semibold text-gray-700">{username}</span>.
        </p>

        {isSelf ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 mb-3">
            You cannot change your own role.
          </p>
        ) : null}

        <div>
          <label className="block text-sm text-gray-700 mb-1.5 font-semibold">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserListItem["role"])}
            disabled={isSelf || saving}
            className={inputClass}
          >
            <option value="admin">Admin</option>
            <option value="staff">Operator</option>
            <option value="tester">Taster</option>
          </select>
        </div>

        {error ? <p className="text-xs text-red-600 mt-3">{error}</p> : null}

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(role)}
            disabled={!canSubmit}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              canSubmit
                ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
