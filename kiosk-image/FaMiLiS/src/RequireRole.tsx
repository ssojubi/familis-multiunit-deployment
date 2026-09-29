import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "./lib/api";
import { getStoredRole, isAdminRole, testerLandingPath, type UserRole } from "./RequireAuth";

interface RequireRoleProps {
  allowed: UserRole[];
  /** When true, do not treat staff as admin. Use for /admin/users. */
  exact?: boolean;
}

/**
 * Route guard that renders child routes only for the allowed roles. By default
 * `staff` is accepted wherever `admin` is allowed. Pass `exact` to disable that
 * alias (admin-only user management). Unauthorized roles are redirected to the
 * landing page for their own role rather than being shown a dead end.
 */
export default function RequireRole({ allowed, exact = false }: RequireRoleProps) {
  const role = getStoredRole();
  if (!role) {
    return <Navigate to="/" replace />;
  }

  const permitted =
    allowed.includes(role) || (!exact && allowed.includes("admin") && role === "staff");
  if (permitted) {
    return <Outlet />;
  }

  if (isAdminRole(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  // Testers join a room before entering consent and recording.
  return <Navigate to={testerLandingPath()} replace />;
}

export function RequireTabAccess() {
  const role = getStoredRole();
  const location = useLocation();
  const [access, setAccess] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    if (!role || role === "admin") return;
    const controller = new AbortController();
    void apiFetch("/api/preferences", { signal: controller.signal }).then(response => response.json()).then(payload => {
      if (payload?.ok) setAccess(payload.preferences?.roleTabAccess || {});
      else setAccess({});
    }).catch(() => setAccess({}));
    return () => controller.abort();
  }, [role]);
  if (!role) return <Navigate to="/" replace />;
  const currentTab = location.pathname.startsWith("/participants")
    ? "participants"
    : location.pathname === "/dashboard" && new URLSearchParams(location.search).get("tab") === "stats"
      ? "stats"
      : location.pathname.startsWith("/video-monitoring")
        ? "monitor"
        : location.pathname.startsWith("/admin/users")
          ? "users"
          : location.pathname.startsWith("/admin/preferences")
            ? "preferences"
            : "food";
  if (role === "admin") return <Outlet />;
  if (!access) return <div className="min-h-screen grid place-items-center text-sm text-gray-500">Checking tab access…</div>;
  const roleTabs = access[role] || [];
  if (roleTabs.includes(currentTab)) return <Outlet />;
  const fallbackTab = roleTabs.find(tab => ["participants", "stats", "monitor", "users", "preferences"].includes(tab));
  if (fallbackTab) {
    const fallbackPath: Record<string, string> = { participants: "/participants", stats: "/dashboard?tab=stats", monitor: "/video-monitoring", users: "/admin/users", preferences: "/admin/preferences" };
    return <Navigate to={fallbackPath[fallbackTab]} replace />;
  }
  if (isAdminRole(role)) return <div className="min-h-screen grid place-items-center p-6 text-center text-sm text-gray-600">This role has no operator tabs assigned. Ask an administrator to update its access in Preferences.</div>;
  if (role === "tester") return <Navigate to={testerLandingPath()} replace />;
  return <div className="min-h-screen grid place-items-center p-6 text-center text-sm text-gray-600">This role has no tabs assigned. Ask an administrator to update its access in Preferences.</div>;
}
