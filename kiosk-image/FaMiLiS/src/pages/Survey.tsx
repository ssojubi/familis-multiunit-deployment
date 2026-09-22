import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { InfoTip } from "../components/InfoTip";
import { FoodQuickPicker, SessionContinuationCard, type QuickPickFood } from "../components/survey";
import type { GlossaryTerm } from "../lib/glossary";
import { apiFetch } from "../lib/api";
import { startContinuationSession } from "../lib/startContinuationSession";
import { RATING_LABELS, getGuideEmoji } from "../lib/ratingLabels";
import { clearStoredSession, getStoredRole, performLogout } from "../RequireAuth";

const RATING_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const AUTO_LOGOUT_SECONDS = 10;

type Food = {
  id: number;
  name: string;
  category: string;
};

/**
 * Post-submit UI state:
 * - "none": still on the rating form
 * - "continuation": survey saved — offer same/different/done (no auto-logout yet)
 * - "loggingOut": tester chose "I'm done" (or the survey was already submitted
 *   on a page refresh) — show the thank-you card and start the countdown
 */
type PostSubmitPhase = "none" | "continuation" | "loggingOut";

export default function Survey() {
  const location = useLocation() as any;
  const navigate = useNavigate();
  const isTester = getStoredRole() === "tester";

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
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(!!sessionId);
  const [error, setError] = useState<string | null>(null);
  const [postSubmitPhase, setPostSubmitPhase] = useState<PostSubmitPhase>("none");
  const [logoutSeconds, setLogoutSeconds] = useState(AUTO_LOGOUT_SECONDS);

  // Continuation actions (same product / different product)
  const [continuationStarting, setContinuationStarting] = useState(false);
  const [continuationError, setContinuationError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) return;

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await apiFetch(`/api/sessions/${sessionId}`, { signal: ac.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error || "Failed to load session.");
        }
        const sessionRow = json.session as
          | { participantId?: number | null; userId?: number; hasSurvey?: boolean }
          | undefined;
        setFood((json.food ?? null) as Food | null);
        setParticipantId(sessionRow?.participantId ?? null);
        setUserId(sessionRow?.userId ?? null);
        // Only show the logged-out card if the survey was actually submitted
        // previously (handles refresh after submission). status === "completed"
        // alone is not sufficient because stop recording also sets that status.
        if (isTester && sessionRow?.hasSurvey === true) {
          clearStoredSession();
          setPostSubmitPhase("loggingOut");
        }
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
  }, [sessionId, isTester]);

  useEffect(() => {
    if (postSubmitPhase !== "loggingOut" || !isTester) return;

    setLogoutSeconds(AUTO_LOGOUT_SECONDS);
    const tick = setInterval(() => {
      setLogoutSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    const logout = setTimeout(() => performLogout(navigate, { clearSession: true }), AUTO_LOGOUT_SECONDS * 1000);

    return () => {
      clearInterval(tick);
      clearTimeout(logout);
    };
  }, [postSubmitPhase, isTester, navigate]);

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
  const [saved, setSaved] = useState(false);

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
      const res = await apiFetch(`/api/sessions/${sessionId}/survey`, {
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
      if (res.status === 409) {
        throw new Error(json?.error || "Survey already submitted for this session.");
      }
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to submit survey.");
      }

      setSaved(true);
      // Show "Survey saved" toast briefly before offering continuation choices.
      // participantId/foodId/userId are already captured in state, so clearing
      // the booth session pointer here is safe for both tester and staff.
      setTimeout(() => {
        clearStoredSession();
        setPostSubmitPhase("continuation");
      }, 700);
    } catch (err: any) {
      setError(err?.message || "Failed to submit survey.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSameProduct = async () => {
    if (!food || userId == null) {
      setContinuationError("Missing session context — please refresh and try again.");
      return;
    }
    setContinuationStarting(true);
    setContinuationError(null);
    try {
      const session = await startContinuationSession({ userId, foodId: food.id, participantId });
      navigate("/session", { state: { session, food } });
    } catch (err: any) {
      setContinuationError(err?.message || "Failed to start the next session.");
    } finally {
      setContinuationStarting(false);
    }
  };

  const handleConfirmDifferentProduct = async (pickedFood: QuickPickFood) => {
    if (userId == null) {
      setContinuationError("Missing session context — please refresh and try again.");
      return;
    }
    setContinuationStarting(true);
    setContinuationError(null);
    try {
      const session = await startContinuationSession({
        userId,
        foodId: pickedFood.id,
        participantId,
      });
      setPickerOpen(false);
      navigate("/session", { state: { session, food: pickedFood } });
    } catch (err: any) {
      setContinuationError(err?.message || "Failed to start the next session.");
    } finally {
      setContinuationStarting(false);
    }
  };

  const handleDone = () => {
    if (isTester) {
      setPostSubmitPhase("loggingOut");
      return;
    }
    navigate(sessionId != null ? `/session-detail?sessionId=${sessionId}` : "/dashboard");
  };

  const handleReturnToSetup = async () => {
    setContinuationStarting(true);
    try {
      let prefillState: Record<string, unknown> = { foodId: food?.id };
      if (participantId != null) {
        try {
          const res = await apiFetch(`/api/participants/${participantId}`);
          const json = await res.json().catch(() => null);
          if (res.ok && json?.ok && json.participant) {
            prefillState = {
              participantId: json.participant.id,
              testerLabel: json.participant.testerLabel,
              age: json.participant.age,
              gender: json.participant.gender,
              foodId: food?.id,
            };
          } else {
            prefillState = { participantId, foodId: food?.id };
          }
        } catch {
          prefillState = { participantId, foodId: food?.id };
        }
      }
      navigate("/setup", { state: prefillState });
    } finally {
      setContinuationStarting(false);
    }
  };

  return (
    <PageHeader variant="collapsed">
      {saved && postSubmitPhase === "none" && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg text-sm font-semibold flex items-center gap-2">
          <span aria-hidden="true">✓</span>
          Survey saved
        </div>
      )}

      <main className="px-6 py-10">
        <div className="max-w-6xl mx-auto">
          {postSubmitPhase === "loggingOut" ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 shadow-sm text-center max-w-lg mx-auto">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl text-green-600" aria-hidden="true">
                  ✓
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Thank you — session complete</h1>
              <p className="text-sm text-gray-600 mt-3">
                Your ratings have been saved. You may leave the system.
              </p>
              {food?.name ? (
                <p className="text-sm text-gray-500 mt-2">
                  Product: <span className="font-semibold text-gray-700">{food.name}</span>
                </p>
              ) : null}
              <p className="text-xs text-gray-500 mt-6">
                Returning to login in {logoutSeconds} second{logoutSeconds === 1 ? "" : "s"}…
              </p>
            </div>
          ) : postSubmitPhase === "continuation" ? (
            <SessionContinuationCard
              productName={food?.name ?? "this product"}
              isTester={isTester}
              starting={continuationStarting}
              actionError={pickerOpen ? null : continuationError}
              onSameProduct={() => void handleSameProduct()}
              onDifferentProduct={() => {
                setContinuationError(null);
                setPickerOpen(true);
              }}
              onDone={handleDone}
              onReturnToSetup={isTester ? undefined : () => void handleReturnToSetup()}
            />
          ) : (
            <>
              <div className="bg-white px-8 py-6 rounded-[10px] mb-6 text-center border border-gray-200">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  Hedonic Sensory Evaluation Form
                </h1>
              </div>

              <div className="bg-white px-8 py-6 rounded-[10px] mb-6 text-center border border-gray-200">
                <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center justify-center gap-1.5">
                  Evaluation Guide
                  <InfoTip term="hedonicScore" />
                </h3>
                <p className="text-sm text-gray-700 mb-4">
                  Please evaluate based on the 9-point scale rating below:
                </p>
                <div className="space-y-1">
                  {Array.from({ length: 9 }, (_, i) => 9 - i).map((score) => (
                    <p key={score} className="text-sm text-gray-800 font-medium">
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

              <section className="bg-white border border-gray-200 rounded-lg overflow-visible">
                <div className="p-6 flex justify-center">
                  <div className="border border-red-500 px-6 py-3 text-center w-full max-w-[520px]">
                    <p className="text-base font-extrabold text-gray-900">{productTitle}</p>
                  </div>
                </div>

                <div className="divide-y divide-gray-200">
                  <RatingRow
                    label="COLOR"
                    value={ratings.color}
                    onChange={handleSelect("color")}
                    infoTerm="surveyColor"
                  />
                  <RatingRow
                    label="FLAVOR / AROMA"
                    value={ratings.flavorAroma}
                    onChange={handleSelect("flavorAroma")}
                    infoTerm="surveyFlavorAroma"
                  />
                  <RatingRow
                    label="SALTINESS / SWEETNESS"
                    value={ratings.saltSweet}
                    onChange={handleSelect("saltSweet")}
                    infoTerm="surveySaltSweet"
                  />
                  <RatingRow
                    label="TEXTURE / VISCOSITY"
                    value={ratings.texture}
                    onChange={handleSelect("texture")}
                    infoTerm="surveyTexture"
                  />
                  <RatingRow
                    label="OVERALL PROFILE"
                    value={ratings.overall}
                    onChange={handleSelect("overall")}
                    infoTerm="overallProfile"
                  />
                </div>

                <div className="p-6">
                  <div className="mb-2">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">REMARKS</p>
                  </div>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter your remarks here"
                    className="w-full border border-gray-300 rounded-md px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e8174a]/30 focus:border-[#e8174a]"
                  />

                  <div className="flex justify-center mt-8">
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={submitting || loading}
                      className={`bg-red-600 text-white px-16 py-3 rounded-md text-lg font-extrabold border border-black/5 hover:bg-red-700 transition-colors ${
                        !allSelected || submitting || loading ? "opacity-70 cursor-not-allowed" : ""
                      }`}
                    >
                      {submitting ? "Submitting..." : "Submit"}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      {pickerOpen ? (
        <FoodQuickPicker
          excludeFoodId={food?.id ?? null}
          starting={continuationStarting}
          error={continuationError}
          onClose={() => {
            if (continuationStarting) return;
            setPickerOpen(false);
            setContinuationError(null);
          }}
          onConfirm={(pickedFood) => void handleConfirmDifferentProduct(pickedFood)}
        />
      ) : null}
    </PageHeader>
  );
}

function RatingRow({
  label,
  value,
  onChange,
  infoTerm,
}: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  infoTerm?: GlossaryTerm;
}) {
  return (
    <div className="py-4 px-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <span className="uppercase tracking-wide">{label}</span>
          {infoTerm ? <InfoTip term={infoTerm} align="left" /> : null}
        </p>
        <div className="flex flex-wrap gap-3 justify-end">
          {RATING_OPTIONS.map((rating) => {
            const selected = value === rating;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => onChange(rating)}
                className={`w-[44px] h-[36px] border rounded-none text-sm font-extrabold transition-colors flex items-center justify-center ${
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
