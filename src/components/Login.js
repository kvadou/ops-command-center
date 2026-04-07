import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const ERROR_MESSAGES = {
  google_denied: "Sign-in was cancelled. Please try again.",
  google_failed: "Something went wrong with Google sign-in. Please try again.",
  domain_not_allowed: "Your email domain isn't authorized. Use your @acmeops.com or @chessat3.com account.",
  no_access: "You don't have access to this application. Contact Doug to request access.",
};

export default function Login() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get("error");

  // If the server redirected back here after a successful Google login
  // (shouldn't normally happen — callback goes to /home), clear any stale state
  useEffect(() => {
    // Check if we already have a valid cookie session
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.user) window.location.href = "/";
      })
      .catch(() => {});
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = "/auth/google";
  };

  const handleDemoLogin = async () => {
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        window.location.href = "/";
      }
    } catch (err) {
      console.error("Demo login failed:", err);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-brand-navy via-brand-purple to-brand-navy px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex items-center justify-center">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="80" height="80" rx="20" fill="#6366f1" />
              <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
              <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Operations Hub
          </h1>
          <p className="text-white/60 text-sm mt-1">Acme Operations</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-1 text-center">
            Welcome back
          </h2>
          <p className="text-sm text-neutral-500 text-center mb-8">
            Sign in with your Acme Operations Google account
          </p>

          {error && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {ERROR_MESSAGES[error] || "An error occurred. Please try again."}
            </div>
          )}

          <button
            onClick={handleDemoLogin}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition-all shadow-sm hover:shadow-md font-medium text-white text-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Enter Demo
          </button>

          <p className="mt-6 text-center text-xs text-neutral-400">
            Portfolio demo — explore the full operations platform
          </p>
        </div>
      </div>
    </div>
  );
}
