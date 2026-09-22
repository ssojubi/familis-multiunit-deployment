import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { testerLandingPath } from "../RequireAuth";
import { apiFetch, setToken } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
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
    // Do not trust localStorage here: a previous tester login can otherwise
    // bounce an administrator away from the login form before they can switch
    // accounts. The HTTPS session cookie is the source of truth.
    const controller = new AbortController();
    void fetch("/api/auth/me", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user) return;
        localStorage.setItem("familis.user", JSON.stringify(data.user));
        navigate(data.user.role === "tester" ? testerLandingPath() : "/dashboard", { replace: true });
      })
      .catch(() => undefined);
    return () => controller.abort();
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
      const res = await apiFetch("/api/login", {
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
        if (typeof data?.token === "string") {
          setToken(data.token);
        }
      } catch {
        // ignore storage failures
      }

      const role = data?.user?.role;
      if (role === "tester") {
        navigate(testerLandingPath());
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
    <PageHeader
      shell="minimal"
      variant="expanded"
      onLogoClick={() => navigate("/")}
      logoAriaLabel="Go to home"
    >
      <div
        className="min-h-full relative flex items-center justify-center px-6 py-10"
        style={{
          backgroundImage: `url(${loginBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div
          className="w-full max-w-[560px] overflow-hidden rounded-[48px] shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          style={{ backgroundColor: "#fff" }}
        >
          <div className="bg-[#e8174a] px-10 pt-10 pb-9 text-center">
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
                    <IconMail size={20} className="text-[#e8174a]" />
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
                  className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-[#e8174a]/60"
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
                    <IconLock size={20} className="text-[#e8174a]" />
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
                  className="w-full h-[50px] px-7 border border-[#bfbfbf] rounded-[10px] text-[16px] text-black placeholder:text-[#bdb4b4] focus:outline-none focus:border-[#e8174a]/60"
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
                className="w-full bg-[#e8174a] text-white h-[60px] rounded-full text-[22px] font-semibold hover:bg-[#c9143f] disabled:bg-[#e8174a]/50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-3"
              >
                <IconLogin size={28} className="text-white" />
                <span>{loading ? "Logging in..." : "Login"}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </PageHeader>
  );
}
