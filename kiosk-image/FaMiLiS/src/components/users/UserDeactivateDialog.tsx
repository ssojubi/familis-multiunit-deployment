type UserDeactivateDialogProps = {
  username: string;
  deactivate: boolean;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function UserDeactivateDialog({
  username,
  deactivate,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}: UserDeactivateDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-deactivate-title"
      >
        <h2 id="user-deactivate-title" className="text-gray-900 font-bold mb-2">
          {deactivate ? "Deactivate user?" : "Reactivate user?"}
        </h2>
        <p className="text-sm text-gray-600">
          {deactivate ? (
            <>
              <span className="font-semibold">{username}</span> will not be able to log in until
              reactivated.
            </>
          ) : (
            <>
              <span className="font-semibold">{username}</span> will be able to log in again.
            </>
          )}
        </p>
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
            disabled={pending}
            className={`flex-1 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60 ${
              deactivate
                ? "bg-red-600 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {pending
              ? deactivate
                ? "Deactivating…"
                : "Reactivating…"
              : deactivate
                ? "Deactivate"
                : "Reactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}
