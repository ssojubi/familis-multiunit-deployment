import type { GlossaryTerm } from "../../lib/glossary";
import { InfoTip } from "../InfoTip";
import { clampPct } from "./utils";

export function ColoredRatingBar({
  label,
  rating,
  color,
  n,
  stdDev,
  showStatsTips = false,
  infoTerm,
}: {
  label: string;
  rating: number | null;
  color: string;
  /** Sample size backing this rating. Shown as a caption when provided. */
  n?: number;
  /** Standard deviation of the underlying survey scores. Shown alongside n when provided. */
  stdDev?: number;
  /** When true, show InfoTips next to N / σ (use on the first bar only to avoid clutter). */
  showStatsTips?: boolean;
  /** Optional glossary tip next to the attribute label. */
  infoTerm?: GlossaryTerm;
}) {
  const val = rating ?? 0;
  const pct = clampPct((val / 9) * 100);
  const showStdDev = stdDev != null && n != null && n > 1;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-700 font-medium flex items-center gap-1.5">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          {label}
          {infoTerm ? <InfoTip term={infoTerm} align="left" /> : null}
        </span>
        <span className="text-sm text-gray-900 font-semibold tabular-nums">
          {rating == null
            ? "—"
            : Number.isInteger(rating)
              ? `${Math.round(rating)}`
              : rating.toFixed(1)}{" "}
          / 9
        </span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: rating == null ? "0%" : `${pct}%`, backgroundColor: color }}
        />
      </div>
      {n != null ? (
        <p className="text-[11px] text-gray-400 mt-1 tabular-nums inline-flex items-center gap-1 flex-wrap">
          <span className="inline-flex items-center gap-1">
            N={n}
            {showStatsTips ? <InfoTip term="sampleSize" align="left" /> : null}
          </span>
          {showStdDev ? (
            <span className="inline-flex items-center gap-1">
              · σ {stdDev!.toFixed(1)}
              {showStatsTips ? <InfoTip term="stdDev" align="left" /> : null}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
