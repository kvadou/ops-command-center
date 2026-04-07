
// Suppress known warnings from third-party libraries
// This MUST run before React imports to catch all warnings
const originalError = console.error;
const originalWarn = console.warn;
const originalDebug = console.debug;
const originalLog = console.log;

const shouldSuppress = (arg) => {
  if (typeof arg === 'string') {
    const lowerArg = arg.toLowerCase();
    // Suppress ANY findDOMNode warning (ReactQuill is in the stack trace, not always in the message)
    // Also suppress DOMNodeInserted deprecation warnings from Quill and Sentry
    // Suppress React DevTools download messages
    // Use simple keyword matching to catch all variations
    return (
      lowerArg.includes('finddomnode') ||
      lowerArg.includes('domnodeinserted') ||
      lowerArg.includes('mutation event') ||
      lowerArg.includes('listener added') ||
      lowerArg.includes('listener added for a') ||
      lowerArg.includes('download the react devtools') ||
      lowerArg.includes('react devtools') ||
      (lowerArg.includes('deprecation') && (lowerArg.includes('domnode') || lowerArg.includes('mutation') || lowerArg.includes('quill') || lowerArg.includes('react-quill') || lowerArg.includes('sentry'))) ||
      lowerArg.includes('support for this event type has been removed') ||
      lowerArg.includes('chromestatus.com/feature/5083947249172480') ||
      lowerArg.includes('scroll2') || // Quill's Scroll class
      lowerArg.includes('react-quill') || // Any react-quill related warnings
      lowerArg.includes('sentry_react') || // Sentry React SDK warnings
      lowerArg.includes('sentry-react') || // Sentry React SDK warnings (hyphenated)
      (lowerArg.includes('quill') && lowerArg.includes('deprecation')) || // Quill deprecation warnings
      (lowerArg.includes('react-quill.js') && lowerArg.includes('deprecation')) || // react-quill.js deprecation
      (lowerArg.includes('sentry') && (lowerArg.includes('domnodeinserted') || lowerArg.includes('mutation event') || lowerArg.includes('deprecation'))) // Sentry deprecation warnings
    );
  }
  if (typeof arg === 'object' && arg !== null) {
    try {
      const messageStr = JSON.stringify(arg);
      const lowerStr = messageStr.toLowerCase();
      return (
        messageStr.includes('findDOMNode') ||
        messageStr.includes('DOMNodeInserted') ||
        (lowerStr.includes('react devtools')) ||
        (messageStr.includes('findDOMNode is deprecated'))
      );
    } catch (e) {
      const str = String(arg);
      return (
        str.includes('findDOMNode') ||
        str.includes('DOMNodeInserted') ||
        str.toLowerCase().includes('react devtools')
      );
    }
  }
  try {
    const str = String(arg);
    return (
      str.includes('findDOMNode') ||
      str.includes('DOMNodeInserted') ||
      str.toLowerCase().includes('react devtools')
    );
  } catch (e) {
    return false;
  }
};

const checkAndSuppress = (args) => {
  // Check all arguments, including the stack trace
  // Join all args into a single string to check the full message including stack traces
  const fullMessage = args.map(arg => {
    if (typeof arg === 'string') {
      return arg;
    }
    try {
      return JSON.stringify(arg);
    } catch (e) {
      return String(arg);
    }
  }).join(' ').toLowerCase();
  
  // Check the full message (including stack traces which contain ReactQuill or Quill)
  // Also check individual args
  const lowerFullMessage = fullMessage.toLowerCase();
  
  // More aggressive checks for react-quill/Quill deprecation warnings
  const isQuillDeprecation = 
    lowerFullMessage.includes('react-quill') ||
    lowerFullMessage.includes('react-quill.js') ||
    (lowerFullMessage.includes('quill') && (lowerFullMessage.includes('domnodeinserted') || lowerFullMessage.includes('deprecation') || lowerFullMessage.includes('mutation event'))) ||
    (lowerFullMessage.includes('scroll2') && (lowerFullMessage.includes('domnodeinserted') || lowerFullMessage.includes('deprecation'))) ||
    (lowerFullMessage.includes('domnodeinserted') && (lowerFullMessage.includes('quill') || lowerFullMessage.includes('react-quill') || lowerFullMessage.includes('scroll2')));
  
  // Check for Sentry-specific deprecation warnings
  const isSentryDeprecation =
    lowerFullMessage.includes('sentry_react') ||
    lowerFullMessage.includes('sentry-react') ||
    (lowerFullMessage.includes('sentry') && (lowerFullMessage.includes('domnodeinserted') || lowerFullMessage.includes('mutation event') || lowerFullMessage.includes('deprecation'))) ||
    (lowerFullMessage.includes('domnodeinserted') && lowerFullMessage.includes('sentry'));
  
  return shouldSuppress(fullMessage) || 
         args.some(arg => shouldSuppress(arg)) ||
         isQuillDeprecation ||
         isSentryDeprecation;
};

console.error = (...args) => {
  if (!checkAndSuppress(args)) {
    originalError.apply(console, args);
  }
};

console.warn = (...args) => {
  if (!checkAndSuppress(args)) {
    originalWarn.apply(console, args);
  }
};

console.debug = (...args) => {
  // More aggressive suppression for debug messages (where deprecation warnings often appear)
  const fullMessage = args.map(arg => {
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg); } catch (e) { return String(arg); }
  }).join(' ').toLowerCase();
  
  // Suppress if it contains DOMNodeInserted or react-quill/Sentry related warnings
  if (fullMessage.includes('domnodeinserted') || 
      fullMessage.includes('mutation event') ||
      fullMessage.includes('listener added') ||
      fullMessage.includes('react-quill') ||
      fullMessage.includes('react-quill.js') ||
      fullMessage.includes('scroll2') ||
      fullMessage.includes('sentry_react') ||
      fullMessage.includes('sentry-react') ||
      (fullMessage.includes('quill') && (fullMessage.includes('deprecation') || fullMessage.includes('domnodeinserted'))) ||
      (fullMessage.includes('deprecation') && (fullMessage.includes('quill') || fullMessage.includes('react-quill'))) ||
      (fullMessage.includes('sentry') && (fullMessage.includes('domnodeinserted') || fullMessage.includes('mutation event') || fullMessage.includes('deprecation')))) {
    return; // Suppress completely
  }
  
  if (!checkAndSuppress(args)) {
    originalDebug.apply(console, args);
  }
};

console.log = (...args) => {
  // Suppress deprecation warnings that come through console.log
  if (!checkAndSuppress(args)) {
    originalLog.apply(console, args);
  }
};

// Also override console.info in case deprecation warnings come through there
const originalInfo = console.info;
console.info = (...args) => {
  if (!checkAndSuppress(args)) {
    originalInfo.apply(console, args);
  }
};

import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
// reportWebVitals removed for Vite compatibility - can be added back if needed
// import reportWebVitals from "./reportWebVitals";
import { ThemeProvider, createTheme } from "@mui/material/styles";

// Initialize Sentry for error tracking
import { initSentry, ErrorBoundary } from "./utils/sentry-frontend";
initSentry();

const theme = createTheme();

// Vite uses import.meta.env instead of process.env
const isProduction = import.meta.env.PROD;
if (isProduction) {
  // In production, also suppress all non-error console methods
  // (but keep the suppression above for known warnings in dev too)
  ['log','info','trace'].forEach(k => (console[k] = () => {}));
}

// Capture staff and owner parameters from URL before React Router processes it
// This runs before React Router initializes, so we can preserve the parameters
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);

  // Staff discount param
  const hasStaffParam = urlParams.get("staff") === "true";
  console.log('[Staff Discount] index.js check - URL:', window.location.href);
  console.log('[Staff Discount] index.js check - hasStaff:', hasStaffParam);
  if (hasStaffParam) {
    sessionStorage.setItem('staff_booking_param', 'true');
    console.log('[Staff Discount] ✅ Captured staff param in index.js, stored in sessionStorage');
  }

  // Owner discount param
  const hasOwnerParam = urlParams.get("owner") === "true";
  console.log('[Owner Discount] index.js check - URL:', window.location.href);
  console.log('[Owner Discount] index.js check - hasOwner:', hasOwnerParam);
  if (hasOwnerParam) {
    sessionStorage.setItem('owner_booking_param', 'true');
    console.log('[Owner Discount] ✅ Captured owner param in index.js, stored in sessionStorage');
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));

// Auto-refresh on chunk load errors (stale JS after deploys), fallback UI for other errors
function AppErrorFallback({ error }) {
  const isChunkError =
    error?.name === 'ChunkLoadError' ||
    /loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(error?.message);

  React.useEffect(() => {
    if (isChunkError) {
      const reloadKey = 'chunk_error_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 60000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
  }, [isChunkError]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Poppins, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', color: '#1a1a1a', marginBottom: '8px' }}>
        {isChunkError ? 'A new version is available' : 'Something went wrong'}
      </h1>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        {isChunkError ? 'Refreshing to load the latest version...' : "We've been notified and are looking into it."}
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '8px 20px', background: '#6A469D', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px' }}
      >
        Reload Page
      </button>
    </div>
  );
}

root.render(
  <ErrorBoundary fallback={(errorData) => <AppErrorFallback error={errorData.error} />}>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
);
