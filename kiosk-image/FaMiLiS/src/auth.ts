import type { NavigateFunction } from "react-router-dom";
import { clearTesterContext } from "./testerContext";

export const FAMILIS_USER_KEY = "familis.user";
export const FAMILIS_CURRENT_SESSION_KEY = "familis.currentSession";

export function performLogout(navigate: NavigateFunction) {
  void fetch("/api/logout", {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
  try {
    localStorage.removeItem(FAMILIS_USER_KEY);
    localStorage.removeItem("user");
    localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
    clearTesterContext();
  } catch {
    // Ignore storage failures and continue to the login page.
  }
  navigate("/", { replace: true });
}
