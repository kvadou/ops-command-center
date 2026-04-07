import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation, Link } from "react-router-dom";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get token directly from window.location FIRST (before React Router processes it)
  // This ensures we capture it even if React Router loses query params
  const getTokenFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('token');
  };
  
  // Try multiple methods to get the token
  const tokenFromWindow = getTokenFromUrl();
  const tokenFromSearchParams = searchParams.get("token");
  const tokenFromLocation = new URLSearchParams(location.search).get("token");
  const token = tokenFromWindow || tokenFromLocation || tokenFromSearchParams;
  
  // Debug logging
  console.log('ResetPassword - Full URL:', window.location.href);
  console.log('ResetPassword - Window location search:', window.location.search);
  console.log('ResetPassword - Location.search:', location.search);
  console.log('ResetPassword - Token from window:', tokenFromWindow ? tokenFromWindow.substring(0, 20) + '...' : 'none');
  console.log('ResetPassword - Token from location:', tokenFromLocation ? tokenFromLocation.substring(0, 20) + '...' : 'none');
  console.log('ResetPassword - Token from searchParams:', tokenFromSearchParams ? tokenFromSearchParams.substring(0, 20) + '...' : 'none');
  console.log('ResetPassword - Final token:', token ? token.substring(0, 20) + '...' : 'none');
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [actualToken, setActualToken] = useState(null);

  // Capture token from URL immediately on mount (before React Router can lose it)
  useEffect(() => {
    // First, try to get token from sessionStorage (in case we already captured it)
    const storedToken = sessionStorage.getItem('passwordResetToken');
    
    // Get token directly from window.location - this runs immediately
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    console.log('Initial mount - window.location.href:', window.location.href);
    console.log('Initial mount - window.location.search:', window.location.search);
    console.log('Initial mount - token from URL:', tokenFromUrl ? tokenFromUrl.substring(0, 20) + '...' : 'none');
    console.log('Initial mount - token from sessionStorage:', storedToken ? storedToken.substring(0, 20) + '...' : 'none');
    
    // Use token from URL if available, otherwise use stored token
    const tokenToUse = tokenFromUrl || storedToken;
    
    if (tokenToUse) {
      setActualToken(tokenToUse);
      // Store in sessionStorage as backup
      sessionStorage.setItem('passwordResetToken', tokenToUse);
    }
  }, []); // Run only once on mount

  useEffect(() => {
    // Use actualToken if available, otherwise fall back to token from searchParams
    const tokenToUse = actualToken || token;
    
    // Verify token on mount
    if (!tokenToUse) {
      setIsValidating(false);
      setIsValidToken(false);
      setErrorMessage("No reset token provided.");
      return;
    }

    const verifyToken = async () => {
      try {
        // Use the token we captured
        const tokenToVerify = actualToken || token;
        // URL encode the token to ensure it's properly sent
        const encodedToken = encodeURIComponent(tokenToVerify);
        const response = await fetch(`/api/verify-reset-token?token=${encodedToken}`);
        const data = await response.json();

        if (!response.ok || !data.valid) {
          setIsValidToken(false);
          setErrorMessage(data.msg || "Invalid or expired reset token.");
        } else {
          setIsValidToken(true);
        }
      } catch (err) {
        console.error("Error verifying token:", err);
        setIsValidToken(false);
        setErrorMessage("Error verifying reset token. Please try again.");
      } finally {
        setIsValidating(false);
      }
    };

    verifyToken();
  }, [actualToken, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    setIsLoading(true);

    try {
      // Use the token we captured
      const tokenToUse = actualToken || token;
      const response = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToUse, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErrorMessage(data.msg || "Failed to reset password. Please try again.");
        return;
      }

      setSuccessMessage("Password has been reset successfully! Redirecting to login...");
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      console.error("Error resetting password:", err);
      setErrorMessage("An error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-white">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Verifying reset token...</p>
        </div>
      </div>
    );
  }

  if (!isValidToken) {
    return (
      <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-white">
        <div className="sm:mx-auto sm:w-full sm:max-w-sm">
          <div className="mx-auto mb-8 flex items-center justify-center">
            <svg width="96" height="96" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="80" height="80" rx="20" fill="#6366f1" />
              <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
              <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
            </svg>
          </div>
          <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-neutral-900">
            Invalid Reset Link
          </h2>
          {errorMessage && (
            <div className="mt-4 text-red-500 text-sm text-center">{errorMessage}</div>
          )}
          <div className="mt-6 text-center">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-purple-600 hover:text-purple-500"
            >
              Request a new reset link
            </Link>
          </div>
          <div className="mt-4 text-center">
            <Link
              to="/login"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 lg:px-8 bg-white">
      <div className="sm:mx-auto sm:w-full sm:max-w-sm">
        <div className="mx-auto mb-8 flex items-center justify-center">
          <svg width="96" height="96" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="80" height="80" rx="20" fill="#6366f1" />
            <text x="40" y="34" textAnchor="middle" fill="white" fontSize="28" fontWeight="700" fontFamily="Poppins, sans-serif">A</text>
            <text x="40" y="56" textAnchor="middle" fill="white" fontSize="14" fontWeight="500" fontFamily="Poppins, sans-serif" opacity="0.85">OPS</text>
          </svg>
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold leading-9 tracking-tight text-neutral-900">
          Set new password
        </h2>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Please enter your new password below.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium leading-6 text-neutral-900"
            >
              New Password
            </label>
            <div className="mt-2">
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Enter new password"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium leading-6 text-neutral-900"
            >
              Confirm Password
            </label>
            <div className="mt-2">
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="block w-full rounded-md border-0 py-1.5 text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 placeholder:text-neutral-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          {errorMessage && (
            <div className="text-red-500 text-sm">{errorMessage}</div>
          )}

          {successMessage && (
            <div className="text-green-600 text-sm bg-green-50 p-3 rounded-md">
              {successMessage}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full justify-center rounded-md bg-purple-600 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Resetting..." : "Reset password"}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              Back to login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
