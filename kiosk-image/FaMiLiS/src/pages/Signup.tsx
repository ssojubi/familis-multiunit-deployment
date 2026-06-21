import { useEffect, useId, useState } from "react";
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
        d="M12 12.5a4.5 4.5 0 1 0-4.5-4.5 4.5 4.5 0 0 0 4.5 4.5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5.5 19.5a6.5 6.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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

function IconSpark(props: { className?: string; size?: number }) {
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
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 14.5l.8 2.1L21.5 17l-2.2.4-.8 2.1-.8-2.1-2.2-.4 2.2-.4.8-2.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function getStoredUserRole() {
  try {
    const raw = localStorage.getItem("familis.user");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { role?: unknown };
    return typeof parsed?.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

export default function Signup() {
  const navigate = useNavigate();
  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();

  useEffect(() => {
    if (hasStoredUser()) {
      const role = getStoredUserRole();
      navigate(role === "tester" ? "/tester-consent" : "/dashboard", {
        replace: true,
      });
    }
  }, [navigate]);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Unable to create the account.";
        setError(msg);
        return;
      }

      try {
        if (data?.user) {
          localStorage.setItem("familis.user", JSON.stringify(data.user));
        }
      } catch {
        // ignore storage failures
      }

      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/tester-consent", { replace: true });
    } catch (err) {
      console.error(err);
      setError("Unable to reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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
          className="w-full max-w-[560px] overflow-hidden rounded-[48px] shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#fff" }}
        >
          <div className="bg-red-600 px-10 pt-10 pb-9 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-white text-[13px] font-semibold tracking-[0.12em] uppercase">
              <IconSpark size={16} className="text-white" />
              Tester signup
            </div>
            <h2 className="text-white text-[34px] font-bold mt-4">
              Create your account
            </h2>
            <p className="text-white/95 text-[16px] font-semibold mt-2">
              For non-admin participants and testers only.
            </p>
          </div>

          <div className="bg-white px-10 py-9">
            <form onSubmit={handleSignup} noValidate>
              <div className="mb-5">
                <label
                  htmlFor={usernameId}
                  className="text-black text-[18px] font-medium block mb-3"
                  style={{ fontFamily: "'Roboto', sans-serif" }}
                >
                  <span className="inline-flex items-center gap-3">
                    <IconUser size={20} className="text-red-600" />
                    Username
                  </span>
                </label>
                <input
                  id={usernameId}
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Your display name"
                  className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                  style={{ fontFamily: "'Albert Sans', sans-serif" }}
                />
              </div>

              <div className="mb-5">
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

              <div className="mb-5">
                <label
                  htmlFor={passwordId}
                  className="text-black text-[18px] font-medium block mb-3"
                  style={{ fontFamily: "'Roboto', sans-serif" }}
                >
                  <span className="inline-flex items-center gap-3">
                    <IconLock size={20} className="text-red-600" />
                    Password
                  </span>
                </label>
                <input
                  id={passwordId}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
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
                  placeholder="Repeat your password"
                  className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                  style={{ fontFamily: "'Albert Sans', sans-serif" }}
                />
              </div>

              {error && (
                <p className="text-red-600 text-[14px] mb-4 text-center">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-red-600 text-white h-[60px] rounded-full text-[22px] font-semibold hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-3"
              >
                <IconSpark size={24} className="text-white" />
                <span>{loading ? "Creating account..." : "Sign Up"}</span>
              </button>

              <button
                type="button"
                onClick={() => navigate("/")}
                className="mt-4 w-full h-[54px] rounded-full border border-red-600 text-red-600 text-[18px] font-semibold hover:bg-red-50 transition-colors"
              >
                Already have an account? Log in
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}