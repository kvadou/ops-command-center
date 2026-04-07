import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import { useRef } from "react";
import DOMPurify from "dompurify";
import PolicyModal from "./PolicyModal";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { isValidPhoneNumber } from "libphonenumber-js";

import {
  Box,
  Button,
  Typography,
  TextField,
  Autocomplete,
} from "@mui/material";
import { DateTime } from "luxon";
import { v4 as uuidv4 } from "uuid";
import SignatureCanvas from "react-signature-canvas";
import { useLocation, useSearchParams } from "react-router-dom";
import { CheckCircleIcon as CheckCircleOutlineIcon } from '@heroicons/react/24/outline';
import { loadStripe } from "@stripe/stripe-js";
import PaymentPlanSelector from "./PaymentPlanSelector";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { State, City } from "../utils/usStatesAndCities";
import moment from "moment-timezone";
import { sendPageViewToServer, generateEventId } from "../utils/metaTracking";
import { useToast } from '../hooks/useToast';

countries.registerLocale(enLocale);

// Vite uses import.meta.env instead of process.env
// Support both VITE_ prefix (Vite) and REACT_APP_ prefix (legacy/Heroku)
// Also fetch from API endpoint at runtime for production builds
const STATIC_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
                               import.meta.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;

// Create Stripe promise factory function
// This will be called with the publishable key once fetched from API
const createStripePromise = (publishableKey) => {
  if (!publishableKey) {
    return Promise.resolve(null);
  }
  
  return loadStripe(publishableKey).catch((error) => {
    console.error('[Stripe] Failed to load Stripe.js:', error);
    console.error('[Stripe] PUBLISHABLE_KEY exists:', !!publishableKey);
    console.error('[Stripe] PUBLISHABLE_KEY value:', publishableKey ? `${publishableKey.substring(0, 20)}...` : 'undefined');
    console.error('[Stripe] Check CSP and network connectivity');
    console.error('[Stripe] Error details:', error.message, error.stack);
    return null;
  });
};

// Create initial Stripe promise from static key if available
let stripePromise = STATIC_PUBLISHABLE_KEY 
  ? createStripePromise(STATIC_PUBLISHABLE_KEY)
  : Promise.resolve(null);

// Log Stripe initialization status
if (!STATIC_PUBLISHABLE_KEY) {
  console.warn('[Stripe] Static PUBLISHABLE_KEY not found in environment variables');
  console.warn('[Stripe] Will fetch from API endpoint at runtime');
}
const bookingOptions = [
  { label: "Online", price: 100 },
  { label: "In Home", price: 150 },
];

const studentTypeOptions = [
  "One Student",
  "Two Students",
  "Small Group (3+ Students)",
];
const bookingDetails = {
  Online: {
    title: "Online Tutoring",
    image: "https://via.placeholder.com/250?text=Online+Class",
    description:
      "Join our interactive online sessions from the comfort of your home. " +
      "Access live lessons, digital whiteboards, and recordings at your pace.",
  },
  "In Home": {
    title: "In-Home Tutoring",
    image: "https://via.placeholder.com/250?text=In-Home+Class",
    description:
      "Experience personalized, one-on-one instruction right in your living room. " +
      "Our expert tutors adapt to your home environment for maximum engagement.",
  },
};

const experienceLevels = [
  "Brand New (Never played before)",
  "Tried It Once or Twice",
  "Plays Often for Fun",
  "Plays Seriously or in Tournaments",
  "Not Sure",
];
const daysOfWeek = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const steps = ["Booking Details", "Student Info", "Day & Time", "Confirmation"];

// Step descriptions for home trials
const STEP_DESCRIPTIONS_TRIAL = {
  "Booking Details":
    "Share how we can reach you so we can hold your preferred spot.",
  "Student Info":
    "Tell us about your learners so we can match the perfect coach.",
  "Day & Time":
    "Pick the windows that work best and we'll coordinate the ideal tutor.",
  Confirmation:
    "Review the plan and lock in your trial with a quick digital signature.",
};

// Generic step descriptions for other booking types (tournaments, school lessons, etc.)
const STEP_DESCRIPTIONS_GENERIC = {
  "Booking Details": "",
  "Student Info": "",
  "Day & Time": "",
  Confirmation: "",
};

// Convert plain text with line breaks to HTML paragraphs
const convertTextToHtml = (text) => {
  if (!text) return "";
  
  let html = text;
  
  // If it already contains HTML tags, clean it up
  if (/<[a-z][\s\S]*>/i.test(text)) {
    // Remove empty paragraphs with just <br> tags
    html = html.replace(/<p>\s*<br\s*\/?>\s*<\/p>/gi, '');
    // Remove empty paragraphs
    html = html.replace(/<p>\s*<\/p>/gi, '');
    return html;
  }
  
  // Split by double line breaks (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  
  // Convert each paragraph, handling single line breaks within paragraphs
  return paragraphs.map(paragraph => {
    const lines = paragraph.split('\n').filter(line => line.trim());
    // If paragraph has multiple lines, join with <br>, otherwise just the text
    const content = lines.length > 1 
      ? lines.map(line => line.trim()).join('<br>')
      : paragraph.trim();
    return `<p>${content}</p>`;
  }).join('');
};

const generateTimeSlots = () => {
  const times = [];
  const startHour = 8;
  const endHour = 20;
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hour12 = h % 12 || 12;
      const amPm = h < 12 ? "AM" : "PM";
      const formattedTime = `${String(hour12).padStart(2, "0")}:${String(
        m
      ).padStart(2, "0")} ${amPm}`;
      times.push(formattedTime);
    }
  }
  return times;
};

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "wbraid",
  "gbraid",
];

// Only these UTM keys are allowed to be sent to Meta
const CLEAN_UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
];

const BOOKING_DRAFT_STORAGE_KEY = "acme:booking:draft:v1";
const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const AVAILABILITY_CHECK_DELAY_MS = 400;

function parseAttributionFromUrl(search) {
  const sp = new URLSearchParams(search || "");
  const utm = {};
  UTM_KEYS.forEach((k) => {
    const v = sp.get(k);
    if (v) utm[k] = v;
  });
  return {
    utm,
    landing_url: (typeof window !== "undefined" && window.location.href) || "",
    referrer: (typeof document !== "undefined" && document.referrer) || "",
  };
}

export default function BookingForms() {
  const toast = useToast();
  const sigPadRef = useRef(null);
  const draftSaveTimeoutRef = useRef(null);
  const restoringDraftRef = useRef(false);
  const availabilityTimeoutRef = useRef(null);
  const [policySections, setPolicySections] = useState([]);

  // Compute policy groups for dynamic checkbox rendering
  const policyGroups = useMemo(() => {
    const groups = {};
    policySections
      .filter((p) => p.show_on_form && p.checkbox_group)
      .forEach((p) => {
        if (!groups[p.checkbox_group]) {
          groups[p.checkbox_group] = {
            group: p.checkbox_group,
            checkbox_label: p.checkbox_label,
            policies: [],
          };
        }
        groups[p.checkbox_group].policies.push({
          slug: p.id,
          link_text: p.link_text,
        });
      });
    return Object.values(groups);
  }, [policySections]);

  const [attribution, setAttribution] = useState({
    utm: {},
    landing_url: "",
    referrer: "",
  });
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState({});
  const [studentErrors, setStudentErrors] = useState([]);
  const [confirmationErrors, setConfirmationErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateError, setDateError] = useState("");

  const [parentPhone, setParentPhone] = useState("");
  const [country, setCountry] = useState("US");
  const [sessionId, setSessionId] = useState(null);
  const { search } = useLocation();
  
  // Capture staff parameter from URL BEFORE React Router normalizes it
  // Check sessionStorage first (set by navigation listener), then current URL
  const initialStaffParamRef = useRef(null);
  if (initialStaffParamRef.current === null && typeof window !== 'undefined') {
    // First check sessionStorage (set by navigation listener in index.js)
    const storedStaffParam = sessionStorage.getItem('staff_booking_param');
    if (storedStaffParam === 'true') {
      initialStaffParamRef.current = true;
      console.log('[Staff Discount] ✅ Found staff param in sessionStorage');
      sessionStorage.removeItem('staff_booking_param'); // Clean up
    } else {
      // Fallback: check current URL
      const initialUrlParams = new URLSearchParams(window.location.search);
      initialStaffParamRef.current = initialUrlParams.get("staff") === "true";
      console.log('[Staff Discount] Initial URL check - hasStaff:', initialStaffParamRef.current);
      console.log('[Staff Discount] Initial URL check - fullUrl:', window.location.href);
      console.log('[Staff Discount] Initial URL check - search:', window.location.search);
    }
  }

  // Capture owner parameter from URL BEFORE React Router normalizes it
  // NOTE: Don't clear sessionStorage here - let useLayoutEffect do it after restoration
  const initialOwnerParamRef = useRef(null);
  if (initialOwnerParamRef.current === null && typeof window !== 'undefined') {
    const storedOwnerParam = sessionStorage.getItem('owner_booking_param');
    if (storedOwnerParam === 'true') {
      initialOwnerParamRef.current = true;
      console.log('[Owner Discount] ✅ Found owner param in sessionStorage');
      // Don't remove here - useLayoutEffect will clear it after using
    } else {
      const initialUrlParams = new URLSearchParams(window.location.search);
      initialOwnerParamRef.current = initialUrlParams.get("owner") === "true";
      console.log('[Owner Discount] Initial URL check - hasOwner:', initialOwnerParamRef.current);
    }
  }

  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionError, setSessionError] = useState("");
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policyScrollTo, setPolicyScrollTo] = useState(null); // slug to auto-scroll to
  const [parentFirstName, setParentFirstName] = useState("");
  const [parentLastName, setParentLastName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [bookingTypes, setBookingTypes] = useState([]);
  const [bookingType, setBookingType] = useState("");
  const [price, setPrice] = useState(0);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [studentInsights, setStudentInsights] = useState([]);
  const [availabilityFeedback, setAvailabilityFeedback] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  
  // Term billing state
  const [paymentPlan, setPaymentPlan] = useState('monthly'); // 'monthly' or 'term'
  const [termBillingConfig, setTermBillingConfig] = useState(null);
  const [prorationInfo, setProrationInfo] = useState(null);
  const [useTermBilling, setUseTermBilling] = useState(false);
  const [termBillingPrice, setTermBillingPrice] = useState(null); // Calculated price for term billing
  
  // Stripe publishable key state (fetched from API if not in env)
  const [stripePublishableKey, setStripePublishableKey] = useState(STATIC_PUBLISHABLE_KEY);
  const [stripePromiseState, setStripePromiseState] = useState(stripePromise);

  const ensureIsoWithZone = (iso) =>
    /Z|[+\-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
  const toDisplayDT = (iso, zone) =>
    DateTime.fromISO(iso).setZone(zone || "utc");

  const toUserZone = (isoUtc, zone) =>
    DateTime.fromISO(isoUtc, { zone: "utc" }).setZone(zone);

  const [submitted, setSubmitted] = useState(false);
  const [submissionId, setSubmissionId] = useState(null);
  const [clubSessions, setClubSessions] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [isLoadingClubSessions, setIsLoadingClubSessions] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const resumeRelative = useMemo(() => {
    if (!pendingDraft?.timestamp) return "";
    try {
      const relative = DateTime.fromMillis(pendingDraft.timestamp).toRelative();
      return relative || "recently";
    } catch {
      return "recently";
    }
  }, [pendingDraft?.timestamp]);

  const LEAD_FIRED_KEY = useMemo(
    () => (sessionId ? `leadFired:${sessionId}` : "leadFired:pending"),
    [sessionId]
  );

  const PAGEVIEW_FIRED_KEY = useMemo(
    () => (sessionId ? `cleanPageView:${sessionId}` : "cleanPageView:pending"),
    [sessionId]
  );

  // Helper function to track form events
  const trackFormEvent = async (eventType, stepName = null, stepNumber = null, metadata = {}) => {
    if (!sessionId) return;
    
    try {
      await fetch('/api/submissions/track-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          submissionId: submissionId || null,
          eventType,
          stepName,
          stepNumber,
          metadata,
        }),
      }).catch(err => console.error('Failed to track event:', err));
    } catch (err) {
      console.error('Error tracking form event:', err);
    }
  };

  // Fetch Stripe publishable key from API if not available in env
  useEffect(() => {
    // If we already have a static key, use it
    if (STATIC_PUBLISHABLE_KEY) {
      return;
    }
    
    // Fetch from API endpoint
    const fetchStripeKey = async () => {
      try {
        const response = await fetch('/api/config/stripe-publishable-key');
        if (!response.ok) {
          console.error('[Stripe] Failed to fetch publishable key from API:', response.status);
          return;
        }
        
        const data = await response.json();
        if (data.publishableKey) {
          console.log('[Stripe] Fetched publishable key from API');
          setStripePublishableKey(data.publishableKey);
          // Create new Stripe promise with the fetched key
          const newPromise = createStripePromise(data.publishableKey);
          setStripePromiseState(newPromise);
        }
      } catch (error) {
        console.error('[Stripe] Error fetching publishable key:', error);
      }
    };
    
    fetchStripeKey();
  }, []); // Run once on mount

  // Track form view when component mounts
  useEffect(() => {
    if (!sessionId) return;
    trackFormEvent('form_view', null, null, {});
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const found = parseAttributionFromUrl(search);

    const LOCAL_KEY = `attribution:${sessionId}`;
    const existing = (() => {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
      } catch {
        return {};
      }
    })();

    const merged = {
      utm: { ...(existing.utm || {}), ...(found.utm || {}), ...(preselectMarket ? { market: preselectMarket } : {}) },
      landing_url: existing.landing_url || found.landing_url,
      referrer: existing.referrer || found.referrer,
    };

    localStorage.setItem(LOCAL_KEY, JSON.stringify(merged));
    setAttribution(merged);

    // Send a clean PageView to Meta with only whitelisted UTM keys.
    try {
      const alreadySent = sessionStorage.getItem(PAGEVIEW_FIRED_KEY) === "1";
      if (!alreadySent && typeof window !== "undefined" && typeof window.fbq === "function") {
        const cleanParams = CLEAN_UTM_KEYS.reduce((acc, key) => {
          const val = merged?.utm?.[key];
          if (val != null && val !== "") acc[key] = val;
          return acc;
        }, {});
        
        // Generate event ID for deduplication
        const eventId = generateEventId("PageView", sessionId);
        
        // Send pixel event
        window.fbq("track", "PageView", cleanParams);
        
        // Also send server-side for better Conversions API coverage
        sendPageViewToServer({
          url: merged?.landing_url || window.location.href,
          referrer: merged?.referrer || document.referrer,
          eventId: eventId, // Use same event ID for deduplication
        });
        
        sessionStorage.setItem(PAGEVIEW_FIRED_KEY, "1");
      }
    } catch (err) {
      console.warn("Failed to send clean PageView to Meta:", err);
    }
  }, [sessionId, search]);

  useEffect(() => {
    const alreadyFired = sessionStorage.getItem(LEAD_FIRED_KEY) === "1";

    if (step === 1 && !alreadyFired) {
      const eventId = `lead-${sessionId || "temp"}`;

      console.log(" Pixel Lead event firing now", {
        eventId,
        step,
        sessionId,
      });

      if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq("track", "Lead", {}, { eventID: eventId });
      } else {
        console.warn("⚠️ fbq not found — Pixel might not be loaded");
      }

      sessionStorage.setItem(LEAD_FIRED_KEY, "1");
    } else if (step === 1 && alreadyFired) {
      console.log("ℹ️ Pixel Lead already fired for this session — skipping");
    }
  }, [step, LEAD_FIRED_KEY, sessionId]);

  // Track form view (landing page view) when sessionId and attribution are ready
  useEffect(() => {
    if (!sessionId || !attribution.landing_url) return;

    // Track form view only once per session
    const VIEW_TRACKED_KEY = `formViewTracked:${sessionId}`;
    const alreadyTracked = sessionStorage.getItem(VIEW_TRACKED_KEY) === "1";

    if (!alreadyTracked) {
      const params = new URLSearchParams(search);
      const bookingTypeId = params.get("bookingTypeId");
      const serviceId = params.get("serviceId");

      fetch("/api/submissions/track-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          attribution,
          bookingTypeId: bookingTypeId || null,
          serviceId: serviceId || null,
        }),
      })
        .then((res) => {
          if (res.ok) {
            sessionStorage.setItem(VIEW_TRACKED_KEY, "1");
            console.log("✅ Form view tracked");
          } else {
            console.warn("⚠️ Failed to track form view:", res.statusText);
          }
        })
        .catch((err) => {
          console.warn("⚠️ Error tracking form view:", err);
        });
    }
  }, [sessionId, attribution, search]);

  const params = new URLSearchParams(search);
  const preselectServiceId = searchParams.get("serviceId") || params.get("serviceId");
  const preselectBookingTypeId = searchParams.get("bookingTypeId") || params.get("bookingTypeId");

  // Check URL directly for staff/owner parameters (before React Router normalizes it)
  const urlParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

  // Tutor pre-selection from public profile page: ?tutorId=123&tutorName=Aaron+Long
  const preferredTutorId = searchParams.get("tutorId") || params.get("tutorId") || urlParams.get("tutorId");
  const preferredTutorName = searchParams.get("tutorName") || params.get("tutorName") || urlParams.get("tutorName");

  // City landing page params: ?type=home|online pre-selects lesson type, ?market=nyc|la|hamptons stored in attribution
  const preselectType = searchParams.get("type") || params.get("type") || urlParams.get("type");
  const preselectMarket = searchParams.get("market") || params.get("market") || urlParams.get("market");
  const urlHasStaffParam = urlParams.get("staff") === "true";
  const urlHasOwnerParam = urlParams.get("owner") === "true";
  const isStaffBookingParam = searchParams.get("staff") === "true" || params.get("staff") === "true" || urlHasStaffParam;
  const isOwnerBookingParam = searchParams.get("owner") === "true" || params.get("owner") === "true" || urlHasOwnerParam;

  // Staff/Owner booking state - sync with URL parameter and ensure it persists in URL
  // Owner takes precedence over staff if both are present
  // Use initialOwnerParamRef as fallback since URL may already be stripped by React Router
  const hadOwnerParamInitially = initialOwnerParamRef.current === true;
  const hadStaffParamInitially = initialStaffParamRef.current === true;
  const [isStaffBooking, setIsStaffBooking] = useState((isStaffBookingParam || hadStaffParamInitially) && !(isOwnerBookingParam || hadOwnerParamInitially));
  const [isOwnerBooking, setIsOwnerBooking] = useState(isOwnerBookingParam || hadOwnerParamInitially);
  
  // Use useLayoutEffect to restore parameter synchronously before paint
  useLayoutEffect(() => {
    // Check if we captured the staff parameter from initial URL
    const hadStaffInitially = initialStaffParamRef.current === true;
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasStaff = urlParams.get("staff") === "true";
    const searchParamsHasStaff = searchParams.get("staff") === "true";
    
    console.log('[Staff Discount] useLayoutEffect check:', {
      hadStaffInitially,
      urlHasStaff,
      searchParamsHasStaff,
      windowLocation: window.location.search
    });
    
    // If we had it initially but it's missing now, restore it
    // CRITICAL: Use window.location.search as base to preserve ALL original params (including owner)
    if (hadStaffInitially && !searchParamsHasStaff) {
      console.log('[Staff Discount] ✅ Restoring staff=true (was in initial URL)');
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("staff", "true");
      setSearchParams(newParams, { replace: true });
      setIsStaffBooking(true);
    } else if (urlHasStaff && !searchParamsHasStaff) {
      console.log('[Staff Discount] ✅ Restoring staff=true (found in current URL)');
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams, { replace: true });
      setIsStaffBooking(true);
    } else if (urlHasStaff || searchParamsHasStaff) {
      console.log('[Staff Discount] ✅ Staff param exists, setting state');
      setIsStaffBooking(true);
    } else {
      console.log('[Staff Discount] ❌ No staff parameter found');
    }
  }, []); // Only run once on mount
  const [staffDiscountConfig, setStaffDiscountConfig] = useState(null);
  const [ownerDiscountConfig, setOwnerDiscountConfig] = useState(null);

  // Use useLayoutEffect to restore owner parameter synchronously before paint
  // MIRRORS STAFF PATTERN EXACTLY - critical for URL param preservation
  useLayoutEffect(() => {
    const hadOwnerInitially = initialOwnerParamRef.current === true;
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasOwner = urlParams.get("owner") === "true";
    const searchParamsHasOwner = searchParams.get("owner") === "true";

    console.log('[Owner Discount] useLayoutEffect check:', {
      hadOwnerInitially,
      urlHasOwner,
      searchParamsHasOwner,
      windowLocation: window.location.search
    });

    // Branch 1: Had owner from ref/sessionStorage, but not in searchParams - restore it
    // CRITICAL: Use window.location.search as base to preserve ALL original params
    if (hadOwnerInitially && !searchParamsHasOwner) {
      console.log('[Owner Discount] ✅ Restoring owner=true (was in initial URL)');
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("owner", "true");
      setSearchParams(newParams, { replace: true });
      setIsOwnerBooking(true);
      setIsStaffBooking(false);
    }
    // Branch 2: URL has owner but searchParams doesn't - use window.location.search to preserve ALL params
    else if (urlHasOwner && !searchParamsHasOwner) {
      console.log('[Owner Discount] ✅ Restoring owner=true (found in current URL)');
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams, { replace: true });
      setIsOwnerBooking(true);
      setIsStaffBooking(false);
    }
    // Branch 3: Already exists in searchParams or URL - just set state
    else if (urlHasOwner || searchParamsHasOwner) {
      console.log('[Owner Discount] ✅ Owner param exists, setting state');
      setIsOwnerBooking(true);
      setIsStaffBooking(false);
    } else {
      console.log('[Owner Discount] ❌ No owner parameter found');
    }
    // Clear sessionStorage regardless of branch
    sessionStorage.removeItem('owner_booking_param');
  }, []);

  // Preserve owner parameter in URL - check on mount (mirrors staff pattern exactly)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasOwner = urlParams.get("owner") === "true";

    if (urlHasOwner) {
      console.log('[Owner Discount] Mount: URL has owner=true, restoring to searchParams');
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams, { replace: true });
      setIsOwnerBooking(true);
      setIsStaffBooking(false);
      return; // Early return to avoid double processing
    }
  }, []); // Only run on mount

  // Sync owner state with searchParams changes (mirrors staff sync exactly)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasOwner = urlParams.get("owner") === "true";
    const searchParamsHasOwner = searchParams.get("owner") === "true";

    console.log('[Owner Discount] URL sync check:', {
      urlHasOwner,
      searchParamsHasOwner,
      windowLocation: window.location.search,
      searchParamsString: searchParams.toString(),
      isOwnerBooking
    });

    // If URL has owner=true, ensure it's in searchParams and state
    if (urlHasOwner) {
      if (!searchParamsHasOwner) {
        console.log('[Owner Discount] Restoring owner=true to searchParams');
        const newParams = new URLSearchParams(window.location.search);
        setSearchParams(newParams, { replace: true });
      }
      if (!isOwnerBooking) {
        console.log('[Owner Discount] Setting isOwnerBooking to true');
        setIsOwnerBooking(true);
        setIsStaffBooking(false);
      }
    }
    // If searchParams has it but URL doesn't, sync URL
    // Use window.location.search as base to preserve ALL URL params
    else if (searchParamsHasOwner && !urlHasOwner) {
      console.log('[Owner Discount] Syncing owner=true to URL');
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("owner", "true");
      setSearchParams(newParams, { replace: true });
      setIsOwnerBooking(true);
      setIsStaffBooking(false);
    }
    // If neither has it, ensure state is false (only if currently true)
    else if (!urlHasOwner && !searchParamsHasOwner) {
      if (isOwnerBooking) {
        console.log('[Owner Discount] Clearing isOwnerBooking (no owner param)');
        setIsOwnerBooking(false);
      }
    }
  }, [searchParams, setSearchParams, isOwnerBooking]);

  // Preserve staff parameter in URL and sync state - check on mount first
  useEffect(() => {
    // On mount, check URL immediately and restore if needed
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasStaff = urlParams.get("staff") === "true";

    if (urlHasStaff) {
      console.log('[Staff Discount] Mount: URL has staff=true, restoring to searchParams');
      const newParams = new URLSearchParams(window.location.search);
      setSearchParams(newParams, { replace: true });
      setIsStaffBooking(true);
      return; // Early return to avoid double processing
    }
  }, []); // Only run on mount
  
  // Sync state with searchParams changes
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlHasStaff = urlParams.get("staff") === "true";
    const searchParamsHasStaff = searchParams.get("staff") === "true";
    
    console.log('[Staff Discount] URL sync check:', {
      urlHasStaff,
      searchParamsHasStaff,
      windowLocation: window.location.search,
      searchParamsString: searchParams.toString(),
      isStaffBooking
    });
    
    // If URL has staff=true, ensure it's in searchParams and state
    if (urlHasStaff) {
      if (!searchParamsHasStaff) {
        console.log('[Staff Discount] Restoring staff=true to searchParams');
        const newParams = new URLSearchParams(window.location.search);
        setSearchParams(newParams, { replace: true });
      }
      if (!isStaffBooking) {
        console.log('[Staff Discount] Setting isStaffBooking to true');
        setIsStaffBooking(true);
      }
    } 
    // If searchParams has it but URL doesn't, sync URL
    // Use window.location.search as base to preserve ALL URL params
    else if (searchParamsHasStaff && !urlHasStaff) {
      console.log('[Staff Discount] Syncing staff=true to URL');
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("staff", "true");
      setSearchParams(newParams, { replace: true });
      setIsStaffBooking(true);
    }
    // If neither has it, ensure state is false
    else if (!urlHasStaff && !searchParamsHasStaff) {
      if (isStaffBooking) {
        console.log('[Staff Discount] Clearing isStaffBooking (no staff param)');
        setIsStaffBooking(false);
      }
    }
  }, [searchParams, setSearchParams, isStaffBooking]);

  useEffect(() => {
    const selected = bookingTypes.find((bt) => bt.name === bookingType);
    if (selected && (!selected.actualPrice || !selected.labelId)) {
      setErrors((prev) => ({
        ...prev,
        bookingType:
          "This booking type is incomplete. Please select a valid type.",
      }));
    } else {
      setErrors((prev) => ({
        ...prev,
        bookingType: "",
      }));

      if (selected) {
      }
    }

    if (selected?.lessonDates === "Per Session Special") {
      setSelectedSessions(clubSessions.map((s) => s.id));
    }
  }, [bookingType, clubSessions, bookingTypes]);

  const [adjustedPrice, setAdjustedPrice] = useState(price || 0);
  const [originalPrice, setOriginalPrice] = useState(price || 0);
  const detectTimeZone = () => {
    if (typeof Intl === "object" && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) return tz;
    }
    try {
      const luxonTz = DateTime.local().zoneName;
      if (luxonTz && luxonTz !== "local") return luxonTz;
    } catch {}
    return "America/New_York";
  };
  useEffect(() => {
    // Use the actual current URL path so public booking URLs (e.g. /book/home-nyc)
    // persist correctly to the SuccessPage "Make another booking" button
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/booking-forms/frontend';
    const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
    const url = currentSearch ? `${currentPath}${currentSearch}` : currentPath;
    sessionStorage.setItem("lastBookingUrl", url);
  }, [preselectServiceId, preselectBookingTypeId]);

  const isStep0Valid = () =>
    (parentFirstName || "").trim() &&
    (parentLastName || "").trim() &&
    (parentEmail || "").trim() &&
    (parentPhone || "").trim();

  const defaultDate = DateTime.now().plus({ weeks: 1 }).toISODate();

  const clearSignature = () => {
    sigPadRef.current.clear();
    const canvas = sigPadRef.current.getCanvas();
    canvas.width = 400;
    canvas.height = 150;
    setSignature("");
  };

  const handleEnd = () => {
    const pad = sigPadRef.current;
    if (!pad) return;
    try {
      // Use built-in trimmed canvas without mutating the original
      const dataURL = pad.getTrimmedCanvas().toDataURL("image/png");
      setSignature(dataURL);
    } catch (e) {
      try {
        const fallback = pad.getCanvas().toDataURL("image/png");
        setSignature(fallback);
      } catch {}
    }
    setConfirmationErrors((prev) => ({ ...prev, signature: "" }));
  };
  const usStates = State.getStatesOfCountry("US");

  // Set meta tags for link previews (Open Graph)
  useEffect(() => {
    // Update document title
    document.title = "Acme Operations";
    
    // Update or create meta tags for Open Graph
    const updateMetaTag = (property, content) => {
      let meta = document.querySelector(`meta[property="${property}"]`) || 
                 document.querySelector(`meta[name="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        if (property.startsWith('og:')) {
          meta.setAttribute('property', property);
        } else {
          meta.setAttribute('name', property);
        }
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };
    
    updateMetaTag('og:title', 'Acme Operations');
    updateMetaTag('og:description', 'Acme Operations');
    updateMetaTag('description', 'Acme Operations');
    
    // Cleanup on unmount - restore default title
    return () => {
      document.title = "Acme Operations";
    };
  }, []);

  useEffect(() => {
    const existing = localStorage.getItem("bookingSessionId");
    if (existing) {
      setSessionId(existing);
    } else {
      const newId = uuidv4();
      localStorage.setItem("bookingSessionId", newId);
      setSessionId(newId);
    }
  }, []);
  const selected = bookingTypes.find((bt) => bt.name === bookingType) || {};
  const hideOriginalPrice = selected.hideOriginalPrice;
  const hideAllPricing = selected.hideAllPricing;
  const hideDayTime = Boolean(selected.hideDayTimeOptions);
  const allowInternationalAddresses = Boolean(selected.allowInternationalAddresses);
  const countryAliases = useMemo(() => ({
    AE: ["uae", "emirates", "dubai"],
    GB: ["uk", "britain", "england", "scotland", "wales"],
    US: ["usa", "america", "united states"],
    SA: ["saudi", "ksa"],
    QA: ["qatar"],
    BH: ["bahrain"],
    KW: ["kuwait"],
    OM: ["oman"],
    SG: ["singapore"],
    HK: ["hong kong"],
    CN: ["china"],
    IN: ["india"],
    AU: ["australia", "oz"],
    CA: ["canada"],
    DE: ["germany"],
    FR: ["france"],
  }), []);

  const allCountries = useMemo(() => {
    const countryOptions = Object.entries(countries.getNames("en") || {})
      .map(([isoCode, name]) => ({
        isoCode,
        name: isoCode === "US" ? "United States" : name,
        aliases: countryAliases[isoCode] || [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!allowInternationalAddresses) {
      return countryOptions.filter((country) => country.isoCode === "US");
    }

    return countryOptions;
  }, [allowInternationalAddresses, countryAliases]);

  const allSteps = [
    "Booking Details",
    "Student Info",
    "Day & Time",
    "Confirmation",
  ];

  const visibleSteps =
    hideDayTime || selected.lessonDates?.toLowerCase() === "one-off"
      ? steps.filter((step) => step !== "Day & Time")
      : steps;

  const totalSteps = visibleSteps.length || steps.length;
  const fallbackIndex =
    totalSteps > 0 ? Math.min(step, Math.max(totalSteps - 1, 0)) : 0;
  const tentativeStepName = steps[step] || visibleSteps[fallbackIndex] || "";
  const normalizedStepName = visibleSteps.includes(tentativeStepName)
    ? tentativeStepName
    : visibleSteps[fallbackIndex] || visibleSteps[0] || "";
  const currentStepIndex = Math.max(
    0,
    visibleSteps.findIndex((name) => name === normalizedStepName)
  );
  const displayStepNumber = currentStepIndex + 1;
  // Progress shows completion: 0% at start, 75% on final step (not 100% until done)
  const progressPercent =
    totalSteps > 0 ? (currentStepIndex / totalSteps) * 100 : 0;
  
  // Use trial-specific descriptions only for home trials, otherwise use generic (empty) descriptions
  const isTrial = selected?.is_trial || false;
  const stepDescriptions = isTrial ? STEP_DESCRIPTIONS_TRIAL : STEP_DESCRIPTIONS_GENERIC;
  const currentStepSubtitle =
    stepDescriptions[normalizedStepName] ||
    "";

  useEffect(() => {
    if (hideDayTime && step === 2) {
      // Skip Day & Time step — jump to Confirmation (step 3)
      setStep(3);
    }
  }, [hideDayTime, step]);

  useEffect(() => {
    fetch("/api/booking-types")
      .then((r) => r.json())
      .then((data) => {
        const types = Array.isArray(data) ? data : data.rows || [];
        const normalized = types.map((t) => ({
          ...t,
          image: t.image_url,
          lessonType: t.lessonType ?? t.lesson_type,
          serviceId: t.serviceId ?? t.service_id,
          allowInternationalAddresses:
            t.allowInternationalAddresses ?? t.allow_international_addresses ?? false,
          colour: t.colour ?? t.color ?? t.color_hex ?? null,
        }));
        setBookingTypes(normalized);

        if (normalized.length) {
          const match =
            (preselectServiceId &&
              normalized.find(
                (bt) => String(bt.serviceId) === preselectServiceId
              )) ||
            (preselectBookingTypeId &&
              normalized.find(
                (bt) => String(bt.id) === preselectBookingTypeId
              ));

          if (match) {
            if (match.isActive === false) {
              setServiceUnavailable(true);
              return;
            }
            setBookingType(match.name);
            setPrice(match.actualPrice);
          } else if (preselectType) {
            // Match by lesson type from city landing page URL (?type=home or ?type=online)
            const typeMatch = normalized.find(
              (bt) => bt.lessonType && bt.lessonType.toLowerCase() === preselectType.toLowerCase() && bt.isActive !== false
            );
            if (typeMatch) {
              setBookingType(typeMatch.name);
              setPrice(typeMatch.actualPrice);
            } else {
              setBookingType(normalized[0].name);
              setPrice(normalized[0].actualPrice);
            }
          } else if (preselectServiceId) {
            // No booking type matches this serviceId — check if the service is finished
            fetch(`/api/booking-types/service-status/${preselectServiceId}`)
              .then((r) => r.json())
              .then((status) => {
                if (status.isActive === false) {
                  setServiceUnavailable(true);
                } else {
                  setBookingType(normalized[0].name);
                  setPrice(normalized[0].actualPrice);
                }
              })
              .catch(() => {
                setBookingType(normalized[0].name);
                setPrice(normalized[0].actualPrice);
              });
          } else {
            setBookingType(normalized[0].name);
            setPrice(normalized[0].actualPrice);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Fetch staff discount configuration when in staff booking mode
  useEffect(() => {
    console.log('[Staff Discount] Fetch effect triggered:', {
      isStaffBooking,
      preselectServiceId,
      urlHasStaff: new URLSearchParams(window.location.search).get("staff") === "true"
    });
    
    if (isStaffBooking && preselectServiceId) {
      console.log('[Staff Discount] Fetching service config for:', preselectServiceId);
      fetch(`/api/services`)
        .then((r) => r.json())
        .then((data) => {
          // Handle paginated response structure: { data: [...], total: ..., page: ... }
          // or direct array, or { rows: [...] }
          let services = [];
          if (Array.isArray(data)) {
            services = data;
          } else if (data.data && Array.isArray(data.data)) {
            services = data.data;
          } else if (data.rows && Array.isArray(data.rows)) {
            services = data.rows;
          }
          
          const service = services.find(
            (s) => String(s.serviceId) === preselectServiceId
          );
          
          console.log('[Staff Discount] Service lookup result:', { 
            serviceId: preselectServiceId, 
            found: !!service,
            serviceName: service?.name,
            staffDiscountEnabled: service?.staffDiscountEnabled,
            monthlyPercent: service?.staffDiscountPercentMonthly,
            termPercent: service?.staffDiscountPercentTerm,
            totalServices: services.length
          });
          
          if (service && service.staffDiscountEnabled) {
            console.log('[Staff Discount] ✅ Config set:', {
              enabled: true,
              monthlyPercent: service.staffDiscountPercentMonthly || 20,
              termPercent: service.staffDiscountPercentTerm || 20
            });
            setStaffDiscountConfig({
              enabled: service.staffDiscountEnabled,
              monthlyPercent: service.staffDiscountPercentMonthly || 20,
              termPercent: service.staffDiscountPercentTerm || 20,
            });
          } else {
            console.log('[Staff Discount] ❌ No discount config (service not found or disabled)');
            setStaffDiscountConfig(null);
          }
        })
        .catch((err) => {
          console.error("[Staff Discount] Error fetching staff discount config:", err);
          setStaffDiscountConfig(null);
        });
    } else {
      console.log('[Staff Discount] Skipping fetch:', {
        reason: !isStaffBooking ? 'not staff booking' : 'no serviceId',
        isStaffBooking,
        preselectServiceId
      });
      setStaffDiscountConfig(null);
    }
  }, [isStaffBooking, preselectServiceId]);

  // Fetch owner discount configuration when in owner booking mode
  useEffect(() => {
    console.log('[Owner Discount] Fetch effect triggered:', {
      isOwnerBooking,
      preselectServiceId,
      urlHasOwner: new URLSearchParams(window.location.search).get("owner") === "true"
    });

    if (isOwnerBooking && preselectServiceId) {
      console.log('[Owner Discount] Fetching service config for:', preselectServiceId);
      fetch(`/api/services`)
        .then((r) => r.json())
        .then((data) => {
          let services = [];
          if (Array.isArray(data)) {
            services = data;
          } else if (data.data && Array.isArray(data.data)) {
            services = data.data;
          } else if (data.rows && Array.isArray(data.rows)) {
            services = data.rows;
          }

          const service = services.find(
            (s) => String(s.serviceId) === preselectServiceId
          );

          console.log('[Owner Discount] Service lookup result:', {
            serviceId: preselectServiceId,
            found: !!service,
            serviceName: service?.name,
            ownerDiscountEnabled: service?.ownerDiscountEnabled,
            monthlyPercent: service?.ownerDiscountPercentMonthly,
            termPercent: service?.ownerDiscountPercentTerm,
            totalServices: services.length
          });

          if (service && service.ownerDiscountEnabled) {
            console.log('[Owner Discount] Config set:', {
              enabled: true,
              monthlyPercent: service.ownerDiscountPercentMonthly || 50,
              termPercent: service.ownerDiscountPercentTerm || 50
            });
            setOwnerDiscountConfig({
              enabled: service.ownerDiscountEnabled,
              monthlyPercent: service.ownerDiscountPercentMonthly || 50,
              termPercent: service.ownerDiscountPercentTerm || 50,
            });
          } else {
            console.log('[Owner Discount] No discount config (service not found or disabled)');
            setOwnerDiscountConfig(null);
          }
        })
        .catch((err) => {
          console.error("[Owner Discount] Error fetching owner discount config:", err);
          setOwnerDiscountConfig(null);
        });
    } else {
      console.log('[Owner Discount] Skipping fetch:', {
        reason: !isOwnerBooking ? 'not owner booking' : 'no serviceId',
        isOwnerBooking,
        preselectServiceId
      });
      setOwnerDiscountConfig(null);
    }
  }, [isOwnerBooking, preselectServiceId]);

  const studentTemplate = {
    first: "",
    last: "",
    school: "",
    experience: "Brand New (Never played before)",
    dob: "",
    notes: "",
  };
  const [students, setStudents] = useState([{ ...studentTemplate }]);
  const [studentType, setStudentType] = useState(studentTypeOptions[0]);
  const [studentPage, setStudentPage] = useState(0);
  const [timezone, setTimezone] = useState(
    () => sessionStorage.getItem("bookingTimezone") || detectTimeZone()
  );
  useEffect(() => {
    sessionStorage.setItem("bookingTimezone", timezone);
  }, [timezone]);
  const [availableTimezones, setAvailableTimezones] = useState([]);

  useEffect(() => {
    const now = moment();
    const seen = new Set();
    const zones = moment.tz.names()
      .filter((name) => typeof name === "string" && name.trim() && !name.startsWith("Etc/"))
      .map((name) => {
        const offset = moment.tz.zone(name)?.utcOffset(now.valueOf()) ?? 0;
        const hours = Math.floor(Math.abs(offset) / 60);
        const mins = Math.abs(offset) % 60;
        const sign = offset <= 0 ? "+" : "-";
        const utcLabel = `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
        const city = name.split("/").pop().replace(/_/g, " ");
        return { value: name, label: `(${utcLabel}) ${city}`, offset, city };
      })
      .filter((z) => {
        if (seen.has(z.value)) return false;
        seen.add(z.value);
        return true;
      })
      .sort((a, b) => a.offset - b.offset || a.city.localeCompare(b.city));

    const currentZone = (timezone || "").trim();
    if (currentZone && !seen.has(currentZone)) {
      const offset = moment.tz.zone(currentZone)?.utcOffset(now.valueOf()) ?? 0;
      const hours = Math.floor(Math.abs(offset) / 60);
      const mins = Math.abs(offset) % 60;
      const sign = offset <= 0 ? "+" : "-";
      const utcLabel = `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      const city = currentZone.split("/").pop().replace(/_/g, " ");
      zones.unshift({ value: currentZone, label: `(${utcLabel}) ${city}`, offset, city });
    }
    setAvailableTimezones(zones);
  }, [timezone]);

  const [startDate, setStartDate] = useState("");
  const [preferredDays, setPreferredDays] = useState(["", "", ""]);
  const [timeRanges, setTimeRanges] = useState(
    Array(3)
      .fill()
      .map(() => ({ start: 9, end: 17 }))
  );
  const [selectedDate, setSelectedDate] = useState("");
  const [timeWindow, setTimeWindow] = useState({
    start: "09:00",
    end: "17:00",
  });

  const [slots, setSlots] = useState([
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
    { date: "", dayOfWeek: "-", start: "-", end: "-" },
  ]);

  const timeSlots = generateTimeSlots();

  useEffect(() => {
    let count =
      studentType === "Two Students"
        ? 2
        : studentType === "Small Group (3+ Students)"
        ? 3
        : 1;
    setStudents((curr) => {
      const copy = [...curr];
      while (copy.length < count) copy.push({ ...studentTemplate });
      copy.length = count;
      return copy;
    });
    setStudentErrors(Array(count).fill({}));
  }, [studentType]);

  useEffect(() => {
    setStudentPage(0);
  }, [students.length]);

  useEffect(() => {
    const selected = bookingTypes.find((bt) => bt.name === bookingType);
    if (!selected || selected.lessonType !== "Club" || !selected.serviceId) {
      setClubSessions([]);
      return;
    }

    setIsLoadingClubSessions(true);
    fetch(`/api/tutorcruncher/sessions?serviceId=${selected.serviceId}`)
      .then((res) => res.json())
      .then((data) => {
        const sessions = data.sessions || [];
        const plannedSessions = sessions.filter(
          (session) => session.status === "planned"
        );

        setClubSessions(plannedSessions);
        if (plannedSessions.length === 0) {
          setSelectedSessions([]);
          setSessionError(
            "Sorry, this class is unavailable. There are no planned classes at this time."
          );
        } else {
          setSessionError("");
        }
      })
      .catch((error) => {
        console.error("Error fetching sessions:", error);
        setSessionError(
          "Sorry, something went wrong while fetching the sessions."
        );
      })
      .finally(() => setIsLoadingClubSessions(false));
  }, [bookingType, bookingTypes]);

  useEffect(() => {
    const selected = bookingTypes.find((bt) => bt.name === bookingType);
    if (!selected || selected.lessonType !== "Club") return;
    if (!clubSessions.length) return;

    if (selected.lessonDates === "Per Session Special") {
      setSelectedSessions(clubSessions.map((s) => s.id));
    } else if (selected.lessonDates === "one-off") {
      setSelectedSessions(clubSessions.map((s) => s.id));
    } else if (selected.lessonDates === "Per Session") {
      setSelectedSessions(clubSessions.map((s) => s.id));
    } else {
      setSelectedSessions([]);
    }
  }, [clubSessions, bookingType]);

  const handleSlotChange = (index, field, value) => {
    const updated = [...slots];

    if (field === "date") {
      const minISO = defaultDate;
      if (value && value < minISO) {
        setDateError("Please select a start date at least 7 days from now.");
      } else {
        setDateError("");
      }
      updated[index] = { ...updated[index], date: value };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }

    setSlots(updated);
  };

  const handleDobChange = (index, value) => {
    const updatedErrors = [...studentErrors];
    if (!updatedErrors[index]) {
      updatedErrors[index] = {};
    }
    
    // Enhanced date validation - cross-browser compatible
    if (!value) {
      updatedErrors[index].dob = "";
    } else {
      // Mobile-friendly: normalize the input value
      const normalizedValue = normalizeDateInput(value);
      
      // First, check for obviously malformed dates
      if (normalizedValue.length !== 10 || !normalizedValue.includes('-')) {
        updatedErrors[index].dob = "Please enter date in YYYY-MM-DD format.";
      } else {
        // Validate year range (1900-2030) - more strict validation
        const year = parseInt(normalizedValue.split('-')[0]);
        if (isNaN(year) || year < 1900 || year > 2030) {
          updatedErrors[index].dob = `Invalid birth year: ${year}. Must be between 1900-2030.`;
        } else {
          // Cross-browser compatible date parsing
          const birthDate = parseDateSafely(normalizedValue);
          if (!birthDate) {
            updatedErrors[index].dob = `Invalid date: ${normalizedValue}. Please check the date format.`;
          } else if (isDateInFuture(birthDate)) {
            updatedErrors[index].dob = "Date of birth cannot be in the future.";
          } else {
            // Check if date is reasonable (not too old)
            const age = calculateAge(birthDate);
            if (age > 100 || age < 0) {
              updatedErrors[index].dob = `Student would be ${age} years old - please check birth year`;
            } else {
              updatedErrors[index].dob = "";
            }
          }
        }
      }
    }

    setStudentErrors(updatedErrors);

    const updatedStudents = [...students];
    const normalizedValue = value ? normalizeDateInput(value) : value;
    updatedStudents[index].dob = normalizedValue;
    setStudents(updatedStudents);
  };

  // Mobile-friendly date input normalization
  const normalizeDateInput = (input) => {
    // Remove any non-numeric characters except dashes
    let normalized = input.replace(/[^\d-]/g, '');
    
    // Handle common mobile input patterns
    // If user types 8 digits without dashes, add them
    if (/^\d{8}$/.test(normalized)) {
      normalized = `${normalized.slice(0,4)}-${normalized.slice(4,6)}-${normalized.slice(6,8)}`;
    }
    
    // If user types 6 digits, assume MM/DD/YY and convert
    if (/^\d{6}$/.test(normalized)) {
      const month = normalized.slice(0,2);
      const day = normalized.slice(2,4);
      const year = normalized.slice(4,6);
      
      // Convert 2-digit year to 4-digit (assume 2000s for years 00-30, 1900s for 31-99)
      const fullYear = parseInt(year) <= 30 ? `20${year}` : `19${year}`;
      normalized = `${fullYear}-${month}-${day}`;
    }
    
    return normalized;
  };

  // Cross-browser compatible date parsing
  const parseDateSafely = (dateString) => {
    try {
      // Handle different date formats that browsers might send
      const parts = dateString.split('-');
      if (parts.length !== 3) return null;
      
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      
      // Validate individual components
      if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
      if (month < 1 || month > 12) return null;
      if (day < 1 || day > 31) return null;
      
      // Create date using constructor (more reliable across browsers)
      const date = new Date(year, month - 1, day);
      
      // Verify the date is valid (handles invalid dates like Feb 30)
      if (date.getFullYear() !== year || 
          date.getMonth() !== month - 1 || 
          date.getDate() !== day) {
        return null;
      }
      
      return date;
    } catch (error) {
      return null;
    }
  };

  // Cross-browser compatible future date check
  const isDateInFuture = (date) => {
    const today = new Date();
    // Reset time to start of day for accurate comparison
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    return dateStart > todayStart;
  };

  // Cross-browser compatible age calculation
  const calculateAge = (birthDate) => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    // Adjust age if birthday hasn't occurred this year
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  };
  const formatChildName = (rawName) => {
    if (!rawName || typeof rawName !== "string") return "your child";
    const trimmed = rawName.trim();
    if (!trimmed) return "your child";
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };
  // Removed buildAgeInsightMessage - tutors need to assess placement, not age-based suggestions
  const buildAgeInsightMessage = (student) => {
    // Age-based level suggestions removed - tutors assess placement
    return "";
  };
  const validateFirstSlot = () => {
    if (
      !slots[0].date ||
      slots[0].dayOfWeek === "-" ||
      slots[0].start === "-" ||
      slots[0].end === "-"
    ) {
      return "The first slot is required.";
    }
    return "";
  };
  const validateSlotDays = () => {
    const daysSelected = new Set(slots.map((slot) => slot.dayOfWeek));
    if (daysSelected.size > 3) {
      return "You can only select up to 3 different days.";
    }
    return "";
  };

  const renderTimeSlots = () => {
    return slots.map((slot, index) => (
      <div key={index} className="p-4 border rounded-md space-y-4 mb-4">
        <label className="block text-sm font-medium text-neutral-700">
          {index === 0 ? "Day of the Week (Required)" : "Day of the Week"}
        </label>
        <select
          value={slot.dayOfWeek}
          onChange={(e) => handleSlotChange(index, "dayOfWeek", e.target.value)}
          className="mt-1 block w-full border-neutral-300 rounded-md"
          required={index === 0}
        >
          <option value="-">Please Select</option>
          {daysOfWeek.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700">
              Start Time
            </label>
            <select
              value={slot.start}
              onChange={(e) => handleSlotChange(index, "start", e.target.value)}
              className="mt-1 block w-full border-neutral-300 rounded-md"
              required={index === 0}
            >
              <option value="-">Please Select</option>
              {timeSlots.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700">
              End Time
            </label>
            <select
              value={slot.end}
              onChange={(e) => handleSlotChange(index, "end", e.target.value)}
              className="mt-1 block w-full border-neutral-300 rounded-md"
              required={index === 0}
            >
              <option value="-">Please Select</option>
              {getAvailableEndTimes(slot.start).map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    ));
  };
  const getAvailableEndTimes = (startTime) => {
    const startIndex = timeSlots.indexOf(startTime);
    const availableEndTimes = timeSlots.slice(startIndex + 4);
    return availableEndTimes;
  };
  useEffect(() => {
    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
      if (availabilityTimeoutRef.current) {
        clearTimeout(availabilityTimeoutRef.current);
      }
    };
  }, []);
  const parseTimeTo24 = (timeString) => {
    if (!timeString || timeString === "-") return null;
    const parts = timeString.split(" ");
    if (parts.length !== 2) return null;
    const [timePart, periodRaw] = parts;
    const [hourStr, minuteStr] = timePart.split(":");
    const period = periodRaw.toLowerCase();
    let hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

    if (period === "pm" && hour !== 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    return { hour, minute };
  };
  useEffect(() => {
    if (availabilityTimeoutRef.current) {
      clearTimeout(availabilityTimeoutRef.current);
      availabilityTimeoutRef.current = null;
    }

    if (
      step !== 2 ||
      selected.lessonType === "Club" ||
      hideDayTime ||
      !slots.length
    ) {
      setAvailabilityFeedback(null);
      setAvailabilityLoading(false);
      return;
    }

    const primarySlot = slots[0];
    if (
      !primarySlot ||
      primarySlot.dayOfWeek === "-" ||
      primarySlot.start === "-" ||
      primarySlot.end === "-"
    ) {
      setAvailabilityFeedback(null);
      setAvailabilityLoading(false);
      return;
    }

    setAvailabilityLoading(true);
    availabilityTimeoutRef.current = setTimeout(() => {
      const start = parseTimeTo24(primarySlot.start);
      let status = "positive";
      let message = `✅ Tutors available this ${primarySlot.dayOfWeek} between ${primarySlot.start} and ${primarySlot.end}.`;

      if (start && start.hour >= 16 && start.hour < 19) {
        status = "warning";
        message =
          "⚠️ Fewer openings at this time — you may experience a short wait.";
      }

      if (timezone) {
        message += ` (${timezone.replace(/_/g, " ")})`;
      }

      setAvailabilityFeedback({ status, message });
      setAvailabilityLoading(false);
    }, AVAILABILITY_CHECK_DELAY_MS);

    return () => {
      if (availabilityTimeoutRef.current) {
        clearTimeout(availabilityTimeoutRef.current);
        availabilityTimeoutRef.current = null;
      }
    };
  }, [slots, step, selected.lessonType, hideDayTime, timezone]);
  const isValidEmail = (email) => {
    // Basic format check
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(email)) return false;

    // RFC 5321 violations that TutorCruncher will reject:
    // - Consecutive dots (..)
    // - Leading dot before @
    // - Trailing dot before @
    const localPart = email.split('@')[0];
    if (localPart.includes('..')) return false;
    if (localPart.startsWith('.')) return false;
    if (localPart.endsWith('.')) return false;

    return true;
  };

  useEffect(() => {
    fetch("/api/policies")
      .then((r) => r.json())
      .then((data) => {
        const sections = (Array.isArray(data) ? data : [])
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => ({
            id: p.slug,
            label: p.label,
            html: p.content_html || "",
            show_on_form: p.show_on_form || false,
            checkbox_group: p.checkbox_group || null,
            checkbox_label: p.checkbox_label || "",
            link_text: p.link_text || "",
          }));
        setPolicySections(sections);
      })
      .catch(console.error);
  }, []);

  const matchUSState = (input) => {
    if (!input) return "";
    const trimmed = String(input).trim();
    if (!trimmed) return "";
    const normalized = trimmed.toLowerCase();
    const byName = usStates.find((state) => state.name.toLowerCase() === normalized);
    if (byName) return byName.name;
    const collapsed = normalized.replace(/[^a-z]/g, "");
    const byIso = usStates.find((state) => state.isoCode.toLowerCase() === collapsed);
    return byIso ? byIso.name : "";
  };
  const geoDefaultsRef = useRef({
    countryCode: "US",
    region: "",
    city: "",
  });

  useEffect(() => {
    let isMounted = true;

    const inferLocaleCountry = () => {
      if (typeof navigator === "undefined") return "";
      const locales = navigator.languages || [navigator.language];
      const matched = (locales || []).find((locale) =>
        typeof locale === "string" ? locale.toLowerCase().includes("-us") : false
      );
      if (matched) return "US";
      return "";
    };

    const applyDefaults = ({ countryCode, region, city }, shouldAllowInternational) => {
      if (!isMounted) return;
      const upperCode = (countryCode || "").toUpperCase();
      if (!upperCode) return;

      setCountry((prev) => (prev && prev !== "US" ? prev : upperCode));

      if (upperCode !== "US" && !shouldAllowInternational) {
        return;
      }

      const displayCountry =
        upperCode === "US"
          ? "United States"
          : countries.getName(upperCode, "en") || "";

      if (!displayCountry) return;

      setAddress((prev) => {
        const next = { ...prev };
        let changed = false;
        if (
          !prev.country ||
          (prev.country === "United States" && displayCountry && displayCountry !== prev.country)
        ) {
          next.country = displayCountry;
          changed = true;
        }
        if (upperCode === "US" && !prev.state) {
          const stateName = matchUSState(region);
          if (stateName) {
            next.state = stateName;
            changed = true;
          }
        }
        if (upperCode === "US" && !prev.city && city) {
          // Normalize detected city against dropdown options (case-insensitive partial match)
          const stateCode = next.state
            ? (State.getStatesOfCountry("US") || []).find(
                (s) => s.name === next.state
              )?.isoCode
            : null;
          if (stateCode) {
            const availableCities = City.getCitiesOfState("US", stateCode) || [];
            const lowerCity = city.toLowerCase();
            const matched = availableCities.find(
              (c) => c.name.toLowerCase() === lowerCity
            ) || availableCities.find(
              (c) => c.name.toLowerCase().includes(lowerCity) || lowerCity.includes(c.name.toLowerCase())
            );
            next.city = matched ? matched.name : city;
          } else {
            next.city = city;
          }
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    const detectCountry = async () => {
      const defaults = {
        countryCode: inferLocaleCountry() || "US",
        region: "",
        city: "",
      };

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch("https://ipinfo.io?token=YOUR_TOKEN", {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          defaults.countryCode = (data.country || defaults.countryCode || "US").toUpperCase();
          defaults.region = data.region || data.region_code || "";
          defaults.city = data.city || "";
        }
      } catch (err) {
        console.debug("Geo lookup skipped:", err?.message || err);
      }

      geoDefaultsRef.current = defaults;
      applyDefaults(defaults, allowInternationalAddresses);
    };

    detectCountry();

    return () => {
      isMounted = false;
    };
  }, [allowInternationalAddresses]);

  useEffect(() => {
    if (allowInternationalAddresses) return;

    setAddress((prev) => {
      if (prev.country === "United States") return prev;
      return {
        ...prev,
        country: "United States",
      };
    });
  }, [allowInternationalAddresses]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setDraftLoaded(true);
      return;
    }

    let parsedDraft = null;

    try {
      const raw = localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
      if (raw) {
        parsedDraft = JSON.parse(raw);
      }
    } catch (err) {
      console.warn("Unable to parse saved booking draft:", err);
    }

    if (
      parsedDraft &&
      parsedDraft.timestamp &&
      Date.now() - parsedDraft.timestamp <= BOOKING_DRAFT_TTL_MS
    ) {
      setPendingDraft(parsedDraft);
      setShowResumePrompt(true);
    } else if (parsedDraft) {
      localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    }

    setDraftLoaded(true);
  }, []);
  const handlePhoneChange = (value) => {
    if (!value) {
      setParentPhone("");
      return;
    }

    let normalizedValue = typeof value === "string" ? value.trim() : "";
    if (!normalizedValue) {
      setParentPhone("");
      return;
    }

    let parsedPhoneNumber =
      parsePhoneNumberFromString(normalizedValue) ||
      (country ? parsePhoneNumberFromString(normalizedValue, country) : null);

    if (!parsedPhoneNumber) {
      const digits = normalizedValue.replace(/\D/g, "");
      if (digits.length === 10) {
        const fallback = `+1${digits}`;
        parsedPhoneNumber = parsePhoneNumberFromString(fallback);
      }
    }

    if (parsedPhoneNumber) {
      setParentPhone(parsedPhoneNumber.number);
      if (parsedPhoneNumber.country) {
        setCountry(parsedPhoneNumber.country);
      }
      setErrors((prev) => ({ ...prev, parentPhone: "" }));
    } else {
      setParentPhone(normalizedValue);
    }
  };
  const handlePhoneBlur = () => {
    if (!parentPhone) return;
    if (!isValidPhoneNumber(parentPhone)) {
      const digitsOnly = parentPhone.replace(/\D/g, "");
      if (digitsOnly.length === 10) {
        const normalized = `+1${digitsOnly}`;
        const parsed = parsePhoneNumberFromString(normalized);
        if (parsed?.isValid()) {
          setParentPhone(parsed.number);
          setErrors((prev) => ({ ...prev, parentPhone: "" }));
          return;
        }
      }
      setErrors((prev) => ({
        ...prev,
        parentPhone: "Please enter a valid phone number.",
      }));
    } else {
      setErrors((prev) => ({ ...prev, parentPhone: "" }));
    }
  };
  const addSlot = () => {
    if (slots.length < 3) {
      setSlots([...slots, { date: "", dayOfWeek: "-", start: "-", end: "-" }]);
    }
  };
  const removeSlot = (index) => {
    setSlots(slots.filter((_, i) => i !== index));
  };

  let colourGroupsPromise;

  async function getColourGroupsOnce() {
    if (colourGroups) return colourGroups;
    if (!colourGroupsPromise) {
      colourGroupsPromise = fetch("/api/colour-groups", { credentials: 'include' })
        .then((r) => r.json())
        .then((data) => {
          setColourGroups(data);
          return data;
        })
        .catch((e) => {
          colourGroupsPromise = undefined;
          throw e;
        });
    }
    return colourGroupsPromise;
  }

  const isHex = (s) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((s || "").trim());
  const isCssColorName = (c) => {
    if (!c) return false;
    const el = document.createElement("span");
    el.style.color = "";
    el.style.color = c;
    return !!el.style.color;
  };

  const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();

  function findColourGroup(groups, name) {
    const n = norm(name);
    if (!n) return null;

    let hit = groups.find((g) => norm(g.name) === n);
    if (hit) return hit;

    hit = groups.find((g) => {
      const gn = norm(g.name);
      return gn.includes(n) || n.includes(gn);
    });
    return hit || null;
  }

  // Label-to-colour mapping for consistent calendar colours
  const LABEL_COLOURS = {
    'Club - Park Slope': '#1e90ff',
    'Club - Park Slope Support': '#ff1493',
    'Club - UES': '#1e90ff',
    'Club - UES Support': '#ff1493',
    'Home - NYC': 'MediumOrchid',
    'Home - LA': 'gold',
    'Home - SF': '#40e0d0',
    'Home - Hamptons': '#ffebcd',
    'Home - Westchester': 'BlanchedAlmond',
    'Online': 'lightgreen',
    'School - NYC': '#ffa500',
    'School - LA': '#ffa500',
    'School - SF': '#ffa500',
    'School - Hamptons': '#ffa500',
    'School - Eastside': '#ffa500',
  };

  async function resolveFinalColour(selectedType) {
    if (!selectedType) return "#666666";

    const lessonType = (selectedType.lessonType || "").toLowerCase();
    const labelName = selectedType.labelName || "";
    const raw = (
      selectedType.colour ??
      selectedType.color ??
      selectedType.colorHex ??
      ""
    ).trim();

    // For Club bookings, prioritize label-based colour over booking type colour
    // This ensures Park Slope clubs always get #1e90ff regardless of colourGroup
    if (lessonType === "club" && labelName && LABEL_COLOURS[labelName]) {
      return LABEL_COLOURS[labelName];
    }

    if (lessonType !== "club") {
      if (raw) return raw;
      return "#666666";
    }

    // Fall back to raw colour if it's valid
    if (raw && (isHex(raw) || isCssColorName(raw))) return raw;

    try {
      const groups = await getColourGroupsOnce();
      const candidates = [
        raw,
        selectedType.labelName,
        selectedType.name,
      ].filter(Boolean);

      for (const c of candidates) {
        const m = findColourGroup(groups, c);
        if (m?.color) return m.color;
      }
    } catch (e) {
      console.error("Failed to resolve Club colour via ColourGroups:", e);
    }

    return "#666666";
  }

  const [heardAbout, setHeardAbout] = useState("");
  const [colour, setColour] = useState("");
  const [colourGroups, setColourGroups] = useState(null);

  const [address, setAddress] = useState({
    street: "",
    city: "",
    zip: "",
    state: "",
    country: "United States",
  });
  const isUSAddress = address.country === "United States";
  const [agreeCancel, setAgreeCancel] = useState(false);
  const [agreeService, setAgreeService] = useState(false);
  const [agreePhoto, setAgreePhoto] = useState(false);
  const [policyAgreements, setPolicyAgreements] = useState({}); // { groupName: boolean }
  const [signature, setSignature] = useState("");

  // Convert state abbreviations/full names to isoCode for autofill compatibility
  useEffect(() => {
    if (!isUSAddress || !address.state) return;
    
    const currentState = address.state.trim();
    if (currentState.length === 0) return;
    
    // Find matching state by isoCode or name
    const matchedState = State.getStatesOfCountry("US").find(
      (s) => s.isoCode.toUpperCase() === currentState.toUpperCase() ||
             s.name.toLowerCase() === currentState.toLowerCase()
    );
    
    // Only update if we found a match and it's different from current value
    if (matchedState && matchedState.isoCode !== address.state) {
      setAddress((prev) => ({
        ...prev,
        state: matchedState.isoCode,
      }));
    }
  }, [address.state, isUSAddress]);

  const validateStep0 = () => {
    return (
      parentFirstName.trim() &&
      parentLastName.trim() &&
      parentEmail.trim() &&
      parentPhone.trim()
    );
  };

  const saveDraft = async (forceSave = false) => {
    // OPTIMIZED: Only save draft if we have meaningful data or if forced
    const hasRequiredData = parentFirstName && parentLastName && parentEmail && parentPhone;
    
    if (!forceSave && !hasRequiredData) {
      console.log('⏭️ Skipping draft save - insufficient data');
      return;
    }

    const selectedType =
      bookingTypes.find((bt) => bt.name === bookingType) || {};
    const finalColour = await resolveFinalColour(selectedType);
    setColour(finalColour);

    const draftPayload = {
      bookingType,
      actualPrice: adjustedPrice,
      parentFirst: parentFirstName,
      parentLast: parentLastName,
      parentEmail,
      parentPhone,
      studentType,
      students,
      slots,
      heardAbout,
      address,
      agreeCancel,
      agreeService,
      agreePhoto: false, // Photo release removed - handled verbally in person
      policyAgreements,
      signature,
      labelId: selectedType.labelId,
      labelName: selectedType.labelName,
      selectedSessions,
      lessonType: selectedType.lessonType,
      sessionId,
      timezone,
      isTrial: selectedType.is_trial,
      colour: finalColour,
      attribution,
    };

    try {
      console.log('💾 Saving draft...');
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draftPayload,
          isDraft: true,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        console.warn('Draft save failed:', error);
      } else {
        const data = await res.json();
        console.log('✅ Draft saved successfully');
      }
    } catch (err) {
      console.warn('Draft save error:', err);
    }
  };
  const buildDraftSnapshot = () => ({
    version: 1,
    timestamp: Date.now(),
    step,
    bookingType,
    price,
    adjustedPrice,
    originalPrice,
    parentFirst: parentFirstName,
    parentLast: parentLastName,
    parentEmail,
    parentPhone,
    studentType,
    students,
    slots,
    heardAbout,
    address,
    agreeCancel,
    agreeService,
    agreePhoto: false, // Photo release removed - handled verbally in person
    signature,
    selectedSessions,
    timezone,
    sessionId,
  });

  const hasMeaningfulDraftData = () => {
    if (
      parentFirstName ||
      parentLastName ||
      parentEmail ||
      parentPhone ||
      heardAbout ||
      signature ||
      address.street ||
      address.city ||
      address.state ||
      address.zip
    ) {
      return true;
    }

    const hasStudentDetails = students.some((student) => {
      return (
        student?.first ||
        student?.last ||
        student?.dob ||
        student?.notes
      );
    });

    if (hasStudentDetails) return true;

    const hasSlotsFilled = slots.some((slot) => {
      return (
        slot?.date ||
        (slot?.dayOfWeek && slot.dayOfWeek !== "-") ||
        (slot?.start && slot.start !== "-") ||
        (slot?.end && slot.end !== "-")
      );
    });

    return hasSlotsFilled;
  };

  const applyDraftToState = (draft) => {
    if (!draft) return;
    restoringDraftRef.current = true;

    try {
      if (typeof draft.step === "number") {
        const maxStep = steps.length - 1;
        setStep(Math.min(Math.max(draft.step, 0), maxStep));
      }
      if (draft.bookingType) {
        setBookingType(draft.bookingType);
      }
      if (typeof draft.price === "number") {
        setPrice(draft.price);
      }
      if (typeof draft.adjustedPrice === "number") {
        setAdjustedPrice(draft.adjustedPrice);
      }
      if (typeof draft.originalPrice === "number") {
        setOriginalPrice(draft.originalPrice);
      }
      setParentFirstName(draft.parentFirst || "");
      setParentLastName(draft.parentLast || "");
      setParentEmail(draft.parentEmail || "");
      setParentPhone(draft.parentPhone || "");
      setStudentType(draft.studentType || studentTypeOptions[0]);

      if (Array.isArray(draft.students) && draft.students.length) {
        const normalizedStudents = draft.students.map((student) => ({
          ...studentTemplate,
          ...student,
        }));
        setStudents(normalizedStudents);
      }

      if (Array.isArray(draft.slots) && draft.slots.length) {
        const slotTemplate = { date: "", dayOfWeek: "-", start: "-", end: "-" };
        const normalizedSlots = draft.slots.map((slot) => ({
          ...slotTemplate,
          ...slot,
        }));
        while (normalizedSlots.length < slots.length) {
          normalizedSlots.push({ ...slotTemplate });
        }
        setSlots(normalizedSlots.slice(0, slots.length));
      }

      setHeardAbout(draft.heardAbout || "");
      if (draft.address && typeof draft.address === "object") {
        setAddress((prev) => ({ ...prev, ...draft.address }));
      }
      setAgreeCancel(Boolean(draft.agreeCancel));
      setAgreeService(Boolean(draft.agreeService));
      setAgreePhoto(Boolean(draft.agreePhoto));
      if (draft.policyAgreements && typeof draft.policyAgreements === "object") {
        setPolicyAgreements(draft.policyAgreements);
      }
      setSignature(draft.signature || "");
      if (Array.isArray(draft.selectedSessions)) {
        setSelectedSessions(draft.selectedSessions);
      }
      if (draft.timezone) {
        setTimezone(draft.timezone);
      }
    } finally {
      setTimeout(() => {
        restoringDraftRef.current = false;
      }, 0);
    }
  };

  const handleResumeDraft = () => {
    if (!pendingDraft) return;
    applyDraftToState(pendingDraft);
    setPendingDraft(null);
    setShowResumePrompt(false);
  };

  const handleDismissDraft = () => {
    setPendingDraft(null);
    setShowResumePrompt(false);
    try {
      localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    } catch (err) {
      console.debug("Draft removal skipped:", err?.message || err);
    }
  };
  useEffect(() => {
    setStudentInsights((prev) => {
      const next = students.map((student) => buildAgeInsightMessage(student));
      if (
        prev.length === next.length &&
        prev.every((msg, idx) => msg === next[idx])
      ) {
        return prev;
      }
      return next;
    });
  }, [students]);

  useEffect(() => {
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
      draftSaveTimeoutRef.current = null;
    }

    if (!draftLoaded || typeof window === "undefined") {
      return;
    }

    if (!hasMeaningfulDraftData()) {
      try {
        localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
      } catch (err) {
        console.debug("Draft cleanup skipped:", err?.message || err);
      }
      return;
    }

    if (restoringDraftRef.current) {
      return;
    }

    draftSaveTimeoutRef.current = setTimeout(() => {
      try {
        const snapshot = buildDraftSnapshot();
        localStorage.setItem(
          BOOKING_DRAFT_STORAGE_KEY,
          JSON.stringify(snapshot)
        );
      } catch (err) {
        console.warn("Unable to persist booking draft:", err);
      }
    }, 600);

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
        draftSaveTimeoutRef.current = null;
      }
    };
  }, [
    draftLoaded,
    parentFirstName,
    parentLastName,
    parentEmail,
    parentPhone,
    studentType,
    students,
    slots,
    heardAbout,
    address.street,
    address.city,
    address.state,
    address.zip,
    address.country,
    agreeCancel,
    agreeService,
    // agreePhoto removed - always false, handled verbally in person
    signature,
    bookingType,
    selectedSessions,
    timezone,
    adjustedPrice,
    originalPrice,
  ]);

  // Recalculate price when selectedSessions changes for "per session" bookings
  useEffect(() => {
    if (!bookingType) return;
    
    const selected = bookingTypes.find((bt) => bt.name === bookingType);
    if (!selected) return;
    
    const isPerSession = selected.lessonDates?.toLowerCase() === "per session" || 
                         selected.lessonDates?.toLowerCase() === "per session special";
    
    if (isPerSession) {
      const numberOfStudents = students.length || 1;
      const sessionsCount = selectedSessions.length || 0;
      const basePerSession = Number(selected.actualPrice) || 0;
      
      // Step 1: Apply owner/staff discount first (owner takes precedence)
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePerSession;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePerSession * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = numberOfStudents >= 2 && discountEnabled && Number(selected.studentDiscountPercent) > 0
        ? Number(selected.studentDiscountPercent)
        : 0;
      const perStudentPerSession = numberOfStudents >= 2 && discountPercent > 0
        ? priceAfterStaffDiscount * (1 - discountPercent / 100)
        : priceAfterStaffDiscount;

      const newAdjustedPrice = perStudentPerSession * numberOfStudents * sessionsCount;
      const newOriginalPrice = basePerSession * numberOfStudents * sessionsCount;
      setAdjustedPrice(newAdjustedPrice);
      setOriginalPrice(newOriginalPrice);
    } else {
      // Regular pricing - recalculate when students change or staff/owner discount status changes
      const numberOfStudents = students.length || 1;
      const basePrice = Number(selected.actualPrice) || 0;

      // Step 1: Apply owner/staff discount first (owner takes precedence)
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePrice;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePrice * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = numberOfStudents >= 2 && discountEnabled && Number(selected.studentDiscountPercent) > 0
        ? Number(selected.studentDiscountPercent)
        : 0;
      let finalPrice;
      if (numberOfStudents >= 2 && discountPercent > 0) {
        const discountedPer = priceAfterStaffDiscount * (1 - discountPercent / 100);
        finalPrice = discountedPer * numberOfStudents;
      } else {
        finalPrice = priceAfterStaffDiscount * numberOfStudents;
      }
      
      setAdjustedPrice(finalPrice);
      setOriginalPrice(basePrice * numberOfStudents);
    }
  }, [selectedSessions, bookingType, students.length, bookingTypes, isStaffBooking, staffDiscountConfig]);

  const canSubmit = useMemo(() => {
    const stateOK = isUSAddress ? !!address.state : true;
    const zipOK = isUSAddress ? !!address.zip.trim() : true;
    // Check that all dynamic policy groups are agreed to
    const allPoliciesAgreed = policyGroups.length === 0 || policyGroups.every((group) => policyAgreements[group.group]);
    return Boolean(
      address.street.trim() &&
        stateOK &&
        address.city &&
        zipOK &&
        address.country &&
        heardAbout &&
        allPoliciesAgreed &&
        signature.trim()
    );
  }, [
    address.street,
    address.state,
    address.city,
    address.zip,
    address.country,
    heardAbout,
    policyGroups,
    policyAgreements,
    signature,
    isUSAddress,
  ]);

  const next = async () => {
    
    const invalidDobIndex = students.findIndex((stu) => {
      const currentDate = DateTime.now().toISODate();
      return stu.dob && stu.dob > currentDate;
    });

    if (invalidDobIndex !== -1) {
      const updatedErrors = [...studentErrors];
      updatedErrors[invalidDobIndex].dob =
        "Date of birth cannot be in the future.";
      setStudentErrors(updatedErrors);
      return;
    }

    if (!isValidEmail(parentEmail)) {
      setErrors((prev) => ({
        ...prev,
        parentEmail: "Please enter a valid email address.",
      }));
      return;
    }

    if (!isValidPhoneNumber(parentPhone)) {
      setErrors((prev) => ({
        ...prev,
        parentPhone: "Please enter a valid phone number.",
      }));
      return;
    }

    let numberOfStudents = students.length;
    let newAdjustedPrice = price * numberOfStudents;
    let newOriginalPrice = selected.originalPrice * numberOfStudents;

    if (selected.lessonDates?.toLowerCase() === "one-off") {
      const ap = Number(selected.actualPrice) || 0;
      newAdjustedPrice = ap * 10;
      newOriginalPrice = (Number(selected.originalPrice) || ap) * 10;
    } else if (selected.lessonDates?.toLowerCase() === "per session special" || 
               selected.lessonDates?.toLowerCase() === "per session") {
      const sessionsCount = selectedSessions.length || 0;
      const basePerSession = Number(selected.actualPrice) || 0;
      
      // Step 1: Apply owner/staff discount first (owner takes precedence)
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePerSession;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePerSession * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = numberOfStudents >= 2 && discountEnabled && Number(selected.studentDiscountPercent) > 0
        ? Number(selected.studentDiscountPercent)
        : 0;
      const perStudentPerSession = numberOfStudents >= 2 && discountPercent > 0
        ? priceAfterStaffDiscount * (1 - discountPercent / 100)
        : priceAfterStaffDiscount;

      newAdjustedPrice = perStudentPerSession * numberOfStudents * sessionsCount;
      newOriginalPrice = basePerSession * numberOfStudents * sessionsCount;
    } else {
      // Regular pricing - Step 1: Apply owner/staff discount first (owner takes precedence)
      const basePer = Number(selected.actualPrice) || 0;
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePer;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePer * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (10% on already-discounted price)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = Number(selected.studentDiscountPercent) || 0;
      if (numberOfStudents >= 2 && discountEnabled && discountPercent > 0) {
        const discountedPer = priceAfterStaffDiscount * (1 - discountPercent / 100);
        newAdjustedPrice = discountedPer * numberOfStudents;
        newOriginalPrice = basePer * numberOfStudents;
      } else {
        newAdjustedPrice = priceAfterStaffDiscount * numberOfStudents;
        newOriginalPrice = basePer * numberOfStudents;
      }
    }

    setAdjustedPrice(newAdjustedPrice);
    setOriginalPrice(newOriginalPrice);

    // Note: Removed duplicate price calculation that was overwriting the correct
    // calculation above. The correct calculation for "per session special" already
    // accounts for numberOfStudents * sessionsCount in the block above (lines 1647-1656).

    if (
      (step === 1 && hideDayTime) ||
      (step === 1 && selected.lessonDates?.toLowerCase() === "one-off")
    ) {
      setStep(3); // Move to step 3 immediately
      // Save draft in background (non-blocking) - backend now processes Klaviyo async
      saveDraft(true).catch(err => console.error('Background save failed:', err));
      return;
    }
    if (
      step === 0 &&
      selected.lessonType === "Club" &&
      !isLoadingClubSessions &&
      clubSessions.length === 0
    ) {
      const newErrors = {};
      if (!parentFirstName.trim()) newErrors.parentFirstName = "Required";
      if (!parentLastName.trim()) newErrors.parentLastName = "Required";
      if (!parentEmail.trim()) newErrors.parentEmail = "Required";
      if (!parentPhone.trim()) newErrors.parentPhone = "Required";

      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      } else {
        setErrors({});
      }
    }
    if (step === 1) {
      const errorsCopy = students.map((stu) => {
        const err = {};
        if (!stu.first?.trim()) err.first = "First name is required";
        if (!stu.last?.trim()) err.last = "Last name is required";
        if (!stu.dob) err.dob = "Date of birth is required";
        return err;
      });
      setStudentErrors(errorsCopy);
      const hasAnyErrors = errorsCopy.some((e) => Object.keys(e).length > 0);
      if (hasAnyErrors) return;
    }

    if (
      step === 2 &&
      !hideDayTime &&
      selected.lessonDates?.toLowerCase() !== "one-off"
    ) {
      if (
        selected.lessonType === "Club" &&
        selected.lessonDates?.toLowerCase() === "per session" &&
        selectedSessions.length === 0 &&
        !isStaffBooking // Allow staff bookings without sessions for testing
      ) {
        setSessionError("Please select at least one class to continue.");
        return;
      }

      if (
        selected.lessonDates?.toLowerCase() !== "per session" &&
        selected.lessonDates?.toLowerCase() !== "per session special" &&
        !slots[0].date
      ) {
        setSessionError("Please select a preferred start date.");
        return;
      }
      setSessionError("");
    }

    if (step === 2) {
      if (
        selected.lessonDates?.toLowerCase() !== "per session" &&
        selected.lessonDates?.toLowerCase() !== "per session special" &&
        !slots[0].date
      ) {
        setSessionError("Please select a preferred start date.");
        return;
      }

      if (
        selected.lessonDates?.toLowerCase() !== "per session" &&
        selected.lessonDates?.toLowerCase() !== "per session special" &&
        (!slots[0].date ||
          slots[0].dayOfWeek === "-" ||
          slots[0].start === "-" ||
          slots[0].end === "-")
      ) {
        setSessionError("Please select a preferred start date and time.");
        return;
      }
      if (!hideDayTime) {
        if (
          selected.lessonType === "Club" &&
          selected.lessonDates?.toLowerCase() !== "one-off"
        ) {
          setSessionError("");
        } else if (selected.lessonType !== "Club" && !slots[1].dayOfWeek) {
          setSessionError(
            "Please select a day of the week for the first scheduling window."
          );
          return;
        }
      }
      setSessionError("");
    }

    const isPSS = selected.lessonDates?.toLowerCase() === "per session special";
    if (step === 3 && isPSS) {
      setConfirmationErrors({});
      setSessionError("");

      const stepList =
        typeof visibleSteps !== "undefined" ? visibleSteps : steps;
      setStep((s) => Math.min(s + 1, stepList.length - 1));
      
      // Save draft in background (non-blocking) - backend now processes Klaviyo async
      saveDraft(true).catch(err => console.error('Background save failed:', err));
      return;
    }

    if (step === 3) {
      const confErrors = {};
      if (!address.street.trim())
        confErrors.street = "Street address is required";
      if (isUSAddress && !address.state) confErrors.state = "State is required";
      if (!address.city) confErrors.city = "City is required";
      if (isUSAddress && !address.zip.trim()) confErrors.zip = "ZIP code is required";
      if (!address.country) confErrors.country = "Country is required";
      if (!heardAbout) confErrors.heardAbout = "This field is required";
      // Validate dynamic policy agreements
      policyGroups.forEach((group) => {
        if (!policyAgreements[group.group]) {
          confErrors[`agree_${group.group}`] = "Required";
        }
      });
      if (!signature.trim()) confErrors.signature = "Signature is required";

      if (Object.keys(confErrors).length > 0) {
        setConfirmationErrors(confErrors);
        return;
      } else {
        setConfirmationErrors({});
      }
    }
    setSessionError("");
    const nextStep = Math.min(step + 1, steps.length - 1);
    
    // Track step completion
    const stepNames = ['parent_info', 'student_info', 'time_selection', 'confirmation', 'payment'];
    const currentStepName = stepNames[step] || `step_${step}`;
    const nextStepName = stepNames[nextStep] || `step_${nextStep}`;
    
    trackFormEvent('step_completed', currentStepName, step, {
      nextStep: nextStepName,
      nextStepNumber: nextStep,
    });
    
    setStep(nextStep);
    
    // Track form start if moving from step 0 to step 1
    if (step === 0 && nextStep === 1) {
      trackFormEvent('form_start', 'parent_info', 1, {});
    }
    
    // Save draft in background (non-blocking) - backend now processes Klaviyo async
    saveDraft().catch(err => console.error('Background save failed:', err));
  };

  const prev = async () => {
    await saveDraft(); // Regular save - will skip if insufficient data
    if (
      (step === 3 && hideDayTime) ||
      (step === 3 && selected.lessonDates?.toLowerCase() === "one-off")
    ) {
      return setStep(1);
    }
    setStep((s) => Math.max(s - 1, 0));
  };

//   const submit = async () => {
//   if (isSubmitting) return;
//   const confErrors = {};
//   if (!address.street.trim())
//     confErrors.street = "Street address is required";
//   if (isUSAddress && !address.state) confErrors.state = "State is required";
//   if (!address.city) confErrors.city = "City is required";
//   if (!address.zip.trim()) confErrors.zip = "ZIP code is required";
//   if (!address.country) confErrors.country = "Country is required";
//   if (!heardAbout) confErrors.heardAbout = "This field is required";
//   if (!agreeCancel) confErrors.agreeCancel = "This field is required";
//   if (!agreeService) confErrors.agreeService = "This field is required";
//   if (!signature.trim()) confErrors.signature = "Signature is required";

//   if (Object.keys(confErrors).length > 0) {
//     setConfirmationErrors(confErrors);
//     return;
//   } else {
//     setConfirmationErrors({});
//   }

//   setIsSubmitting(true);

//   const selectedType =
//     bookingTypes.find((bt) => bt.name === bookingType) || {};

//   const finalColour = colour || (await resolveFinalColour(selectedType));
//   setColour(finalColour);
//   console.log("Selected Type:", selectedType);
//   console.log("Booking Type Name:", selectedType.bookingType);

//   const finalPrice =
//     selected.lessonDates?.toLowerCase() === "one-off"
//       ? (Number(selected.actualPrice) || 0) * 10
//       : price;

//   const bookingPayload = {
//     bookingType,
//     actualPrice: adjustedPrice,
//     originalPrice: selectedType.originalPrice,
//     parentFirst: parentFirstName,
//     parentLast: parentLastName,
//     parentEmail,
//     parentPhone,
//     studentType,
//     students,
//     slots,
//     heardAbout,
//     address,
//     agreeCancel,
//     agreeService,
//     agreePhoto: false, // Photo release removed - handled verbally in person
//     signature,
//     labelId: selectedType.labelId,
//     labelName: selectedType.labelName,
//     selectedSessions,
//     lessonType: selectedType.lessonType,
//     sessionId,
//     timezone,
//     isTrial: selectedType.is_trial,
//     colour: finalColour,
//     attribution,
//   };

//   console.log(
//     "Students' Experience Data:",
//     students.map((stu, idx) => ({
//       student: idx + 1,
//       experience: stu.experience,
//     }))
//   );

//   try {
//     const bookingRes = await fetch("/api/submissions", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(bookingPayload),
//     });
//     localStorage.removeItem("bookingSessionId");

//     if (!bookingRes.ok) throw new Error(await bookingRes.text());

//     const { id } = await bookingRes.json();
//     setSubmissionId(id);
//     console.log("Price being sent to Stripe:", price);

//     // --- CREATE CHECKOUT SESSION (patched) ---
//     const checkoutRes = await fetch("/api/create-checkout-session", {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         submissionId: id,
//         price:
//           adjustedPrice > 1
//             ? adjustedPrice
//             : selected.lessonDates?.toLowerCase() === "one-off"
//             ? (Number(selected.actualPrice) || 0) * 10
//             : selected.lessonDates?.toLowerCase() === "per session" ||
//               selected.lessonDates?.toLowerCase() === "per session special"
//             ? Number(selected.actualPrice || 0) * selectedSessions.length
//             : Number(selected.actualPrice || 0),
//         bookingTypeName: selectedType.name,
//         parentEmail,
//       }),
//     });

//     // Parse once
//     const raw = await checkoutRes.text();
//     let checkoutJson = {};
//     try {
//       checkoutJson = raw ? JSON.parse(raw) : {};
//     } catch {}

//     console.log(
//       "create-checkout-session status:",
//       checkoutRes.status,
//       checkoutJson
//     );

//     // Handle errors first
//     if (!checkoutRes.ok) {
//       const msg =
//         checkoutJson.error ||
//         checkoutJson.message ||
//         `HTTP ${checkoutRes.status}`;
//       alert(`Could not start payment: ${msg}`);
//       setIsSubmitting(false);
//       return;
//     }

//     // Normalize server response
//     const url = checkoutJson.url;
//     const sessionIdStripe = checkoutJson.sessionId || checkoutJson.id;

//     if (url) {
//       window.location.assign(url);
//       return;
//     }

//     const stripe = await stripePromise;
//     if (!stripe)
//       throw new Error(
//         "Stripe.js failed to load (check REACT_APP_STRIPE_PUBLISHABLE_KEY)"
//       );

//     const { error } = await stripe.redirectToCheckout({
//       sessionId: sessionIdStripe,
//     });
//     if (error) throw error;

//     setSubmitted(true);
//   } catch (err) {
//     console.error(err);
//   } finally {
//     setIsSubmitting(false);
//   }
// };

const submit = async () => {
  if (isSubmitting) return;

  console.log("[SUBMIT] starting…");
  const confErrors = {};
  if (!address.street.trim()) confErrors.street = "Street address is required";
  if (isUSAddress && !address.state) confErrors.state = "State is required";
  if (!address.city) confErrors.city = "City is required";
  if (isUSAddress && !address.zip.trim()) confErrors.zip = "ZIP code is required";
  if (!address.country) confErrors.country = "Country is required";
  if (!heardAbout) confErrors.heardAbout = "This field is required";
  // Validate dynamic policy agreements
  policyGroups.forEach((group) => {
    if (!policyAgreements[group.group]) {
      confErrors[`agree_${group.group}`] = "This field is required";
    }
  });
  if (!signature.trim()) confErrors.signature = "Signature is required";

  // Validate student data before submission
  const studentValidationErrors = [];
  students.forEach((student, index) => {
    if (!student.first?.trim()) {
      studentValidationErrors.push(`Student ${index + 1}: First name is required`);
    }
    if (!student.last?.trim()) {
      studentValidationErrors.push(`Student ${index + 1}: Last name is required`);
    }
    if (!student.dob) {
      studentValidationErrors.push(`Student ${index + 1}: Date of birth is required`);
      } else {
        // Enhanced DOB validation - cross-browser compatible
        if (typeof student.dob !== 'string' || student.dob.length !== 10 || !student.dob.includes('-')) {
          studentValidationErrors.push(`Student ${index + 1}: Invalid date format. Please use YYYY-MM-DD format.`);
        } else {
          const year = parseInt(student.dob.split('-')[0]);
          if (isNaN(year) || year < 1900 || year > 2030) {
            studentValidationErrors.push(`Student ${index + 1}: Invalid birth year: ${year}. Must be between 1900-2030.`);
          } else {
            const birthDate = parseDateSafely(student.dob);
            if (!birthDate) {
              studentValidationErrors.push(`Student ${index + 1}: Invalid date: ${student.dob}. Please check the date format.`);
            } else if (isDateInFuture(birthDate)) {
              studentValidationErrors.push(`Student ${index + 1}: Date of birth cannot be in the future.`);
            } else {
              const age = calculateAge(birthDate);
              if (age > 100 || age < 0) {
                studentValidationErrors.push(`Student ${index + 1}: Student would be ${age} years old - please check birth year`);
              }
            }
          }
        }
      }
  });

  if (studentValidationErrors.length > 0) {
    console.warn("[SUBMIT] student validation errors", studentValidationErrors);
    toast.error(`Please fix the following errors:\n\n${studentValidationErrors.join('\n')}`);
    return;
  }

  if (Object.keys(confErrors).length > 0) {
    console.warn("[SUBMIT] validation errors", confErrors);
    setConfirmationErrors(confErrors);
    return;
  } else {
    setConfirmationErrors({});
  }

  setIsSubmitting(true);

  const selectedType =
    bookingTypes.find((bt) => bt.name === bookingType) || {};
  const finalColour = colour || (await resolveFinalColour(selectedType));
  setColour(finalColour);

  console.log("[SUBMIT] selectedType:", selectedType);
  console.log("[SUBMIT] bookingTypeName:", selectedType.bookingType);

  // Safeguard: Ensure adjustedPrice is valid, recalculate if it's 0 or invalid
  let finalAdjustedPrice = adjustedPrice;
  const numberOfStudents = students.length || 1;
  
  // If term billing is being used, use term billing price
  if (useTermBilling && termBillingPrice && termBillingPrice > 0) {
    finalAdjustedPrice = termBillingPrice;
    console.log("[SUBMIT] Using term billing price: " + finalAdjustedPrice);
  } else if (!finalAdjustedPrice || finalAdjustedPrice <= 0) {
    console.warn("[SUBMIT] ⚠️ adjustedPrice is invalid (" + finalAdjustedPrice + "), recalculating from selectedType");
    
    // Recalculate using the same logic as calculateAdjustedPrice
    const basePrice = Number(selectedType.actualPrice) || 0;
    if (basePrice > 0) {
      const selected = bookingTypes.find((bt) => bt.name === bookingType);
      if (selected?.lessonDates?.toLowerCase() === "one-off") {
        finalAdjustedPrice = basePrice * 10;
      } else if (selected?.lessonDates?.toLowerCase() === "per session" ||
                 selected?.lessonDates?.toLowerCase() === "per session special") {
        const sessionsCount = selectedSessions.length || 0;

        // Step 1: Apply owner/staff discount first (owner takes precedence)
        const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
        const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
        const specialDiscountPercent = hasOwnerDiscount
          ? (ownerDiscountConfig.monthlyPercent || 50)
          : hasStaffDiscount
            ? (staffDiscountConfig.monthlyPercent || 20)
            : 0;
        let priceAfterStaffDiscount = basePrice;
        if (specialDiscountPercent > 0) {
          priceAfterStaffDiscount = basePrice * (1 - specialDiscountPercent / 100);
        }

        // Step 2: Apply sibling discount if 2+ students (10% on already-discounted price)
        const discountEnabled = !!selected.studentDiscountEnabled;
        const discountPercent = Number(selected.studentDiscountPercent) || 0;
        const perStudentPerSession = discountEnabled && numberOfStudents >= 2 && discountPercent > 0
          ? priceAfterStaffDiscount * (1 - discountPercent / 100)
          : priceAfterStaffDiscount;
        finalAdjustedPrice = perStudentPerSession * numberOfStudents * sessionsCount;
      } else {
        // Regular pricing - Step 1: Apply owner/staff discount first (owner takes precedence)
        const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
        const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
        const specialDiscountPercent = hasOwnerDiscount
          ? (ownerDiscountConfig.monthlyPercent || 50)
          : hasStaffDiscount
            ? (staffDiscountConfig.monthlyPercent || 20)
            : 0;
        let priceAfterStaffDiscount = basePrice;
        if (specialDiscountPercent > 0) {
          priceAfterStaffDiscount = basePrice * (1 - specialDiscountPercent / 100);
        }

        // Step 2: Apply sibling discount if 2+ students (10% on already-discounted price)
        const discountEnabled = !!selected?.studentDiscountEnabled;
        const discountPercent = Number(selected?.studentDiscountPercent) || 0;
        if (numberOfStudents >= 2 && discountEnabled && discountPercent > 0) {
          const discountedPer = priceAfterStaffDiscount * (1 - discountPercent / 100);
          finalAdjustedPrice = discountedPer * numberOfStudents;
        } else {
          finalAdjustedPrice = priceAfterStaffDiscount * numberOfStudents;
        }
      }
      
      console.log("[SUBMIT] ✅ Recalculated price: " + finalAdjustedPrice + " (from basePrice: " + basePrice + ", students: " + numberOfStudents + ")");
      setAdjustedPrice(finalAdjustedPrice);
    } else {
      // If term billing is selected but price not calculated, try to calculate it now
      if (useTermBilling && termBillingConfig) {
        console.log("[SUBMIT] Term billing selected but price not set, calculating now...");
        const enrollDate = slots[0]?.date 
          ? new Date(slots[0].date)
          : new Date();
        
        if (paymentPlan === 'term') {
          // Calculate term payment
          const sortedDates = termBillingConfig.class_dates.map(d => new Date(d)).sort((a, b) => a - b);
          const remainingDates = sortedDates.filter(d => d >= enrollDate);
          const remainingLessons = remainingDates.length;
          const termTotal = remainingLessons * termBillingConfig.rate_per_lesson;
          const discount = termBillingConfig.term_discount_percent || 0;
          finalAdjustedPrice = termTotal * (1 - discount / 100);
        } else {
          // Calculate initial monthly charge
          const currentMonth = new Date(enrollDate.getFullYear(), enrollDate.getMonth(), 1);
          const monthDates = termBillingConfig.class_dates.filter(dateStr => {
            const date = new Date(dateStr);
            return date >= enrollDate && 
                   date.getMonth() === currentMonth.getMonth() && 
                   date.getFullYear() === currentMonth.getFullYear();
          });
          finalAdjustedPrice = monthDates.length * termBillingConfig.rate_per_lesson;
        }
        
        console.log("[SUBMIT] ✅ Calculated term billing price: " + finalAdjustedPrice);
        setAdjustedPrice(finalAdjustedPrice);
      } else {
        console.error("[SUBMIT] ❌ Cannot calculate price - selectedType.actualPrice is also invalid: " + basePrice);
        toast.error("Error: Unable to calculate booking price. Please refresh the page and try again.");
        setIsSubmitting(false);
        return;
      }
    }
  }

  // Check if term billing is enabled and selected (before creating payload)
  const activeServiceId = selectedType.serviceId || preselectServiceId;
  const finalPaymentPlan = paymentPlan || (termBillingConfig ? 'monthly' : null);
  const willUseSubscriptionFlow = !!(termBillingConfig && activeServiceId && finalPaymentPlan);

  const bookingPayload = {
    bookingType,
    actualPrice: finalAdjustedPrice,
    originalPrice: selectedType.originalPrice,
    parentFirst: parentFirstName,
    parentLast: parentLastName,
    parentEmail,
    parentPhone,
    studentType,
    students,
    slots,
    heardAbout,
    address,
    agreeCancel,
    agreeService,
    agreePhoto: false, // Photo release removed - handled verbally in person
    policyAgreements,
    signature,
    labelId: selectedType.labelId,
    labelName: selectedType.labelName,
    selectedSessions,
    lessonType: selectedType.lessonType,
    sessionId,
    timezone,
    isTrial: selectedType.is_trial,
    colour: finalColour,
    attribution,
    // Add subscription flags for pre-creation
    serviceId: willUseSubscriptionFlow ? activeServiceId : null,
    willUseSubscriptionFlow: willUseSubscriptionFlow,
    // Staff booking flag
    isStaffBooking: isStaffBooking,
    // Preferred tutor from public profile page
    preferredTutorId: preferredTutorId || null,
    preferredTutorName: preferredTutorName || null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.error("[SUBMIT] booking timeout (30s) – aborting");
    controller.abort();
  }, 30_000);

  try {
    console.time("[POST] /api/submissions");
    const bookingRes = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookingPayload),
      signal: controller.signal,
    });
    console.timeEnd("[POST] /api/submissions");
    localStorage.removeItem("bookingSessionId");
    try {
      localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
    } catch (err) {
      console.debug("Draft cleanup skipped after submit:", err?.message || err);
    }

    const bookingText = await bookingRes.text();
    console.log("[/api/submissions] status:", bookingRes.status, "raw:", bookingText);

    if (!bookingRes.ok) {
      toast.error(`Booking failed: HTTP ${bookingRes.status}`);
      setIsSubmitting(false);
      return;
    }

    let bookingJson = {};
    try { bookingJson = bookingText ? JSON.parse(bookingText) : {}; } catch (e) {
      console.error("JSON parse error for /api/submissions:", e);
    }

    const { id } = bookingJson;
    if (!id) {
      toast.error("Booking succeeded but no submission id returned");
      setIsSubmitting(false);
      return;
    }

    setSubmissionId(id);
    console.log("[SUBMIT] submission id:", id, "| price used:", finalAdjustedPrice);
    
    // Store booking data in sessionStorage for immediate display on success page
    const bookingData = {
      bookingType: selectedType.name || bookingType,
      actualPrice: finalAdjustedPrice,
      students: students,
      slots: slots,
      parentFirstName: parentFirstName,
      parentLastName: parentLastName,
      parentEmail: parentEmail,
      paymentStatus: "paid" // We know payment was successful since we're here
    };
    sessionStorage.setItem(`submissionData-${id}`, JSON.stringify(bookingData));

    // CRITICAL: Validate selectedType exists before accessing properties
    // This prevents ReferenceError: Cannot access 'T' before initialization
    if (!selectedType || typeof selectedType !== 'object') {
      const errorMsg = `Critical error: selectedType is invalid. Type: ${typeof selectedType}, Value: ${selectedType}`;
      console.error("[SUBMIT] ERROR:", errorMsg);
      
      // Track error in database
      try {
        await fetch(`/api/submissions/${id}/track-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'submission_error',
            error: errorMsg,
            details: {
              bookingType,
              selectedType: String(selectedType),
              bookingTypesLength: bookingTypes?.length || 0
            },
            statusCode: 500
          })
        });
      } catch (trackErr) {
        console.error("[SUBMIT] Failed to track error:", trackErr);
      }
      
      toast.error("An error occurred processing your booking. Please contact support with submission ID: " + id);
      setIsSubmitting(false);
      return;
    }

    // Debug logging to understand why subscription flow might not trigger
    console.log("[SUBMIT] Subscription flow check:", {
      termBillingConfig: !!termBillingConfig,
      activeServiceId,
      paymentPlan,
      finalPaymentPlan,
      useTermBilling,
      willUseSubscriptionFlow
    });
    
    // Use termBillingConfig to determine if subscription flow should be used
    // This ensures subscription flow triggers even if user doesn't interact with PaymentPlanSelector
    if (termBillingConfig && activeServiceId && finalPaymentPlan) {
      // Clear the timeout since subscription creation can take longer than 30s
      clearTimeout(timeout);
      console.log("[SUBMIT] ✅ Using term billing subscription flow");
      
      try {
        // Get enrollment date (use first slot date or today)
        const enrollmentDate = slots[0]?.date 
          ? new Date(slots[0].date).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];
        
        // Get recipient ID (first student)
        const recipientId = students[0]?.tcRecipientId || null;
        
        // Determine which subscription endpoint to call
        const subscriptionEndpoint = finalPaymentPlan === 'term' 
          ? '/api/subscriptions/create-term-payment'
          : '/api/subscriptions/create';
        
        console.log("[SUBMIT] Creating subscription:", {
          serviceId: activeServiceId,
          paymentPlan: finalPaymentPlan,
          enrollmentDate,
          submissionId: id,
        });

        console.time(`[POST] ${subscriptionEndpoint}`);
        const subscriptionRes = await fetch(subscriptionEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: activeServiceId,
            clientId: null, // Will be created in TutorCruncher
            recipientId: recipientId,
            parentEmail: parentEmail,
            parentName: `${parentFirstName} ${parentLastName}`,
            parentPhone: parentPhone,
            enrollmentDate: enrollmentDate,
            // Include booking submission data for TutorCruncher integration
            submissionId: id,
            isOwnerBooking: isOwnerBooking || false,
            isStaffBooking: isStaffBooking || false,
            bookingData: {
              bookingType: selectedType.name,
              students: students,
              slots: slots,
              address: address,
              timezone: timezone,
            },
          }),
        });
        console.timeEnd(`[POST] ${subscriptionEndpoint}`);

        const subscriptionText = await subscriptionRes.text();
        console.log(`[${subscriptionEndpoint}] status:`, subscriptionRes.status, "raw:", subscriptionText);

        if (!subscriptionRes.ok) {
          let errMsg = `HTTP ${subscriptionRes.status}`;
          try {
            const j = subscriptionText ? JSON.parse(subscriptionText) : {};
            errMsg = j.error || j.message || errMsg;
          } catch {}
          
          toast.error(`Could not create subscription: ${errMsg}`);
          setIsSubmitting(false);
          return;
        }

        let subscriptionJson = {};
        try { 
          subscriptionJson = subscriptionText ? JSON.parse(subscriptionText) : {}; 
        } catch (e) {
          console.error("JSON parse error for subscription API:", e);
        }

        // Handle payment method collection if needed
        if (subscriptionJson.requiresPaymentMethod) {
          // Redirect directly to Stripe's hosted checkout (like term payments)
          if (subscriptionJson.checkoutSessionUrl) {
            console.log('[SUBMIT] Redirecting to Stripe Checkout for monthly billing payment...', {
              checkoutSessionId: subscriptionJson.checkoutSessionId,
              checkoutSessionUrl: subscriptionJson.checkoutSessionUrl
            });
            window.location.href = subscriptionJson.checkoutSessionUrl;
            return; // Don't reset isSubmitting - let redirect happen
          } else {
            console.error('[SUBMIT] Missing checkoutSessionUrl for redirect');
            toast.error('Error: Could not redirect to payment page. Please try again.');
            setIsSubmitting(false);
            return;
          }
        }
        
        if (subscriptionJson.success) {
          const enrollment = subscriptionJson.enrollment;
          
          // Track subscription creation
          trackFormEvent('subscription_created', 'payment', 4, {
            enrollmentId: enrollment.id,
            paymentPlan: paymentPlan,
            submissionId: id,
            serviceId: activeServiceId,
          });
          
          // Update booking data with subscription info
          bookingData.subscriptionEnrollmentId = enrollment.id;
          bookingData.paymentPlan = finalPaymentPlan;
          bookingData.paymentStatus = finalPaymentPlan === 'term' ? 'paid' : 'pending';
          sessionStorage.setItem(`submissionData-${id}`, JSON.stringify(bookingData));
          
          // Redirect to success page with submission ID if available
          const successUrl = `/booking-forms/success?${id ? `submission_id=${id}&` : ''}session_id=${enrollment.id}&type=subscription`;
          window.location.href = successUrl;
          setSubmitted(true);
          return;
        } else {
          toast.error(`Subscription creation failed: ${subscriptionJson.error || subscriptionJson.message || 'Unknown error'}`);
          setIsSubmitting(false);
          return;
        }
    } catch (err) {
      console.error("[SUBMIT] Subscription error:", err);
      
      // Track error in database
      try {
        await fetch(`/api/submissions/${id}/track-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'subscription_creation_error',
            error: err.message || 'Unknown subscription error',
            details: {
              stack: err.stack,
              serviceId: activeServiceId,
              paymentPlan
            },
            statusCode: 500
          })
        });
      } catch (trackErr) {
        console.error("[SUBMIT] Failed to track subscription error:", trackErr);
      }
      
      toast.error(`Error creating subscription: ${err.message}`);
      setIsSubmitting(false);
      return;
    }
  }

  // Standard checkout flow (existing code)
    // Create Checkout Session
    // Use finalAdjustedPrice which already accounts for students and sessions and has been validated
    // Fallback calculation should also account for students if finalAdjustedPrice is somehow 0 or invalid
    const numberOfStudents = students.length;
    const selected = bookingTypes.find((bt) => bt.name === bookingType) || selectedType;
    const priceToCharge =
      finalAdjustedPrice > 1
        ? finalAdjustedPrice
        : selected?.lessonDates?.toLowerCase() === "one-off"
        ? (Number(selected?.actualPrice) || 0) * 10
        : selected?.lessonDates?.toLowerCase() === "per session" ||
          selected?.lessonDates?.toLowerCase() === "per session special"
        ? Number(selected?.actualPrice || 0) * selectedSessions.length * numberOfStudents
        : Number(selected?.actualPrice || 0) * numberOfStudents;

    console.log("[SUBMIT] creating checkout session with:", {
      submissionId: id,
      priceToCharge,
      bookingTypeName: selectedType.name,
      parentEmail,
    });

    console.time("[POST] /api/create-checkout-session");
    const checkoutRes = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submissionId: id,
        price: priceToCharge,
        bookingTypeName: selectedType.name,
        parentEmail,
      }),
    });
    console.timeEnd("[POST] /api/create-checkout-session");

    const checkoutRaw = await checkoutRes.text();
    console.log("[/api/create-checkout-session] status:", checkoutRes.status, "raw:", checkoutRaw);

    if (!checkoutRes.ok) {
      let errMsg = `HTTP ${checkoutRes.status}`;
      let errorDetails = {};
      try {
        const j = checkoutRaw ? JSON.parse(checkoutRaw) : {};
        errMsg = j.error || j.message || errMsg;
        errorDetails = j;
      } catch {}
      
      // Track error in database
      try {
        await fetch(`/api/submissions/${id}/track-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'checkout_session_creation',
            error: errMsg,
            details: {
              ...errorDetails,
              submissionId: id,
              priceToCharge,
              bookingTypeName: selectedType?.name || bookingType,
              parentEmail
            },
            statusCode: checkoutRes.status,
            timestamp: new Date().toISOString()
          })
        }).catch(err => console.error('Failed to track error:', err));
        
        // CRITICAL: Log to console for immediate visibility
        console.error("[SUBMIT] 🚨 CRITICAL: Checkout session creation failed for submission", id, {
          error: errMsg,
          status: checkoutRes.status,
          details: errorDetails
        });
      } catch (trackErr) {
        console.error('Error tracking failed:', trackErr);
      }
      
      toast.error(`Could not start payment: ${errMsg}`);
      setIsSubmitting(false);
      return;
    }

    let checkoutJson = {};
    try { checkoutJson = checkoutRaw ? JSON.parse(checkoutRaw) : {}; } catch (e) {
      console.error("JSON parse error for /api/create-checkout-session:", e);
    }

    const url = checkoutJson.url;
    const sessionIdStripe = checkoutJson.sessionId || checkoutJson.id;

    // Track Stripe checkout session creation
    if (sessionIdStripe) {
      trackFormEvent('stripe_checkout_created', 'payment', 4, {
        stripeSessionId: sessionIdStripe,
        submissionId: id,
        price: priceToCharge,
        bookingType: selectedType.name,
      });
    }

    if (url) {
      console.log("[SUBMIT] redirecting to URL:", url);
      window.location.assign(url);
      return;
    }

    const stripe = await stripePromiseState;
    if (!stripe) {
      toast.error("Stripe.js failed to load. Please refresh the page and try again.");
      setIsSubmitting(false);
      return;
    }

    console.log("[SUBMIT] redirectToCheckout with sessionId:", sessionIdStripe);
    const { error } = await stripe.redirectToCheckout({ sessionId: sessionIdStripe });
    if (error) throw error;

    // Don't reset isSubmitting here - let the redirect happen while button stays disabled
    setSubmitted(true);
    console.log("[SUBMIT] redirect initiated successfully");
  } catch (err) {
    if (err.name === "AbortError") {
      toast.error("Request timed out. Please try again.");
    }
    console.error("[SUBMIT] error:", err);
    
    // Track submission errors
    if (submissionId) {
      try {
        await fetch(`/api/submissions/${submissionId}/track-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'submission_error',
            error: err.message || 'Unknown error',
            details: {
              name: err.name,
              stack: err.stack,
              abortError: err.name === "AbortError"
            },
            timestamp: new Date().toISOString()
          })
        }).catch(trackErr => console.error('Failed to track error:', trackErr));
      } catch (trackErr) {
        console.error('Error tracking failed:', trackErr);
      }
    }
    
    // Only reset isSubmitting on actual errors
    clearTimeout(timeout);
    setIsSubmitting(false);
    console.log("[SUBMIT] finished with error");
  }
};


  if (submitted) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="60vh"
        textAlign="center"
        p={4}
      >
        <CheckCircleOutlineIcon
          className="h-20 w-20 text-green-600 mb-2 mx-auto"
        />
        <Typography variant="h4" gutterBottom>
          Thanks for booking!
        </Typography>
        <Typography variant="body1" color="text.secondary" mb={3}>
          Your booking has been received.
          <br />
          We’ll be in touch with the details shortly.
        </Typography>
        <Button
          variant="contained"
          onClick={() => {
            setSubmitted(false);
            setSubmissionId(null);
            setStep(0);
          }}
        >
          Make another booking
        </Button>
      </Box>
    );
  }

  const handleTimeRangeChange = (i, type, value) => {
    setTimeRanges((tr) =>
      tr.map((t, idx) => (idx === i ? { ...t, [type]: Number(value) } : t))
    );
  };
  const detail = bookingDetails[bookingType];

  const getTimezones = () => {
    return DateTime.local().zones();
  };
  const getAge = (dob) =>
    dob
      ? Math.floor(
          (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365)
        )
      : "";

  const isFixedSelection = [
    "one-off",
    "per session special",
  ].includes(selected.lessonDates?.toLowerCase());

  // Helper function to calculate adjusted price with sibling discounts
  const calculateAdjustedPrice = (numberOfStudents) => {
    let newAdjustedPrice = price * numberOfStudents;
    let newOriginalPrice = (selected.originalPrice || 0) * numberOfStudents;

    if (selected.lessonDates?.toLowerCase() === "one-off") {
      const ap = Number(selected.actualPrice) || 0;
      newAdjustedPrice = ap * 10;
      newOriginalPrice = (Number(selected.originalPrice) || ap) * 10;
    } else if (selected.lessonDates?.toLowerCase() === "per session special" || 
               selected.lessonDates?.toLowerCase() === "per session") {
      const sessionsCount = selectedSessions.length || 0;
      const basePerSession = Number(selected.actualPrice) || 0;
      
      // Step 1: Apply owner/staff discount first (owner takes precedence)
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePerSession;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePerSession * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = numberOfStudents >= 2 && discountEnabled && Number(selected.studentDiscountPercent) > 0
        ? Number(selected.studentDiscountPercent)
        : 0;
      const perStudentPerSession = numberOfStudents >= 2 && discountPercent > 0
        ? priceAfterStaffDiscount * (1 - discountPercent / 100)
        : priceAfterStaffDiscount;

      newAdjustedPrice = perStudentPerSession * numberOfStudents * sessionsCount;
      newOriginalPrice = basePerSession * numberOfStudents * sessionsCount;
    } else {
      // Regular pricing - Step 1: Apply owner/staff discount first (owner takes precedence)
      const basePer = Number(selected.actualPrice) || 0;
      const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
      const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
      const specialDiscountPercent = hasOwnerDiscount
        ? (ownerDiscountConfig.monthlyPercent || 50)
        : hasStaffDiscount
          ? (staffDiscountConfig.monthlyPercent || 20)
          : 0;
      let priceAfterStaffDiscount = basePer;
      if (specialDiscountPercent > 0) {
        priceAfterStaffDiscount = basePer * (1 - specialDiscountPercent / 100);
      }

      // Step 2: Apply sibling discount if 2+ students (10% on already-discounted price)
      const discountEnabled = !!selected.studentDiscountEnabled;
      const discountPercent = Number(selected.studentDiscountPercent) || 0;
      if (numberOfStudents >= 2 && discountEnabled && discountPercent > 0) {
        const discountedPer = priceAfterStaffDiscount * (1 - discountPercent / 100);
        newAdjustedPrice = discountedPer * numberOfStudents;
        newOriginalPrice = basePer * numberOfStudents;
      } else {
        newAdjustedPrice = priceAfterStaffDiscount * numberOfStudents;
        newOriginalPrice = basePer * numberOfStudents;
      }
    }

    return { newAdjustedPrice, newOriginalPrice };
  };

  // Helper function to get price breakdown for display
  const getPriceBreakdown = () => {
    const numberOfStudents = students.length || 1;
    const discountEnabled = !!selected.studentDiscountEnabled;
    const discountPercent = Number(selected.studentDiscountPercent) || 0;
    const basePrice = Number(selected.actualPrice) || 0;
    const isOneOff = selected.lessonDates?.toLowerCase() === "one-off";
    const isPerSession = selected.lessonDates?.toLowerCase() === "per session" || 
                         selected.lessonDates?.toLowerCase() === "per session special";
    
    // Owner/Staff discount configuration (owner takes precedence)
    const hasOwnerDiscount = isOwnerBooking && ownerDiscountConfig?.enabled;
    const hasStaffDiscount = !hasOwnerDiscount && isStaffBooking && staffDiscountConfig?.enabled;
    const staffDiscountPercent = hasOwnerDiscount
      ? (useTermBilling && paymentPlan === 'term'
          ? ownerDiscountConfig.termPercent
          : ownerDiscountConfig.monthlyPercent)
      : hasStaffDiscount
        ? (useTermBilling && paymentPlan === 'term'
            ? staffDiscountConfig.termPercent
            : staffDiscountConfig.monthlyPercent)
        : 0;
    const hasSpecialDiscount = hasOwnerDiscount || hasStaffDiscount;
    
    // Handle term billing subscription pricing
    if (useTermBilling && termBillingConfig) {
      const enrollDate = slots[0]?.date ? new Date(slots[0].date) : new Date();
      const currentMonth = new Date(enrollDate.getFullYear(), enrollDate.getMonth(), 1);
      const monthDates = termBillingConfig.class_dates.filter(dateStr => {
        const date = new Date(dateStr);
        return date >= enrollDate && 
               date.getMonth() === currentMonth.getMonth() && 
               date.getFullYear() === currentMonth.getFullYear();
      });
      // Ensure rate_per_lesson is a number
      const perLessonRate = Number(termBillingConfig.rate_per_lesson) || 0;
      const initialMonthlyCharge = monthDates.length * perLessonRate;
      
      if (paymentPlan === 'monthly') {
        // For monthly payments, apply staff discount if applicable
        let priceAfterStaffDiscount = perLessonRate;
        if (hasSpecialDiscount && staffDiscountPercent > 0) {
          priceAfterStaffDiscount = perLessonRate * (1 - staffDiscountPercent / 100);
        }

        const totalLessons = termBillingConfig.total_lessons || termBillingConfig.class_dates?.length || 0;
        const fullTermTotal = priceAfterStaffDiscount * totalLessons;
        const initialCharge = monthDates.length * priceAfterStaffDiscount;

        return {
          numberOfStudents,
          basePricePerStudent: perLessonRate,
          discountedPricePerStudent: priceAfterStaffDiscount,
          totalPrice: fullTermTotal,
          payingNow: initialCharge,
          payingLater: priceAfterStaffDiscount,
          payingNowLessons: monthDates.length,
          hasDiscount: hasSpecialDiscount,
          discountPercent: staffDiscountPercent,
          totalSavings: hasSpecialDiscount ? (perLessonRate - priceAfterStaffDiscount) * totalLessons : 0,
          isPerSession: false,
          isOneOff: false,
          sessionsCount: 0,
          isTermBilling: true,
          isMonthlySubscription: true,
          termTotalLessons: termBillingConfig.total_lessons || 0,
          hasStaffDiscount: hasStaffDiscount,
          hasOwnerDiscount: hasOwnerDiscount,
          staffDiscountPercent: staffDiscountPercent
        };
      } else {
        // Term payment - show prorated or full term (with discount applied)
        const discountedTermTotal = Number(termBillingConfig.discounted_term_total || termBillingConfig.term_total || 0);
        const proratedAmount = Number(prorationInfo?.discountedAmount || prorationInfo?.amount || discountedTermTotal);
        const termDiscountPercent = Number(termBillingConfig.term_discount_percent || 0);
        const hasTermDiscount = termDiscountPercent > 0;
        
        // Step 1: Apply term discount if applicable
        let priceAfterTermDiscount = hasTermDiscount
          ? parseFloat((perLessonRate * (1 - termDiscountPercent / 100)).toFixed(2))
          : perLessonRate;
        
        // Step 2: Apply owner/staff discount (if in special booking mode)
        let priceAfterStaffDiscount = priceAfterTermDiscount;
        if (hasSpecialDiscount && staffDiscountPercent > 0) {
          priceAfterStaffDiscount = parseFloat((priceAfterTermDiscount * (1 - staffDiscountPercent / 100)).toFixed(2));
        }

        // Step 3: Apply sibling discount (only applies if 2+ students)
        const siblingDiscountPercent = numberOfStudents >= 2 && discountEnabled && discountPercent > 0
          ? Number(discountPercent) || 0
          : 0;
        const hasSiblingDiscount = siblingDiscountPercent > 0;

        // Calculate final per-student rate (after all discounts)
        let finalPerStudentRate = priceAfterStaffDiscount;
        if (hasSiblingDiscount) {
          finalPerStudentRate = parseFloat((priceAfterStaffDiscount * (1 - siblingDiscountPercent / 100)).toFixed(2));
        }

        // Calculate savings per lesson
        const savingsPerLesson = perLessonRate - finalPerStudentRate;
        const totalLessons = termBillingConfig.total_lessons || termBillingConfig.class_dates?.length || 0;
        const totalSavings = savingsPerLesson * totalLessons;

        return {
          numberOfStudents,
          basePricePerStudent: perLessonRate,
          discountedPricePerStudent: finalPerStudentRate,
          totalPrice: proratedAmount,
          hasDiscount: hasTermDiscount || hasSpecialDiscount || hasSiblingDiscount,
          discountPercent: hasSiblingDiscount ? siblingDiscountPercent : (hasSpecialDiscount ? staffDiscountPercent : termDiscountPercent),
          totalSavings: totalSavings,
          savingsPerLesson: savingsPerLesson,
          isPerSession: false,
          isOneOff: false,
          sessionsCount: 0,
          isTermBilling: true,
          isMonthlySubscription: false,
          termTotalLessons: totalLessons,
          hasTermDiscount: hasTermDiscount,
          termDiscountPercent: termDiscountPercent,
          hasStaffDiscount: hasStaffDiscount,
          hasOwnerDiscount: hasOwnerDiscount,
          staffDiscountPercent: staffDiscountPercent,
          hasSiblingDiscount: hasSiblingDiscount,
          siblingDiscountPercent: siblingDiscountPercent
        };
      }
    }
    
    if (isOneOff) {
      const totalPrice = Number(basePrice * 10) || 0;
      return {
        numberOfStudents: 1,
        basePricePerStudent: totalPrice,
        discountedPricePerStudent: totalPrice,
        totalPrice,
        hasDiscount: false,
        discountPercent: 0,
        totalSavings: 0,
        isPerSession: false,
        isOneOff: true,
        sessionsCount: 0,
        hasStaffDiscount: false,
        hasOwnerDiscount: false,
        staffDiscountPercent: 0,
        hasSiblingDiscount: false,
        siblingDiscountPercent: 0
      };
    }
    
    if (isPerSession) {
      const sessionsCount = selectedSessions.length || 0;
      const basePerSession = Number(basePrice) || 0;

      // Step 1: Apply owner/staff discount first (owner takes precedence)
      let priceAfterSpecialDiscount = basePerSession;
      if (hasSpecialDiscount && staffDiscountPercent > 0) {
        priceAfterSpecialDiscount = Number(basePerSession * (1 - staffDiscountPercent / 100));
      }

      // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
      const siblingDiscountPercent = discountEnabled && discountPercent > 0 ? discountPercent : 0;
      const perStudentPerSession = numberOfStudents >= 2 && siblingDiscountPercent > 0
        ? Number(priceAfterSpecialDiscount * (1 - siblingDiscountPercent / 100))
        : priceAfterSpecialDiscount;

      // For display purposes, if no sessions selected, show total for 1 session
      // Otherwise show total for selected sessions
      const displaySessionsCount = sessionsCount > 0 ? sessionsCount : 1;
      const totalPrice = Number(perStudentPerSession * numberOfStudents * displaySessionsCount) || 0;
      const totalWithoutDiscount = Number(basePerSession * numberOfStudents * displaySessionsCount) || 0;

      // Calculate individual discount totals for display
      const specialDiscountPerStudentPerSession = hasSpecialDiscount && staffDiscountPercent > 0
        ? Number(basePerSession * (staffDiscountPercent / 100))
        : 0;
      const specialDiscountTotal = Number(specialDiscountPerStudentPerSession * numberOfStudents * displaySessionsCount) || 0;

      const siblingDiscountPerStudentPerSession = numberOfStudents >= 2 && siblingDiscountPercent > 0
        ? Number(priceAfterSpecialDiscount * (siblingDiscountPercent / 100))
        : 0;
      const siblingDiscountTotal = Number(siblingDiscountPerStudentPerSession * numberOfStudents * displaySessionsCount) || 0;

      return {
        numberOfStudents,
        basePricePerStudent: basePerSession,
        discountedPricePerStudent: perStudentPerSession,
        totalPrice,
        hasDiscount: hasSpecialDiscount || (numberOfStudents >= 2 && siblingDiscountPercent > 0),
        discountPercent: numberOfStudents >= 2 && siblingDiscountPercent > 0 ? Number(siblingDiscountPercent) : staffDiscountPercent,
        totalSavings: Number(totalWithoutDiscount - totalPrice) || 0,
        isPerSession: true,
        isOneOff: false,
        sessionsCount,
        hasStaffDiscount: hasStaffDiscount,
        hasOwnerDiscount: hasOwnerDiscount,
        staffDiscountPercent: staffDiscountPercent,
        staffDiscountTotal: specialDiscountTotal,
        hasSiblingDiscount: numberOfStudents >= 2 && siblingDiscountPercent > 0,
        siblingDiscountPercent: numberOfStudents >= 2 ? Number(siblingDiscountPercent) : 0,
        siblingDiscountTotal: siblingDiscountTotal
      };
    }
    
    // Regular pricing
    const perStudentPrice = Number(basePrice) || 0;

    // Step 1: Apply owner/staff discount first (owner takes precedence)
    let priceAfterSpecialDiscount = perStudentPrice;
    if (hasSpecialDiscount && staffDiscountPercent > 0) {
      priceAfterSpecialDiscount = Number(basePrice * (1 - staffDiscountPercent / 100));
    }

    // Step 2: Apply sibling discount if 2+ students (only when enabled in service config)
    const siblingDiscountPercent = discountEnabled && discountPercent > 0 ? discountPercent : 0;
    const discountedPerStudent = numberOfStudents >= 2 && siblingDiscountPercent > 0
      ? Number(priceAfterSpecialDiscount * (1 - siblingDiscountPercent / 100))
      : priceAfterSpecialDiscount;

    const totalPrice = Number(discountedPerStudent * numberOfStudents) || 0;
    const totalWithoutDiscount = Number(basePrice * numberOfStudents) || 0;

    // Calculate individual discount totals for display
    const specialDiscountPerStudent = hasSpecialDiscount && staffDiscountPercent > 0
      ? Number(perStudentPrice * (staffDiscountPercent / 100))
      : 0;
    const specialDiscountTotal = Number(specialDiscountPerStudent * numberOfStudents) || 0;

    const siblingDiscountPerStudent = numberOfStudents >= 2 && siblingDiscountPercent > 0
      ? Number(priceAfterSpecialDiscount * (siblingDiscountPercent / 100))
      : 0;
    const siblingDiscountTotal = Number(siblingDiscountPerStudent * numberOfStudents) || 0;

    return {
      numberOfStudents,
      basePricePerStudent: perStudentPrice,
      discountedPricePerStudent: discountedPerStudent,
      totalPrice,
      hasDiscount: hasSpecialDiscount || (numberOfStudents >= 2 && siblingDiscountPercent > 0),
      discountPercent: numberOfStudents >= 2 && siblingDiscountPercent > 0 ? Number(siblingDiscountPercent) : staffDiscountPercent,
      totalSavings: Number(totalWithoutDiscount - totalPrice) || 0,
      isPerSession: false,
      isOneOff: false,
      sessionsCount: 0,
      hasStaffDiscount: hasStaffDiscount,
      hasOwnerDiscount: hasOwnerDiscount,
      staffDiscountPercent: staffDiscountPercent,
      staffDiscountTotal: specialDiscountTotal,
      hasSiblingDiscount: numberOfStudents >= 2 && siblingDiscountPercent > 0,
      siblingDiscountPercent: numberOfStudents >= 2 ? Number(siblingDiscountPercent) : 0,
      siblingDiscountTotal: siblingDiscountTotal
    };
  };

  const addStudent = () => {
    setStudents((prev) => {
      if (prev.length >= 3) return prev;
      const newStudents = [...prev, { ...studentTemplate }];
      const count = newStudents.length;
      const { newAdjustedPrice, newOriginalPrice } = calculateAdjustedPrice(count);
      setAdjustedPrice(newAdjustedPrice);
      setOriginalPrice(newOriginalPrice);
      return newStudents;
    });
    setStudentErrors((prev) => [...prev, {}]);
  };

  const removeStudent = (idx) => {
    setStudents((prev) => {
      const newStudents = prev.filter((_, i) => i !== idx);
      const count = newStudents.length;
      const { newAdjustedPrice, newOriginalPrice } = calculateAdjustedPrice(count);
      setAdjustedPrice(newAdjustedPrice);
      setOriginalPrice(newOriginalPrice);
      return newStudents;
    });
    setStudentErrors((prev) => prev.filter((_, i) => i !== idx));
  };

  if (serviceUnavailable) {
    return (
      <div
        className="relative flex items-center justify-center min-h-screen p-4 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
        }}
      >
        <div className="relative z-10 w-full max-w-lg bg-white shadow-lg rounded-lg p-10 text-center">
          <img
            src="/logo512.png"
            alt="Acme Operations"
            className="w-28 mx-auto mb-6"
          />
          <h2 className="text-2xl font-bold text-neutral-800 mb-3">
            Lesson No Longer Available
          </h2>
          <p className="text-neutral-600 mb-6 leading-relaxed">
            This lesson is no longer available. Please contact{" "}
            <a
              href="mailto:support@acmeops.com"
              className="text-[#6A469D] font-medium hover:underline"
            >
              support@acmeops.com
            </a>{" "}
            for details or to book another lesson.
          </p>
          <a
            href="https://www.acmeops.com"
            className="inline-block bg-[#6A469D] text-white font-semibold px-6 py-3 rounded-lg hover:bg-[#553880] transition-colors"
          >
            Visit Acme Operations
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center justify-center min-h-screen p-4 overflow-visible bg-cover bg-center"
      style={{
        backgroundImage: `url('https://cdn.prod.website-files.com/64d4e8b883dfdc36c02531c1/673cb1a1775d0cc1d68e4599_C%403Webbackground.jpg')`,
      }}
    >
      <div className="relative z-10 w-full max-w-5xl bg-white shadow-lg rounded-lg overflow-visible md:flex">
        {/* Staff/Owner Booking Indicator Banner */}
        {((isStaffBooking && staffDiscountConfig?.enabled) || (isOwnerBooking && ownerDiscountConfig?.enabled)) && (
          <div className={`absolute -top-4 left-1/2 transform -translate-x-1/2 z-20 ${isOwnerBooking ? 'bg-gradient-to-r from-purple-500 to-indigo-600' : 'bg-gradient-to-r from-green-500 to-emerald-600'} text-white px-6 py-2 rounded-full shadow-lg`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{isOwnerBooking ? '🏫 Owner Booking' : '🎓 Staff Booking'}</span>
              <span className="text-sm">• {isOwnerBooking ? (ownerDiscountConfig?.monthlyPercent || 50) : (staffDiscountConfig?.monthlyPercent || 20)}% Discount Applied</span>
            </div>
          </div>
        )}
        {/* Preferred Tutor Banner — from public profile page */}
        {preferredTutorName && !((isStaffBooking && staffDiscountConfig?.enabled) || (isOwnerBooking && ownerDiscountConfig?.enabled)) && (
          <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20 bg-gradient-to-r from-brand-navy to-brand-purple text-white px-6 py-2 rounded-full shadow-lg">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Booking with {preferredTutorName}</span>
            </div>
          </div>
        )}
        <div className="md:w-2/5 bg-neutral-100 p-6 flex flex-col">
          <img
            src="/logo512.png"
            alt="Logo"
            className="block md:hidden w-32 mx-auto mb-6"
          />

          {selected.image && (
            <div className="w-full h-0 pb-[100%] relative mb-4">
              <img
                src={selected.image}
                alt={selected.name}
                className="absolute inset-0 w-full h-full object-contain rounded-lg"
              />
            </div>
          )}
          <h2 className="text-2xl font-bold mb-4">{selected.name}</h2>
          {selected.description && (
            <div
              className="text-neutral-700 mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:ml-2 [&_p]:mb-3 [&_p]:leading-relaxed [&_strong]:font-semibold [&_p:empty]:hidden [&_p:last-child]:mb-0"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(convertTextToHtml(selected.description)) }}
            />
          )}

          {!hideAllPricing && (() => {
            const breakdown = getPriceBreakdown();
            return (
              <div className="bg-white p-4 rounded-lg border border-neutral-200">
                <h2 className="text-2xl font-bold mb-3">Total</h2>

                {/* Original Price Strikethrough + Actual Price */}
                {!hideOriginalPrice &&
                  selected.originalPrice &&
                  Number(selected.originalPrice) > Number(selected.actualPrice) && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-neutral-700">Original Price:</span>
                      <span className="text-lg font-bold text-neutral-800 line-through decoration-red-500 decoration-2">
                        ${Number(selected.originalPrice).toFixed(0)}
                      </span>
                    </div>
                  )}

                {/* Price Breakdown */}
                <div className="space-y-2 text-sm text-neutral-700 mb-3">
                  {breakdown.isPerSession ? (
                    <>
                      <div className="flex justify-between">
                        <span>Students:</span>
                        <span className="font-medium">{breakdown.numberOfStudents}</span>
                      </div>
                      {breakdown.sessionsCount > 0 && (
                        <div className="flex justify-between">
                          <span>Classes this session:</span>
                          <span className="font-medium">{breakdown.sessionsCount}</span>
                        </div>
                      )}
                      {!(Number(selected.originalPrice) > Number(selected.actualPrice) && !hideOriginalPrice) && (
                        <div className="flex justify-between">
                          <span>Regular price:</span>
                          <span className="font-medium">${(Number(breakdown.basePricePerStudent) || 0).toFixed(2)} per class, per student</span>
                        </div>
                      )}

                      {(breakdown.hasStaffDiscount || breakdown.hasSiblingDiscount) && (
                        <>
                          <div className="mt-2 pt-2 border-t border-neutral-200">
                            <div className="text-xs font-semibold text-neutral-600 mb-1">
                              Your discounts (applied to this class{breakdown.sessionsCount > 1 ? 'es' : ''}):
                            </div>
                            {(breakdown.hasStaffDiscount || breakdown.hasOwnerDiscount) && (
                              <div className="flex justify-between text-green-600">
                                <span>{breakdown.hasOwnerDiscount ? 'Owner' : 'Staff'} discount ({breakdown.staffDiscountPercent}%):</span>
                                <span className="font-semibold">
                                  –${(Number(breakdown.staffDiscountTotal) || 0).toFixed(2)}
                                </span>
                              </div>
                            )}
                            {breakdown.hasSiblingDiscount && breakdown.numberOfStudents >= 2 && (
                              <div className="flex justify-between text-green-600">
                                <span>Sibling discount ({breakdown.siblingDiscountPercent}% off each child):</span>
                                <span className="font-semibold">
                                  –${(Number(breakdown.siblingDiscountTotal) || 0).toFixed(2)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-green-600 font-semibold mt-1 pt-1 border-t border-green-200">
                              <span>Total savings:</span>
                              <span>–${(Number(breakdown.totalSavings) || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex justify-between font-medium">
                            <span>Discounted price:</span>
                            <span className="text-green-600">${(Number(breakdown.discountedPricePerStudent) || 0).toFixed(2)} per class, per student</span>
                          </div>
                        </>
                      )}
                    </>
                  ) : breakdown.isOneOff ? (
                    <>
                      <div className="flex justify-between">
                        <span>One-time payment:</span>
                        <span className="font-medium">${(Number(breakdown.totalPrice) || 0).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span>Students:</span>
                        <span className="font-medium">{breakdown.numberOfStudents}</span>
                      </div>
                      {/* Hide "Regular price" when promo strikethrough is already shown above */}
                      {!(Number(selected.originalPrice) > Number(selected.actualPrice) && !hideOriginalPrice) && (
                        <div className="flex justify-between">
                          <span>Regular price:</span>
                          <span className="font-medium">${(Number(breakdown.basePricePerStudent) || 0).toFixed(2)} per class, per student</span>
                        </div>
                      )}
                      
                      {(breakdown.hasStaffDiscount || breakdown.hasSiblingDiscount) && (
                        <>
                          <div className="mt-2 pt-2 border-t border-neutral-200">
                            <div className="text-xs font-semibold text-neutral-600 mb-1">
                              Your discounts (applied to {breakdown.isMonthlySubscription ? 'this month' : 'this class'}):
                            </div>
                            {(breakdown.hasStaffDiscount || breakdown.hasOwnerDiscount) && (
                              <div className="flex justify-between text-green-600">
                                <span>{breakdown.hasOwnerDiscount ? 'Owner' : 'Staff'} discount ({breakdown.staffDiscountPercent}%):</span>
                                <span className="font-semibold">
                                  –${(Number(breakdown.staffDiscountTotal) || 0).toFixed(2)}
                                </span>
                              </div>
                            )}
                            {breakdown.hasSiblingDiscount && breakdown.numberOfStudents >= 2 && (
                              <div className="flex justify-between text-green-600">
                                <span>Sibling discount ({breakdown.siblingDiscountPercent}% off each child):</span>
                                <span className="font-semibold">
                                  –${(Number(breakdown.siblingDiscountTotal) || 0).toFixed(2)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-green-600 font-semibold mt-1 pt-1 border-t border-green-200">
                              <span>Total savings:</span>
                              <span>–${(Number(breakdown.totalSavings) || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="flex justify-between font-medium">
                            <span>Discounted price:</span>
                            <span className="text-green-600">${(Number(breakdown.discountedPricePerStudent) || 0).toFixed(2)} per class, per student</span>
                          </div>
                        </>
                      )}
                    </>
                  )}
                  
                  {/* Show term discount savings */}
                  {breakdown.hasTermDiscount && breakdown.savingsPerLesson > 0 && (
                    <div className="pt-2 mt-2 border-t border-neutral-200">
                      <div className="flex justify-between text-green-600 font-semibold">
                        <span>Total Savings:</span>
                        <span>${breakdown.totalSavings.toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        Save ${breakdown.savingsPerLesson.toFixed(2)} per lesson ({breakdown.termDiscountPercent}% term discount)
                      </div>
                    </div>
                  )}
                </div>

                {/* Final Total */}
                <div className="pt-3 mt-3 border-t-2 border-neutral-300">
                  {breakdown.isMonthlySubscription && breakdown.payingNow !== undefined ? (
                    <>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-lg font-semibold">Paying Now:</span>
                        <span className="text-2xl font-bold text-blue-600">
                          ${(Number(breakdown.payingNow) || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="text-sm text-neutral-600 mb-2">
                        ({breakdown.payingNowLessons} lessons this month)
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-neutral-200">
                        <span className="text-sm text-neutral-600">Then:</span>
                        <span className="text-sm font-medium text-neutral-700">
                          ${(Number(breakdown.payingLater) || 0).toFixed(2)} per class, billed monthly
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-neutral-200 mt-2">
                        <span className="text-sm text-neutral-500">Total Term ({breakdown.termTotalLessons} classes):</span>
                        <span className="text-sm font-medium text-neutral-600">
                          ${(Number(breakdown.totalPrice) || 0).toFixed(2)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-lg font-semibold">Amount due today:</span>
                        <span className="text-2xl font-bold text-blue-600">
                          ${(Number(breakdown.totalPrice) || 0).toFixed(2)}
                        </span>
                      </div>
                      {(breakdown.hasStaffDiscount || breakdown.hasSiblingDiscount) && (
                        <div className="text-xs text-green-600 mt-2 font-medium">
                          💚 Staff and sibling discounts are applied automatically.
                        </div>
                      )}
                      {breakdown.hasDiscount && breakdown.totalSavings > 0 && !breakdown.hasStaffDiscount && !breakdown.hasSiblingDiscount && (
                        <div className="text-xs text-neutral-500 mt-1">
                          You save ${(Number(breakdown.totalSavings) || 0).toFixed(2)} by adding {breakdown.numberOfStudents} student{breakdown.numberOfStudents > 1 ? 's' : ''}!
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })()}

          {}
        </div>

        <div className="md:w-3/5 p-6">
          <img
            src="/logo512.png"
            alt="Logo"
            className="hidden md:block w-32 mx-auto mb-6"
          />

          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">
                  Step {displayStepNumber} of {totalSteps}
                </p>
                <h3 className="text-2xl font-bold text-neutral-900">
                  {normalizedStepName || "Booking Progress"}
                </h3>
                {currentStepSubtitle && (
                  <p className="mt-1 text-sm text-neutral-600 max-w-lg">
                    {currentStepSubtitle}
                  </p>
                )}
              </div>
              <p className="text-sm text-neutral-500 sm:text-right">
                {Math.round(progressPercent)}% complete
              </p>
            </div>
            <div className="mt-3 h-2 w-full bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-500 ease-out"
                style={{ width: `${Math.max(0, Math.min(progressPercent, 100))}%` }}
              />
            </div>
            <div className="mt-2 hidden sm:flex justify-between text-xs font-medium text-neutral-500">
              {visibleSteps.map((label, idx) => (
                <span
                  key={`progress-label-${idx}`}
                  className={idx === currentStepIndex ? "text-blue-600" : undefined}
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <form className="space-y-6" key={step} autoComplete="on">
            {step === 0 && (
              <>
                {showResumePrompt && pendingDraft && (
                  <div className="p-4 mb-6 border border-blue-200 bg-blue-50 rounded-lg flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-blue-800">
                        Resume your booking?
                      </p>
                      <p className="text-sm text-blue-700">
                        We saved your details {resumeRelative || "recently"} so you can pick up right where you left off.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={handleResumeDraft}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
                      >
                        Resume booking
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissDraft}
                        className="px-4 py-2 text-sm font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
                      >
                        Start fresh
                      </button>
                    </div>
                  </div>
                )}

                {errors.bookingType && (
                  <p className="text-sm text-red-600 mt-1">
                    {errors.bookingType}
                  </p>
                )}

                {selected.lessonType === "Club" &&
                bookingType &&
                !isLoadingClubSessions &&
                clubSessions.length === 0 &&
                !isStaffBooking ? ( // Allow staff bookings even without sessions for testing
                  <div className="p-4 mb-6 bg-yellow-100 text-yellow-800 border border-yellow-300 rounded">
                    <p className="font-medium">
                      This class is currently unavailable for booking.
                    </p>
                    <p className="text-sm">
                      There are no planned sessions available at this time.
                    </p>

                    {}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="mb-6">
                      {}
                      <label htmlFor="bookingTypeSelect" className="sr-only">
                        Booking Type
                      </label>
                      <select
                        id="bookingTypeSelect"
                        name="bookingType"
                        value={bookingType || ""}
                        onChange={(e) => {
                          const selectedTypeName = e.target.value;
                          setBookingType(selectedTypeName);
                          const selected = bookingTypes.find(
                            (bt) => bt.name === selectedTypeName
                          );
                          setPrice(selected?.actualPrice || 0);

                          console.log(
                            "📌 Selected booking type:",
                            selectedTypeName,
                            "| Price:",
                            selected?.actualPrice,
                            "| Colour:",
                            selected?.colour
                          );
                        }}
                        className="mt-1 block w-full border-neutral-300 rounded-md hidden"
                      >
                        {bookingTypes.map((bt, idx) => {
                          const optionLabel = bt.name || `Booking Type ${idx + 1}`;
                          const optionKey =
                            bt.name?.trim() || bt.id || `booking-type-${idx}`;
                          return (
                            <option key={optionKey} value={bt.name}>
                              {optionLabel}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label
                          className="block text-sm font-medium text-neutral-700"
                          htmlFor="parentFirstName"
                        >
                          First Name
                        </label>

                        <input
                          type="text"
                          value={parentFirstName}
                          id="parentFirstName"
                          name="parentFirstName"
                          onChange={(e) => {
                            const v = e.target.value;
                            setParentFirstName(v);
                            setErrors((prev) => ({
                              ...prev,
                              parentFirstName: v.trim() ? "" : "Required",
                            }));
                          }}
                          onBlur={() => {
                            if (!parentFirstName.trim()) {
                              setErrors((prev) => ({
                                ...prev,
                                parentFirstName: "Required",
                              }));
                            }
                          }}
                          className={`mt-1 block w-full border-0 border-b-2 focus:ring-0 focus:border-blue-600 ${
                            errors.parentFirstName
                              ? "border-red-500"
                              : "border-neutral-300"
                          }`}
                          placeholder="First name"
                          autoComplete="given-name"
                        />
                        {errors.parentFirstName && (
                          <p className="text-sm text-red-600 mt-1">
                            {errors.parentFirstName}
                          </p>
                        )}
                      </div>

                      <div>
                        <label
                          className="block text-sm font-medium text-neutral-700"
                          htmlFor="parentLastName"
                        >
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={parentLastName}
                          id="parentLastName"
                          name="parentLastName"
                          onChange={(e) => {
                            const v = e.target.value;
                            setParentLastName(v);
                            setErrors((prev) => ({
                              ...prev,
                              parentLastName: v.trim() ? "" : "Required",
                            }));
                          }}
                          onBlur={() => {
                            if (!parentLastName.trim()) {
                              setErrors((prev) => ({
                                ...prev,
                                parentLastName: "Required",
                              }));
                            }
                          }}
                          className={`mt-1 block w-full border-0 border-b-2 focus:ring-0 focus:border-blue-600 ${
                            errors.parentLastName
                              ? "border-red-500"
                              : "border-neutral-300"
                          }`}
                          placeholder="Last name"
                          autoComplete="family-name"
                        />
                        {errors.parentLastName && (
                          <p className="text-sm text-red-600 mt-1">
                            {errors.parentLastName}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label
                        className="block text-sm font-medium text-neutral-700"
                        htmlFor="parentEmail"
                      >
                        Email
                      </label>
                      <input
                        type="email"
                        value={parentEmail}
                        id="parentEmail"
                        name="parentEmail"
                        onChange={(e) => {
                          const v = e.target.value;
                          setParentEmail(v);
                          setErrors((prev) => ({
                            ...prev,
                            parentEmail: v.trim() ? "" : "Required",
                          }));
                        }}
                        onBlur={() => {
                          if (!parentEmail.trim()) {
                            setErrors((prev) => ({
                              ...prev,
                              parentEmail: "Required",
                            }));
                          } else if (!isValidEmail(parentEmail)) {
                            setErrors((prev) => ({
                              ...prev,
                              parentEmail: "Please enter a valid email address.",
                            }));
                          }
                        }}
                        className={`mt-1 block w-full border-0 border-b-2 focus:ring-0 focus:border-blue-600 ${
                          errors.parentEmail
                            ? "border-red-500"
                            : "border-neutral-300"
                        }`}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                      {errors.parentEmail && (
                        <p className="text-sm text-red-600 mt-1">
                          {errors.parentEmail}
                        </p>
                      )}
                    </div>

                    <div className="mb-4">
                      <label
                        className="block text-sm font-medium text-neutral-700 mb-1"
                        htmlFor="parentPhone"
                      >
                        Phone
                      </label>

                      <PhoneInput
                        international={false}
                        defaultCountry={country || "US"}
                        countryCallingCodeEditable={false}
                        value={parentPhone}
                        id="parentPhone"
                        name="parentPhone"
                        onChange={handlePhoneChange}
                        onBlur={handlePhoneBlur}
                        className=""
                        placeholder="Enter your phone number"
                        autoComplete="tel"
                      />

                      {errors.parentPhone && (
                        <p className="text-sm text-red-600 mt-1">
                          {errors.parentPhone}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {step === 1 && (
              <div className="space-y-6">
                {students.map((stu, idx) => (
                  <div
                    key={idx}
                    className="relative p-4 border rounded-md space-y-4"
                  >
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => removeStudent(idx)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                      >
                        × Remove Sibling
                      </button>
                    )}
                    <h3 className="text-lg font-semibold">Student {idx + 1}</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700">
                          First Name
                        </label>
                        <input
                          type="text"
                          value={stu.first}
                          onChange={(e) => {
                            const up = [...students];
                            up[idx].first = e.target.value;
                            setStudents(up);
                            const errs = [...studentErrors];
                            errs[idx].first = "";
                            setStudentErrors(errs);
                          }}
                          className={`mt-1 block w-full border-0 border-b-2 focus:ring-0 ${
                            studentErrors[idx]?.first
                              ? "border-red-500"
                              : "border-neutral-300 focus:border-blue-600"
                          }`}
                        />
                        {studentErrors[idx]?.first && (
                          <p className="text-sm text-red-600 mt-1">
                            {studentErrors[idx].first}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-neutral-700">
                          Last Name
                        </label>
                        <input
                          type="text"
                          value={stu.last}
                          onChange={(e) => {
                            const up = [...students];
                            up[idx].last = e.target.value;
                            setStudents(up);
                            const errs = [...studentErrors];
                            errs[idx].last = "";
                            setStudentErrors(errs);
                          }}
                          className={`mt-1 block w-full border-0 border-b-2 focus:ring-0 ${
                            studentErrors[idx]?.last
                              ? "border-red-500"
                              : "border-neutral-300 focus:border-blue-600"
                          }`}
                        />
                        {studentErrors[idx]?.last && (
                          <p className="text-sm text-red-600 mt-1">
                            {studentErrors[idx].last}
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700">
                        Current School
                      </label>
                      <input
                        type="text"
                        value={stu.school}
                        onChange={(e) => {
                          const up = [...students];
                          up[idx].school = e.target.value;
                          setStudents(up);
                        }}
                        className="mt-1 block w-full border-0 border-b-2 focus:ring-0 border-neutral-300 focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700">
                        Experience Level
                      </label>
                      <select
                        value={stu.experience}
                        onChange={(e) => {
                          const up = [...students];
                          up[idx].experience = e.target.value;
                          setStudents(up);
                        }}
                        className="mt-1 block w-full border-0 border-b-2 focus:ring-0 border-neutral-300 focus:border-blue-600"
                      >
                        {experienceLevels.map((l) => (
                          <option key={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700">
                        Date of Birth
                      </label>
                      <div className="relative mt-1 flex items-center">
                        <svg
                          className="absolute left-2 text-neutral-500 pointer-events-none"
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          fill="currentColor"
                          viewBox="0 0 16 16"
                        >
                          <path
                            d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 
      2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 
      2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM1 
      4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4H1z"
                          />
                        </svg>

                        <input
                          type="date"
                          value={stu.dob}
                          onChange={(e) => handleDobChange(idx, e.target.value)}
                          onClick={(e) => {
                            // Make entire input clickable to open date picker
                            e.currentTarget.focus();
                            // Try to show picker if browser supports it (modern browsers)
                            if (e.currentTarget.showPicker) {
                              try {
                                e.currentTarget.showPicker();
                              } catch (err) {
                                // showPicker() may throw if called outside user interaction
                                // Focus is enough for most browsers
                              }
                            }
                          }}
                          onInput={(e) => {
                            // Handle mobile input events for better compatibility
                            const value = e.target.value;
                            if (value && value.length >= 6) {
                              // Trigger validation on input for immediate feedback
                              handleDobChange(idx, value);
                            }
                          }}
                          className={`pl-10 block w-full border-0 border-b-2 focus:ring-0 cursor-pointer ${
                            studentErrors[idx]?.dob
                              ? "border-red-500"
                              : "border-neutral-300 focus:border-blue-600"
                          }`}
                          placeholder="YYYY-MM-DD"
                          required
                          // Mobile-friendly attributes
                          inputMode="numeric"
                          pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
                          // Cross-browser compatibility
                          min="1900-01-01"
                          max="2030-12-31"
                          // Accessibility
                          aria-label={`Date of birth for ${stu.first || 'student'}`}
                          aria-describedby={studentErrors[idx]?.dob ? `dob-error-${idx}` : undefined}
                          aria-invalid={studentErrors[idx]?.dob ? 'true' : 'false'}
                        />
                      </div>

                      {studentErrors[idx]?.dob && (
                        <p 
                          id={`dob-error-${idx}`}
                          className="text-sm text-red-600 mt-1"
                          role="alert"
                          aria-live="polite"
                        >
                          {studentErrors[idx].dob}
                        </p>
                      )}

                      {!studentErrors[idx]?.dob && studentInsights[idx] ? (
                        <p
                          className="mt-2 text-sm text-emerald-700"
                          aria-live="polite"
                        >
                          {studentInsights[idx]}
                        </p>
                      ) : (
                        stu.dob &&
                        !studentErrors[idx]?.dob && (
                          <p className="mt-1 text-neutral-600" aria-live="polite">
                            Age: {getAge(stu.dob)}
                          </p>
                        )
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-neutral-700">
                        Tell us about {stu.first || "your child"}!
                      </label>

                      <textarea
                        value={stu.notes}
                        onChange={(e) => {
                          const up = [...students];
                          up[idx].notes = e.target.value;
                          setStudents(up);
                        }}
                        rows={3}
                        className="mt-1 block w-full border-0 border-b-2 focus:ring-0 border-neutral-300 focus:border-blue-600"
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addStudent}
                  disabled={students.length >= 3}
                  className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  Add a sibling
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                {selected.lessonType === "Club" ? (
                  <>
                    {selected.lessonDates === "Per Session" ? (
                      <p className="text-sm font-medium text-neutral-700">
                        Please select one or more classes:
                      </p>
                    ) : null}

                    {selected.lessonDates === "Per Session Special" ? (
                      <p className="text-sm font-medium text-neutral-700">
                        These are your upcoming classes:
                      </p>
                    ) : null}

                    <p className="mt-2 text-sm text-neutral-700">
                      Total: $
                      {(() => {
                        const numStudents = students.length || 1;
                        const ap = Number(selected.actualPrice || 0);
                        const discountEnabled = !!selected.studentDiscountEnabled;
                        const discountPercent = Number(selected.studentDiscountPercent) || 0;
                        const isOneOff = selected.lessonDates?.toLowerCase() === 'one-off';
                        const isPerSession = selected.lessonDates?.toLowerCase() === 'per session';
                        const isPSS = selected.lessonDates?.toLowerCase() === 'per session special';
                        
                        if (isOneOff) {
                          return (ap * 10).toFixed(2);
                        }
                        
                        if (isPerSession || isPSS) {
                          const sessions = selectedSessions.length || 0;
                          const perSessionBase = ap;
                          const perSession = discountEnabled && numStudents >= 2 && discountPercent > 0
                            ? perSessionBase * (1 - discountPercent / 100)
                            : perSessionBase;
                          return (perSession * numStudents * sessions).toFixed(2);
                        }
                        
                        // Default single-session pricing
                        const perBase = ap;
                        const per = discountEnabled && numStudents >= 2 && discountPercent > 0
                          ? perBase * (1 - discountPercent / 100)
                          : perBase;
                        return (per * numStudents).toFixed(2);
                      })()}
                    </p>

                    {isLoadingClubSessions ? (
                      <p>Loading sessions...</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
                        {/* {clubSessions
  .sort((a, b) => {
    const timeA = DateTime.fromISO(a.start);
    const timeB = DateTime.fromISO(b.start);
    return timeA - timeB;
  })
  .map((s) => {
    const localTime = DateTime.fromISO(s.start); 
    const labelText = localTime.toFormat("cccc, LLLL d, yyyy 'at' h:mm a");
 */}

                        {clubSessions
                          .sort((a, b) => {
                            const ma = toUserZone(a.start, timezone).toMillis();
                            const mb = toUserZone(b.start, timezone).toMillis();
                            return ma - mb;
                          })
                          .map((s) => {
                            const dt = toUserZone(s.start, timezone);
                            const labelText = dt.toFormat(
                              "cccc, LLLL d, yyyy 'at' h:mm a"
                            );

                            return (
                              <label
                                key={s.id}
                                className="flex items-center space-x-2"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedSessions.includes(s.id)}
                                  disabled={isFixedSelection}
                                  onChange={(e) => {
                                    if (isFixedSelection) return;
                                    setSelectedSessions((prev) =>
                                      e.target.checked
                                        ? [...prev, s.id]
                                        : prev.filter((id) => id !== s.id)
                                    );
                                  }}
                                />
                                <span>{labelText}</span>
                              </label>
                            );
                          })}
                      </div>
                    )}

                    <p className="text-sm text-neutral-600 mt-2">
                      {selectedSessions.length} class
                      {selectedSessions.length !== 1 ? "es" : ""} selected
                    </p>

                    {sessionError && (
                      <p className="mt-2 text-sm text-red-600 font-medium">
                        {sessionError}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {selected.lessonType !== "Club" && (
                      <div>
                        <p className="text-lg font-medium text-neutral-900">
                          Let's make scheduling easy - when works best for you?
                        </p>
                        <p className="text-sm font-medium text-neutral-400 mt-2">
                          ex. <strong>Day of the Week:</strong> Saturdays <br />
                          <strong>Starting at:</strong> 10:00am
                          <strong>Ending By:</strong> 1:00pm
                        </p>
                      </div>
                    )}

                    <div className="p-4 border rounded-md">
                      <label className="block text-sm font-medium text-neutral-700">
                        Preferred start date
                      </label>
                      <input
                        type="date"
                        value={slots[0].date}
                        min={defaultDate}
                        onChange={(e) =>
                          handleSlotChange(0, "date", e.target.value)
                        }
                        className={`mt-1 block w-full ${
                          dateError ? "border-red-500" : "border-neutral-300"
                        }`}
                      />
                      {dateError && (
                        <p className="text-sm text-red-500 mt-1">{dateError}</p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <p className="text-lg font-medium text-neutral-900">
                        Select Your Time Slots
                      </p>

                      {renderTimeSlots()}

                      {availabilityLoading && (
                        <div className="flex items-center gap-2 text-sm text-neutral-500">
                          <span className="inline-flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          Checking tutor availability…
                        </div>
                      )}

                      {!availabilityLoading && availabilityFeedback && (
                        <div
                          className={`p-3 border rounded-md text-sm ${
                            availabilityFeedback.status === "warning"
                              ? "bg-amber-50 border-amber-200 text-amber-700"
                              : "bg-emerald-50 border-emerald-200 text-emerald-700"
                          }`}
                          role="status"
                          aria-live="polite"
                        >
                          {availabilityFeedback.message}
                        </div>
                      )}

                      {/* <button
      type="button"
      onClick={addSlot}
      disabled={slots.length >= 3}
      className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
    >
      Add Another Slot
    </button> */}

                      {/* <p className="text-sm text-red-600 mt-2">{validateFirstSlot()}</p>
    <p className="text-sm text-red-600 mt-2">{validateSlotDays()}</p> */}
                    </div>

                    {sessionError && (
                      <p className="mt-2 text-sm text-red-600 font-medium">
                        {sessionError}
                      </p>
                    )}
                    {selected.lessonType !== "Club" && (
                      <p className="text-sm font-medium text-neutral-700">
                        We’ll do our best to match you with an amazing tutor as
                        quickly as possible. Please note, it may take up to two
                        weeks to find the right fit for your family.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                {/* Payment Plan Selector - Show if term billing is available */}
                {(() => {
                  const activeServiceId = selected.serviceId || preselectServiceId;
                  console.log('[BookingForms] Step 3 - Checking for PaymentPlanSelector:', {
                    step,
                    selectedServiceId: selected.serviceId,
                    preselectServiceId,
                    activeServiceId,
                    willShow: !!activeServiceId
                  });
                  
                  if (activeServiceId) {
                    return (
                      <PaymentPlanSelector
                        serviceId={activeServiceId}
                        enrollmentDate={slots[0]?.date ? new Date(slots[0].date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                        onPlanSelected={(plan) => {
                          console.log('[BookingForms] Payment plan selected:', plan);
                          setPaymentPlan(plan);
                          setUseTermBilling(true);
                        }}
                        onProrationCalculated={(proration) => {
                          setProrationInfo(proration);
                        }}
                        onConfigLoaded={(config) => {
                          console.log('[BookingForms] Term billing config loaded:', config);
                          setTermBillingConfig(config);
                          // Ensure paymentPlan is set when config loads (defaults to 'monthly')
                          if (!paymentPlan) {
                            console.log('[BookingForms] Setting default paymentPlan to "monthly"');
                            setPaymentPlan('monthly');
                          }
                        }}
                        onPriceCalculated={(price) => {
                          console.log('[BookingForms] Term billing price calculated:', price);
                          setTermBillingPrice(price);
                          // Set adjustedPrice for form submission
                          setAdjustedPrice(price);
                        }}
                      />
                    );
                  }
                  return null;
                })()}
                
                <fieldset className="bg-white border border-neutral-200 rounded-lg  p-6">
                  <legend className="text-xl font-semibold text-neutral-800">
                    Address <span className="text-red-500">*</span>
                  </legend>

                  {allowInternationalAddresses && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <Autocomplete
                        id="country"
                        options={allCountries}
                        getOptionLabel={(option) => option.name}
                        filterOptions={(options, { inputValue }) => {
                          const search = inputValue.toLowerCase().trim();
                          if (!search) return options;
                          return options.filter(
                            (opt) =>
                              opt.name.toLowerCase().includes(search) ||
                              opt.isoCode.toLowerCase() === search ||
                              opt.aliases.some((a) => a.includes(search))
                          );
                        }}
                        value={
                          allCountries.find((countryOption) => countryOption.name === address.country) ||
                          null
                        }
                        onChange={(_event, newValue) => {
                          setAddress({
                            ...address,
                            country: newValue ? newValue.name : "",
                            state: "",
                            city: "",
                          });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            country: "",
                            state: "",
                            zip: "",
                          }));
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Country"
                            variant="standard"
                            error={!!confirmationErrors.country}
                            helperText={confirmationErrors.country}
                            inputProps={{
                              ...params.inputProps,
                              name: "country",
                              autoComplete: "country-name",
                            }}
                          />
                        )}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="street" className="block text-sm font-medium text-neutral-700">
                        Street Address
                      </label>
                      <input
                        id="street"
                        type="text"
                        value={address.street}
                        name="streetAddress"
                        autoComplete="street-address"
                        onChange={(e) => {
                          setAddress({
                            ...address,
                            street: e.target.value,
                          });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            street: "",
                          }));
                        }}
                        className={`mt-1 block w-full border-b border-neutral-500   ${
                          confirmationErrors.street
                            ? "border-red-500"
                            : "border-neutral-300"
                        }`}
                      />
                      {confirmationErrors.street && (
                        <p className="text-sm text-red-600 mt-1">{confirmationErrors.street}</p>
                      )}
                    </div>

                    {!allowInternationalAddresses && (
                      <Autocomplete
                        id="country"
                        options={allCountries}
                        getOptionLabel={(option) => option.name}
                        filterOptions={(options, { inputValue }) => {
                          const search = inputValue.toLowerCase().trim();
                          if (!search) return options;
                          return options.filter(
                            (opt) =>
                              opt.name.toLowerCase().includes(search) ||
                              opt.isoCode.toLowerCase() === search ||
                              opt.aliases.some((a) => a.includes(search))
                          );
                        }}
                        value={
                          allCountries.find((countryOption) => countryOption.name === address.country) ||
                          null
                        }
                        onChange={(_event, newValue) => {
                          setAddress({
                            ...address,
                            country: newValue ? newValue.name : "",
                            state: "",
                            city: "",
                          });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            country: "",
                          }));
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Country"
                            variant="standard"
                            error={!!confirmationErrors.country}
                            helperText={confirmationErrors.country}
                            inputProps={{
                              ...params.inputProps,
                              name: "country",
                              autoComplete: "country-name",
                            }}
                          />
                        )}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label htmlFor="city" className="block text-sm font-medium text-neutral-700">
                        City
                      </label>
                      <input
                        type="text"
                        id="city"
                        value={address.city}
                        name="city"
                        autoComplete="address-level2"
                        onChange={(e) => {
                          setAddress({
                            ...address,
                            city: e.target.value,
                          });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            city: "",
                          }));
                        }}
                        className={`mt-1 block w-full border-b border-neutral-500 ${
                          confirmationErrors.city
                            ? "border-red-500"
                            : "border-neutral-300"
                        }`}
                        placeholder="City"
                      />
                      {confirmationErrors.city && (
                        <p className="text-sm text-red-600 mt-1">{confirmationErrors.city}</p>
                      )}
                    </div>

                    {isUSAddress ? (
                      <Autocomplete
                        id="state"
                        options={State.getStatesOfCountry("US")}
                        getOptionLabel={(option) => {
                          if (typeof option === "string") {
                            const state = State.getStatesOfCountry("US").find(
                              (s) => s.isoCode === option || s.name === option
                            );
                            return state ? state.name : option;
                          }
                          return option.name;
                        }}
                        isOptionEqualToValue={(option, value) => {
                          if (typeof value === "string") {
                            return option.isoCode === value || option.name === value;
                          }
                          return option.isoCode === value?.isoCode;
                        }}
                        filterOptions={(options, { inputValue }) => {
                          const searchValue = inputValue.toLowerCase().trim();
                          return options.filter((option) => {
                            const nameMatch = option.name.toLowerCase().includes(searchValue);
                            const codeMatch = option.isoCode.toLowerCase() === searchValue;
                            return nameMatch || codeMatch;
                          });
                        }}
                        freeSolo={true}
                        selectOnFocus
                        clearOnBlur
                        handleHomeEndKeys
                        value={
                          address.state
                            ? State.getStatesOfCountry("US").find(
                                (s) => s.isoCode === address.state || s.name === address.state
                              ) || null
                            : null
                        }
                        onChange={(_e, newValue) => {
                          let stateCode = "";

                          if (typeof newValue === "string") {
                            const matchedState = State.getStatesOfCountry("US").find(
                              (s) =>
                                s.isoCode.toUpperCase() === newValue.toUpperCase().trim() ||
                                s.name.toLowerCase() === newValue.toLowerCase().trim()
                            );
                            stateCode = matchedState ? matchedState.isoCode : newValue.trim();
                          } else if (newValue) {
                            stateCode = newValue.isoCode;
                          }

                          if (stateCode) {
                            setAddress({
                              ...address,
                              state: stateCode,
                              city: "",
                            });
                            setConfirmationErrors((prev) => ({
                              ...prev,
                              state: "",
                            }));
                          }
                        }}
                        onInputChange={(_e, newValue, reason) => {
                          if (reason === "input" && newValue) {
                            const matchedState = State.getStatesOfCountry("US").find(
                              (s) =>
                                s.isoCode.toLowerCase() === newValue.toLowerCase().trim() ||
                                s.name.toLowerCase() === newValue.toLowerCase().trim()
                            );
                            if (matchedState) {
                              setAddress({
                                ...address,
                                state: matchedState.isoCode,
                                city: "",
                              });
                              setConfirmationErrors((prev) => ({
                                ...prev,
                                state: "",
                              }));
                            }
                          }
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="State"
                            variant="standard"
                            error={!!confirmationErrors.state}
                            helperText={confirmationErrors.state}
                            inputProps={{
                              ...params.inputProps,
                              name: "state",
                              autoComplete: "address-level1",
                              "data-autocomplete": "address-level1",
                            }}
                            onBlur={(e) => {
                              const inputValue = e.target.value?.trim();
                              if (inputValue && isUSAddress) {
                                const matchedState = State.getStatesOfCountry("US").find(
                                  (s) =>
                                    s.isoCode.toUpperCase() === inputValue.toUpperCase() ||
                                    s.name.toLowerCase() === inputValue.toLowerCase()
                                );
                                if (matchedState && matchedState.isoCode !== address.state) {
                                  setAddress({
                                    ...address,
                                    state: matchedState.isoCode,
                                    city: "",
                                  });
                                }
                              }
                            }}
                          />
                        )}
                      />
                    ) : (
                      <TextField
                        label="State / Region"
                        variant="standard"
                        value={address.state}
                        error={!!confirmationErrors.state}
                        helperText={confirmationErrors.state}
                        onChange={(e) => {
                          setAddress({ ...address, state: e.target.value });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            state: "",
                          }));
                        }}
                        name="state"
                        autoComplete="address-level1"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label htmlFor="zip" className="block text-sm font-medium text-neutral-700">
                        {isUSAddress ? "ZIP / Postal Code" : "Postal Code"}
                      </label>
                      <input
                        id="zip"
                        type="text"
                        value={address.zip}
                        name="postalCode"
                        onChange={(e) => {
                          setAddress({ ...address, zip: e.target.value });
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            zip: "",
                          }));
                        }}
                        className={`mt-1 block w-full border-b border-neutral-500 ${
                          confirmationErrors.zip ? "border-red-500" : "border-neutral-300"
                        }`}
                        autoComplete="postal-code"
                      />
                      {confirmationErrors.zip && (
                        <p className="text-sm text-red-600 mt-1">{confirmationErrors.zip}</p>
                      )}
                      {!isUSAddress && allowInternationalAddresses && (
                        <p className="text-xs text-neutral-500 mt-1">
                          Optional for international addresses.
                        </p>
                      )}
                    </div>
                  </div>
                  {selected.lessonType?.toLowerCase().includes("home") && (
                    <p className="block text-sm font-medium text-neutral-700 mt-4">
                      This address will be the home base for your lessons. Make
                      sure it’s correct so we know where to go!
                    </p>
                  )}
                </fieldset>

                <div>
                  <Autocomplete
                    id="timezone"
                    options={availableTimezones}
                    getOptionLabel={(option) => {
                      if (typeof option === "string") {
                        const found = availableTimezones.find((tz) => tz.value === option);
                        return found ? found.label : option.split("/").pop().replace(/_/g, " ");
                      }
                      return option.label || option.value;
                    }}
                    isOptionEqualToValue={(option, value) => {
                      const val = typeof value === "string" ? value : value?.value;
                      return option.value === val;
                    }}
                    filterOptions={(options, { inputValue }) => {
                      const search = inputValue.toLowerCase().trim();
                      if (!search) return options;
                      return options.filter(
                        (tz) =>
                          tz.label.toLowerCase().includes(search) ||
                          tz.value.toLowerCase().includes(search)
                      );
                    }}
                    value={
                      availableTimezones.find((tz) => tz.value === timezone) || null
                    }
                    onChange={(_e, newValue) => {
                      setTimezone(newValue ? newValue.value : "");
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Timezone"
                        variant="standard"
                        placeholder="Search timezone..."
                      />
                    )}
                  />
                </div>

                <div>
                  <label
                    htmlFor="heardAbout"
                    className="block text-sm font-medium text-neutral-700"
                  >
                    Where did you hear about Acme Operations?
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="heardAbout"
                    value={heardAbout}
                    onChange={(e) => {
                      setHeardAbout(e.target.value);
                      setConfirmationErrors((prev) => ({
                        ...prev,
                        heardAbout: "",
                      }));
                    }}
                    className={`mt-1 block w-full border-b-2   ${
                      confirmationErrors.heardAbout
                        ? "border-red-500"
                        : "border-neutral-300"
                    }`}
                  >
                    <option value="">— Please Select —</option>
                    <option>Google Search</option>
                    <option>Facebook</option>
                    <option>Instagram</option>
                    <option>A Friend</option>
                    <option>Event</option>
                    <option>School Demo</option>
                    <option>School Email</option>
                    <option>Perplexity</option>
                    <option>ChatGPT</option>
                    <option>Claude (Anthropic)</option>
                    <option>Microsoft Copilot</option>
                    <option>Google Gemini</option>
                    <option>Other AI Search</option>
                    <option>Other</option>
                  </select>
                  {confirmationErrors.heardAbout && (
                    <p className="text-sm text-red-600 mt-1">
                      {confirmationErrors.heardAbout}
                    </p>
                  )}
                </div>

                <div className="space-y-4 text-sm">
                  {policyGroups.map((group) => (
                    <label key={group.group} className="flex items-start">
                      <input
                        type="checkbox"
                        checked={policyAgreements[group.group] || false}
                        onChange={(e) => {
                          setPolicyAgreements((prev) => ({
                            ...prev,
                            [group.group]: e.target.checked,
                          }));
                          setConfirmationErrors((prev) => ({
                            ...prev,
                            [`agree_${group.group}`]: "",
                          }));
                        }}
                        className="form-checkbox mt-1"
                      />
                      <div className="ml-2">
                        <span className="font-medium">
                          {group.checkbox_label}
                        </span>
                        <div className="mt-1 space-x-2">
                          {group.policies.map((policy, idx) => (
                            <React.Fragment key={policy.slug}>
                              {idx > 0 && <span className="text-neutral-400">|</span>}
                              <a
                                href="#"
                                className="text-blue-600 hover:underline text-xs"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setPolicyScrollTo(policy.slug);
                                  setPolicyModalOpen(true);
                                }}
                              >
                                {policy.link_text}
                              </a>
                            </React.Fragment>
                          ))}
                        </div>
                        {confirmationErrors[`agree_${group.group}`] && (
                          <p className="text-sm text-red-600 mt-1">
                            {confirmationErrors[`agree_${group.group}`]}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Signature <span className="text-red-500">*</span>
                </label>
                <div className="border rounded h-[150px] flex-shrink-0 overflow-hidden">
                  <SignatureCanvas
                    penColor="black"
                    throttle={0} // allow high-frequency drawing for smoother multi-stroke
                    clearOnResize={false}
                    canvasProps={{ width: 400, height: 150 }}
                    canvasStyle={{
                      width: "100%",
                      height: "100%",
                      boxSizing: "border-box",
                    }}
                    ref={sigPadRef}
                    onEnd={handleEnd}
                    onBegin={() => {
                      // ensure path continuity does not clear previous strokes
                      // no-op hook to keep pad active across mousedown/mouseup cycles
                    }}
                  />
                </div>

                <div className="mt-2 space-x-2">
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="px-3 py-1 bg-neutral-200 rounded hover:bg-neutral-300"
                  >
                    Clear
                  </button>

                  {!canSubmit && (
                    <div className="bg-orange-100 text-orange-700 p-4 rounded-lg mt-4 mx-auto shadow-md text-center">
                      <div className="flex items-center justify-center">
                        <span className="font-semibold">
                          Please complete all fields before clicking next.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {adjustedPrice < 3 && !termBillingConfig && (
                  <div className="bg-green-100 text-green-700 p-4 rounded-lg mt-4 mx-auto shadow-md text-center">
                    <div className="flex items-center justify-center">
                      <span className="font-semibold">
                        Payment verifications will be refunded.
                      </span>
                    </div>
                  </div>
                )}

                {confirmationErrors.signature && (
                  <p className="text-sm text-red-600 mt-1">
                    {confirmationErrors.signature}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between pt-4">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={prev}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-neutral-200 rounded-md hover:bg-neutral-300 disabled:opacity-50"
                >
                  Previous
                </button>
              ) : (
                <div />
              )}

              <div>
                {step < steps.length - 1 ? (
                  <button
                    type="button"
                    onClick={next}
                    disabled={
                      isSubmitting ||
                      (step === 0 && !isStep0Valid()) ||
                      (step === 2 && (
                        // For Club per-session bookings: require sessions to be selected (unless staff booking)
                        (selected.lessonType === "Club" && 
                         (selected.lessonDates?.toLowerCase() === "per session" ||
                          selected.lessonDates?.toLowerCase() === "per session special") &&
                         selectedSessions.length === 0 &&
                         !isStaffBooking) || // Allow staff bookings without sessions for testing
                        // For other bookings: require date selection (unless it's a fixed selection)
                        (!isFixedSelection &&
                         !(selected.lessonType === "Club" && 
                           (selected.lessonDates?.toLowerCase() === "per session" ||
                            selected.lessonDates?.toLowerCase() === "per session special")) &&
                         (!!dateError || !slots[0].date))
                      ))
                    }
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Next
                  </button>
                ) : (
                  <div className="flex flex-col items-center space-y-3">
                    <Button
                      variant="contained"
                      color="primary"
                      disabled={isSubmitting || !canSubmit}
                      onClick={submit}
                    >
                      {isSubmitting
                        ? "Processing..."
                        : price < 3
                        ? "Verify Payment Method"
                        : "Next"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
      <PolicyModal
        open={policyModalOpen}
        onClose={() => {
          setPolicyModalOpen(false);
          setPolicyScrollTo(null);
        }}
        sections={policySections}
        jumpTo={policySections.map(({ id, label }) => ({ id, label }))}
        scrollTo={policyScrollTo}
      />
    </div>
  );
}
