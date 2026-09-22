import type { ReactNode } from "react";
import { BrandMark } from "./shell/BrandMark";

interface BrandTopBarProps {
  /** Optional right-side actions (e.g. Log Out). */
  actions?: ReactNode;
  onLogoClick?: () => void;
  logoAriaLabel?: string;
}

/**
 * Full-width brand header for pages without a sidebar (e.g. Consent).
 * Matches the sidebar brand strip tokens in PageHeader.
 */
export function BrandTopBar({
  actions,
  onLogoClick,
  logoAriaLabel = "FaMiLIS",
}: BrandTopBarProps) {
  const brandClass = "flex items-center gap-3 min-w-0";

  return (
    <header className="bg-[#e8174a] text-white sticky top-0 z-30 shrink-0">
      <div className="h-[72px] sm:h-[80px] px-4 sm:px-6 flex items-center justify-between gap-3">
        {onLogoClick ? (
          <button
            type="button"
            onClick={onLogoClick}
            aria-label={logoAriaLabel}
            className={`${brandClass} text-left`}
          >
            <BrandMark collapsed={false} />
          </button>
        ) : (
          <div className={brandClass}>
            <BrandMark collapsed={false} />
          </div>
        )}
        {actions ? <div className="shrink-0 flex items-center">{actions}</div> : null}
      </div>
    </header>
  );
}
