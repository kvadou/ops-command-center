import * as Sentry from '@sentry/react';

/**
 * Initialize Sentry for frontend error tracking and performance monitoring
 * Set VITE_SENTRY_DSN environment variable with your Sentry DSN
 */
export function initSentry() {
  // Check both VITE_ and REACT_APP_ prefixes for compatibility
  const dsn = import.meta.env.VITE_SENTRY_DSN || import.meta.env.REACT_APP_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  if (dsn.includes('your-frontend-dsn') || dsn.includes('your-backend-dsn')) {
    return;
  }

  const environment = import.meta.env.MODE || 'development';
  const release = import.meta.env.VITE_APP_VERSION || 'unknown';

  Sentry.init({
    dsn,
    environment,
    release,

    // Performance Monitoring
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Don't mask everything - just sensitive fields
        maskAllText: false,
        blockAllMedia: false,
        // Mask specific sensitive elements
        mask: ['.sensitive', '[data-sentry-mask]', 'input[type="password"]', '.credit-card'],
        // Block specific elements from being recorded
        block: ['.sentry-block', '[data-sentry-block]'],
        // Mask all inputs by default (can unmask specific ones)
        maskAllInputs: true,
        // Network request/response body capture
        networkDetailAllowUrls: [window.location.origin],
        networkCaptureBodies: true,
        // Note: Replay integration may trigger browser deprecation warnings about DOMNodeInserted.
        // This is a known Sentry issue and doesn't affect functionality. The warnings are suppressed
        // in src/index.js console overrides, but browser-level deprecation warnings cannot be
        // completely suppressed via JavaScript.
      }),
      // Capture user feedback after errors - temporarily disabled until backend is configured
      // Sentry.feedbackIntegration({
      //   colorScheme: 'light',
      //   showBranding: false,
      //   buttonLabel: 'Report a Bug',
      //   submitButtonLabel: 'Send Report',
      //   formTitle: 'Report an Issue',
      //   messagePlaceholder: 'What happened? What did you expect?',
      // }),
    ],

    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Adjust this value in production
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

    // Capture Replay for 10% of all sessions,
    // plus 100% of sessions with an error
    replaysSessionSampleRate: environment === 'production' ? 0.1 : 0.5,
    replaysOnErrorSampleRate: 1.0,

    // Filter out sensitive data
    beforeSend(event, hint) {
      // Remove sensitive data from URLs
      if (event.request?.url) {
        const url = new URL(event.request.url);
        if (url.searchParams.has('token')) url.searchParams.delete('token');
        if (url.searchParams.has('password')) url.searchParams.delete('password');
        event.request.url = url.toString();
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data?.url) {
            try {
              const url = new URL(breadcrumb.data.url);
              if (url.searchParams.has('token')) url.searchParams.delete('token');
              if (url.searchParams.has('password')) url.searchParams.delete('password');
              breadcrumb.data.url = url.toString();
            } catch (e) {
              // Invalid URL, skip
            }
          }
          return breadcrumb;
        });
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser errors
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // Network errors
      'Network request failed',
      'NetworkError',
      'Failed to fetch',
      // Common bot/extension errors
      'top.GLOBALS',
      'originalCreateNotification',
      'canvas.contentDocument',
      'MyApp_RemoveAllHighlights',
      // React errors that are handled
      'cancelled',
      'Minified React error',
    ],
  });

}

/**
 * Manually capture an exception
 */
export function captureException(error, context = {}) {
  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Manually capture a message
 */
export function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Add user context to Sentry events
 */
export function setUser(user) {
  Sentry.setUser(user);
}

/**
 * Add custom context to Sentry events
 */
export function setContext(name, context) {
  Sentry.setContext(name, context);
}

/**
 * Create a Sentry error boundary wrapper
 */
export const ErrorBoundary = Sentry.ErrorBoundary;

export default Sentry;
