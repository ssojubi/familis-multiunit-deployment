import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAccess,
  generateTemporaryPassword,
  tokenIssuedAt,
  wouldLeaveNoAdmin,
} from "../server/accessControl.js";

const TTL = 12 * 60 * 60;

test("tokenIssuedAt prefers iat and falls back to exp - ttl", () => {
  assert.equal(tokenIssuedAt({ iat: 1000, exp: 1000 + TTL }, TTL), 1000);
  assert.equal(tokenIssuedAt({ exp: 5000 + TTL }, TTL), 5000);
  assert.equal(tokenIssuedAt({}, TTL), 0);
});

test("evaluateAccess rejects missing and inactive accounts", () => {
  assert.deepEqual(evaluateAccess({ iat: 10 }, null, TTL), { allowed: false, reason: "missing" });
  assert.equal(evaluateAccess({ iat: 10 }, { is_active: 0, revoked_at_epoch: null }, TTL).reason, "inactive");
});

test("evaluateAccess revokes only tokens issued at or before the revocation time", () => {
  const row = { is_active: 1, revoked_at_epoch: 2000 };
  assert.equal(evaluateAccess({ iat: 1999 }, row, TTL).reason, "revoked");
  assert.equal(evaluateAccess({ iat: 2000 }, row, TTL).reason, "revoked");
  assert.equal(evaluateAccess({ iat: 2001 }, row, TTL).allowed, true);
  // Legacy token without iat: exp - ttl is used.
  assert.equal(evaluateAccess({ exp: 1500 + TTL }, row, TTL).reason, "revoked");
});

test("evaluateAccess allows active accounts that were never revoked", () => {
  assert.deepEqual(evaluateAccess({ iat: 1 }, { is_active: 1, revoked_at_epoch: null }, TTL), { allowed: true, reason: null });
});

test("wouldLeaveNoAdmin protects the last active admin", () => {
  assert.equal(wouldLeaveNoAdmin([7], 7), true);
  assert.equal(wouldLeaveNoAdmin([7, 8], 7), false);
  assert.equal(wouldLeaveNoAdmin(["7", "8"], 8), false);
  assert.equal(wouldLeaveNoAdmin([], 1), true);
});

test("generateTemporaryPassword uses the unambiguous alphabet and requested length", () => {
  const pw = generateTemporaryPassword((n) => Uint8Array.from({ length: n }, (_, i) => i * 7));
  assert.equal(pw.length, 12);
  assert.match(pw, /^[A-HJ-NP-Za-km-z2-9]+$/);
});
