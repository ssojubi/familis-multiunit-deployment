// Pure helpers for access revocation and admin-protection rules.
// Kept free of Express/MySQL so they can be unit tested directly.

export const AUTH_TOKEN_TTL_SECONDS_DEFAULT = 12 * 60 * 60;

/** Token issue time in epoch seconds. Tokens minted before `iat` existed derive it from `exp`. */
export function tokenIssuedAt(auth, ttlSeconds = AUTH_TOKEN_TTL_SECONDS_DEFAULT) {
  const iat = Number(auth?.iat);
  if (Number.isFinite(iat) && iat > 0) return iat;
  const exp = Number(auth?.exp);
  return Number.isFinite(exp) ? exp - ttlSeconds : 0;
}

/**
 * Decide whether a signed token still grants access given the account's current
 * database row. `row.revoked_at_epoch` is UNIX_TIMESTAMP(users.access_revoked_at) or null.
 */
export function evaluateAccess(auth, row, ttlSeconds = AUTH_TOKEN_TTL_SECONDS_DEFAULT) {
  if (!row) return { allowed: false, reason: "missing" };
  if (!Number(row.is_active)) return { allowed: false, reason: "inactive" };
  const revoked = row.revoked_at_epoch == null ? null : Number(row.revoked_at_epoch);
  if (revoked != null && Number.isFinite(revoked) && tokenIssuedAt(auth, ttlSeconds) <= revoked) {
    return { allowed: false, reason: "revoked" };
  }
  return { allowed: true, reason: null };
}

/**
 * True when changing/removing `target` would leave the system with no active admin.
 * `activeAdminIds` is the list of user ids that are currently active admins.
 */
export function wouldLeaveNoAdmin(activeAdminIds, targetId) {
  const remaining = activeAdminIds.map(Number).filter((id) => id !== Number(targetId));
  return remaining.length === 0;
}

export function generateTemporaryPassword(randomBytes) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
