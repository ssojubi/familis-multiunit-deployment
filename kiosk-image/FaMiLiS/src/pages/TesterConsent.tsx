import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";

export default function TesterConsent() {
  const navigate = useNavigate();
  const [consent, setConsent] = useState({
    recording: false,
    dataUsage: false,
    participant: false,
  });

  const [error, setError] = useState<string | null>(null);

  const allChecked = consent.recording && consent.dataUsage && consent.participant;

  const handleAccept = () => {
    if (!consent) {
      setError("You must agree to continue.");
      return;
    }
    localStorage.setItem("familis.consent", "true");

    const urlParams = new URLSearchParams(window.location.search);
    const nextParams = new URLSearchParams();
    const room = urlParams.get("room");
    const kioskId = urlParams.get("kiosk_id");
    const foodId = urlParams.get("foodId");
    if (room) nextParams.set("room", room);
    if (kioskId) nextParams.set("kiosk_id", kioskId);
    if (foodId) nextParams.set("foodId", foodId);

    const query = nextParams.toString();
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

                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={!allChecked}
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
