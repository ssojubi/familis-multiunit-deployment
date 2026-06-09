/**
 * Tester Consent Form
 * First page testers see after login
 * If they consent → redirect to /tester-session
 * If they decline → logout
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";

export default function TesterConsent() {
  const navigate = useNavigate();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = () => {
    if (!consent) {
      setError("You must agree to continue.");
      return;
    }
    localStorage.setItem("familis.consent", "true");

    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get("room");
    navigate(room ? `/tester-session?room=${room}` : "/tester-session");
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

                <div className="flex items-start gap-3 mt-4">
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
                </div>

                {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={handleAccept}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-semibold transition-colors"
                >
                  I Agree, Start Testing
                </button>
                <button
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
