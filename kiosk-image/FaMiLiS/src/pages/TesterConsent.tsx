import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";
import {
  captureTesterContext,
  testerContextSearch,
} from "../testerContext";

export default function TesterConsent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [testerContext] = useState(() =>
    captureTesterContext(location.search),
  );
  const [consentFields, setConsentFields] = useState<Record<string, { label: string; helper: string }>>({
    recording: { label: "I consent to being recorded during this session", helper: "Your session frames are analyzed by the lab system." },
    dataUsage: { label: "I agree to the use of my data for research purposes", helper: "Session results may be used in research reports." },
    participant: { label: "I confirm I am a willing participant in this study", helper: "Participation is voluntary. You may stop at any time." },
  });
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [consentVersion, setConsentVersion] = useState("");
  const [consentLoaded, setConsentLoaded] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const allChecked = Object.keys(consentFields).length > 0 && Object.keys(consentFields).every(key => consent[key] === true);

  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/preferences", { signal: controller.signal }).then(r => r.json()).then(payload => {
      if (!payload?.ok || !payload.preferences?.consent || !payload.consentVersion) {
        setError(payload?.error || "Could not load the current consent form. Refresh this page to try again.");
        return;
      }
      setConsentFields(payload.preferences.consent);
      setConsent(Object.fromEntries(Object.keys(payload.preferences.consent).map(key => [key, false])));
      setConsentVersion(payload.consentVersion);
      setConsentLoaded(true);
    }).catch(() => { setError("Could not load the current consent form. Refresh this page to try again."); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!testerContext.roomId || !testerContext.foodId) {
      navigate("/tester-join", { replace: true });
    }
  }, [navigate, testerContext.foodId, testerContext.roomId]);

  const handleAccept = () => {
    if (!allChecked) {
      setError("Complete the consent checklist to continue.");
      return;
    }
    localStorage.setItem("familis.consent", JSON.stringify({
      answers: Object.fromEntries(Object.keys(consentFields).map(key => [key, true])),
      copy: consentFields,
      version: consentVersion,
    }));

    const query = testerContextSearch(testerContext);
    navigate(query ? `/tester-session?${query}` : "/tester-session");
  };

  const handleDecline = () => {
    localStorage.removeItem("familis.user");
    localStorage.removeItem("familis.consent");
    performLogout(navigate);
  };

  return (
    <div
      className="min-h-screen bg-[#f6f7fb]"
      style={{ fontFamily: "'Montserrat', sans-serif" }}
    >
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center">
          <img
            src={logo}
            alt="FaMiLis logo"
            className="w-[44px] h-[44px] object-contain"
          />
          <span className="text-white text-[22px] font-bold tracking-wide ml-3">
            FaMiLis
          </span>
        </div>
      </header>

      <main className="px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h1 className="text-white text-xl font-bold">
                Informed Consent Form
              </h1>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between gap-4 bg-gray-50 border border-gray-200 rounded-md px-4 py-3 text-sm">
                <span className="text-gray-600">Testing room</span>
                <span className="font-bold text-gray-900">
                  {testerContext.roomId}
                </span>
              </div>
              <div className="space-y-4 text-gray-700 text-sm">
                <p>
                  Thank you for participating in this food product testing
                  session. Please read the following information carefully
                  before proceeding.
                </p>

                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <p className="font-semibold">Purpose of the Study:</p>
                  <p className="text-gray-600">
                    This study aims to evaluate consumer preferences for various
                    food products using facial emotion recognition technology.
                  </p>

                  <p className="font-semibold mt-3">What to Expect:</p>
                  <p className="text-gray-600">
                    During the session, your facial expressions will be recorded
                    and analyzed while you taste the product. You will also be
                    asked to complete a short survey about your experience.
                  </p>

                  <p className="font-semibold mt-3">
                    Privacy & Data Protection:
                  </p>
                  <p className="text-gray-600">
                    All recordings and data collected will be kept confidential
                    and used solely for research purposes. Your identity will
                    remain anonymous.
                  </p>

                  <p className="font-semibold mt-3">Voluntary Participation:</p>
                  <p className="text-gray-600">
                    Your participation is completely voluntary. You may withdraw
                    at any time without any consequences.
                  </p>
                </div>

                {/* <div className="flex items-start gap-3 mt-4">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-red-600"
                  />
                  <label htmlFor="consent" className="text-sm text-gray-700">
                    I have read and understood the information above. I
                    voluntarily agree to participate in this study and consent
                    to the collection and use of my data for research purposes.
                  </label>
                </div> */}

                <div className="flex flex-col gap-2 mt-4">
                  <h3 className="text-sm text-gray-700 font-semibold">Consent Checklist *</h3>
                  {!consentLoaded ? <p className="text-xs text-gray-500">Loading current consent fields…</p> : null}
                  <div className="space-y-3">
                    {Object.entries(consentFields).map(([key, field]) => <ConsentRow
                      key={key}
                      checked={consent[key] === true}
                      onChange={(checked) => setConsent((p) => ({ ...p, [key]: checked }))}
                      label={field.label}
                      helper={field.helper}
                    />)}
                  </div>
                </div>

                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!allChecked || !consentLoaded || !consentVersion}
                  className={`flex-1 py-3 rounded-lg text-sm font-semibold transition-colors ${
                    allChecked
                      ? "bg-[#e8174a] hover:bg-[#c9143f] text-white"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  Start the Session
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  className="flex-1 border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-lg font-semibold transition-colors"
                >
                  Decline & Logout
                </button>
              </div>
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
  helper,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  helper?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-[#e8174a]"
      />
      <span className="text-sm text-gray-600">{label}{helper ? <span className="block pt-1 text-xs text-gray-500">{helper}</span> : null}</span>
    </label>
  );
}
