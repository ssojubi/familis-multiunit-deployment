export type TesterContext = {
  roomId: string;
  foodId: string;
  kioskId: string;
};

const TESTER_CONTEXT_KEY = "familis.testerContext";
const KIOSK_ID_KEY = "kiosk_id";

function readStoredContext(): Partial<TesterContext> {
  try {
    const raw = sessionStorage.getItem(TESTER_CONTEXT_KEY);
    return raw ? (JSON.parse(raw) as Partial<TesterContext>) : {};
  } catch {
    return {};
  }
}

export function captureTesterContext(search: string): TesterContext {
  const params = new URLSearchParams(search);
  const stored = readStoredContext();
  const context = {
    roomId: (params.get("room") || stored.roomId || "").trim(),
    foodId: (params.get("foodId") || stored.foodId || "").trim(),
    kioskId: (params.get("kiosk_id") || stored.kioskId || "").trim(),
  };

  try {
    sessionStorage.setItem(TESTER_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // The URL remains the fallback when session storage is unavailable.
  }

  return context;
}

export function testerContextSearch(context: TesterContext): string {
  const params = new URLSearchParams();
  if (context.roomId) params.set("room", context.roomId);
  if (context.foodId) params.set("foodId", context.foodId);
  if (context.kioskId) params.set("kiosk_id", context.kioskId);
  return params.toString();
}

export function getOrCreateBrowserKioskId(explicitKioskId = ""): string {
  const requestedId = explicitKioskId.trim();
  if (requestedId) {
    localStorage.setItem(KIOSK_ID_KEY, requestedId);
    return requestedId;
  }

  const storedId = localStorage.getItem(KIOSK_ID_KEY)?.trim();
  if (storedId && storedId !== "kiosk-01") {
    return storedId;
  }

  const randomPart =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const generatedId = `kiosk-${randomPart}`;
  localStorage.setItem(KIOSK_ID_KEY, generatedId);
  return generatedId;
}
