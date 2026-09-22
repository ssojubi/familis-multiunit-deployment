import { useEffect, useState } from "react";
import type { UserListItem } from "./UserRow";

export type UserFormValues = {
  username: string;
  email: string;
  password: string;
  role: UserListItem["role"];
};

type UserFormModalProps = {
  mode: "create" | "edit";
  initial?: Pick<UserListItem, "username" | "email"> | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: UserFormValues) => void;
};

const inputClass =
  "w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white";

export function UserFormModal({
  mode,
  initial = null,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: UserFormModalProps) {
  const [username, setUsername] = useState(initial?.username ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserListItem["role"]>("staff");

  useEffect(() => {
    setUsername(initial?.username ?? "");
    setEmail(initial?.email ?? "");
    setPassword("");
    setRole("staff");
  }, [initial]);

  const canSubmit =
    username.trim().length > 0 &&
    email.trim().length > 0 &&
    (mode === "edit" || password.length >= 6) &&
    !saving;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-form-title"
      >
        <h2 id="user-form-title" className="text-gray-900 font-bold mb-1">
          {mode === "create" ? "Add user" : "Edit user"}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {mode === "create"
            ? "Create an Operator or Taster account. Share the password with them directly."
            : "Update username and email. Use Set password or Change role for those fields."}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              Username <span className="text-[#e8174a]">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex"
              className={inputClass}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              Email <span className="text-[#e8174a]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. alex@lab.local"
              className={inputClass}
            />
          </div>
          {mode === "create" ? (
            <>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
                  Password <span className="text-[#e8174a]">*</span>
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={inputClass}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
                  Role <span className="text-[#e8174a]">*</span>
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserListItem["role"])}
                  className={inputClass}
                >
                  <option value="admin">Admin</option>
                  <option value="staff">Operator</option>
                  <option value="tester">Taster</option>
                </select>
              </div>
            </>
          ) : null}
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
            onClick={() => onSubmit({ username, email, password, role })}
            disabled={!canSubmit}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              canSubmit
                ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : mode === "create" ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
