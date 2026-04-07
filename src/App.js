import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
  useLocation,
  useParams,
  Link,
} from "react-router-dom";
import React, { useState, useEffect, useRef, Suspense, lazy, Component } from "react";
import axios from "axios";

// Global axios config: send httpOnly cookies with every request
// This ensures all existing axios.get/post calls (157+ files) authenticate via cookie
// without needing to update each file's Authorization header
axios.defaults.withCredentials = true;

import { HeaderActionsProvider, useHeaderActions } from "./contexts/HeaderActionsContext";
import { CompanyNameProvider, useCompanyName } from "./contexts/CompanyNameContext";
import { ToastProvider } from "./hooks/useToast";
import { FolderIcon } from "@heroicons/react/24/outline";

// AppShell — new top header navigation layout
import AppShell from './components/AppShell';

// Lazy-loaded components for code splitting
const Login = lazy(() => import("./components/Login"));
// Error boundary that catches chunk load failures (e.g., after a deploy swaps hashed JS files)
// and auto-refreshes the page once to pick up the new index.html
class ChunkErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    // Detect chunk load failures: dynamic import() rejects with these patterns
    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      /loading chunk|failed to fetch dynamically imported module|importing a module script failed/i.test(error?.message);

    if (isChunkError) {
      const reloadKey = 'chunk_error_reload';
      const lastReload = sessionStorage.getItem(reloadKey);
      const now = Date.now();

      // Only auto-reload once per 60 seconds to avoid infinite reload loops
      if (!lastReload || now - parseInt(lastReload, 10) > 60000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
        return { hasError: true };
      }
    }

    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <p className="text-neutral-600">A new version is available.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const MainDashboard = lazy(() => import("./components/MainDashboard"));
const SuccessPage = lazy(() => import("./components/SuccessPage"));
const CanceledPage = lazy(() => import("./components/CanceledPage"));
const ClientReports = lazy(() => import("./components/ClientReports"));
const TemplateList = lazy(() => import("./components/TemplateList"));
const TemplateBuilder = lazy(() => import("./components/TemplateBuilder"));
const CurrentWeek = lazy(() => import("./components/CurrentWeek"));
const MonthToDate = lazy(() => import("./components/MonthToDate"));
const YearToDate = lazy(() => import("./components/YearToDate"));
const LastYearStats = lazy(() => import("./components/LastYearStats"));
const ClientBehavior = lazy(() => import("./components/ClientBehavior"));
const TutorBehavior = lazy(() => import("./components/TutorBehavior"));
const LifetimeStats = lazy(() => import("./components/LifetimeStats"));
const BigStats = lazy(() => import("./components/BigStats"));
const AdsEmailAnalytics = lazy(() => import("./components/AdsEmailAnalytics"));
const TutorCruncherData = lazy(() => import("./components/TutorCruncherData"));
const RevenueByDivision = lazy(() => import("./components/RevenueByDivision"));
const Users = lazy(() => import("./components/UsersPage"));
const TutorRetention = lazy(() => import("./components/TutorRetention"));
const ClientsOverview = lazy(() => import("./components/ClientsOverview"));
const ClientManagement = lazy(() => import("./components/ClientManagement"));
const TutorManagement = lazy(() => import("./components/TutorManagement"));
const StudentManagement = lazy(() => import("./components/StudentManagement"));
const InvoiceManagement = lazy(() => import("./components/InvoiceManagement"));
const MasterReport = lazy(() => import("./components/MasterReport"));
const AnalyticsDashboard = lazy(() => import("./components/AnalyticsDashboard"));
const DataCenterDashboard = lazy(() => import("./components/DataCenter/DataCenterDashboard"));
const DataCenterTable = lazy(() => import("./components/DataCenter/DataCenterTable"));
const HistoricalAnalytics = lazy(() => import("./components/HistoricalAnalytics"));
const FinancialIntelligence = lazy(() => import("./components/FinancialIntelligence"));
const ExecutiveReports = lazy(() => import("./pages/ExecutiveReports"));
const E4DataPage = lazy(() => import("./components/E4DataPage"));
const MindBodyDataPage = lazy(() => import("./components/MindBodyDataPage"));
const Settings = lazy(() => import("./components/Settings"));
const RetentionMetrics = lazy(() => import("./components/RetentionMetrics"));
const CohortRetentionPage = lazy(() => import("./components/CohortRetentionPage"));
const AdsManagerPage = lazy(() => import("./components/AdsManagerPage"));
const ClientConversionTracker = lazy(() => import("./components/ClientConversionTracker"));
const BookingFormsHome = lazy(() => import("./components/BookingFormsHome"));
const FormSubmissions = lazy(() => import("./components/FormSubmissions"));
const BookingHub = lazy(() => import("./components/BookingHub"));
const EventLeadsHub = lazy(() => import("./components/EventLeadsHub"));
const BookingConfig = lazy(() => import("./components/BookingConfig"));
const BookingForms = lazy(() => import("./components/BookingForms"));
const MonthlyBillingCheckout = lazy(() => import("./components/MonthlyBillingCheckout"));
const CalendarSettingsPage = lazy(() => import("./clubs/CalendarSettingsPage"));
const ServiceManagementPage = lazy(() => import("./clubs/ServiceManagementPage"));
const ServiceHistoryDashboard = lazy(() => import("./components/ServiceHistoryDashboard"));
const AppointmentsPage = lazy(() => import("./clubs/Appointments"));
const CalendarView = lazy(() => import("./clubs/CalendarView"));
const BookingFormsInternal = lazy(() => import("./components/BookingFormsInternal"));
const EventLeadCapturePage = lazy(() => import("./components/EventLeadCapturePage"));
const PoliciesManager = lazy(() => import("./components/PoliciesManager"));
const PublicSchoolDirectory = lazy(() => import("./components/PublicSchoolDirectory"));
const JobBuilder = lazy(() => import("./components/JobBuilder"));
const JobBuilderAdmin = lazy(() => import("./components/JobBuilderAdmin"));
const JobsDashboard = lazy(() => import("./components/JobsDashboard"));
const LessonsDashboard = lazy(() => import("./components/LessonsDashboard"));
const JobCreationPage = lazy(() => import("./components/JobCreationPage"));
const TermBillingSetup = lazy(() => import("./components/TermBillingSetup"));
const SubscriptionManagement = lazy(() => import("./components/SubscriptionManagement"));
const SchoolBilling = lazy(() => import("./components/SchoolBilling"));
const FranchiseeAnalytics = lazy(() => import("./components/FranchiseeAnalytics"));
const SchoolDashboardLayout = lazy(() => import("./components/SchoolDashboardLayout"));
const SchoolDashboardOverviewAndSchools = lazy(() => import("./components/SchoolDashboardOverviewAndSchools"));
const SchoolDetailPage = lazy(() => import("./components/SchoolDetailPage"));
const SchoolStudentForm = lazy(() => import("./pages/SchoolStudentForm"));
const InvoiceFulfillmentTracker = lazy(() => import("./components/InvoiceFulfillmentTracker"));
const SchoolPricingModels = lazy(() => import("./components/SchoolPricingModels"));
// Schools wrapper components for Operations Hub routes
const SchoolsDashboardWrapper = lazy(() => import("./components/schools/SchoolsDashboardWrapper"));
const SchoolsPricingModelsWrapper = lazy(() => import("./components/schools/SchoolsPricingModelsWrapper"));
const SchoolsInvoiceFulfillmentWrapper = lazy(() => import("./components/schools/SchoolsInvoiceFulfillmentWrapper"));
const SchoolsTermBillingWrapper = lazy(() => import("./components/schools/SchoolsTermBillingWrapper"));
const SchoolsTermBillingSubscriptionsWrapper = lazy(() => import("./components/schools/SchoolsTermBillingSubscriptionsWrapper"));
const SchoolsBillingWrapper = lazy(() => import("./components/schools/SchoolsBillingWrapper"));
const TermBillingSubscriptions = lazy(() => import("./components/TermBillingSubscriptions"));
const SchoolsDetailWrapper = lazy(() => import("./components/schools/SchoolsDetailWrapper"));
const SchoolsBookingFormsWrapper = lazy(() => import("./components/schools/SchoolsBookingFormsWrapper"));
// New CRM-style school components
const SchoolsListPage = lazy(() => import("./components/schools/SchoolsListPage"));
const SchoolDetailPageNew = lazy(() => import("./components/schools/SchoolDetailPageNew"));
const SchoolPartnersLayout = lazy(() => import("./components/schools/SchoolPartnersLayout"));
const SchoolPartnersInvoiceFulfillment = lazy(() => import("./components/schools/SchoolPartnersInvoiceFulfillment"));
// Clubs components
const ClubsDashboard = lazy(() => import("./components/clubs/ClubsDashboard"));
const ClubsCalendar = lazy(() => import("./components/clubs/ClubsCalendar"));
const ClubsBookingForms = lazy(() => import("./components/clubs/ClubsBookingForms"));
// Club Partners (Old Ops Hub) components
const ClubManagement = lazy(() => import("./components/ClubManagement"));
const ClubBookingPage = lazy(() => import("./components/ClubBookingPage"));
const ClubPartnersLayout = lazy(() => import("./components/clubs/ClubPartnersLayout"));
const ClubDashboardContent = lazy(() => import("./components/clubs/ClubDashboardContent"));
const ClubAnalyticsContent = lazy(() => import("./components/clubs/ClubAnalyticsContent"));
const ClubCalendarContent = lazy(() => import("./components/clubs/ClubCalendarContent"));
const ClubFinancialsContent = lazy(() => import("./components/clubs/ClubFinancialsContent"));
const OnlineDashboard = lazy(() => import("./components/online/OnlineDashboard"));
const OnlineCalendar = lazy(() => import("./components/online/OnlineCalendar"));
const OnlineBookingForms = lazy(() => import("./components/online/OnlineBookingForms"));
const OnlineTournament = lazy(() => import("./components/online/OnlineTournament"));
const BookingFormAnalytics = lazy(() => import("./components/BookingFormAnalytics"));
const MarketingCommandCenter = lazy(() => import("./components/marketing/MarketingCommandCenter"));
// Marketing Hub pages
const MarketingHubDashboard = lazy(() => import("./pages/marketing/MarketingDashboard"));
const MarketingHubAdvisor = lazy(() => import("./pages/marketing/MarketingAdvisorPage"));
const MarketingHubAnalytics = lazy(() => import("./pages/marketing/MarketingAnalyticsPage"));
const MarketingHubABTests = lazy(() => import("./pages/marketing/MarketingABTestsPage"));
const MarketingHubCampaigns = lazy(() => import("./pages/marketing/MarketingCampaignsPage"));
const MarketingHubCampaignCreate = lazy(() => import("./pages/marketing/CampaignCreatePage"));
const MarketingHubBlogs = lazy(() => import("./pages/marketing/MarketingBlogsPage"));
const MarketingHubBlogEditor = lazy(() => import("./pages/marketing/BlogEditorPage"));
const MarketingHubInstagram = lazy(() => import("./pages/marketing/MarketingInstagramPage"));
const MarketingHubInstagramEditor = lazy(() => import("./pages/marketing/InstagramPostEditorPage"));
const MarketingHubContent = lazy(() => import("./pages/marketing/MarketingContentPage"));
const MarketingHubMetaAds = lazy(() => import("./pages/marketing/MetaAdsPage"));
const MarketingHubGoogleAds = lazy(() => import("./pages/marketing/GoogleAdsPage"));
const MarketingHubKlaviyo = lazy(() => import("./pages/marketing/KlaviyoPage"));
const MarketingHubDraftQueue = lazy(() => import("./pages/marketing/DraftQueuePage"));
const MarketingHubOptimizations = lazy(() => import("./pages/marketing/OptimizationResultsPage"));
const ABTestPage = lazy(() => import("./components/ABTestPage"));
const PayrollPage = lazy(() => import("./components/PayrollPage"));
const TutorDetailPage = lazy(() => import("./components/TutorDetailPage"));
const ClientDetailPage = lazy(() => import("./components/ClientDetailPage"));
const StudentDetailPage = lazy(() => import("./components/StudentDetailPage"));
const JobDetailPage = lazy(() => import("./components/JobDetailPage"));
const JobEditPage = lazy(() => import("./components/JobEditPage"));
const LessonDetailPage = lazy(() => import("./components/LessonDetailPage"));
const LessonEditPage = lazy(() => import("./components/LessonEditPage"));
const TutorsListPage = lazy(() => import("./components/TutorsListPage"));
const ClientsListPage = lazy(() => import("./components/ClientsListPage"));
const StudentsListPage = lazy(() => import("./components/StudentsListPage"));
const AffiliatesListPage = lazy(() => import("./components/AffiliatesListPage"));
const TutorsAnalytics = lazy(() => import("./components/TutorsAnalytics"));
const ClientsAnalytics = lazy(() => import("./components/ClientsAnalytics"));
const StudentsAnalytics = lazy(() => import("./components/StudentsAnalytics"));
const AffiliatesAnalytics = lazy(() => import("./components/AffiliatesAnalytics"));
const AddTutorPage = lazy(() => import("./components/AddTutorPage"));
const AddClientPage = lazy(() => import("./components/AddClientPage"));
const AddStudentPage = lazy(() => import("./components/AddStudentPage"));
const AddAffiliatePage = lazy(() => import("./components/AddAffiliatePage"));
const AdministratorsListPage = lazy(() => import("./components/AdministratorsListPage"));
const AddAdminPage = lazy(() => import("./components/AddAdminPage"));
const MapsPage = lazy(() => import("./components/MapsPage"));
const JobsListPage = lazy(() => import("./components/JobsListPage"));
const LessonsListPage = lazy(() => import("./components/LessonsListPage"));
const DevOpsHub = lazy(() => import("./components/DevOpsHub"));
const HomePage = lazy(() => import("./components/HomePage"));
const HomePageConfig = lazy(() => import("./components/HomePageConfig"));
const NewsFeedPage = lazy(() => import("./components/NewsFeedPage"));
const TasksPage = lazy(() => import("./components/TasksPage"));
const CalendarPage = lazy(() => import("./components/CalendarPage"));
const DraftInvoicesPage = lazy(() => import("./components/accounting/DraftInvoicesPage"));
const RaisedInvoicesPage = lazy(() => import("./components/accounting/RaisedInvoicesPage"));
const DraftCreditRequestsPage = lazy(() => import("./components/accounting/DraftCreditRequestsPage"));
const RaisedCreditRequestsPage = lazy(() => import("./components/accounting/RaisedCreditRequestsPage"));
const DraftPaymentOrdersPage = lazy(() => import("./components/accounting/DraftPaymentOrdersPage"));
const RaisedPaymentOrdersPage = lazy(() => import("./components/accounting/RaisedPaymentOrdersPage"));
const BalanceUpdatesPage = lazy(() => import("./components/accounting/BalanceUpdatesPage"));
const ClientBalancesPage = lazy(() => import("./components/accounting/ClientBalancesPage"));
const InvoiceDetailView = lazy(() => import("./components/accounting/InvoiceDetailView"));
const CreditRequestDetailView = lazy(() => import("./components/accounting/CreditRequestDetailView"));
const PaymentOrderDetailView = lazy(() => import("./components/accounting/PaymentOrderDetailView"));
const AdHocChargesPage = lazy(() => import("./components/AdHocChargesPage"));
const JobApplicationsPage = lazy(() => import("./components/JobApplicationsPage"));
const ReviewsPage = lazy(() => import("./components/ReviewsPage"));
const ReportsPage = lazy(() => import("./components/ReportsPage"));
const PackagesPage = lazy(() => import("./components/PackagesPage"));
const SubscriptionsPage = lazy(() => import("./components/SubscriptionsPage"));
const DocumentsPage = lazy(() => import("./components/DocumentsPage"));
const BroadcastsPage = lazy(() => import("./components/BroadcastsPage"));
const EmailAnalyticsPage = lazy(() => import("./components/EmailAnalyticsPage"));
const OutboundEmailsPage = lazy(() => import("./components/OutboundEmailsPage"));
const PublicFilesPage = lazy(() => import("./components/PublicFilesPage"));
const LessonRemindersPage = lazy(() => import("./components/LessonRemindersPage"));
const IncomeBreakdownPage = lazy(() => import("./components/IncomeBreakdownPage"));
const MonthlyFinancialsPage = lazy(() => import("./components/MonthlyFinancialsPage"));
const IncomeOverTimePage = lazy(() => import("./components/IncomeOverTimePage"));
const LessonHoursPage = lazy(() => import("./components/LessonHoursPage"));
const ClientSpendPage = lazy(() => import("./components/ClientSpendPage"));
const ActivityPage = lazy(() => import("./components/ActivityPage"));
const AnalyticsOverviewPage = lazy(() => import("./components/AnalyticsOverviewPage"));
const CreditAdjustmentsPage = lazy(() => import("./components/CreditAdjustmentsPage"));
const MarketingAnalyticsPage = lazy(() => import("./components/MarketingAnalyticsPage"));
const ForecastPage = lazy(() => import("./components/Forecast/ForecastPage"));
const ScorecardPage = lazy(() => import("./components/Scorecard/ScorecardPage"));
const ReferralsPage = lazy(() => import("./components/Referrals/ReferralsPage"));
const UserGuidePage = lazy(() => import("./components/UserGuidePage"));
const UserGuideAdminPage = lazy(() => import("./components/UserGuideAdminPage"));
const SopLibraryPage = lazy(() => import("./components/SopLibraryPage"));
const SopArticlePage = lazy(() => import("./components/SopArticlePage"));
const SopEditorPage = lazy(() => import("./components/SopEditorPage"));
const VideoWatchPage = lazy(() => import("./components/VideoWatchPage"));
const VideoLibraryPage = lazy(() => import("./components/VideoLibraryPage"));
const KnowledgeHubPage = lazy(() => import("./components/KnowledgeHubPage"));
const KnowledgeCollectionPage = lazy(() => import("./components/KnowledgeCollectionPage"));
const KnowledgeArticlePage = lazy(() => import("./components/KnowledgeArticlePage"));
const KnowledgeHubAdminPage = lazy(() => import("./components/KnowledgeHubAdminPage"));
const KnowledgeQuestionsPage = lazy(() => import("./components/KnowledgeQuestionsPage"));
const KnowledgeArticleEditorPage = lazy(() => import("./components/KnowledgeArticleEditorPage"));
const KnowledgeCollectionEditorPage = lazy(() => import("./components/KnowledgeCollectionEditorPage"));
const FranchiseProgressDashboard = lazy(() => import("./components/knowledge/FranchiseProgressDashboard"));
const FranchiseeProgressPage = lazy(() => import("./components/knowledge/FranchiseeProgressPage"));
const ModerationDashboard = lazy(() => import("./components/moderation/ModerationDashboard"));

// Franchise Academy — moved to separate application, routes disabled
// const AcademyDashboard = lazy(() => import("./pages/academy/AcademyDashboard"));
// const JourneyPage = lazy(() => import("./pages/academy/JourneyPage"));
// const PhaseDetailPage = lazy(() => import("./pages/academy/PhaseDetailPage"));
// const ModulePage = lazy(() => import("./pages/academy/ModulePage"));
// const AchievementsPage = lazy(() => import("./pages/academy/AchievementsPage"));
// const CoachPage = lazy(() => import("./pages/academy/CoachPage"));
// const ResourceLibraryPage = lazy(() => import("./pages/academy/ResourceLibraryPage"));
// const ResourceDetailPage = lazy(() => import("./pages/academy/ResourceDetailPage"));
// const AdminDashboardPage = lazy(() => import("./pages/academy/admin/AdminDashboardPage"));
// const FranchiseesPage = lazy(() => import("./pages/academy/admin/FranchiseesPage"));
// const CurriculumEditorPage = lazy(() => import("./pages/academy/admin/CurriculumEditorPage"));
// const BadgesAdminPage = lazy(() => import("./pages/academy/admin/BadgesAdminPage"));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
      <p className="mt-4 text-neutral-600">Loading...</p>
    </div>
  </div>
);




function SchoolDashboardRedirect() {
  const { clientId } = useParams();
  return <Navigate to={`/school-dashboard/school/${clientId}`} replace />;
}


// Component to manage browser tab title based on route
function DynamicTitle() {
  const location = useLocation();
  
  useEffect(() => {
    // All pages should have "Acme Operations" title for consistent link previews
    document.title = "Acme Operations";
    
    // Update Open Graph meta tags for link previews
    const updateMetaTag = (property, content) => {
      let meta = document.querySelector(`meta[property="${property}"]`) || 
                 document.querySelector(`meta[name="${property}"]`);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(property.startsWith('og:') ? 'property' : 'name', property);
        document.head.appendChild(meta);
      }
      meta.setAttribute('content', content);
    };
    
    updateMetaTag('og:title', 'Acme Operations');
    updateMetaTag('og:description', 'Acme Operations');
    updateMetaTag('og:url', window.location.href);
    updateMetaTag('description', 'Acme Operations');
  }, [location.pathname]);
  
  return null;
}

function Header({ title, actions: propActions }) {
  const { actions: contextActions } = useHeaderActions();
  const actions = propActions || contextActions;
  
  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-1 h-6 bg-gradient-to-b from-brand-purple to-brand-navy rounded-full mr-4" />
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-brand-navy font-heading">
              {title}
            </h1>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

// Wrapper component for Analytics Dashboard
function AnalyticsWithHeader() {
  return (
    <>
      <Header title="Analytics Dashboard" />
      <Suspense fallback={<LoadingFallback />}>
        <AnalyticsDashboard />
      </Suspense>
    </>
  );
}


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const logoutTimerRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  const clearLogoutTimer = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  };

  const isAuthPage = () => {
    const currentPath = window.location.pathname;
    return (
      currentPath.includes("/login") ||
      currentPath.includes("/forgot-password") ||
      currentPath.includes("/reset-password")
    );
  };

  const forceLogout = (reason = "Session expired or invalid") => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    console.log(`${reason}. Redirecting to login...`);
    clearLogoutTimer();
    localStorage.removeItem("user");
    setIsAuthenticated(false);
    setUser(null);
    // Clear server-side httpOnly cookie via logout endpoint
    fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});

    if (!isAuthPage()) {
      window.location.href = "/login";
    }
  };

  // Session restore: cookie-based via /api/me (httpOnly cookie handles auth)
  useEffect(() => {
    // Check for cached user data first for instant UI render
    const cachedUser = localStorage.getItem("user");
    if (cachedUser && cachedUser !== "undefined") {
      try {
        const parsedUser = JSON.parse(cachedUser);
        if (parsedUser) {
          setUser(parsedUser);
          setIsAuthenticated(true);
        }
      } catch {
        localStorage.removeItem("user");
      }
    }

    // Always verify session with server (cookie is the source of truth)
    const authenticateUser = (userData) => {
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
      setIsAuthenticated(true);
    };

    fetch("/api/me", { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then(async (data) => {
        if (data?.user) {
          authenticateUser(data.user);
        } else {
          // No valid session — auto-login as demo user (portfolio demo mode)
          try {
            const demoRes = await fetch("/api/demo-login", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
            const demoData = await demoRes.json();
            if (demoData?.ok && demoData?.user) {
              authenticateUser(demoData.user);
            } else {
              localStorage.removeItem("user");
              setUser(null);
              setIsAuthenticated(false);
            }
          } catch {
            localStorage.removeItem("user");
            setUser(null);
            setIsAuthenticated(false);
          }
        }
      })
      .catch(() => {
        // Network error — keep cached user for offline-ish resilience
      })
      .finally(() => setIsAuthChecked(true));
  }, []);

  useEffect(() => {
    return () => clearLogoutTimer();
  }, []);

  // Re-validate session on tab focus (catches expired cookies)
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (!isAuthenticated) return;
      // Quick server check — if cookie expired, server returns 401
      fetch("/api/me", { credentials: "include" })
        .then((r) => {
          if (!r.ok) forceLogout("Session expired");
        })
        .catch(() => {}); // network error — don't log out
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === 'visible') handleVisibilityOrFocus();
    });

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [isAuthenticated]);

  // Global unauthorized handlers for both fetch and axios
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 401 && isAuthenticated) {
        // Don't logout on /api/me cookie-only checks — those are soft session probes
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (!url.includes('/api/me')) {
          forceLogout("Token expired or invalid");
        }
      }

      return response;
    };

    const axiosInterceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && isAuthenticated) {
          forceLogout("Token expired or invalid");
        }
        return Promise.reject(error);
      }
    );

    return () => {
      window.fetch = originalFetch;
      axios.interceptors.response.eject(axiosInterceptorId);
    };
  }, [isAuthenticated]);

  const handleLogin = (userData) => {
    // Cookie is already set by the server — just update React state
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
    isLoggingOutRef.current = false;
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    clearLogoutTimer();
    isLoggingOutRef.current = false;
    localStorage.removeItem("user");
    setIsAuthenticated(false);
    setUser(null);
    // Clear the server-side httpOnly cookie
    fetch("/api/logout", { method: "POST", credentials: "include" }).catch(() => {});
  };

  if (!isAuthChecked) {
    return <div>Loading...</div>;
  }

  return (
    <ToastProvider>
    <HeaderActionsProvider>
    <CompanyNameProvider>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <DynamicTitle />
        <Routes>
        {/* Club booking page moved inside auth/unauth blocks to avoid
            conflicting with workspace routes like /clubs/calendar */}
        <Route
          path="/booking-forms/frontend"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <BookingForms />
            </Suspense>
          }
        />
        <Route 
          path="/booking-forms/event-lead" 
          element={
            <Suspense fallback={<LoadingFallback />}>
              <EventLeadCapturePage />
            </Suspense>
          } 
        />
        <Route
          path="/schools/directory"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <PublicSchoolDirectory />
            </Suspense>
          }
        />
        <Route 
          path="/school-student-form/:formToken" 
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SchoolStudentForm />
            </Suspense>
          } 
        />
        {/* Public success/cancel pages - must be before authenticated routes */}
        <Route
          path="/success"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SuccessPage />
            </Suspense>
          }
        />
        <Route
          path="/booking-forms/success"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <SuccessPage />
            </Suspense>
          }
        />
        <Route path="/booking-forms/checkout" element={<MonthlyBillingCheckout />} />
        <Route
          path="/canceled"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <CanceledPage />
            </Suspense>
          }
        />
        
        {/* Legacy routes - redirect to new paths */}
        <Route path="/people/tutors" element={<Navigate to="/tutors" replace />} />
        <Route path="/people/clients" element={<Navigate to="/clients" replace />} />
        <Route path="/people/students" element={<Navigate to="/students" replace />} />
        <Route path="/people/affiliates" element={<Navigate to="/affiliates" replace />} />
        {/* Routes now at base level - no redirects needed */}

        {/* Public routes — accessible without auth */}
        <Route
          path="/videos/watch/:token"
          element={
            <Suspense fallback={<LoadingFallback />}>
              <VideoWatchPage />
            </Suspense>
          }
        />

        {!isAuthenticated ? (
          <>
            <Route
              path="/login"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <Login onLogin={handleLogin} />
                </Suspense>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <ForgotPassword />
                </Suspense>
              }
            />
            <Route
              path="/reset-password"
              element={
                <Suspense fallback={<LoadingFallback />}>
                  <ResetPassword />
                </Suspense>
              }
            />
            {/* Public club booking for unauthenticated users */}
            <Route path="/clubs/:slug" element={
              <Suspense fallback={<LoadingFallback />}><ClubBookingPage /></Suspense>
            } />
            <Route path="*" element={<Navigate to="/login" />} />
          </>
        ) : (
          <>
            <Route
              path="*"
              element={
                <AppShell
                  user={user}
                  onSignOut={handleSignOut}
                >
                  <ChunkErrorBoundary>
                  <Routes>
                  {/* Dashboard — / is now the canonical dashboard path */}
                  <Route path="/" element={
                    <Suspense fallback={<LoadingFallback />}>
                      <MainDashboard />
                    </Suspense>
                  } />
                  {/* Legacy dashboard redirect */}
                  <Route path="/main" element={<Navigate to="/" replace />} />
                  {/* /ops is the canonical Operations entry point */}
                  <Route path="/ops" element={<Navigate to="/pipeline" replace />} />
                  {/* ═══ Operations Workspace Routes (Pipeline + Scheduling) ═══ */}
                  <Route path="/pipeline" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Booking Hub" />
                      <Suspense fallback={<LoadingFallback />}><FormSubmissions /></Suspense>
                    </div>
                  } />
                  <Route path="/pipeline/services" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Sync to Website" />
                      <Suspense fallback={<LoadingFallback />}><ServiceManagementPage /></Suspense>
                    </div>
                  } />
                  <Route path="/pipeline/event-leads" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Event Leads" />
                      <Suspense fallback={<LoadingFallback />}><EventLeadsHub /></Suspense>
                    </div>
                  } />
                  <Route path="/pipeline/cct" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Client Conversion Tracker" />
                      <Suspense fallback={<LoadingFallback />}><ClientConversionTracker /></Suspense>
                    </div>
                  } />
                  <Route path="/pipeline/clients" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Clients" />
                      <Suspense fallback={<LoadingFallback />}><ClientManagement /></Suspense>
                    </div>
                  } />
                  <Route path="/pipeline/retention" element={
                    <Suspense fallback={<LoadingFallback />}><CohortRetentionPage /></Suspense>
                  } />
                  <Route path="/pipeline/analytics" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Suspense fallback={<LoadingFallback />}><ClientConversionTracker defaultTab="analytics" /></Suspense>
                    </div>
                  } />
                  {/* Pipeline legacy redirects */}
                  <Route path="/booking-hub/submissions" element={<Navigate to="/pipeline" replace />} />
                  <Route path="/client-conversion-tracker" element={<Navigate to="/pipeline/cct" replace />} />
                  <Route path="/client-management" element={<Navigate to="/pipeline/clients" replace />} />
                  <Route path="/retention-metrics" element={<Navigate to="/pipeline/retention" replace />} />

                  {/* ═══ Scheduling Workspace Routes ═══ */}
                  <Route path="/scheduling" element={
                    <Suspense fallback={<LoadingFallback />}><CalendarPage /></Suspense>
                  } />
                  <Route path="/scheduling/jobs" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Jobs" />
                      <Suspense fallback={<LoadingFallback />}><JobsDashboard /></Suspense>
                    </div>
                  } />
                  <Route path="/scheduling/lessons" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Lessons" />
                      <Suspense fallback={<LoadingFallback />}><LessonsDashboard /></Suspense>
                    </div>
                  } />
                  <Route path="/scheduling/job-builder" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Job Builder" />
                      <Suspense fallback={<LoadingFallback />}><JobBuilder /></Suspense>
                    </div>
                  } />
                  {/* Scheduling legacy redirects */}
                  <Route path="/calendar-frontend" element={<Navigate to="/scheduling" replace />} />
                  <Route path="/jobs-dashboard" element={<Navigate to="/scheduling/jobs" replace />} />
                  <Route path="/lessons-dashboard" element={<Navigate to="/scheduling/lessons" replace />} />
                  <Route path="/job-builder" element={<Navigate to="/scheduling/job-builder" replace />} />

                  {/* ═══ People Workspace Routes ═══ */}
                  <Route path="/people/tutors" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Tutors" />
                      <Suspense fallback={<LoadingFallback />}><TutorManagement /></Suspense>
                    </div>
                  } />
                  <Route path="/people/students" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Students" />
                      <Suspense fallback={<LoadingFallback />}><StudentManagement /></Suspense>
                    </div>
                  } />
                  <Route path="/people/clients" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Clients" />
                      <Suspense fallback={<LoadingFallback />}><ClientManagement /></Suspense>
                    </div>
                  } />
                  <Route path="/people/referrals" element={
                    <Suspense fallback={<LoadingFallback />}><ReferralsPage /></Suspense>
                  } />
                  <Route path="/people/maps" element={
                    <Suspense fallback={<LoadingFallback />}><MapsPage /></Suspense>
                  } />
                  {/* People legacy redirects */}
                  <Route path="/tutor-management" element={<Navigate to="/people/tutors" replace />} />
                  <Route path="/student-management" element={<Navigate to="/people/students" replace />} />

                  {/* ═══ Schools Workspace Routes ═══ */}
                  <Route path="/schools" element={
                    <Suspense fallback={<LoadingFallback />}><SchoolPartnersLayout /></Suspense>
                  }>
                    <Route index element={<Suspense fallback={<LoadingFallback />}><SchoolsListPage /></Suspense>} />
                    <Route path="partners" element={<Suspense fallback={<LoadingFallback />}><SchoolsListPage /></Suspense>} />
                    <Route path="pricing" element={<Suspense fallback={<LoadingFallback />}><SchoolPricingModels /></Suspense>} />
                    <Route path="billing" element={<Suspense fallback={<LoadingFallback />}><SchoolBilling /></Suspense>} />
                    <Route path="invoices" element={<Suspense fallback={<LoadingFallback />}><SchoolPartnersInvoiceFulfillment /></Suspense>} />
                    <Route path="term-billing" element={<Suspense fallback={<LoadingFallback />}><TermBillingSetup /></Suspense>} />
                    <Route path=":id" element={<Suspense fallback={<LoadingFallback />}><SchoolDetailPageNew /></Suspense>} />
                  </Route>
                  {/* Schools legacy redirects */}
                  <Route path="/school-partners" element={<Navigate to="/schools" replace />} />
                  <Route path="/school-partners/pricing-models" element={<Navigate to="/schools/pricing" replace />} />
                  <Route path="/school-partners/billing" element={<Navigate to="/schools/billing" replace />} />
                  <Route path="/school-partners/invoice-fulfillment" element={<Navigate to="/schools/invoices" replace />} />
                  <Route path="/school-partners/term-billing-setup" element={<Navigate to="/schools/term-billing" replace />} />

                  {/* ═══ Clubs Workspace Routes ═══ */}
                  <Route path="/clubs" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Club Management" />
                      <Suspense fallback={<LoadingFallback />}><ClubManagement /></Suspense>
                    </div>
                  } />
                  <Route path="/clubs/financials" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Club Management" />
                      <Suspense fallback={<LoadingFallback />}><ClubManagement /></Suspense>
                    </div>
                  } />
                  {/* clubs/calendar and clubs/booking-forms already exist as routes below */}
                  {/* Public club booking page — must come AFTER explicit workspace routes */}
                  <Route path="/clubs/:slug" element={
                    <Suspense fallback={<LoadingFallback />}><ClubBookingPage /></Suspense>
                  } />
                  {/* Clubs legacy redirects */}
                  <Route path="/club-management" element={<Navigate to="/clubs" replace />} />

                  {/* ═══ Analytics Workspace Routes ═══ */}
                  <Route path="/analytics/reports" element={
                    <>
                      <Header title="Reports" />
                      <Suspense fallback={<LoadingFallback />}><ExecutiveReports /></Suspense>
                    </>
                  } />
                  <Route path="/analytics/revenue" element={
                    <Suspense fallback={<LoadingFallback />}><IncomeBreakdownPage /></Suspense>
                  } />
                  {/* Analytics legacy redirects */}
                  <Route path="/executive-reports" element={<Navigate to="/analytics/reports" replace />} />
                  <Route path="/analytics/income-breakdown" element={<Navigate to="/analytics/revenue" replace />} />

                  {/* ═══ Admin Workspace Routes ═══ */}
                  <Route path="/admin/users" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="User Management" />
                      <Suspense fallback={<LoadingFallback />}><Users /></Suspense>
                    </div>
                  } />
                  <Route path="/admin/settings" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="System Settings" />
                      <Suspense fallback={<LoadingFallback />}><Settings /></Suspense>
                    </div>
                  } />
                  <Route path="/admin/policies" element={
                    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                      <Header title="Policies & Compliance" />
                      <Suspense fallback={<LoadingFallback />}><PoliciesManager /></Suspense>
                    </div>
                  } />
                  <Route path="/admin/sops" element={
                    <Suspense fallback={<LoadingFallback />}><SopLibraryPage /></Suspense>
                  } />
                  <Route path="/admin/knowledge" element={
                    <Suspense fallback={<LoadingFallback />}><KnowledgeHubPage /></Suspense>
                  } />
                  <Route path="/admin/communications" element={
                    <Suspense fallback={<LoadingFallback />}><NewsFeedPage /></Suspense>
                  } />
                  <Route path="/admin/accounting" element={
                    <Suspense fallback={<LoadingFallback />}><RaisedInvoicesPage /></Suspense>
                  } />
                  {/* Admin legacy redirects */}
                  <Route path="/users-page" element={<Navigate to="/admin/users" replace />} />
                  <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />
                  <Route path="/policies" element={<Navigate to="/admin/policies" replace />} />

                  {/* Moved from outside layout wrapper */}
                  <Route
                    path="/ad-hoc-charges"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AdHocChargesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/packages"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <PackagesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/subscriptions"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SubscriptionsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/documents"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DocumentsPage />
                      </Suspense>
                    }
                  />
                  {/* /main now redirects to / — see top of routes */}
                  <Route
                    path="/home"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <HomePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/home/config"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <HomePageConfig />
                      </Suspense>
                    }
                  />
                  {/* People Routes */}
                  <Route
                    path="/tutors"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <TutorsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clients"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClientsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/students"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <StudentsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/affiliates"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AffiliatesListPage />
                      </Suspense>
                    }
                  />
                  {/* School Partners CRM Routes */}
                  <Route
                    path="/school-partners"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolPartnersLayout />
                      </Suspense>
                    }
                  >
                    <Route
                      index
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolsListPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="invoice-fulfillment"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolPartnersInvoiceFulfillment />
                        </Suspense>
                      }
                    />
                    <Route
                      path="pricing-models"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolPricingModels />
                        </Suspense>
                      }
                    />
                    <Route
                      path="billing"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolBilling />
                        </Suspense>
                      }
                    />
                    <Route
                      path=":id"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolDetailPageNew />
                        </Suspense>
                      }
                    />
                  </Route>
                  {/* Club Dashboard redirect to unified Club Management */}
                  <Route
                    path="/club-dashboard/*"
                    element={<Navigate to="/clubs" replace />}
                  />
                  <Route
                    path="/admins"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AdministratorsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/admins/add"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AddAdminPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/maps"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MapsPage />
                      </Suspense>
                    }
                  />
                  {/* Entity Add Pages */}
                  <Route
                    path="/tutors/add"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AddTutorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clients/add"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AddClientPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/students/add"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AddStudentPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/affiliates/add"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AddAffiliatePage />
                      </Suspense>
                    }
                  />
                  {/* Entity Detail Pages */}
                  <Route
                    path="/tutors/analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <TutorsAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clients/analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClientsAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/students/analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <StudentsAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/affiliates/analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AffiliatesAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/referrals"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ReferralsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/tutors/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <TutorDetailPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clients/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClientDetailPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/students/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <StudentDetailPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/jobs/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobDetailPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/jobs/:id/edit"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobEditPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/lessons/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <LessonDetailPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/lessons/:id/edit"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <LessonEditPage />
                      </Suspense>
                    }
                  />
                  {/* Operations Routes - Now at base level */}
                  <Route
                    path="/jobs"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/lessons"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <LessonsListPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/tasks"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <TasksPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/calendar"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <CalendarPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/job-applications"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobApplicationsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/reviews"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ReviewsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ReportsPage />
                      </Suspense>
                    }
                  />
                  {/* Communications Routes */}
                  <Route
                    path="/communications/news"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <NewsFeedPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/moderation"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ModerationDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/broadcasts"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <BroadcastsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/email-analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <EmailAnalyticsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/outbound-emails"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <OutboundEmailsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/public-files"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <PublicFilesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/communications/lesson-reminders"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <LessonRemindersPage />
                      </Suspense>
                    }
                  />
                  {/* Accounting Routes */}
                  <Route
                    path="/accounting/draft-invoices"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DraftInvoicesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/raised-invoices"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <RaisedInvoicesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/draft-credit-requests"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DraftCreditRequestsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/raised-credit-requests"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <RaisedCreditRequestsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/draft-payment-orders"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DraftPaymentOrdersPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/raised-payment-orders"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <RaisedPaymentOrdersPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/balance-updates"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <BalanceUpdatesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/client-balances"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClientBalancesPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/invoices/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <InvoiceDetailView />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/credit-requests/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <CreditRequestDetailView />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/accounting/payment-orders/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <PaymentOrderDetailView />
                      </Suspense>
                    }
                  />
                  {/* Activity Page */}
                  <Route
                    path="/home/activity"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ActivityPage />
                      </Suspense>
                    }
                  />
                  {/* User Guide Routes */}
                  <Route
                    path="/user-guide"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuidePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-guide/collections/:collectionId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuidePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-guide/collections/:collectionId/articles/:articleId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuidePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-guide/admin"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuideAdminPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-guide/admin/collections/:collectionId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuideAdminPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/user-guide/admin/collections/:collectionId/articles/:articleId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <UserGuideAdminPage />
                      </Suspense>
                    }
                  />
                  {/* SOP Library Routes */}
                  <Route
                    path="/sop"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SopLibraryPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/sop/new"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SopEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/sop/:sopId/edit"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SopEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/sop/:sopId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SopArticlePage />
                      </Suspense>
                    }
                  />
                  {/* Video Library Route */}
                  <Route
                    path="/videos"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <VideoLibraryPage />
                      </Suspense>
                    }
                  />
                  {/* Knowledge Hub Routes */}
                  <Route
                    path="/knowledge"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeHubPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/collections/:collectionId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeCollectionPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/articles/:articleId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeArticlePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/admin"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeHubAdminPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/questions"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeQuestionsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/admin/articles/new"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeArticleEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/admin/articles/:articleId/edit"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeArticleEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/admin/collections/new"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeCollectionEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/admin/collections/:collectionId/edit"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <KnowledgeCollectionEditorPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/franchise-progress"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <FranchiseProgressDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/knowledge/my-progress"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <FranchiseeProgressPage />
                      </Suspense>
                    }
                  />
                  {/* Franchise Academy — moved to separate application, routes disabled */}
                  {/* Marketing Hub Routes */}
                  <Route
                    path="/marketing"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/advisor"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubAdvisor />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/campaigns/create"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubCampaignCreate />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/campaigns"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubCampaigns />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/meta-ads"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubMetaAds />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/google-ads"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubGoogleAds />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/klaviyo"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubKlaviyo />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/ab-tests"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubABTests />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/blogs"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubBlogs />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/blogs/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubBlogEditor />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/instagram"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubInstagram />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/instagram/:id"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubInstagramEditor />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/content"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubContent />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/drafts"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubDraftQueue />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/marketing/optimizations"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingHubOptimizations />
                      </Suspense>
                    }
                  />
                  {/* Redirect old marketing-command-center to new marketing/advisor */}
                  <Route
                    path="/marketing-command-center"
                    element={<Navigate to="/marketing/advisor" replace />}
                  />
                  {/* New Job Creation Page - Support both RESTful and query param formats */}
                  <Route
                    path="/clients/:clientId/jobs/create"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobCreationPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/jobs/create"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <JobCreationPage />
                      </Suspense>
                    }
                  />
                  {/* Backward Compatibility Redirects - Old routes */}
                  <Route path="/home/tutors" element={<Navigate to="/tutors" replace />} />
                  <Route path="/home/clients" element={<Navigate to="/clients" replace />} />
                  <Route path="/home/students" element={<Navigate to="/students" replace />} />
                  <Route path="/home/jobs" element={<Navigate to="/jobs" replace />} />
                  <Route path="/home/lessons" element={<Navigate to="/lessons" replace />} />
                  <Route path="/home/tasks" element={<Navigate to="/tasks" replace />} />
                  <Route path="/operations/jobs" element={<Navigate to="/jobs" replace />} />
                  <Route path="/operations/lessons" element={<Navigate to="/lessons" replace />} />
                  <Route path="/operations/tasks" element={<Navigate to="/tasks" replace />} />
                  <Route path="/operations/calendar" element={<Navigate to="/calendar" replace />} />
                  <Route path="/operations/reports" element={<Navigate to="/reports" replace />} />
                  <Route path="/operations/job-applications" element={<Navigate to="/job-applications" replace />} />
                  <Route path="/operations/reviews" element={<Navigate to="/reviews" replace />} />
                  <Route path="/operations/ad-hoc-charges" element={<Navigate to="/ad-hoc-charges" replace />} />
                  <Route path="/operations/packages" element={<Navigate to="/packages" replace />} />
                  <Route path="/operations/subscriptions" element={<Navigate to="/subscriptions" replace />} />
                  <Route path="/operations/documents" element={<Navigate to="/documents" replace />} />
                  <Route path="/home/jobs/create" element={<Navigate to="/jobs/create" replace />} />
                  <Route path="/home/news" element={<Navigate to="/communications/news" replace />} />
                  <Route path="/home/draft-invoices" element={<Navigate to="/accounting/draft-invoices" replace />} />
                  <Route path="/home/raised-invoices" element={<Navigate to="/accounting/raised-invoices" replace />} />
                  <Route path="/home/draft-credit-requests" element={<Navigate to="/accounting/draft-credit-requests" replace />} />
                  <Route path="/home/raised-credit-requests" element={<Navigate to="/accounting/raised-credit-requests" replace />} />
                  <Route path="/home/draft-payment-orders" element={<Navigate to="/accounting/draft-payment-orders" replace />} />
                  <Route path="/home/raised-payment-orders" element={<Navigate to="/accounting/raised-payment-orders" replace />} />
                  <Route path="/home/balance-updates" element={<Navigate to="/accounting/balance-updates" replace />} />
                  <Route path="/home/client-balances" element={<Navigate to="/accounting/client-balances" replace />} />
                  <Route
                    path="/manage-services"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ServiceManagementPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/service-history"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ServiceHistoryDashboard />
                      </Suspense>
                    }
                  />
                  <Route 
                    path="/appointments" 
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AppointmentsPage />
                      </Suspense>
                    } 
                  />
                  <Route
                    path="/analytics/data-center"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DataCenterDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/data-center/:entity"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <DataCenterTable />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics"
                    element={
                      <AnalyticsWithHeader />
                    }
                  />
                  <Route
                    path="/analytics/overview"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <AnalyticsOverviewPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/marketing"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MarketingAnalyticsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/scorecard"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ScorecardPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/forecast"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ForecastPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/income-breakdown"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <IncomeBreakdownPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/monthly-financials"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <MonthlyFinancialsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/income-over-time"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <IncomeOverTimePage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/lesson-hours"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <LessonHoursPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/client-spend"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClientSpendPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/activity"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ActivityPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/analytics/credit-adjustments"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <CreditAdjustmentsPage />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/financial-intelligence"
                    element={
                      <>
                        <Header title="Financial Intelligence" />
                        <Suspense fallback={<LoadingFallback />}>
                          <FinancialIntelligence />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/historical-analytics"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <HistoricalAnalytics />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/executive-reports"
                    element={
                      <>
                        <Header title="Reports" />
                        <Suspense fallback={<LoadingFallback />}>
                          <ExecutiveReports />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/e4"
                    element={
                      <>
                        <Header 
                          title="e4 Historical Data"
                          actions={
                            <div className="flex items-center gap-2">
                              <Link
                                to="/historical-analytics"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                                title="Historical Analytics Archive"
                              >
                                <FolderIcon className="h-5 w-5 text-neutral-600" />
                                <span>Archive</span>
                              </Link>
                              <Link
                                to="/mindbody"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                                title="View MindBody Historical Data"
                              >
                                <span>MindBody Data</span>
                              </Link>
                            </div>
                          }
                        />
                        <Suspense fallback={<LoadingFallback />}>
                          <E4DataPage />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/mindbody"
                    element={
                      <>
                        <Header 
                          title="MindBody Historical Data"
                          actions={
                            <div className="flex items-center gap-2">
                              <Link
                                to="/historical-analytics"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                                title="Historical Analytics Archive"
                              >
                                <FolderIcon className="h-5 w-5 text-neutral-600" />
                                <span>Archive</span>
                              </Link>
                              <Link
                                to="/e4"
                                className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-md hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                                title="View e4 Historical Data"
                              >
                                <span>e4 Data</span>
                              </Link>
                            </div>
                          }
                        />
                        <Suspense fallback={<LoadingFallback />}>
                          <MindBodyDataPage />
                        </Suspense>
                      </>
                    }
                  />
                  {/* Calendar route handled by navigation array (CalendarPage component) */}
                  <Route
                    path="/calendar-backend"
                    element={
                      <>
                        <Header title="Calendar Backend" />
                        <div>Calendar Backend Content Here</div>
                      </>
                    }
                  />
                  <Route
                    path="/calendar-settings"
                    element={
                      <>
                        <Header title="Calendar Settings" />
                        <Suspense fallback={<LoadingFallback />}>
                          <CalendarSettingsPage />
                        </Suspense>
                      </>
                    }
                  />
                  {/* Booking Hub Routes */}
                  <Route
                    path="/booking-hub"
                    element={
                      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                        <Header title="Booking Hub" />
                        <Suspense fallback={<LoadingFallback />}>
                          <BookingHub />
                        </Suspense>
                      </div>
                    }
                  >
                    <Route
                      path="submissions"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <FormSubmissions />
                        </Suspense>
                      }
                    />
                    <Route
                      path="services"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <ServiceManagementPage />
                        </Suspense>
                      }
                    />
                    <Route
                      path="event-leads"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <EventLeadsHub />
                        </Suspense>
                      }
                    />
                  </Route>
                  {/* Redirect old booking-forms/submissions to pipeline */}
                  <Route
                    path="/booking-forms/submissions"
                    element={<Navigate to="/pipeline" replace />}
                  />
                  <Route
                    path="/booking-forms"
                    element={
                      <>
                        <Header title="Booking Forms" />
                        <Suspense fallback={<LoadingFallback />}>
                          <BookingFormsHome />
                        </Suspense>
                      </>
                    }
                  />

                  <Route
                    path="/booking-forms/config"
                    element={
                      <>
                        <Header title="Configuration" />
                        <Suspense fallback={<LoadingFallback />}>
                          <BookingConfig />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/booking-forms/ab-test"
                    element={
                      <>
                        <Header title="A/B Testing Lab" />
                        <Suspense fallback={<LoadingFallback />}>
                          <ABTestPage />
                        </Suspense>
                      </>
                    }
                  />

                  <Route
                    path="/booking-forms/builder"
                    element={
                      <>
                        <Header title="Job Builder" />
                        <Suspense fallback={<LoadingFallback />}>
                          <BookingFormsInternal />
                        </Suspense>
                      </>
                    }
                  />

                  <Route
                    path="/franchisee-analytics"
                    element={
                      <>
                        <Header title="Franchisee Analytics" />
                        <Suspense fallback={<LoadingFallback />}>
                          <FranchiseeAnalytics />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/marketing-analytics"
                    element={
                      <>
                        <Header title="Marketing Analytics" />
                        <Suspense fallback={<LoadingFallback />}>
                          <BookingFormAnalytics />
                        </Suspense>
                      </>
                    }
                  />
                  {/* Redirect old marketing-command-center route to new marketing hub */}
                  <Route
                    path="/marketing-command-center"
                    element={<Navigate to="/marketing/advisor" replace />}
                  />
                  {/* School Dashboard - Nested Routes */}
                  <Route
                    path="/school-dashboard"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolDashboardLayout />
                      </Suspense>
                    }
                  >
                    {/* Index route - Overview & Schools */}
                    <Route
                      index
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolDashboardOverviewAndSchools />
                        </Suspense>
                      }
                    />
                    {/* Pricing Models */}
                    <Route
                      path="pricing-models"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolPricingModels />
                        </Suspense>
                      }
                    />
                    {/* Invoice Fulfillment */}
                    <Route
                      path="invoice-fulfillment"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <InvoiceFulfillmentTracker />
                        </Suspense>
                      }
                    />
                    {/* Term Billing Setup */}
                    <Route
                      path="term-billing-setup"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <TermBillingSetup />
                        </Suspense>
                      }
                    />
                    <Route
                      path="term-billing-setup/:serviceId"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <TermBillingSetup />
                        </Suspense>
                      }
                    />
                    {/* Unified Billing Dashboard - Both Monthly and Term */}
                    <Route
                      path="billing"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolBilling />
                        </Suspense>
                      }
                    />
                    {/* Legacy route redirect for subscriptions */}
                    <Route path="subscriptions" element={<Navigate to="/school-dashboard/billing" replace />} />
                    {/* Legacy route redirect for term-billing-subscriptions */}
                    <Route path="term-billing-subscriptions" element={<Navigate to="/school-dashboard/billing" replace />} />
                    {/* School Detail Page */}
                    <Route
                      path="school/:schoolId"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolDetailPage />
                        </Suspense>
                      }
                    />
                  </Route>
                  {/* Legacy route redirects for backward compatibility */}
                  <Route
                    path="/school-dashboard/:clientId"
                    element={
                      <SchoolDashboardRedirect />
                    }
                  />
                  {/* Schools Dashboard - New Operations Hub Routes */}
                  {/* Index route - Overview & Schools (uses SchoolDashboardLayout for context) */}
                  <Route
                    path="/schools/dashboard"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsDashboardWrapper />
                      </Suspense>
                    }
                  >
                    <Route
                      index
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolDashboardOverviewAndSchools />
                        </Suspense>
                      }
                    />
                  </Route>
                  {/* Pricing Models - Standalone route with wrapper */}
                  <Route
                    path="/schools/dashboard/pricing-models"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsPricingModelsWrapper />
                      </Suspense>
                    }
                  />
                  {/* Invoice Fulfillment - Standalone route with wrapper */}
                  <Route
                    path="/schools/dashboard/invoice-fulfillment"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsInvoiceFulfillmentWrapper />
                      </Suspense>
                    }
                  />
                  {/* Booking Forms - Standalone route with wrapper */}
                  <Route
                    path="/schools/dashboard/booking-forms"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsBookingFormsWrapper />
                      </Suspense>
                    }
                  />
                  {/* Term Billing Setup - Standalone routes with wrapper (kept for backward compatibility) */}
                  <Route
                    path="/schools/dashboard/term-billing-setup"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsTermBillingWrapper />
                      </Suspense>
                    }
                  />
                    <Route
                      path="/schools/dashboard/term-billing-setup/:serviceId"
                      element={
                        <Suspense fallback={<LoadingFallback />}>
                          <SchoolsTermBillingWrapper />
                        </Suspense>
                      }
                    />
                  {/* Term Billing Subscriptions - Shows purchasers */}
                  <Route
                    path="/schools/dashboard/term-billing-subscriptions"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsTermBillingSubscriptionsWrapper />
                      </Suspense>
                    }
                  />
                  {/* Billing Dashboard - Standalone route with wrapper */}
                  <Route
                    path="/schools/dashboard/billing"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsBillingWrapper />
                      </Suspense>
                    }
                  />
                  {/* Legacy route redirect */}
                  <Route path="/schools/dashboard/subscription-management" element={<Navigate to="/schools/dashboard/billing" replace />} />
                  {/* School Detail Page - Standalone route with wrapper */}
                  <Route
                    path="/schools/dashboard/school/:schoolId"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <SchoolsDetailWrapper />
                      </Suspense>
                    }
                  />
                  {/* Clubs Routes */}
                  <Route
                    path="/clubs/dashboard"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClubsDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clubs/calendar"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClubsCalendar />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/clubs/booking-forms"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <ClubsBookingForms />
                      </Suspense>
                    }
                  />
                  {/* Online routes */}
                  <Route
                    path="/online/dashboard"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <OnlineDashboard />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/online/calendar"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <OnlineCalendar />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/online/booking-forms"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <OnlineBookingForms />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/online/tournament"
                    element={
                      <Suspense fallback={<LoadingFallback />}>
                        <OnlineTournament />
                      </Suspense>
                    }
                  />
                  {/* Payroll Page - Hidden from sidebar but accessible via URL */}
                  <Route
                    path="/payroll"
                    element={
                      <>
                        <Header title="Payroll Import/Export" />
                        <Suspense fallback={<LoadingFallback />}>
                          <PayrollPage />
                        </Suspense>
                      </>
                    }
                  />
                  {/* Legacy navigation.map() route generation removed — workspace routes are defined explicitly above */}
                  {/* DevOps Hub - Hidden from navigation but accessible via direct URL */}
                  <Route
                    path="/devops"
                    element={
                      <>
                        <Header title="DevOps Hub" />
                        <Suspense fallback={<LoadingFallback />}>
                          <DevOpsHub />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/job-builder-admin"
                    element={
                      <>
                        <Header title="Job Builder Admin" />
                        <Suspense fallback={<LoadingFallback />}>
                          <JobBuilderAdmin />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/client-reports"
                    element={
                      <>
                        <Header title="All Lesson Reports" />
                        <Suspense fallback={<LoadingFallback />}>
                          <ClientReports />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/client-reports/templates"
                    element={
                      <>
                        <Header title="Email Templates" />
                        <Suspense fallback={<LoadingFallback />}>
                          <TemplateList />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/client-reports/templates/new"
                    element={
                      <>
                        <Header title="Add New Template" />
                        <Suspense fallback={<LoadingFallback />}>
                          <TemplateBuilder />
                        </Suspense>
                      </>
                    }
                  />
                  <Route
                    path="/client-reports/templates/:id"
                    element={
                      <>
                        <Header title="Edit Template" />
                        <Suspense fallback={<LoadingFallback />}>
                          <TemplateBuilder />
                        </Suspense>
                      </>
                    }
                  />

                  <Route path="*" element={<div>Page not found</div>} />
                  </Routes>
                  </ChunkErrorBoundary>
                </AppShell>
              }
            />
          </>
        )}
      </Routes>
      {/* Custom Bug Report Button - temporarily hidden until backend is configured */}
      {/* {isAuthenticated && <BugReportButton />} */}
      </Router>
    </CompanyNameProvider>
    </HeaderActionsProvider>
    </ToastProvider>
  );
}

export default App;
