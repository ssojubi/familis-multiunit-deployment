/** Shared URL helpers — match the page protocol and prefer Vite proxy on :5173. */

export function getApiBase(): string {
  if (window.location.port === "5173") {
    return "";
  }
  return `${window.location.protocol}//${window.location.hostname}:8080`;
}

export function getSocketUrl(): string {
  if (window.location.port === "5173") {
    return "";
  }
  return `${window.location.protocol}//${window.location.hostname}:8080`;
}

export function getWsBase(): string {
  if (window.location.port === "5173") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  const api = getApiBase();
  return api.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
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
  const protocol = window.location.protocol;
  return `${protocol}//${hostIP}:5173/kiosk/setup?kiosk_id=${encodeURIComponent(kioskId)}&room=${roomId}`;
}

export function toApiUrl(url: string | null, apiBase = getApiBase()): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${apiBase}${url}`;
}
