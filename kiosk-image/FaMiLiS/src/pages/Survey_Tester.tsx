/**
 * notes:
 * - backend: answers get sent to admin
 * - modal reference: https://youtu.be/1CN7C6u31zA?si=A300qvK5Q5-8HuSv
 **/

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { performLogout } from "../RequireAuth";
import logo from "../assets/logo.png";
import heart from "../assets/heart.png";

const API_BASE = "http://localhost:8080";

const RATING_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

type Food = {
  id: number;
  name: string;
  category: string;
};

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

function getGuideEmoji(score: number) {
  // Simple mapping to mimic the screenshot's vibe (not meant to be scientific).
  switch (score) {
    case 9:
      return "😍";
    case 8:
      return "😊";
    case 7:
      return "🙂";
    case 6:
      return "😄";
    case 5:
      return "😐";
    case 4:
      return "😕";
    case 3:
      return "🙁";
    case 2:
      return "😖";
    case 1:
      return "😣";
    default:
      return "";
  }
}

export default function Survey() {
  const location = useLocation() as any;
  const navigate = useNavigate();

  const sessionId = useMemo<number | null>(() => {
    const fromState = location.state?.sessionId;
    if (Number.isFinite(Number(fromState))) return Number(fromState);
    try {
      const raw = localStorage.getItem("familis.currentSession");
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id?: number };
      if (Number.isFinite(Number(parsed?.id))) return Number(parsed.id);
    } catch {
      // ignore
    }
    return null;
  }, [location.state]);

  const [food, setFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const [error, setError] = useState<string | null>(null);

  // new
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!sessionId) return;

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, { signal: ac.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load session.");
        }
        setFood((json.food ?? null) as Food | null);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load session.");
        setFood(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => ac.abort();
  }, [sessionId]);

  const [ratings, setRatings] = useState<{
    color: number | null;
    flavorAroma: number | null;
    saltSweet: number | null;
    texture: number | null;
    overall: number | null;
  }>({
    color: null,
    flavorAroma: null,
    saltSweet: null,
    texture: null,
    overall: null,
  });

  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const productTitle = food?.name ?? "TS-67 TS Dinosaur Blend Savory Paste";

  const allSelected =
    ratings.color != null &&
    ratings.flavorAroma != null &&
    ratings.saltSweet != null &&
    ratings.texture != null &&
    ratings.overall != null;

  const handleSelect =
    (key: keyof typeof ratings) =>
    (v: number) => {
      setRatings((prev) => ({ ...prev, [key]: v }));
    };

  const handleSubmit = async () => {
    if (!sessionId) {
      setError("No session selected.");
      return;
    }

    if (!allSelected) {
      setError("Please select all 5 ratings before submitting.");
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
          remarks: remarks.trim() ? remarks : null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to submit survey.");
      }

      // navigate(`/session-detail?sessionId=${sessionId}`);
      setOpen(true);
    } catch (err: any) {
      setError(err?.message || "Failed to submit survey.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb]" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      <header className="bg-red-600 text-white">
        <div className="h-[72px] px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-3"
            aria-label="Go to dashboard"
          >
            <img src={logo} alt="FaMiLis logo" className="w-[44px] h-[44px] object-contain" />
            <span className="text-white text-[22px] font-bold tracking-wide">FaMiLis</span>
          </button>

          <div className="flex-1 text-center">
            <span className="text-white/95 text-[14px] font-semibold">Admin View</span>
          </div>

          <button
            type="button"
            onClick={() => performLogout(navigate)}
            className="bg-white/90 text-red-700 hover:bg-white transition-colors px-4 py-2 rounded-md text-sm font-semibold"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white px-8 py-6 rounded-[10px] mb-6 text-center border border-gray-200">
            <h1 className="text-[26px] font-bold text-gray-900">
              Hedonic Sensory Evaluation Form
            </h1>
          </div>

          <div className="bg-white px-8 py-6 rounded-[10px] mb-6 text-center border border-gray-200">
            <h3 className="text-[16px] font-bold text-gray-900 mb-3">Evaluation Guide</h3>
            <p className="text-sm text-gray-700 mb-4">
              Please evaluate based on the 9-point scale rating below:
            </p>
            <div className="space-y-1">
              {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => (
                <p key={score} className="text-[13px] text-gray-800 font-medium">
                  <span className="font-bold">{score}</span> - {RATING_LABELS[score]}{" "}
                  <span aria-hidden="true">{getGuideEmoji(score)}</span>
                </p>
              ))}
            </div>
            <p className="text-xs italic text-gray-600 mt-4">*If rating is 1-2, specify on remarks</p>
          </div>

          {error ? (
            <div className="mb-4 text-center text-red-700 text-sm bg-red-50 border border-red-200 rounded-md px-4 py-2">
              {error}
            </div>
          ) : null}

          <section className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-6 flex justify-center">
              <div className="border border-red-500 px-6 py-3 text-center w-full max-w-[520px]">
                <p className="text-[15px] font-extrabold text-gray-900">{productTitle}</p>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              <RatingRow label="COLOR" value={ratings.color} onChange={handleSelect("color")} />
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

            <div className="p-6">
              <div className="mb-2">
                <p className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">REMARKS</p>
              </div>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter your remarks here"
                className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 focus:border-[#e8174a]"
              />

              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || loading}
                  className={`bg-red-600 text-white px-16 py-3 rounded-md text-[18px] font-extrabold border border-black/5 hover:bg-red-700 transition-colors ${
                    !allSelected || submitting || loading ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {submitting ? "Submitting..." : "Submit"}
                </button>

                
                <Modal open={open} onClose={()=>setOpen(false)}>
                    <div className="flex flex-col gap-5 justify-center">
                        <img src={heart} style={{width: '80px', alignSelf:"center"}}/>
                        <h1 className="text-2xl ">Thank You for Your Participation!</h1>
                        <button className="border rounded-lg py-1.5 px-10 bg-red-500 hover:bg-red-600 text-white" 
                        onClick={() => performLogout(navigate)} style={{margin:"30px 0 0 0"}}>
                            Exit
                        </button>
                    </div>
                </Modal>
              </div>
            </div>
          </section>
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
    <div className="py-4 px-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] font-bold text-gray-700 uppercase tracking-wide">{label}</p>
        <div className="flex flex-wrap gap-3 justify-end">
          {RATING_OPTIONS.map((rating) => {
            const selected = value === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => onChange(rating)}
                className={`w-[44px] h-[36px] border rounded-none text-[14px] font-extrabold transition-colors flex items-center justify-center ${
                  selected
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-gray-900 border-gray-700 hover:bg-gray-50"
                }`}
                aria-pressed={selected}
              >
                {rating}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// new
type propTypes = {
    open: boolean;
    onClose: ()=> void;
    children: React.ReactNode;
}
const Modal: React.FC<propTypes> = ({ open, onClose, children }) => {
  return (
    <div
      className={`fixed inset-0 flex justify-center items-center transition-colors ${
        open ? "visible bg-black/20" : "invisible"
      }`}
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg shadow p-6 transition-all max-w-md ${
          open ? "scale-100 opacity-100" : "scale-110 opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
};