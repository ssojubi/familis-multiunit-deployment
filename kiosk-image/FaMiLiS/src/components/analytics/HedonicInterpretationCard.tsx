import type { ReactNode } from "react";

type HedonicInterpretationCardProps = {
  text: string;
};

/** Render `<strong>…</strong>` from interpretation copy; leave other text plain. */
function renderWithStrong(text: string): ReactNode[] {
  return text.split(/(<strong>.*?<\/strong>)/g).map((part, i) => {
    const match = /^<strong>(.*?)<\/strong>$/.exec(part);
    if (match) return <strong key={i}>{match[1]}</strong>;
    return part;
  });
}

export function HedonicInterpretationCard({ text }: HedonicInterpretationCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
      <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-wider">
        Interpretation
      </p>
      <p className="text-md text-gray-900 leading-relaxed">{renderWithStrong(text)}</p>
    </div>
  );
}
