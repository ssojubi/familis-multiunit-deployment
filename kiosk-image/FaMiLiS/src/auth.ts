import type { NavigateFunction } from "react-router-dom";

export const FAMILIS_USER_KEY = "familis.user";
export const FAMILIS_CURRENT_SESSION_KEY = "familis.currentSession";

export function performLogout(navigate: NavigateFunction) {
  try {
    localStorage.removeItem(FAMILIS_USER_KEY);
    localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
  } catch {
    // Ignore storage failures and continue to the login page.
  }
  navigate("/", { replace: true });
}

export function hasStoredUser(): boolean {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return false;
    const user = JSON.parse(raw) as { id?: unknown };
    return (
      user != null &&
      (typeof user.id === "number" || typeof user.id === "string")
    );
  } catch {
    return false;
  }
}
