import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import DOMPurify from 'dompurify';
import { getLabelColor, getContrastColor } from '../utils/labelColors';
import { useClientConversionData } from '../hooks/useClientConversionData';
import { useClientConversionModals } from '../hooks/useClientConversionModals';
import { useClientConversionForms } from '../hooks/useClientConversionForms';
import { useClientConversionUI } from '../hooks/useClientConversionUI';
import { useClientConversionSearch } from '../hooks/useClientConversionSearch';
import PipelineView from './ClientConversion/views/PipelineView';
import ProspectsView from './ClientConversion/views/ProspectsView';
import WonLostView from './ClientConversion/views/WonLostView';
import TakeoverView from './ClientConversion/views/TakeoverView';
import BundlesView from './ClientConversion/views/BundlesView';
import AnalyticsView from './ClientConversion/views/AnalyticsView';
import CCTNotificationCenter from './ClientConversion/CCTNotificationCenter';
import AutomationInfoIndicator from './ClientConversion/AutomationInfoIndicator';
import { useToast } from '../hooks/useToast';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import {
  ChartBarIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ClockIcon,
  PlusIcon,
  FunnelIcon,
  Squares2X2Icon,
  ShoppingBagIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/solid';

const MARKET_OPTIONS = [
  'NYC',
  'Park Slope Club',
  'Hamptons',
  'Online',
  'Los Angeles',
  'San Francisco',
  'Other',
];

const LEAD_TYPE_OPTIONS = [
  'New Lead',
  'Returning Lead',
  'Referral',
  'New Lead/Auction',
  'Takeover',
  'Unregistered',
  'Dead Lead',
  'Other',
];

const NOTIFICATION_OPTIONS = [
  { value: 'invoice_reminders', label: 'Invoice reminders' },
  { value: 'lesson_scheduled', label: 'Lesson scheduled' },
  { value: 'pfi_reminders', label: 'Credit request reminders' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'broadcasts', label: 'Broadcasts' },
  { value: 'low_balance_reminders', label: 'Low balance reminders' },
];

// Unified base styles for all form fields
const UNIFIED_SELECT_BASE = "text-xs border border-neutral-300 rounded px-1 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium w-full transition-colors";
const UNIFIED_DATE_INPUT_BASE = "text-xs border border-neutral-300 rounded px-1 py-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white cursor-pointer hover:border-indigo-400 transition-colors w-full text-center";

const EXTRA_ATTR_FIELDS = [
  { key: 'program_interest', label: 'Program Interest' },
  { key: 'format_interest', label: 'Format Interest' },
  { key: 'event_name', label: 'Event Name' },
  { key: 'referral', label: 'Referral' },
  { key: 'booking_form', label: 'Booking Form' },
  { key: 'utm_source', label: 'UTM Source' },
  { key: 'utm_medium', label: 'UTM Medium' },
  { key: 'utm_campaign', label: 'UTM Campaign' },
];

const PHONE_COUNTRY_CODE = '+1';
const MAX_US_PHONE_DIGITS = 10;

const normalizeUsPhoneDigits = (value = '') => {
  if (typeof value !== 'string') return '';
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('1') && digits.length > MAX_US_PHONE_DIGITS) {
    digits = digits.slice(1);
  }
  return digits.slice(0, MAX_US_PHONE_DIGITS);
};

const formatUsPhoneDisplay = (digits = '') => {
  const cleaned = digits.replace(/\D/g, '').slice(0, MAX_US_PHONE_DIGITS);
  const len = cleaned.length;
  if (len <= 3) return cleaned;
  if (len <= 6) return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
};

function ClientConversionTracker({ defaultTab }) {
  const toast = useToast();
  // Custom hooks for organized state management
  const dataState = useClientConversionData();
  const {
    clients, setClients,
    archivedClients, setArchivedClients,
    pipelineStages, setPipelineStages,
    loading, setLoading,
    bundles, setBundles,
    analytics, setAnalytics
  } = dataState;

  const modalState = useClientConversionModals();
  const {
    showCreateBundleModal, setShowCreateBundleModal,
    showNotesModal, setShowNotesModal,
    showEditModal, setShowEditModal,
    showProspectModal, setShowProspectModal,
    showSubmissionModal, setShowSubmissionModal,
    showManualIntakeModal, setShowManualIntakeModal,
    showTutorDropdown, setShowTutorDropdown,
    showMarketDropdown, setShowMarketDropdown,
    showLeadTypeDropdown, setShowLeadTypeDropdown,
    showStatusDropdown, setShowStatusDropdown,
    selectedClient, setSelectedClient,
    selectedProspect, setSelectedProspect,
    selectedSubmission, setSelectedSubmission
  } = modalState;

  const formState = useClientConversionForms();
  const {
    manualIntakeForm, setManualIntakeForm,
    bundleForm, setBundleForm,
    isCreatingBundle, setIsCreatingBundle,
    newNote, setNewNote,
    editingData, setEditingData
  } = formState;

  const uiState = useClientConversionUI();
  const {
    activeTab, setActiveTab,
    highlightedClientIndex, setHighlightedClientIndex,
    highlightedTutorIndex, setHighlightedTutorIndex
  } = uiState;

  // Allow parent to set initial tab (e.g. /pipeline/analytics)
  useEffect(() => { if (defaultTab) setActiveTab(defaultTab); }, [defaultTab]);

  const searchState = useClientConversionSearch();
  const {
    tutorSearchResults, setTutorSearchResults,
    tutorSearchQuery, setTutorSearchQuery,
    clientSearchResults, setClientSearchResults,
    clientSearchQuery, setClientSearchQuery,
    clearClientSearch
  } = searchState;
  const [manualIntakeErrors, setManualIntakeErrors] = useState({});
  const [manualIntakeServerError, setManualIntakeServerError] = useState(null);
  const [trackerBanner, setTrackerBanner] = useState(null);
  const [confirmDeleteState, setConfirmDeleteState] = useState({
    open: false,
    loading: false,
    prospectName: '',
  });

  const [confirmWonState, setConfirmWonState] = useState({
    open: false,
    loading: false,
    prospectName: '',
    prospectId: null,
    showForceOption: false,
    errorMessage: '',
  });

  const [confirmLostState, setConfirmLostState] = useState({
    open: false,
    loading: false,
    prospectName: '',
    prospectId: null,
  });
  const [isSavingManualIntake, setIsSavingManualIntake] = useState(false);
  const [showAdvancedIntake, setShowAdvancedIntake] = useState(false);
  const [isSearchingClients, setIsSearchingClients] = useState(false);
  const [selectedClientFromSearch, setSelectedClientFromSearch] = useState(null);
  const [showClientSearchResults, setShowClientSearchResults] = useState(false);
  const [clientSearchError, setClientSearchError] = useState(null);
  
  // Drag and drop sensors with activation delay for better UX
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // Filters
  const [filters, setFilters] = useState({
    pipelineStage: 'all',
    market: 'all',
    leadType: 'all',
    conversionStatus: 'all',
    prospectStatus: [],
    search: ''
  });
  const [prospectStageFilter, setProspectStageFilter] = useState(null);
  
  // Archive label filter: 'home', 'online', 'school', 'club', or null for all
  const [archiveLabelFilter, setArchiveLabelFilter] = useState(null);
  
  // Takeover label filter: 'home', 'online', 'school', 'club', or null for all
  const [takeoverLabelFilter, setTakeoverLabelFilter] = useState(null);

  // Reset label filter when switching between won/lost/takeover tabs
  useEffect(() => {
    if (activeTab === 'won' || activeTab === 'lost' || activeTab === 'takeover') {
      setArchiveLabelFilter(null);
      setTakeoverLabelFilter(null);
    }
  }, [activeTab]);
  const [sortConfig, setSortConfig] = useState({ field: 'follow_up_due_at', direction: 'asc' });

  // Date range filters
  const [dateFilters, setDateFilters] = useState({
    registrationComplete: { start: null, end: null },
    dateOfferedToTutors: { start: null, end: null },
    dateTutorClientPaired: { start: null, end: null },
    dateTrialFirstLesson: { start: null, end: null }
  });
  
  // Temporary date selections (not applied until user clicks Apply)
  const [tempDateFilters, setTempDateFilters] = useState({
    registrationComplete: { start: null, end: null },
    dateOfferedToTutors: { start: null, end: null },
    dateTutorClientPaired: { start: null, end: null },
    dateTrialFirstLesson: { start: null, end: null }
  });

  // Tutor filter state
  const [selectedTutorFilter, setSelectedTutorFilter] = useState(null);
  const [tutorFilterSearchQuery, setTutorFilterSearchQuery] = useState('');
  const [tutorFilterSearchResults, setTutorFilterSearchResults] = useState([]);
  const [showTutorFilterDropdown, setShowTutorFilterDropdown] = useState(false);
  const [isSearchingTutorFilter, setIsSearchingTutorFilter] = useState(false);
  const [highlightedTutorFilterIndex, setHighlightedTutorFilterIndex] = useState(-1);
  const tutorFilterDropdownRef = React.useRef(null);
  const tutorFilterSearchResultsRef = React.useRef([]);
  const highlightedTutorFilterIndexRef = React.useRef(-1);
  const previousTutorQueryRef = React.useRef('');
  const tutorSearchResultsRef = React.useRef([]);
  const highlightedTutorIndexRef = React.useRef(-1);
  
  // Column filter dropdown states
  const [showPipelineStageFilter, setShowPipelineStageFilter] = useState(false);
  const [showMarketFilter, setShowMarketFilter] = useState(false);
  const [showLeadTypeFilter, setShowLeadTypeFilter] = useState(false);
  const [showRegistrationDateFilter, setShowRegistrationDateFilter] = useState(false);
  const [showDateOfferedFilter, setShowDateOfferedFilter] = useState(false);
  const [showDatePairedFilter, setShowDatePairedFilter] = useState(false);
  const [showDateTrialFilter, setShowDateTrialFilter] = useState(false);
  
  // Refs for filter dropdowns to handle click outside
  const pipelineStageFilterRef = React.useRef(null);
  const marketFilterRef = React.useRef(null);
  const leadTypeFilterRef = React.useRef(null);
  const marketDropdownRefs = React.useRef({});
  const leadTypeDropdownRefs = React.useRef({});
  const statusDropdownRefs = React.useRef({});
  const registrationDateFilterRef = React.useRef(null);
  const dateOfferedFilterRef = React.useRef(null);
  const datePairedFilterRef = React.useRef(null);
  const dateTrialFilterRef = React.useRef(null);
  
  // Notes state
  const [notes, setNotes] = useState([]);
  const [editingNote, setEditingNote] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  
  // Prospect modal tabs state
  const [activeProspectMainTab, setActiveProspectMainTab] = useState('overview'); // 'overview', 'activity', 'booking'
  const [activeProspectTab, setActiveProspectTab] = useState('notes'); // Legacy: 'notes' or 'communications' (used within Activity tab)
  const [missiveCommunications, setMissiveCommunications] = useState([]); // Missive API communications
  const [loadingCommunications, setLoadingCommunications] = useState(false);
  const [loadingMissive, setLoadingMissive] = useState(false);
  const [syncingMissive, setSyncingMissive] = useState(false);
  const [expandedCommunication, setExpandedCommunication] = useState(null); // Track which communication is expanded
  const [fullBodies, setFullBodies] = useState({}); // Cache for fetched full message bodies: { conversationId: body }
  const [loadingBodyFor, setLoadingBodyFor] = useState(null); // Which conversation is currently loading body
  const [statusHistory, setStatusHistory] = useState([]);
  const [loadingStatusHistory, setLoadingStatusHistory] = useState(false);
  const [recommendedTutors, setRecommendedTutors] = useState([]);
  const [loadingRecommendedTutors, setLoadingRecommendedTutors] = useState(false);

  // Analytics time period filter
  const [analyticsTimePeriod, setAnalyticsTimePeriod] = useState('weekly'); // 'daily', 'weekly', 'monthly', 'annual'

  // Cohort retention analysis state
  const [cohortData, setCohortData] = useState(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortFilters, setCohortFilters] = useState({
    period: 'monthly', // 'monthly' or 'weekly'
    bookingType: 'all',
    leadType: 'all',
    market: 'all',
    leadSource: 'all', // heard_about field: Meta, Google, Friend, etc.
    startDate: null,
    endDate: null
  });
  const [cohortDetailModal, setCohortDetailModal] = useState({
    open: false,
    cohortPeriod: null,
    periodOffset: null,
    clients: [],
    loading: false
  });

  // Acquired registrations modal (for clicking on ACQ column)
  const [acquiredModal, setAcquiredModal] = useState({
    open: false,
    cohortPeriod: null,
    registrations: [],
    summary: null,
    loading: false,
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    filterBookingType: 'all'
  });

  // Bundles filters
  const [bundleFilters, setBundleFilters] = useState({
    market: 'all',
    source: 'all',
    bundleName: 'all',
    purchaseDate: { start: null, end: null }
  });
  
  // Bundle search query
  const [bundleSearchQuery, setBundleSearchQuery] = useState('');
  
  // Bundle sort config
  const [bundleSortConfig, setBundleSortConfig] = useState({ field: 'purchase_date', direction: 'desc' });
  
  // Bundle filter dropdown states
  const [showBundlePurchaseDateFilter, setShowBundlePurchaseDateFilter] = useState(false);
  const [showBundleSourceFilter, setShowBundleSourceFilter] = useState(false);
  const [showBundleNameFilter, setShowBundleNameFilter] = useState(false);
  const [showBundleMarketFilter, setShowBundleMarketFilter] = useState(false);
  
  // Refs for bundle filter dropdowns
  const bundlePurchaseDateFilterRef = React.useRef(null);
  const bundleSourceFilterRef = React.useRef(null);
  const bundleNameFilterRef = React.useRef(null);
  const bundleMarketFilterRef = React.useRef(null);
  
  // Temp date filters for bundle purchase date
  const [tempBundleDateFilters, setTempBundleDateFilters] = useState({
    purchaseDate: { start: null, end: null }
  });
  
  // Time range for bundles metrics cards (default YTD)
  const getYTDDateRange = () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1); // January 1st
    return { start: startOfYear, end: now };
  };
  
  const [bundlesMetricsTimeRange, setBundlesMetricsTimeRange] = useState(() => getYTDDateRange());
  
  // Pagination state for bundles table
  const [bundlesPage, setBundlesPage] = useState(1);
  const [bundlesPerPage, setBundlesPerPage] = useState(50); // Default 50, can go up to 100
  
  // Time range preset state for bundles metrics
  const [bundlesMetricsTimeRangePreset, setBundlesMetricsTimeRangePreset] = useState(() => {
    const now = new Date();
    const ytd = getYTDDateRange();
    // Check if current range matches YTD (will be set on mount)
    return 'ytd'; // Default to YTD
  });
  
  // Column width state
  // Bump this version when defaults change to reset all users to new defaults
  const COLUMN_WIDTHS_VERSION = 3;
  const defaultColumnWidths = {
    prospect: 148,
    pipelineStage: 180,
    market: 89,
    leadType: 149,
    registrationComplete: 189,
    dateOfferedToTutors: 102,
    dateTutorClientPaired: 109,
    dateTrialFirstLesson: 90,
    tutor: 138,
    trialFollowUp: 55,
    firstPaidLessonScheduled: 55,
    firstPaidLessonComplete: 55,
    clientSpend: 80,
    notes: 180
  };
  const [columnWidths, setColumnWidths] = useState(defaultColumnWidths);
  const [resizingColumn, setResizingColumn] = useState(null);
  
  // Use refs to track resize state for event listeners
  const resizeStateRef = React.useRef({
    columnKey: null,
    startX: 0,
    startWidth: 0
  });
  
  // Load column widths from user preferences
  useEffect(() => {
    const loadColumnWidths = async () => {
      try {
        const response = await fetch('/api/client-conversion-tracker/preferences/column-widths', {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.columnWidths && Object.keys(data.columnWidths).length > 0) {
            // Only apply saved widths if they match the current version
            if (data.version === COLUMN_WIDTHS_VERSION) {
              setColumnWidths(prev => ({ ...prev, ...data.columnWidths }));
            }
          }
        }
      } catch (error) {
        console.error('Error loading column widths:', error);
      }
    };
    
    loadColumnWidths();
  }, []);
  
  // Save column widths to user preferences (debounced)
  useEffect(() => {
    const saveTimeout = setTimeout(async () => {
      try {
        await fetch('/api/client-conversion-tracker/preferences/column-widths', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ columnWidths, version: COLUMN_WIDTHS_VERSION })
        });
      } catch (error) {
        console.error('Error saving column widths:', error);
      }
    }, 500); // Debounce by 500ms
    
    return () => clearTimeout(saveTimeout);
  }, [columnWidths]);
  
  // Handle column resize move - use ref to access current state
  const handleResizeMove = React.useCallback((e) => {
    const state = resizeStateRef.current;
    if (!state.columnKey) return;
    
    e.preventDefault();
    const diff = e.clientX - state.startX;
    const newWidth = Math.max(80, state.startWidth + diff); // Minimum width of 80px
    
    setColumnWidths(prev => ({
      ...prev,
      [state.columnKey]: newWidth
    }));
  }, []);
  
  // Handle column resize end
  const handleResizeEnd = React.useCallback(() => {
    resizeStateRef.current = {
      columnKey: null,
      startX: 0,
      startWidth: 0
    };
    setResizingColumn(null);
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);
  
  const resetColumnWidths = React.useCallback(() => {
    setColumnWidths(defaultColumnWidths);
  }, []);

  // Handle column resize start
  const handleResizeStart = React.useCallback((columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startWidth = columnWidths[columnKey] || 150;
    resizeStateRef.current = {
      columnKey,
      startX: e.clientX,
      startWidth
    };
    
    setResizingColumn(columnKey);
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [columnWidths, handleResizeMove, handleResizeEnd]);
  
  // Close filter dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tutorFilterDropdownRef.current && !tutorFilterDropdownRef.current.contains(event.target)) {
        setShowTutorFilterDropdown(false);
      }
      if (pipelineStageFilterRef.current && !pipelineStageFilterRef.current.contains(event.target)) {
        setShowPipelineStageFilter(false);
      }
      if (marketFilterRef.current && !marketFilterRef.current.contains(event.target)) {
        setShowMarketFilter(false);
      }
      if (leadTypeFilterRef.current && !leadTypeFilterRef.current.contains(event.target)) {
        setShowLeadTypeFilter(false);
      }
      if (registrationDateFilterRef.current && !registrationDateFilterRef.current.contains(event.target)) {
        setShowRegistrationDateFilter(false);
      }
      if (dateOfferedFilterRef.current && !dateOfferedFilterRef.current.contains(event.target)) {
        setShowDateOfferedFilter(false);
      }
      if (datePairedFilterRef.current && !datePairedFilterRef.current.contains(event.target)) {
        setShowDatePairedFilter(false);
      }
      if (dateTrialFilterRef.current && !dateTrialFilterRef.current.contains(event.target)) {
        setShowDateTrialFilter(false);
      }
      if (bundlePurchaseDateFilterRef.current && !bundlePurchaseDateFilterRef.current.contains(event.target)) {
        setShowBundlePurchaseDateFilter(false);
      }
      if (bundleSourceFilterRef.current && !bundleSourceFilterRef.current.contains(event.target)) {
        setShowBundleSourceFilter(false);
      }
      if (bundleNameFilterRef.current && !bundleNameFilterRef.current.contains(event.target)) {
        setShowBundleNameFilter(false);
      }
      if (bundleMarketFilterRef.current && !bundleMarketFilterRef.current.contains(event.target)) {
        setShowBundleMarketFilter(false);
      }
      // Close field dropdowns when clicking outside
      if (showMarketDropdown !== null) {
        const ref = marketDropdownRefs.current[showMarketDropdown];
        if (!ref || !ref.contains(event.target)) {
          setShowMarketDropdown(null);
        }
      }
      if (showLeadTypeDropdown !== null) {
        const ref = leadTypeDropdownRefs.current[showLeadTypeDropdown];
        if (!ref || !ref.contains(event.target)) {
          setShowLeadTypeDropdown(null);
        }
      }
      if (showStatusDropdown !== null) {
        const ref = statusDropdownRefs.current[showStatusDropdown];
        if (!ref || !ref.contains(event.target)) {
          setShowStatusDropdown(null);
        }
      }
    };

    if (showTutorFilterDropdown || showPipelineStageFilter || showMarketFilter || showLeadTypeFilter ||
        showRegistrationDateFilter || showDateOfferedFilter || showDatePairedFilter || showDateTrialFilter ||
        showBundlePurchaseDateFilter || showBundleSourceFilter || showBundleNameFilter || showBundleMarketFilter ||
        showMarketDropdown !== null || showLeadTypeDropdown !== null || showStatusDropdown !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTutorFilterDropdown, showPipelineStageFilter, showMarketFilter, showLeadTypeFilter,
      showRegistrationDateFilter, showDateOfferedFilter, showDatePairedFilter, showDateTrialFilter,
      showBundlePurchaseDateFilter, showBundleSourceFilter, showBundleNameFilter, showBundleMarketFilter,
      showMarketDropdown, showLeadTypeDropdown, showStatusDropdown,
      pipelineStageFilterRef, marketFilterRef, leadTypeFilterRef, registrationDateFilterRef,
      dateOfferedFilterRef, datePairedFilterRef, dateTrialFilterRef, tutorFilterDropdownRef,
      bundlePurchaseDateFilterRef, bundleSourceFilterRef, bundleNameFilterRef, bundleMarketFilterRef,
      marketDropdownRefs, leadTypeDropdownRefs, statusDropdownRefs]);

  const resetManualIntakeForm = () => {
    formState.resetManualIntakeForm();
    setManualIntakeErrors({});
    setManualIntakeServerError(null);
    setShowAdvancedIntake(false);
    clearClientSearch();
    setSelectedClientFromSearch(null);
    setShowClientSearchResults(false);
    setClientSearchError(null);
  };

  // Search for clients in TutorCruncher
  const searchClients = async (query) => {
    if (!query || query.length < 2) {
      setClientSearchResults([]);
      setShowClientSearchResults(false);
      return;
    }

    setIsSearchingClients(true);
    setClientSearchError(null);

    try {
      // Use the local entity-lists API for faster, more reliable search
      const response = await fetch(`/api/entity-lists/clients?search=${encodeURIComponent(query)}&limit=20`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.clients && data.clients.length > 0) {
        // Map the response to the expected format (camelCase field names)
        const clients = data.clients.map(client => ({
          id: client.client_id,
          client_id: client.client_id,
          firstName: client.first_name,
          lastName: client.last_name,
          email: client.email,
          phone: client.mobile || client.phone
        }));
        setClientSearchResults(clients);
        setShowClientSearchResults(true);
      } else {
        setClientSearchResults([]);
        setShowClientSearchResults(false);
      }
    } catch (error) {
      console.error('Error searching clients:', error);
      setClientSearchError('Failed to search clients');
      setClientSearchResults([]);
      setShowClientSearchResults(false);
    } finally {
      setIsSearchingClients(false);
    }
  };

  // Handle client search input change
  const handleClientSearchChange = (value) => {
    setClientSearchQuery(value);
    searchClients(value);
  };

  // Select a client from search results
  const selectClientFromSearch = (client) => {
    setSelectedClientFromSearch(client);
    setClientSearchQuery(`${client.firstName} ${client.lastName} (${client.email})`);
    setShowClientSearchResults(false);
    
    // Auto-fill form with client data
    setManualIntakeForm((prev) => ({
      ...prev,
      first_name: client.firstName || prev.first_name,
      last_name: client.lastName || prev.last_name,
      email: client.email || prev.email,
      phone: client.phone ? client.phone.replace(/^\+1/, '') : prev.phone,
    }));

    // Check if email matches existing client in our database
    if (client.email) {
      const existingClient = clients.find(c => c.email && c.email.toLowerCase() === client.email.toLowerCase());
      if (existingClient) {
        setClientSearchError(`⚠️ Client with email ${client.email} already exists in the tracker. They will still go through the pairing process.`);
      }
    }
  };

  // Clean up URL parameter after initial load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('reset') === 'pipeline' || urlParams.get('reset') === 'prospects') {
      // Remove the reset parameter from URL without reloading
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, []);

  // Sync refs with state so we can access latest values in event handlers
  useEffect(() => {
    tutorSearchResultsRef.current = tutorSearchResults;
    console.log('Updated tutorSearchResultsRef:', tutorSearchResults.length, 'results');
  }, [tutorSearchResults]);

  useEffect(() => {
    highlightedTutorIndexRef.current = highlightedTutorIndex;
    console.log('Updated highlightedTutorIndexRef:', highlightedTutorIndex);
  }, [highlightedTutorIndex]);

  // Sync tutor filter refs with state
  useEffect(() => {
    tutorFilterSearchResultsRef.current = tutorFilterSearchResults;
  }, [tutorFilterSearchResults]);

  useEffect(() => {
    highlightedTutorFilterIndexRef.current = highlightedTutorFilterIndex;
  }, [highlightedTutorFilterIndex]);

  // Handle Escape key to close dropdown when open
  useEffect(() => {
    const handleEscape = (e) => {
      if ((e.key === 'Escape' || e.key === 'Esc') && showTutorDropdown) {
        console.log('Document-level Escape handler: Closing dropdown for', showTutorDropdown);
        e.preventDefault();
        e.stopPropagation();
        setShowTutorDropdown(null);
        setTutorSearchQuery('');
        setTutorSearchResults([]);
        setHighlightedTutorIndex(-1);
        previousTutorQueryRef.current = '';
      }
    };

    if (showTutorDropdown) {
      console.log('Adding document-level Escape listener for dropdown:', showTutorDropdown);
      document.addEventListener('keydown', handleEscape);
      return () => {
        console.log('Removing document-level Escape listener');
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showTutorDropdown]);

  // Scroll highlighted tutor item into view when navigating with arrow keys
  useEffect(() => {
    if (highlightedTutorIndex >= 0 && showTutorDropdown) {
      // Find the dropdown container for the currently active prospect
      const dropdownContainer = document.querySelector(`[data-tutor-dropdown="${showTutorDropdown}"]`);
      if (dropdownContainer) {
        const highlightedElement = dropdownContainer.querySelector(`[data-tutor-index="${highlightedTutorIndex}"]`);
        if (highlightedElement) {
          highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  }, [highlightedTutorIndex, showTutorDropdown]);

  // Scroll highlighted tutor filter item into view when navigating with arrow keys
  useEffect(() => {
    if (highlightedTutorFilterIndex >= 0 && showTutorFilterDropdown) {
      const highlightedElement = document.querySelector(`[data-tutor-filter-index="${highlightedTutorFilterIndex}"]`);
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [highlightedTutorFilterIndex, showTutorFilterDropdown]);

  useEffect(() => {
    fetchAllData();
  }, []);
  
  // Sync time range preset when time range changes
  useEffect(() => {
    const now = new Date();
    const ytd = getYTDDateRange();
    const isYTD = bundlesMetricsTimeRange.start?.getTime() === ytd.start.getTime() && 
                  bundlesMetricsTimeRange.end?.getTime() === ytd.end.getTime();
    const isAll = bundlesMetricsTimeRange.start === null && bundlesMetricsTimeRange.end === null;
    
    if (isYTD && bundlesMetricsTimeRangePreset !== 'ytd') {
      setBundlesMetricsTimeRangePreset('ytd');
    } else if (isAll && bundlesMetricsTimeRangePreset !== 'all') {
      setBundlesMetricsTimeRangePreset('all');
    } else if (!isYTD && !isAll && bundlesMetricsTimeRangePreset !== 'custom') {
      setBundlesMetricsTimeRangePreset('custom');
    }
  }, [bundlesMetricsTimeRange.start, bundlesMetricsTimeRange.end]);
  
  // Reset page when filters or sorting change
  useEffect(() => {
    setBundlesPage(1);
  }, [bundleFilters.market, bundleFilters.source, bundleFilters.bundleName, bundleFilters.purchaseDate, bundleSortConfig.field, bundleSortConfig.direction]);
  
  // Ensure page doesn't exceed total pages when filters change
  useEffect(() => {
    if (activeTab === 'bundles') {
      const parsedBundles = bundles.map(b => {
        const bundleTotal = b.bundle_total != null ? parseFloat(b.bundle_total) : 0;
        const creditTotal = b.credit_total != null ? parseFloat(b.credit_total) : 0;
        const discountPct = b.discount_percentage != null ? parseInt(b.discount_percentage) : 0;
        return {
          ...b,
          bundle_total: isNaN(bundleTotal) ? 0 : bundleTotal,
          credit_total: isNaN(creditTotal) ? 0 : creditTotal,
          discount_percentage: isNaN(discountPct) ? 0 : discountPct
        };
      });
      
      let filtered = parsedBundles;
      if (bundleFilters.market !== 'all') {
        filtered = filtered.filter(b => b.market === bundleFilters.market);
      }
      if (bundleFilters.source !== 'all') {
        filtered = filtered.filter(b => b.source === bundleFilters.source);
      }
      if (bundleFilters.bundleName !== 'all') {
        filtered = filtered.filter(b => b.bundle_name && b.bundle_name === bundleFilters.bundleName);
      }
      if (bundleFilters.purchaseDate.start || bundleFilters.purchaseDate.end) {
        filtered = filtered.filter(b => {
          if (!b.purchase_date) return false;
          const purchaseDate = new Date(b.purchase_date);
          if (bundleFilters.purchaseDate.start) {
            const startDate = new Date(bundleFilters.purchaseDate.start);
            startDate.setHours(0, 0, 0, 0);
            if (purchaseDate < startDate) return false;
          }
          if (bundleFilters.purchaseDate.end) {
            const endDate = new Date(bundleFilters.purchaseDate.end);
            endDate.setHours(23, 59, 59, 999);
            if (purchaseDate > endDate) return false;
          }
          return true;
        });
      }
      
      const totalPages = Math.ceil(filtered.length / bundlesPerPage);
      if (bundlesPage > totalPages && totalPages > 0) {
        setBundlesPage(totalPages);
      }
    }
  }, [bundles, bundleFilters, bundlesPerPage, activeTab]);

useEffect(() => {
  if (!trackerBanner) return;
  const timer = setTimeout(() => setTrackerBanner(null), 6000);
  return () => clearTimeout(timer);
}, [trackerBanner]);

  const getAuthHeaders = (extra = {}) => {
    return {
      'Content-Type': 'application/json',
      ...extra,
    };
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      // Fetch basic client data
      const [clientsRes, archivedRes, pipelineRes, bundlesRes] = await Promise.all([
        fetch('/api/client-conversion-tracker', { credentials: 'include' }).then(res => res.json()),
        fetch('/api/client-conversion-tracker/archive', { credentials: 'include' }).then(res => res.json()).catch(() => []),
        fetch('/api/client-conversion-tracker/pipeline-stages', { credentials: 'include' }).then(res => res.json()),
        fetch('/api/client-conversion-tracker/bundles', { credentials: 'include' }).then(res => res.json()).catch(() => [])
      ]);
      
      setClients(Array.isArray(clientsRes) ? clientsRes : []);
      setArchivedClients(Array.isArray(archivedRes) ? archivedRes : []);
      setPipelineStages(Array.isArray(pipelineRes) ? pipelineRes : []);
      const bundlesArray = Array.isArray(bundlesRes) ? bundlesRes : [];
      console.log(`📦 Fetched ${bundlesArray.length} bundles from API`);
      if (bundlesArray.length > 0) {
        console.log('📦 Sample bundle data:', {
          bundle_name: bundlesArray[0].bundle_name,
          bundle_total: bundlesArray[0].bundle_total,
          credit_total: bundlesArray[0].credit_total,
          bundle_total_type: typeof bundlesArray[0].bundle_total,
          credit_total_type: typeof bundlesArray[0].credit_total
        });
      }
      setBundles(bundlesArray);
      
      // Fetch analytics data
      const analyticsRes = await fetch('/api/client-conversion-tracker/analytics/conversions-by-lead-type', { headers: getAuthHeaders(), credentials: 'include' }).then(res => res.json()).catch(() => ({ data: [] }));
      const marketRes = await fetch('/api/client-conversion-tracker/analytics/conversions-by-market', { headers: getAuthHeaders(), credentials: 'include' }).then(res => res.json()).catch(() => ({ data: [] }));
      const weeklyRes = await fetch('/api/client-conversion-tracker/analytics/weekly-stats', { headers: getAuthHeaders(), credentials: 'include' }).then(res => res.json()).catch(() => ({ data: [] }));
      
      // Process lead type data to match Google Sheets format (No/Yes columns)
      const leadTypeData = processLeadTypeData(clients, analyticsRes.data || []);
      
      // Process market data to match Google Sheets format (No/Yes columns)
      const marketData = processMarketData(clients, marketRes.data || []);
      
      // Process weekly stats with year-over-year comparisons
      const weeklyData = processWeeklyStats(clients, weeklyRes.data || []);
      
      setAnalytics({
        leadType: leadTypeData,
        market: marketData,
        weeklyStats: weeklyData,
        yearOverYear: []
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh analytics when on Analytics tab and when tab becomes visible
  useEffect(() => {
    if (activeTab !== 'analytics') return;

    // Refresh analytics by calling fetchAllData which will update everything
    const refreshAnalytics = async () => {
      try {
        await fetchAllData();
      } catch (error) {
        console.error('Error refreshing analytics:', error);
      }
    };

    // Refresh immediately when tab becomes active
    refreshAnalytics();

    // TEMPORARILY DISABLED: Set up periodic refresh every 30 seconds when Analytics tab is active
    // const intervalId = setInterval(refreshAnalytics, 30000);
    const intervalId = null;

    // Refresh when tab becomes visible (user switches back to browser)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeTab === 'analytics') {
        refreshAnalytics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeTab]);

  // Fetch cohort retention data
  const fetchCohortData = async (filters = cohortFilters) => {
    setCohortLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('period', filters.period);
      if (filters.bookingType !== 'all') params.append('bookingType', filters.bookingType);
      if (filters.leadType !== 'all') params.append('leadType', filters.leadType);
      if (filters.market !== 'all') params.append('market', filters.market);
      if (filters.leadSource !== 'all') params.append('leadSource', filters.leadSource);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(
        `/api/client-conversion-tracker/analytics/cohort-retention?${params.toString()}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch cohort data');
      }

      const data = await response.json();
      setCohortData(data);
    } catch (error) {
      console.error('Error fetching cohort data:', error);
      setCohortData(null);
    } finally {
      setCohortLoading(false);
    }
  };

  // Handle cohort filter changes
  const handleCohortFilterChange = (newFilters) => {
    const updatedFilters = { ...cohortFilters, ...newFilters };
    setCohortFilters(updatedFilters);
    fetchCohortData(updatedFilters);
  };

  // Fetch cohort cell detail (individual clients)
  const handleCohortCellClick = async (cohortPeriod, periodOffset) => {
    setCohortDetailModal(prev => ({
      ...prev,
      open: true,
      cohortPeriod,
      periodOffset,
      clients: [],
      loading: true
    }));

    try {
      const params = new URLSearchParams();
      params.append('cohortPeriod', cohortPeriod);
      params.append('periodOffset', periodOffset);
      params.append('period', cohortFilters.period);
      if (cohortFilters.bookingType !== 'all') params.append('bookingType', cohortFilters.bookingType);
      if (cohortFilters.leadType !== 'all') params.append('leadType', cohortFilters.leadType);
      if (cohortFilters.market !== 'all') params.append('market', cohortFilters.market);
      if (cohortFilters.leadSource !== 'all') params.append('leadSource', cohortFilters.leadSource);

      const response = await fetch(
        `/api/client-conversion-tracker/analytics/cohort-retention/clients?${params.toString()}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch cohort clients');
      }

      const data = await response.json();
      setCohortDetailModal(prev => ({
        ...prev,
        clients: data.clients || [],
        loading: false
      }));
    } catch (error) {
      console.error('Error fetching cohort clients:', error);
      setCohortDetailModal(prev => ({
        ...prev,
        clients: [],
        loading: false
      }));
    }
  };

  // Close cohort detail modal
  const closeCohortDetailModal = () => {
    setCohortDetailModal({
      open: false,
      cohortPeriod: null,
      periodOffset: null,
      clients: [],
      loading: false
    });
  };

  // Fetch acquired registrations for cohort (when clicking ACQ column)
  const handleAcquiredClick = async (cohortPeriod) => {
    setAcquiredModal(prev => ({
      ...prev,
      open: true,
      cohortPeriod,
      loading: true,
      registrations: [],
      summary: null
    }));

    try {
      const params = new URLSearchParams({
        cohortPeriod,
        period: cohortFilters.period
      });
      // Add filter parameters
      if (cohortFilters.bookingType !== 'all') params.append('bookingType', cohortFilters.bookingType);
      if (cohortFilters.leadType !== 'all') params.append('leadType', cohortFilters.leadType);
      if (cohortFilters.market !== 'all') params.append('market', cohortFilters.market);
      if (cohortFilters.leadSource !== 'all') params.append('leadSource', cohortFilters.leadSource);

      const response = await fetch(`/api/client-conversion-tracker/analytics/cohort-retention/acquired?${params}`);
      if (!response.ok) throw new Error('Failed to fetch acquired registrations');

      const data = await response.json();
      setAcquiredModal(prev => ({
        ...prev,
        registrations: data.registrations,
        summary: data.summary,
        loading: false
      }));
    } catch (error) {
      console.error('Error fetching acquired registrations:', error);
      setAcquiredModal(prev => ({
        ...prev,
        registrations: [],
        summary: null,
        loading: false
      }));
    }
  };

  // Update acquired modal state (for filtering, sorting, searching)
  const updateAcquiredModal = (updates) => {
    setAcquiredModal(prev => ({ ...prev, ...updates }));
  };

  // Close acquired modal
  const closeAcquiredModal = () => {
    setAcquiredModal({
      open: false,
      cohortPeriod: null,
      registrations: [],
      summary: null,
      loading: false,
      search: '',
      sortBy: 'created_at',
      sortOrder: 'desc',
      filterBookingType: 'all'
    });
  };

const handleManualFieldChange = (field, value) => {
  if (field === 'phone' || field === 'mobile') {
    const normalized = normalizeUsPhoneDigits(value);
    setManualIntakeForm((prev) => ({
      ...prev,
      [field]: normalized,
    }));
    setManualIntakeErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    return;
  }

  setManualIntakeForm((prev) => ({
    ...prev,
    [field]: value,
  }));
  setManualIntakeErrors((prev) => {
    if (!prev[field]) return prev;
    const next = { ...prev };
    delete next[field];
    return next;
  });
};

  const handleManualAddressChange = (field, value) => {
    setManualIntakeForm((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        [field]: value,
      },
    }));
  };

  const handleManualExtraFieldChange = (field, value) => {
    setManualIntakeForm((prev) => ({
      ...prev,
      extra_attrs: {
        ...prev.extra_attrs,
        [field]: value,
      },
    }));
  };

  const handleNotificationToggle = (value) => {
    setManualIntakeForm((prev) => {
      const exists = prev.received_notifications.includes(value);
      return {
        ...prev,
        received_notifications: exists
          ? prev.received_notifications.filter((item) => item !== value)
          : [...prev.received_notifications, value],
      };
    });
  };

  const handleManualIntakeSubmit = async () => {
    const validationErrors = {};

    if (!manualIntakeForm.first_name || !manualIntakeForm.first_name.trim()) {
      validationErrors.first_name = 'First name is required';
    }
    if (!manualIntakeForm.last_name || !manualIntakeForm.last_name.trim()) {
      validationErrors.last_name = 'Last name is required';
    }
    if (!manualIntakeForm.email || !manualIntakeForm.email.trim()) {
      validationErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualIntakeForm.email.trim())) {
      validationErrors.email = 'Enter a valid email address';
    }
  if (!manualIntakeForm.phone || manualIntakeForm.phone.length < MAX_US_PHONE_DIGITS) {
    validationErrors.phone = 'Enter a 10-digit phone number';
    }

    setManualIntakeErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSavingManualIntake(true);
  setManualIntakeServerError(null);

    try {
      const payload = {
        ...manualIntakeForm,
        address: { ...manualIntakeForm.address },
        labels: Array.isArray(manualIntakeForm.labels) ? manualIntakeForm.labels : [],
        extra_attrs: manualIntakeForm.extra_attrs || {},
        received_notifications: manualIntakeForm.received_notifications || [],
      };

    const normalizedPhone = manualIntakeForm.phone ? `${PHONE_COUNTRY_CODE}${manualIntakeForm.phone}` : '';
    const normalizedMobile = manualIntakeForm.mobile ? `${PHONE_COUNTRY_CODE}${manualIntakeForm.mobile}` : '';

    if (normalizedPhone) {
      payload.phone = normalizedPhone;
    } else {
      delete payload.phone;
    }

    if (normalizedMobile) {
      payload.mobile = normalizedMobile;
    } else {
      delete payload.mobile;
    }

      if (!payload.pipeline_stage_id) {
        delete payload.pipeline_stage_id;
      }
      if (!payload.follow_up_due_at) {
        delete payload.follow_up_due_at;
      }

      const response = await fetch('/api/client-conversion-tracker/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to create prospect');
      }

      await fetchAllData();
      resetManualIntakeForm();
      setShowManualIntakeModal(false);
    const contactSummary = {
      name: `${manualIntakeForm.first_name || ''} ${manualIntakeForm.last_name || ''}`.trim(),
      email: manualIntakeForm.email || '',
      phone: manualIntakeForm.phone ? `${PHONE_COUNTRY_CODE}${manualIntakeForm.phone}` : '',
    };

    setTrackerBanner({
      kind: 'success',
      title: 'Prospect created in TutorCruncher',
      message: `${contactSummary.name || contactSummary.email || 'New prospect'} synced successfully.`,
      meta: {
        email: contactSummary.email,
        phone: contactSummary.phone,
        tcClientId: data?.tcClientId,
      },
    });
    } catch (error) {
      console.error('Error creating manual prospect:', error);
      setManualIntakeServerError(error.message || 'Failed to create prospect');
    } finally {
      setIsSavingManualIntake(false);
    }
  };

  const requestDeleteProspect = () => {
    if (!selectedProspect?.id) {
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot delete prospect',
        message: 'Prospect identifier is missing.',
      });
      return;
    }

    const prospectName = `${selectedProspect.first_name || ''} ${selectedProspect.last_name || ''}`.trim() || 'this prospect';

    setConfirmDeleteState({
      open: true,
      loading: false,
      prospectName,
    });
  };

  const handleConfirmDelete = async () => {
    if (!selectedProspect?.id) {
      setConfirmDeleteState((prev) => ({ ...prev, open: false, loading: false }));
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot delete prospect',
        message: 'Prospect identifier is missing.',
      });
      return;
    }

    setConfirmDeleteState((prev) => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/client-conversion-tracker/${selectedProspect.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to delete prospect');
      }

      setConfirmDeleteState({ open: false, loading: false, prospectName: '' });
      setShowProspectModal(false);
      setSelectedProspect(null);
      await fetchAllData();

      const deletedMeta = data?.client || {};
      const deletedName = `${deletedMeta.first_name || ''} ${deletedMeta.last_name || ''}`.trim() || confirmDeleteState.prospectName;

      setTrackerBanner({
        kind: 'warning',
        title: 'Prospect removed from pipeline',
        message: `${deletedName} will no longer appear in the Client Conversion Tracker. Their TutorCruncher profile was left untouched.`,
        meta: deletedMeta.email || deletedMeta.client_id
          ? {
              email: deletedMeta.email,
              tcClientId: deletedMeta.client_id,
            }
          : undefined,
      });
    } catch (error) {
      console.error('Error deleting prospect:', error);
      setConfirmDeleteState((prev) => ({ ...prev, loading: false }));
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to delete prospect',
        message: error.message || 'An unexpected error occurred while deleting the prospect.',
      });
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteState({ open: false, loading: false, prospectName: '' });
  };

  const handleMarkAsWon = () => {
    if (!selectedProspect?.id) {
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot mark as Won',
        message: 'Prospect identifier is missing.',
      });
      return;
    }

    if (selectedProspect.client_status !== 'prospect') {
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot mark as Won',
        message: 'Only prospects can be marked as Won.',
      });
      return;
    }

    const prospectName = `${selectedProspect.first_name || ''} ${selectedProspect.last_name || ''}`.trim() || 'this prospect';
    setConfirmWonState({
      open: true,
      loading: false,
      prospectName,
      prospectId: selectedProspect.id,
      showForceOption: false,
      errorMessage: '',
    });
  };

  const handleConfirmMarkAsWon = async (forceOverride = false) => {
    if (!confirmWonState.prospectId) {
      setConfirmWonState({ open: false, loading: false, prospectName: '', prospectId: null, showForceOption: false, errorMessage: '' });
      return;
    }

    setConfirmWonState(prev => ({ ...prev, loading: true, showForceOption: false, errorMessage: '' }));

    try {
      // Use the new prospect_status endpoint instead of the old mark-won endpoint
      const response = await fetch(`/api/client-conversion-tracker/${confirmWonState.prospectId}/prospect-status`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          prospect_status: 'Won',
          change_reason: forceOverride ? 'Manually marked as Won (admin override)' : 'Manually marked as Won',
          force: forceOverride
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Check if this error allows force override
        if (data?.canForce) {
          setConfirmWonState(prev => ({
            ...prev,
            loading: false,
            showForceOption: true,
            errorMessage: data?.error || 'First paid lesson not completed.'
          }));
          return;
        }
        throw new Error(data?.error || data?.details || 'Failed to mark prospect as Won');
      }

      setConfirmWonState({ open: false, loading: false, prospectName: '', prospectId: null, showForceOption: false, errorMessage: '' });

      setTrackerBanner({
        kind: 'success',
        title: 'Prospect marked as Won',
        message: `${confirmWonState.prospectName} has been marked as Won and moved to the Won tab.`,
      });

      // Close modal and refresh data
      setShowProspectModal(false);
      setSelectedProspect(null);
      await fetchAllData();

      // Switch to Won tab to show the updated prospect
      setActiveTab('won');
    } catch (error) {
      console.error('Error marking prospect as Won:', error);
      // Close the confirmation modal on error so user sees the banner clearly
      setConfirmWonState({ open: false, loading: false, prospectName: '', prospectId: null, showForceOption: false, errorMessage: '' });
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot mark as Won',
        message: error.message || 'An unexpected error occurred while marking the prospect as Won.',
      });
    }
  };

  const handleCancelMarkAsWon = () => {
    setConfirmWonState({ open: false, loading: false, prospectName: '', prospectId: null, showForceOption: false, errorMessage: '' });
  };

  const handleMarkAsLost = () => {
    if (!selectedProspect?.id) {
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot mark as Lost',
        message: 'Prospect identifier is missing.',
      });
      return;
    }

    if (selectedProspect.client_status !== 'prospect') {
      setTrackerBanner({
        kind: 'error',
        title: 'Cannot mark as Lost',
        message: 'Only prospects can be marked as Lost.',
      });
      return;
    }

    const prospectName = `${selectedProspect.first_name || ''} ${selectedProspect.last_name || ''}`.trim() || 'this prospect';
    setConfirmLostState({
      open: true,
      loading: false,
      prospectName,
      prospectId: selectedProspect.id,
    });
  };

  const handleConfirmMarkAsLost = async () => {
    if (!confirmLostState.prospectId) {
      setConfirmLostState({ open: false, loading: false, prospectName: '', prospectId: null });
      return;
    }

    setConfirmLostState(prev => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/client-conversion-tracker/${confirmLostState.prospectId}/mark-lost`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || data?.details || 'Failed to mark prospect as Lost');
      }

      setConfirmLostState({ open: false, loading: false, prospectName: '', prospectId: null });

      setTrackerBanner({
        kind: 'warning',
        title: 'Prospect marked as Lost',
        message: `${confirmLostState.prospectName} has been marked as dormant and moved to archive.`,
      });

      // Close modal and refresh data
      setShowProspectModal(false);
      setSelectedProspect(null);
      await fetchAllData();
      
      // Switch to Lost tab to show the updated prospect
      setActiveTab('lost');
    } catch (error) {
      console.error('Error marking prospect as Lost:', error);
      setConfirmLostState(prev => ({ ...prev, loading: false }));
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to mark as Lost',
        message: error.message || 'An unexpected error occurred while marking the prospect as Lost.',
      });
    }
  };

  const handleCancelMarkAsLost = () => {
    setConfirmLostState({ open: false, loading: false, prospectName: '', prospectId: null });
  };

  const handlePipelineStageUpdate = async (clientId, newStageId) => {
    // Store the original pipeline_stage_id for potential revert
    const originalClient = clients.find(c => 
      c.id === clientId || c.client_id === clientId
    );
    const originalStageId = originalClient?.pipeline_stage_id;

    // Optimistically update the UI immediately for smooth UX
    setClients(prevClients =>
      prevClients.map(client =>
        (client.id === clientId || client.client_id === clientId)
          ? { ...client, pipeline_stage_id: newStageId }
          : client
      )
    );

    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/pipeline-stage`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ pipelineStageId: newStageId })
      });
      
      if (response.ok) {
        // Silently refresh data in the background after a short delay
        // This ensures we have the latest data without causing a flash
        setTimeout(() => {
          fetchAllData();
        }, 500);
      } else {
        // If the API call failed, revert the optimistic update and show error
        const errorData = await response.json().catch(() => ({}));
        setClients(prevClients =>
          prevClients.map(client =>
            (client.id === clientId || client.client_id === clientId)
              ? { ...client, pipeline_stage_id: originalStageId } // Revert to original
              : client
          )
        );
        setTrackerBanner({
          kind: 'error',
          title: 'Failed to update pipeline stage',
          message: errorData?.error || 'An unexpected error occurred while updating the pipeline stage.',
        });
      }
    } catch (error) {
      console.error('Error updating pipeline stage:', error);
      // Revert optimistic update on error
      setClients(prevClients =>
        prevClients.map(client =>
          (client.id === clientId || client.client_id === clientId)
            ? { ...client, pipeline_stage_id: originalStageId } // Revert to original
            : client
        )
      );
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to update pipeline stage',
        message: error.message || 'An unexpected error occurred while updating the pipeline stage.',
      });
    }
  };

  const handleProspectStatusUpdate = async (clientId, newStatus, changeReason = null) => {
    // Store the original prospect_status for potential revert
    const originalClient = clients.find(c => 
      c.id === clientId || c.client_id === clientId
    );
    const originalStatus = originalClient?.prospect_status || 'Need To Contact';

    // Optimistically update the UI immediately for smooth UX
    setClients(prevClients =>
      prevClients.map(client =>
        (client.id === clientId || client.client_id === clientId)
          ? { ...client, prospect_status: newStatus }
          : client
      )
    );

    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/prospect-status`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ 
          prospect_status: newStatus,
          change_reason: changeReason
        })
      });
      
      if (response.ok) {
        // Silently refresh data in the background after a short delay
        setTimeout(() => {
          fetchAllData();
        }, 500);
      } else {
        // If the API call failed, revert the optimistic update and show error
        const errorData = await response.json().catch(() => ({}));
        setClients(prevClients =>
          prevClients.map(client =>
            (client.id === clientId || client.client_id === clientId)
              ? { ...client, prospect_status: originalStatus } // Revert to original
              : client
          )
        );
        setTrackerBanner({
          kind: 'error',
          title: 'Failed to update prospect status',
          message: errorData?.error || 'An unexpected error occurred while updating the prospect status.',
        });
      }
    } catch (error) {
      console.error('Error updating prospect status:', error);
      // Revert optimistic update on error
      setClients(prevClients =>
        prevClients.map(client =>
          (client.id === clientId || client.client_id === clientId)
            ? { ...client, prospect_status: originalStatus } // Revert to original
            : client
        )
      );
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to update prospect status',
        message: error.message || 'An unexpected error occurred while updating the prospect status.',
      });
    }
  };

  const handleReviveProspect = async (clientId, newStatus = 'Need To Contact') => {
    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/revive`, {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ prospect_status: newStatus })
      });
      
      if (response.ok) {
        setTrackerBanner({
          kind: 'success',
          title: 'Prospect revived',
          message: `Prospect has been revived and moved to ${newStatus} status.`,
        });
        
        // Refresh data to get updated client lists
        await fetchAllData();
        
        // Switch to Prospects tab to show the revived prospect
        setActiveTab('prospects');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTrackerBanner({
          kind: 'error',
          title: 'Failed to revive prospect',
          message: errorData?.error || 'An unexpected error occurred while reviving the prospect.',
        });
      }
    } catch (error) {
      console.error('Error reviving prospect:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to revive prospect',
        message: error.message || 'An unexpected error occurred while reviving the prospect.',
      });
    }
  };

  const updateMarket = async (clientId, market) => {
    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/market`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ market })
      });
      
      if (response.ok) {
        // Update the client in the local state immediately for better UX
        setClients(prevClients =>
          prevClients.map(client =>
            client.id === clientId || client.client_id === clientId
              ? { ...client, market }
              : client
          )
        );
        fetchAllData(); // Refresh the list
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || 'Failed to update market');
      }
    } catch (error) {
      console.error('Error updating market:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to update market',
        message: error.message || 'An unexpected error occurred while updating the market.',
      });
    }
  };

  const updateLeadType = async (clientId, leadType) => {
    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/lead-type`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({ lead_type: leadType })
      });
      
      if (response.ok) {
        // Update the client in the local state immediately for better UX
        setClients(prevClients => 
          prevClients.map(client => 
            client.id === clientId 
              ? { ...client, lead_type: leadType }
              : client
          )
        );
      }
    } catch (error) {
      console.error('Error updating lead type:', error);
    }
  };


  const searchTutors = async (query) => {
    if (!query || query.length < 2) {
      setTutorSearchResults([]);
      return;
    }

    try {
      const response = await fetch(`/api/contractors/search/autocomplete?q=${encodeURIComponent(query)}&limit=10`, {
        credentials: 'include'
      });
      if (response.ok) {
        const tutors = await response.json();
        setTutorSearchResults(tutors);
      } else {
        console.error('Tutor search failed:', response.status, response.statusText);
        setTutorSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching tutors:', error);
      setTutorSearchResults([]);
    }
  };

  // Search clients for bundle creation (uses local database for faster, more reliable search)
  const searchClientsForBundle = async (query) => {
    if (!query || query.length < 2) {
      setClientSearchResults([]);
      return;
    }

    setIsSearchingClients(true);
    try {
      // Use the local entity-lists API which searches the synced clients table
      const response = await fetch(`/api/entity-lists/clients?search=${encodeURIComponent(query)}&limit=20`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Map the response to the expected format for the dropdown
        const clients = (data.clients || []).map(client => ({
          id: client.client_id, // Use client_id as the primary identifier for TC operations
          client_id: client.client_id,
          first_name: client.first_name,
          last_name: client.last_name,
          email: client.email,
          phone: client.mobile || client.phone,
          name: `${client.first_name || ''} ${client.last_name || ''}`.trim()
        }));
        setClientSearchResults(clients);
      } else {
        console.error('Client search failed:', response.status, response.statusText);
        setClientSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching clients:', error);
      setClientSearchResults([]);
    } finally {
      setIsSearchingClients(false);
    }
  };

  // Create bundle handler
  const handleCreateBundle = async () => {
    if (!bundleForm.selectedClient) {
      setTrackerBanner({
        kind: 'error',
        title: 'Client Required',
        message: 'Please select a client before creating a bundle.',
      });
      return;
    }

    if (!bundleForm.bundleName || !bundleForm.numberOfLessons || !bundleForm.lessonRate) {
      setTrackerBanner({
        kind: 'error',
        title: 'Missing Required Fields',
        message: 'Please fill in bundle name, number of lessons, and lesson rate.',
      });
      return;
    }

    setIsCreatingBundle(true);
    try {
      const response = await fetch('/api/client-conversion-tracker/bundles/create', {
        method: 'POST',
        headers: getAuthHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          clientId: bundleForm.selectedClient.id,
          bundleName: bundleForm.bundleName,
          numberOfLessons: parseFloat(bundleForm.numberOfLessons),
          lessonRate: parseFloat(bundleForm.lessonRate),
          discountPercentage: parseFloat(bundleForm.discountPercentage || 0),
          paymentMethod: bundleForm.paymentMethod || 'auto_charge'
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Show payment method-specific message
        const paymentMethodLabels = {
          'auto_charge': 'Auto Charge',
          'cash': 'Manual Payment',
          'send_request': 'Payment Request Sent'
        };
        
        setTrackerBanner({
          kind: 'success',
          title: 'Bundle Created Successfully',
          message: data.message || `Bundle has been created. Payment method: ${paymentMethodLabels[data.paymentMethod] || 'Auto Charge'}. ${data.paymentStatus === 'paid' ? 'Credits added immediately.' : 'Credits will be added after payment processes.'}`,
        });
        
        // Reset form and close modal
        setBundleForm({
          clientSearch: '',
          selectedClient: null,
          bundleName: '',
          numberOfLessons: '',
          lessonRate: '',
          discountPercentage: '',
          paymentMethod: 'auto_charge',
        });
        setClientSearchResults([]);
        setShowCreateBundleModal(false);
        
        // Refresh bundles list
        await fetchAllData();
      } else {
        throw new Error(data.error || data.message || 'Failed to create bundle');
      }
    } catch (error) {
      console.error('Error creating bundle:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to Create Bundle',
        message: error.message || 'An unexpected error occurred while creating the bundle.',
      });
    } finally {
      setIsCreatingBundle(false);
    }
  };

  // Search tutors for filter dropdown
  const searchTutorsForFilter = async (query) => {
    if (!query || query.length < 2) {
      setTutorFilterSearchResults([]);
      return;
    }

    setIsSearchingTutorFilter(true);
    try {
      const response = await fetch(`/api/contractors/search/autocomplete?q=${encodeURIComponent(query)}&limit=10`, {
        credentials: 'include'
      });
      if (response.ok) {
        const tutors = await response.json();
        setTutorFilterSearchResults(tutors);
      } else {
        console.error('Tutor filter search failed:', response.status, response.statusText);
        setTutorFilterSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching tutors for filter:', error);
      setTutorFilterSearchResults([]);
    } finally {
      setIsSearchingTutorFilter(false);
    }
  };

  // Handle tutor filter selection
  const handleTutorFilterSelect = (tutor) => {
    setSelectedTutorFilter(tutor);
    setShowTutorFilterDropdown(false);
    setTutorFilterSearchQuery('');
    setTutorFilterSearchResults([]);
    setHighlightedTutorFilterIndex(-1);
  };

  // Clear tutor filter
  const clearTutorFilter = () => {
    setSelectedTutorFilter(null);
    setTutorFilterSearchQuery('');
    setTutorFilterSearchResults([]);
    setShowTutorFilterDropdown(false);
    setHighlightedTutorFilterIndex(-1);
  };

  const updateAssignedTutor = async (clientId, tutorId, tutorName) => {
    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/assigned-tutor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          assigned_tutor_id: tutorId, 
          assigned_tutor_name: tutorName 
        })
      });
      
      if (response.ok) {
        // Update both clients and archivedClients for immediate UI feedback
        const updateFn = (prev) =>
          prev.map(client =>
            client.id === clientId
              ? { ...client, assigned_tutor_id: tutorId, assigned_tutor_name: tutorName }
              : client
          );
        setClients(updateFn);
        setArchivedClients(updateFn);
        setShowTutorDropdown(null);
        setTutorSearchQuery('');
        setTutorSearchResults([]);
        setHighlightedTutorIndex(-1);
      }
    } catch (error) {
      console.error('Error updating assigned tutor:', error);
    }
  };


  // Helper function to parse date strings in local timezone (fixes UTC timezone bug)
  // When parsing "2025-10-28", creates a Date object at local midnight, not UTC midnight
  const parseLocalDate = (dateString) => {
    if (!dateString) return null;
    try {
      // Handle ISO date strings (YYYY-MM-DD) or timestamps
      if (typeof dateString === 'string') {
        // Extract date part if it's a timestamp (YYYY-MM-DDTHH:mm:ss...)
        const datePart = dateString.split('T')[0];
        const parts = datePart.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const day = parseInt(parts[2], 10);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          // Create date in local timezone (not UTC)
          return new Date(year, month, day);
          }
        }
      }
      // Fallback to standard Date parsing for other formats
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? null : date;
    } catch (e) {
      console.error('Error parsing date:', dateString, e);
      return null;
    }
  };

  const updateDateOfferedToTutors = async (clientId, date) => {
    try {
      if (!date) {
        console.log('No date provided, clearing date');
        date = null;
      }
      
      // Format date as YYYY-MM-DD in local timezone
      let dateString = null;
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dateString = `${year}-${month}-${day}`;
      }
      
      console.log('Updating date offered to tutors:', { clientId, date, dateString });
      
      // Get current client to check status
      const currentClient = clients.find(c => c.id === clientId);
      const currentStatus = currentClient?.prospect_status || 'Need To Contact';
      
      // Determine new status based on automation logic
      let newStatus = currentStatus;
      if (dateString) {
        // Automation: Date Offered to Tutors → "Waiting to Pair"
        if (currentStatus !== 'Waiting to Pair' && currentStatus !== 'Waiting for Trial' && 
            currentStatus !== 'Trial Follow-Up' && currentStatus !== 'Won' && currentStatus !== 'Lost') {
          newStatus = 'Waiting to Pair';
        }
      }
      
      // Update local state immediately for instant UI feedback (both date and status)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { ...client, date_tutor_client_paired: dateString, prospect_status: newStatus }
            : client
        )
      );
      console.log(`✅ Date and status updated in local state immediately: ${newStatus}`);
      
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/date-offered-to-tutors`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          date_tutor_client_paired: dateString
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to update date:', response.status, errorData);
        // Revert local state on error (both date and status)
        const originalClient = clients.find(c => c.id === clientId);
        setClients(prevClients => 
          prevClients.map(client => 
            client.id === clientId 
              ? { 
                  ...client, 
                  date_tutor_client_paired: originalClient?.date_tutor_client_paired || null,
                  prospect_status: originalClient?.prospect_status || 'Need To Contact'
                }
              : client
          )
        );
        return;
      }
      
      const responseData = await response.json();
      console.log('API Response:', responseData);
      
      // Ensure state is updated with server response (including prospect_status if updated)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_tutor_client_paired: responseData.client?.date_tutor_client_paired || dateString,
                prospect_status: responseData.client?.prospect_status || newStatus
              }
            : client
        )
      );
      console.log('✅ Date and status updated successfully from server response');
    } catch (error) {
      console.error('Error updating date offered to tutors:', error);
      // Revert local state on error (both date and status)
      setClients(prevClients => {
        const originalClient = prevClients.find(c => c.id === clientId);
        return prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_tutor_client_paired: originalClient?.date_tutor_client_paired || null,
                prospect_status: originalClient?.prospect_status || 'Need To Contact'
              }
            : client
        );
      });
    }
  };

  const updateDateTutorClientPairedScheduled = async (clientId, date) => {
    try {
      if (!date) {
        date = null;
      }
      
      // Format date as YYYY-MM-DD in local timezone
      let dateString = null;
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dateString = `${year}-${month}-${day}`;
      }
      
      // Get current client to check status
      const currentClient = clients.find(c => c.id === clientId);
      const currentStatus = currentClient?.prospect_status || 'Need To Contact';
      
      // Determine new status based on automation logic
      let newStatus = currentStatus;
      if (dateString) {
        // Automation: Date Tutor and Client Paired → "Waiting for Trial"
        if (currentStatus !== 'Waiting for Trial' && currentStatus !== 'Trial Follow-Up' && 
            currentStatus !== 'Won' && currentStatus !== 'Lost') {
          newStatus = 'Waiting for Trial';
        }
      }
      
      // Update local state immediately for instant UI feedback (both date and status)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { ...client, date_tutor_client_paired_scheduled: dateString, prospect_status: newStatus }
            : client
        )
      );
      console.log(`✅ Date and status updated in local state immediately: ${newStatus}`);
      
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/date-tutor-client-paired-scheduled`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          date_tutor_client_paired_scheduled: dateString
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to update date:', response.status, errorData);
        // Revert both date and status on error
        const originalClient = clients.find(c => c.id === clientId);
        setClients(prevClients => 
          prevClients.map(client => 
            client.id === clientId 
              ? { 
                  ...client, 
                  date_tutor_client_paired_scheduled: originalClient?.date_tutor_client_paired_scheduled || null,
                  prospect_status: originalClient?.prospect_status || 'Need To Contact'
                }
              : client
          )
        );
        return;
      }
      
      const responseData = await response.json();
      // Ensure state is updated with server response (including prospect_status if updated)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_tutor_client_paired_scheduled: responseData.client?.date_tutor_client_paired_scheduled || dateString,
                prospect_status: responseData.client?.prospect_status || newStatus
              }
            : client
        )
      );
      console.log('✅ Date and status updated successfully from server response');
    } catch (error) {
      console.error('Error updating date tutor and client paired scheduled:', error);
      // Revert both date and status on error
      setClients(prevClients => {
        const originalClient = prevClients.find(c => c.id === clientId);
        return prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_tutor_client_paired_scheduled: originalClient?.date_tutor_client_paired_scheduled || null,
                prospect_status: originalClient?.prospect_status || 'Need To Contact'
              }
            : client
        );
      });
    }
  };


  const updateDateTrialFirstLesson = async (clientId, date) => {
    try {
      if (!date) {
        date = null;
      }
      
      // Format date as YYYY-MM-DD in local timezone
      let dateString = null;
      if (date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        dateString = `${year}-${month}-${day}`;
      }
      
      // Get current client to check status
      const currentClient = clients.find(c => c.id === clientId);
      const currentStatus = currentClient?.prospect_status || 'Need To Contact';
      
      // Determine new status based on automation logic
      let newStatus = currentStatus;
      if (dateString) {
        // Don't change status if already Won or Lost (terminal states)
        if (currentStatus !== 'Won' && currentStatus !== 'Lost') {
          // Check if trial date has already passed
          const trialDate = new Date(dateString);
          const now = new Date();
          trialDate.setHours(0, 0, 0, 0);
          now.setHours(0, 0, 0, 0);
          
          // Dynamic status update based on date:
          // - If date is in past → "Trial Follow-Up"
          // - If date is in future → "Waiting for Trial"
          // - Works both ways: can revert from "Trial Follow-Up" to "Waiting for Trial" if date moved to future
          if (now > trialDate) {
            newStatus = 'Trial Follow-Up'; // Date has passed, go to follow-up
          } else {
            newStatus = 'Waiting for Trial'; // Date is in future, wait for trial
          }
        }
      }
      
      // Update local state immediately for instant UI feedback (both date and status)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { ...client, date_trial_first_lesson: dateString, prospect_status: newStatus }
            : client
        )
      );
      console.log(`✅ Date and status updated in local state immediately: ${newStatus}`);
      
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/date-trial-first-lesson`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          date_trial_first_lesson: dateString
        })
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to update date:', response.status, errorData);
        // Revert both date and status on error
        const originalClient = clients.find(c => c.id === clientId);
        setClients(prevClients => 
          prevClients.map(client => 
            client.id === clientId 
              ? { 
                  ...client, 
                  date_trial_first_lesson: originalClient?.date_trial_first_lesson || null,
                  prospect_status: originalClient?.prospect_status || 'Need To Contact'
                }
              : client
          )
        );
        return;
      }
      
      const responseData = await response.json();
      // Ensure state is updated with server response (including prospect_status if updated)
      setClients(prevClients => 
        prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_trial_first_lesson: responseData.client?.date_trial_first_lesson || dateString,
                prospect_status: responseData.client?.prospect_status || newStatus
              }
            : client
        )
      );
      console.log('✅ Date and status updated successfully from server response');
    } catch (error) {
      console.error('Error updating date of trial / first lesson:', error);
      // Revert both date and status on error
      setClients(prevClients => {
        const originalClient = prevClients.find(c => c.id === clientId);
        return prevClients.map(client => 
          client.id === clientId 
            ? { 
                ...client, 
                date_trial_first_lesson: originalClient?.date_trial_first_lesson || null,
                prospect_status: originalClient?.prospect_status || 'Need To Contact'
              }
            : client
        );
      });
    }
  };

  // Toggle trial follow-up completed for a client
  const toggleTrialFollowUp = async (clientId, currentValue) => {
    try {
      const newValue = !currentValue;
      console.log(`Toggling trial follow-up completed for client ${clientId} to: ${newValue}`);

      const response = await fetch(`/api/client-conversion-tracker/${clientId}/toggle-trial-follow-up`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trial_follow_up_completed: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle trial follow-up completed');
      }

      const data = await response.json();
      console.log(`✅ Successfully toggled trial follow-up completed for client ${clientId}`);

      // Update local state
      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, trial_follow_up_completed: newValue }
            : client
        )
      );
    } catch (error) {
      console.error('Error toggling trial follow-up completed:', error);
      toast.error('Failed to toggle trial follow-up completed. Please try again.');
    }
  };

  // Toggle first paid lesson scheduled for a client
  const toggleFirstPaidScheduled = async (clientId, currentValue) => {
    try {
      const newValue = !currentValue;
      console.log(`Toggling first paid lesson scheduled for client ${clientId} to: ${newValue}`);

      const response = await fetch(`/api/client-conversion-tracker/${clientId}/toggle-first-paid-scheduled`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ first_paid_lesson_scheduled: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle first paid lesson scheduled');
      }

      const data = await response.json();
      console.log(`✅ Successfully toggled first paid lesson scheduled for client ${clientId}`);

      // Update local state
      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, first_paid_lesson_scheduled: newValue }
            : client
        )
      );
    } catch (error) {
      console.error('Error toggling first paid lesson scheduled:', error);
      toast.error('Failed to toggle first paid lesson scheduled. Please try again.');
    }
  };

  // Toggle first paid lesson completed for a client
  const toggleFirstPaidCompleted = async (clientId, currentValue) => {
    try {
      const newValue = !currentValue;
      console.log(`Toggling first paid lesson completed for client ${clientId} to: ${newValue}`);

      const response = await fetch(`/api/client-conversion-tracker/${clientId}/toggle-first-paid-completed`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ first_paid_lesson_completed: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle first paid lesson completed');
      }

      const data = await response.json();
      console.log(`✅ Successfully toggled first paid lesson completed for client ${clientId}`);

      // Update local state
      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, first_paid_lesson_completed: newValue }
            : client
        )
      );
    } catch (error) {
      console.error('Error toggling first paid lesson completed:', error);
      toast.error('Failed to toggle first paid lesson completed. Please try again.');
    }
  };

  // Toggle class pack for a club client
  const toggleClassPack = async (clientId, currentValue) => {
    try {
      const newValue = !currentValue;

      const response = await fetch(`/api/client-conversion-tracker/${clientId}/toggle-class-pack`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ has_class_pack: newValue }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle class pack');
      }

      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, has_class_pack: newValue }
            : client
        )
      );
    } catch (error) {
      console.error('Error toggling class pack:', error);
      toast.error('Failed to toggle class pack. Please try again.');
    }
  };

  // Update club class name for a client
  const updateClubClassName = async (clientId, clubClassName) => {
    try {
      const response = await fetch(`/api/client-conversion-tracker/${clientId}/club-class-name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club_class_name: clubClassName }),
      });

      if (!response.ok) {
        throw new Error('Failed to update club class name');
      }

      setClients(prevClients =>
        prevClients.map(client =>
          client.id === clientId
            ? { ...client, club_class_name: clubClassName }
            : client
        )
      );
    } catch (error) {
      console.error('Error updating club class name:', error);
      toast.error('Failed to update club class name. Please try again.');
    }
  };

  // Helper functions to process analytics data to match Google Sheets format
  const processLeadTypeData = (clients, apiData) => {
    // Group clients by lead type and conversion status
    const leadTypeMap = {};
    
    clients.forEach(client => {
      const leadType = client.lead_type || 'Unregistered';
      if (!leadTypeMap[leadType]) {
        leadTypeMap[leadType] = {
          lead_type: leadType,
          no: 0, // 1st Paid Lesson Complete = No
          yes: 0, // 1st Paid Lesson Complete = Yes
          total: 0
        };
      }
      
      leadTypeMap[leadType].total++;
      if (client.first_paid_lesson_completed) {
        leadTypeMap[leadType].yes++;
      } else {
        leadTypeMap[leadType].no++;
      }
    });
    
    // Convert to array and calculate percentages
    return Object.values(leadTypeMap).map(item => ({
      lead_type: item.lead_type,
      no: item.no,
      yes: item.yes,
      total: item.total,
      percentage_yes: item.total > 0 ? ((item.yes / item.total) * 100).toFixed(0) : 0,
      percentage_no: item.total > 0 ? ((item.no / item.total) * 100).toFixed(0) : 0
    })).sort((a, b) => b.total - a.total);
  };

  const processMarketData = (clients, apiData) => {
    // Group clients by market and conversion status
    const marketMap = {};
    
    clients.forEach(client => {
      const market = getMarketLabel(client) || 'Other';
      if (!marketMap[market]) {
        marketMap[market] = {
          market: market,
          no: 0, // 1st Paid Lesson Complete = No
          yes: 0, // 1st Paid Lesson Complete = Yes
          total: 0
        };
      }
      
      marketMap[market].total++;
      if (client.first_paid_lesson_completed) {
        marketMap[market].yes++;
      } else {
        marketMap[market].no++;
      }
    });
    
    // Convert to array and calculate percentages
    return Object.values(marketMap).map(item => ({
      market: item.market,
      no: item.no,
      yes: item.yes,
      total: item.total,
      percentage_yes: item.total > 0 ? ((item.yes / item.total) * 100).toFixed(0) : 0,
      percentage_no: item.total > 0 ? ((item.no / item.total) * 100).toFixed(0) : 0
    })).sort((a, b) => b.total - a.total);
  };

  const processWeeklyStats = (clients, apiData) => {
    // Group clients by week based on date_tutor_client_paired and date_trial_first_lesson
    const weeklyMap = {};
    const currentYear = new Date().getFullYear();
    const lastYear = currentYear - 1;
    
    // Helper to get week start (Sunday)
    const getWeekStart = (date) => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day; // Subtract days to get to Sunday
      return new Date(d.setDate(diff));
    };
    
    // Process all client data (both current and last year)
    clients.forEach(client => {
      // # of paired - based on date_tutor_client_paired
      if (client.date_tutor_client_paired) {
        const pairedDate = new Date(client.date_tutor_client_paired);
        const weekStart = getWeekStart(pairedDate);
        const weekKey = weekStart.toISOString().split('T')[0];
        const year = pairedDate.getFullYear();
        
        if (!weeklyMap[weekKey]) {
          weeklyMap[weekKey] = {
            week_start: weekStart.toISOString().split('T')[0],
            week_end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            year: year,
            paired: 0,
            first_lessons_trials: 0,
            paired_yoy: null,
            trials_yoy: null
          };
        }
        
        // Count for the year of the date
        if (year === currentYear || year === lastYear) {
          weeklyMap[weekKey].paired++;
        }
      }
      
      // # of first lessons / trials - based on date_trial_first_lesson
      if (client.date_trial_first_lesson) {
        const trialDate = new Date(client.date_trial_first_lesson);
        const weekStart = getWeekStart(trialDate);
        const weekKey = weekStart.toISOString().split('T')[0];
        const year = trialDate.getFullYear();
        
        if (!weeklyMap[weekKey]) {
          weeklyMap[weekKey] = {
            week_start: weekStart.toISOString().split('T')[0],
            week_end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            year: year,
            paired: 0,
            first_lessons_trials: 0,
            paired_yoy: null,
            trials_yoy: null
          };
        }
        
        // Count for the year of the date
        if (year === currentYear || year === lastYear) {
          weeklyMap[weekKey].first_lessons_trials++;
        }
      }
    });
    
    // Separate current year and last year data
    const currentYearWeeks = Object.values(weeklyMap)
      .filter(week => week.year === currentYear)
      .sort((a, b) => new Date(a.week_start) - new Date(b.week_start));
    
    const lastYearWeeks = Object.values(weeklyMap)
      .filter(week => week.year === lastYear)
      .reduce((acc, week) => {
        acc[week.week_start] = week;
        return acc;
      }, {});
    
    // Calculate year-over-year comparisons for current year weeks
    currentYearWeeks.forEach(week => {
      const lastYearWeekStart = new Date(week.week_start);
      lastYearWeekStart.setFullYear(lastYear);
      const lastYearWeekKey = getWeekStart(lastYearWeekStart).toISOString().split('T')[0];
      
      // Find matching week from last year
      const lastYearWeek = lastYearWeeks[lastYearWeekKey];
      if (lastYearWeek) {
        week.paired_yoy = lastYearWeek.paired > 0 
          ? (((week.paired - lastYearWeek.paired) / lastYearWeek.paired) * 100).toFixed(2)
          : null;
        week.trials_yoy = lastYearWeek.first_lessons_trials > 0
          ? (((week.first_lessons_trials - lastYearWeek.first_lessons_trials) / lastYearWeek.first_lessons_trials) * 100).toFixed(2)
          : null;
      }
    });
    
    return currentYearWeeks.slice(-16); // Return last 16 weeks
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedClient) return;
    
    try {
      const response = await fetch(`/api/client-conversion-tracker/${selectedClient.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          note: newNote,
          created_by: 'Customer Success Manager'
        })
      });
      
      if (response.ok) {
        setNewNote('');
        setShowNotesModal(false);
        fetchAllData(); // Refresh data
      }
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };


  const handleSaveEdit = async () => {
    if (!selectedClient) return;

    try {
      const response = await fetch(`/api/client-conversion-tracker/${selectedClient.id}/conversion-tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingData)
      });
      
      if (response.ok) {
        setShowEditModal(false);
        setEditingData({});
        fetchAllData(); // Refresh data
      }
    } catch (error) {
      console.error('Error updating client data:', error);
    }
  };

  const handleRescore = async (prospectId) => {
    try {
      await axios.post(`/api/client-conversion-tracker/${prospectId}/lead-score/rescore`);
      fetchAllData();
    } catch (err) {
      console.error('Failed to rescore:', err);
    }
  };

  const handleProspectClick = (prospect) => {
    if (!prospect) {
      console.error('handleProspectClick called with null/undefined prospect');
      return;
    }
    console.log('Opening prospect modal for:', prospect);
    setSelectedProspect(prospect);
    setShowProspectModal(true);
    setActiveProspectMainTab('overview'); // Reset to overview tab
    setActiveProspectTab('notes'); // Reset legacy sub-tab
    setNotes([]); // Clear previous notes before fetching new ones
    setStatusHistory([]); // Clear previous status history
    setRecommendedTutors([]); // Clear previous recommendations
    fetchNotes(prospect.id);
    fetchCommunications(prospect.id); // Also fetch communications
    fetchStatusHistory(prospect.id);
    fetchRecommendedTutors(prospect.id);
  };

  // Recommended tutors
  const fetchRecommendedTutors = async (clientId) => {
    setLoadingRecommendedTutors(true);
    try {
      const response = await axios.get(`/api/client-conversion-tracker/${clientId}/recommended-tutors`, {
        withCredentials: true
      });
      setRecommendedTutors(response.data.recommendations || []);
    } catch (error) {
      console.error('Error fetching recommended tutors:', error);
      setRecommendedTutors([]);
    } finally {
      setLoadingRecommendedTutors(false);
    }
  };

  // Status history
  const fetchStatusHistory = async (clientId) => {
    setLoadingStatusHistory(true);
    try {
      const response = await axios.get(`/api/client-conversion-tracker/${clientId}/status-history`, {
        withCredentials: true
      });
      setStatusHistory(response.data.history || []);
    } catch (error) {
      console.error('Error fetching status history:', error);
      setStatusHistory([]);
    } finally {
      setLoadingStatusHistory(false);
    }
  };

  // Notes management functions
  const fetchNotes = async (clientId) => {
    try {
      // Use conversion tracker endpoint which includes TutorCruncher notes
      const response = await axios.get(`/api/client-conversion-tracker/${clientId}/notes?include_tutorcruncher=true`, {
        withCredentials: true
      });
      setNotes(response.data);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setNotes([]);
    }
  };

  const addNote = async () => {
    if (!newNote.trim() || !selectedProspect) return;
    
    try {
      const response = await axios.post(`/api/client-conversion-tracker/${selectedProspect.id}/notes`, {
        note: newNote.trim(),
        created_by: 'User' // Will be set by backend from JWT token
      }, {
        withCredentials: true
      });
      
      // Refresh notes to get updated list with TutorCruncher notes
      await fetchNotes(selectedProspect.id);
      setNewNote('');
    } catch (error) {
      console.error('Error adding note:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to add note',
        message: error.response?.data?.error || 'An error occurred while adding the note.'
      });
    }
  };

  // Inline note save from the table — adds a new note and updates the local row
  const saveInlineNote = async (clientId, noteText) => {
    if (!noteText.trim()) return;
    try {
      await axios.post(`/api/client-conversion-tracker/${clientId}/notes`, {
        note: noteText.trim(),
        created_by: 'User'
      }, {
        withCredentials: true
      });
      // Update the client row locally so the table reflects the new note without a full refresh
      setClients(prev => prev.map(c =>
        c.id === clientId ? { ...c, latest_note: noteText.trim() } : c
      ));
      setArchivedClients(prev => prev.map(c =>
        c.id === clientId ? { ...c, latest_note: noteText.trim() } : c
      ));
    } catch (error) {
      console.error('Error saving inline note:', error);
    }
  };

  const editNote = async (noteId) => {
    if (!editingNoteText.trim()) return;
    
    try {
      const note = notes.find(n => n.id === noteId);

      if (!note) {
        console.error('Note not found');
        return;
      }

      // Check if it's a TutorCruncher note or local note
      if (note.source === 'tutorcruncher' && note.tc_id) {
        // Update TutorCruncher note
        const response = await axios.post(`/api/client-conversion-tracker/${selectedProspect.id}/tutorcruncher-notes`, {
          note_text: editingNoteText.trim(),
          note_id: note.tc_id
        }, {
          withCredentials: true
        });

        // Also update local note if it exists
        if (note.local_id) {
          await axios.put(`/api/client-notes/${note.local_id}`, {
            note_text: editingNoteText.trim()
          }, {
            withCredentials: true
          });
        }
      } else if (note.source === 'local' && note.local_id) {
        // Update local note
        const response = await axios.put(`/api/client-notes/${note.local_id}`, {
        note_text: editingNoteText.trim()
      }, {
        withCredentials: true
      });
      }

      // Refresh notes
      await fetchNotes(selectedProspect.id);
      setEditingNote(null);
      setEditingNoteText('');
    } catch (error) {
      console.error('Error editing note:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to update note',
        message: error.response?.data?.error || 'An error occurred while updating the note.'
      });
    }
  };

  const deleteNote = async (noteId, note) => {
    try {
      const noteToDelete = note || notes.find(n => (n.id === noteId) || (n.tc_id === noteId));

      if (!noteToDelete) {
        console.error('Note not found');
        return;
      }

      // Check if it's a TutorCruncher note (has tc_id) or local note (has local_id or id)
      if (noteToDelete.tc_id || noteToDelete.source === 'tutorcruncher') {
        // Delete TutorCruncher note via TutorCruncher API
        try {
          await axios.delete(`/api/client-conversion-tracker/${selectedProspect.id}/tutorcruncher-notes/${noteToDelete.tc_id}`, {
            withCredentials: true
          });
        } catch (tcError) {
          setTrackerBanner({
            kind: 'warning',
            title: 'Cannot delete TutorCruncher note',
            message: 'TutorCruncher notes can only be deleted from TutorCruncher directly.'
          });
          return;
        }
      } else {
        // Delete local note
        const localNoteId = noteToDelete.local_id || noteToDelete.id;
        await axios.delete(`/api/client-notes/${localNoteId}`, {
          withCredentials: true
        });
      }
      
      // Refresh notes
      await fetchNotes(selectedProspect.id);
      
      setTrackerBanner({
        kind: 'success',
        title: 'Note deleted',
        message: 'The note has been successfully deleted.'
      });
    } catch (error) {
      console.error('Error deleting note:', error);
      setTrackerBanner({
        kind: 'error',
        title: 'Failed to delete note',
        message: error.response?.data?.error || 'An error occurred while deleting the note.'
      });
    }
  };

  const startEditNote = (note) => {
    setEditingNote(note.id);
    setEditingNoteText(note.text || note.note_text || '');
  };

  const cancelEditNote = () => {
    setEditingNote(null);
    setEditingNoteText('');
  };

  // Fetch TutorCruncher communications
  // Fetch Missive communications for a client
  const fetchCommunications = async (clientId) => {
    if (!clientId) return;
    
    setLoadingCommunications(true);
    try {
      const response = await axios.get(`/api/client-conversion-tracker/${clientId}/missive-communications`, {
        withCredentials: true
      });
      setMissiveCommunications(response.data.communications || []);
    } catch (error) {
      console.error('Error fetching Missive communications:', error);
      setMissiveCommunications([]);
    } finally {
      setLoadingCommunications(false);
    }
  };

  // Sync recent Missive messages (captures outgoing emails)
  const syncMissiveMessages = async () => {
    setSyncingMissive(true);
    try {
      await axios.post('/api/client-conversion-tracker/missive/sync', {
        conversationLimit: 20, // Quick sync of recent conversations
        messageLimit: 5
      }, {
        withCredentials: true
      });
      // After sync, refresh communications for the selected prospect
      if (selectedProspect?.id) {
        await fetchCommunications(selectedProspect.id);
      }
    } catch (error) {
      console.error('Error syncing Missive:', error);
    } finally {
      setSyncingMissive(false);
    }
  };

  // Fetch full message body from Missive API
  const fetchFullBody = async (conversationId) => {
    // Check if we already have it cached
    if (fullBodies[conversationId]) {
      return fullBodies[conversationId];
    }

    setLoadingBodyFor(conversationId);
    try {
      const response = await axios.get(
        `/api/client-conversion-tracker/missive/conversation/${conversationId}/body`,
        { withCredentials: true }
      );

      const body = response.data.body || response.data.allMessages?.[0]?.body || null;

      // Cache the result
      setFullBodies(prev => ({
        ...prev,
        [conversationId]: body
      }));

      return body;
    } catch (error) {
      console.error('Error fetching full body:', error);
      return null;
    } finally {
      setLoadingBodyFor(null);
    }
  };

  // Handle expanding a communication - fetches full body from Missive API
  const handleExpandCommunication = async (idx, conversationId) => {
    if (expandedCommunication === idx) {
      // Collapsing
      setExpandedCommunication(null);
    } else {
      // Expanding - fetch full body if we have a conversation ID
      setExpandedCommunication(idx);
      if (conversationId && !fullBodies[conversationId]) {
        await fetchFullBody(conversationId);
      }
    }
  };

  // Initiate Missive outreach
  const initiateMissiveOutreach = async (workflowName) => {
    if (!selectedProspect?.id) return;
    
    setLoadingMissive(true);
    try {
      const response = await axios.post(`/api/client-conversion-tracker/${selectedProspect.id}/missive-outreach`, {
        workflow_name: workflowName || 'Prospect Outreach'
      }, {
        withCredentials: true
      });
      
      if (response.data.success) {
        setTrackerBanner({
          kind: 'success',
          title: 'Outreach initiated',
          message: response.data.message || 'Outreach workflow started in Missive.'
        });
        // Refresh communications to see new outreach
        await fetchCommunications(selectedProspect.id);
      } else {
        // Show detailed error information
        const errorMessage = response.data.message || 'Missive API requires configuration.';
        const troubleshooting = response.data.troubleshooting || response.data.instructions || [];
        const details = response.data.details ? (typeof response.data.details === 'string' ? response.data.details : JSON.stringify(response.data.details, null, 2)) : null;
        
        setTrackerBanner({
          kind: 'error',
          title: response.data.error || 'Missive integration error',
          message: errorMessage,
          troubleshooting: troubleshooting,
          details: details,
          debugInfo: response.data.debug_info
        });
      }
    } catch (error) {
      console.error('Error initiating Missive outreach:', error);
      const errorResponse = error.response?.data;
      const troubleshooting = errorResponse?.troubleshooting || [];
      const details = errorResponse?.details ? (typeof errorResponse.details === 'string' ? errorResponse.details : JSON.stringify(errorResponse.details, null, 2)) : null;
      
      setTrackerBanner({
        kind: 'error',
        title: errorResponse?.error || 'Failed to initiate outreach',
        message: errorResponse?.message || error.message || 'An error occurred while initiating outreach.',
        troubleshooting: troubleshooting,
        details: details,
        debugInfo: errorResponse?.debug_info
      });
    } finally {
      setLoadingMissive(false);
    }
  };


  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const formatPhoneNumber = (phoneString) => {
    if (!phoneString || typeof phoneString !== 'string') return 'N/A';
    
    // Remove all non-digit characters
    const digits = phoneString.replace(/\D/g, '');
    
    // Handle different phone number formats
    if (digits.length === 10) {
      // Format as XXX-XXX-XXXX
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits[0] === '1') {
      // Format as XXX-XXX-XXXX (remove leading 1)
      return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    } else if (digits.length === 11) {
      // Format as XXX-XXX-XXXX
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else {
      // Return original if format is not recognized
      return phoneString;
    }
  };

  // Use centralized label color utility from '../utils/labelColors'
  // getLabelColor and getContrastColor are imported at the top of the file
  
  // Get text color for label (white or black based on background)
  const getLabelTextColor = (backgroundColor) => {
    // Use centralized utility
    return getContrastColor(backgroundColor);
  };

  // Get background color for prospect status
  const getStatusBackgroundColor = (status) => {
    switch (status) {
      case 'Need To Contact':
        return 'bg-purple-50'; // Purple - new lead, needs initial contact
      case 'Waiting for Response':
        return 'bg-blue-50'; // Blue - waiting, neutral state
      case 'Building':
        return 'bg-amber-50'; // Amber/yellow - active work in progress
      case 'Waiting to Pair':
        return 'bg-orange-50'; // Orange - blocked but progressing
      case 'Waiting for Trial':
        return 'bg-cyan-50'; // Cyan - scheduled, upcoming event
      case 'Trial Follow-Up':
        return 'bg-red-50'; // Red - urgent action required
      case 'Won':
        return 'bg-green-50'; // Green - success, conversion complete
      case 'Lost':
        return 'bg-neutral-50'; // Gray - inactive, lost
      default:
        return 'bg-white';
    }
  };

  // Get text color for prospect status
  const getStatusTextColor = (status) => {
    switch (status) {
      case 'Need To Contact':
        return 'text-purple-700';
      case 'Waiting for Response':
        return 'text-blue-700';
      case 'Building':
        return 'text-orange-600';
      case 'Waiting to Pair':
        return 'text-orange-700';
      case 'Waiting for Trial':
        return 'text-cyan-700';
      case 'Trial Follow-Up':
        return 'text-red-600';
      case 'Won':
        return 'text-green-700';
      case 'Lost':
        return 'text-neutral-600';
      default:
        return 'text-neutral-900';
    }
  };

  const getTimeInStage = (createdAt) => {
    if (!createdAt) return 'Unknown';
    const now = new Date();
    const created = new Date(createdAt);
    const diffTime = Math.abs(now - created);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return '1 day';
    if (diffDays < 7) return `${diffDays} days`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;
  };

  const getMarketLabel = (client) => {
    // Market mapping based on labels
    const marketMapping = {
      'Club - Park Slope': 'Park Slope Club',
      'Club - UES': 'NYC',
      'Home - Hamptons': 'Hamptons',
      'Home - LA': 'LA',
      'Home - NYC': 'NYC',
      'Home - SF': 'SF',
      'Home - Westchester': 'Westchester',
      'Online': 'Online',
      'School - Hamptons': 'Hamptons',
      'School - LA': 'LA',
      'School - NYC': 'NYC',
      'School - SF': 'SF',
      'Tournament': 'Tournament'
    };

    // Try to get market from labels first
    if (client.labels && Array.isArray(client.labels)) {
      for (const label of client.labels) {
        const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
        if (marketMapping[labelName]) {
          return marketMapping[labelName];
        }
      }
    }
    
    // Try to get market from the market field (if it exists)
    if (client.market && typeof client.market === 'string') {
      return client.market;
    }
    
    // Return empty string if no market found
    return '';
  };

  // Get chip color classes for lead types
  const getLeadTypeChipColors = (leadType) => {
    const colorMap = {
      'New Lead': 'bg-green-100 text-green-800 border-green-200',
      'Returning Lead': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Unregistered': 'bg-blue-100 text-blue-800 border-blue-200',
      'Referral': 'bg-purple-100 text-purple-800 border-purple-200',
      'New Lead/Auction': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'Takeover': 'bg-red-100 text-red-800 border-red-200',
      'Dead Lead': 'bg-neutral-100 text-neutral-800 border-neutral-200',
      'Other': 'bg-neutral-100 text-neutral-800 border-neutral-200'
    };
    return colorMap[leadType] || 'bg-neutral-100 text-neutral-800 border-neutral-200';
  };

  // Get chip color classes for markets
  const getMarketChipColors = (market) => {
    const colorMap = {
      'NYC': 'bg-blue-100 text-blue-800 border-blue-200',
      'Park Slope Club': 'bg-sky-100 text-sky-800 border-sky-200',
      'Hamptons': 'bg-teal-100 text-teal-800 border-teal-200',
      'Online': 'bg-green-100 text-green-800 border-green-200',
      'Los Angeles': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'San Francisco': 'bg-purple-100 text-purple-800 border-purple-200',
      'Westchester': 'bg-cyan-100 text-cyan-800 border-cyan-200',
      'LA': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'SF': 'bg-purple-100 text-purple-800 border-purple-200',
      'Other': 'bg-neutral-100 text-neutral-800 border-neutral-200'
    };
    return colorMap[market] || 'bg-neutral-100 text-neutral-800 border-neutral-200';
  };

  // Get label color for market based on job-labels.json
  const getMarketLabelColor = (market) => {
    // Map markets to their corresponding label colors from job-labels.json
    const marketToLabelColor = {
      'NYC': 'MediumOrchid', // Home - NYC → MediumOrchid
      'Park Slope Club': 'dodgerblue', // Club - Park Slope → dodgerblue
      'Los Angeles': 'gold', // Home - LA → gold
      'LA': 'gold', // Home - LA → gold
      'San Francisco': '#40e0d0', // Home - SF → #40e0d0
      'SF': '#40e0d0', // Home - SF → #40e0d0
      'Hamptons': '#ffebcd', // Home - Hamptons → #ffebcd
      'Online': 'lightgreen', // Online → lightgreen
      'Westchester': 'BlanchedAlmond', // Home - Westchester → BlanchedAlmond
      'Chicago': null, // No specific label
      'Other': null // No specific label
    };
    return marketToLabelColor[market] || null;
  };

  // Convert label color name/hex to actual CSS color value
  const getMarketLabelColorValue = (market) => {
    const labelColor = getMarketLabelColor(market);
    if (!labelColor) return null;

    // Convert label color names/hex to CSS color values
    const colorValueMap = {
      'MediumOrchid': '#BA55D3',
      'dodgerblue': '#1E90FF',
      'gold': '#FFD700',
      '#40e0d0': '#40e0d0',
      '#ffebcd': '#FFEBCD',
      'lightgreen': '#90EE90',
      'BlanchedAlmond': '#FFEBCD'
    };

    return colorValueMap[labelColor] || labelColor;
  };

  // Get stage colors matching TutorCruncher
  const getStageColor = (stageName) => {
    const colors = {
      'New Lead': '#F79A30',
      'Home': '#6A469D',
      'Online': '#34B256',
      'Clubs': '#1e90ff',
      'Waiting to Pair': '#2D2F8E',
      'Trial': '#DA2E72',
    };
    return colors[stageName] || '#6B7280';
  };

  // Get stage border colors for tabs
  const getStageBorderColor = (stageName) => {
    const colors = {
      'New Lead': '#F79A30',
      'Home': '#6A469D',
      'Online': '#34B256',
      'Clubs': '#1e90ff',
      'Waiting to Pair': '#2D2F8E',
      'Trial': '#DA2E72',
    };
    return colors[stageName] || '#6B7280';
  };

  // Helper function to check if a date is within a date range
  const isDateInRange = (dateString, dateRange) => {
    if (!dateRange.start && !dateRange.end) return true; // No filter applied
    if (!dateString) return false; // Client doesn't have this date

    const clientDate = parseLocalDate(dateString);
    if (!clientDate) return false;
    
    if (dateRange.start) {
      const startDate = new Date(dateRange.start);
      startDate.setHours(0, 0, 0, 0);
      if (clientDate < startDate) return false;
    }
    
    if (dateRange.end) {
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);
      if (clientDate > endDate) return false;
    }
    
    return true;
  };

  // Helper functions to check client labels (defined before use in filteredClients)
  const hasHomeLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName && labelName.startsWith('Home -');
    });
  };

  const hasOnlineLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName === 'Online';
    });
  };

  // Pipeline stage determines tab when a client has multiple label types.
  // e.g. Aditi has Home + Club labels but pipeline_stage = 'Clubs' → Club tab only.
  const getClientPipelineStage = (client) => {
    return (client.pipeline_stage || client.pipeline_name || '').toLowerCase();
  };

  // Pending = prospect has F/U, Paid Scheduled, or Paid Done marked Yes
  const isPending = (client) => {
    return !!(client.trial_follow_up_completed || client.first_paid_lesson_scheduled || client.first_paid_lesson_completed);
  };

  // Private = Home + Online combined, but NOT if pipeline stage puts them in Club, and NOT if pending
  const hasPrivateLabel = (client) => {
    const stage = getClientPipelineStage(client);
    if (stage === 'clubs') return false;
    if (isPending(client)) return false;
    return hasHomeLabel(client) || hasOnlineLabel(client);
  };

  const hasSchoolLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName && labelName.startsWith('School -');
    });
  };

  const hasClubLabel = (client) => {
    // Pipeline stage 'Clubs' forces client into Club tab regardless of other labels
    const stage = getClientPipelineStage(client);
    if (stage === 'clubs') return true;
    if (!client.labels || !Array.isArray(client.labels)) return false;
    return client.labels.some(label => {
      const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
      return labelName && labelName.startsWith('Club -');
    });
  };

  const isClubCamp = (client) => {
    if (!hasClubLabel(client)) return false;
    const className = (client.club_class_name || '').toLowerCase();
    return className.includes('camp');
  };

  const hasNoLabel = (client) => {
    if (!client.labels || !Array.isArray(client.labels)) return true;
    return client.labels.length === 0;
  };

  // Filter clients based on active tab
  const filteredClients = Array.isArray(clients) ? clients.filter(client => {
    // Exclude Won/Lost prospects from Prospects tab - they should only appear in Won/Lost tabs
    if (activeTab === 'prospects') {
      if (client.prospect_status === 'Won' || client.prospect_status === 'Lost') {
        return false;
      }
    }
    
    const matchesStage = filters.pipelineStage === 'all' || client.pipeline_stage_id?.toString() === filters.pipelineStage;
    const matchesMarket = filters.market === 'all' || getMarketLabel(client).includes(filters.market);
    const matchesLeadType = filters.leadType === 'all' || client.lead_type === filters.leadType;
    const matchesStatus = filters.conversionStatus === 'all' || client.conversion_status === filters.conversionStatus;
    const matchesProspectStatus = filters.prospectStatus.length === 0 || filters.prospectStatus.includes(client.prospect_status || 'Need To Contact');
    const matchesSearch = filters.search === '' || 
      `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase().includes(filters.search.toLowerCase()) ||
      (client.email || '').toLowerCase().includes(filters.search.toLowerCase());
    
    // Add prospect stage filter for prospects tab
    // Handle special label-based filters: 'home', 'online', 'school', 'club', 'no-label'
    let matchesProspectStage = true;
    if (activeTab === 'prospects' && prospectStageFilter) {
      if (prospectStageFilter === 'private') {
        matchesProspectStage = hasPrivateLabel(client);
      } else if (prospectStageFilter === 'pending') {
        matchesProspectStage = isPending(client) && (hasHomeLabel(client) || hasOnlineLabel(client)) && !hasClubLabel(client);
      } else if (prospectStageFilter === 'school') {
        matchesProspectStage = hasSchoolLabel(client);
      } else if (prospectStageFilter === 'club-camp') {
        matchesProspectStage = isClubCamp(client);
      } else if (prospectStageFilter === 'club') {
        matchesProspectStage = hasClubLabel(client) && !isClubCamp(client);
      } else if (prospectStageFilter === 'no-label') {
        matchesProspectStage = hasNoLabel(client);
      } else {
        // Regular pipeline stage filter (only for 'New Lead')
        matchesProspectStage = client.pipeline_stage_id?.toString() === prospectStageFilter;
      }
    }
    
    // Date range filters
    // Filter by pipeline entry date (date_entered_pipeline or date_registration_complete)
    const pipelineEntryDate = client.date_entered_pipeline || client.date_registration_complete;
    const matchesPipelineEntry = isDateInRange(pipelineEntryDate, dateFilters.registrationComplete);
    const matchesDateOfferedToTutors = isDateInRange(client.date_tutor_client_paired, dateFilters.dateOfferedToTutors);
    const matchesDateTutorClientPaired = isDateInRange(client.date_tutor_client_paired_scheduled, dateFilters.dateTutorClientPaired);
    const matchesDateTrialFirstLesson = isDateInRange(client.date_trial_first_lesson, dateFilters.dateTrialFirstLesson);
    
    // Tutor filter
    const matchesTutor = !selectedTutorFilter || 
      (client.assigned_tutor_id && client.assigned_tutor_id.toString() === selectedTutorFilter.id.toString()) ||
      (client.assigned_tutor_name && client.assigned_tutor_name === selectedTutorFilter.name);
    
    return matchesStage && matchesMarket && matchesLeadType && matchesStatus && matchesProspectStatus && matchesSearch && matchesProspectStage &&
           matchesPipelineEntry && matchesDateOfferedToTutors && matchesDateTutorClientPaired && matchesDateTrialFirstLesson &&
           matchesTutor;
  }) : [];

  // Calculate unique client count (deduplicate by client id)
  const uniqueClientsCount = useMemo(() => {
    if (!Array.isArray(clients)) return 0;
    const uniqueIds = new Set(clients.map(c => c.id));
    return uniqueIds.size;
  }, [clients]);

  // Filter pipeline stages to only show allowed stages: New Lead
  const allowedStageNames = ['New Lead'];
  const filteredPipelineStages = useMemo(() => {
    return pipelineStages.filter(stage => 
      allowedStageNames.includes(stage.name)
    );
  }, [pipelineStages]);

  // Set default filter to "New Lead" when stages are loaded (only if filter is still null)
  useEffect(() => {
    if (filteredPipelineStages.length > 0 && prospectStageFilter === null) {
      const newLeadStage = filteredPipelineStages.find(stage => stage.name === 'New Lead');
      if (newLeadStage) {
        setProspectStageFilter(newLeadStage.id.toString());
      } else if (filteredPipelineStages.length > 0) {
        // Fallback to first stage if "New Lead" not found
        setProspectStageFilter(filteredPipelineStages[0].id.toString());
      }
    }
  }, [filteredPipelineStages]); // Removed prospectStageFilter from dependencies to avoid resetting user selections

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const bannerStyles = {
    success: {
      container: 'border-emerald-200 bg-emerald-50',
      title: 'text-emerald-800',
      body: 'text-emerald-700',
      icon: 'text-emerald-500',
      Icon: CheckCircleIcon,
    },
    warning: {
      container: 'border-amber-200 bg-amber-50',
      title: 'text-amber-800',
      body: 'text-amber-700',
      icon: 'text-amber-500',
      Icon: ExclamationTriangleIcon,
    },
    error: {
      container: 'border-red-200 bg-red-50',
      title: 'text-red-800',
      body: 'text-red-700',
      icon: 'text-red-500',
      Icon: XCircleIcon,
    },
    info: {
      container: 'border-blue-200 bg-blue-50',
      title: 'text-blue-800',
      body: 'text-blue-700',
      icon: 'text-blue-500',
      Icon: CheckCircleIcon,
    },
  };

  const activeBannerStyle = trackerBanner
    ? bannerStyles[trackerBanner.kind] || bannerStyles.info
    : null;
  const BannerIcon = activeBannerStyle?.Icon || CheckCircleIcon;

  return (
    <div className="space-y-6">
      <style>{`
        .react-datepicker {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        .react-datepicker__header {
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          border-top-left-radius: 0.5rem;
          border-top-right-radius: 0.5rem;
          padding-top: 0.75rem;
        }
        ${resizingColumn ? `
          body {
            user-select: none;
            cursor: col-resize !important;
          }
        ` : ''}
        .react-datepicker__current-month {
          font-weight: 600;
          color: #111827;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }
        .react-datepicker__day-name {
          color: #6b7280;
          font-weight: 500;
          font-size: 0.75rem;
          width: 2.25rem;
          line-height: 2.25rem;
        }
        .react-datepicker__day {
          color: #374151;
          font-size: 0.875rem;
          width: 2.25rem;
          line-height: 2.25rem;
          margin: 0.125rem;
          border-radius: 0.375rem;
        }
        .react-datepicker__day:hover {
          background-color: #f3f4f6;
          border-radius: 0.375rem;
        }
        .react-datepicker__day--selected {
          background-color: #4f46e5 !important;
          color: white !important;
          font-weight: 600;
        }
        .react-datepicker__day--today {
          background-color: #eef2ff !important;
          color: #4f46e5 !important;
          font-weight: 600;
        }
        .react-datepicker__day--keyboard-selected {
          background-color: #4f46e5;
          color: white;
        }
        .react-datepicker__navigation {
          top: 0.75rem;
        }
        .react-datepicker__navigation-icon::before {
          border-color: #6b7280;
        }
        .react-datepicker__navigation:hover *::before {
          border-color: #374151;
        }
      `}</style>

      {trackerBanner && activeBannerStyle && (
        <div className={`rounded-lg border ${activeBannerStyle.container} p-4 shadow-sm`}>
          <div className="flex items-start">
            <BannerIcon className={`h-5 w-5 ${activeBannerStyle.icon} mt-0.5`} />
            <div className="ml-3 flex-1">
              <p className={`text-sm font-semibold ${activeBannerStyle.title}`}>{trackerBanner.title}</p>
              {trackerBanner.message && (
                <p className={`mt-1 text-sm ${activeBannerStyle.body}`}>{trackerBanner.message}</p>
              )}
              {trackerBanner.troubleshooting && trackerBanner.troubleshooting.length > 0 && (
                <div className={`mt-2 text-xs ${activeBannerStyle.body}`}>
                  <p className="font-semibold mb-1">Troubleshooting steps:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    {trackerBanner.troubleshooting.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
              {trackerBanner.details && (
                <div className={`mt-2 text-xs ${activeBannerStyle.body} bg-black bg-opacity-10 p-2 rounded font-mono overflow-x-auto`}>
                  <p className="font-semibold mb-1">Error details:</p>
                  <pre className="whitespace-pre-wrap text-xs">{trackerBanner.details}</pre>
                </div>
              )}
              {trackerBanner.debugInfo && (
                <div className={`mt-2 text-xs ${activeBannerStyle.body} opacity-75`}>
                  <p className="font-semibold mb-1">Debug info:</p>
                  <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(trackerBanner.debugInfo, null, 2)}</pre>
                </div>
              )}
              {trackerBanner.meta && (
                <div className={`mt-1 text-xs ${activeBannerStyle.body} space-y-0.5`}>
                  {trackerBanner.meta.email && <p>Email: {trackerBanner.meta.email}</p>}
                  {trackerBanner.meta.phone && <p>Phone: {trackerBanner.meta.phone}</p>}
                  {trackerBanner.meta.tcClientId && <p>TutorCruncher ID: {trackerBanner.meta.tcClientId}</p>}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setTrackerBanner(null)}
              className="ml-3 inline-flex rounded-md p-1 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-300"
            >
              <span className="sr-only">Dismiss success message</span>
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher + Notification Bell — hidden when viewing standalone analytics */}
      {defaultTab !== 'analytics' && (
      <div className="flex items-center justify-between pt-3 pb-1 pr-2">
        <nav className="flex space-x-1 bg-neutral-100 rounded-lg p-1">
          {[
            { id: 'prospects', name: 'Prospects', count: uniqueClientsCount },
            { id: 'won', name: 'Won', count: archivedClients.filter(c => c.client_status === 'live' || c.prospect_status === 'Won').length, hasInfo: true },
            { id: 'lost', name: 'Lost', count: archivedClients.filter(c => c.prospect_status === 'Lost').length, hasInfo: true },
            { id: 'bundles', name: 'Bundles', count: null },
          ].filter(Boolean).map((tab) => (
            <div key={tab.id} className="relative">
              {tab.hasInfo && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10">
                  <AutomationInfoIndicator
                    mode="summary"
                    automationType={tab.id}
                    size="sm"
                  />
                </div>
              )}
              <button
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {tab.name}
                {tab.count != null && (
                  <span className="ml-2 bg-neutral-200 text-neutral-600 rounded-full px-2 py-0.5 text-xs tabular-nums">
                    {tab.count}
                  </span>
                )}
              </button>
            </div>
          ))}
        </nav>

        <div className="flex items-center">
          <CCTNotificationCenter onDataChange={fetchAllData} />
        </div>
      </div>
      )}

      {/* Pipeline View */}
      {activeTab === 'pipeline' && (
        <PipelineView
          resetManualIntakeForm={resetManualIntakeForm}
          setShowManualIntakeModal={setShowManualIntakeModal}
          handlePipelineStageUpdate={handlePipelineStageUpdate}
          getStageColor={getStageColor}
          getTimeInStage={getTimeInStage}
          getLabelTextColor={getLabelTextColor}
          sensors={sensors}
          filteredClients={filteredClients}
          pipelineStages={pipelineStages}
        />
      )}

      {activeTab === 'prospects' && (
        <ProspectsView
          clients={clients}
          pipelineStages={pipelineStages}
          filteredPipelineStages={filteredPipelineStages}
          filteredClients={filteredClients}
          uniqueClientsCount={uniqueClientsCount}
          
          prospectStageFilter={prospectStageFilter}
          setProspectStageFilter={setProspectStageFilter}
          sortConfig={sortConfig}
          setSortConfig={setSortConfig}
          columnWidths={columnWidths}
          resetColumnWidths={resetColumnWidths}
          showDateOfferedFilter={showDateOfferedFilter}
          setShowDateOfferedFilter={setShowDateOfferedFilter}
          showDatePairedFilter={showDatePairedFilter}
          setShowDatePairedFilter={setShowDatePairedFilter}
          showDateTrialFilter={showDateTrialFilter}
          setShowDateTrialFilter={setShowDateTrialFilter}
          dateFilters={dateFilters}
          setDateFilters={setDateFilters}
          tempDateFilters={tempDateFilters}
          setTempDateFilters={setTempDateFilters}
          showTutorFilterDropdown={showTutorFilterDropdown}
          setShowTutorFilterDropdown={setShowTutorFilterDropdown}
          tutorFilterSearchQuery={tutorFilterSearchQuery}
          setTutorFilterSearchQuery={setTutorFilterSearchQuery}
          tutorFilterSearchResults={tutorFilterSearchResults}
          setTutorFilterSearchResults={setTutorFilterSearchResults}
          isSearchingTutorFilter={isSearchingTutorFilter}
          selectedTutorFilter={selectedTutorFilter}
          highlightedTutorFilterIndex={highlightedTutorFilterIndex}
          setHighlightedTutorFilterIndex={setHighlightedTutorFilterIndex}
          highlightedTutorFilterIndexRef={highlightedTutorFilterIndexRef}
          tutorFilterSearchResultsRef={tutorFilterSearchResultsRef}
          dateOfferedFilterRef={dateOfferedFilterRef}
          datePairedFilterRef={datePairedFilterRef}
          dateTrialFilterRef={dateTrialFilterRef}
          tutorFilterDropdownRef={tutorFilterDropdownRef}
          showLeadTypeDropdown={showLeadTypeDropdown}
          setShowLeadTypeDropdown={setShowLeadTypeDropdown}
          leadTypeDropdownRefs={leadTypeDropdownRefs}
          showMarketDropdown={showMarketDropdown}
          setShowMarketDropdown={setShowMarketDropdown}
          marketDropdownRefs={marketDropdownRefs}
          highlightedTutorIndex={highlightedTutorIndex}
          setHighlightedTutorIndex={setHighlightedTutorIndex}
          showTutorDropdown={showTutorDropdown}
          setShowTutorDropdown={setShowTutorDropdown}
          tutorSearchQuery={tutorSearchQuery}
          setTutorSearchQuery={setTutorSearchQuery}
          tutorSearchResults={tutorSearchResults}
          setTutorSearchResults={setTutorSearchResults}
          previousTutorQueryRef={previousTutorQueryRef}
          
          resetManualIntakeForm={resetManualIntakeForm}
          setShowManualIntakeModal={setShowManualIntakeModal}
          handleResizeStart={handleResizeStart}
          handlePipelineStageUpdate={handlePipelineStageUpdate}
          handleProspectStatusUpdate={handleProspectStatusUpdate}
          handleProspectClick={handleProspectClick}
          handleRescore={handleRescore}
          handleReviveProspect={handleReviveProspect}
          updateDateOfferedToTutors={updateDateOfferedToTutors}
          updateDateTutorClientPairedScheduled={updateDateTutorClientPairedScheduled}
          updateDateTrialFirstLesson={updateDateTrialFirstLesson}
          toggleTrialFollowUp={toggleTrialFollowUp}
          toggleFirstPaidScheduled={toggleFirstPaidScheduled}
          toggleFirstPaidCompleted={toggleFirstPaidCompleted}
          toggleClassPack={toggleClassPack}
          updateClubClassName={updateClubClassName}
          searchTutorsForFilter={searchTutorsForFilter}
          searchTutors={searchTutors}
          tutorSearchResultsRef={tutorSearchResultsRef}
          highlightedTutorIndexRef={highlightedTutorIndexRef}
          updateAssignedTutor={updateAssignedTutor}
          handleTutorFilterSelect={handleTutorFilterSelect}
          clearTutorFilter={clearTutorFilter}
          filters={filters}
          setFilters={setFilters}
          updateLeadType={updateLeadType}
          updateMarket={updateMarket}

          saveInlineNote={saveInlineNote}

          hasPrivateLabel={hasPrivateLabel}
          isPending={isPending}
          hasHomeLabel={hasHomeLabel}
          hasOnlineLabel={hasOnlineLabel}
          hasSchoolLabel={hasSchoolLabel}
          hasClubLabel={hasClubLabel}
          isClubCamp={isClubCamp}
          hasNoLabel={hasNoLabel}
          getStageBorderColor={getStageBorderColor}
          getStatusBackgroundColor={getStatusBackgroundColor}
          getStatusTextColor={getStatusTextColor}
          getMarketLabel={getMarketLabel}
          getMarketLabelColorValue={getMarketLabelColorValue}
          getLeadTypeChipColors={getLeadTypeChipColors}
          parseLocalDate={parseLocalDate}
          UNIFIED_DATE_INPUT_BASE={UNIFIED_DATE_INPUT_BASE}
          UNIFIED_SELECT_BASE={UNIFIED_SELECT_BASE}
          MARKET_OPTIONS={MARKET_OPTIONS}
          LEAD_TYPE_OPTIONS={LEAD_TYPE_OPTIONS}
        />
      )}

      {/* Won/Lost Archive Views */}
      {(activeTab === 'won' || activeTab === 'lost') && (
        <WonLostView
          activeTab={activeTab}
          archivedClients={archivedClients}
          archiveLabelFilter={archiveLabelFilter}
          setArchiveLabelFilter={setArchiveLabelFilter}
          hasSchoolLabel={hasSchoolLabel}
          hasClubLabel={hasClubLabel}
          handleReviveProspect={handleReviveProspect}
          formatDate={formatDate}
          getMarketLabel={getMarketLabel}
          getLeadTypeChipColors={getLeadTypeChipColors}
          getStatusBackgroundColor={getStatusBackgroundColor}
          getStatusTextColor={getStatusTextColor}
          handleProspectStatusUpdate={handleProspectStatusUpdate}
          setSelectedProspect={setSelectedProspect}
          setShowProspectModal={setShowProspectModal}
          // Tutor search props
          showTutorDropdown={showTutorDropdown}
          setShowTutorDropdown={setShowTutorDropdown}
          tutorSearchQuery={tutorSearchQuery}
          setTutorSearchQuery={setTutorSearchQuery}
          tutorSearchResults={tutorSearchResults}
          setTutorSearchResults={setTutorSearchResults}
          searchTutors={searchTutors}
          updateAssignedTutor={updateAssignedTutor}
          highlightedTutorIndex={highlightedTutorIndex}
          setHighlightedTutorIndex={setHighlightedTutorIndex}
          tutorSearchResultsRef={tutorSearchResultsRef}
          highlightedTutorIndexRef={highlightedTutorIndexRef}
          previousTutorQueryRef={previousTutorQueryRef}
        />
      )}
      {/* Takeover View */}
      {activeTab === 'takeover' && (
        <TakeoverView
          clients={clients}
          takeoverLabelFilter={takeoverLabelFilter}
          setTakeoverLabelFilter={setTakeoverLabelFilter}
          hasSchoolLabel={hasSchoolLabel}
          hasClubLabel={hasClubLabel}
          formatDate={formatDate}
          setSelectedProspect={setSelectedProspect}
          setShowProspectModal={setShowProspectModal}
          getMarketLabel={getMarketLabel}
          getLeadTypeChipColors={getLeadTypeChipColors}
        />
      )}
      {activeTab === 'bundles' && (
        <BundlesView
          bundles={bundles}
          bundlesMetricsTimeRange={bundlesMetricsTimeRange}
          setBundlesMetricsTimeRange={setBundlesMetricsTimeRange}
          bundlesMetricsTimeRangePreset={bundlesMetricsTimeRangePreset}
          setBundlesMetricsTimeRangePreset={setBundlesMetricsTimeRangePreset}
          getYTDDateRange={getYTDDateRange}
          bundleFilters={bundleFilters}
          setBundleFilters={setBundleFilters}
          bundleSortConfig={bundleSortConfig}
          setBundleSortConfig={setBundleSortConfig}
          bundleSearchQuery={bundleSearchQuery}
          setBundleSearchQuery={setBundleSearchQuery}
          showBundleMarketFilter={showBundleMarketFilter}
          setShowBundleMarketFilter={setShowBundleMarketFilter}
          showBundleSourceFilter={showBundleSourceFilter}
          setShowBundleSourceFilter={setShowBundleSourceFilter}
          bundlePurchaseDateFilterRef={bundlePurchaseDateFilterRef}
          bundleSourceFilterRef={bundleSourceFilterRef}
          bundleMarketFilterRef={bundleMarketFilterRef}
          showCreateBundleModal={showCreateBundleModal}
          setShowCreateBundleModal={setShowCreateBundleModal}
          bundleForm={bundleForm}
          setBundleForm={setBundleForm}
          clientSearchQuery={clientSearchQuery}
          setClientSearchQuery={setClientSearchQuery}
          clientSearchResults={clientSearchResults}
          setClientSearchResults={setClientSearchResults}
          showClientSearchResults={showClientSearchResults}
          setShowClientSearchResults={setShowClientSearchResults}
          clientSearchError={clientSearchError}
          setClientSearchError={setClientSearchError}
          selectedClientFromSearch={selectedClientFromSearch}
          setSelectedClientFromSearch={setSelectedClientFromSearch}
          highlightedClientIndex={highlightedClientIndex}
          setHighlightedClientIndex={setHighlightedClientIndex}
          handleCreateBundle={handleCreateBundle}
          isCreatingBundle={isCreatingBundle}
          isSearchingClients={isSearchingClients}
          searchClientsForBundle={searchClientsForBundle}
          formatDate={formatDate}
          bundlesPage={bundlesPage}
          setBundlesPage={setBundlesPage}
          bundlesPerPage={bundlesPerPage}
          setBundlesPerPage={setBundlesPerPage}
          showBundlePurchaseDateFilter={showBundlePurchaseDateFilter}
          setShowBundlePurchaseDateFilter={setShowBundlePurchaseDateFilter}
          tempBundleDateFilters={tempBundleDateFilters}
          setTempBundleDateFilters={setTempBundleDateFilters}
          bundleNameFilterRef={bundleNameFilterRef}
          showBundleNameFilter={showBundleNameFilter}
          setShowBundleNameFilter={setShowBundleNameFilter}
          getMarketChipColors={getMarketChipColors}
        />
      )}
      {activeTab === 'analytics' && (
        <AnalyticsView
          analytics={analytics}
          clients={clients}
          analyticsTimePeriod={analyticsTimePeriod}
          setAnalyticsTimePeriod={setAnalyticsTimePeriod}
          cohortData={cohortData}
          cohortLoading={cohortLoading}
          cohortFilters={cohortFilters}
          onCohortFilterChange={handleCohortFilterChange}
          onCohortCellClick={handleCohortCellClick}
          cohortDetailModal={cohortDetailModal}
          onCloseCohortDetailModal={closeCohortDetailModal}
          fetchCohortData={fetchCohortData}
          onAcquiredClick={handleAcquiredClick}
          acquiredModal={acquiredModal}
          updateAcquiredModal={updateAcquiredModal}
          closeAcquiredModal={closeAcquiredModal}
        />
      )}

      {/* Prospect Modal - Redesigned with Tabs */}
      {showProspectModal && selectedProspect && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={() => setShowProspectModal(false)}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-5xl max-h-[90vh] flex flex-col">
              {/* Fixed Header with Name, Actions, and Tabs */}
              <div className="bg-white border-b border-neutral-200 flex-shrink-0">
                {/* Top row: Name, Action buttons, Close */}
                <div className="px-6 py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold leading-6 text-neutral-900" id="modal-title">
                      {selectedProspect.first_name} {selectedProspect.last_name}
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Prospect ID: {selectedProspect.id || selectedProspect.client_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleMarkAsLost}
                      className="inline-flex items-center px-3 py-1.5 border border-red-300 text-sm font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      Mark as Lost
                    </button>
                    <button
                      onClick={handleMarkAsWon}
                      className="inline-flex items-center px-3 py-1.5 border border-green-300 text-sm font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                    >
                      Mark as Won
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-white text-neutral-400 hover:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ml-2"
                      onClick={() => setShowProspectModal(false)}
                    >
                      <span className="sr-only">Close</span>
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                {/* Tab navigation */}
                <div className="px-6 border-t border-neutral-100">
                  <nav className="-mb-px flex space-x-8">
                    <button
                      onClick={() => setActiveProspectMainTab('overview')}
                      className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                        activeProspectMainTab === 'overview'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
                      }`}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => setActiveProspectMainTab('activity')}
                      className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                        activeProspectMainTab === 'activity'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
                      }`}
                    >
                      Activity
                    </button>
                    <button
                      onClick={() => setActiveProspectMainTab('booking')}
                      className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium ${
                        activeProspectMainTab === 'booking'
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
                      }`}
                    >
                      Booking Details
                    </button>
                  </nav>
                </div>
              </div>

              {/* Scrollable Content Area */}
              <div className="bg-white px-6 py-4 overflow-y-auto flex-1">

                {/* === OVERVIEW TAB === */}
                {activeProspectMainTab === 'overview' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column: Contact + Profile */}
                    <div className="space-y-4">
                      {/* Contact Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">Contact Information</h4>
                        <div className="space-y-3">
                          <div className="flex items-center">
                            <span className="text-neutral-500 text-sm w-20">Email:</span>
                            {selectedProspect.email ? (
                              <a href={`mailto:${selectedProspect.email}`} className="text-indigo-600 hover:text-indigo-900 text-sm">
                                {selectedProspect.email}
                              </a>
                            ) : (
                              <span className="text-neutral-400 text-sm">N/A</span>
                            )}
                          </div>
                          <div className="flex items-center">
                            <span className="text-neutral-500 text-sm w-20">Phone:</span>
                            {selectedProspect.phone ? (
                              <a href={`tel:${selectedProspect.phone}`} className="text-indigo-600 hover:text-indigo-900 text-sm">
                                {formatPhoneNumber(selectedProspect.phone)}
                              </a>
                            ) : (
                              <span className="text-neutral-400 text-sm">N/A</span>
                            )}
                          </div>
                          <div className="flex items-start">
                            <span className="text-neutral-500 text-sm w-20">Labels:</span>
                            <div className="flex flex-wrap gap-1">
                              {selectedProspect.labels && Array.isArray(selectedProspect.labels) && selectedProspect.labels.length > 0 ? (
                                selectedProspect.labels.map((label, idx) => {
                                  const labelName = typeof label === 'string' ? label : (label?.name || '');
                                  const labelColor = typeof label === 'object' && label?.displayColour
                                    ? label.displayColour
                                    : getLabelColor(labelName);
                                  const textColor = getContrastColor(labelColor);
                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                                      style={{
                                        backgroundColor: labelColor || '#d1d5db',
                                        color: textColor || '#1f2937'
                                      }}
                                    >
                                      {labelName}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-neutral-400 text-sm">No labels</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Profile Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">Profile</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Pipeline Stage:</span>
                            <span className="text-neutral-900 font-medium">{selectedProspect.pipeline_stage || selectedProspect.pipeline_name || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Status:</span>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {selectedProspect.client_status || 'prospect'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">TutorCruncher ID:</span>
                            <a
                              href={`https://account.acmeops.com/clients/${selectedProspect.client_id || selectedProspect.id}/`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              {selectedProspect.client_id || selectedProspect.id}
                            </a>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Created:</span>
                            <span className="text-neutral-900">{formatDate(selectedProspect.client_created_at || selectedProspect.date_registration_complete)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Last Updated:</span>
                            <span className="text-neutral-900">{formatDate(selectedProspect.client_updated_at)}</span>
                          </div>
                          <div className="border-t border-neutral-200 pt-2 mt-2">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Booking Type:</span>
                              <span className="text-neutral-900">{selectedProspect.booking_type || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center mt-2">
                              <span className="text-neutral-500">Payment Status:</span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                selectedProspect.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                                selectedProspect.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-neutral-100 text-neutral-800'
                              }`}>
                                {selectedProspect.payment_status || 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Score + Notes */}
                    <div className="space-y-4">
                      {/* Lead Score Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-neutral-900">Lead Score</h4>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await axios.post(`/api/client-conversion-tracker/${selectedProspect.id}/lead-score/rescore`);
                                fetchAllData();
                              } catch (err) { console.error('Rescore failed:', err); }
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Rescore
                          </button>
                        </div>
                        {selectedProspect.lead_score != null ? (
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${
                                selectedProspect.lead_score_tier === 'Hot' ? 'bg-red-100 text-red-700 border-red-200' :
                                selectedProspect.lead_score_tier === 'Warm' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                                selectedProspect.lead_score_tier === 'Cool' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                                'bg-neutral-100 text-neutral-500 border-neutral-200'
                              }`}>
                                <span className={`w-2 h-2 rounded-full ${
                                  selectedProspect.lead_score_tier === 'Hot' ? 'bg-red-500' :
                                  selectedProspect.lead_score_tier === 'Warm' ? 'bg-orange-500' :
                                  selectedProspect.lead_score_tier === 'Cool' ? 'bg-sky-500' :
                                  'bg-neutral-400'
                                }`} />
                                {selectedProspect.lead_score}/10 — {selectedProspect.lead_score_tier}
                              </span>
                            </div>
                            {selectedProspect.lead_score_reasoning && (
                              <p className="text-xs text-neutral-600 italic mb-2">{selectedProspect.lead_score_reasoning}</p>
                            )}
                            {selectedProspect.lead_score_components && (() => {
                              const c = typeof selectedProspect.lead_score_components === 'string'
                                ? JSON.parse(selectedProspect.lead_score_components)
                                : selectedProspect.lead_score_components;
                              return (
                                <div className="grid grid-cols-5 gap-1 text-xs">
                                  {[
                                    { label: 'Fit', val: c.family_fit },
                                    { label: 'Engage', val: c.engagement },
                                    { label: 'Funnel', val: c.funnel_progress },
                                    { label: 'Source', val: c.source_quality },
                                    { label: 'Timing', val: c.timing },
                                  ].map(({ label, val }) => (
                                    <div key={label} className="text-center">
                                      <div className="text-neutral-400 uppercase" style={{ fontSize: '9px' }}>{label}</div>
                                      <div className="font-semibold text-neutral-700">{val}/10</div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400">Not scored yet. Click Rescore to generate.</p>
                        )}
                      </div>

                      {/* Suggested Tutors Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-neutral-900">Suggested Tutors</h4>
                          <button
                            type="button"
                            onClick={() => fetchRecommendedTutors(selectedProspect.id)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                          >
                            Refresh
                          </button>
                        </div>
                        {loadingRecommendedTutors ? (
                          <p className="text-xs text-neutral-400">Loading recommendations...</p>
                        ) : recommendedTutors.length > 0 ? (
                          <div className="space-y-2">
                            {recommendedTutors.map((tutor, idx) => (
                              <div key={tutor.contractor_id} className="flex items-center justify-between bg-white rounded-md border border-neutral-200 px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">
                                    {idx + 1}
                                  </span>
                                  {tutor.photo && (
                                    <img src={tutor.photo} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-neutral-900 truncate">
                                      {tutor.first_name} {tutor.last_name}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                                      <span title="Match score">{tutor.composite_score}/100</span>
                                      {tutor.review_rating != null && <span title="Rating">★ {tutor.review_rating.toFixed(1)}</span>}
                                      <span title="Active clients">{tutor.active_clients} clients</span>
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await updateAssignedTutor(selectedProspect.id, tutor.contractor_id, `${tutor.first_name} ${tutor.last_name}`);
                                    setSelectedProspect(prev => prev ? { ...prev, assigned_tutor_id: tutor.contractor_id, assigned_tutor_name: `${tutor.first_name} ${tutor.last_name}` } : prev);
                                    fetchRecommendedTutors(selectedProspect.id);
                                  }}
                                  className="flex-shrink-0 ml-2 px-2 py-1 text-xs font-medium text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-200 rounded transition-colors"
                                >
                                  Assign
                                </button>
                              </div>
                            ))}
                            {/* Score breakdown tooltip hint */}
                            <div className="grid grid-cols-4 gap-1 text-center mt-1">
                              {recommendedTutors[0] && (() => {
                                const c = recommendedTutors[0].components;
                                return ['Load', 'Rating', 'Market', 'Certs'].map((label, i) => (
                                  <div key={label}>
                                    <div className="text-neutral-400 uppercase" style={{ fontSize: '8px' }}>{label}</div>
                                    <div className="font-semibold text-neutral-600" style={{ fontSize: '10px' }}>
                                      {[c.load, c.rating, c.label_alignment, c.certification][i]}
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-400">
                            {selectedProspect.assigned_tutor_name
                              ? `Currently assigned: ${selectedProspect.assigned_tutor_name}`
                              : 'No matching tutors found for this market.'}
                          </p>
                        )}
                      </div>

                      {/* Notes Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200 flex flex-col min-h-[300px]">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">Notes</h4>

                      {/* Note input at top */}
                      <div className="mb-4">
                        <div className="relative">
                          <textarea
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (newNote.trim()) {
                                  addNote();
                                }
                              }
                            }}
                            placeholder="Add a note..."
                            className="w-full px-3 py-2 rounded-md border border-neutral-300 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
                            rows={3}
                          />
                        </div>
                        <p className="text-xs text-neutral-500 mt-1">Press Enter to save, Shift+Enter for new line</p>
                      </div>

                      {/* Notes list (newest first) */}
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {notes.length === 0 ? (
                          <p className="text-sm text-neutral-500 text-center py-4">No notes yet</p>
                        ) : (
                          notes.map((note) => (
                            <div key={note.id || note.tc_id} className="rounded-md border border-neutral-200 bg-white p-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="text-sm text-neutral-900 whitespace-pre-wrap">{note.text || note.note_text}</p>
                                  <p className="mt-1 text-xs text-neutral-500">
                                    {note.created_by || 'System'} • {formatDate(note.created_at || note.date)}
                                  </p>
                                </div>
                                <button
                                  onClick={() => deleteNote(note.id || note.tc_id, note)}
                                  className="ml-3 text-neutral-400 hover:text-red-600 focus:outline-none"
                                  title="Delete note"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    </div>{/* end space-y-4 wrapper */}
                  </div>
                )}

                {/* === ACTIVITY TAB === */}
                {activeProspectMainTab === 'activity' && (
                  <div className="space-y-6">
                    {/* Conversion Tracking Card */}
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                      <h4 className="text-sm font-semibold text-neutral-900 mb-4">Conversion Tracking</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 text-sm">Prospect Status:</span>
                            <span className={`text-sm font-medium ${getStatusTextColor(selectedProspect.prospect_status || 'Need To Contact')}`}>
                              {selectedProspect.prospect_status || 'Need To Contact'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500 text-sm">Assigned Tutor:</span>
                            <span className="text-neutral-900 text-sm">{selectedProspect.assigned_tutor_name || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500 text-sm">Trial Date:</span>
                            <span className="text-neutral-900 text-sm">{formatDate(selectedProspect.date_trial_first_lesson) || '-'}</span>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-neutral-500 text-sm">Tutor Paired:</span>
                            <span className="text-neutral-900 text-sm">{formatDate(selectedProspect.date_tutor_client_paired) || '-'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 text-sm">Follow-up Completed:</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              selectedProspect.trial_follow_up_completed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {selectedProspect.trial_follow_up_completed ? 'Yes' : 'No'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500 text-sm">First Paid Lesson:</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              selectedProspect.first_paid_lesson_completed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {selectedProspect.first_paid_lesson_completed ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Status History */}
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                      <h4 className="text-sm font-semibold text-neutral-900 mb-3">Status History</h4>
                      {loadingStatusHistory ? (
                        <p className="text-sm text-neutral-500">Loading history...</p>
                      ) : statusHistory.length === 0 ? (
                        <p className="text-sm text-neutral-500 text-center py-3">No status changes recorded</p>
                      ) : (
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                          {statusHistory.map((event) => {
                            const isManual = event.automation_trigger === 'manual';
                            const fromLabel = event.from_prospect_status || event.from_status || '—';
                            const toLabel = event.to_prospect_status || event.to_status || '—';
                            const date = new Date(event.created_at);
                            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                            return (
                              <div key={event.id} className="flex items-start gap-3 text-sm">
                                <div className="flex-shrink-0 mt-0.5">
                                  <div className={`w-2 h-2 rounded-full ${
                                    event.to_prospect_status === 'Won' ? 'bg-green-500' :
                                    event.to_prospect_status === 'Lost' ? 'bg-red-500' :
                                    'bg-indigo-500'
                                  }`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-neutral-900 font-medium">{fromLabel}</span>
                                    <span className="text-neutral-400">&rarr;</span>
                                    <span className={`font-medium ${
                                      toLabel === 'Won' ? 'text-green-700' :
                                      toLabel === 'Lost' ? 'text-red-700' :
                                      'text-neutral-900'
                                    }`}>{toLabel}</span>
                                    {event.tc_sync_status && (
                                      <span title={event.tc_sync_error || `TC sync: ${event.tc_sync_status}`}>
                                        {event.tc_sync_status === 'success' ? (
                                          <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                        ) : event.tc_sync_status === 'failed' ? (
                                          <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                                        ) : null}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-neutral-500 mt-0.5">
                                    <span>{dateStr} at {timeStr}</span>
                                    <span className="text-neutral-300">|</span>
                                    {isManual ? (
                                      <span>{event.changed_by || 'Unknown'}</span>
                                    ) : (
                                      <span className="italic">{event.automation_trigger || event.change_reason || 'Automation'}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Communications Section */}
                    <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-neutral-900">Communications</h4>
                        <button
                          onClick={syncMissiveMessages}
                          disabled={syncingMissive}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-neutral-600 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
                          title="Sync recent emails from Missive"
                        >
                          <svg className={`h-3.5 w-3.5 ${syncingMissive ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {syncingMissive ? 'Syncing...' : 'Refresh'}
                        </button>
                      </div>
                      {loadingCommunications ? (
                        <p className="text-sm text-neutral-500">Loading communications...</p>
                      ) : missiveCommunications.length === 0 ? (
                        <p className="text-sm text-neutral-500 text-center py-4">No communications found</p>
                      ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {missiveCommunications.map((comm, idx) => {
                            const isOutgoing = comm.rule_type === 'outgoing_email' ||
                              (comm.from && (comm.from.includes('acmeops.com') || comm.from.includes('chessat3.com')));
                            const isExpanded = expandedCommunication === idx;
                            const conversationId = comm.conversation_id || comm.id;
                            const isLoadingBody = loadingBodyFor === conversationId;
                            // Get body from cache, fallback to comm.body or preview
                            const cachedBody = fullBodies[conversationId];
                            const displayBody = cachedBody || comm.body || comm.preview || 'No content available';
                            // Check if content is truncated (preview is typically 140 chars) and we don't have the full body cached
                            const isTruncated = !cachedBody && !comm.body && comm.preview && comm.preview.length >= 135;
                            return (
                              <div
                                key={idx}
                                className={`rounded-md border bg-white ${isOutgoing ? 'border-l-4 border-l-indigo-400 border-neutral-200' : 'border-neutral-200'} transition-all`}
                              >
                                {/* Header - always visible, clickable to expand */}
                                <div
                                  className="p-3 cursor-pointer hover:bg-neutral-50"
                                  onClick={() => handleExpandCommunication(idx, comm.conversation_id || comm.id)}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                          isOutgoing ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-700'
                                        }`}>
                                          {isOutgoing ? '↑ Sent' : '↓ Received'}
                                        </span>
                                        <span className="text-xs text-neutral-500 truncate">
                                          {isOutgoing ? `To: ${comm.participants?.[0] || 'Unknown'}` : `From: ${comm.from || comm.from_name || 'Unknown'}`}
                                        </span>
                                      </div>
                                      <p className="text-sm font-medium text-neutral-900">{comm.subject || comm.title || 'No subject'}</p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <p className="text-xs text-neutral-500 whitespace-nowrap">{formatDate(comm.delivered_at || comm.created_at || comm.date)}</p>
                                      {isExpanded ? (
                                        <ChevronUpIcon className="h-4 w-4 text-neutral-400" />
                                      ) : (
                                        <ChevronDownIcon className="h-4 w-4 text-neutral-400" />
                                      )}
                                    </div>
                                  </div>
                                  {/* Preview when collapsed */}
                                  {!isExpanded && (comm.preview || comm.body) && (
                                    <p className="mt-2 text-sm text-neutral-600 line-clamp-2">{comm.preview || comm.body}</p>
                                  )}
                                </div>

                                {/* Expanded content */}
                                {isExpanded && (
                                  <div className="border-t border-neutral-100">
                                    {/* Email body */}
                                    <div className="p-3 bg-neutral-50">
                                      {isLoadingBody ? (
                                        <div className="flex items-center gap-2 text-sm text-neutral-500">
                                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                          </svg>
                                          Loading full email content...
                                        </div>
                                      ) : (
                                        <>
                                          <div
                                            className="text-sm text-neutral-700 whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(displayBody) }}
                                          />
                                          {isTruncated && (
                                            <p className="mt-2 text-xs text-neutral-400 italic">
                                              Preview only — full email content not available
                                            </p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* === BOOKING DETAILS TAB === */}
                {activeProspectMainTab === 'booking' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Market & Lead Source Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">Market & Lead Source</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Market:</span>
                            <span className="text-neutral-900">{getMarketLabel(selectedProspect) || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Lead Type:</span>
                            <span className="text-neutral-900">{selectedProspect.lead_type || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Heard About:</span>
                            <span className="text-neutral-900">{selectedProspect.heard_about || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">UTM Source:</span>
                            <span className="text-neutral-900">{selectedProspect.utm?.source || selectedProspect.utm_source || 'N/A'}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-neutral-500">Landing URL:</span>
                            {selectedProspect.landing_url ? (
                              <a href={selectedProspect.landing_url} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-900 break-all text-xs mt-1">
                                {selectedProspect.landing_url}
                              </a>
                            ) : (
                              <span className="text-neutral-400 mt-1">N/A</span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Referrer:</span>
                            <span className="text-neutral-900 truncate ml-2">{selectedProspect.referrer || 'N/A'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Booking Summary Card */}
                      <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                        <h4 className="text-sm font-semibold text-neutral-900 mb-3">Booking Summary</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Booking Type:</span>
                            <span className="text-neutral-900">{selectedProspect.booking_type || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-neutral-500">Payment Status:</span>
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              selectedProspect.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                              selectedProspect.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-neutral-100 text-neutral-800'
                            }`}>
                              {selectedProspect.payment_status || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Actual Price:</span>
                            <span className="text-neutral-900 font-medium">${parseFloat(selectedProspect.actual_price || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Original Price:</span>
                            <span className="text-neutral-900">${parseFloat(selectedProspect.original_price || 0).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Submission Status:</span>
                            <span className={`${
                              selectedProspect.submission_status === 'submitted' ? 'text-yellow-600' : 'text-neutral-900'
                            }`}>
                              {selectedProspect.submission_status || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-500">Submission Date:</span>
                            <span className="text-neutral-900">{formatDate(selectedProspect.submission_created_at) || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* View Full Submission Link */}
                    {selectedProspect.submission_id && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            // Fetch the full submission and open the submission modal
                            const fetchSubmission = async () => {
                              try {
                                const response = await fetch(`/api/submissions/${selectedProspect.submission_id}`, {
                                  credentials: 'include'
                                });
                                if (response.ok) {
                                  const submission = await response.json();
                                  setSelectedSubmission(submission);
                                  setShowSubmissionModal(true);
                                }
                              } catch (error) {
                                console.error('Error fetching submission:', error);
                              }
                            };
                            fetchSubmission();
                          }}
                          className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-900"
                        >
                          View Full Submission
                          <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-200 flex items-center justify-between flex-shrink-0">
                <button
                  onClick={requestDeleteProspect}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <TrashIcon className="h-4 w-4 mr-2" />
                  Delete Prospect
                </button>
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50"
                  onClick={() => setShowProspectModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Won Confirmation Modal */}
      {confirmWonState.open && (
        <div className="fixed inset-0 z-popover overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={handleCancelMarkAsWon}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-6 py-4">
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">Mark as Won</h3>
                <p className="text-sm text-neutral-600 mb-4">This will convert the prospect to a live client and move them to the archive.</p>

                {/* Show error with force option */}
                {confirmWonState.showForceOption ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800 mb-2">
                          Validation Warning
                        </p>
                        <p className="text-sm text-amber-700 mb-3">
                          {confirmWonState.errorMessage}
                        </p>
                        <p className="text-sm text-amber-700">
                          As an admin, you can override this check and force mark as Won. This will also set the "First Paid Lesson Completed" flag to true.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <CheckCircleIcon className="h-5 w-5 text-green-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800 mb-2">
                          You are about to mark {confirmWonState.prospectName} as Won.
                        </p>
                        <p className="text-sm text-green-700 mb-2">This will:</p>
                        <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                          <li>Update their status to "live" in TutorCruncher</li>
                          <li>Set their pipeline stage to "Won"</li>
                          <li>Move them to the Archive tab</li>
                          <li>Record this decision with today's date for metrics tracking</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleCancelMarkAsWon}
                    disabled={confirmWonState.loading}
                    className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  {confirmWonState.showForceOption ? (
                    <button
                      onClick={() => handleConfirmMarkAsWon(true)}
                      disabled={confirmWonState.loading}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50"
                    >
                      {confirmWonState.loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                          Force Mark as Won
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConfirmMarkAsWon(false)}
                      disabled={confirmWonState.loading}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {confirmWonState.loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircleIcon className="h-5 w-5 mr-2" />
                          Mark as Won
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Lost Confirmation Modal */}
      {confirmLostState.open && (
        <div className="fixed inset-0 z-popover overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={handleCancelMarkAsLost}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-6 py-4">
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">Mark as Lost</h3>
                <p className="text-sm text-neutral-600 mb-4">This will mark the prospect as dormant and move them to the archive.</p>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-800 mb-2">
                        You are about to mark {confirmLostState.prospectName} as Lost.
                      </p>
                      <p className="text-sm text-red-700 mb-2">This will:</p>
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        <li>Update their status to "dormant" in TutorCruncher</li>
                        <li>Set their pipeline stage to "Lost"</li>
                        <li>Move them to the Archive tab</li>
                        <li>Record this decision with today's date for metrics tracking</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleCancelMarkAsLost}
                    disabled={confirmLostState.loading}
                    className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmMarkAsLost}
                    disabled={confirmLostState.loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {confirmLostState.loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <XCircleIcon className="h-5 w-5 mr-2" />
                        Mark as Lost
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Prospect Confirmation Modal */}
      {confirmDeleteState.open && (
        <div className="fixed inset-0 z-popover overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={handleCancelDelete}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
              <div className="bg-white px-6 py-4">
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">Remove Prospect</h3>
                <p className="text-sm text-neutral-600 mb-4">This removes the prospect from the Client Conversion Tracker. Their TutorCruncher client profile remains untouched.</p>
                
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <XCircleIcon className="h-5 w-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-800 mb-2">
                        You are about to remove {confirmDeleteState.prospectName}.
                      </p>
                      <p className="text-sm text-red-700">
                        Their historical notes and pipeline activity will be deleted here. You can still manage their client record directly in TutorCruncher.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={handleCancelDelete}
                    disabled={confirmDeleteState.loading}
                    className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmDelete}
                    disabled={confirmDeleteState.loading}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                  >
                    {confirmDeleteState.loading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <TrashIcon className="h-5 w-5 mr-2" />
                        Delete Prospect
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Intake Modal */}
      {showManualIntakeModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={() => {
              resetManualIntakeForm();
              setShowManualIntakeModal(false);
            }}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-white px-6 py-4 border-b border-neutral-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold leading-6 text-neutral-900" id="modal-title">
                      Add Prospect
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Create a new TutorCruncher client and add them to the conversion pipeline.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md bg-white text-neutral-400 hover:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onClick={() => {
                      resetManualIntakeForm();
                      setShowManualIntakeModal(false);
                    }}
                  >
                    <span className="sr-only">Close</span>
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
              </div>

              {/* Form Content */}
              <div className="bg-white px-6 py-4">
                {manualIntakeServerError && (
                  <div className="mb-4 rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <ExclamationTriangleIcon className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">Error</h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>{manualIntakeServerError}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={(e) => { e.preventDefault(); handleManualIntakeSubmit(); }} className="space-y-6">
                  {/* Search Existing Client (Optional) */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wide">
                      Search Existing Client (Optional)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={clientSearchQuery}
                        onChange={(e) => handleClientSearchChange(e.target.value)}
                        placeholder="Search by name or email..."
                        className="w-full pl-10 pr-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
                      {showClientSearchResults && clientSearchResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {clientSearchResults.map((client, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => selectClientFromSearch(client)}
                              className="w-full text-left px-4 py-2 hover:bg-neutral-100 text-sm"
                            >
                              {client.firstName} {client.lastName} ({client.email})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Primary Contact */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                      Primary Contact
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          FIRST NAME <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualIntakeForm.first_name || ''}
                          onChange={(e) => handleManualFieldChange('first_name', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            manualIntakeErrors.first_name ? 'border-red-300' : 'border-neutral-300'
                          }`}
                        />
                        {manualIntakeErrors.first_name && (
                          <p className="mt-1 text-sm text-red-600">{manualIntakeErrors.first_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          LAST NAME <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualIntakeForm.last_name || ''}
                          onChange={(e) => handleManualFieldChange('last_name', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            manualIntakeErrors.last_name ? 'border-red-300' : 'border-neutral-300'
                          }`}
                        />
                        {manualIntakeErrors.last_name && (
                          <p className="mt-1 text-sm text-red-600">{manualIntakeErrors.last_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          EMAIL <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          value={manualIntakeForm.email || ''}
                          onChange={(e) => handleManualFieldChange('email', e.target.value)}
                          className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                            manualIntakeErrors.email ? 'border-red-300' : 'border-neutral-300'
                          }`}
                        />
                        {manualIntakeErrors.email && (
                          <p className="mt-1 text-sm text-red-600">{manualIntakeErrors.email}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          PHONE <span className="text-red-500">*</span>
                        </label>
                        <div className="flex">
                          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 text-neutral-500 text-sm">
                            {PHONE_COUNTRY_CODE}
                          </span>
                          <input
                            type="tel"
                            value={manualIntakeForm.phone || ''}
                            onChange={(e) => handleManualFieldChange('phone', normalizeUsPhoneDigits(e.target.value))}
                            placeholder="734-353-9743"
                            maxLength={MAX_US_PHONE_DIGITS}
                            className={`flex-1 px-3 py-2 border rounded-r-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                              manualIntakeErrors.phone ? 'border-red-300' : 'border-neutral-300'
                            }`}
                          />
                        </div>
                        {manualIntakeErrors.phone && (
                          <p className="mt-1 text-sm text-red-600">{manualIntakeErrors.phone}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pipeline Details */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                      Pipeline Details
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">MARKET</label>
                        <select
                          value={manualIntakeForm.market || ''}
                          onChange={(e) => handleManualFieldChange('market', e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">Select market</option>
                          {MARKET_OPTIONS.map(market => (
                            <option key={market} value={market}>{market}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">LEAD TYPE</label>
                        <select
                          value={manualIntakeForm.lead_type || ''}
                          onChange={(e) => handleManualFieldChange('lead_type', e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">Select lead type</option>
                          {LEAD_TYPE_OPTIONS.map(leadType => (
                            <option key={leadType} value={leadType}>{leadType}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">PIPELINE STAGE</label>
                        <select
                          value={manualIntakeForm.pipeline_stage_id || ''}
                          onChange={(e) => handleManualFieldChange('pipeline_stage_id', e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                          <option value="">Auto-select earliest stage</option>
                          {pipelineStages.filter(stage => stage.active).map(stage => (
                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">FOLLOW-UP DUE</label>
                        <DatePicker
                          selected={manualIntakeForm.follow_up_due_at ? new Date(manualIntakeForm.follow_up_due_at) : null}
                          onChange={(date) => handleManualFieldChange('follow_up_due_at', date ? date.toISOString() : '')}
                          dateFormat="MM/dd/yyyy"
                          placeholderText="mm/dd/yyyy"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          wrapperClassName="w-full"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-neutral-700 mb-1">INTAKE SOURCE</label>
                        <input
                          type="text"
                          value={manualIntakeForm.intake_source || ''}
                          onChange={(e) => handleManualFieldChange('intake_source', e.target.value)}
                          placeholder="e.g. Referral, Auction, Event Name"
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-neutral-700 mb-1">INTAKE NOTES</label>
                        <textarea
                          value={manualIntakeForm.intake_notes || ''}
                          onChange={(e) => handleManualFieldChange('intake_notes', e.target.value)}
                          placeholder="Share background details, scheduling constraints, or preferences"
                          rows={4}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Labels */}
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-2 uppercase tracking-wide">
                      Labels (Comma Separated)
                    </label>
                    <input
                      type="text"
                      value={Array.isArray(manualIntakeForm.labels) ? manualIntakeForm.labels.join(', ') : (manualIntakeForm.labels || '')}
                      onChange={(e) => {
                        const labelsArray = e.target.value.split(',').map(l => l.trim()).filter(l => l);
                        handleManualFieldChange('labels', labelsArray);
                      }}
                      placeholder="e.g. NYC, Trial, VIP"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  {/* Advanced Details */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-xs font-semibold text-neutral-700 uppercase tracking-wide">
                        Advanced Details
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedIntake(!showAdvancedIntake)}
                        className="text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        {showAdvancedIntake ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {showAdvancedIntake && (
                      <div className="space-y-4 border-t border-neutral-200 pt-4">
                        {/* Address Information */}
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                            Address Information
                          </label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">STREET</label>
                              <input
                                type="text"
                                value={manualIntakeForm.address?.street || ''}
                                onChange={(e) => handleManualAddressChange('street', e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">CITY</label>
                              <input
                                type="text"
                                value={manualIntakeForm.address?.city || ''}
                                onChange={(e) => handleManualAddressChange('city', e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">STATE</label>
                              <input
                                type="text"
                                value={manualIntakeForm.address?.state || ''}
                                onChange={(e) => handleManualAddressChange('state', e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">POSTAL CODE</label>
                              <input
                                type="text"
                                value={manualIntakeForm.address?.postcode || ''}
                                onChange={(e) => handleManualAddressChange('postcode', e.target.value)}
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">COUNTRY</label>
                              <input
                                type="text"
                                value={manualIntakeForm.address?.country || 'United States'}
                                readOnly
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm bg-neutral-50"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-neutral-700 mb-1">TIMEZONE</label>
                              <input
                                type="text"
                                value={manualIntakeForm.timezone || 'America/New_York'}
                                readOnly
                                className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm bg-neutral-50"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Notification Preferences */}
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                            Notification Preferences
                          </label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {NOTIFICATION_OPTIONS.map(option => (
                              <label key={option.value} className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={manualIntakeForm.received_notifications?.includes(option.value) || false}
                                  onChange={() => handleNotificationToggle(option.value)}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-neutral-300 rounded"
                                />
                                <span className="ml-2 text-sm text-neutral-700">{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Additional Details */}
                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-3 uppercase tracking-wide">
                            Additional Details
                          </label>
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-neutral-700 mb-1">CALENDAR COLOUR</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={manualIntakeForm.calendar_colour || '#6a469d'}
                                onChange={(e) => handleManualFieldChange('calendar_colour', e.target.value)}
                                className="h-10 w-20 border border-neutral-300 rounded cursor-pointer"
                              />
                              <span className="text-sm text-neutral-600">{manualIntakeForm.calendar_colour || '#6a469d'}</span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {EXTRA_ATTR_FIELDS.map(field => (
                              <div key={field.key}>
                                <label className="block text-sm font-medium text-neutral-700 mb-1">{field.label.toUpperCase()}</label>
                                <input
                                  type="text"
                                  value={manualIntakeForm.extra_attrs?.[field.key] || ''}
                                  onChange={(e) => handleManualExtraFieldChange(field.key, e.target.value)}
                                  className="w-full px-3 py-2 border border-neutral-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
                    <button
                      type="button"
                      onClick={() => {
                        resetManualIntakeForm();
                        setShowManualIntakeModal(false);
                      }}
                      className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingManualIntake}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-semibold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingManualIntake ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating...
                        </>
                      ) : (
                        'Create Prospect'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submission Details Modal */}
      {showSubmissionModal && selectedSubmission && (
        <div className="fixed inset-0 z-popover overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-neutral-500 bg-opacity-75 transition-opacity"
            onClick={() => {
              setShowSubmissionModal(false);
              setSelectedSubmission(null);
            }}
          ></div>

          {/* Modal container */}
          <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="bg-white px-6 py-4 border-b border-neutral-200 flex items-center justify-between sticky top-0 z-10">
                <h3 className="text-xl font-semibold leading-6 text-neutral-900">
                  Booking Submission #{selectedSubmission.id}
                </h3>
                <button
                  type="button"
                  className="rounded-md bg-white text-neutral-400 hover:text-neutral-500 focus:outline-none"
                  onClick={() => {
                    setShowSubmissionModal(false);
                    setSelectedSubmission(null);
                  }}
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Parent Information */}
                <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <h4 className="text-sm font-semibold text-neutral-900 mb-3">Parent Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Name:</span>
                      <span className="ml-2 text-neutral-900 font-medium">
                        {selectedSubmission.parentFirst} {selectedSubmission.parentLast}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Email:</span>
                      <a href={`mailto:${selectedSubmission.parentEmail}`} className="ml-2 text-indigo-600 hover:text-indigo-800">
                        {selectedSubmission.parentEmail}
                      </a>
                    </div>
                    <div>
                      <span className="text-neutral-500">Phone:</span>
                      <a href={`tel:${selectedSubmission.parentPhone}`} className="ml-2 text-indigo-600 hover:text-indigo-800">
                        {selectedSubmission.parentPhone}
                      </a>
                    </div>
                    <div>
                      <span className="text-neutral-500">Timezone:</span>
                      <span className="ml-2 text-neutral-900">{selectedSubmission.timezone || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Booking Information */}
                <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <h4 className="text-sm font-semibold text-neutral-900 mb-3">Booking Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Booking Type:</span>
                      <span className="ml-2 text-neutral-900 font-medium">{selectedSubmission.bookingType}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Lesson Type:</span>
                      <span className="ml-2 text-neutral-900">{selectedSubmission.lessonType || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Label:</span>
                      <span className="ml-2 text-neutral-900">{selectedSubmission.labelName || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Payment Status:</span>
                      <span className={`ml-2 inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                        selectedSubmission.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' :
                        selectedSubmission.paymentStatus === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-neutral-100 text-neutral-800'
                      }`}>
                        {selectedSubmission.paymentStatus}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Actual Price:</span>
                      <span className="ml-2 text-neutral-900 font-medium">
                        ${(selectedSubmission.actualPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Original Price:</span>
                      <span className="ml-2 text-neutral-900">
                        ${(selectedSubmission.originalPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Created:</span>
                      <span className="ml-2 text-neutral-900">
                        {selectedSubmission.createdAt ? new Date(selectedSubmission.createdAt).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-neutral-500">Heard About:</span>
                      <span className="ml-2 text-neutral-900">{selectedSubmission.heardAbout || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Students */}
                {selectedSubmission.students && selectedSubmission.students.length > 0 && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">
                      Students ({selectedSubmission.students.length})
                    </h4>
                    <div className="space-y-3">
                      {selectedSubmission.students.map((student, idx) => (
                        <div key={idx} className="bg-white rounded-md p-3 border border-neutral-200">
                          <div className="font-medium text-neutral-900 mb-2">
                            {student.first || student.firstName || student.first_name} {student.last || student.lastName || student.last_name}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            {(student.school) && (
                              <div>
                                <span className="text-neutral-500">School:</span>
                                <span className="ml-2 text-neutral-900">{student.school}</span>
                              </div>
                            )}
                            {(student.experience || student.skillLevel || student.skill_level) && (
                              <div>
                                <span className="text-neutral-500">Level:</span>
                                <span className="ml-2 text-neutral-900">{student.experience || student.skillLevel || student.skill_level}</span>
                              </div>
                            )}
                            {student.dob && (
                              <div>
                                <span className="text-neutral-500">DOB:</span>
                                <span className="ml-2 text-neutral-900">{student.dob}</span>
                              </div>
                            )}
                            {student.age && (
                              <div>
                                <span className="text-neutral-500">Age:</span>
                                <span className="ml-2 text-neutral-900">{student.age}</span>
                              </div>
                            )}
                          </div>
                          {student.notes && (
                            <div className="mt-2 text-sm">
                              <span className="text-neutral-500">Notes:</span>
                              <p className="mt-1 text-neutral-700 bg-neutral-50 p-2 rounded">{student.notes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day & Time Options (Slots) */}
                {selectedSubmission.slots && Array.isArray(selectedSubmission.slots) && selectedSubmission.slots.some(s => s.dayOfWeek !== '-' || s.start !== '-') && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Day & Time (Pick One)</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {selectedSubmission.slots.map((slot, idx) => (
                        <div key={idx} className="bg-white rounded-md p-3 border border-neutral-200 text-sm">
                          <div className="font-medium text-neutral-900">Option {idx + 1}</div>
                          <div className="text-neutral-600">
                            {slot.dayOfWeek && slot.dayOfWeek !== '-' ? slot.dayOfWeek : '—'}: {slot.start && slot.start !== '-' ? slot.start : '—'} - {slot.end && slot.end !== '-' ? slot.end : '—'}
                          </div>
                          {slot.date && <div className="text-neutral-500 text-xs">{slot.date}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Selected Sessions */}
                {selectedSubmission.selectedSessions && selectedSubmission.selectedSessions.length > 0 && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Selected Sessions</h4>
                    <div className="text-sm text-neutral-700">
                      {selectedSubmission.selectedSessions.map((session, idx) => (
                        <div key={idx} className="py-1">
                          {typeof session === 'string' ? session : JSON.stringify(session)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Address */}
                {selectedSubmission.address && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Address</h4>
                    <div className="text-sm text-neutral-700">
                      {typeof selectedSubmission.address === 'object' ? (
                        <div>
                          {selectedSubmission.address.street && <div>{selectedSubmission.address.street}</div>}
                          {(selectedSubmission.address.city || selectedSubmission.address.state || selectedSubmission.address.postcode) && (
                            <div>
                              {selectedSubmission.address.city}{selectedSubmission.address.city && selectedSubmission.address.state ? ', ' : ''}
                              {selectedSubmission.address.state} {selectedSubmission.address.postcode}
                            </div>
                          )}
                          {selectedSubmission.address.country && <div>{selectedSubmission.address.country}</div>}
                        </div>
                      ) : (
                        selectedSubmission.address
                      )}
                    </div>
                  </div>
                )}

                {/* TutorCruncher IDs */}
                {(selectedSubmission.tcClientId || selectedSubmission.tcServiceId) && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">TutorCruncher Links</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {selectedSubmission.tcClientId && (
                        <div>
                          <span className="text-neutral-500">Client ID:</span>
                          <a
                            href={`https://secure.tutorcruncher.com/clients/${selectedSubmission.tcClientId}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-indigo-600 hover:text-indigo-800"
                          >
                            {selectedSubmission.tcClientId}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 inline ml-1" />
                          </a>
                        </div>
                      )}
                      {selectedSubmission.tcServiceId && (
                        <div>
                          <span className="text-neutral-500">Job ID:</span>
                          <a
                            href={`https://secure.tutorcruncher.com/services/${selectedSubmission.tcServiceId}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-indigo-600 hover:text-indigo-800"
                          >
                            {selectedSubmission.tcServiceId}
                            <ArrowTopRightOnSquareIcon className="h-3 w-3 inline ml-1" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Attribution */}
                {(selectedSubmission.landingUrl || selectedSubmission.landing_url || selectedSubmission.utmSource || (selectedSubmission.utm && Object.keys(selectedSubmission.utm).length > 0)) && (
                  <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                    <h4 className="text-sm font-semibold text-neutral-900 mb-3">Attribution</h4>
                    <div className="space-y-3 text-sm">
                      {(selectedSubmission.utm && Object.keys(selectedSubmission.utm).length > 0) && (
                        <div>
                          <span className="text-neutral-500 uppercase text-xs font-medium">UTM Parameters</span>
                          <div className="mt-1 text-neutral-700">
                            {Object.entries(selectedSubmission.utm).map(([key, value]) => (
                              value && <div key={key}><span className="text-neutral-500">{key}:</span> {value}</div>
                            ))}
                            {Object.keys(selectedSubmission.utm).every(k => !selectedSubmission.utm[k]) && '—'}
                          </div>
                        </div>
                      )}
                      {(selectedSubmission.landingUrl || selectedSubmission.landing_url) && (
                        <div>
                          <span className="text-neutral-500 uppercase text-xs font-medium">Landing Page URL</span>
                          <div className="mt-1">
                            <a
                              href={selectedSubmission.landingUrl || selectedSubmission.landing_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 break-all"
                            >
                              {selectedSubmission.landingUrl || selectedSubmission.landing_url}
                            </a>
                          </div>
                        </div>
                      )}
                      {selectedSubmission.referrer && (
                        <div>
                          <span className="text-neutral-500 uppercase text-xs font-medium">Referrer</span>
                          <div className="mt-1 text-neutral-700">{selectedSubmission.referrer}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Agreements & Signature */}
                <div className="bg-neutral-50 rounded-lg p-4 border border-neutral-200">
                  <h4 className="text-sm font-semibold text-neutral-900 mb-3">Agreements</h4>
                  <div className="flex flex-wrap gap-4 text-sm mb-4">
                    <div className="flex items-center">
                      {selectedSubmission.agreeCancel ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-red-500 mr-1" />
                      )}
                      <span className="text-neutral-700">Cancellation Policy</span>
                    </div>
                    <div className="flex items-center">
                      {selectedSubmission.agreeService ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-red-500 mr-1" />
                      )}
                      <span className="text-neutral-700">Terms of Service</span>
                    </div>
                    <div className="flex items-center">
                      {selectedSubmission.agreePhoto ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500 mr-1" />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-red-500 mr-1" />
                      )}
                      <span className="text-neutral-700">Photo Release</span>
                    </div>
                  </div>
                  {/* Signature */}
                  {selectedSubmission.signature && (
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <span className="text-neutral-500 uppercase text-xs font-medium">Signature</span>
                      <div className="mt-2 bg-white border border-neutral-200 rounded-md p-2 inline-block">
                        <img
                          src={selectedSubmission.signature}
                          alt="Signature"
                          className="max-h-24 max-w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="bg-neutral-50 px-6 py-4 border-t border-neutral-200 flex justify-end sticky bottom-0">
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-inset ring-neutral-300 hover:bg-neutral-50"
                  onClick={() => {
                    setShowSubmissionModal(false);
                    setSelectedSubmission(null);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClientConversionTracker;
