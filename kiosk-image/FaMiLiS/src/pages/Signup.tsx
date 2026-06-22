// @ts-nocheck
import React, { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { hasStoredUser } from "../RequireAuth";
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
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasStoredUser()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

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

  const handleNext = () => {
    setError("");
    if (!validateCurrentStep()) {
      return;
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setError("");
    setStep((current) => Math.max(current - 1, 0));
  };

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (step !== STEPS.length - 1) {
      if (validateCurrentStep()) {
        setStep((current) => Math.min(current + 1, STEPS.length - 1));
      }
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
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: displayName.trim(),
          email: email.trim(),
          password,
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
      } catch {
        // ignore storage failures
      }

      navigate("/tester-consent", { replace: true });
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
              Create Tester Account
            </h2>
            <p className="text-white/95 text-[16px] font-semibold mt-2">
              Sign up as a participant.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {STEPS.map((label, index) => {
                const active = index === step;
                const done = index < step;
                return (
                  <div
                    key={label}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors ${
                      active
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
                    Password
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-black">
                    {password ? `${password.length} characters set` : "Not set"}
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

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="h-[54px] flex-1 rounded-full border border-[#d7d7d7] text-[18px] font-semibold text-[#444] hover:bg-[#fafafa] transition-colors"
                >
                  Back
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="h-[54px] flex-1 rounded-full border border-[#d7d7d7] text-[18px] font-semibold text-[#444] hover:bg-[#fafafa] transition-colors"
                >
                  Login
                </button>
              )}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  className="h-[54px] flex-1 bg-red-600 text-white rounded-full text-[18px] font-semibold hover:bg-red-700 transition-colors inline-flex items-center justify-center gap-3"
                >
                  Next
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