import React, { useId, useState } from "react";
import type { FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import loginBg from "../assets/login-bg.png";

function IconUser(props: { className?: string; size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width={size}
      height={size}
      className={props.className}
    >
      <path
        d="M20 20a8 8 0 1 0-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="8"
        r="4"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconMail(props: { className?: string; size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width={size}
      height={size}
      className={props.className}
    >
      <path
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5.5 7.5 12 12l6.5-4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLock(props: { className?: string; size?: number }) {
  const size = props.size ?? 20;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width={size}
      height={size}
      className={props.className}
    >
      <path
        d="M7 11V8.5A5 5 0 0 1 12 3.5a5 5 0 0 1 5 5V11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M6.5 11h11A2.5 2.5 0 0 1 20 13.5v5A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-5A2.5 2.5 0 0 1 6.5 11Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function IconCheck(props: { className?: string; size?: number }) {
  const size = props.size ?? 18;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      width={size}
      height={size}
      className={props.className}
    >
      <path
        d="M5 12.5 9.5 17 19 7.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STEPS = [
  "Profile",
  "Password",
  "Review",
] as const;

export default function Signup() {
  const navigate = useNavigate();
  const location = useLocation();
  const nameId = useId();
  const emailId = useId();
  const ageId = useId();
  const genderId = useId();
  const contactNumberId = useId();
  const gcashNumberId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [gcashNumber, setGcashNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  const validateCurrentStep = () => {
    if (step === 0) {
      if (!displayName.trim()) {
        setError("Please enter your name.");
        return false;
      }
      if (!email.trim()) {
        setError("Please enter an email address.");
        return false;
      }
      if (age.trim()) {
        const ageValue = Number(age);
        if (!Number.isFinite(ageValue) || ageValue < 0 || ageValue > 120) {
          setError("Please enter a valid age between 0 and 120.");
          return false;
        }
      }
      if (gender && !["male", "female", "other"].includes(gender)) {
        setError("Please choose a valid gender option.");
        return false;
      }
      return true;
    }

    if (step === 1) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters long.");
        return false;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return false;
      }
      return true;
    }

    return true;
  };

  const checkAccountUniqueness = async () => {
    try {
      const res = await fetch("/api/signup/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: displayName.trim(),
          email: email.trim(),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error || "An account with that email or name already exists.");
        return false;
      }

      return true;
    } catch (err) {
      console.error(err);
      setError("Unable to reach the server. Please try again.");
      return false;
    }
  };

  const handleNext = async () => {
    setError("");
    if (!validateCurrentStep()) {
      return;
    }
    if (step === 0) {
      const isUnique = await checkAccountUniqueness();
      if (!isUnique) return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError("");
    setAccountCreated(false);
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleProceedToConsent = () => {
    const requestedRoute = (location.state as { returnTo?: unknown } | null)
      ?.returnTo;
    if (
      typeof requestedRoute === "string" &&
      requestedRoute.startsWith("/") &&
      !requestedRoute.startsWith("//")
    ) {
      navigate(requestedRoute, { replace: true });
    } else {
      navigate("/tester-consent", { replace: true });
    }
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (step !== STEPS.length - 1) {
      if (validateCurrentStep()) {
        if (step === 0) {
          const isUnique = await checkAccountUniqueness();
          if (!isUnique) return;
        }
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
      }
      return;
    }

    const isUnique = await checkAccountUniqueness();
    if (!isUnique) {
      return;
    }

    if (!displayName.trim() || !email.trim() || !password) {
      setError("Please complete the form before creating the account.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const ageValue = age.trim() ? Number(age) : null;
      const res = await fetch("/api/signup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: displayName.trim(),
          email: email.trim(),
          password,
          age: ageValue,
          gender: gender || null,
          contactNumber: contactNumber.trim() || null,
          gcashNumber: gcashNumber.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setError(data?.error || "Could not create the account.");
        return;
      }

      try {
        if (data?.user) {
          localStorage.setItem("familis.user", JSON.stringify(data.user));
          localStorage.setItem("user", JSON.stringify(data.user));
        }
        if (data?.participant) {
          localStorage.setItem("familis.participant", JSON.stringify(data.participant));
        }
      } catch {
        // ignore storage failures
      }

      setAccountCreated(true);
      setStep(STEPS.length - 1);
    } catch (err) {
      console.error(err);
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = [
    "Your profile",
    "Create password",
    "Review account",
  ] as const;

  return (
    <div
      className="min-h-screen bg-[#f6f7fb] relative"
      style={{
        fontFamily: "'Montserrat', sans-serif",
        backgroundImage: `url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <header className="bg-red-600 text-white">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="h-[80px] px-8 flex items-center gap-3 text-left"
          aria-label="Go to login"
        >
          <img
            src={logo}
            alt="FaMiLis logo"
            className="w-[50px] h-[50px] object-contain"
          />
          <span className="text-white text-[24px] font-bold tracking-wide">
            FaMiLis
          </span>
        </button>
      </header>

      <main
        className="px-6 py-10"
        style={{
          minHeight: "calc(100vh - 80px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          className="w-full max-w-[620px] overflow-hidden rounded-[48px] shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#fff" }}
        >
          <div className="bg-red-600 px-10 pt-10 pb-8 text-center">
            <h2 className="text-white text-[34px] font-bold mt-2">
              Sign Up
            </h2>
            <p className="text-white/95 text-[16px] font-semibold mt-2 text-center">
              Create account as a participant.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {STEPS.map((label, index) => {
                const active = index === step;
                const done = index < step;
                return (
                  <div
                    key={label}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${active
                      ? "border-white bg-white text-red-700"
                      : done
                        ? "border-white/70 bg-white/15 text-white"
                        : "border-white/30 bg-white/10 text-white/80"
                      }`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-current/10 text-[11px]">
                      {done ? <IconCheck className="text-current" /> : index + 1}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <form className="bg-white px-10 py-9" onSubmit={handleSignup} noValidate>
            <p className="mb-6 text-center text-[15px] font-semibold text-[#4e4e4e]">
              {stepTitles[step]}
            </p>

            {step === 0 && (
              <>
                <div className="mb-6">
                  <label
                    htmlFor={nameId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    <span className="inline-flex items-center gap-3">
                      <IconUser size={20} className="text-red-600" />
                      Full Name
                    </span>
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    autoComplete="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={emailId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    <span className="inline-flex items-center gap-3">
                      <IconMail size={20} className="text-red-600" />
                      Email Address
                    </span>
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={ageId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    Age
                  </label>
                  <input
                    id={ageId}
                    type="number"
                    min="0"
                    max="120"
                    inputMode="numeric"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Enter your age"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={genderId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    Gender
                  </label>
                  <select
                    id={genderId}
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black focus:outline-none focus:border-red-400 bg-white"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={contactNumberId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    Contact Number
                  </label>
                  <input
                    id={contactNumberId}
                    type="tel"
                    autoComplete="tel"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={gcashNumberId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    GCash Number
                  </label>
                  <input
                    id={gcashNumberId}
                    type="tel"
                    value={gcashNumber}
                    onChange={(e) => setGcashNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <div className="mb-6">
                  <label
                    htmlFor={passwordId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    <span className="inline-flex items-center gap-3">
                      <IconLock size={20} className="text-red-600" />
                      Create Password
                    </span>
                  </label>
                  <input
                    id={passwordId}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>

                <div className="mb-6">
                  <label
                    htmlFor={confirmPasswordId}
                    className="text-black text-[18px] font-medium block mb-3"
                    style={{ fontFamily: "'Roboto', sans-serif" }}
                  >
                    <span className="inline-flex items-center gap-3">
                      <IconLock size={20} className="text-red-600" />
                      Confirm Password
                    </span>
                  </label>
                  <input
                    id={confirmPasswordId}
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                    style={{ fontFamily: "'Albert Sans', sans-serif" }}
                  />
                </div>
              </>
            )}

            {step === 2 && (
              <div className="space-y-4">
                {accountCreated && (
                  <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-5">
                    <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      Account created
                    </p>
                    <p className="mt-1 text-[15px] text-emerald-900">
                      Review the details below, then continue to the informed consent form when you are ready.
                    </p>
                  </div>
                )}
                <div className="rounded-[18px] border border-[#e9e9e9] bg-[#fafafa] p-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#9b9b9b]">
                    Account name
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-black">
                    {displayName.trim() || "Unnamed user"}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#e9e9e9] bg-[#fafafa] p-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#9b9b9b]">
                    Email address
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-black">
                    {email.trim() || "No email entered"}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#e9e9e9] bg-[#fafafa] p-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#9b9b9b]">
                    Participant details
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-black">
                    {age.trim() ? `${age} years old` : "Age not set"}
                  </p>
                  <p className="mt-1 text-[15px] text-[#5b5b5b]">
                    {gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : "Gender not set"}
                  </p>
                  <p className="mt-1 text-[15px] text-[#5b5b5b]">
                    {contactNumber.trim() ? `Contact: ${contactNumber.trim()}` : "Contact number not set"}
                  </p>
                  <p className="mt-1 text-[15px] text-[#5b5b5b]">
                    {gcashNumber.trim() ? `GCash: ${gcashNumber.trim()}` : "GCash not set"}
                  </p>
                </div>
                <div className="rounded-[18px] border border-[#e9e9e9] bg-[#fafafa] p-5">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-[#9b9b9b]">
                    Password
                  </p>
                  <p className="mt-1 text-[15px] text-[#5b5b5b]">
                    Password is set and will be submitted securely.
                  </p>
                </div>
                <p className="text-[14px] text-[#5b5b5b]">
                  This account will be created as a tester and saved to the database.
                </p>
              </div>
            )}

            {error && (
              <p className="text-red-600 text-[14px] mt-6 mb-2 text-center">
                {error}
              </p>
            )}

            <div className={`mt-8 flex flex-col gap-3 ${step === 0 ? "items-center" : "sm:flex-row"}`}>
              {step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="h-[54px] flex-1 rounded-full border border-[#d7d7d7] text-[18px] font-semibold text-[#444] hover:bg-[#fafafa] transition-colors"
                >
                  Back
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className={`h-[54px] bg-red-600 text-white rounded-full text-[18px] font-semibold hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-3 ${step === 0 ? "w-full max-w-[280px]" : "flex-1"
                    }`}
                >
                  Next
                </button>
              ) : accountCreated ? (
                <button
                  type="button"
                  onClick={handleProceedToConsent}
                  className="h-[54px] flex-1 bg-red-600 text-white rounded-full text-[18px] font-semibold hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-3"
                >
                  Proceed to informed consent
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="h-[54px] flex-1 bg-red-600 text-white rounded-full text-[18px] font-semibold hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-3"
                >
                  {loading ? "Creating..." : "Create account"}
                </button>
              )}
            </div>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="text-[14px] font-semibold text-red-700 hover:underline"
              >
                Already have an account? Go to login
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
