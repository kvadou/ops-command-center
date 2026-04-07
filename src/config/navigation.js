import {
  HomeIcon,
  FunnelIcon,
  CalendarDaysIcon,
  UsersIcon,
  BuildingLibraryIcon,
  PuzzlePieceIcon,
  MegaphoneIcon,
  ChartBarIcon,
  CogIcon,
  InboxIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  CalculatorIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  UserGroupIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  DocumentCheckIcon,
  BanknotesIcon,
  PresentationChartLineIcon,
  PresentationChartBarIcon,
  ClockIcon,
  TableCellsIcon,
  GlobeAltIcon,
  BeakerIcon,
  PencilSquareIcon,
  LightBulbIcon,
  SparklesIcon,
  WrenchScrewdriverIcon,
  BookOpenIcon,
  NewspaperIcon,
  Squares2X2Icon,
  EllipsisHorizontalIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';

// ─── Header Sections ────────────────────────────────────────────────
export const headerSections = [
  // Group 1 — Home
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: HomeIcon, group: 1 },

  // Group 2 — Work
  { key: 'operations', label: 'Operations', path: '/ops', icon: BriefcaseIcon, group: 2 },

  // Group 3 — Entities
  { key: 'people', label: 'People', path: '/people/tutors', icon: UsersIcon, group: 3 },
  { key: 'schools', label: 'Schools', path: '/schools', icon: BuildingLibraryIcon, group: 3 },
  { key: 'clubs', label: 'Clubs', path: '/clubs', icon: PuzzlePieceIcon, group: 3 },

  // Group 4 — Insights
  { key: 'marketing', label: 'Marketing', path: '/marketing', icon: MegaphoneIcon, group: 4 },
  { key: 'analytics', label: 'Analytics', path: '/analytics', icon: ChartBarIcon, group: 4 },
  { key: 'admin', label: 'Admin', path: '/admin/users', icon: CogIcon, group: 4 },
];

// ─── Sidebar Config ─────────────────────────────────────────────────
// Items with `divider: true` render a section label instead of a link.
export const sidebarConfig = {
  dashboard: [],

  operations: [
    // Intake
    { divider: true, label: 'Intake' },
    { label: 'Booking Hub', path: '/pipeline', icon: InboxIcon },
    { label: 'Event Leads', path: '/pipeline/event-leads', icon: CalendarDaysIcon },
    { label: 'Sync to Website', path: '/pipeline/services', icon: CogIcon },

    // Conversion
    { divider: true, label: 'Conversion' },
    { label: 'Client Conversion', path: '/pipeline/cct', icon: ArrowPathIcon },
    { label: 'Client Management', path: '/pipeline/clients', icon: UserGroupIcon },
    { label: 'Conversion Analytics', path: '/pipeline/analytics', icon: ChartBarIcon },

    // Scheduling
    { divider: true, label: 'Scheduling' },
    { label: 'Calendar', path: '/scheduling', icon: CalendarDaysIcon },
    { label: 'Jobs', path: '/scheduling/jobs', icon: BriefcaseIcon },
    { label: 'Lessons', path: '/scheduling/lessons', icon: AcademicCapIcon },
    { label: 'Job Builder', path: '/scheduling/job-builder', icon: WrenchScrewdriverIcon },

    // Monitoring
    { divider: true, label: 'Monitoring' },
    { label: 'Cohort Retention', path: '/pipeline/retention', icon: ChartBarIcon },
  ],

  people: [
    { label: 'Tutors', path: '/people/tutors', icon: UsersIcon },
    { label: 'Students', path: '/people/students', icon: AcademicCapIcon },
    { label: 'Clients', path: '/people/clients', icon: UserGroupIcon },
    { label: 'Referrals', path: '/people/referrals', icon: SparklesIcon },
    { label: 'Maps', path: '/people/maps', icon: MapPinIcon },
  ],

  schools: [
    { label: 'Schools', path: '/schools', icon: BuildingLibraryIcon },
    { label: 'Pricing Models', path: '/schools/pricing', icon: CurrencyDollarIcon },
    { label: 'Billing', path: '/schools/billing', icon: BanknotesIcon },
    { label: 'Invoices', path: '/schools/invoices', icon: DocumentCheckIcon },
    { label: 'Term Billing', path: '/schools/term-billing', icon: TableCellsIcon },
  ],

  clubs: [
    { label: 'Dashboard', path: '/clubs', icon: Squares2X2Icon },
    { label: 'Management', path: '/clubs', icon: PuzzlePieceIcon },
    { label: 'Calendar', path: '/clubs/calendar', icon: CalendarDaysIcon },
    { label: 'Financials', path: '/clubs/financials', icon: CurrencyDollarIcon },
    { label: 'Booking Forms', path: '/clubs/booking-forms', icon: ClipboardDocumentListIcon },
  ],

  marketing: [
    { label: 'Dashboard', path: '/marketing', icon: Squares2X2Icon },
    { label: 'Analytics', path: '/marketing/analytics', icon: ChartBarIcon },
    { label: 'Campaigns', path: '/marketing/campaigns', icon: MegaphoneIcon },
    { label: 'Meta Ads', path: '/marketing/meta-ads', icon: GlobeAltIcon },
    { label: 'Google Ads', path: '/marketing/google-ads', icon: CurrencyDollarIcon },
    { label: 'Klaviyo', path: '/marketing/klaviyo', icon: ChatBubbleLeftRightIcon },
    { label: 'A/B Tests', path: '/marketing/ab-tests', icon: BeakerIcon },
    { label: 'Content', path: '/marketing/content', icon: PencilSquareIcon },
    { label: 'Blogs', path: '/marketing/blogs', icon: NewspaperIcon },
    { label: 'AI Advisor', path: '/marketing/advisor', icon: LightBulbIcon },
  ],

  analytics: [
    { label: 'Data Center', path: '/analytics/data-center', icon: CircleStackIcon },
    { label: 'Overview', path: '/analytics', icon: ChartBarIcon },
    { label: 'Forecast', path: '/analytics/forecast', icon: PresentationChartLineIcon },
    { label: 'Reports', path: '/analytics/reports', icon: DocumentTextIcon },
    { label: 'Revenue', path: '/analytics/revenue', icon: CurrencyDollarIcon },
    { label: 'Client Spend', path: '/analytics/client-spend', icon: BanknotesIcon },
    { label: 'Lesson Hours', path: '/analytics/lesson-hours', icon: ClockIcon },
    { label: 'Scorecard', path: '/analytics/scorecard', icon: PresentationChartBarIcon },
    { label: 'Historical', path: '/historical-analytics', icon: ClockIcon },
  ],

  admin: [
    { label: 'Users', path: '/admin/users', icon: UsersIcon },
    { label: 'Policies', path: '/admin/policies', icon: ShieldCheckIcon },
    { label: 'SOPs', path: '/admin/sops', icon: DocumentTextIcon },
    { label: 'Knowledge Hub', path: '/admin/knowledge', icon: BookOpenIcon },
    { label: 'Communications', path: '/admin/communications', icon: ChatBubbleLeftRightIcon },
    { label: 'Accounting', path: '/admin/accounting', icon: CalculatorIcon },

    { divider: true, label: 'Settings' },
    { label: 'Reports', path: '/admin/settings?tab=ReportDistribution', icon: DocumentTextIcon },
    { label: 'Sync Manager', path: '/admin/settings?tab=SyncManager', icon: CogIcon },
    { label: 'Bad Margin Alerts', path: '/admin/settings?tab=BadMarginAlerts', icon: ShieldCheckIcon },
    { label: 'Images', path: '/admin/settings?tab=Images', icon: BookOpenIcon },
    { label: 'QR Codes', path: '/admin/settings?tab=QRCodes', icon: ClipboardDocumentListIcon },
    { label: 'Band Config', path: '/admin/settings?tab=CurriculumConfig', icon: CogIcon },
    { label: 'Invoice Collections', path: '/admin/settings?tab=InvoiceCollections', icon: CalculatorIcon },
  ],
};

// ─── Mobile Tab Items ───────────────────────────────────────────────
export const mobileTabItems = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: HomeIcon },
  { key: 'operations', label: 'Ops', path: '/ops', icon: BriefcaseIcon },
  { key: 'people', label: 'People', path: '/people/tutors', icon: UsersIcon },
  { key: 'analytics', label: 'Analytics', path: '/analytics', icon: ChartBarIcon },
  { key: 'more', label: 'More', path: null, icon: EllipsisHorizontalIcon },
];
