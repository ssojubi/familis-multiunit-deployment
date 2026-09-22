import { InfoTip } from "../InfoTip";
import type { GlossaryTerm } from "../../lib/glossary";

export function MetricCard({
  icon,
  iconBg,
  title,
  value,
  infoTerm,
}: {
  icon: string;
  iconBg: string;
  title: string;
  value: string;
  infoTerm?: GlossaryTerm;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <span
        className={`text-2xl w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0 ${iconBg}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-semibold flex items-center gap-1.5">
          {title}
          {infoTerm ? <InfoTip term={infoTerm} align="left" /> : null}
        </p>
        <p className="text-2xl leading-none text-gray-900 font-bold mt-1">{value}</p>
      </div>
    </div>
  );
}
