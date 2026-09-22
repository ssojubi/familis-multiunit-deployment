import { useEffect, useState } from "react";

export const SIDEBAR_COLLAPSED_KEY = "familis.sidebarCollapsed";

export type ShellVariant = "expanded" | "collapsed";

/** `null` means no saved preference yet. */
export function readSidebarCollapsedPreference(): boolean | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (raw === "1" || raw === "true") return true;
    if (raw === "0" || raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeSidebarCollapsedPreference(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Shared collapse state for admin and minimal shells.
 * Narrow viewports are always collapsed; preference is only toggled on desktop.
 */
export function useSidebarCollapse(variant: ShellVariant = "expanded") {
  const [isNarrow, setIsNarrow] = useState(false);
  const [savedCollapsed, setSavedCollapsed] = useState<boolean | null>(() =>
    readSidebarCollapsedPreference()
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const preferenceCollapsed = savedCollapsed !== null ? savedCollapsed : variant === "collapsed";
  const collapsed = isNarrow || preferenceCollapsed;
  const canToggle = !isNarrow;

  function toggle() {
    if (!canToggle) return;
    const next = !preferenceCollapsed;
    setSavedCollapsed(next);
    writeSidebarCollapsedPreference(next);
  }

  return { collapsed, canToggle, toggle };
}
