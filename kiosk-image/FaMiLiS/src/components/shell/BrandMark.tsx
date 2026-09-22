import logo from "../../assets/logo.svg";

interface BrandMarkProps {
  /** When true, only the inverted logo icon is shown. */
  collapsed?: boolean;
}

/** Shared FaMiLIS brand mark used by the sidebar strip and BrandTopBar. */
export function BrandMark({ collapsed = false }: BrandMarkProps) {
  return (
    <>
      <img
        src={logo}
        alt=""
        className={`object-contain brightness-0 invert ${
          collapsed ? "w-9 h-9" : "w-10 h-10 sm:w-11 sm:h-11"
        }`}
      />
      {!collapsed ? (
        <div className="text-left min-w-0">
          <span className="text-white text-xl sm:text-2xl font-bold tracking-wide leading-none block truncate">
            FaMiLIS
          </span>
          <span className="text-[#f2c2c9] text-[12px] sm:text-[13px] font-semibold leading-tight block mt-0.5 truncate">
            Food Testing Hub
          </span>
        </div>
      ) : null}
    </>
  );
}

interface BrandStripButtonProps {
  collapsed?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}

/** Red brand strip button used at the top of sidebar shells. */
export function BrandStripButton({
  collapsed = false,
  onClick,
  ariaLabel = "FaMiLIS",
}: BrandStripButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`
        bg-[#e8174a] flex items-center shrink-0
        ${collapsed ? "justify-center h-[72px] sm:h-[80px] px-2" : "gap-3 h-[72px] sm:h-[80px] px-4 sm:px-5"}
      `}
    >
      <BrandMark collapsed={collapsed} />
    </button>
  );
}
