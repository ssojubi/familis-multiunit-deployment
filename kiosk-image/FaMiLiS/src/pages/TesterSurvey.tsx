import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { performLogout } from "../auth";
import logo from "../assets/logo.png";

import { getApiBase } from "../apiConfig";

const API_BASE = getApiBase();
const RATING_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const RATING_LABELS: Record<number, string> = {
  9: "Like Extremely",
  8: "Like Very Much",
  7: "Like Moderately",
  6: "Like Slightly",
  5: "Neither Like nor Dislike",
  4: "Dislike Slightly",
  3: "Dislike Moderately",
  2: "Dislike Very Much",
  1: "Dislike Extremely",
};

export default function TesterSurvey() {
  const location = useLocation();
  const navigate = useNavigate();
  const sessionId = location.state?.sessionId;

  const [ratings, setRatings] = useState({
    color: null as number | null,
    flavorAroma: null as number | null,
    saltSweet: null as number | null,
    texture: null as number | null,
    overall: null as number | null,
  });
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const allSelected = Object.values(ratings).every((v) => v !== null);

  const handleSelect = (key: keyof typeof ratings) => (value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!sessionId) {
      setError("Session not found.");
      return;
    }
    if (!allSelected) {
      setError("Please select all ratings before submitting.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colorRating: ratings.color,
          flavorAromaRating: ratings.flavorAroma,
          saltSweetRating: ratings.saltSweet,
          textureRating: ratings.texture,
          finalOverallRating: ratings.overall,
          remarks: remarks.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to submit survey.");
      }

      setSubmitted(true);
      setTimeout(() => {
        performLogout(navigate);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">
            No session found. Please return to the kiosk.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-sm p-8 text-center max-w-md">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Thank You!</h2>
          <p className="text-gray-600">Your feedback has been recorded.</p>
          <p className="text-gray-500 text-sm mt-4">Redirecting to logout...</p>
        </div>
      </div>
    );
  }

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

      <main className="px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h1 className="text-white text-xl font-bold">
                Product Evaluation Survey
              </h1>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 p-4 rounded-lg mb-6 text-center">
                <p className="text-sm text-gray-600">
                  Please rate the product you just tasted
                </p>
                <div className="text-xs text-gray-500 mt-2">
                  1 = Dislike Extremely &nbsp;&nbsp;|&nbsp;&nbsp; 5 = Neutral
                  &nbsp;&nbsp;|&nbsp;&nbsp; 9 = Like Extremely
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <RatingRow
                  label="COLOR"
                  value={ratings.color}
                  onChange={handleSelect("color")}
                />
                <RatingRow
                  label="FLAVOR / AROMA"
                  value={ratings.flavorAroma}
                  onChange={handleSelect("flavorAroma")}
                />
                <RatingRow
                  label="SALTINESS / SWEETNESS"
                  value={ratings.saltSweet}
                  onChange={handleSelect("saltSweet")}
                />
                <RatingRow
                  label="TEXTURE / VISCOSITY"
                  value={ratings.texture}
                  onChange={handleSelect("texture")}
                />
                <RatingRow
                  label="OVERALL PROFILE"
                  value={ratings.overall}
                  onChange={handleSelect("overall")}
                />
              </div>

              <div className="mt-6">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  REMARKS
                </label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Additional comments (optional)"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>

              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleSubmit}
                  disabled={!allSelected || submitting}
                  className={`px-8 py-3 rounded-lg font-semibold text-white transition-colors ${
                    allSelected && !submitting
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  {submitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function RatingRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100">
      <span className="text-sm font-semibold text-gray-700 w-32">{label}</span>
      <div className="flex gap-2">
        {RATING_OPTIONS.map((rating) => (
          <button
            key={rating}
            onClick={() => onChange(rating)}
            className={`w-10 h-10 rounded-lg font-bold transition-all ${
              value === rating
                ? "bg-red-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
    </div>
  );
}
