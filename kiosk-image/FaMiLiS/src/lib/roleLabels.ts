import type { UserRole } from "../RequireAuth";

export function roleLabel(role: UserRole | string, opts?: { account?: boolean }): string {
  if (role === "admin") return "Admin";
  if (role === "staff") return "Operator";
  if (role === "tester") return opts?.account === false ? "Taster" : "Taster";
  return String(role);
}
