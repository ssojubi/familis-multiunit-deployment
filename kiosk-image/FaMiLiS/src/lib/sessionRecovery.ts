/** Network recovery never creates a session or replays an ambiguous frame upload. */
export type RecoverySession = {
  id: number;
  status: string;
  hasConsent?: boolean;
  invalidatedAt?: string | null;
};
export type RecoveryResult =
  | { kind: "ready"; session: RecoverySession; food?: unknown }
  | { kind: "unavailable"; message: string }
  | { kind: "blocked"; message: string };

type Request = (path: string, options: RequestInit) => Promise<Response>;

export function isConnectionPause(reason: string | null): boolean {
  return reason === "offline" || reason === "emotion-offline";
}

/** A connection interruption must never replace a deliberate or camera pause. */
export function pauseForInterruption(paused: boolean, reason: string | null): boolean {
  return !paused || isConnectionPause(reason);
}

export async function probeSessionRecovery(
  request: Request, sessionId: number, requireConsent: boolean, signal: AbortSignal,
): Promise<RecoveryResult> {
  const response = await request(`/api/sessions/${sessionId}`, { signal, cache: "no-store" });
  if ([401, 403, 404].includes(response.status)) {
    return { kind: "blocked", message: "This session is unavailable or access has expired. Recording remains paused." };
  }
  const body = await response.json();
  if (!response.ok || !body?.ok) throw new Error("Session server unavailable");
  const session = body.session as RecoverySession;
  if (session?.id !== sessionId || session.status !== "active" || session.invalidatedAt || (requireConsent && !session.hasConsent)) {
    return { kind: "blocked", message: "This session is no longer active or permitted to record. Recording remains paused." };
  }
  const healthResponse = await request("/api/emotion/health", { signal, cache: "no-store" });
  const health = await healthResponse.json();
  if (!healthResponse.ok || !health?.ok || !health?.emotion?.modelLoaded) {
    throw new Error("Processing service unavailable");
  }
  return { kind: "ready", session, food: body.food };
}

/** One bounded check at a time; stale responses cannot undo a newer disconnect. */
export function startSessionRecovery(options: {
  request: Request;
  sessionId: number;
  requireConsent: boolean;
  online: () => boolean;
  events: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  onResult: (result: RecoveryResult) => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  const { request, sessionId, requireConsent, online, events, onResult } = options;
  let stopped = false;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: AbortController | undefined;
  const unavailable: RecoveryResult = {
    kind: "unavailable",
    message: "Reconnecting — your session is preserved. Recording and the timer are paused. Frames during this pause are not captured.",
  };
  function cancel() {
    revision++;
    clearTimeout(timer);
    abort?.abort();
  }
  async function check() {
    if (stopped) return;
    cancel();
    const current = revision;
    const controller = new AbortController();
    abort = controller;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!online()) {
        onResult(unavailable);
        return;
      }
      const deadline = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error("Connection check timed out"));
        }, options.timeoutMs ?? 5000);
      });
      const result = await Promise.race([
        probeSessionRecovery(request, sessionId, requireConsent, controller.signal), deadline,
      ]);
      if (!stopped && current === revision) onResult(result);
    } catch {
      if (!stopped && current === revision) onResult(unavailable);
    } finally {
      clearTimeout(timeout);
      if (!stopped && current === revision) timer = setTimeout(() => { void check(); }, options.intervalMs ?? 3000);
    }
  }
  const reconnect = () => { void check(); };
  const offline = () => {
    if (stopped) return;
    cancel();
    onResult(unavailable);
    timer = setTimeout(reconnect, options.intervalMs ?? 3000);
  };
  events.addEventListener("online", reconnect);
  events.addEventListener("offline", offline);
  void check();
  return {
    check: reconnect,
    stop() {
      stopped = true;
      cancel();
      events.removeEventListener("online", reconnect);
      events.removeEventListener("offline", offline);
    },
  };
}
