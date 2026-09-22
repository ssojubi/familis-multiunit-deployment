import { useEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossaryTerm } from "../lib/glossary";

interface InfoTipProps {
  term: GlossaryTerm;
  className?: string;
  /** Popover alignment relative to the trigger button. Defaults to "center". */
  align?: "left" | "center" | "right";
}

/**
 * Small "?" trigger with a click/tap popover explaining a glossary term.
 * Keyboard accessible: focusable button, Escape closes and returns focus,
 * and an outside click/tap dismisses it (no hover dependency, so it works on touch).
 */
export function InfoTip({ term, className = "", align = "center" }: InfoTipProps) {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  if (!entry) return null;

  const alignClasses =
    align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  return (
    // normal-case/tracking-normal/not-italic/font-normal guard against ancestor labels (e.g. an
    // ALL-CAPS, letter-spaced, bold/semibold section title) leaking their text-transform,
    // letter-spacing, font-style, or font-weight into the trigger or popover, since all of
    // these are inherited CSS properties. The title/body below re-assert their own explicit
    // weight so the popover's type hierarchy stays consistent regardless of where it's used.
    <span
      ref={wrapperRef}
      className={`relative inline-flex normal-case tracking-normal not-italic font-normal ${className}`}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`What does "${entry.title}" mean?`}
        className={`w-4 h-4 inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none normal-case tracking-normal transition-colors focus:outline-none focus:ring-2 focus:ring-[#e8174a]/40 ${
          open ? "bg-[#e8174a] text-white" : "bg-gray-200 text-gray-600 hover:bg-[#e8174a] hover:text-white"
        }`}
      >
        ?
      </button>
      {open ? (
        <div
          role="tooltip"
          className={`absolute z-50 top-full mt-1.5 w-56 sm:w-64 bg-white border border-gray-200 rounded-md shadow-lg p-3 text-left normal-case tracking-normal not-italic font-normal ${alignClasses}`}
        >
          <p className="text-xs font-semibold text-gray-900 normal-case tracking-normal mb-1">{entry.title}</p>
          <p className="text-[11px] font-normal text-gray-600 normal-case tracking-normal leading-relaxed">
            {entry.body}
          </p>
        </div>
      ) : null}
    </span>
  );
}
