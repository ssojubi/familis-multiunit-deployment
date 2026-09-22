import {
  Navigate,
  Outlet,
  type NavigateFunction,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";

export const FAMILIS_USER_KEY = "familis.user";
export const FAMILIS_CURRENT_SESSION_KEY = "familis.currentSession";
export const FAMILIS_TOKEN_KEY = "familis.token";

export type UserRole = "admin" | "staff" | "tester";

/** Removes only the booth session pointer (keeps auth for handoff flows). */
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Clears auth and navigates to login.
 * Pass `{ clearSession: true }` to also wipe the booth session pointer
 * (use only for full participant reset, e.g. tester auto-logout after survey).
 * Default keeps `familis.currentSession` so admin → tester handoff works
 * across the normal logout flow.
 */
export function performLogout(
  navigate: NavigateFunction,
  options?: { clearSession?: boolean },
) {
  void fetch("/api/logout", {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
  try {
    localStorage.removeItem(FAMILIS_USER_KEY);
    localStorage.removeItem(FAMILIS_TOKEN_KEY);
    if (options?.clearSession === true) {
      localStorage.removeItem(FAMILIS_CURRENT_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
  navigate("/", { replace: true });
}

/** Reads the stored user role, or null when no valid user is present. */
export function getStoredRole(): UserRole | null {
  try {
    const raw = localStorage.getItem(FAMILIS_USER_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { role?: unknown };
    if (u?.role === "admin" || u?.role === "staff" || u?.role === "tester") {
      return u.role;
    }
    return null;
  } catch {
    return null;
  }
}

export function isAdminRole(role: UserRole | null): boolean {
  return role === "admin" || role === "staff";
}

/** True when an active session is stored locally (booth handoff to a tester). */
export function hasActiveSession(): boolean {
  return getStoredSessionId() != null;
}

export function sessionConsentKey(sessionId: number): string {
  return `familis.sessionConsent.${sessionId}`;
}

export function markSessionConsented(sessionId: number): void {
  try {
    localStorage.setItem(sessionConsentKey(sessionId), "1");
  } catch {
    /* ignore */
  }
}

export function hasSessionConsent(sessionId: number): boolean {
  try {
    return localStorage.getItem(sessionConsentKey(sessionId)) === "1";
  } catch {
    return false;
  }
}

export function getStoredSessionId(): number | null {
  try {
    const raw = localStorage.getItem(FAMILIS_CURRENT_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as { id?: unknown };
    const id = s?.id;
    if (typeof id === "number" && Number.isFinite(id)) return id;
    if (typeof id === "string") {
      const n = Number.parseInt(id, 10);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

/** True when a booth session exists locally and consent was recorded for it. */
export function hasConsentedSession(): boolean {
  const sessionId = getStoredSessionId();
  if (sessionId == null) return false;
  return hasSessionConsent(sessionId);
}

/** Tester landing route: session only after consent, otherwise consent gate. */
export function testerLandingPath(): string {
  if (!hasActiveSession()) return "/consent";
  return hasConsentedSession() ? "/session" : "/consent";
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

/**
 * Parent route: verifies the HttpOnly cookie used by the HTTPS deployment and
 * refreshes the small client-side role cache used by nested route guards.
 */
export default function RequireAuth() {
  const location = useLocation();
  const [state, setState] = useState<"checking" | "authenticated" | "anonymous">("checking");

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user) {
          setState("anonymous");
          return;
        }
        localStorage.setItem(FAMILIS_USER_KEY, JSON.stringify(data.user));
        setState("authenticated");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setState("anonymous");
      });
    return () => controller.abort();
  }, []);

  if (state === "checking") {
    return <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-gray-600">Checking session...</div>;
  }
  if (state === "anonymous") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/" replace state={{ returnTo }} />;
  }
  return <Outlet />;
}
