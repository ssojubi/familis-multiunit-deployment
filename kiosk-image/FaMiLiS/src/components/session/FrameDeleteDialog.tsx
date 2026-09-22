type FrameDeleteDialogProps = {
  frameLogId: number;
  timestampLabel: string;
  pending?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function FrameDeleteDialog({
  frameLogId,
  timestampLabel,
  pending = false,
  error = null,
  onClose,
  onConfirm,
}: FrameDeleteDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="frame-delete-title"
      >
        <h2 id="frame-delete-title" className="text-gray-900 font-bold mb-2">
          Delete this frame?
        </h2>
        <p className="text-sm text-gray-600">
          Permanently removes frame <span className="font-semibold">#{frameLogId}</span>
          {timestampLabel ? (
            <>
              {" "}
              ({timestampLabel})
            </>
          ) : null}
          . The image file will also be removed. Session metrics will update.
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
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
