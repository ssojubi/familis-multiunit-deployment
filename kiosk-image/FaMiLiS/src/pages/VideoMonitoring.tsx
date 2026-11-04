import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSearchParams } from "react-router-dom";
import { getApiBase, getSocketUrl } from "../apiConfig";
import { apiFetch } from "../lib/api";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { getAdminRoomContext, saveAdminRoomContext } from "../adminRoomContext";
import { WEBRTC_CONFIGURATION } from "../webrtcConfig";
import { receivePeerSignal } from "../lib/peerSignaling";

type RecordingStatus = "ready" | "recording" | "paused" | "completed";


type Role = "host" | "viewer" | null;

const SOCKET_SERVER_URL = getSocketUrl();
const API_BASE = getApiBase();

interface ServerToClientEvents {
  "room-error": (data: { error?: string }) => void;
  "viewer-connected": (viewerId: string) => void;
  "host-connected": (peerId: string) => void;
  "user-disconnected": (peerId: string) => void;
  "host-disconnected": () => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
  
  "tester-session-status": (data: {
    from?: string;
    status: RecordingStatus;
    sessionId?: number;
    foodName?: string;
    testerName?: string;
    testerId?: number;
  }) => void;
}

interface ClientToServerEvents {
  "monitor-all-rooms": () => void;
  "request-stream": (data: { to: string }) => void;
  "join-room": (roomId: string) => void;
  signal: (data: {
    room: string;
    to?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
}

type KioskConnectionState = "streaming" | "idle" | "offline";

type RemoteKiosk = {
  testerId?: number;
  peerId: string;
  label: string;
  stream: MediaStream;
  status: RecordingStatus | null;
  sessionId: number | null;
  foodName: string | null;
  connectionState: KioskConnectionState;
};

type ActiveRoom = { id: number; roomCode: string; foodId: number; foodName: string; sessionsActive: number };
type LayoutMode = "icon-grid" | "sidebar-spotlight" | "pinned-grid" | "show-all";
type StatusFilter = "all" | "streaming" | "idle" | "offline";

const MAX_PINNED = 4;

/* ──────────────────────────── SVG Icons ──────────────────────────── */

function IconGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-4 h-4"}>
      <path d="M3 3h5v5H3V3Zm0 9h5v5H3v-5Zm9-9h5v5h-5V3Zm0 9h5v5h-5v-5Z" />
    </svg>
  );
}

function IconSidebar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-4 h-4"}>
      <path d="M2 3h6v14H2V3Zm8 0h8v14h-8V3Z" />
    </svg>
  );
}

function IconPinned({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-4 h-4"}>
      <path d="M10 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6Z" />
    </svg>
  );
}

function IconShowAll({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-4 h-4"}>
      <path d="M1 4h4v4H1V4Zm6 0h4v4H7V4Zm6 0h4v4h-4V4ZM1 10h4v4H1v-4Zm6 0h4v4H7v-4Zm6 0h4v4h-4v-4Z" />
    </svg>
  );
}

function IconCamera({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-5 h-5"}>
      <path d="M4 5a2 2 0 00-2 2v6a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2H4zm12.5 1.5l-2 1.5v4l2 1.5a.5.5 0 00.5-.5V7a.5.5 0 00-.5-.5z" />
    </svg>
  );
}

function IconClose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-5 h-5"}>
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 011.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className ?? "w-4 h-4"}>
      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
    </svg>
  );
}

/* ──────────────────────────── Status Badge ──────────────────────────── */

function StatusBadge({ state }: { state: KioskConnectionState }) {
  const config = {
    streaming: { bg: "bg-green-100", text: "text-green-700", dot: "bg-green-500", label: "Streaming" },
    idle: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-400", label: "Idle" },
    offline: { bg: "bg-gray-100", text: "text-gray-500", dot: "bg-gray-400", label: "Offline" },
  }[state];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} ${state === "streaming" ? "animate-pulse" : ""}`} />
      {config.label}
    </span>
  );
}

/* ──────────────────────────── Kiosk Status Tile ──────────────────────────── */

function KioskStatusTile({
  kiosk,
  isSelected,
  isPinned,
  showVideo,
  onSelect,
  onTogglePin,
  onToggleVideo,
  layoutMode,
}: {
  kiosk: RemoteKiosk;
  isSelected: boolean;
  isPinned: boolean;
  showVideo: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onToggleVideo: () => void;
  layoutMode: LayoutMode;
}) {
  return (
    <div
      onClick={onSelect}
      className={`
        relative rounded-xl border transition-all cursor-pointer
        ${isSelected
          ? "border-[#e8174a] bg-red-50/40 shadow-md ring-1 ring-[#e8174a]/20"
          : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
        }
      `}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <IconCamera className={`w-4 h-4 shrink-0 ${kiosk.connectionState === "streaming" ? "text-green-600" : "text-gray-400"}`} />
              <span className="text-sm font-bold text-gray-900 truncate">{kiosk.label}</span>
            </div>
            <StatusBadge state={kiosk.connectionState} />
            <span className="ml-2 text-xs text-gray-600">{kiosk.status === "paused" ? "Recording paused" : kiosk.status === "recording" ? "Recording" : kiosk.status === "completed" ? "Session completed" : "Ready"}</span>
            {kiosk.foodName ? (
              <p className="text-[11px] text-gray-500 mt-1.5 truncate">
                🍽️ {kiosk.foodName}
                {kiosk.sessionId != null ? <span className="text-gray-400"> · S-{kiosk.sessionId}</span> : null}
              </p>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {layoutMode === "pinned-grid" ? (
              <button
                type="button"
                onClick={onTogglePin}
                title={isPinned ? "Unpin from grid" : "Pin to grid"}
                className={`p-1.5 rounded-md transition-colors text-xs font-bold ${
                  isPinned
                    ? "bg-[#e8174a] text-white hover:bg-[#c9143f]"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <IconPinned className="w-3.5 h-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onToggleVideo}
              title={showVideo ? "Hide video" : "Show video"}
              aria-label={`${showVideo ? "Hide" : "Show"} ${kiosk.label} video`}
              className={`p-1.5 rounded-md transition-colors text-xs font-bold ${
                showVideo
                  ? "bg-[#e8174a] text-white hover:bg-[#c9143f]"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <IconCamera className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Live Video View ──────────────────────────── */

function LiveVideoView({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>("Connecting to camera…");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let disposed = false;
    setMessage("Connecting to camera…");
    video.muted = true;
    video.srcObject = stream;
    void video.play().catch(() => {
      if (!disposed) setMessage("Playback paused by the browser. Select Play video.");
    });
    const timeout = window.setTimeout(() => {
      if (video.readyState < 2 || video.videoWidth === 0) {
        setMessage("No camera video received. Check the tester's camera and select Reconnect cameras. Wi-Fi device isolation may block the video connection.");
      }
    }, 12000);
    const ended = () => setMessage("Camera stream ended. Select Reconnect cameras.");
    const muted = () => setMessage("Waiting for camera video…");
    const tracks = stream.getVideoTracks();
    tracks.forEach((track) => {
      track.addEventListener("ended", ended);
      track.addEventListener("mute", muted);
    });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      tracks.forEach((track) => {
        track.removeEventListener("ended", ended);
        track.removeEventListener("mute", muted);
      });
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"
        onPlaying={() => setMessage(null)}
        onWaiting={() => setMessage("Waiting for camera video…")}
        onError={() => setMessage("Video playback failed. Select Reconnect cameras.")} />
      {message && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 p-4 text-center text-sm text-white">
        <p role="status">{message}</p>
        {message.includes("Play video") && <button type="button" className="underline" onClick={() => {
          void videoRef.current?.play().catch(() => setMessage("Unable to play this stream. Select Reconnect cameras."));
        }}>Play video</button>}
      </div>}
    </div>
  );
}

/* ──────────────────────────── Video Modal ──────────────────────────── */

function VideoModal({
  kiosk,
  onClose,
}: {
  kiosk: RemoteKiosk;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal content */}
      <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden w-[90vw] max-w-4xl max-h-[90vh] flex flex-col z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <IconCamera className="w-5 h-5 text-[#e8174a] shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate">{kiosk.label}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <StatusBadge state={kiosk.connectionState} />
            <span className="ml-2 text-xs text-gray-600">{kiosk.status === "paused" ? "Recording paused" : kiosk.status === "recording" ? "Recording" : kiosk.status === "completed" ? "Session completed" : "Ready"}</span>
                {kiosk.foodName ? (
                  <span className="text-[11px] text-gray-500">
                    🍽️ {kiosk.foodName}
                    {kiosk.sessionId != null ? ` · S-${kiosk.sessionId}` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>

        {/* Video */}
        <div className="aspect-video bg-black">
          <LiveVideoView stream={kiosk.stream} />
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-[11px] text-gray-500">
            Live feed from {kiosk.label}. The FER emotion analysis pipeline continues processing frames in the background regardless of this view.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Layout Switcher ──────────────────────────── */

function LayoutSwitcher({
  value,
  onChange,
}: {
  value: LayoutMode;
  onChange: (v: LayoutMode) => void;
}) {
  const modes: Array<{ key: LayoutMode; label: string; Icon: typeof IconGrid }> = [
    { key: "icon-grid", label: "Icon Grid + Modal", Icon: IconGrid },
    { key: "sidebar-spotlight", label: "Sidebar + Spotlight", Icon: IconSidebar },
    { key: "pinned-grid", label: "Pinned Grid (Max 4)", Icon: IconPinned },
    { key: "show-all", label: "Show All Streams", Icon: IconShowAll },
  ];

  return (
    <div className="inline-flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {modes.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            title={label}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all
              ${active
                ? "bg-white text-[#e8174a] shadow-sm"
                : "text-gray-600 hover:text-gray-800 hover:bg-gray-50"
              }
            `}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────── Status Filter ──────────────────────────── */

function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}) {
  const filters: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "streaming", label: "Active" },
    { key: "idle", label: "Idle" },
    { key: "offline", label: "Offline" },
  ];

  return (
    <div className="inline-flex items-center gap-1">
      {filters.map(({ key, label }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`
              px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors
              ${active
                ? "bg-[#e8174a] text-white"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }
            `}
          >
            {label} ({counts[key]})
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════════════ */

export default function VideoMonitoring() {
  // Browser sessions are discovered through signaling, not the manual kiosk registry.
  return <KioskMonitorDetail />;
}

function KioskMonitorDetail() {
  const [searchParams] = useSearchParams();

  const [{ role }] = useState<{ role: Role }>(() => {
    const storedUser =
      localStorage.getItem("familis.user") || localStorage.getItem("user");
    const user = storedUser ? JSON.parse(storedUser) : null;
    const userRole = user?.role;
    if (userRole === "admin") return { role: "viewer" };
    if (userRole === "staff" || userRole === "tester") {
      return { role: "host" };
    }
    return { role: null };
  });
  const [testerAccounts, setTesterAccounts] = useState<{ id: number; username: string }[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [deactivatingRoom, setDeactivatingRoom] = useState(false);
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(() => searchParams.get("room") || getAdminRoomContext().roomId);
  const [publicAccessUrl, setPublicAccessUrl] = useState<string>("");
  const [remoteKiosks, setRemoteKiosks] = useState<RemoteKiosk[]>([]);
  const sessionStatusByPeerRef = useRef<Map<string, { status: RecordingStatus; sessionId: number | null; foodName: string | null; testerId?: number; testerName: string | null }>>(new Map());
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(
    null,
  );
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  // Layout & UI state
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("icon-grid");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedKioskId, setSelectedKioskId] = useState<string | null>(null);
  const [modalKioskId, setModalKioskId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [visibleVideoIds, setVisibleVideoIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [foodFilter, setFoodFilter] = useState("");
  const [foodSort, setFoodSort] = useState("food-asc");

  const selectedRoom = activeRooms.find((room) => room.roomCode === roomId);
  const validFoodId = selectedRoom?.foodId ?? null;

  // ── Derived data ──

  const allKiosks: RemoteKiosk[] = [...remoteKiosks, ...testerAccounts
    .filter((account) => !remoteKiosks.some((kiosk) => kiosk.testerId === account.id))
    .map((account): RemoteKiosk => ({ peerId: `account:${account.id}`, testerId: account.id,
      label: account.username, stream: new MediaStream(), status: "ready", sessionId: null,
      foodName: null, connectionState: "idle" }))];
  const filteredKiosks = allKiosks.filter((k) => {
    if (foodFilter && k.foodName !== foodFilter) return false;
    if (statusFilter !== "all" && k.connectionState !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        k.label.toLowerCase().includes(q) ||
        k.peerId.toLowerCase().includes(q) ||
        (k.foodName?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  filteredKiosks.sort((a, b) => {
    const order = (a.foodName ?? "").localeCompare(b.foodName ?? "");
    return (foodSort === "food-desc" ? -order : order) || a.label.localeCompare(b.label);
  });
  const foodOptions = [...new Set([...activeRooms.map((room) => room.foodName), ...remoteKiosks.map((kiosk) => kiosk.foodName)].filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b));

  const statusCounts: Record<StatusFilter, number> = {
    all: allKiosks.length,
    streaming: remoteKiosks.filter((k) => k.connectionState === "streaming").length,
    idle: allKiosks.filter((k) => k.connectionState === "idle").length,
    offline: remoteKiosks.filter((k) => k.connectionState === "offline").length,
  };

  const modalKiosk = modalKioskId ? allKiosks.find((k) => k.peerId === modalKioskId) ?? null : null;
  const spotlightKiosk = selectedKioskId ? allKiosks.find((k) => k.peerId === selectedKioskId) ?? null : null;

  // ── Data fetching (unchanged) ──

  useEffect(() => {
    if (role !== "viewer") return;
    let cancelled = false;
    let timer: number;
    const refresh = async () => {
      try {
        const response = await apiFetch("/api/testing-rooms?status=active");
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load rooms.");
        if (!cancelled) {
          const rooms = (payload.rooms ?? []) as ActiveRoom[];
          setActiveRooms(rooms);
          setRoomId(current => rooms.some(room => room.roomCode === current) ? current : rooms[0]?.roomCode ?? "");
        }
        const testerResponse = await apiFetch("/api/kiosks/testers");
        const testers = await testerResponse.json();
        if (!testerResponse.ok || !testers.ok) throw new Error(testers.error || "Could not load testers.");
        if (!cancelled) setTesterAccounts(testers.testers ?? []);
      } catch (error) {
        if (!cancelled) setRoomMessage(error instanceof Error ? error.message : "Could not refresh monitoring.");
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, 5000);
      }
    };
    void refresh();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [role]);

  useEffect(() => {
    if (role === "viewer" && roomId) {
      saveAdminRoomContext(roomId, validFoodId);
    }
  }, [role, roomId, validFoodId]);

  useEffect(() => {
    async function loadPublicAccessUrl() {
      try {
        const response = await fetch(`${API_BASE}/api/public-access`);
        const payload = await response.json();
        if (response.ok && payload?.ok && payload?.enabled && payload?.url) {
          setPublicAccessUrl(String(payload.url));
        }
      } catch {
        setPublicAccessUrl("");
      }
    }

    void loadPublicAccessUrl();
  }, []);

  const copyPublicAccessUrl = () => {
    if (!publicAccessUrl) return;
    navigator.clipboard.writeText(publicAccessUrl);
    alert("Public mobile access URL copied.");
  };

  const copyRoomCodeToClipboard = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    alert("Room code copied.");
  };

  const deactivateTestingRoom = async () => {
    if (!selectedRoom || deactivatingRoom) return;
    const closingRoom = selectedRoom;
    if (!window.confirm(`Deactivate room ${closingRoom.roomCode} for ${closingRoom.foodName}? New testers will no longer be able to join this room.`)) return;
    setDeactivatingRoom(true);
    setRoomMessage(null);
    try {
      const response = await apiFetch(`/api/testing-rooms/${closingRoom.id}/complete`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Could not deactivate the room.");
      setActiveRooms((rooms) => rooms.filter((room) => room.id !== closingRoom.id));
      setRoomId((current) => current === closingRoom.roomCode ? "" : current);
      setRoomMessage(`Room deactivated: ${closingRoom.foodName}. Activate a room to start another food test.`);
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Could not deactivate the room.");
    } finally {
      setDeactivatingRoom(false);
    }
  };

  // ── WebRTC peer management ──

  const getKioskConnectionState = useCallback((pc: RTCPeerConnection, peerId: string): KioskConnectionState => {
    const state = pc.connectionState;
    if (state === "connected") {
      const sessionInfo = sessionStatusByPeerRef.current.get(peerId);
      return sessionInfo?.sessionId != null ? "streaming" : "idle";
    }
    if (state === "failed" || state === "disconnected" || state === "closed") return "offline";
    return "idle";
  }, []);

  const createPeerConnectionFor = (peerId: string): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    peerConnectionsRef.current.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && peerConnectionsRef.current.get(peerId) === pc) {
        socketRef.current.emit("signal", {
          room: roomId,
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (peerConnectionsRef.current.get(peerId) !== pc) return;
      const connState = getKioskConnectionState(pc, peerId);

      setRemoteKiosks((prev) =>
        prev.map((k) =>
          k.peerId === peerId ? { ...k, connectionState: connState } : k
        )
      );
    };

    pc.ontrack = (event) => {
      if (peerConnectionsRef.current.get(peerId) !== pc) return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteKiosks((prev) => {
        if (prev.some((k) => k.peerId === peerId)) {
          return prev.map((k) => k.peerId === peerId ? { ...k, stream } : k);
        }
        const sessionStatus = sessionStatusByPeerRef.current.get(peerId);
        return [...prev, {
          peerId,
          testerId: sessionStatusByPeerRef.current.get(peerId)?.testerId,
          stream,
          label: sessionStatusByPeerRef.current.get(peerId)?.testerName || `Tester ${peerConnectionsRef.current.size}`,
          status: sessionStatus?.status ?? null,
          sessionId: sessionStatus?.sessionId ?? null,
          foodName: sessionStatus?.foodName ?? null,
          connectionState: getKioskConnectionState(pc, peerId),
        }];

      });
    };

    return pc;
  };

  const removeKiosk = useCallback((peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    sessionStatusByPeerRef.current.delete(peerId);
    setRemoteKiosks((prev) => prev.filter((k) => k.peerId !== peerId));
    setPinnedIds((prev) => { const next = new Set(prev); next.delete(peerId); return next; });
    setVisibleVideoIds((prev) => { const next = new Set(prev); next.delete(peerId); return next; });
    if (selectedKioskId === peerId) setSelectedKioskId(null);
    if (modalKioskId === peerId) setModalKioskId(null);
  }, [modalKioskId, selectedKioskId]);

  const cleanupAllPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    sessionStatusByPeerRef.current.clear();
    setRemoteKiosks([]);
    setPinnedIds(new Set());
    setVisibleVideoIds(new Set());
    setSelectedKioskId(null);
    setModalKioskId(null);
  }, []);

  // ── Socket connection (unchanged logic) ──

  useEffect(() => {
    if (!role || (role !== "viewer" && !roomId)) return;

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      SOCKET_SERVER_URL,
      {
        reconnection: true,
        transports: ["websocket", "polling"],
        withCredentials: true,
      },
    );
    socketRef.current = socket;

    socket.on("connect", () => {

      if (role === "viewer") socket.emit("monitor-all-rooms");
      else socket.emit("join-room", roomId);
    });
    const refreshRooms = window.setInterval(() => {
      if (role === "viewer" && socket.connected) socket.emit("monitor-all-rooms");
    }, 5000);

    socket.on("disconnect", () => {
      cleanupAllPeerConnections();

    });

    socket.on("connect_error", () => {

    });

    socket.on("room-error", (data) => {

    });

    socket.on("host-connected", (peerId) => {
      if (role !== "viewer") return;
      createPeerConnectionFor(peerId);
      setRemoteKiosks((previous) => previous.some((kiosk) => kiosk.peerId === peerId) ? previous : [...previous, {
        testerId: sessionStatusByPeerRef.current.get(peerId)?.testerId,
        peerId, label: sessionStatusByPeerRef.current.get(peerId)?.testerName || `Tester ${peerConnectionsRef.current.size}`, stream: new MediaStream(),
        status: sessionStatusByPeerRef.current.get(peerId)?.status ?? null,
        sessionId: sessionStatusByPeerRef.current.get(peerId)?.sessionId ?? null,
        foodName: sessionStatusByPeerRef.current.get(peerId)?.foodName ?? null,
        connectionState: "idle",
      }]);
    });

    socket.on("signal", async (data) => {
      if (role !== "viewer") return;
      const peerId = data.from;
      if (!peerId) return;

      const pc = createPeerConnectionFor(peerId);

      try {
        await receivePeerSignal(pc, data, (answer) => {
          socket.emit("signal", { room: roomId, to: peerId, sdp: answer });
        });
      } catch (error) {
        console.warn("Video connection setup failed", error);

      }
    });

    socket.on("tester-session-status", (data) => {
      const { from, status, sessionId, foodName, testerName, testerId } = data;
      if (!from) return;

      sessionStatusByPeerRef.current.set(from, { status, sessionId: sessionId ?? null, foodName: foodName ?? null, testerId, testerName: testerName ?? null });

      setRemoteKiosks((prev) =>
        prev.map((k) =>
          k.peerId === from
            ? {
                ...k,
                testerId,
                label: testerName || k.label,
                status,
                sessionId: sessionId ?? null,
                foodName: foodName ?? null,
                connectionState: k.connectionState,

              }
            : k,
        ),
      );

    });

    socket.on("user-disconnected", (peerId) => {
      removeKiosk(peerId);

    });

    socket.on("host-disconnected", () => {

    });

    return () => {
      window.clearInterval(refreshRooms);
      socket.disconnect();
      cleanupAllPeerConnections();
    };
    // Admin monitoring spans all rooms; management selection must not disconnect feeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, role === "viewer" ? "all" : roomId]);

  // ── Layout action handlers ──

  const handleTileClick = (peerId: string) => {
    if (layoutMode === "icon-grid") {
      setModalKioskId(peerId);
    } else {
      setSelectedKioskId(peerId);
    }
  };

  const togglePin = (peerId: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) {
        next.delete(peerId);
      } else if (next.size < MAX_PINNED) {
        next.add(peerId);
      }
      return next;
    });
  };

  const toggleVideoVisibility = (peerId: string) => {
    setVisibleVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) {
        next.delete(peerId);
      } else {
        next.add(peerId);
      }
      return next;
    });
  };

  // ── Render ──

  const pinnedKiosks = filteredKiosks.filter((k) => pinnedIds.has(k.peerId));

  return (
    <PageHeader variant="expanded">
      <main className="px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Title section */}
          <div className="mb-5">
            <PageTitle title="Monitor Kiosks" subtitle="Watch connected tasters while they record. Camera frames continue through the central FER pipeline." />
            <p className="text-[12px] text-gray-500 mt-1">
              Activate a food on the dashboard, share its room code, then tasters log in, join, consent, and start recording. Their camera feed and captured frames go through the existing kiosk and FER pipeline.
            </p>
          </div>

          {/* Top controls bar */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 mb-5">
            <div className="flex flex-col gap-3">
              {/* Row 1: Status & room controls */}
              <div className="flex flex-wrap justify-between items-center gap-3">
                <p className="text-[13px] text-gray-500">
                  <span className="font-semibold text-gray-700">
                    {remoteKiosks.length} kiosk{remoteKiosks.length === 1 ? "" : "s"} connected
                  </span>
                </p>

                <div className="inline-flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Manage room:</span>
                  <select aria-label="Active food test" value={roomId} onChange={(event) => setRoomId(event.target.value)} className="max-w-[260px] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700" disabled={!activeRooms.length || deactivatingRoom}>
                    {activeRooms.length ? activeRooms.map((room) => <option key={room.id} value={room.roomCode}>{room.foodName} · {room.roomCode}</option>) : <option value="">No active food tests</option>}
                  </select>
                  <button
                    type="button"
                    onClick={copyPublicAccessUrl}
                    disabled={!publicAccessUrl}
                    className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Copy Mobile Access URL
                  </button>
                  <button
                    type="button"
                    onClick={copyRoomCodeToClipboard}
                    disabled={!roomId}
                    className="inline-flex items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Copy Room Code
                  </button>
                  {role === "viewer" ? <button type="button" onClick={() => void deactivateTestingRoom()} disabled={!selectedRoom || deactivatingRoom} className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed">
                    {deactivatingRoom ? "Deactivating…" : "Deactivate Room"}
                  </button> : null}
                </div>
              </div>

              {roomMessage ? <p role="status" className={`text-xs ${(roomMessage.startsWith("Room ready") || roomMessage.startsWith("Room deactivated")) ? "text-green-700" : "text-red-600"}`}>{roomMessage}</p> : null}
            </div>
          </section>

          {/* Layout toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <LayoutSwitcher value={layoutMode} onChange={setLayoutMode} />
            <label className="text-xs text-gray-700">Food
              <select aria-label="Filter kiosks by food" value={foodFilter} onChange={(event) => setFoodFilter(event.target.value)} className="ml-2 rounded-md border border-gray-200 px-3 py-2">
                <option value="">All foods</option>
                {foodOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <select aria-label="Sort kiosks by food" value={foodSort} onChange={(event) => setFoodSort(event.target.value)} className="rounded-md border border-gray-200 px-3 py-2 text-xs">
              <option value="food-asc">Food A–Z</option><option value="food-desc">Food Z–A</option>
            </select>

            <div className="flex items-center gap-3">
              <StatusFilterBar value={statusFilter} onChange={setStatusFilter} counts={statusCounts} />
              <div className="relative">
                <IconSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search kiosks…"
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-[#e8174a]/30 focus:border-[#e8174a]/50 w-40"
                />
              </div>
            </div>
          </div>

          {/* Main content area */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {filteredKiosks.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <IconCamera className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm font-semibold">
                  {allKiosks.length ? "No testers match these filters." : "Waiting for tasters across all active food rooms…"}
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Connected kiosks will appear here as status tiles.
                </p>
              </div>
            ) : layoutMode === "sidebar-spotlight" ? (
              /* ── Sidebar + Spotlight ── */
              <div className="flex min-h-[500px]">
                {/* Sidebar list */}
                <div className="w-[220px] sm:w-[260px] border-r border-gray-200 overflow-y-auto bg-gray-50/50">
                  <div className="p-2 space-y-1.5">
                    {filteredKiosks.map((kiosk) => (
                      <KioskStatusTile
                        key={kiosk.peerId}
                        kiosk={kiosk}
                        isSelected={selectedKioskId === kiosk.peerId}
                        isPinned={false}
                        showVideo={visibleVideoIds.has(kiosk.peerId)}
                        onSelect={() => handleTileClick(kiosk.peerId)}
                        onTogglePin={() => {}}
                        onToggleVideo={() => toggleVideoVisibility(kiosk.peerId)}
                        layoutMode={layoutMode}
                      />
                    ))}
                  </div>
                </div>

                {/* Spotlight panel */}
                <div className="flex-1 flex flex-col">
                  {spotlightKiosk ? (
                    <>
                      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-gray-50/80">
                        <IconCamera className="w-5 h-5 text-[#e8174a] shrink-0" />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 truncate">{spotlightKiosk.label}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <StatusBadge state={spotlightKiosk.connectionState} />
                            <span className="ml-2 text-xs text-gray-600">{spotlightKiosk.status === "paused" ? "Recording paused" : spotlightKiosk.status === "recording" ? "Recording" : spotlightKiosk.status === "completed" ? "Session completed" : "Ready"}</span>
                            {spotlightKiosk.foodName ? (
                              <span className="text-[11px] text-gray-500">
                                🍽️ {spotlightKiosk.foodName}
                                {spotlightKiosk.sessionId != null ? ` · S-${spotlightKiosk.sessionId}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 bg-black">
                        <LiveVideoView stream={spotlightKiosk.stream} />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-center p-8">
                      <div>
                        <IconCamera className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                        <p className="text-gray-500 text-sm font-semibold">Select a kiosk</p>
                        <p className="text-gray-400 text-xs mt-1">Click a kiosk tile on the left to view its live feed</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : layoutMode === "pinned-grid" ? (
              /* ── Pinned Grid ── */
              <div className="p-4 sm:p-5">
                {/* Pinned 2×2 grid */}
                {pinnedKiosks.length > 0 ? (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      📌 Pinned Streams ({pinnedKiosks.length}/{MAX_PINNED})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pinnedKiosks.map((kiosk) => (
                        <div key={kiosk.peerId} className="relative bg-black aspect-video rounded-xl overflow-hidden border border-gray-200 group">
                          <LiveVideoView stream={kiosk.stream} />
                          <span className="absolute top-2 left-2 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded font-semibold">
                            {kiosk.label}
                          </span>
                          <StatusBadge state={kiosk.connectionState} />
            <span className="ml-2 text-xs text-gray-600">{kiosk.status === "paused" ? "Recording paused" : kiosk.status === "recording" ? "Recording" : kiosk.status === "completed" ? "Session completed" : "Ready"}</span>
                          {kiosk.sessionId != null && (
                            <span className="absolute top-2 right-2 text-[10px] text-white bg-green-600/80 px-2 py-0.5 rounded font-semibold">
                              Recording{kiosk.foodName ? ` · ${kiosk.foodName}` : ""} · S-{kiosk.sessionId}
                            </span>
                          )}
                          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => togglePin(kiosk.peerId)}
                              className="bg-red-500/80 hover:bg-red-600 text-white text-[10px] font-semibold px-2 py-1 rounded"
                            >
                              Unpin
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-5 bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-xs text-gray-500">Pin up to {MAX_PINNED} kiosks to watch simultaneously in a 2×2 grid.</p>
                  </div>
                )}

                {/* Remaining kiosks as tiles */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  All Kiosks
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredKiosks.map((kiosk) => (
                    <KioskStatusTile
                      key={kiosk.peerId}
                      kiosk={kiosk}
                      isSelected={selectedKioskId === kiosk.peerId}
                      isPinned={pinnedIds.has(kiosk.peerId)}
                      showVideo={visibleVideoIds.has(kiosk.peerId)}
                      onSelect={() => handleTileClick(kiosk.peerId)}
                      onTogglePin={() => togglePin(kiosk.peerId)}
                      onToggleVideo={() => toggleVideoVisibility(kiosk.peerId)}
                      layoutMode={layoutMode}
                    />
                  ))}
                </div>
              </div>
            ) : layoutMode === "show-all" ? (
              /* ── Show All Streams (toggle individual) ── */
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Toggle individual kiosk streams
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleVideoIds(new Set(remoteKiosks.map((k) => k.peerId)))}
                      className="text-[11px] font-semibold text-[#e8174a] hover:underline"
                    >
                      Show All
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleVideoIds(new Set())}
                      className="text-[11px] font-semibold text-gray-500 hover:underline"
                    >
                      Hide All
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredKiosks.map((kiosk) => (
                    <KioskStatusTile
                      key={kiosk.peerId}
                      kiosk={kiosk}
                      isSelected={selectedKioskId === kiosk.peerId}
                      isPinned={false}
                      showVideo={visibleVideoIds.has(kiosk.peerId)}
                      onSelect={() => setModalKioskId(kiosk.peerId)}
                      onTogglePin={() => {}}
                      onToggleVideo={() => toggleVideoVisibility(kiosk.peerId)}
                      layoutMode={layoutMode}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* ── Default: Icon Grid + Modal ── */
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filteredKiosks.map((kiosk) => (
                    <KioskStatusTile
                      key={kiosk.peerId}
                      kiosk={kiosk}
                      isSelected={false}
                      isPinned={false}
                      showVideo={visibleVideoIds.has(kiosk.peerId)}
                      onSelect={() => handleTileClick(kiosk.peerId)}
                      onTogglePin={() => {}}
                      onToggleVideo={() => toggleVideoVisibility(kiosk.peerId)}
                      layoutMode={layoutMode}
                    />
                  ))}
                </div>
              </div>
            )}

            {visibleVideoIds.size > 0 ? (
              <div className="border-t border-gray-100 p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Live camera views ({visibleVideoIds.size})
                  </p>
                  <button
                    type="button"
                    onClick={() => setVisibleVideoIds(new Set())}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 hover:underline"
                  >
                    Hide all
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {remoteKiosks
                    .filter((kiosk) => visibleVideoIds.has(kiosk.peerId))
                    .map((kiosk) => (
                      <div key={kiosk.peerId} className="relative aspect-video overflow-hidden rounded-xl bg-black">
                        <LiveVideoView stream={kiosk.stream} />
                        <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {kiosk.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleVideoVisibility(kiosk.peerId)}
                          className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] font-semibold text-white hover:bg-black/80"
                        >
                          Hide
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </section>


          {/* Public access URL info */}
          <div className="mt-4">
            {publicAccessUrl ? (
              <div className="text-[12px] text-gray-500 bg-white border border-gray-100 rounded-lg px-4 py-3 break-all shadow-sm">
                <span className="font-semibold text-gray-700">Mobile Access URL: </span>
                <span className="text-gray-600">{publicAccessUrl}</span>
                <p className="text-[11px] text-gray-400 mt-1">
                  Testers open this address, log in, select the active food test,
                  and enter room {roomId}.
                </p>
              </div>
            ) : (
              <div className="text-[12px] text-gray-500 bg-white border border-gray-100 rounded-lg px-4 py-3 shadow-sm">
                Public mobile access is not running.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Video Modal (for icon-grid and show-all modes) */}
      {modalKiosk ? (
        <VideoModal
          kiosk={modalKiosk}
          onClose={() => setModalKioskId(null)}
        />
      ) : null}
    </PageHeader>
  );
}
