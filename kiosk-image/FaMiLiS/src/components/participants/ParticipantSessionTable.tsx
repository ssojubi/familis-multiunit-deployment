import { API_BASE } from "../../lib/api";
import { InfoTip } from "../InfoTip";

export type ParticipantSessionRow = {
  id: number;
  foodId: number | null;
  foodName: string | null;
  foodCategory: string | null;
  foodImageUrl: string | null;
  status: "pending" | "active" | "completed" | "cancelled";
  invalidatedAt: string | null;
  startTime: string | null;
  endTime: string | null;
  hasSurvey: boolean;
  hasConsent: boolean;
  frameCount: number;
  survey: {
    color: number | null;
    flavorAroma: number | null;
    saltSweet: number | null;
    texture: number | null;
    overall: number | null;
  } | null;
};

function toApiUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

function statusClasses(status: ParticipantSessionRow["status"]) {
  switch (status) {
    case "pending":
      return "bg-yellow-50 text-yellow-700";
    case "active":
      return "bg-green-50 text-green-700";
    case "completed":
      return "bg-gray-100 text-gray-700";
    case "cancelled":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ParticipantSessionTable({
  sessions,
  onOpenSession,
}: {
  sessions: ParticipantSessionRow[];
  onOpenSession: (sessionId: number) => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-8 text-center">
        This taster has no sessions yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[860px] w-full text-left">
        <thead>
          <tr className="text-xs text-gray-500 bg-gray-50">
            <th className="px-3 py-3 font-semibold">Food</th>
            <th className="px-3 py-3 font-semibold">Session</th>
            <th className="px-3 py-3 font-semibold">Started</th>
            <th className="px-3 py-3 font-semibold">Ended</th>
            <th className="px-3 py-3 font-semibold">Status</th>
            <th className="px-3 py-3 font-semibold">Validity</th>
            <th className="px-3 py-3 font-semibold">Survey</th>
            <th className="px-3 py-3 font-semibold">Frames</th>
            <th className="px-3 py-3 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const imgSrc = toApiUrl(session.foodImageUrl);
            const isInvalidated = session.invalidatedAt != null;
            return (
              <tr key={session.id} className="border-t border-gray-100">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={session.foodName ?? "Food"}
                        className="w-9 h-9 rounded-md border border-gray-200 object-cover flex-shrink-0"
                      />
                    ) : (
                      <span className="w-9 h-9 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm flex-shrink-0">
                        🍽️
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">
                        {session.foodName ?? "Unknown food"}
                      </p>
                      {session.foodCategory ? (
                        <p className="text-[11px] text-gray-500 truncate">{session.foodCategory}</p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-gray-700 font-semibold">S-{session.id}</td>
                <td className="px-3 py-3 text-xs text-gray-600">{formatDate(session.startTime)}</td>
                <td className="px-3 py-3 text-xs text-gray-600">{formatDate(session.endTime)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold ${statusClasses(
                      session.status
                    )}`}
                  >
                    {formatStatus(session.status)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {isInvalidated ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-700 border border-red-200">
                      Invalid
                      <InfoTip term="invalidated" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                      Valid
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-gray-700">
                  {session.hasSurvey && session.survey?.overall != null ? (
                    <span className="font-semibold">{session.survey.overall}/9 overall</span>
                  ) : (
                    <span className="text-gray-400">No survey</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-gray-600">{session.frameCount}</td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onOpenSession(session.id)}
                    className="text-xs font-semibold text-[#e8174a] hover:text-[#c9143f] transition-colors whitespace-nowrap"
                  >
                    View →
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
