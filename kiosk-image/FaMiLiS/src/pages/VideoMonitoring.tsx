import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useSearchParams } from "react-router-dom";
import { getApiBase, getSocketUrl, toApiUrl } from "../apiConfig";
import { apiFetch } from "../lib/api";
import { PageHeader, PageTitle } from "../components/PageHeader";
import { getAdminRoomContext, saveAdminRoomContext } from "../adminRoomContext";
import { WEBRTC_CONFIGURATION } from "../webrtcConfig";

/* ───────────────────────── Shared types ───────────────────────── */

type Role = "host" | "viewer" | null;

const SOCKET_SERVER_URL = getSocketUrl();
const API_BASE = getApiBase();

interface ServerToClientEvents {
  "room-error": (data: { error?: string }) => void;
  "viewer-connected": (viewerId: string) => void;
  "user-disconnected": (peerId: string) => void;
  "host-disconnected": () => void;
  signal: (data: {
    from?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => void;
  
  "tester-session-status": (data: {
    from?: string;
    status: "recording" | "completed";
    sessionId?: number;
    foodName?: string;
  }) => void;
}

interface ClientToServerEvents {
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
  peerId: string;
  stream: MediaStream;
  label: string;
  sessionId: number | null;
  foodName: string | null;
  connectionState: KioskConnectionState;
};

type ActiveRoom = { id: number; roomCode: string; foodId: number; foodName: string; sessionsActive: number };
type MonitorFood = { id: number; name: string };

<<<<<<< Updated upstream
/** Registered kiosk record from the database. */
type RegisteredKiosk = {
  id: number;
  name: string;
  location: string | null;
  imageUrl: string | null;
  createdAt: string | null;
};

/* ═══════════════════════════════════════════════════════════════
   Root component — switches between Overview and Detail views
   ═══════════════════════════════════════════════════════════════ */
=======
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
      {/* Inline video if toggled on in show-all mode */}
      {showVideo && layoutMode === "show-all" ? (
        <div className="aspect-video rounded-t-xl overflow-hidden bg-black">
          <LiveVideoView stream={kiosk.stream} />
        </div>
      ) : null}

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <IconCamera className={`w-4 h-4 shrink-0 ${kiosk.connectionState === "streaming" ? "text-green-600" : "text-gray-400"}`} />
              <span className="text-sm font-bold text-gray-900 truncate">{kiosk.label}</span>
            </div>
            <StatusBadge state={kiosk.connectionState} />
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
            {layoutMode === "show-all" ? (
              <button
                type="button"
                onClick={onToggleVideo}
                title={showVideo ? "Hide video" : "Show video"}
                className={`p-1.5 rounded-md transition-colors text-xs font-bold ${
                  showVideo
                    ? "bg-[#e8174a] text-white hover:bg-[#c9143f]"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <IconCamera className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── Live Video View ──────────────────────────── */

function LiveVideoView({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play();
        }
      });
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />;
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
>>>>>>> Stashed changes

export default function VideoMonitoring() {
  const [selectedKioskId, setSelectedKioskId] = useState<number | null>(null);

  if (selectedKioskId !== null) {
    return (
      <KioskMonitorDetail
        kioskId={selectedKioskId}
        onBack={() => setSelectedKioskId(null)}
      />
    );
  }

  return <KioskOverviewDashboard onSelectKiosk={setSelectedKioskId} />;
}

/* ═══════════════════════════════════════════════════════════════
   VIEW 1 — Kiosk Overview Dashboard
   Lightweight grid of kiosk cards. No WebRTC / live streams.
   ═══════════════════════════════════════════════════════════════ */

function KioskOverviewDashboard({
  onSelectKiosk,
}: {
  onSelectKiosk: (kioskId: number) => void;
}) {
  const [kiosks, setKiosks] = useState<RegisteredKiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRoomCount, setActiveRoomCount] = useState(0);

  /* Fetch registered kiosks from DB */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void apiFetch("/api/kiosks")
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok || !payload?.ok) throw new Error(payload?.error || "Failed to load kiosks.");
        if (!cancelled) setKiosks(payload.kiosks ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load kiosks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* Fetch active room count for status indicator */
  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/testing-rooms?status=active")
      .then(async (res) => {
        const payload = await res.json();
        if (res.ok && payload?.ok) {
          if (!cancelled) setActiveRoomCount((payload.rooms ?? []).length);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <PageHeader variant="expanded">
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <PageTitle
              title="Monitor Kiosks"
              subtitle="Select a kiosk to view its live camera stream. Camera frames continue through the central FER pipeline."
            />
            <p className="text-[12px] text-gray-500 mt-1">
              Click a kiosk card to open its monitoring view. Live video streams are only loaded when you select a specific kiosk.
            </p>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-gray-400 shrink-0" />
              <span className="text-[13px] font-semibold text-gray-700">
                {kiosks.length} kiosk{kiosks.length === 1 ? "" : "s"} registered
              </span>
            </div>
            <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm">
              <span className={`w-2 h-2 rounded-full shrink-0 ${activeRoomCount > 0 ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
              <span className="text-[13px] font-semibold text-gray-700">
                {activeRoomCount} active room{activeRoomCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Loading / Error states */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-gray-300 border-t-[#e8174a] rounded-full animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Loading kiosks…</p>
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Kiosk grid */}
          {!loading && !error && kiosks.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <KioskEmptyIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-sm font-medium">
                No kiosks registered yet.
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Add kiosks in the Food Management &rarr; Setup section.
              </p>
            </div>
          )}

          {!loading && !error && kiosks.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {kiosks.map((kiosk) => (
                <KioskCard
                  key={kiosk.id}
                  kiosk={kiosk}
                  onClick={() => onSelectKiosk(kiosk.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </PageHeader>
  );
}

/* ─── Kiosk Card ─── */

function KioskCard({
  kiosk,
  onClick,
}: {
  kiosk: RegisteredKiosk;
  onClick: () => void;
}) {
  const resolvedImage = toApiUrl(kiosk.imageUrl);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200 text-left overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 focus:ring-offset-2"
    >
      {/* Thumbnail / Icon area */}
      <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-50 flex items-center justify-center relative overflow-hidden">
        {resolvedImage ? (
          <img
            src={resolvedImage}
            alt={kiosk.name}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <KioskPlaceholderIcon className="w-12 h-12 text-gray-300 group-hover:text-gray-400 transition-colors" />
        )}
        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 flex items-center justify-center">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 backdrop-blur-sm text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
            Open Monitor →
          </span>
        </div>
      </div>

      {/* Info area */}
      <div className="px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900 truncate group-hover:text-[#e8174a] transition-colors">
          {kiosk.name}
        </h3>
        {kiosk.location && (
          <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
            <LocationPinIcon className="w-3 h-3 text-gray-400 shrink-0" />
            {kiosk.location}
          </p>
        )}
        <div className="flex items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
            ID: {kiosk.id}
          </span>
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   VIEW 2 — Individual Kiosk Monitoring Detail
   Opens the WebRTC stream for the selected room. Reuses all
   existing Socket.IO signaling and peer connection logic.
   ═══════════════════════════════════════════════════════════════ */

function KioskMonitorDetail({
  kioskId,
  onBack,
}: {
  kioskId: number;
  onBack: () => void;
}) {
  const [searchParams] = useSearchParams();

  /* Kiosk metadata from DB */
  const [kioskInfo, setKioskInfo] = useState<RegisteredKiosk | null>(null);

  const [kioskStatus, setKioskStatus] = useState<string>("Connecting…");
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
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [foods, setFoods] = useState<MonitorFood[]>([]);
  const [newRoomFoodId, setNewRoomFoodId] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomMessage, setRoomMessage] = useState<string | null>(null);
  const [roomId, setRoomId] = useState(() => searchParams.get("room") || getAdminRoomContext().roomId);
  const [publicAccessUrl, setPublicAccessUrl] = useState<string>("");
  const [remoteKiosks, setRemoteKiosks] = useState<RemoteKiosk[]>([]);
  const sessionStatusByPeerRef = useRef<Map<string, { sessionId: number | null; foodName: string | null }>>(new Map());
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

  const selectedRoom = activeRooms.find((room) => room.roomCode === roomId);
  const validFoodId = selectedRoom?.foodId ?? null;

<<<<<<< Updated upstream
  /* Load kiosk metadata */
  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/kiosks")
      .then(async (res) => {
        const payload = await res.json();
        if (res.ok && payload?.ok) {
          const match = (payload.kiosks ?? []).find((k: RegisteredKiosk) => k.id === kioskId);
          if (!cancelled && match) setKioskInfo(match);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [kioskId]);
=======
  // ── Derived data ──

  const filteredKiosks = remoteKiosks.filter((k) => {
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

  const statusCounts: Record<StatusFilter, number> = {
    all: remoteKiosks.length,
    streaming: remoteKiosks.filter((k) => k.connectionState === "streaming").length,
    idle: remoteKiosks.filter((k) => k.connectionState === "idle").length,
    offline: remoteKiosks.filter((k) => k.connectionState === "offline").length,
  };

  const modalKiosk = modalKioskId ? remoteKiosks.find((k) => k.peerId === modalKioskId) ?? null : null;
  const spotlightKiosk = selectedKioskId ? remoteKiosks.find((k) => k.peerId === selectedKioskId) ?? null : null;

  // ── Data fetching (unchanged) ──
>>>>>>> Stashed changes

  useEffect(() => {
    if (role !== "viewer") return;
    let cancelled = false;
    void apiFetch("/api/testing-rooms?status=active")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Could not load active testing rooms.");
        const rooms = (payload.rooms ?? []) as ActiveRoom[];
        if (cancelled) return;
        setActiveRooms(rooms);
        setRoomId((current) => rooms.some((room) => room.roomCode === current) ? current : rooms[0]?.roomCode ?? "");
      })
      .catch(() => { if (!cancelled) setActiveRooms([]); });
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (role !== "viewer") return;
    let cancelled = false;
    void apiFetch("/api/foods")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Could not load foods.");
        const list = (payload.foods ?? []).map((food: { id: number; name: string }) => ({ id: Number(food.id), name: String(food.name) })) as MonitorFood[];
        if (cancelled) return;
        setFoods(list);
        setNewRoomFoodId((current) => current || String(list[0]?.id ?? ""));
      })
      .catch(() => { if (!cancelled) setFoods([]); });
    return () => { cancelled = true; };
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

  const createTestingRoom = async () => {
    if (!newRoomFoodId || creatingRoom) return;
    setCreatingRoom(true);
    setRoomMessage(null);
    try {
      const response = await apiFetch("/api/testing-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: Number(newRoomFoodId) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok || !payload.room) throw new Error(payload?.error || "Could not create the testing room.");
      const room = payload.room as ActiveRoom;
      setActiveRooms((rooms) => [room, ...rooms.filter((item) => item.id !== room.id)]);
      setRoomId(room.roomCode);
      setRoomMessage(`Room ready for ${room.foodName}. Share code ${room.roomCode} with tasters.`);
    } catch (error) {
      setRoomMessage(error instanceof Error ? error.message : "Could not create the testing room.");
    } finally {
      setCreatingRoom(false);
    }
  };

<<<<<<< Updated upstream
  const createPeerConnectionFor = useCallback((peerId: string): RTCPeerConnection => {
=======
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
>>>>>>> Stashed changes
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) return existing;

    const pc = new RTCPeerConnection(WEBRTC_CONFIGURATION);
    peerConnectionsRef.current.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && roomId) {
        socketRef.current.emit("signal", {
          room: roomId,
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const connState = getKioskConnectionState(pc, peerId);
      setKioskStatus(`Kiosk ${peerId.slice(0, 6)}: ${pc.connectionState}`);
      setRemoteKiosks((prev) =>
        prev.map((k) =>
          k.peerId === peerId ? { ...k, connectionState: connState } : k
        )
      );
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setRemoteKiosks((prev) => {
        if (prev.find((k) => k.peerId === peerId)) return prev;
        const label = `Kiosk ${prev.length + 1}`;
        const sessionStatus = sessionStatusByPeerRef.current.get(peerId);
        return [...prev, {
          peerId,
          stream,
          label,
          sessionId: sessionStatus?.sessionId ?? null,
          foodName: sessionStatus?.foodName ?? null,
          connectionState: sessionStatus?.sessionId != null ? "streaming" : "idle",
        }];
      });
    };

    return pc;
  }, [roomId]);

  const removeKiosk = useCallback((peerId: string) => {
    peerConnectionsRef.current.get(peerId)?.close();
    peerConnectionsRef.current.delete(peerId);
    sessionStatusByPeerRef.current.delete(peerId);
    setRemoteKiosks((prev) => prev.filter((k) => k.peerId !== peerId));
<<<<<<< Updated upstream
  }, []);
=======
    setPinnedIds((prev) => { const next = new Set(prev); next.delete(peerId); return next; });
    setVisibleVideoIds((prev) => { const next = new Set(prev); next.delete(peerId); return next; });
    if (selectedKioskId === peerId) setSelectedKioskId(null);
    if (modalKioskId === peerId) setModalKioskId(null);
  };
>>>>>>> Stashed changes

  const cleanupAllPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    sessionStatusByPeerRef.current.clear();
    setRemoteKiosks([]);
<<<<<<< Updated upstream
  }, []);
=======
    setPinnedIds(new Set());
    setVisibleVideoIds(new Set());
    setSelectedKioskId(null);
    setModalKioskId(null);
  };
>>>>>>> Stashed changes

  // ── Socket connection (unchanged logic) ──

  useEffect(() => {
    if (!roomId || !role) return;

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
      setKioskStatus(`Connected as ${role}. Room: ${roomId}`);
      socket.emit("join-room", roomId);
    });

    socket.on("connect_error", () => {
      setKioskStatus("Connection failed — check that server.js is running.");
    });

    socket.on("room-error", (data) => {
      setKioskStatus(data.error || "This testing room is no longer active.");
    });

    socket.on("signal", async (data) => {
      if (role !== "viewer") return;
      const peerId = data.from;
      if (!peerId) return;

      const pc = createPeerConnectionFor(peerId);

      if (data.sdp) {
        if (data.sdp.type === "offer") {
          setKioskStatus("Receiving stream…");
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("signal", { room: roomId, to: peerId, sdp: answer });
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("ICE candidate error:", e);
        }
      }
    });

    socket.on("tester-session-status", (data) => {
      const { from, status, sessionId, foodName } = data;
      if (!from) return;

      sessionStatusByPeerRef.current.set(from, status === "recording"
        ? { sessionId: sessionId ?? null, foodName: foodName ?? null }
        : { sessionId: null, foodName: null });

      setRemoteKiosks((prev) =>
        prev.map((k) =>
          k.peerId === from
            ? {
                ...k,
                sessionId: status === "recording" ? sessionId ?? null : null,
                foodName: status === "recording" ? foodName ?? null : null,
                connectionState: status === "recording" ? "streaming" : "idle",
              }
            : k,
        ),
      );

      setKioskStatus(
        status === "recording"
          ? foodName
            ? `Tester started tasting: ${foodName} (session #${sessionId ?? "?"})`
            : `Tester started their session (session #${sessionId ?? "?"})`
          : "Tester completed their session.",
      );
    });

    socket.on("user-disconnected", (peerId) => {
      removeKiosk(peerId);
      setKioskStatus("A kiosk disconnected.");
    });

    socket.on("host-disconnected", () => {
      setKioskStatus("Host disconnected.");
    });

    return () => {
      socket.disconnect();
      cleanupAllPeerConnections();
    };
    // Reconnect only when the selected room or role changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, role]);

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

  const pinnedKiosks = remoteKiosks.filter((k) => pinnedIds.has(k.peerId));

  return (
    <PageHeader variant="expanded">
<<<<<<< Updated upstream
      <main className="px-6 py-8">
        <div className="max-w-6xl mx-auto">
        {/* Back navigation */}
        <div className="mb-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 text-sm transition-colors group"
          >
            <span aria-hidden="true" className="group-hover:-translate-x-0.5 transition-transform">←</span>
            Back to Kiosk Overview
          </button>

          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
                {kioskInfo?.name ?? `Kiosk #${kioskId}`}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {kioskInfo?.location && (
                  <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                    <LocationPinIcon className="w-3.5 h-3.5 text-gray-400" />
                    {kioskInfo.location}
                  </span>
                )}
                <span className="text-sm text-gray-400">
                  ID: {kioskId}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-gray-500 mt-2">
            Open a food test, share its room code, then tasters log in, join, consent, and start recording. Their camera feed and captured frames go through the existing kiosk and FER pipeline.
          </p>
        </div>

        <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <p className="text-[14px] text-gray-500">
              Status: <span className="font-semibold text-gray-700">{kioskStatus}</span>
              {" · "}
              <span className="font-semibold text-gray-700">
                {remoteKiosks.length} kiosk{remoteKiosks.length === 1 ? "" : "s"} connected
              </span>
=======
      <main className="px-4 sm:px-6 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          {/* Title section */}
          <div className="mb-5">
            <PageTitle title="Monitor Kiosks" subtitle="Watch connected tasters while they record. Camera frames continue through the central FER pipeline." />
            <p className="text-[12px] text-gray-500 mt-1">
              Open a food test, share its room code, then tasters log in, join, consent, and start recording. Their camera feed and captured frames go through the existing kiosk and FER pipeline.
>>>>>>> Stashed changes
            </p>
          </div>

          {/* Top controls bar */}
          <section className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 mb-5">
            <div className="flex flex-col gap-3">
              {/* Row 1: Status & room controls */}
              <div className="flex flex-wrap justify-between items-center gap-3">
                <p className="text-[13px] text-gray-500">
                  Status: <span className="font-semibold text-gray-700">{kioskStatus}</span>
                  {" · "}
                  <span className="font-semibold text-gray-700">
                    {remoteKiosks.length} kiosk{remoteKiosks.length === 1 ? "" : "s"} connected
                  </span>
                </p>

                <div className="inline-flex items-center gap-2 flex-wrap">
                  <select aria-label="Active food test" value={roomId} onChange={(event) => setRoomId(event.target.value)} className="max-w-[260px] rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700" disabled={!activeRooms.length}>
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
                </div>
              </div>

              {/* Row 2: Create room */}
              {role === "viewer" ? (
                <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-end">
                  <label className="flex-1 text-xs font-semibold text-gray-700">
                    Open a food test for tasters
                    <select value={newRoomFoodId} onChange={(event) => setNewRoomFoodId(event.target.value)} disabled={!foods.length || creatingRoom} className="mt-1.5 block w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm font-normal">
                      {foods.length ? foods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>) : <option value="">No foods available</option>}
                    </select>
                  </label>
                  <button type="button" onClick={() => void createTestingRoom()} disabled={!newRoomFoodId || creatingRoom} className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40">
                    {creatingRoom ? "Opening…" : "Open / Create Room"}
                  </button>
                </div>
              ) : null}
              {roomMessage ? <p role="status" className={`text-xs ${roomMessage.startsWith("Room ready") ? "text-green-700" : "text-red-600"}`}>{roomMessage}</p> : null}
            </div>
          </section>

          {/* Layout toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <LayoutSwitcher value={layoutMode} onChange={setLayoutMode} />

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
            {remoteKiosks.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-center">
                <IconCamera className="w-12 h-12 text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm font-semibold">
                  {roomId ? "Waiting for tasters to connect…" : "Start a food test to monitor its kiosks."}
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
                        showVideo={false}
                        onSelect={() => handleTileClick(kiosk.peerId)}
                        onTogglePin={() => {}}
                        onToggleVideo={() => {}}
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
                      showVideo={false}
                      onSelect={() => handleTileClick(kiosk.peerId)}
                      onTogglePin={() => togglePin(kiosk.peerId)}
                      onToggleVideo={() => {}}
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
                      showVideo={false}
                      onSelect={() => handleTileClick(kiosk.peerId)}
                      onTogglePin={() => {}}
                      onToggleVideo={() => {}}
                      layoutMode={layoutMode}
                    />
                  ))}
                </div>
              </div>
            )}
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
<<<<<<< Updated upstream

/* ═══════════════════════════════════════════════════════════════
   KioskVideoTile — unchanged from original
   ═══════════════════════════════════════════════════════════════ */

function KioskVideoTile({
  kiosk,
  onStop,
}: {
  kiosk: RemoteKiosk;
  onStop: () => void;
}) {
  const { stream, label, sessionId, foodName } = kiosk;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          videoRef.current.play();
        }
      });
    }
  }, [stream]);

  const togglePause = () => {
    if (!videoRef.current) return;
    if (paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
    setPaused((p) => !p);
  };

  return (
    <div className="relative bg-black aspect-video rounded-lg overflow-hidden border border-gray-200 group">
      <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />

      <span className="absolute top-2 left-2 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded font-semibold">
        {label}
      </span>

      {sessionId != null && (
        <span className="absolute top-2 right-2 text-[10px] text-white bg-green-600/80 px-2 py-0.5 rounded font-semibold">
          Recording{foodName ? ` · ${foodName}` : ""} · S-{sessionId}
        </span>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-white text-sm font-semibold">Paused</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 flex gap-2 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={togglePause}
          className="flex-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          {paused ? "▶ Resume" : "⏸ Pause View"}
        </button>
        <button
          type="button"
          onClick={onStop}
          className="flex-1 bg-red-500/80 hover:bg-red-600 text-white text-[11px] font-semibold py-1 rounded transition-colors"
        >
          ⏹ Stop Watching
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SVG Icon Components
   ═══════════════════════════════════════════════════════════════ */

function KioskPlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      <circle cx="12" cy="10" r="2.5" />
      <path strokeLinecap="round" d="M7 7h.01" />
    </svg>
  );
}

function KioskEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2.5" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h6M12 7v6" />
    </svg>
  );
}

function LocationPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
    </svg>
  );
}
=======
>>>>>>> Stashed changes
