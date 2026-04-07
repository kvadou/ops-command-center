import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

// ============================================================
// ClubBookingPage — Public-facing club landing page
// No auth, no OpsHub layout. Tailwind only, mobile-first.
// Fetches from /api/clubs/public/:slug
// ============================================================

const TRIAL_PRICE = 15; // Trial promo price — keep in sync with config/constants.js

const BRAND = {
  navy: "#2D2F8E",
  purple: "#6A469D",
  cyan: "#00BCD4",
  light: "#E8FBFF",
  dark: "#1a1a2e",
};

// --------------- Utility Helpers ---------------

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function scrollToPricing() {
  document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
}

function mapsUrl(address) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

// --------------- Sub-components ---------------

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero skeleton */}
      <div className="animate-pulse" style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.purple})` }}>
        <div className="max-w-4xl mx-auto px-6 py-24 text-center">
          <div className="h-10 w-72 mx-auto rounded-lg bg-white/20 mb-4" />
          <div className="h-6 w-56 mx-auto rounded bg-white/15 mb-8" />
          <div className="h-12 w-44 mx-auto rounded-full bg-white/20" />
        </div>
      </div>

      {/* Body skeleton */}
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-16">
        {/* About */}
        <div className="animate-pulse space-y-3">
          <div className="h-7 w-32 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-100" />
          <div className="h-4 w-5/6 rounded bg-gray-100" />
          <div className="h-4 w-4/6 rounded bg-gray-100" />
        </div>

        {/* Schedule cards */}
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="flex gap-4 flex-wrap">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 w-48 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>

        {/* Pricing cards */}
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-36 rounded bg-gray-200" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-72 rounded-2xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: BRAND.light }}>
      <div className="text-center max-w-md">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.purple})` }}
        >
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold mb-3" style={{ color: BRAND.dark }}>
          Club Not Found
        </h1>
        <p className="text-gray-500 mb-8 text-lg leading-relaxed">
          We could not find the club you are looking for. It may have moved or
          the link might be incorrect.
        </p>
        <a
          href="https://www.acmeops.com"
          className="inline-block px-8 py-3.5 rounded-full text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5"
          style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.purple})` }}
        >
          Visit Acme Operations
        </a>
      </div>
    </div>
  );
}

function HeroSection({ club }) {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.purple} 60%, ${BRAND.cyan} 100%)` }}
    >
      {/* Decorative shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10 bg-white" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-10 bg-white" />
        <div className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-5 bg-white" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-20 md:py-28 text-center">
        {club.heroImageUrl && (
          <img
            src={club.heroImageUrl}
            alt={club.name}
            className="w-32 h-32 md:w-40 md:h-40 object-cover rounded-2xl mx-auto mb-8 shadow-2xl border-4 border-white/20"
          />
        )}
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-4 tracking-tight leading-tight">
          {club.name}
        </h1>
        <p className="text-lg md:text-xl text-white/80 mb-10 font-medium">
          Learn Chess Through Storytelling
        </p>
        <button
          onClick={scrollToPricing}
          className="inline-block px-10 py-4 rounded-full text-lg font-bold shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:scale-105 cursor-pointer"
          style={{ background: BRAND.cyan, color: BRAND.dark }}
        >
          Book a Class
        </button>
      </div>
    </section>
  );
}

function AboutSection({ description }) {
  if (!description) return null;
  return (
    <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
      <h2 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: BRAND.dark }}>
        About Our Club
      </h2>
      <p className="text-gray-600 text-lg leading-relaxed">{description}</p>
    </section>
  );
}

function ScheduleSection({ schedule }) {
  if (!schedule || schedule.length === 0) return null;
  return (
    <section className="py-16 md:py-20" style={{ background: BRAND.light }}>
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center" style={{ color: BRAND.dark }}>
          Weekly Schedule
        </h2>
        <div className="flex flex-wrap justify-center gap-5">
          {schedule.map((s, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl px-8 py-6 shadow-md hover:shadow-lg transition-shadow duration-200 text-center min-w-[200px]"
            >
              <div className="text-sm font-semibold uppercase tracking-wider mb-1" style={{ color: BRAND.cyan }}>
                {s.day}
              </div>
              <div className="text-xl font-bold mb-1" style={{ color: BRAND.dark }}>
                {s.time}
              </div>
              {s.duration && (
                <div className="text-sm text-gray-400">{s.duration} min</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function UpcomingClassesSection({ upcomingDates, capacity }) {
  if (!upcomingDates || upcomingDates.length === 0) return null;
  return (
    <section className="max-w-4xl mx-auto px-6 py-16 md:py-20">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center" style={{ color: BRAND.dark }}>
        Upcoming Classes
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {upcomingDates.map((d, i) => {
          const spotsLow = d.spotsRemaining <= 3;
          return (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-200"
            >
              <div className="text-base font-bold mb-1" style={{ color: BRAND.dark }}>
                {formatDate(d.start)}
              </div>
              <div className="text-sm text-gray-500 mb-3">
                {formatTime(d.start)} &ndash; {formatTime(d.finish)}
              </div>
              <span
                className={`inline-block text-xs font-semibold px-3 py-1 rounded-full ${
                  spotsLow
                    ? "bg-red-50 text-red-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {d.spotsRemaining <= 0
                  ? "Full"
                  : `${d.spotsRemaining} spot${d.spotsRemaining === 1 ? "" : "s"} left`}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PricingSection({ bookingTypes, tcPackageUrl, navigate }) {
  const trialType = bookingTypes.find(
    (bt) => bt.isTrial || bt.name.toLowerCase().includes("trial")
  );
  const singleType = bookingTypes.find(
    (bt) => !bt.isTrial && !bt.name.toLowerCase().includes("trial") && bt.name.includes("Single")
  );

  const cards = [
    {
      label: "Trial Class",
      price: trialType ? `$${Math.round(trialType.actualPrice)}` : `$${TRIAL_PRICE}`,
      period: "one class",
      description: "Perfect for first-timers",
      features: [
        "Full class experience",
        "Meet the instructors",
        "All materials provided",
        "No commitment required",
      ],
      featured: true,
      action: () => {
        if (trialType) {
          navigate(`/booking-forms/frontend?bookingTypeId=${trialType.id}`);
        }
      },
      cta: "Book Trial",
      disabled: !trialType,
    },
    {
      label: "Single Class",
      price: singleType ? `$${Math.round(singleType.actualPrice)}` : "$60",
      period: "per class",
      description: "Drop in anytime",
      features: [
        "Flexible scheduling",
        "No long-term commitment",
        "All skill levels welcome",
        "Materials included",
      ],
      featured: false,
      action: () => {
        if (singleType) {
          navigate(`/booking-forms/frontend?bookingTypeId=${singleType.id}`);
        }
      },
      cta: "Book Class",
      disabled: !singleType,
    },
    {
      label: "10-Class Pack",
      price: "$600",
      period: "$60/class",
      description: "Best value \u2014 save with a pack",
      features: [
        "10 classes included",
        "Use at your own pace",
        "Priority booking",
        "Best per-class rate",
      ],
      featured: false,
      action: () => {
        if (tcPackageUrl) {
          window.open(tcPackageUrl, "_blank", "noopener,noreferrer");
        }
      },
      cta: "Buy Pack",
      disabled: !tcPackageUrl,
    },
  ];

  return (
    <section id="pricing" className="py-16 md:py-24" style={{ background: BRAND.light }}>
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold mb-3 text-center" style={{ color: BRAND.dark }}>
          Choose Your Plan
        </h2>
        <p className="text-gray-500 text-center mb-12 text-lg">
          Start with a trial or jump right in
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
          {cards.map((card, i) => (
            <div
              key={i}
              className={`relative rounded-2xl bg-white overflow-hidden transition-all duration-300 hover:-translate-y-1 ${
                card.featured
                  ? "shadow-xl md:scale-105"
                  : "shadow-md hover:shadow-lg"
              }`}
              style={card.featured ? { boxShadow: `0 0 0 2px ${BRAND.cyan}, 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)` } : {}}
            >
              {card.featured && (
                <div
                  className="text-center text-xs font-bold uppercase tracking-widest text-white py-2"
                  style={{ background: BRAND.cyan }}
                >
                  Most Popular
                </div>
              )}
              <div className="p-7 md:p-8">
                <h3 className="text-lg font-semibold mb-1" style={{ color: BRAND.dark }}>
                  {card.label}
                </h3>
                <p className="text-sm text-gray-400 mb-5">{card.description}</p>

                <div className="mb-6">
                  <span className="text-4xl font-extrabold" style={{ color: BRAND.navy }}>
                    {card.price}
                  </span>
                  <span className="text-sm text-gray-400 ml-2">/ {card.period}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {card.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                      <svg
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        style={{ color: BRAND.cyan }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={card.action}
                  disabled={card.disabled}
                  className={`w-full py-3.5 rounded-xl font-semibold text-base transition-all duration-200 cursor-pointer ${
                    card.featured
                      ? "text-white shadow-lg hover:shadow-xl hover:brightness-110"
                      : "hover:opacity-90"
                  } ${card.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  style={
                    card.featured
                      ? { background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.purple})` }
                      : { background: "transparent", border: `2px solid ${BRAND.navy}`, color: BRAND.navy }
                  }
                >
                  {card.cta}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function VenueSection({ club }) {
  const hasVenue = club.venueName || club.venueAddress;
  if (!hasVenue && !club.logisticsInfo) return null;

  return (
    <section className="max-w-3xl mx-auto px-6 py-16 md:py-20">
      <h2 className="text-2xl md:text-3xl font-bold mb-8 text-center" style={{ color: BRAND.dark }}>
        Venue &amp; Directions
      </h2>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8">
        <div className="flex flex-col md:flex-row md:items-start gap-6">
          {/* Map pin icon */}
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: BRAND.light }}
          >
            <svg className="w-7 h-7" style={{ color: BRAND.purple }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>

          <div className="flex-1 space-y-3">
            {club.venueName && (
              <h3 className="text-xl font-semibold" style={{ color: BRAND.dark }}>
                {club.venueName}
              </h3>
            )}
            {club.venueAddress && (
              <div>
                <a
                  href={mapsUrl(club.venueAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base underline underline-offset-2 hover:no-underline transition-colors duration-200"
                  style={{ color: BRAND.purple }}
                >
                  {club.venueAddress}
                </a>
                <span className="text-xs text-gray-400 ml-2">(Open in Maps)</span>
              </div>
            )}
            {club.logisticsInfo && (
              <p className="text-gray-500 leading-relaxed">{club.logisticsInfo}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterSection({ club }) {
  return (
    <footer style={{ background: BRAND.dark }} className="text-white">
      <div className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <h3 className="text-xl font-bold mb-3">Acme Operations</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Teaching kids chess through storytelling since day one. Fun,
              engaging, and designed for every skill level.
            </p>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Contact
            </h4>
            <ul className="space-y-2 text-sm">
              {club.contactEmail && (
                <li>
                  <a
                    href={`mailto:${club.contactEmail}`}
                    className="hover:underline transition-colors"
                    style={{ color: BRAND.cyan }}
                  >
                    {club.contactEmail}
                  </a>
                </li>
              )}
              {club.contactPhone && (
                <li>
                  <a
                    href={`tel:${club.contactPhone}`}
                    className="hover:underline transition-colors"
                    style={{ color: BRAND.cyan }}
                  >
                    {club.contactPhone}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Policy */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Cancellation Policy
            </h4>
            <p className="text-sm text-gray-400 leading-relaxed">
              {club.cancellationPolicy ||
                "Cancellations must be made at least 24 hours before class time for a full refund."}
            </p>
          </div>
        </div>

        <div className="border-t border-gray-700 pt-6 text-center">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Acme Operations. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}

// --------------- Main Component ---------------

// Preview gate — remove this block when the page is ready to go live
const PREVIEW_KEY = "stc2026";

export default function ClubBookingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [club, setClub] = useState(null);
  const [bookingTypes, setBookingTypes] = useState([]);
  const [upcomingDates, setUpcomingDates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const isPreview = searchParams.get("preview") === PREVIEW_KEY;

  useEffect(() => {
    if (!isPreview) return;
    let cancelled = false;

    async function fetchClub() {
      try {
        const res = await fetch(`/api/clubs/public/${slug}`);
        if (!cancelled) {
          if (res.status === 404) {
            setNotFound(true);
            setLoading(false);
            return;
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const data = await res.json();
          setClub(data.club);
          setBookingTypes(data.bookingTypes || []);
          setUpcomingDates(data.upcomingDates || []);
          setLoading(false);
        }
      } catch (err) {
        console.error("Failed to load club:", err);
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    }

    fetchClub();
    return () => { cancelled = true; };
  }, [slug, isPreview]);

  // Gate: require ?preview=stc2026 until page is ready to go live
  if (!isPreview) return <NotFoundPage />;
  if (loading) return <LoadingSkeleton />;
  if (notFound || !club) return <NotFoundPage />;

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>
      <HeroSection club={club} />
      <AboutSection description={club.description} />
      <ScheduleSection schedule={club.schedule} />
      <UpcomingClassesSection upcomingDates={upcomingDates} capacity={club.capacity} />
      <PricingSection
        bookingTypes={bookingTypes}
        tcPackageUrl={club.tcPackageUrl}
        navigate={navigate}
      />
      <VenueSection club={club} />
      <FooterSection club={club} />
    </div>
  );
}
