import { apiFetch } from "./api";
import { FAMILIS_CURRENT_SESSION_KEY, markSessionConsented } from "../RequireAuth";

export type ContinuationSession = {
  id: number;
  userId: number;
  participantId: number | null;
  foodId: number;
  status: "active";
  startTime: string;
};

/**
 * Starts a follow-up session for a participant who already completed their
 * first (consented) session in this chain. Persists the booth session pointer
 * and marks the new session as consented locally so `/session` never bounces
 * to `/consent` again for the same participant — consent is a first-session
 * gate only.
 */
export async function startContinuationSession(params: {
  userId: number;
  foodId: number;
  participantId: number | null;
}): Promise<ContinuationSession> {
  const res = await apiFetch(`/api/sessions/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json?.session) {
    throw new Error(json?.error || "Failed to start the next session.");
  }

  const session = json.session as ContinuationSession;

  localStorage.setItem(
    FAMILIS_CURRENT_SESSION_KEY,
    JSON.stringify({
      id: session.id,
      userId: session.userId,
      participantId: session.participantId,
      foodId: session.foodId,
      status: session.status,
      startTime: session.startTime,
    })
  );

  markSessionConsented(session.id);

  return session;
}
