import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { hasStoredUser } from "../RequireAuth";
import logo from "../assets/logo.png";
import loginBg from "../assets/login-bg.png";

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

function IconLogin(props: { className?: string; size?: number }) {
  const size = props.size ?? 28;
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
        d="M11 16l4-4-4-4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 12h10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M14 7h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const emailId = useId();
  const passwordId = useId();

  useEffect(() => {
    if (hasStoredUser()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(false);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    try {
      setLoading(true);
      const apiBase = window.location.hostname === 'localhost'
        ? 'https://localhost:8888'
        : `https://${window.location.hostname}:8888`;
      const res = await fetch(`${apiBase}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg = data?.error || "Invalid email or password.";
        setError(msg);
        setLoading(false);
        return;
      }

      try {
        if (data?.user) {
          localStorage.setItem("familis.user", JSON.stringify(data.user));
        }
      } catch {
        // ignore storage failures
      }

      const role = data.user?.role;
      if (role === "staff") { // NOTE : might want to change that
        navigate(`/kiosk?room=`);
      } else {
        navigate("/dashboard");
      }

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
          aria-label="Go to home"
        >
          <img src={logo} alt="FaMiLis logo" className="w-[50px] h-[50px] object-contain" />
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
            <div className="flex justify-center mb-2">
            </div>
            <h2 className="text-white text-[34px] font-bold mt-2">
              Welcome Back!
            </h2>
            <p className="text-white/95 text-[16px] font-semibold mt-2">
              Login to start testing!
            </p>
          </div>

          <div className="bg-white px-10 py-9">
            <form onSubmit={handleLogin} noValidate>
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
                  placeholder="admin@familis.com"
                  className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-red-400"
                  style={{ fontFamily: "'Albert Sans', sans-serif" }}
                />
              </div>

              <div className="mb-6">
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
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
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
                <IconLogin size={28} className="text-white" />
                <span>{loading ? "Logging in..." : "Login"}</span>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
