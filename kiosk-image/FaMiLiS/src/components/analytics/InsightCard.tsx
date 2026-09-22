import { InfoTip } from "../InfoTip";
import type { GlossaryTerm } from "../../lib/glossary";

type DefaultInsightCardProps = {
  variant?: "default";
  title: string;
  value: string;
  sub?: string;
  infoTerm?: GlossaryTerm;
};

type MetricInsightCardProps = {
  variant: "metric";
  title: string;
  value: string;
  sub?: string;
  infoTerm?: GlossaryTerm;
};

type NarrativeInsightCardProps = {
  variant: "narrative";
  text: string;
};

export type InsightCardProps =
  | DefaultInsightCardProps
  | MetricInsightCardProps
  | NarrativeInsightCardProps;

const sessionCardShell =
  "bg-white rounded-2xl border border-gray-100 py-8 px-4 min-h-[140px] flex flex-col items-center justify-center text-center";

export function InsightCard(props: InsightCardProps) {
  if (props.variant === "narrative") {
    return (
      <div className={sessionCardShell}>
        <p className="text-sm text-gray-900 leading-snug">{props.text}</p>
      </div>
    );
  }

  if (props.variant === "metric") {
    return (
      <div className={sessionCardShell}>
        <p className="text-sm font-bold text-gray-900 mb-2 inline-flex items-center justify-center gap-1.5">
          {props.title}
          {props.infoTerm ? <InfoTip term={props.infoTerm} /> : null}
        </p>
        <p className="text-4xl font-light text-gray-900 leading-none mb-2">{props.value}</p>
        {props.sub ? (
          <p className="text-xs text-gray-500 leading-snug">{props.sub}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 shadow-sm">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-semibold mb-1 inline-flex items-center gap-1.5">
          {props.title}
          {props.infoTerm ? <InfoTip term={props.infoTerm} align="left" /> : null}
        </p>
        <p className="text-2xl font-extrabold text-gray-900 leading-none mb-1">{props.value}</p>
        {props.sub ? (
          <p className="text-xs text-gray-500 leading-snug">{props.sub}</p>
        ) : null}
      </div>
    </div>
  );
}
