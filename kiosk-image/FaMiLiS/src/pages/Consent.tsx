import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FAMILIS_CURRENT_SESSION_KEY, markSessionConsented, performLogout } from "../RequireAuth";
import { apiFetch } from "../lib/api";
import { BrandTopBar } from "../components/BrandTopBar";
import {
  buildDietaryRestrictionsFromDetails,
  emptyDietaryDetails,
  parseDietaryRestrictionsToDetails,
  type DietaryEthicsKey,
} from "../lib/dietaryRestrictions";

const CONSENT_VERSION = "1.1";
const DEVICE_ID_KEY = "familis.deviceId";

const CONSENT_ITEMS = [
  {
    key: "facialRecording" as const,
    label: "I agree to facial recording and camera capture for analysis",
    helper:
      "Your webcam feed is captured locally during the session for emotion analysis. No video is stored, only individual frames.",
  },
  {
    key: "dataUsage" as const,
    label: "I agree to the use of session data for research purposes",
    helper: "Anonymized scores may be included in aggregated reports. Frames are deleted after ~30 days.",
  },
  {
    key: "participant" as const,
    label: "I confirm I am a willing participant in this study",
    helper: "Participation is voluntary. You may stop the session at any time.",
  },
  {
    key: "dataStorage" as const,
    label: "I understand data is stored locally on this lab system",
    helper: "All data stays on-premises. This is a lab demo, not a clinical or commercial deployment.",
  },
];

const ETHICS_ITEMS = [
  {
    key: "foodAllergies" as const,
    label: "Do you have any food allergies?",
    dietaryLabel: "Allergies",
  },
  {
    key: "intolerances" as const,
    label: "Do you have any food intolerances or sensitivities?",
    dietaryLabel: "Intolerances",
  },
  {
    key: "medicalDietary" as const,
    label: "Do you have any medical or dietary restrictions?",
    dietaryLabel: "Medical",
  },
  {
    key: "religiousCultural" as const,
    label: "Do you have any religious or cultural dietary restrictions?",
    dietaryLabel: "Religious/Cultural",
  },
  {
    key: "healthToday" as const,
    label: "Do you have any health condition today that may affect tasting?",
    dietaryLabel: "Health today",
  },
  {
    key: "recentFoodMedication" as const,
    label: "Have you recently consumed food or medication that may affect taste perception?",
    dietaryLabel: "Recent food/medication",
  },
];

type ConsentState = Record<(typeof CONSENT_ITEMS)[number]["key"], boolean>;
type EthicsKey = DietaryEthicsKey;
type EthicsState = Record<EthicsKey, boolean | null>;
type EthicsDetailsState = Record<EthicsKey, string>;

const DEFAULT_CONSENT: ConsentState = {
  facialRecording: false,
  dataUsage: false,
  participant: false,
  dataStorage: false,
};

const DEFAULT_ETHICS: EthicsState = {
  foodAllergies: null,
  intolerances: null,
  medicalDietary: null,
  religiousCultural: null,
  healthToday: null,
  recentFoodMedication: null,
};

const DEFAULT_ETHICS_DETAILS: EthicsDetailsState = emptyDietaryDetails();

export { buildDietaryRestrictionsFromDetails };

type StoredSession = {
  id: number;
  foodId?: number;
  participantId?: number | null;
};

function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function readLocalSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(FAMILIS_CURRENT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return Number.isFinite(Number(parsed?.id)) ? parsed : null;
  } catch {
    return null;
  }
}

export default function Consent() {
  const navigate = useNavigate();

  const [storedSession, setStoredSession] = useState<StoredSession | null>(readLocalSession);
  const [sessionLookupDone, setSessionLookupDone] = useState(storedSession !== null);
  const [foodName, setFoodName] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentState>(DEFAULT_CONSENT);
  const [ethics, setEthics] = useState<EthicsState>(DEFAULT_ETHICS);
  const [ethicsDetails, setEthicsDetails] = useState<EthicsDetailsState>(DEFAULT_ETHICS_DETAILS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dietaryPrefillDoneRef = useRef(false);

  // If localStorage had no session, ask the server for the latest unsurveyed booth session.
  useEffect(() => {
    if (storedSession !== null) {
      setSessionLookupDone(true);
      return;
    }
    let cancelled = false;
    async function discoverSession() {
      try {
        const res = await apiFetch("/api/sessions/booth/active");
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok && json.session?.id) {
          const found: StoredSession = {
            id: Number(json.session.id),
            foodId: json.session.foodId ?? undefined,
            participantId: json.session.participantId ?? null,
          };
          localStorage.setItem(FAMILIS_CURRENT_SESSION_KEY, JSON.stringify({
            id: found.id,
            userId: json.session.userId,
            participantId: found.participantId,
            foodId: found.foodId,
            status: json.session.status,
            startTime: json.session.startTime,
          }));
          setStoredSession(found);
          setFoodName(json.food?.name ?? null);
        }
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setSessionLookupDone(true);
      }
    }
    void discoverSession();
    return () => { cancelled = true; };
  }, [storedSession]);

  // Load food name when we already have a session from localStorage.
  useEffect(() => {
    if (!storedSession?.id || foodName !== null) return;
    let cancelled = false;
    async function loadSession() {
      try {
        const res = await apiFetch(`/api/sessions/${storedSession!.id}`);
        const json = await res.json().catch(() => null);
        if (!cancelled && res.ok && json?.ok) {
          setFoodName(json.food?.name ?? null);
          // Backfill participantId if missing from localStorage.
          if (
            (storedSession!.participantId == null || storedSession!.participantId === undefined) &&
            json.session?.participantId != null
          ) {
            const pId = Number(json.session.participantId);
            if (Number.isFinite(pId)) {
              setStoredSession((prev) => (prev ? { ...prev, participantId: pId } : prev));
            }
          }
        }
      } catch {
        /* context is best-effort */
      }
    }
    void loadSession();
    return () => { cancelled = true; };
  }, [storedSession, foodName]);

  // Prefill ethics details from existing taster dietary_restrictions (once per load).
  useEffect(() => {
    if (!storedSession?.id) return;
    if (dietaryPrefillDoneRef.current) return;

    let cancelled = false;
    async function prefillDietary() {
      try {
        let pId =
          storedSession!.participantId != null && Number.isFinite(Number(storedSession!.participantId))
            ? Number(storedSession!.participantId)
            : null;

        if (pId == null) {
          const sessRes = await apiFetch(`/api/sessions/${storedSession!.id}`);
          const sessJson = await sessRes.json().catch(() => null);
          if (cancelled) return;
          const fromSession = sessJson?.session?.participantId ?? sessJson?.participantId;
          if (fromSession != null && Number.isFinite(Number(fromSession))) {
            pId = Number(fromSession);
            setStoredSession((prev) => (prev ? { ...prev, participantId: pId } : prev));
          }
        }

        if (pId == null) {
          dietaryPrefillDoneRef.current = true;
          return;
        }

        const res = await apiFetch(`/api/participants/${pId}`);
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok || !json?.ok) {
          dietaryPrefillDoneRef.current = true;
          return;
        }

        const dietary =
          typeof json.participant?.dietaryRestrictions === "string"
            ? json.participant.dietaryRestrictions
            : typeof json.dietaryRestrictions === "string"
              ? json.dietaryRestrictions
              : null;

        dietaryPrefillDoneRef.current = true;
        if (!dietary?.trim()) return;

        const parsed = parseDietaryRestrictionsToDetails(dietary);
        setEthicsDetails(parsed);
        setEthics((prev) => {
          const next = { ...prev };
          for (const item of ETHICS_ITEMS) {
            if (parsed[item.key].trim()) {
              next[item.key] = true;
            }
          }
          return next;
        });
      } catch {
        /* prefill is best-effort; never block Continue */
        dietaryPrefillDoneRef.current = true;
      }
    }
    void prefillDietary();
    return () => { cancelled = true; };
  }, [storedSession?.id, storedSession?.participantId]);

  const consentCount = Object.values(consent).filter(Boolean).length;
  const consentTotal = CONSENT_ITEMS.length;
  const allConsentChecked = consentCount === consentTotal;
  const ethicsAnswered = ETHICS_ITEMS.every((item) => typeof ethics[item.key] === "boolean");
  const canContinue = allConsentChecked && ethicsAnswered;

  const handleSubmit = async () => {
    if (!canContinue || !storedSession?.id) return;
    setSubmitting(true);
    setError(null);
    try {
      const ethicsAnswers = Object.fromEntries(
        ETHICS_ITEMS.map((item) => [item.key, ethics[item.key] as boolean])
      ) as Record<EthicsKey, boolean>;

      const ethicsDetailPayload = Object.fromEntries(
        ETHICS_ITEMS.map((item) => {
          const text = ethicsDetails[item.key].trim();
          return [`${item.key}Detail`, text || null];
        })
      );

      const dietaryRestrictions = buildDietaryRestrictionsFromDetails(ethicsDetails);

      const res = await apiFetch(`/api/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: storedSession.id,
          participantId: storedSession.participantId ?? null,
          deviceId: getDeviceId(),
          facialRecording: true,
          consentVersion: CONSENT_VERSION,
          ethics: { ...ethicsAnswers, ...ethicsDetailPayload },
          ethicsDetails: dietaryRestrictions,
          dietaryRestrictions,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to record consent.");
      }

      markSessionConsented(storedSession.id);

      if (typeof json.sessionStartTime === "string") {
        try {
          const raw = localStorage.getItem(FAMILIS_CURRENT_SESSION_KEY);
          if (raw) {
            const stored = JSON.parse(raw) as Record<string, unknown>;
            stored.startTime = json.sessionStartTime;
            localStorage.setItem(FAMILIS_CURRENT_SESSION_KEY, JSON.stringify(stored));
          }
        } catch {
          /* ignore */
        }
      }

      navigate("/session");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record consent.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <BrandTopBar
        actions={
          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white/15 hover:bg-white/25 text-white border border-white/30 transition-colors px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        }
      />

      <main className="px-6 py-10">
        <div className="max-w-2xl mx-auto">
          {!storedSession?.id ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                {!sessionLookupDone ? (
                  <svg className="w-7 h-7 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                ) : (
                  <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                )}
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#e8174a] mb-2">
                Taster Consent
              </p>
              <h1 className="text-xl font-bold text-gray-900">
                {!sessionLookupDone ? "Looking for session…" : "No active session"}
              </h1>
              {sessionLookupDone && (
                <p className="text-sm text-gray-600 mt-2">
                  Ask the lab operator to start a session for you. Once a session is ready, refresh this page to continue.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#e8174a] mb-2">
                  Taster Consent
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Before we begin</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {foodName ? `Tasting session: ${foodName}` : "Please review and confirm your consent."}
                </p>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm text-gray-900 font-bold">Taster Consent</h3>
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      allConsentChecked ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {consentCount} of {consentTotal}
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 mb-4">
                  All items must be acknowledged before the session can begin.
                </p>

                <div className="mb-4 p-3 bg-[#fde8ed] rounded-lg border border-[#e8174a]/20">
                  <p className="text-[11px] font-semibold text-[#c9143f] mb-1">Data &amp; Privacy - Lab Demo</p>
                  <ul className="text-[11px] text-gray-600 space-y-0.5 list-disc list-inside">
                    <li>Frames are stored locally; no cloud upload.</li>
                    <li>Scores are anonymized before reporting.</li>
                    <li>Frame images are deleted after ~30 days.</li>
                    <li>This is a prototype system, not a clinical tool.</li>
                  </ul>
                </div>

                <div className="space-y-1">
                  {CONSENT_ITEMS.map((item) => (
                    <ConsentRow
                      key={item.key}
                      checked={consent[item.key]}
                      onChange={(checked) => setConsent((p) => ({ ...p, [item.key]: checked }))}
                      label={item.label}
                      helper={item.helper}
                    />
                  ))}
                </div>

                <div className="mt-6 pt-5 border-t border-gray-100">
                  <h3 className="text-sm text-gray-900 font-bold mb-1">Health &amp; dietary screening</h3>
                  <p className="text-[11px] text-gray-500 mb-4">
                    Please answer all six questions. Optional details under each question are saved to the taster profile when provided.
                  </p>

                  <div className="space-y-3">
                    {ETHICS_ITEMS.map((item) => (
                      <EthicsRow
                        key={item.key}
                        label={item.label}
                        value={ethics[item.key]}
                        onChange={(value) => setEthics((p) => ({ ...p, [item.key]: value }))}
                        detail={ethicsDetails[item.key]}
                        onDetailChange={(text) =>
                          setEthicsDetails((p) => ({ ...p, [item.key]: text }))
                        }
                        detailId={`ethics-detail-${item.key}`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canContinue || submitting}
                  className={`mt-5 w-full py-3.5 rounded-lg text-sm font-bold transition-colors ${
                    canContinue && !submitting
                      ? "bg-[#e8174a] hover:bg-[#c9143f] text-white shadow-sm"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {submitting ? "Saving consent…" : "I Agree, Continue to Session"}
                </button>

                {!canContinue && (
                  <p className="text-[11px] text-gray-500 text-center mt-2">
                    {!allConsentChecked
                      ? `${consentCount} of ${consentTotal} consent items checked`
                      : "Answer all six health & dietary screening questions"}
                  </p>
                )}
                {error ? <p className="text-xs text-red-600 text-center mt-2">{error}</p> : null}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        checked ? "bg-[#fde8ed]" : "hover:bg-gray-50"
      }`}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${
            checked ? "bg-[#e8174a] border-[#e8174a]" : "bg-white border-gray-300"
          }`}
          aria-hidden="true"
        >
          {checked && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <span className={`text-sm font-medium block ${checked ? "text-gray-900" : "text-gray-700"}`}>
          {label}
        </span>
        {helper && <span className="text-[11px] text-gray-500 block mt-0.5 leading-relaxed">{helper}</span>}
      </div>
    </label>
  );
}

function EthicsRow({
  label,
  value,
  onChange,
  detail,
  onDetailChange,
  detailId,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
  detail: string;
  onDetailChange: (value: string) => void;
  detailId: string;
}) {
  return (
    <div className="p-3 rounded-lg border border-gray-100 bg-gray-50/60">
      <p className="text-sm font-medium text-gray-800 mb-2">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`flex-1 py-2 rounded-md text-sm font-semibold border transition-colors ${
            value === true
              ? "bg-[#e8174a] border-[#e8174a] text-white"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`flex-1 py-2 rounded-md text-sm font-semibold border transition-colors ${
            value === false
              ? "bg-gray-800 border-gray-800 text-white"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
          }`}
        >
          No
        </button>
      </div>
      <div className="mt-2.5">
        <label className="block text-[11px] text-gray-500 mb-1 font-semibold" htmlFor={detailId}>
          Optional details
        </label>
        <textarea
          id={detailId}
          value={detail}
          onChange={(e) => onDetailChange(e.target.value)}
          rows={2}
          placeholder="Add any relevant details…"
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 bg-white resize-y"
        />
      </div>
    </div>
  );
}
