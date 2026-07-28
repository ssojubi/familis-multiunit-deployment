import {
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { useEffect, useState } from "react";

export default function RequireAuth() {
  const location = useLocation();
  const [state, setState] = useState<"checking" | "authenticated" | "anonymous">(
    "checking",
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.user) {
          setState("anonymous");
          return;
        }
        localStorage.setItem("familis.user", JSON.stringify(data.user));
        localStorage.setItem("user", JSON.stringify(data.user));
        setState("authenticated");
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setState("anonymous");
      });
    return () => controller.abort();
  }, []);

  if (state === "checking") {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f6f7fb] text-sm text-gray-600">
        Checking session...
      </div>
    );
  }

  if (state === "anonymous") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/" replace state={{ returnTo }} />;
  }
  return <Outlet />;
}
