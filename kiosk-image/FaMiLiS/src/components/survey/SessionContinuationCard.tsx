import { InfoTip } from "../InfoTip";

type SessionContinuationCardProps = {
  productName: string;
  isTester: boolean;
  starting: boolean;
  actionError: string | null;
  onSameProduct: () => void;
  onDifferentProduct: () => void;
  onDone: () => void;
  onReturnToSetup?: () => void;
};

/**
 * Shown right after a survey submit, before the tester auto-logout timer
 * starts. Lets the tester (or staff) chain another session for the same
 * participant, or finish. Consent is never re-shown here — the participant
 * already consented on their first session in this chain.
 */
export function SessionContinuationCard({
  productName,
  isTester,
  starting,
  actionError,
  onSameProduct,
  onDifferentProduct,
  onDone,
  onReturnToSetup,
}: SessionContinuationCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 shadow-sm text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
        <span className="text-3xl text-green-600" aria-hidden="true">
          ✓
        </span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Thank you — session complete</h1>
      <p className="text-sm text-gray-500 mt-2">
        Product: <span className="font-semibold text-gray-700">{productName}</span>
      </p>

      <p className="text-sm text-gray-700 font-semibold mt-6 inline-flex items-center justify-center gap-1.5">
        What would you like to do next?
        <InfoTip term="sessionContinuation" />
      </p>

      {actionError ? (
        <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3 mt-4 justify-center">
        <button
          type="button"
          onClick={onSameProduct}
          disabled={starting}
          className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
            starting
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "bg-[#e8174a] hover:bg-[#c9143f] text-white shadow-sm"
          }`}
        >
          {starting ? "Starting…" : "Same product"}
        </button>
        <button
          type="button"
          onClick={onDifferentProduct}
          disabled={starting}
          className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
            starting
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "border border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Different product
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={starting}
          className={`flex-1 sm:flex-none px-5 py-2 rounded-md text-sm font-semibold transition-colors ${
            starting
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : "border border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          I'm done
        </button>
      </div>

      {!isTester && onReturnToSetup ? (
        <button
          type="button"
          onClick={onReturnToSetup}
          disabled={starting}
          className="mt-4 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          Return to Setup for next product
        </button>
      ) : null}
    </div>
  );
}
