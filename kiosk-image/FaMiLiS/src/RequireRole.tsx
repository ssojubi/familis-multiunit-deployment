import { Navigate, Outlet } from "react-router-dom";
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
  // Tester landing: session only after consent, otherwise the consent gate.
  return <Navigate to={testerLandingPath()} replace />;
}
