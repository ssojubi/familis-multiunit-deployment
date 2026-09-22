import { useState } from "react";

type UserPasswordModalProps = {
  username: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

const inputClass =
  "w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white";

export function UserPasswordModal({
  username,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: UserPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm && !saving;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-password-title"
      >
        <h2 id="user-password-title" className="text-gray-900 font-bold mb-1">
          Set password
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Set a new password for <span className="font-semibold text-gray-700">{username}</span>.
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              New password <span className="text-[#e8174a]">*</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className={inputClass}
              autoFocus
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1.5 font-semibold">
              Confirm password <span className="text-[#e8174a]">*</span>
            </label>
            <input
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              className={inputClass}
              autoComplete="new-password"
            />
          </div>
        </div>

        {mismatch ? (
          <p className="text-xs text-red-600 mt-3">Passwords do not match.</p>
        ) : error ? (
          <p className="text-xs text-red-600 mt-3">{error}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-3">
            Please inform the user of the new password change.
          </p>
        )}

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
            onClick={() => onSubmit(password)}
            disabled={!canSubmit}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              canSubmit
                ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : "Update password"}
          </button>
        </div>
      </div>
    </div>
  );
}
