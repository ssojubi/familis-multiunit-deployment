import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";
import { getApiBase, isKioskPublicPath, kioskRoute } from "../apiConfig";

type Food = {
  id: number;
  name: string;
  category: string;
};
type Participant = {
  id: number;
  testerLabel: string | null;
  age: number | null;
  gender: string | null;
};

const API_BASE = getApiBase();
const DEFAULT_KIOSK_AGENT_ID = "kiosk-01";

function getStoredUserId(): number {
  try {
    const raw = localStorage.getItem("familis.user");
    if (!raw) return 1;
    const parsed = JSON.parse(raw) as { id?: number };
    return Number(parsed?.id ?? 1) || 1;
  } catch {
    return 1;
  }
}

export default function Setup() {
  const navigate = useNavigate();
  const location = useLocation();
  const kioskMode = isKioskPublicPath(location.pathname);
  const [foods, setFoods] = useState<Food[]>([]);
  const [foodsLoading, setFoodsLoading] = useState(true);
  const [foodsError, setFoodsError] = useState<string | null>(null);

  const [selectedFoodId, setSelectedFoodId] = useState<number | "">("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantLabel, setParticipantLabel] = useState("");
  const [participantAge, setParticipantAge] = useState("");
  const [participantGender, setParticipantGender] = useState("");
  const [participantError, setParticipantError] = useState<string | null>(null);
  const [consent, setConsent] = useState({
    recording: false,
    dataUsage: false,
    participant: false,
  });

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const kioskAgentId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (
      params.get("kiosk_id") ||
      params.get("kioskId") ||
      params.get("agentKioskId") ||
      DEFAULT_KIOSK_AGENT_ID
    ).trim();
  }, [location.search]);
  const roomId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("room") || `kiosk-${kioskAgentId}`).trim();
  }, [location.search, kioskAgentId]);

  useEffect(() => {
    if (kioskMode) {
      // #region agent log
      fetch('http://127.0.0.1:7575/ingest/ee988b9a-3295-425f-9a5b-c96caf767e73',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a7fb58'},body:JSON.stringify({sessionId:'a7fb58',hypothesisId:'H5',location:'Setup.tsx:mount',message:'public kiosk setup loaded',data:{kioskMode,roomId,kioskAgentId,pathname:location.pathname},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
  }, [kioskMode, roomId, kioskAgentId, location.pathname]);

  useEffect(() => {
    async function loadFoods() {
      setFoodsLoading(true);
      setFoodsError(null);
      try {
        const foodsUrl = `${API_BASE}/api/foods`;
        const res = await fetch(foodsUrl);
        const json = await res.json();
        // #region agent log
        fetch('http://127.0.0.1:7575/ingest/ee988b9a-3295-425f-9a5b-c96caf767e73',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a7fb58'},body:JSON.stringify({sessionId:'a7fb58',hypothesisId:'H4',location:'Setup.tsx:loadFoods',message:'foods fetch result',data:{foodsUrl,status:res.status,ok:json?.ok,pageProtocol:window.location.protocol,port:window.location.port},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load foods.");
        const list = (json.foods ?? []) as any[];
        setFoods(
          list.map((f) => ({
            id: Number(f.id),
            name: String(f.name),
            category: String(f.category),
          }))
        );
      } catch (err: any) {
        setFoodsError(err?.message || "Failed to load foods.");
      } finally {
        setFoodsLoading(false);
      }
    }
    void loadFoods();
  }, []);

  useEffect(() => {
    async function loadParticipants() {
      try {
        const res = await fetch(`${API_BASE}/api/participants`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) return;
        const list = (json.participants ?? []) as any[];
        setParticipants(
          list.map((p) => ({
            id: Number(p.id),
            testerLabel: p.testerLabel == null ? null : String(p.testerLabel),
            age: p.age == null ? null : Number(p.age),
            gender: p.gender == null ? null : String(p.gender),
          }))
        );
      } catch {
        // Non-blocking for setup flow.
      }
    }
    void loadParticipants();
  }, []);

  const selectedFood = useMemo(
    () => foods.find((f) => f.id === selectedFoodId) ?? null,
    [foods, selectedFoodId]
  );
  const selectedParticipant = useMemo(() => {
    const label = participantLabel.trim().toLowerCase();
    if (!label) return null;
    return (
      participants.find((p) => (p.testerLabel ?? "").trim().toLowerCase() === label) ?? null
    );
  }, [participantLabel, participants]);

  useEffect(() => {
    if (!selectedParticipant) return;
    setParticipantAge(
      selectedParticipant.age == null ? "" : String(selectedParticipant.age)
    );
    setParticipantGender(selectedParticipant.gender ?? "");
  }, [selectedParticipant]);

  const canStart =
    !!selectedFoodId &&
    consent.recording &&
    consent.dataUsage &&
    consent.participant &&
    !!participantLabel.trim() &&
    !foodsLoading &&
    !starting;

  const handleStart = async () => {
    if (!canStart) return;
    setStartError(null);
    setParticipantError(null);
    setStarting(true);
    try {
      const participantRes = await fetch(`${API_BASE}/api/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          testerLabel: participantLabel.trim(),
          age: participantAge.trim() === "" ? null : Number(participantAge),
          gender: participantGender || null,
        }),
      });
      const participantJson = await participantRes.json().catch(() => null);
      if (!participantRes.ok || !participantJson?.ok || !participantJson?.participant?.id) {
        throw new Error(participantJson?.error || "Failed to register participant.");
      }
      const createdParticipantId = Number(participantJson.participant.id);

      const res = await fetch(`${API_BASE}/api/sessions/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: getStoredUserId(),
          foodId: selectedFoodId as number,
          participantId: createdParticipantId,
          webKiosk: kioskMode,
          roomId,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to start session.");
      }

      const started = json.session as {
        id: number;
        userId: number;
        participantId: number | null;
        foodId: number;
        status: "pending" | "active" | "completed" | "cancelled";
        startTime: string;
      };

      // Store current session for later pages
      localStorage.setItem(
        "familis.currentSession",
        JSON.stringify({
          id: started.id,
          userId: started.userId,
          participantId: started.participantId,
          foodId: started.foodId,
          status: started.status,
          startTime: started.startTime,
          agentKioskId: kioskAgentId,
          roomId,
        })
      );

      navigate(kioskMode ? kioskRoute("/session") : "/session", {
        state: { session: started, food: selectedFood },
      });
    } catch (err: any) {
      const message = err?.message || "Failed to start session.";
      if (message.toLowerCase().includes("participant")) setParticipantError(message);
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="FaMiLis logo" className="w-[44px] h-[44px] object-contain" />
            <span className="text-white text-[22px] font-bold tracking-wide">FaMiLis</span>
          </div>

          {!kioskMode ? (
            <button
              type="button"
              onClick={() => performLogout(navigate)}
              className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
            >
              Log Out
            </button>
          ) : null}
        </div>
      </header>

      <main className="px-6 py-8">
        <div className="max-w-4xl mx-auto">
          {!kioskMode ? (
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 text-sm transition-colors"
            >
              <span aria-hidden="true">←</span>
              Back to Dashboard
            </button>
          ) : null}

          <div className="mb-6">
            <h1 className="text-[26px] font-bold text-gray-900">Camera Setup</h1>
            <p className="text-[12px] text-gray-500 mt-1">Configure your food testing session</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <label className="block text-sm text-gray-700 mb-2 font-semibold">Select Food *</label>
                <select
                  value={selectedFoodId}
                  onChange={(e) => setSelectedFoodId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                  disabled={foodsLoading || !!foodsError}
                >
                  <option value="">{foodsLoading ? "Loading foods..." : "Choose a food..."}</option>
                  {foods.map((food) => (
                    <option key={food.id} value={food.id}>
                      {food.name} — {food.category}
                    </option>
                  ))}
                </select>
                {foodsError ? (
                  <p className="text-xs text-red-600 mt-2">{foodsError}</p>
                ) : null}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <label className="block text-sm text-gray-700 mb-2 font-semibold">Participant Label / ID *</label>
                <input
                  type="text"
                  list="participant-labels"
                  value={participantLabel}
                  onChange={(e) => setParticipantLabel(e.target.value)}
                  placeholder="e.g. T-01"
                  className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                />
                <datalist id="participant-labels">
                  {participants
                    .filter((p) => p.testerLabel)
                    .map((p) => (
                      <option key={p.id} value={p.testerLabel as string} />
                    ))}
                </datalist>
                <p className="text-[11px] text-gray-500 mt-2">
                  Enter an existing label to reuse a participant, or a new one to create it.
                  Matching participants auto-fill age/gender, which you can still overwrite.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <input
                    type="number"
                    value={participantAge}
                    onChange={(e) => setParticipantAge(e.target.value)}
                    placeholder="Age (optional)"
                    min={0}
                    max={120}
                    className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                  />
                  <select
                    value={participantGender}
                    onChange={(e) => setParticipantGender(e.target.value)}
                    className="w-full border border-gray-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white"
                  >
                    <option value="">Gender (optional)</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                {participantError ? <p className="text-xs text-red-600 mt-2">{participantError}</p> : null}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm text-gray-700 mb-3 font-semibold">Consent Checklist *</h3>
                <div className="space-y-3">
                  <ConsentRow
                    checked={consent.recording}
                    onChange={(checked) => setConsent((p) => ({ ...p, recording: checked }))}
                    label="I consent to being recorded during this session"
                  />
                  <ConsentRow
                    checked={consent.dataUsage}
                    onChange={(checked) => setConsent((p) => ({ ...p, dataUsage: checked }))}
                    label="I agree to the use of my data for research purposes"
                  />
                  <ConsentRow
                    checked={consent.participant}
                    onChange={(checked) => setConsent((p) => ({ ...p, participant: checked }))}
                    label="I confirm I am a willing participant in this study"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <h3 className="text-sm text-gray-700 mb-3 font-semibold">Kiosk Device</h3>
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                  <div className="text-center px-6">
                    <p className="text-sm text-gray-600 font-semibold">{kioskAgentId}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Camera capture runs in this browser after you start the session.
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500 mt-2">
                  Room: {roomId}. Allow camera access when prompted on the next screen.
                </p>
              </div>

              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
                  canStart
                    ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                {starting ? "Starting..." : "Start the Session"}
              </button>
              {!canStart ? (
                <p className="text-xs text-gray-500 text-center">Complete all required fields to start</p>
              ) : null}
              {startError ? <p className="text-xs text-red-600 text-center">{startError}</p> : null}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#e8174a]"
      />
      <span className="text-sm text-gray-600">{label}</span>
    </label>
  );
}
