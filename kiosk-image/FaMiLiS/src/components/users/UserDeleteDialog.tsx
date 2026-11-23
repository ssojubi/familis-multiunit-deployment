import { useState } from "react";

type UserDeleteDialogProps = {
  username: string;
  role: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function UserDeleteDialog({
  username,
  role,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}: UserDeleteDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === username;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-delete-title"
      >
        <h2 id="user-delete-title" className="text-gray-900 font-bold mb-2">
          Delete user permanently?
        </h2>
        <p className="text-sm text-gray-600">
          <span className="font-semibold">{username}</span> will be removed along with their
          {role === "tester" ? " sessions, recorded frames, emotion results, and participant record" : " account"}.
          Any signed-in device is signed out immediately. This cannot be undone.
        </p>
        <label className="block text-sm text-gray-700 mt-4 mb-1.5 font-semibold">
          Type <span className="font-mono">{username}</span> to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 bg-white"
          autoFocus
          autoComplete="off"
        />
        {error ? <p className="text-xs text-red-600 mt-2">{error}</p> : null}
        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 border border-gray-200 text-gray-700 hover:bg-gray-50 py-2 rounded-md text-sm font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending || !matches}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${
              matches && !pending
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {pending ? "Deleting…" : "Delete user"}
          </button>
        </div>
      </div>
    </div>
  );
}
