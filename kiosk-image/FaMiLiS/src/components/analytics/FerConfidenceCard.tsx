import { confidenceToTier, confidenceTooltip } from "../../lib/confidence";
import { InfoTip } from "../InfoTip";

export function FerConfidenceCard({ meanConfidence }: { meanConfidence: number }) {
  const tier = confidenceToTier(meanConfidence);
  const pct = Math.round(meanConfidence * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 md:p-6 lg:px-10 lg:py-8 shadow-sm min-h-[160px] lg:min-h-[200px] h-full flex flex-col justify-center">
      <p className="text-s md:text-sm text-black-500 font-bold flex items-center gap-1.5">
        Mean FER Confidence Score
        <InfoTip term="confidenceScore" align="left" />
      </p>
      <div className="flex items-end gap-2 mt-2 md:mt-3">
        <p className="text-[clamp(2.5rem,6vw,4rem)] leading-none font-bold text-gray-900">{pct}%</p>
        <span
          className={`mb-1 text-xs md:text-sm font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full ${tier.bgClass} ${tier.textClass}`}
          title={confidenceTooltip(meanConfidence)}
        >
          {tier.label}
        </span>
      </div>
      <div className="mt-3 md:mt-4 h-2 md:h-3 lg:h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${tier.colorClass}`}
          style={{ width: `${pct}%` }}
          aria-label={`Confidence ${pct}%`}
        />
      </div>
    </div>
  );
}
