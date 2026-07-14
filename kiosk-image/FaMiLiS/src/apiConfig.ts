/** Shared URL helpers: match the page protocol and prefer the web proxy. */

function getPageProtocol(): "http:" | "https:" {
  return window.location.protocol === "https:" ? "https:" : "http:";
}

function getEnv(name: string): string | undefined {
  const meta = import.meta as unknown as { env?: Record<string, string | undefined> };
  return meta.env?.[name];
}

function shouldUseWebProxy(): boolean {
  return window.location.port === "5173" || window.location.port === "";
}

function getCurrentPortSuffix(): string {
  const port = window.location.port;
  if (!port || port === "443" || port === "80") {
    return "";
  }
  return `:${port}`;
}

export function getApiBase(): string {
  return shouldUseWebProxy() ? "" : `${getPageProtocol()}//${window.location.hostname}:8080`;
}

export function getSocketUrl(): string {
  return shouldUseWebProxy() ? "" : `${getPageProtocol()}//${window.location.hostname}:8080`;
}

export function getWsBase(): string {
  if (shouldUseWebProxy()) {
    const proto = getPageProtocol() === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  const api = getApiBase();
  return api.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export function getCentralApiBase(): string {
  if (shouldUseWebProxy()) {
    return "/central-api";
  }

  return (
    getEnv("VITE_CENTRAL_API_URL") ||
    `${getPageProtocol()}//${window.location.hostname}:8000`
  ).replace(/\/$/, "");
}

export function getCentralWsBase(): string {
  if (shouldUseWebProxy()) {
    const proto = getPageProtocol() === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/central-ws`;
  }

  return getCentralApiBase().replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

export function isKioskPublicPath(pathname: string): boolean {
  return pathname.startsWith("/kiosk");
}

export function kioskRoute(path: string): string {
  return `/kiosk${path.startsWith("/") ? path : `/${path}`}`;
}

/** Docker bridge IPs (e.g. 172.18.x) are not reachable from kiosk devices on the LAN. */
export function isUnreachableShareIP(ip: string): boolean {
  return /^(127\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

/** Pick the IP/hostname kiosk devices should use to reach this host. */
export function resolveShareHostIP(serverIP?: string | null): string {
  const hostname = window.location.hostname;
  if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
    return hostname;
  }
  if (serverIP && !isUnreachableShareIP(serverIP)) {
    return serverIP;
  }
  return hostname || serverIP || "localhost";
}

export function buildShareLink(
  hostIP: string,
  roomId: string,
  kioskId: string,
): string {
  const protocol = getPageProtocol();
  return `${protocol}//${hostIP}${getCurrentPortSuffix()}/tester-consent?kiosk_id=${encodeURIComponent(kioskId)}&room=${roomId}`;
}

export function toApiUrl(url: string | null, apiBase = getApiBase()): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${apiBase}${url}`;
}
