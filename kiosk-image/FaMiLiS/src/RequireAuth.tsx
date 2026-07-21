import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { hasStoredUser } from "./auth";

/** Parent route: renders child routes only when a user session exists in localStorage. */
export default function RequireAuth() {
  const location = useLocation();
  if (!hasStoredUser()) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/" replace state={{ returnTo }} />;
  }
  return <Outlet />;
}
