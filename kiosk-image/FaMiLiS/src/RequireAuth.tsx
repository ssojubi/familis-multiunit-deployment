import { Navigate, Outlet, type NavigateFunction } from "react-router-dom";

export const FAMILIS_USER_KEY = "familis.user";
export const FAMILIS_CURRENT_SESSION_KEY = "familis.currentSession";

/** Clears client session and navigates to login. Call from every "Log out" control. */
export function performLogout(navigate: NavigateFunction) {
  try {
    localStorage.removeItem(FAMILIS_USER_KEY);
    localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
  navigate("/", { replace: true });
}

export function hasStoredUser(): boolean {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return false;
    const u = JSON.parse(raw) as { id?: unknown };
    return u != null && (typeof u.id === "number" || typeof u.id === "string");
  } catch {
    return false;
  }
}

/** Parent route: renders child routes only when a user session exists in localStorage. */
export default function RequireAuth() {
  if (!hasStoredUser()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
