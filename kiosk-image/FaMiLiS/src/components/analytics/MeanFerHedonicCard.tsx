import { confidenceToTier, confidenceTooltip } from "../../lib/confidence";
import { hedonicToTierClasses } from "../../lib/ratingLabels";
import { InfoTip } from "../InfoTip";

type MeanFerHedonicCardProps = {
  score: number | null;
  title?: string;
  emptyLabel?: string;
  /** 0–1 FER confidence. */
  confidence?: number | null;
  /** When false, omit the progress bar (still shows % text if confidence is set). */
  showConfidenceBar?: boolean;
};

export function MeanFerHedonicCard({
  score,
  title = "Mean Hedonic Scale",
  emptyLabel = "No frame data yet",
  confidence = null,
  showConfidenceBar = true,
}: MeanFerHedonicCardProps) {
  const hasScore = score != null && Number.isFinite(score);
  const display = hasScore ? score.toFixed(1) : "—";
  const scoreClass = hasScore ? hedonicToTierClasses(score) : "text-gray-400";
  const showConfidence = confidence != null && Number.isFinite(confidence);
  const confPct = showConfidence ? Math.round(confidence * 100) : null;
  const tier = showConfidence ? confidenceToTier(confidence) : null;

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

      {!hasScore ? (
        <p className="text-xs text-gray-400 mt-2">{emptyLabel}</p>
      ) : null}

      {showConfidence && confPct != null && tier ? (
        <div className="mt-3 w-full max-w-[350px]">
          <p className="text-sm text-gray-800" title={confidenceTooltip(confidence!)}>
            <span className={`font-bold ${tier.textClass}`}>{confPct}%</span>
            <span className="text-gray-600"> Mean FER Confidence Level</span>
          </p>
          {showConfidenceBar ? (
            <div className="mt-3 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${tier.colorClass}`}
                style={{ width: `${confPct}%` }}
                aria-label={`Confidence ${confPct}%`}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
