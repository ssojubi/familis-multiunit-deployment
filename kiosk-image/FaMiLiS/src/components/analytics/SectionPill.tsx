import type { ReactNode } from "react";
import { InfoTip } from "../InfoTip";
import type { GlossaryTerm } from "../../lib/glossary";

export function SectionPill({
  children,
  infoTerm,
}: {
  children: ReactNode;
  infoTerm?: GlossaryTerm;
}) {
  return (
    <span className="inline-flex items-center gap-2 mb-3">
      <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#e8174a] text-white text-xs font-bold uppercase tracking-wider">
        {children}
      </span>
      {infoTerm ? <InfoTip term={infoTerm} align="left" /> : null}
    </span>
  );
}
