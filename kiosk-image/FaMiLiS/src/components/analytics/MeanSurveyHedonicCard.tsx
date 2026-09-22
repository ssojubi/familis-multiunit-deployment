import { hedonicLabel, hedonicToTierClasses } from "../../lib/ratingLabels";
import { InfoTip } from "../InfoTip";

type MeanSurveyHedonicCardProps = {
  score: number | null;
  title?: string;
  emptyLabel?: string;
  showHedonicLabel?: boolean;
};

export function MeanSurveyHedonicCard({
  score,
  title = "Overall Survey Results",
  emptyLabel = "No survey data yet",
  showHedonicLabel = false,
}: MeanSurveyHedonicCardProps) {
  const hasScore = score != null && Number.isFinite(score);
  const display = hasScore ? score.toFixed(1) : "—";
  const scoreClass = hasScore ? hedonicToTierClasses(score) : "text-gray-400";

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 min-h-[180px] h-full flex flex-col items-center justify-center text-center">
      <p className="text-sm font-bold text-gray-900 mb-3 inline-flex items-center justify-center gap-1.5">
        {title}
        <InfoTip term="ferVsSurvey" />
      </p>

      <div className="flex items-baseline justify-center gap-1.5">
        <span
          className={`text-[clamp(2.75rem,7vw,3.75rem)] font-extrabold leading-none tabular-nums ${scoreClass}`}
        >
          {display}
        </span>
        <span className="text-lg text-gray-400 font-medium">/ 9</span>
      </div>

      {hasScore && showHedonicLabel ? (
        <p className="text-sm text-gray-500 mt-2">{hedonicLabel(score)}</p>
      ) : null}

      {!hasScore ? (
        <p className="text-xs text-gray-400 mt-2">{emptyLabel}</p>
      ) : null}
    </div>
  );
}
