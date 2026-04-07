import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Link as MuiLink,
  Divider,
  Grid,
  Tabs,
  Tab,
  Card,
  Stack,
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  FormControlLabel,
  Checkbox,
  Alert,
  ListItemIcon,
  ListItemText,
  Collapse,
} from '@mui/material';
import {
  MagnifyingGlassIcon as Search,
  XMarkIcon as Close,
  ArrowTopRightOnSquareIcon as OpenInNew,
  PaperAirplaneIcon as Send,
  CheckCircleIcon as CheckCircle,
  ExclamationTriangleIcon as Warning,
  Squares2X2Icon as DashboardIcon,
  DocumentTextIcon as Receipt,
  AcademicCapIcon as School,
  CreditCardIcon as Payment,
  EllipsisVerticalIcon as MoreVert,
  ClockIcon as History,
  BellAlertIcon as NotificationsActive,
  ChevronDownIcon,
  ChevronUpIcon,
  PhoneIcon as Phone,
  EnvelopeIcon as Email,
  DocumentPlusIcon as NoteAdd,
  PencilIcon as Edit,
  TrashIcon as Delete,
  FunnelIcon as FilterList,
  ChevronLeftIcon as ChevronLeft,
  ChevronRightIcon as ChevronRight,
  FireIcon as LocalFireDepartment,
  CurrencyDollarIcon as AttachMoney,
  EyeIcon as Visibility,
  FlagIcon as Flag,
  CalendarDaysIcon as EventNote,
  BuildingLibraryIcon as AccountBalance,
} from '@heroicons/react/24/outline';
const ExpandMore = ChevronDownIcon;
const ExpandLess = ChevronUpIcon;
const KeyboardArrowDown = ChevronDownIcon;
const KeyboardArrowUp = ChevronUpIcon;
const FlagOutlined = Flag;
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts';
import KpiCard from '../ui/KpiCard';

const brandColors = {
  green: '#34B256',
  pink: '#DA2E72',
  orange: '#F79A30',
  purple: '#6A469D',
  navy: '#2D2F8E',
  cyan: '#50C8DF',
  yellow: '#FACC29',
  light: '#E8FBFF',
};

export default function SchoolPartnersInvoiceFulfillment() {
  const { locationTab, healthFilter } = useOutletContext() || {};
  const toast = useToast();
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [monthFilter, setMonthFilter] = useState('all'); // 'all' or 'YYYY-MM'
  const [kpiFilter, setKpiFilter] = useState(null); // null, 'paid', 'outstanding', 'pastDue30', 'pastDue60'

  // Primary tab: 0=Invoices (new default), 1=Schools
  const [primaryTab, setPrimaryTab] = useState(0);
  // schoolsSubTab removed — Overview is now a primary tab

  // Invoice tab state — all data loaded once, filtered client-side for instant KPI filtering
  const [allInvoices, setAllInvoices] = useState([]); // full unfiltered dataset
  const [invoiceSummary, setInvoiceSummary] = useState(null); // KPI summary
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoicePageSize, setInvoicePageSize] = useState(50);
  const [invoiceSort, setInvoiceSort] = useState('days_outstanding_desc');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('all');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceMonthFilter, setInvoiceMonthFilter] = useState('all');
  const [expandedInvoiceRow, setExpandedInvoiceRow] = useState(null);
  const [schoolsDataLoaded, setSchoolsDataLoaded] = useState(false);
  const searchDebounceRef = useRef(null);

  // Payment modal state
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [sendReceipt, setSendReceipt] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState(null);
  const [checkNumber, setCheckNumber] = useState('');
  const [checkDate, setCheckDate] = useState('');

  // Reminder state
  const [reminderMenuAnchor, setReminderMenuAnchor] = useState(null);
  const [selectedInvoiceForReminder, setSelectedInvoiceForReminder] = useState(null);
  const [reminderHistoryOpen, setReminderHistoryOpen] = useState(false);
  const [reminderHistory, setReminderHistory] = useState([]);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Detail modal state for KPI card drill-downs
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailModalType, setDetailModalType] = useState(null);
  const [detailModalData, setDetailModalData] = useState([]);
  const [detailSortConfig, setDetailSortConfig] = useState({ key: null, direction: 'asc' })

  // Expandable invoice rows state
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [invoiceTimelines, setInvoiceTimelines] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});
  const [newInvoiceNote, setNewInvoiceNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [activityFormInvoice, setActivityFormInvoice] = useState(null);
  const [activityForm, setActivityForm] = useState({
    activityType: '',
    description: '',
    notes: '',
    outcome: '',
    followUpDate: ''
  });
  const [savingActivity, setSavingActivity] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState(null);
  const [timelineInputType, setTimelineInputType] = useState('note'); // 'note', 'phone_call', 'email_sent'

  // Follow-up queue state
  const [followUps, setFollowUps] = useState({ overdue: [], dueToday: [], upcoming: [], total: 0 });
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [followUpQueueOpen, setFollowUpQueueOpen] = useState(true);

  // Flag issue dialog state
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagInvoice, setFlagInvoice] = useState(null);
  const [flagType, setFlagType] = useState('');
  const [flagNote, setFlagNote] = useState('');
  const [flagLoading, setFlagLoading] = useState(false);

  // Checks tab state
  const [checksData, setChecksData] = useState({ checks: [], summary: {} });
  const [checksLoading, setChecksLoading] = useState(false);


  // Action menu state (for MoreVert menu on invoice rows)
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null);
  const [actionMenuInvoice, setActionMenuInvoice] = useState(null);

  // Fetch ALL invoice data once — filtering/sorting/pagination is client-side for instant KPI card response
  const fetchInvoices = useCallback(async () => {
    setInvoiceLoading(true);
    try {
      const params = { pageSize: 9999 }; // fetch all
      if (locationTab && locationTab !== 'all' && locationTab !== 'dormant') {
        params.location = locationTab;
      }
      const response = await axios.get('/api/school-invoice-fulfillment/invoices', {
        withCredentials: true,
        params,
      });
      setAllInvoices(response.data.invoices || []);
      setInvoiceSummary(response.data.summary || null);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      toast.error('Failed to load invoices');
    } finally {
      setInvoiceLoading(false);
    }
  }, [locationTab]);

  // Client-side filtering, sorting, and pagination — instant response to KPI card clicks
  const invoiceData = useMemo(() => {
    let filtered = [...allInvoices];

    // Status filter (KPI cards)
    if (invoiceStatusFilter !== 'all') {
      switch (invoiceStatusFilter) {
        case 'unpaid':
          filtered = filtered.filter(i => i.status === 'unpaid');
          break;
        case 'pending':
          filtered = filtered.filter(i => i.status === 'payment-pending');
          break;
        case 'past_due':
          filtered = filtered.filter(i => i.status === 'unpaid' && i.days_outstanding > 0);
          break;
        case 'past_due_30':
          filtered = filtered.filter(i => i.status === 'unpaid' && i.days_outstanding > 30);
          break;
        case 'paid':
          filtered = filtered.filter(i => i.status === 'paid');
          break;
        case 'resolved_this_week': {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          filtered = filtered.filter(i => i.status === 'paid' && i.date_paid && new Date(i.date_paid) >= sevenDaysAgo);
          break;
        }
      }
    }

    // Search filter
    if (invoiceSearch) {
      const q = invoiceSearch.toLowerCase();
      filtered = filtered.filter(i =>
        (i.school_name || '').toLowerCase().includes(q) ||
        (i.display_id || '').toLowerCase().includes(q)
      );
    }

    // Month filter
    if (invoiceMonthFilter && invoiceMonthFilter !== 'all') {
      filtered = filtered.filter(i => {
        if (!i.date_sent) return false;
        const d = new Date(i.date_sent);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === invoiceMonthFilter;
      });
    }

    // Sort
    const sortFns = {
      days_outstanding_desc: (a, b) => {
        const sp = (inv) => inv.status === 'unpaid' && inv.days_outstanding > 0 ? 4 : inv.status === 'unpaid' ? 3 : inv.status === 'payment-pending' ? 2 : 1;
        return sp(b) - sp(a) || b.days_outstanding - a.days_outstanding || b.amount - a.amount;
      },
      days_outstanding_asc: (a, b) => a.days_outstanding - b.days_outstanding || a.amount - b.amount,
      amount_desc: (a, b) => b.amount - a.amount || b.days_outstanding - a.days_outstanding,
      amount_asc: (a, b) => a.amount - b.amount,
      date_sent_desc: (a, b) => new Date(b.date_sent || 0) - new Date(a.date_sent || 0),
      date_sent_asc: (a, b) => new Date(a.date_sent || 0) - new Date(b.date_sent || 0),
      school_name_asc: (a, b) => (a.school_name || '').localeCompare(b.school_name || '') || b.days_outstanding - a.days_outstanding,
      school_name_desc: (a, b) => (b.school_name || '').localeCompare(a.school_name || '') || b.days_outstanding - a.days_outstanding,
      display_id_desc: (a, b) => (b.display_id || '').localeCompare(a.display_id || ''),
      display_id_asc: (a, b) => (a.display_id || '').localeCompare(b.display_id || ''),
      location_desc: (a, b) => (b.location || '').localeCompare(a.location || ''),
      location_asc: (a, b) => (a.location || '').localeCompare(b.location || ''),
      priority_desc: (a, b) => b.priority_score - a.priority_score || b.days_outstanding - a.days_outstanding,
      priority_asc: (a, b) => a.priority_score - b.priority_score,
    };
    const sortFn = sortFns[invoiceSort] || sortFns.days_outstanding_desc;
    filtered.sort(sortFn);

    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / invoicePageSize);
    const start = (invoicePage - 1) * invoicePageSize;
    const pageInvoices = filtered.slice(start, start + invoicePageSize);

    return {
      invoices: pageInvoices,
      pagination: { page: invoicePage, pageSize: invoicePageSize, totalCount, totalPages },
      summary: invoiceSummary,
    };
  }, [allInvoices, invoiceStatusFilter, invoiceSearch, invoiceMonthFilter, invoiceSort, invoicePage, invoicePageSize, invoiceSummary]);

  // Fetch school data (existing endpoint - lazy loaded)
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get('/api/school-invoice-fulfillment/fulfillment', {
        withCredentials: true,
      });
      setData(response.data);
      setSchoolsDataLoaded(true);
    } catch (err) {
      console.error('Error fetching invoice data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load invoices on mount and when filters change
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Lazy-load schools data when Schools or Overview tab is selected
  useEffect(() => {
    if ((primaryTab === 1 || primaryTab === 2) && !schoolsDataLoaded && !loading) {
      fetchData();
    }
  }, [primaryTab]);

  // Debounced search for invoice tab (client-side filtering, no API call)
  const handleInvoiceSearchChange = (value) => {
    setInvoiceSearch(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setInvoicePage(1);
    }, 300);
  };



  // Filter out voided invoices and calculate counts
  // Helper: split unpaid invoices into outstanding (< 30 days) and past due (30+ days)
  const splitByAge = (invoices) => {
    const now = new Date();
    const outstanding = [];
    const pastDue = [];
    invoices.forEach(inv => {
      const dateSent = inv.date_sent ? new Date(inv.date_sent) : null;
      const daysSince = dateSent ? Math.floor((now - dateSent) / (1000 * 60 * 60 * 24)) : 0;
      if (daysSince >= 30) {
        pastDue.push(inv);
      } else {
        outstanding.push(inv);
      }
    });
    return { outstanding, pastDue };
  };

  const processSchoolData = (school) => {
    const validInvoices = (school.invoices || []).filter(inv =>
      !['cancelled', 'void', 'voided', 'refund', 'refunded'].includes(inv.status?.toLowerCase())
    );

    const paidInvoices = validInvoices.filter(inv =>
      inv.status === 'paid' || inv.is_fulfilled
    );
    const pendingInvoices = validInvoices.filter(inv =>
      inv.status === 'payment-pending' && !inv.is_fulfilled
    );
    const unpaidInvoices = validInvoices.filter(inv =>
      inv.status === 'unpaid' || inv.status === 'payment-pending'
    );

    // Split unpaid into outstanding (< 30 days) and past due (30+ days)
    const { outstanding: outstandingInvoices, pastDue: pastDueInvoices } = splitByAge(unpaidInvoices);

    const totalCollected = paidInvoices.reduce((sum, inv) => sum + (inv.amount_collected || inv.amount || 0), 0);
    const totalPending = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);
    const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (inv.amount_outstanding || inv.amount || 0), 0);
    const totalPastDue = pastDueInvoices.reduce((sum, inv) => sum + (inv.amount_outstanding || inv.amount || 0), 0);

    return {
      ...school,
      paidCount: paidInvoices.length,
      pendingCount: pendingInvoices.length,
      unpaidCount: unpaidInvoices.length,
      outstandingCount: outstandingInvoices.length,
      pastDueCount: pastDueInvoices.length,
      totalCollected,
      totalPending,
      totalOutstanding,
      totalPastDue,
      validInvoices,
      paidInvoices,
      pendingInvoices,
      unpaidInvoices,
      outstandingInvoices,
      pastDueInvoices,
    };
  };

  // Generate list of available months from invoice data
  const availableMonths = useMemo(() => {
    if (!data?.schools) return [];

    const monthsSet = new Set();
    data.schools.forEach(school => {
      (school.invoices || []).forEach(invoice => {
        if (invoice.date_sent) {
          const date = new Date(invoice.date_sent);
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthsSet.add(monthKey);
        }
      });
    });

    // Sort descending (most recent first)
    return Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
  }, [data]);

  // Filter schools based on location, search, and month
  const filteredSchools = useMemo(() => {
    if (!data?.schools) return [];

    // Helper to filter invoices by month
    const filterInvoicesByMonth = (invoices) => {
      if (monthFilter === 'all') return invoices;
      return invoices.filter(inv => {
        if (!inv.date_sent) return false;
        const date = new Date(inv.date_sent);
        const invMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return invMonth === monthFilter;
      });
    };

    let schools = data.schools.map(school => {
      const processed = processSchoolData(school);

      // If month filter is active, re-filter and re-calculate with month-filtered invoices
      if (monthFilter !== 'all') {
        const monthFilteredInvoices = filterInvoicesByMonth(processed.validInvoices);
        const paidInvoices = monthFilteredInvoices.filter(inv => inv.status === 'paid' || inv.is_fulfilled);
        const pendingInvoices = monthFilteredInvoices.filter(inv => inv.status === 'payment-pending' && !inv.is_fulfilled);
        const unpaidInvoices = monthFilteredInvoices.filter(inv => inv.status === 'unpaid' || inv.status === 'payment-pending');
        const { outstanding: outstandingInvoices, pastDue: pastDueInvoices } = splitByAge(unpaidInvoices);

        const totalCollected = paidInvoices.reduce((sum, inv) => sum + (inv.amount_collected || inv.amount || 0), 0);
        const totalOutstanding = outstandingInvoices.reduce((sum, inv) => sum + (inv.amount_outstanding || inv.amount || 0), 0);
        const totalPastDue = pastDueInvoices.reduce((sum, inv) => sum + (inv.amount_outstanding || inv.amount || 0), 0);

        return {
          ...processed,
          validInvoices: monthFilteredInvoices,
          paidInvoices,
          pendingInvoices,
          unpaidInvoices,
          outstandingInvoices,
          pastDueInvoices,
          paidCount: paidInvoices.length,
          pendingCount: pendingInvoices.length,
          unpaidCount: unpaidInvoices.length,
          outstandingCount: outstandingInvoices.length,
          pastDueCount: pastDueInvoices.length,
          totalCollected,
          totalOutstanding,
          totalPastDue,
        };
      }

      return processed;
    });

    // Location filter from parent layout
    if (locationTab && locationTab !== 'all' && locationTab !== 'dormant') {
      schools = schools.filter(s => s.location === locationTab);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      schools = schools.filter(s =>
        s.name?.toLowerCase().includes(query) ||
        s.email?.toLowerCase().includes(query)
      );
    }

    // Sort
    if (sortConfig.key) {
      schools.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal?.toLowerCase() || '';
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return schools;
  }, [data, locationTab, searchQuery, sortConfig, monthFilter]);

  // Apply KPI filter separately so KPI cards always show global totals
  const displaySchools = useMemo(() => {
    if (!kpiFilter) return filteredSchools;
    const now = new Date();
    return filteredSchools.filter(school => {
      if (kpiFilter === 'outstanding') {
        return (school.totalOutstanding || 0) > 0;
      } else if (kpiFilter === 'pending') {
        return school.pendingCount > 0;
      } else if (kpiFilter === 'pastDue30' || kpiFilter === 'pastDue60') {
        const minDays = kpiFilter === 'pastDue60' ? 60 : 30;
        return (school.unpaidInvoices || []).some(inv => {
          if (inv.status !== 'unpaid') return false;
          const dateSent = inv.date_sent ? new Date(inv.date_sent) : null;
          if (!dateSent) return false;
          return Math.floor((now - dateSent) / (1000 * 60 * 60 * 24)) >= minDays;
        });
      } else if (kpiFilter === 'fulfilled') {
        return school.unpaidCount === 0 && school.pendingCount === 0 && school.paidCount > 0;
      } else if (kpiFilter === 'no-invoices') {
        return !school.validInvoices || school.validInvoices.length === 0;
      }
      return true;
    });
  }, [filteredSchools, kpiFilter]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleRowClick = (school) => {
    setSelectedSchool(school);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSchool(null);
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // Payment handlers
  const handleOpenPaymentModal = (invoice, e) => {
    e.stopPropagation();
    setPaymentInvoice(invoice);
    setPaymentAmount((invoice.amount_outstanding || invoice.amount || 0).toString());
    setPaymentMethod('');
    setSendReceipt(false);
    setPaymentError(null);
    setCheckNumber('');
    setCheckDate('');
    setPaymentModalOpen(true);
  };

  const handleClosePaymentModal = () => {
    setPaymentModalOpen(false);
    setPaymentInvoice(null);
    setPaymentAmount('');
    setPaymentMethod('');
    setPaymentError(null);
    setCheckNumber('');
    setCheckDate('');
  };

  const handleTakePayment = async () => {
    if (!paymentMethod) {
      setPaymentError('Please select a payment method');
      return;
    }
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setPaymentError('Please enter a valid amount');
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      await axios.post(
        `/api/school-invoice-fulfillment/invoice/${paymentInvoice.invoice_id}/take-payment`,
        {
          amount: parseFloat(paymentAmount),
          method: paymentMethod,
          send_receipt: sendReceipt,
          ...(paymentMethod === 'cheque' && checkNumber && { check_number: checkNumber }),
          ...(paymentMethod === 'cheque' && checkDate && { check_date: checkDate })
        },
        { withCredentials: true }
      );

      // Refresh invoice list + school data, close modal
      await fetchInvoices();
      if (schoolsDataLoaded) await fetchData();
      handleClosePaymentModal();

      // Update the selected school data if modal is open
      if (selectedSchool) {
        const updatedSchool = processSchoolData(
          data?.schools?.find(s => s.clientId === selectedSchool.clientId) || selectedSchool
        );
        setSelectedSchool(updatedSchool);
      }
    } catch (err) {
      console.error('Error taking payment:', err);
      setPaymentError(err.response?.data?.error || 'Failed to process payment');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Reminder handlers
  const handleOpenReminderMenu = (invoice, e) => {
    e.stopPropagation();
    setSelectedInvoiceForReminder(invoice);
    setReminderMenuAnchor(e.currentTarget);
  };

  const handleCloseReminderMenu = () => {
    setReminderMenuAnchor(null);
  };

  const handleSendReminder = async () => {
    handleCloseReminderMenu();
    setReminderLoading(true);

    try {
      await axios.post(
        `/api/school-invoice-fulfillment/invoice/${selectedInvoiceForReminder.invoice_id}/send-reminder`,
        {},
        { withCredentials: true }
      );

      // Refresh both invoice list and school data
      await fetchInvoices();
      if (schoolsDataLoaded) await fetchData();
      toast.success('Reminder sent successfully');
    } catch (err) {
      console.error('Error sending reminder:', err);
      toast.error(err.response?.data?.error || 'Failed to send reminder');
    } finally {
      setReminderLoading(false);
      setSelectedInvoiceForReminder(null);
    }
  };

  const handleViewReminderHistory = async () => {
    handleCloseReminderMenu();
    setReminderHistoryOpen(true);
    setReminderLoading(true);

    try {
      const response = await axios.get(
        `/api/school-invoice-fulfillment/invoice/${selectedInvoiceForReminder.invoice_id}/reminders`,
        { withCredentials: true }
      );
      setReminderHistory(response.data.reminders || []);
    } catch (err) {
      console.error('Error fetching reminder history:', err);
      setReminderHistory([]);
    } finally {
      setReminderLoading(false);
    }
  };

  const handleCloseReminderHistory = () => {
    setReminderHistoryOpen(false);
    setReminderHistory([]);
    setSelectedInvoiceForReminder(null);
  };

  // Helper: open school modal from invoice row
  const handleOpenSchoolFromInvoice = async (invoice) => {
    // Check cached schools data first
    if (schoolsDataLoaded && data?.schools) {
      const school = data.schools.find(s => s.clientId === invoice.school_client_id);
      if (school) {
        const processed = processSchoolData(school);
        setSelectedSchool(processed);
        setModalOpen(true);
        return;
      }
    }
    // Lightweight single-school fetch
    try {
      const response = await axios.get(`/api/school-invoice-fulfillment/school/${invoice.school_client_id}/detail`, {
        withCredentials: true,
      });
      if (response.data?.school) {
        const processed = processSchoolData(response.data.school);
        setSelectedSchool(processed);
        setModalOpen(true);
      }
    } catch (err) {
      toast.error('Failed to load school details');
    }
  };

  // Invoice table sort handler
  const handleInvoiceSort = (key) => {
    const currentSort = invoiceSort;
    const [currentKey, currentDir] = currentSort.split(/_(?=asc$|desc$)/);
    let newSort;
    if (currentKey === key) {
      newSort = `${key}_${currentDir === 'desc' ? 'asc' : 'desc'}`;
    } else {
      newSort = `${key}_desc`;
    }
    setInvoiceSort(newSort);
    setInvoicePage(1);
  };

  // Get invoice sort indicator
  const getInvoiceSortIndicator = (key) => {
    const [currentKey, currentDir] = invoiceSort.split(/_(?=asc$|desc$)/);
    if (currentKey !== key) return '';
    return currentDir === 'asc' ? ' ↑' : ' ↓';
  };

  // Generate last 12 months for dropdown
  const invoiceMonthOptions = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      months.push({ key, label });
    }
    return months;
  }, []);

  // Status chip color helper
  const getStatusChip = (status, daysOutstanding) => {
    if (status === 'paid') return { label: 'Paid', color: brandColors.green, bg: '#f0fdf4' };
    if (status === 'payment-pending') return { label: 'Pending', color: brandColors.purple, bg: '#f5f3ff' };
    if (status === 'unpaid' && daysOutstanding > 0) return { label: 'Past Due', color: '#DC2626', bg: '#fef2f2' };
    return { label: 'Outstanding', color: brandColors.orange, bg: '#fffbeb' };
  };

  // Days badge color
  const getDaysBadgeColor = (days) => {
    if (days <= 0) return { color: brandColors.green, bg: '#f0fdf4' };
    if (days <= 14) return { color: brandColors.orange, bg: '#fffbeb' };
    if (days <= 30) return { color: '#EA580C', bg: '#fff7ed' };
    return { color: '#DC2626', bg: '#fef2f2' };
  };

  // Priority badge
  const getPriorityBadge = (level, inv) => {
    const days = Math.round(inv?.days_outstanding || 0);
    const amt = inv?.amount || 0;
    const reasons = [];
    // Determine which criteria were met
    if (level === 'critical') {
      if (days > 45) reasons.push(`${days} days overdue (>45)`);
      if (amt > 2000) reasons.push(`$${amt.toLocaleString()} amount (>$2,000)`);
    } else if (level === 'high') {
      if (days > 30) reasons.push(`${days} days overdue (>30)`);
      if (amt > 1000) reasons.push(`$${amt.toLocaleString()} amount (>$1,000)`);
    } else if (level === 'medium') {
      reasons.push(`${days} days overdue (>14)`);
    }
    const tooltip = reasons.length > 0 ? reasons.join(' + ') : 'Within grace period';
    switch (level) {
      case 'critical': return { label: 'Critical', color: '#DC2626', bg: '#fef2f2', tooltip };
      case 'high': return { label: 'High', color: '#EA580C', bg: '#fff7ed', tooltip };
      case 'medium': return { label: 'Medium', color: brandColors.orange, bg: '#fffbeb', tooltip };
      default: return { label: 'Low', color: '#9CA3AF', bg: '#f5f5f5', tooltip };
    }
  };

  // Summary from invoice endpoint (for KPI cards)
  const kpiSummary = invoiceData?.summary || {};
  const collectionsQueue = kpiSummary.collectionsQueue || {};

  // NOTE: Do NOT add early returns here — they break React's rules of hooks
  // because hooks are defined after this point. Loading/error states are
  // handled inline in the JSX for each tab.

  // Calculate totals for summary
  const totals = filteredSchools.reduce((acc, school) => ({
    paidCount: acc.paidCount + school.paidCount,
    pendingCount: acc.pendingCount + school.pendingCount,
    unpaidCount: acc.unpaidCount + school.unpaidCount,
    outstandingCount: acc.outstandingCount + (school.outstandingCount || 0),
    pastDueCount: acc.pastDueCount + (school.pastDueCount || 0),
    totalCollected: acc.totalCollected + school.totalCollected,
    totalPending: acc.totalPending + school.totalPending,
    totalOutstanding: acc.totalOutstanding + school.totalOutstanding,
    totalPastDue: acc.totalPastDue + (school.totalPastDue || 0),
  }), { paidCount: 0, pendingCount: 0, unpaidCount: 0, outstandingCount: 0, pastDueCount: 0, totalCollected: 0, totalPending: 0, totalOutstanding: 0, totalPastDue: 0 });

  // Quick stats counts (for Schools tab overview — only computed when school data loaded)
  const outstandingSchools = filteredSchools.filter(s => s.totalOutstanding > 0);
  const pendingSchools = filteredSchools.filter(s => s.pendingCount > 0);
  const fulfilledSchools = filteredSchools.filter(s => s.paidCount > 0 && s.unpaidCount === 0 && s.pendingCount === 0);
  const noInvoiceSchools = filteredSchools.filter(s => s.validInvoices.length === 0);

  // Pie chart data (for Schools tab overview)
  const pieChartData = [
    { name: 'Collected', value: totals.totalCollected, color: brandColors.green },
    { name: 'Pending', value: totals.totalPending, color: brandColors.yellow },
    { name: 'Outstanding', value: totals.totalOutstanding, color: '#DC2626' },
  ].filter(item => item.value > 0);

  // Handle quick stat card click - open detail modal with schools list
  const handleQuickStatClick = (type) => {
    // Set kpiFilter to filter the Schools tab list
    setKpiFilter(type);
  };

  // Handle sort in detail modal
  const handleDetailSort = (key) => {
    let direction = 'asc';
    if (detailSortConfig.key === key && detailSortConfig.direction === 'asc') {
      direction = 'desc';
    }

    const sortedData = [...detailModalData].sort((a, b) => {
      let aVal, bVal;

      switch (key) {
        case 'schoolName':
          aVal = (a.schoolName || '').toLowerCase();
          bVal = (b.schoolName || '').toLowerCase();
          return direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case 'schoolLocation':
          aVal = (a.schoolLocation || '').toLowerCase();
          bVal = (b.schoolLocation || '').toLowerCase();
          return direction === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        case 'amount':
        case 'amountOutstanding':
        case 'amountCollected':
        case 'amountPending':
        case 'totalInvoiced':
        case 'totalCollected':
        case 'totalOutstanding':
        case 'totalPending':
          aVal = parseFloat(a[key]) || 0;
          bVal = parseFloat(b[key]) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;
        case 'daysOutstanding':
        case 'unpaidCount':
        case 'paidCount':
        case 'pendingCount':
          aVal = parseInt(a[key]) || 0;
          bVal = parseInt(b[key]) || 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;
        case 'dateSent':
        case 'datePaid':
          aVal = a[key] ? new Date(a[key]).getTime() : 0;
          bVal = b[key] ? new Date(b[key]).getTime() : 0;
          return direction === 'asc' ? aVal - bVal : bVal - aVal;
        default:
          return 0;
      }
    });

    setDetailModalData(sortedData);
    setDetailSortConfig({ key, direction });
  };

  const getDetailSortIcon = (columnKey) => {
    if (detailSortConfig.key !== columnKey) return null;
    return detailSortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  // ============================================
  // FOLLOW-UP QUEUE HANDLERS
  // ============================================
  const fetchFollowUps = useCallback(async () => {
    setFollowUpsLoading(true);
    try {
      const response = await axios.get('/api/school-invoice-fulfillment/activity/follow-ups', {
        withCredentials: true,
      });
      setFollowUps(response.data);
    } catch (err) {
      console.error('Error fetching follow-ups:', err);
    } finally {
      setFollowUpsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleCompleteFollowUp = async (activityId) => {
    try {
      await axios.put(
        `/api/school-invoice-fulfillment/activity/${activityId}/complete-followup`,
        {},
        { withCredentials: true }
      );
      toast.success('Follow-up marked complete');
      fetchFollowUps();
    } catch (err) {
      console.error('Error completing follow-up:', err);
      toast.error('Failed to mark follow-up complete');
    }
  };

  // ============================================
  // FLAG ISSUE HANDLERS
  // ============================================
  const handleOpenFlagDialog = (invoice) => {
    setFlagInvoice(invoice);
    setFlagType('');
    setFlagNote('');
    setFlagDialogOpen(true);
    setActionMenuAnchor(null);
  };

  const handleCloseFlagDialog = () => {
    setFlagDialogOpen(false);
    setFlagInvoice(null);
    setFlagType('');
    setFlagNote('');
  };

  const handleSubmitFlag = async () => {
    if (!flagType) return;
    setFlagLoading(true);
    try {
      await axios.post(
        `/api/school-invoice-fulfillment/invoice/${flagInvoice.invoice_id}/flag`,
        { flag: flagType, note: flagNote || null },
        { withCredentials: true }
      );
      toast.success('Invoice flagged');
      handleCloseFlagDialog();
      await fetchInvoices();
    } catch (err) {
      console.error('Error flagging invoice:', err);
      toast.error(err.response?.data?.error || 'Failed to flag invoice');
    } finally {
      setFlagLoading(false);
    }
  };

  const handleClearFlag = async (invoiceId) => {
    try {
      await axios.delete(
        `/api/school-invoice-fulfillment/invoice/${invoiceId}/flag`,
        { withCredentials: true }
      );
      toast.success('Flag cleared');
      await fetchInvoices();
    } catch (err) {
      toast.error('Failed to clear flag');
    }
  };

  // ============================================
  // ACTION MENU HANDLERS (MoreVert menu)
  // ============================================
  const handleOpenActionMenu = (invoice, e) => {
    e.stopPropagation();
    setActionMenuInvoice(invoice);
    setActionMenuAnchor(e.currentTarget);
  };

  const handleCloseActionMenu = () => {
    setActionMenuAnchor(null);
    setActionMenuInvoice(null);
  };

  // ============================================
  // CHECKS TAB HANDLERS
  // ============================================
  const fetchChecks = useCallback(async () => {
    setChecksLoading(true);
    try {
      const response = await axios.get('/api/school-invoice-fulfillment/checks', {
        withCredentials: true,
      });
      setChecksData(response.data);
    } catch (err) {
      console.error('Error fetching checks:', err);
    } finally {
      setChecksLoading(false);
    }
  }, []);

  const handleMarkDeposited = async (checkId) => {
    try {
      await axios.put(
        `/api/school-invoice-fulfillment/checks/${checkId}/deposit`,
        {},
        { withCredentials: true }
      );
      toast.success('Check marked as deposited');
      fetchChecks();
    } catch (err) {
      toast.error('Failed to mark deposited');
    }
  };


  // Invoice timeline/notes/activity handlers
  const fetchInvoiceTimeline = async (invoiceId) => {
    setTimelineLoading(prev => ({ ...prev, [invoiceId]: true }));
    try {
      const response = await axios.get(
        `/api/school-invoice-fulfillment/invoice/${invoiceId}/timeline`,
        { withCredentials: true }
      );
      setInvoiceTimelines(prev => ({ ...prev, [invoiceId]: response.data }));
    } catch (err) {
      console.error('Error fetching timeline:', err);
      setInvoiceTimelines(prev => ({ ...prev, [invoiceId]: [] }));
    } finally {
      setTimelineLoading(prev => ({ ...prev, [invoiceId]: false }));
    }
  };

  const handleToggleInvoiceExpand = (invoiceId) => {
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null);
    } else {
      setExpandedInvoiceId(invoiceId);
      if (!invoiceTimelines[invoiceId]) {
        fetchInvoiceTimeline(invoiceId);
      }
    }
    // Reset form states
    setNewInvoiceNote('');
    setEditingNoteId(null);
    setConfirmDeleteNoteId(null);
  };

  const handleAddInvoiceNote = async (invoiceId, clientId) => {
    if (!newInvoiceNote.trim()) return;
    setSavingNote(true);
    try {
      if (timelineInputType === 'note') {
        await axios.post(
          `/api/school-invoice-fulfillment/invoice/${invoiceId}/notes`,
          { note: newInvoiceNote.trim(), clientId },
          { withCredentials: true }
        );
      } else {
        // Call or email — post as activity
        await axios.post(
          `/api/school-invoice-fulfillment/invoice/${invoiceId}/activity`,
          {
            activityType: timelineInputType,
            description: newInvoiceNote.trim(),
            clientId
          },
          { withCredentials: true }
        );
      }
      setNewInvoiceNote('');
      fetchInvoiceTimeline(invoiceId);
    } catch (err) {
      console.error('Error adding timeline entry:', err);
      toast.error('Failed to add entry');
    } finally {
      setSavingNote(false);
    }
  };

  const handleStartEditNote = (noteId, content) => {
    setEditingNoteId(noteId);
    setEditNoteContent(content);
    setConfirmDeleteNoteId(null);
  };

  const handleSaveEditNote = async (noteId, invoiceId) => {
    if (!editNoteContent.trim()) return;
    setSavingNote(true);
    try {
      await axios.put(
        `/api/school-invoice-fulfillment/notes/${noteId}`,
        { note: editNoteContent.trim() },
        { withCredentials: true }
      );
      setEditingNoteId(null);
      setEditNoteContent('');
      fetchInvoiceTimeline(invoiceId);
    } catch (err) {
      console.error('Error updating note:', err);
      toast.error(err.response?.status === 403 ? 'You can only edit your own notes' : 'Failed to update note');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId, invoiceId) => {
    try {
      await axios.delete(
        `/api/school-invoice-fulfillment/notes/${noteId}`,
        { withCredentials: true }
      );
      setConfirmDeleteNoteId(null);
      fetchInvoiceTimeline(invoiceId);
    } catch (err) {
      console.error('Error deleting note:', err);
      toast.error(err.response?.status === 403 ? 'You can only delete your own notes' : 'Failed to delete note');
    }
  };

  const handleOpenActivityForm = (invoice, type) => {
    setActivityFormInvoice(invoice);
    setActivityForm({
      activityType: type,
      description: '',
      notes: '',
      outcome: '',
      followUpDate: ''
    });
    setActivityFormOpen(true);
  };

  const handleCloseActivityForm = () => {
    setActivityFormOpen(false);
    setActivityFormInvoice(null);
    setActivityForm({
      activityType: '',
      description: '',
      notes: '',
      outcome: '',
      followUpDate: ''
    });
  };

  const handleSaveActivity = async () => {
    if (!activityForm.description.trim()) {
      toast.error('Please enter a description');
      return;
    }
    setSavingActivity(true);
    try {
      await axios.post(
        `/api/school-invoice-fulfillment/invoice/${activityFormInvoice.invoice_id}/activity`,
        {
          activityType: activityForm.activityType,
          description: activityForm.description.trim(),
          notes: activityForm.notes.trim() || null,
          outcome: activityForm.outcome || null,
          followUpDate: activityForm.followUpDate || null,
          clientId: selectedSchool?.clientId
        },
        { withCredentials: true }
      );
      fetchInvoiceTimeline(activityFormInvoice.invoice_id);
      handleCloseActivityForm();
    } catch (err) {
      console.error('Error saving activity:', err);
      toast.error('Failed to save activity');
    } finally {
      setSavingActivity(false);
    }
  };

  // Get activity icon
  const getActivityIcon = (type, source) => {
    if (source === 'tc_webhook') return <NotificationsActive className="h-4 w-4 text-primary-500" />;
    switch (type) {
      case 'phone_call': return <Phone className="h-4 w-4 text-info" />;
      case 'email_sent': return <Email className="h-4 w-4 text-warning" />;
      case 'email_received': return <Email className="h-4 w-4 text-success" />;
      case 'reminder_sent': return <NotificationsActive className="h-4 w-4 text-primary-500" />;
      default: return <NoteAdd className="h-4 w-4 text-accent-navy" />;
    }
  };

  return (
    <Box>
      {/* KPI Cards — powered by invoice endpoint summary */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <KpiCard
            title="Total Outstanding"
            value={formatCurrency((kpiSummary.totalOutstanding || 0) + (kpiSummary.totalPending || 0))}
            subtitle={`${(kpiSummary.totalOutstandingCount || 0) + (kpiSummary.totalPendingCount || 0)} invoices`}
            tone="warning"
            onClick={() => {
              const next = invoiceStatusFilter === 'all' && primaryTab === 0 ? null : 'all';
              if (next) {
                setInvoiceStatusFilter('all');
                setInvoicePage(1);
                setPrimaryTab(0);
              } else {
                setInvoiceStatusFilter('all');
                setInvoicePage(1);
              }
            }}
            active={invoiceStatusFilter === 'all' && primaryTab === 0}
            filterIcon={invoiceStatusFilter === 'all' && primaryTab === 0 ? <FilterList className="h-5 w-5" /> : null}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard
            title="Total Pending"
            value={formatCurrency(kpiSummary.totalPending || 0)}
            subtitle={`${kpiSummary.totalPendingCount || 0} invoices`}
            tone="info"
            onClick={() => {
              setInvoiceStatusFilter(invoiceStatusFilter === 'pending' ? 'all' : 'pending');
              setInvoicePage(1);
              setPrimaryTab(0);
            }}
            active={invoiceStatusFilter === 'pending'}
            filterIcon={invoiceStatusFilter === 'pending' ? <FilterList className="h-5 w-5" /> : null}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard
            title="Total Past Due"
            value={formatCurrency(kpiSummary.totalPastDue || 0)}
            subtitle={`${kpiSummary.totalPastDueCount || 0} invoices (30+ days)`}
            tone="danger"
            onClick={() => {
              setInvoiceStatusFilter(invoiceStatusFilter === 'past_due' ? 'all' : 'past_due');
              setInvoicePage(1);
              setPrimaryTab(0);
            }}
            active={invoiceStatusFilter === 'past_due'}
            filterIcon={invoiceStatusFilter === 'past_due' ? <FilterList className="h-5 w-5" /> : null}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <KpiCard
            title="30+ Days Past Due"
            value={formatCurrency(kpiSummary.totalPastDue30 || 0)}
            subtitle={`${kpiSummary.totalPastDue30Count || 0} invoices (60+ days)`}
            tone="danger"
            onClick={() => {
              setInvoiceStatusFilter(invoiceStatusFilter === 'past_due_30' ? 'all' : 'past_due_30');
              setInvoicePage(1);
              setPrimaryTab(0);
            }}
            active={invoiceStatusFilter === 'past_due_30'}
            filterIcon={invoiceStatusFilter === 'past_due_30' ? <FilterList className="h-5 w-5" /> : null}
          />
        </Grid>
      </Grid>

      {/* Active filter indicator */}
      {invoiceStatusFilter !== 'all' && primaryTab === 0 && (
        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`Filtered: ${invoiceStatusFilter === 'pending' ? 'Pending' : invoiceStatusFilter === 'past_due' ? 'Past Due (30+ days)' : invoiceStatusFilter === 'past_due_30' ? '30+ Days Past Due' : invoiceStatusFilter === 'paid' ? 'Paid' : invoiceStatusFilter === 'unpaid' ? 'Unpaid' : 'All Outstanding'}`}
            onDelete={() => { setInvoiceStatusFilter('all'); setInvoicePage(1); }}
            color="primary"
            variant="outlined"
            size="small"
          />
          <Typography variant="caption" color="text.secondary">
            {invoiceData?.pagination?.totalCount || 0} invoices
          </Typography>
        </Box>
      )}

      {/* Primary Tabs: Invoices | Schools | Overview */}
      <Card sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={primaryTab} onChange={(e, v) => {
            setPrimaryTab(v);
            if (v === 3 && checksData.checks.length === 0) fetchChecks();
          }}>
            <Tab icon={<Receipt className="h-5 w-5" />} iconPosition="start" label={`INVOICES${invoiceData?.pagination ? ` (${invoiceData.pagination.totalCount})` : ''}`} />
            <Tab icon={<School className="h-5 w-5" />} iconPosition="start" label="SCHOOLS" />
            <Tab icon={<DashboardIcon className="h-5 w-5" />} iconPosition="start" label="OVERVIEW" />
            <Tab icon={<AccountBalance className="h-5 w-5" />} iconPosition="start" label={`CHECKS${checksData.summary.pending_count ? ` (${checksData.summary.pending_count})` : ''}`} />
          </Tabs>
        </Box>

        {/* ========== INVOICES TAB ========== */}
        {primaryTab === 0 && (
          <Box sx={{ p: 3 }}>
            {/* Collections Queue Banner */}
            {(collectionsQueue.over14Days > 0) && (
              <Alert
                severity="warning"
                sx={{ mb: 3, borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                icon={<LocalFireDepartment className="h-5 w-5 text-red-600" />}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
                  <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
                    {collectionsQueue.over30Days > 0 && (
                      <Typography variant="body2" fontWeight={600} sx={{ color: '#DC2626' }}>
                        {collectionsQueue.over30Days} invoices &gt;30 days overdue
                      </Typography>
                    )}
                    <Typography variant="body2" fontWeight={500} sx={{ color: '#D97706' }}>
                      {collectionsQueue.over14Days} invoices &gt;14 days overdue
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      <AttachMoney className="h-4 w-4 align-middle" />
                      {formatCurrency(collectionsQueue.totalPastDueAmount || 0)} total past due
                    </Typography>
                  </Box>
                </Box>
              </Alert>
            )}

            {/* Follow-Up Queue */}
            {(followUps.overdue.length > 0 || followUps.dueToday.length > 0) && (
              <Alert
                severity="info"
                sx={{ mb: 3, borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
                icon={<EventNote className="h-5 w-5 text-primary-500" />}
                action={
                  <IconButton size="small" onClick={() => setFollowUpQueueOpen(!followUpQueueOpen)}>
                    {followUpQueueOpen ? <ExpandLess className="h-5 w-5" /> : <ExpandMore className="h-5 w-5" />}
                  </IconButton>
                }
              >
                <Box display="flex" alignItems="center" gap={2} mb={followUpQueueOpen ? 1 : 0}>
                  <Typography variant="body2" fontWeight={600}>
                    Follow-Up Queue
                  </Typography>
                  {followUps.overdue.length > 0 && (
                    <Chip label={`${followUps.overdue.length} overdue`} size="small" sx={{ bgcolor: '#fef2f2', color: '#DC2626', fontWeight: 600 }} />
                  )}
                  {followUps.dueToday.length > 0 && (
                    <Chip label={`${followUps.dueToday.length} due today`} size="small" sx={{ bgcolor: '#fffbeb', color: brandColors.orange, fontWeight: 600 }} />
                  )}
                </Box>
                <Collapse in={followUpQueueOpen}>
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {[...followUps.overdue, ...followUps.dueToday].map((fu) => {
                      const isOverdue = new Date(fu.follow_up_date) < new Date(new Date().toDateString());
                      return (
                        <Box
                          key={fu.id}
                          display="flex"
                          alignItems="center"
                          gap={2}
                          sx={{
                            p: 1,
                            borderRadius: 1,
                            bgcolor: isOverdue ? '#fef2f2' : '#fffbeb',
                            border: `1px solid ${isOverdue ? '#fecaca' : '#fde68a'}`,
                          }}
                        >
                          <Box flex={1}>
                            <Typography variant="body2" fontWeight={500}>
                              {fu.school_name || 'Unknown School'} — Invoice #{fu.display_id}
                              {fu.amount && ` (${formatCurrency(parseFloat(fu.amount))})`}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {fu.description} — {isOverdue ? 'Overdue' : 'Due today'}: {formatDate(fu.follow_up_date)}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<CheckCircle className="h-5 w-5" />}
                            onClick={() => handleCompleteFollowUp(fu.id)}
                            sx={{
                              minWidth: 'auto',
                              px: 1.5,
                              py: 0.25,
                              fontSize: '0.75rem',
                              textTransform: 'none',
                              borderColor: brandColors.green,
                              color: brandColors.green,
                              '&:hover': { borderColor: brandColors.green, bgcolor: `${brandColors.green}10` },
                            }}
                          >
                            Complete
                          </Button>
                        </Box>
                      );
                    })}
                  </Stack>
                </Collapse>
              </Alert>
            )}

            {/* Filter Bar */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
              <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                <TextField
                  placeholder="Search school or invoice..."
                  value={invoiceSearch}
                  onChange={(e) => handleInvoiceSearchChange(e.target.value)}
                  size="small"
                  sx={{ minWidth: 250 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search className="h-5 w-5 text-neutral-500" />
                      </InputAdornment>
                    ),
                    endAdornment: invoiceSearch && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => handleInvoiceSearchChange('')}>
                          <Close className="h-5 w-5" />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={invoiceStatusFilter}
                    onChange={(e) => { setInvoiceStatusFilter(e.target.value); setInvoicePage(1); }}
                    label="Status"
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="past_due">Past Due</MenuItem>
                    <MenuItem value="past_due_30">30+ Days</MenuItem>
                    <MenuItem value="unpaid">Outstanding</MenuItem>
                    <MenuItem value="pending">Pending</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
                    <MenuItem value="resolved_this_week">Resolved This Week</MenuItem>
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={invoiceMonthFilter}
                    onChange={(e) => { setInvoiceMonthFilter(e.target.value); setInvoicePage(1); }}
                    label="Month"
                  >
                    <MenuItem value="all">All Months</MenuItem>
                    {invoiceMonthOptions.map((m) => (
                      <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
              {invoiceData?.pagination && (
                <Typography variant="body2" color="text.secondary">
                  Showing {((invoiceData.pagination.page - 1) * invoiceData.pagination.pageSize) + 1}–{Math.min(invoiceData.pagination.page * invoiceData.pagination.pageSize, invoiceData.pagination.totalCount)} of {invoiceData.pagination.totalCount} invoices
                </Typography>
              )}
            </Box>

            {/* Invoice Table */}
            {invoiceLoading && !invoiceData ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress sx={{ color: brandColors.purple }} />
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #e0e0e0', position: 'relative' }}>
                  {invoiceLoading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: brandColors.purple, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%, 100%': { opacity: 0.3 }, '50%': { opacity: 1 } } }} />
                  )}
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                        <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('display_id')}>
                          Invoice{getInvoiceSortIndicator('display_id')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('school_name')}>
                          School{getInvoiceSortIndicator('school_name')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('location')}>
                          Location{getInvoiceSortIndicator('location')}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('amount')}>
                          Amount{getInvoiceSortIndicator('amount')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('date_sent')}>
                          Date Sent{getInvoiceSortIndicator('date_sent')}
                        </TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('days_outstanding')}>
                          Days{getInvoiceSortIndicator('days_outstanding')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleInvoiceSort('priority')}>
                          Priority{getInvoiceSortIndicator('priority')}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Last Contact</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(!invoiceData?.invoices || invoiceData.invoices.length === 0) ? (
                        <TableRow>
                          <TableCell colSpan={12} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">No invoices found</Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        invoiceData.invoices.map((inv) => {
                          const statusChip = getStatusChip(inv.status, inv.days_outstanding);
                          const daysBadge = getDaysBadgeColor(inv.days_outstanding);
                          const priorityBadge = getPriorityBadge(inv.priority_level, inv);
                          const isExpanded = expandedInvoiceRow === inv.invoice_id;

                          return (
                            <React.Fragment key={inv.invoice_id}>
                              <TableRow
                                hover
                                sx={{
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: `${brandColors.light}50` },
                                  ...(isExpanded && { bgcolor: `${brandColors.light}30` }),
                                }}
                                onClick={() => {
                                  const newId = isExpanded ? null : inv.invoice_id;
                                  setExpandedInvoiceRow(newId);
                                  if (newId) {
                                    if (!invoiceTimelines[newId]) fetchInvoiceTimeline(newId);
                                  }
                                }}
                              >
                                <TableCell sx={{ width: 40 }}>
                                  <IconButton size="small">
                                    {isExpanded ? <KeyboardArrowUp className="h-5 w-5" /> : <KeyboardArrowDown className="h-5 w-5" />}
                                  </IconButton>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" fontWeight={500}>
                                    #{inv.display_id}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <MuiLink
                                    component="button"
                                    variant="body2"
                                    fontWeight={500}
                                    sx={{ textAlign: 'left', color: brandColors.navy, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                    onClick={(e) => { e.stopPropagation(); handleOpenSchoolFromInvoice(inv); }}
                                  >
                                    {inv.school_name}
                                  </MuiLink>
                                </TableCell>
                                <TableCell>
                                  <Chip label={inv.location || 'Unknown'} size="small" sx={{ bgcolor: `${brandColors.purple}15`, color: brandColors.purple, fontWeight: 500 }} />
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight={500}>
                                    {formatCurrency(inv.amount)}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip label={statusChip.label} size="small" sx={{ bgcolor: statusChip.bg, color: statusChip.color, fontWeight: 600, fontSize: '0.7rem' }} />
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">{inv.date_sent ? formatDate(inv.date_sent) : '—'}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                  {inv.days_outstanding > 0 ? (
                                    <Chip
                                      label={`${Math.round(inv.days_outstanding)}d`}
                                      size="small"
                                      sx={{ bgcolor: daysBadge.bg, color: daysBadge.color, fontWeight: 600, fontSize: '0.7rem', minWidth: 40 }}
                                    />
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">—</Typography>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Box display="flex" alignItems="center" gap={0.5}>
                                    <Tooltip title={priorityBadge.tooltip} arrow placement="top">
                                      <Chip label={priorityBadge.label} size="small" sx={{ bgcolor: priorityBadge.bg, color: priorityBadge.color, fontWeight: 600, fontSize: '0.7rem', cursor: 'help' }} />
                                    </Tooltip>
                                    {inv.flag && (
                                      <Tooltip title={`Flagged: ${inv.flag.replace(/_/g, ' ')}${inv.flag_note ? ` — ${inv.flag_note}` : ''}`} arrow>
                                        <Flag className="h-4 w-4 text-red-600" />
                                      </Tooltip>
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                    {inv.last_contact_date ? formatDate(inv.last_contact_date) : '—'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                  <Box display="flex" gap={0.5} justifyContent="flex-end">
                                    {inv.status !== 'paid' && (
                                      <Tooltip title="Take Payment">
                                        <IconButton
                                          size="small"
                                          sx={{ color: brandColors.green }}
                                          onClick={(e) => handleOpenPaymentModal(inv, e)}
                                        >
                                          <Payment className="h-5 w-5" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    {inv.status !== 'paid' && (
                                      <Tooltip title="Send Reminder">
                                        <IconButton
                                          size="small"
                                          sx={{ color: brandColors.orange }}
                                          onClick={(e) => handleOpenReminderMenu(inv, e)}
                                        >
                                          <Send className="h-5 w-5" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                    <Tooltip title="View School">
                                      <IconButton
                                        size="small"
                                        sx={{ color: brandColors.navy }}
                                        onClick={() => handleOpenSchoolFromInvoice(inv)}
                                      >
                                        <Visibility className="h-5 w-5" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="More Actions">
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleOpenActionMenu(inv, e)}
                                      >
                                        <MoreVert className="h-5 w-5" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                              </TableRow>

                              {/* Expanded Row */}
                              <TableRow>
                                <TableCell sx={{ py: 0, border: 0 }} colSpan={12}>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ py: 2, px: 3, bgcolor: '#fafafa', borderBottom: '1px solid #e0e0e0' }}>
                                      <Grid container spacing={3}>
                                        <Grid item xs={12} sm={3}>
                                          <Typography variant="caption" color="text.secondary" display="block">Amount Details</Typography>
                                          <Typography variant="body2">Total: <strong>{formatCurrency(inv.amount)}</strong></Typography>
                                          <Typography variant="body2">Outstanding: <strong style={{ color: inv.amount_outstanding > 0 ? '#DC2626' : brandColors.green }}>
                                            {formatCurrency(inv.amount_outstanding)}
                                          </strong></Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={3}>
                                          <Typography variant="caption" color="text.secondary" display="block">Reminders</Typography>
                                          <Typography variant="body2">{inv.reminder_count} sent</Typography>
                                          {inv.last_reminder_sent_at && (
                                            <Typography variant="caption" color="text.secondary">
                                              Last: {formatDate(inv.last_reminder_sent_at)}
                                            </Typography>
                                          )}
                                        </Grid>
                                        <Grid item xs={12} sm={3}>
                                          <Typography variant="caption" color="text.secondary" display="block">Last Note</Typography>
                                          {inv.last_note ? (
                                            <>
                                              <Typography variant="body2" sx={{ fontStyle: 'italic' }}>"{inv.last_note}"</Typography>
                                              {inv.last_note_date && (
                                                <Typography variant="caption" color="text.secondary">
                                                  {formatDate(inv.last_note_date)}
                                                </Typography>
                                              )}
                                            </>
                                          ) : (
                                            <Typography variant="body2" color="text.secondary">No notes</Typography>
                                          )}
                                        </Grid>
                                      </Grid>

                                      {/* Flag indicator */}
                                      {inv.flag && (
                                        <Alert severity="warning" sx={{ mt: 2, py: 0.5, borderRadius: 1 }} icon={<Flag className="h-4 w-4" />}>
                                          <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="body2" fontWeight={500}>
                                              Flagged: {inv.flag.replace(/_/g, ' ')}
                                            </Typography>
                                            {inv.flag_note && (
                                              <Typography variant="body2" color="text.secondary">— {inv.flag_note}</Typography>
                                            )}
                                            <Button size="small" sx={{ ml: 'auto', textTransform: 'none' }} onClick={() => handleClearFlag(inv.invoice_id)}>
                                              Clear Flag
                                            </Button>
                                          </Box>
                                        </Alert>
                                      )}

                                      <Box mt={2} display="flex" gap={1} alignItems="center">
                                        {inv.status !== 'paid' && (
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<Payment className="h-5 w-5" />}
                                            sx={{ textTransform: 'none' }}
                                            onClick={(e) => handleOpenPaymentModal(inv, e)}
                                          >
                                            Pay
                                          </Button>
                                        )}
                                        {inv.status !== 'paid' && (
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<Send className="h-5 w-5" />}
                                            sx={{ textTransform: 'none' }}
                                            onClick={(e) => handleOpenReminderMenu(inv, e)}
                                          >
                                            Remind
                                          </Button>
                                        )}
                                        {!inv.flag && inv.status !== 'paid' && (
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<FlagOutlined className="h-4 w-4" />}
                                            sx={{ textTransform: 'none', borderColor: '#DC2626', color: '#DC2626' }}
                                            onClick={() => handleOpenFlagDialog(inv)}
                                          >
                                            Flag Issue
                                          </Button>
                                        )}
                                        <Button
                                          size="small"
                                          variant="text"
                                          endIcon={<OpenInNew className="h-5 w-5" />}
                                          sx={{ textTransform: 'none', ml: 'auto', color: brandColors.navy }}
                                          onClick={() => handleOpenSchoolFromInvoice(inv)}
                                        >
                                          View Full Details
                                        </Button>
                                      </Box>
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Pagination */}
                {invoiceData?.pagination && invoiceData.pagination.totalPages > 1 && (
                  <Box display="flex" justifyContent="space-between" alignItems="center" mt={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" color="text.secondary">Rows per page:</Typography>
                      <Select
                        value={invoicePageSize}
                        onChange={(e) => { setInvoicePageSize(e.target.value); setInvoicePage(1); }}
                        size="small"
                        variant="standard"
                        sx={{ minWidth: 60 }}
                      >
                        <MenuItem value={25}>25</MenuItem>
                        <MenuItem value={50}>50</MenuItem>
                        <MenuItem value={100}>100</MenuItem>
                      </Select>
                    </Box>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography variant="body2" color="text.secondary">
                        Page {invoiceData.pagination.page} of {invoiceData.pagination.totalPages}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={invoiceData.pagination.page <= 1}
                        onClick={() => setInvoicePage(p => p - 1)}
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </IconButton>
                      <IconButton
                        size="small"
                        disabled={invoiceData.pagination.page >= invoiceData.pagination.totalPages}
                        onClick={() => setInvoicePage(p => p + 1)}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </IconButton>
                    </Box>
                  </Box>
                )}
              </>
            )}
          </Box>
        )}

        {/* ========== SCHOOLS TAB ========== */}
        {primaryTab === 1 && (
          <Box>
            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress sx={{ color: brandColors.purple }} />
              </Box>
            ) : error ? (
              <Box p={3} textAlign="center">
                <Typography color="error">Error loading school data: {error}</Typography>
                <Button onClick={fetchData} sx={{ mt: 2 }}>Retry</Button>
              </Box>
            ) : (
              <>
                  <Box sx={{ p: 3 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
                      <Box display="flex" gap={2} alignItems="center">
                        <TextField
                          placeholder="Search schools..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          size="small"
                          sx={{ minWidth: 250 }}
                          InputProps={{
                            startAdornment: <InputAdornment position="start"><Search className="h-5 w-5 text-neutral-500" /></InputAdornment>,
                            endAdornment: searchQuery && <InputAdornment position="end"><IconButton size="small" onClick={() => setSearchQuery('')}><Close className="h-5 w-5" /></IconButton></InputAdornment>,
                          }}
                        />
                        <FormControl size="small" sx={{ minWidth: 150 }}>
                          <InputLabel>Month</InputLabel>
                          <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} label="Month">
                            <MenuItem value="all">All Months</MenuItem>
                            {availableMonths.map((month) => {
                              const [year, monthNum] = month.split('-');
                              const date = new Date(parseInt(year), parseInt(monthNum) - 1);
                              const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                              return <MenuItem key={month} value={month}>{label}</MenuItem>;
                            })}
                          </Select>
                        </FormControl>
                      </Box>
                      <Box display="flex" gap={3}>
                        {(() => {
                          const dt = displaySchools.reduce((acc, s) => ({
                            collected: acc.collected + s.totalCollected,
                            outstanding: acc.outstanding + s.totalOutstanding + (s.totalPastDue || 0) + s.totalPending,
                          }), { collected: 0, outstanding: 0 });
                          return (
                            <>
                              <Typography variant="body2" color="text.secondary"><strong>{formatCurrency(dt.collected)}</strong> collected</Typography>
                              <Typography variant="body2" color="text.secondary">
                                <strong style={{ color: dt.outstanding > 0 ? brandColors.orange : 'inherit' }}>{formatCurrency(dt.outstanding)}</strong> outstanding
                              </Typography>
                            </>
                          );
                        })()}
                      </Box>
                    </Box>

                    {/* KPI filter indicator for schools tab */}
                    {kpiFilter && (
                      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          label={`Filtered: ${kpiFilter === 'outstanding' ? 'All Outstanding' : kpiFilter === 'pending' ? 'Pending' : kpiFilter === 'fulfilled' ? 'Fully Paid' : kpiFilter === 'no-invoices' ? 'No Invoices' : kpiFilter === 'pastDue30' ? 'Past Due (30+ days)' : '30+ Days Past Due (60+ days)'}`}
                          onDelete={() => setKpiFilter(null)}
                          color="primary"
                          variant="outlined"
                          size="small"
                        />
                        <Typography variant="caption" color="text.secondary">
                          Showing {displaySchools.length} {displaySchools.length === 1 ? 'school' : 'schools'}
                        </Typography>
                      </Box>
                    )}

                    <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #e0e0e0' }}>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('name')}>School Name{getSortIndicator('name')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('location')}>Location{getSortIndicator('location')}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('paidCount')}>Paid{getSortIndicator('paidCount')}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('unpaidCount')}>Unpaid{getSortIndicator('unpaidCount')}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('totalCollected')}>Collected{getSortIndicator('totalCollected')}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, cursor: 'pointer' }} onClick={() => handleSort('totalOutstanding')}>Outstanding{getSortIndicator('totalOutstanding')}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {displaySchools.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                <Typography color="text.secondary">No schools found</Typography>
                              </TableCell>
                            </TableRow>
                          ) : (
                            displaySchools.map((school) => (
                              <TableRow key={school.clientId} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: `${brandColors.light}50` } }} onClick={() => handleRowClick(school)}>
                                <TableCell>
                                  <Typography fontWeight={500}>{school.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{school.email}</Typography>
                                </TableCell>
                                <TableCell>
                                  <Chip label={school.location || 'Unknown'} size="small" sx={{ bgcolor: `${brandColors.purple}15`, color: brandColors.purple, fontWeight: 500 }} />
                                </TableCell>
                                <TableCell align="center">
                                  <Typography color={brandColors.green} fontWeight={500}>{school.paidCount}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <Typography color={school.unpaidCount > 0 ? brandColors.orange : 'text.secondary'} fontWeight={school.unpaidCount > 0 ? 500 : 400}>{school.unpaidCount}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography color={brandColors.green} fontWeight={500}>{formatCurrency(school.totalCollected)}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography color={school.totalOutstanding > 0 ? brandColors.orange : 'text.secondary'} fontWeight={school.totalOutstanding > 0 ? 600 : 400}>{formatCurrency(school.totalOutstanding)}</Typography>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
              </>
            )}
          </Box>
        )}

        {/* ========== OVERVIEW TAB ========== */}
        {primaryTab === 2 && (
          <Box>
            {loading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress sx={{ color: brandColors.purple }} />
              </Box>
            ) : error ? (
              <Box p={3} textAlign="center">
                <Typography color="error">Error loading data: {error}</Typography>
                <Button onClick={fetchData} sx={{ mt: 2 }}>Retry</Button>
              </Box>
            ) : (
              <Box sx={{ p: 3 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="h6" gutterBottom fontWeight="medium">Collection Status</Typography>
                      <Typography variant="body2" color="textSecondary" gutterBottom>All Outstanding Invoices</Typography>
                      {pieChartData.length > 0 ? (
                        <Box height={280} mt={2}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieChartData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`} outerRadius={90} fill={brandColors.purple} dataKey="value">
                                {pieChartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </Box>
                      ) : (
                        <Box height={280} display="flex" alignItems="center" justifyContent="center">
                          <Typography color="text.secondary">No invoice data available</Typography>
                        </Box>
                      )}
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box>
                      <Typography variant="h6" gutterBottom fontWeight="medium">Quick Stats</Typography>
                      <Stack spacing={2} mt={2}>
                        <Card variant="outlined" sx={{ p: 2, cursor: 'pointer', transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: brandColors.pink } }} onClick={() => { handleQuickStatClick('outstanding'); setPrimaryTab(1); }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box>
                              <Typography variant="body2" color="textSecondary">Schools with Outstanding Invoices</Typography>
                              <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.pink }}>{outstandingSchools.length}</Typography>
                            </Box>
                            <Warning className="h-10 w-10 text-error opacity-30" />
                          </Box>
                        </Card>
                        <Card variant="outlined" sx={{ p: 2, cursor: 'pointer', transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: brandColors.orange } }} onClick={() => { handleQuickStatClick('pending'); setPrimaryTab(1); }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box>
                              <Typography variant="body2" color="textSecondary">Schools with Pending Payments</Typography>
                              <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.orange }}>{pendingSchools.length}</Typography>
                            </Box>
                            <Receipt className="h-10 w-10 text-warning opacity-30" />
                          </Box>
                        </Card>
                        <Card variant="outlined" sx={{ p: 2, cursor: 'pointer', transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: brandColors.green } }} onClick={() => { handleQuickStatClick('fulfilled'); setPrimaryTab(1); }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box>
                              <Typography variant="body2" color="textSecondary">Schools Fully Paid</Typography>
                              <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.green }}>{fulfilledSchools.length}</Typography>
                            </Box>
                            <CheckCircle className="h-10 w-10 text-success opacity-30" />
                          </Box>
                        </Card>
                        <Card variant="outlined" sx={{ p: 2, cursor: 'pointer', transition: 'all 0.2s', '&:hover': { boxShadow: 2, borderColor: brandColors.purple } }} onClick={() => { handleQuickStatClick('no-invoices'); setPrimaryTab(1); }}>
                          <Box display="flex" alignItems="center" justifyContent="space-between">
                            <Box>
                              <Typography variant="body2" color="textSecondary">Schools with No Invoices</Typography>
                              <Typography variant="h5" fontWeight="bold" sx={{ color: brandColors.purple }}>{noInvoiceSchools.length}</Typography>
                            </Box>
                            <School className="h-10 w-10 text-primary-500 opacity-30" />
                          </Box>
                        </Card>
                      </Stack>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        )}

        {/* ========== CHECKS TAB ========== */}
        {primaryTab === 3 && (
          <Box sx={{ p: 3 }}>
            {/* Checks KPI Cards */}
            <Box display="flex" gap={3} mb={3} flexWrap="wrap">
              <KpiCard
                title="Checks Pending Deposit"
                value={parseInt(checksData.summary.pending_count || 0)}
                subValue={formatCurrency(parseFloat(checksData.summary.pending_amount || 0))}
                color={brandColors.orange}
                active={false}
              />
              <KpiCard
                title="Deposited"
                value={parseInt(checksData.summary.deposited_count || 0)}
                color={brandColors.green}
                active={false}
              />
              {parseInt(checksData.summary.flagged_count || 0) > 0 && (
                <KpiCard
                  title="Flagged"
                  value={parseInt(checksData.summary.flagged_count || 0)}
                  color="#DC2626"
                  active={false}
                />
              )}
            </Box>

            {checksLoading ? (
              <Box display="flex" justifyContent="center" py={6}>
                <CircularProgress sx={{ color: brandColors.purple }} />
              </Box>
            ) : (
              <TableContainer component={Paper} sx={{ borderRadius: 2, boxShadow: 'none', border: '1px solid #e0e0e0' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>School</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Check #</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Date Received</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(!checksData.checks || checksData.checks.length === 0) ? (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">No checks recorded yet</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      checksData.checks.map((check) => (
                        <TableRow key={check.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{check.school_name || '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">#{check.display_id || check.invoice_id}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={500}>{formatCurrency(parseFloat(check.amount))}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{check.check_number || '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{check.date_received ? formatDate(check.date_received) : '—'}</Typography>
                          </TableCell>
                          <TableCell>
                            {check.flagged_reason ? (
                              <Chip label={check.flagged_reason} size="small" sx={{ bgcolor: '#fef2f2', color: '#DC2626', fontWeight: 600, fontSize: '0.7rem' }} />
                            ) : check.deposited ? (
                              <Chip label="Deposited" size="small" sx={{ bgcolor: '#f0fdf4', color: brandColors.green, fontWeight: 600, fontSize: '0.7rem' }} />
                            ) : (
                              <Chip label="Pending" size="small" sx={{ bgcolor: '#fffbeb', color: brandColors.orange, fontWeight: 600, fontSize: '0.7rem' }} />
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {!check.deposited && !check.flagged_reason && (
                              <Box display="flex" gap={0.5} justifyContent="flex-end">
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => handleMarkDeposited(check.id)}
                                  sx={{ textTransform: 'none', fontSize: '0.75rem', borderColor: brandColors.green, color: brandColors.green }}
                                >
                                  Mark Deposited
                                </Button>
                              </Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Card>

      {/* Flag Issue Dialog */}
      <Dialog open={flagDialogOpen} onClose={handleCloseFlagDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Box display="flex" alignItems="center" gap={1}>
            <FlagOutlined className="h-5 w-5 text-red-600" />
            <Typography variant="h6" fontWeight={600}>Flag Issue</Typography>
          </Box>
          {flagInvoice && (
            <Typography variant="body2" color="text.secondary">
              Invoice #{flagInvoice.display_id} — {flagInvoice.school_name}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Issue Type</InputLabel>
              <Select value={flagType} onChange={(e) => setFlagType(e.target.value)} label="Issue Type">
                <MenuItem value="voided_check">Voided Check</MenuItem>
                <MenuItem value="check_lost">Check Lost in Mail</MenuItem>
                <MenuItem value="check_issue">Check Issue</MenuItem>
                <MenuItem value="dispute">Dispute</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Note (optional)"
              placeholder="Additional details about the issue..."
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              fullWidth
              multiline
              rows={2}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseFlagDialog} disabled={flagLoading}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSubmitFlag}
            disabled={flagLoading || !flagType}
            sx={{ bgcolor: '#DC2626', '&:hover': { bgcolor: '#B91C1C' } }}
          >
            {flagLoading ? <CircularProgress size={20} color="inherit" /> : 'Flag Invoice'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Action Menu (MoreVert) */}
      <Menu
        anchorEl={actionMenuAnchor}
        open={Boolean(actionMenuAnchor)}
        onClose={handleCloseActionMenu}
      >
        {actionMenuInvoice && !actionMenuInvoice.flag && actionMenuInvoice.status !== 'paid' && (
          <MenuItem onClick={() => handleOpenFlagDialog(actionMenuInvoice)}>
            <ListItemIcon><FlagOutlined className="h-5 w-5 text-red-600" /></ListItemIcon>
            <ListItemText>Flag Issue</ListItemText>
          </MenuItem>
        )}
        {actionMenuInvoice?.flag && (
          <MenuItem onClick={() => { handleClearFlag(actionMenuInvoice.invoice_id); handleCloseActionMenu(); }}>
            <ListItemIcon><Flag fontSize="small" sx={{ color: brandColors.green }} /></ListItemIcon>
            <ListItemText>Clear Flag</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { handleOpenSchoolFromInvoice(actionMenuInvoice); handleCloseActionMenu(); }}>
          <ListItemIcon><Visibility className="h-5 w-5" /></ListItemIcon>
          <ListItemText>View School</ListItemText>
        </MenuItem>
      </Menu>

      {/* Invoice Detail Modal */}
      <Dialog
        open={modalOpen}
        onClose={handleCloseModal}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        {selectedSchool && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="h6" fontWeight={600}>{selectedSchool.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{selectedSchool.email}</Typography>
                </Box>
                <IconButton onClick={handleCloseModal} size="small">
                  <Close className="h-5 w-5" />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              {/* Summary Stats - 4 categories */}
              <Grid container spacing={1.5} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center" p={1.5} bgcolor="#f0fdf4" borderRadius={1} border="1px solid #dcfce7">
                    <Typography variant="h6" fontWeight={600} color={brandColors.green}>
                      {formatCurrency(selectedSchool.totalCollected)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Paid ({selectedSchool.paidCount})</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center" p={1.5} bgcolor={selectedSchool.pendingCount > 0 ? '#f5f3ff' : '#f5f5f5'} borderRadius={1} border={selectedSchool.pendingCount > 0 ? '1px solid #ddd6fe' : '1px solid #e5e5e5'}>
                    <Typography variant="h6" fontWeight={600} color={selectedSchool.pendingCount > 0 ? brandColors.purple : 'text.secondary'}>
                      {formatCurrency(selectedSchool.totalPending)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Pending ({selectedSchool.pendingCount})</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center" p={1.5} bgcolor={(selectedSchool.outstandingCount || 0) > 0 ? '#fffbeb' : '#f5f5f5'} borderRadius={1} border={(selectedSchool.outstandingCount || 0) > 0 ? '1px solid #fef3c7' : '1px solid #e5e5e5'}>
                    <Typography variant="h6" fontWeight={600} color={(selectedSchool.outstandingCount || 0) > 0 ? brandColors.orange : 'text.secondary'}>
                      {formatCurrency(selectedSchool.totalOutstanding)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Outstanding ({selectedSchool.outstandingCount || 0})</Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box textAlign="center" p={1.5} bgcolor={(selectedSchool.pastDueCount || 0) > 0 ? '#fef2f2' : '#f5f5f5'} borderRadius={1} border={(selectedSchool.pastDueCount || 0) > 0 ? '1px solid #fecaca' : '1px solid #e5e5e5'}>
                    <Typography variant="h6" fontWeight={600} color={(selectedSchool.pastDueCount || 0) > 0 ? brandColors.pink : 'text.secondary'}>
                      {formatCurrency(selectedSchool.totalPastDue || 0)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Past Due ({selectedSchool.pastDueCount || 0})</Typography>
                  </Box>
                </Grid>
              </Grid>

              {/* Past Due Invoices Section (30+ days) */}
              {(selectedSchool.pastDueInvoices || []).length > 0 && (
                <Box mb={3}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning className="h-5 w-5 text-error" />
                    Past Due Invoices ({selectedSchool.pastDueInvoices.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#fef2f2' }}>
                          <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Outstanding</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Sent</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Days</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedSchool.pastDueInvoices.map((invoice) => {
                          const daysSince = invoice.date_sent
                            ? Math.floor((new Date() - new Date(invoice.date_sent)) / (1000 * 60 * 60 * 24))
                            : null;
                          const isExpanded = expandedInvoiceId === invoice.invoice_id;
                          const timeline = invoiceTimelines[invoice.invoice_id] || [];

                          return (
                            <React.Fragment key={invoice.invoice_id}>
                              <TableRow
                                hover
                                sx={{
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: `${brandColors.light}50` },
                                  ...(isExpanded && { bgcolor: `${brandColors.light}30` })
                                }}
                                onClick={() => handleToggleInvoiceExpand(invoice.invoice_id)}
                              >
                                <TableCell sx={{ py: 1 }}>
                                  <IconButton size="small" sx={{ p: 0 }}>
                                    {isExpanded ? <ExpandLess className="h-5 w-5" /> : <ExpandMore className="h-5 w-5" />}
                                  </IconButton>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <MuiLink
                                    href={`https://account.acmeops.com/accounting/invoices/${invoice.invoice_id}/`}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                  >
                                    #{invoice.display_id || invoice.invoice_id}
                                    <OpenInNew className="h-3.5 w-3.5" />
                                  </MuiLink>
                                </TableCell>
                                <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                                <TableCell sx={{ color: brandColors.pink, fontWeight: 500 }}>
                                  {formatCurrency(invoice.amount_outstanding || invoice.amount)}
                                </TableCell>
                                <TableCell>{formatDate(invoice.date_sent)}</TableCell>
                                <TableCell>
                                  {daysSince !== null && (
                                    <Chip
                                      label={`${daysSince}d`}
                                      size="small"
                                      sx={{
                                        bgcolor: `${brandColors.pink}20`,
                                        color: brandColors.pink,
                                        fontWeight: 500,
                                      }}
                                    />
                                  )}
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                  <Box display="flex" gap={0.5} justifyContent="flex-end">
                                    <Tooltip title="Take Payment">
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<Payment className="h-5 w-5" />}
                                        onClick={(e) => handleOpenPaymentModal(invoice, e)}
                                        sx={{
                                          minWidth: 'auto',
                                          px: 1,
                                          py: 0.5,
                                          fontSize: '0.75rem',
                                          borderColor: brandColors.green,
                                          color: brandColors.green,
                                          '&:hover': {
                                            borderColor: brandColors.green,
                                            bgcolor: `${brandColors.green}10`,
                                          }
                                        }}
                                      >
                                        Pay
                                      </Button>
                                    </Tooltip>
                                    <Tooltip title="Reminder Options">
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleOpenReminderMenu(invoice, e)}
                                        sx={{ color: brandColors.purple }}
                                      >
                                        <MoreVert className="h-5 w-5" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                              </TableRow>

                              {/* Expandable Notes & Activity Section */}
                              <TableRow>
                                <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e0e0e0' : 'none' }}>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                                      {timelineLoading[invoice.invoice_id] ? (
                                        <Box display="flex" justifyContent="center" py={2}>
                                          <CircularProgress size={24} sx={{ color: brandColors.purple }} />
                                        </Box>
                                      ) : (
                                        <Box>
                                          {/* Unified Input Area */}
                                          <Box sx={{ mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                              <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <History className="h-4 w-4 text-primary-500" />
                                                Timeline ({timeline.length})
                                              </Typography>
                                              <Box display="flex" gap={0.5} ml="auto">
                                                {[
                                                  { type: 'note', label: 'Note', icon: <NoteAdd className="h-3.5 w-3.5" />, color: brandColors.navy },
                                                  { type: 'phone_call', label: 'Call', icon: <Phone className="h-3.5 w-3.5" />, color: brandColors.cyan },
                                                  { type: 'email_sent', label: 'Email', icon: <Email className="h-3.5 w-3.5" />, color: brandColors.orange },
                                                ].map(({ type, label, icon, color }) => (
                                                  <Button
                                                    key={type}
                                                    size="small"
                                                    variant={timelineInputType === type ? 'contained' : 'outlined'}
                                                    startIcon={icon}
                                                    onClick={() => setTimelineInputType(type)}
                                                    sx={{
                                                      minWidth: 'auto',
                                                      px: 1.5,
                                                      py: 0.25,
                                                      fontSize: '0.75rem',
                                                      textTransform: 'none',
                                                      ...(timelineInputType === type
                                                        ? { bgcolor: color, borderColor: color, '&:hover': { bgcolor: color, opacity: 0.9 } }
                                                        : { borderColor: `${color}60`, color, '&:hover': { borderColor: color, bgcolor: `${color}08` } }
                                                      ),
                                                    }}
                                                  >
                                                    {label}
                                                  </Button>
                                                ))}
                                              </Box>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                              <TextField
                                                size="small"
                                                placeholder={
                                                  timelineInputType === 'note' ? 'Add a note...' :
                                                  timelineInputType === 'phone_call' ? 'Log a phone call...' :
                                                  'Log an email...'
                                                }
                                                value={newInvoiceNote}
                                                onChange={(e) => setNewInvoiceNote(e.target.value)}
                                                fullWidth
                                                multiline
                                                maxRows={3}
                                                sx={{
                                                  bgcolor: 'white',
                                                  '& .MuiOutlinedInput-root': {
                                                    borderLeft: `3px solid ${
                                                      timelineInputType === 'note' ? brandColors.navy :
                                                      timelineInputType === 'phone_call' ? brandColors.cyan :
                                                      brandColors.orange
                                                    }`,
                                                  }
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && !e.shiftKey && newInvoiceNote.trim()) {
                                                    e.preventDefault();
                                                    handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId);
                                                  }
                                                }}
                                              />
                                              <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId)}
                                                disabled={savingNote || !newInvoiceNote.trim()}
                                                sx={{
                                                  bgcolor: timelineInputType === 'note' ? brandColors.navy :
                                                           timelineInputType === 'phone_call' ? brandColors.cyan :
                                                           brandColors.orange,
                                                  minWidth: 'auto',
                                                  px: 2,
                                                  '&:hover': { opacity: 0.9 }
                                                }}
                                              >
                                                {savingNote ? <CircularProgress size={16} color="inherit" /> : <Send className="h-4 w-4" />}
                                              </Button>
                                            </Box>
                                            {(timelineInputType === 'phone_call' || timelineInputType === 'email_sent') && (
                                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                Quick log above, or{' '}
                                                <MuiLink
                                                  component="button"
                                                  variant="caption"
                                                  onClick={() => handleOpenActivityForm(invoice, timelineInputType)}
                                                  sx={{ cursor: 'pointer' }}
                                                >
                                                  add with outcome details
                                                </MuiLink>
                                              </Typography>
                                            )}
                                          </Box>

                                          {/* Unified Timeline */}
                                          <Stack spacing={1} sx={{ maxHeight: 280, overflow: 'auto' }}>
                                            {timeline.length === 0 ? (
                                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                                                No activity yet — add a note, call, or email above
                                              </Typography>
                                            ) : (
                                              timeline.map((item) => {
                                                const isNote = item.type === 'note';
                                                const isReminder = item.type === 'reminder';
                                                const borderColor = isReminder ? brandColors.orange :
                                                  isNote ? brandColors.navy :
                                                  item.source === 'tc_webhook' ? brandColors.purple :
                                                  item.activityType === 'phone_call' ? brandColors.cyan :
                                                  item.activityType === 'email_sent' ? brandColors.orange :
                                                  brandColors.navy;

                                                return (
                                                  <Box
                                                    key={`${item.type}-${item.id}`}
                                                    sx={{
                                                      p: 1.5,
                                                      bgcolor: isReminder ? `${brandColors.orange}08` : 'white',
                                                      borderRadius: 1,
                                                      border: '1px solid #e0e0e0',
                                                      borderLeft: `3px solid ${borderColor}`,
                                                      position: 'relative'
                                                    }}
                                                  >
                                                    {isNote && editingNoteId === item.id ? (
                                                      <Box>
                                                        <TextField
                                                          size="small"
                                                          value={editNoteContent}
                                                          onChange={(e) => setEditNoteContent(e.target.value)}
                                                          fullWidth
                                                          multiline
                                                          maxRows={3}
                                                          sx={{ mb: 1 }}
                                                        />
                                                        <Box display="flex" gap={1}>
                                                          <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleSaveEditNote(item.id, invoice.invoice_id)}
                                                            disabled={savingNote}
                                                            sx={{ bgcolor: brandColors.green, '&:hover': { bgcolor: '#2a9248' } }}
                                                          >
                                                            Save
                                                          </Button>
                                                          <Button
                                                            size="small"
                                                            onClick={() => { setEditingNoteId(null); setEditNoteContent(''); }}
                                                          >
                                                            Cancel
                                                          </Button>
                                                        </Box>
                                                      </Box>
                                                    ) : (
                                                      <Box display="flex" alignItems="flex-start" gap={1}>
                                                        {isNote ? (
                                                          <NoteAdd className="h-4 w-4 text-accent-navy mt-0.5" />
                                                        ) : isReminder ? (
                                                          <NotificationsActive className="h-4 w-4 text-warning mt-0.5" />
                                                        ) : (
                                                          getActivityIcon(item.activityType, item.source)
                                                        )}
                                                        <Box flex={1}>
                                                          <Typography variant="body2" fontWeight={isNote ? 400 : 500} sx={{ pr: isNote ? 6 : 0 }}>
                                                            {isReminder
                                                              ? `Reminder: ${item.reminderType || 'sent'}`
                                                              : item.content || item.description}
                                                            {item.source === 'tc_webhook' && (
                                                              <Chip label="via TC" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: `${brandColors.purple}15`, color: brandColors.purple }} />
                                                            )}
                                                          </Typography>
                                                          {item.outcome && (
                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                              Outcome: {item.outcome.replace(/_/g, ' ')}
                                                            </Typography>
                                                          )}
                                                          {item.notes && (
                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
                                                              {item.notes}
                                                            </Typography>
                                                          )}
                                                          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                                            <Chip
                                                              label={isNote ? 'Note' : isReminder ? 'Reminder' : item.activityType === 'phone_call' ? 'Call' : 'Email'}
                                                              size="small"
                                                              sx={{ height: 16, fontSize: '0.6rem', mr: 0.75, bgcolor: `${borderColor}15`, color: borderColor }}
                                                            />
                                                            {item.createdBy || 'System'} • {formatDate(item.createdAt)}
                                                          </Typography>
                                                        </Box>
                                                        {isNote && (item.createdBy === currentUser.name || item.createdBy === currentUser.email) && (
                                                          <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                                                            <IconButton size="small" onClick={() => handleStartEditNote(item.id, item.content)} sx={{ p: 0.5 }}>
                                                              <Edit className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => setConfirmDeleteNoteId(item.id)} sx={{ p: 0.5 }}>
                                                              <Delete className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            {confirmDeleteNoteId === item.id && (
                                                              <Box sx={{ position: 'absolute', right: 0, top: 28, zIndex: 10, width: 200, bgcolor: 'white', borderRadius: 1, boxShadow: 3, border: '1px solid #e0e0e0', p: 1.5 }}>
                                                                <Typography variant="body2" fontWeight={500} gutterBottom>Delete this note?</Typography>
                                                                <Box display="flex" gap={1}>
                                                                  <Button size="small" variant="contained" color="error" onClick={() => handleDeleteNote(item.id, invoice.invoice_id)} sx={{ flex: 1 }}>Delete</Button>
                                                                  <Button size="small" onClick={() => setConfirmDeleteNoteId(null)} sx={{ flex: 1 }}>Cancel</Button>
                                                                </Box>
                                                              </Box>
                                                            )}
                                                          </Box>
                                                        )}
                                                      </Box>
                                                    )}
                                                  </Box>
                                                );
                                              })
                                            )}
                                          </Stack>
                                        </Box>
                                      )}
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* Outstanding Invoices Section (< 30 days) */}
              {(selectedSchool.outstandingInvoices || []).length > 0 && (
                <Box mb={3}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning className="h-5 w-5 text-warning" />
                    Outstanding Invoices ({selectedSchool.outstandingInvoices.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#fef3e2' }}>
                          <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Outstanding</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Sent</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Days</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(selectedSchool.outstandingInvoices || []).map((invoice) => {
                          const daysSince = invoice.date_sent
                            ? Math.floor((new Date() - new Date(invoice.date_sent)) / (1000 * 60 * 60 * 24))
                            : null;
                          const isExpanded = expandedInvoiceId === invoice.invoice_id;
                          const timeline = invoiceTimelines[invoice.invoice_id] || [];

                          return (
                            <React.Fragment key={invoice.invoice_id}>
                              <TableRow
                                hover
                                sx={{
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: `${brandColors.light}50` },
                                  ...(isExpanded && { bgcolor: `${brandColors.light}30` })
                                }}
                                onClick={() => handleToggleInvoiceExpand(invoice.invoice_id)}
                              >
                                <TableCell sx={{ py: 1 }}>
                                  <IconButton size="small" sx={{ p: 0 }}>
                                    {isExpanded ? <ExpandLess className="h-5 w-5" /> : <ExpandMore className="h-5 w-5" />}
                                  </IconButton>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <MuiLink
                                    href={`https://account.acmeops.com/accounting/invoices/${invoice.invoice_id}/`}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                  >
                                    #{invoice.display_id || invoice.invoice_id}
                                    <OpenInNew className="h-3.5 w-3.5" />
                                  </MuiLink>
                                </TableCell>
                                <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                                <TableCell sx={{ color: brandColors.orange, fontWeight: 500 }}>
                                  {formatCurrency(invoice.amount_outstanding || invoice.amount)}
                                </TableCell>
                                <TableCell>{formatDate(invoice.date_sent)}</TableCell>
                                <TableCell>
                                  {daysSince !== null && (
                                    <Chip
                                      label={`${daysSince}d`}
                                      size="small"
                                      sx={{
                                        bgcolor: daysSince > 30 ? `${brandColors.pink}20` : daysSince > 14 ? `${brandColors.orange}20` : '#f5f5f5',
                                        color: daysSince > 30 ? brandColors.pink : daysSince > 14 ? brandColors.orange : 'text.secondary',
                                        fontWeight: 500,
                                      }}
                                    />
                                  )}
                                </TableCell>
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                  <Box display="flex" gap={0.5} justifyContent="flex-end">
                                    <Tooltip title="Take Payment">
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<Payment className="h-5 w-5" />}
                                        onClick={(e) => handleOpenPaymentModal(invoice, e)}
                                        sx={{
                                          minWidth: 'auto',
                                          px: 1,
                                          py: 0.5,
                                          fontSize: '0.75rem',
                                          borderColor: brandColors.green,
                                          color: brandColors.green,
                                          '&:hover': {
                                            borderColor: brandColors.green,
                                            bgcolor: `${brandColors.green}10`,
                                          }
                                        }}
                                      >
                                        Pay
                                      </Button>
                                    </Tooltip>
                                    <Tooltip title="Reminder Options">
                                      <IconButton
                                        size="small"
                                        onClick={(e) => handleOpenReminderMenu(invoice, e)}
                                        sx={{ color: brandColors.purple }}
                                      >
                                        <MoreVert className="h-5 w-5" />
                                      </IconButton>
                                    </Tooltip>
                                  </Box>
                                </TableCell>
                              </TableRow>

                              {/* Expandable Notes & Activity Section */}
                              <TableRow>
                                <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e0e0e0' : 'none' }}>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                                      {timelineLoading[invoice.invoice_id] ? (
                                        <Box display="flex" justifyContent="center" py={2}>
                                          <CircularProgress size={24} sx={{ color: brandColors.purple }} />
                                        </Box>
                                      ) : (
                                        <Box>
                                          {/* Unified Input Area */}
                                          <Box sx={{ mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                              <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <History className="h-4 w-4 text-primary-500" />
                                                Timeline ({timeline.length})
                                              </Typography>
                                              <Box display="flex" gap={0.5} ml="auto">
                                                {[
                                                  { type: 'note', label: 'Note', icon: <NoteAdd className="h-3.5 w-3.5" />, color: brandColors.navy },
                                                  { type: 'phone_call', label: 'Call', icon: <Phone className="h-3.5 w-3.5" />, color: brandColors.cyan },
                                                  { type: 'email_sent', label: 'Email', icon: <Email className="h-3.5 w-3.5" />, color: brandColors.orange },
                                                ].map(({ type, label, icon, color }) => (
                                                  <Button
                                                    key={type}
                                                    size="small"
                                                    variant={timelineInputType === type ? 'contained' : 'outlined'}
                                                    startIcon={icon}
                                                    onClick={() => setTimelineInputType(type)}
                                                    sx={{
                                                      minWidth: 'auto',
                                                      px: 1.5,
                                                      py: 0.25,
                                                      fontSize: '0.75rem',
                                                      textTransform: 'none',
                                                      ...(timelineInputType === type
                                                        ? { bgcolor: color, borderColor: color, '&:hover': { bgcolor: color, opacity: 0.9 } }
                                                        : { borderColor: `${color}60`, color, '&:hover': { borderColor: color, bgcolor: `${color}08` } }
                                                      ),
                                                    }}
                                                  >
                                                    {label}
                                                  </Button>
                                                ))}
                                              </Box>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                              <TextField
                                                size="small"
                                                placeholder={
                                                  timelineInputType === 'note' ? 'Add a note...' :
                                                  timelineInputType === 'phone_call' ? 'Log a phone call...' :
                                                  'Log an email...'
                                                }
                                                value={newInvoiceNote}
                                                onChange={(e) => setNewInvoiceNote(e.target.value)}
                                                fullWidth
                                                multiline
                                                maxRows={3}
                                                sx={{
                                                  bgcolor: 'white',
                                                  '& .MuiOutlinedInput-root': {
                                                    borderLeft: `3px solid ${
                                                      timelineInputType === 'note' ? brandColors.navy :
                                                      timelineInputType === 'phone_call' ? brandColors.cyan :
                                                      brandColors.orange
                                                    }`,
                                                  }
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && !e.shiftKey && newInvoiceNote.trim()) {
                                                    e.preventDefault();
                                                    handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId);
                                                  }
                                                }}
                                              />
                                              <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId)}
                                                disabled={savingNote || !newInvoiceNote.trim()}
                                                sx={{
                                                  bgcolor: timelineInputType === 'note' ? brandColors.navy :
                                                           timelineInputType === 'phone_call' ? brandColors.cyan :
                                                           brandColors.orange,
                                                  minWidth: 'auto',
                                                  px: 2,
                                                  '&:hover': { opacity: 0.9 }
                                                }}
                                              >
                                                {savingNote ? <CircularProgress size={16} color="inherit" /> : <Send className="h-4 w-4" />}
                                              </Button>
                                            </Box>
                                            {(timelineInputType === 'phone_call' || timelineInputType === 'email_sent') && (
                                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                Quick log above, or{' '}
                                                <MuiLink
                                                  component="button"
                                                  variant="caption"
                                                  onClick={() => handleOpenActivityForm(invoice, timelineInputType)}
                                                  sx={{ cursor: 'pointer' }}
                                                >
                                                  add with outcome details
                                                </MuiLink>
                                              </Typography>
                                            )}
                                          </Box>

                                          {/* Unified Timeline */}
                                          <Stack spacing={1} sx={{ maxHeight: 280, overflow: 'auto' }}>
                                            {timeline.length === 0 ? (
                                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                                                No activity yet — add a note, call, or email above
                                              </Typography>
                                            ) : (
                                              timeline.map((item) => {
                                                const isNote = item.type === 'note';
                                                const isReminder = item.type === 'reminder';
                                                const borderColor = isReminder ? brandColors.orange :
                                                  isNote ? brandColors.navy :
                                                  item.source === 'tc_webhook' ? brandColors.purple :
                                                  item.activityType === 'phone_call' ? brandColors.cyan :
                                                  item.activityType === 'email_sent' ? brandColors.orange :
                                                  brandColors.navy;

                                                return (
                                                  <Box
                                                    key={`${item.type}-${item.id}`}
                                                    sx={{
                                                      p: 1.5,
                                                      bgcolor: isReminder ? `${brandColors.orange}08` : 'white',
                                                      borderRadius: 1,
                                                      border: '1px solid #e0e0e0',
                                                      borderLeft: `3px solid ${borderColor}`,
                                                      position: 'relative'
                                                    }}
                                                  >
                                                    {/* Editing note inline */}
                                                    {isNote && editingNoteId === item.id ? (
                                                      <Box>
                                                        <TextField
                                                          size="small"
                                                          value={editNoteContent}
                                                          onChange={(e) => setEditNoteContent(e.target.value)}
                                                          fullWidth
                                                          multiline
                                                          maxRows={3}
                                                          sx={{ mb: 1 }}
                                                        />
                                                        <Box display="flex" gap={1}>
                                                          <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleSaveEditNote(item.id, invoice.invoice_id)}
                                                            disabled={savingNote}
                                                            sx={{ bgcolor: brandColors.green, '&:hover': { bgcolor: '#2a9248' } }}
                                                          >
                                                            Save
                                                          </Button>
                                                          <Button
                                                            size="small"
                                                            onClick={() => { setEditingNoteId(null); setEditNoteContent(''); }}
                                                          >
                                                            Cancel
                                                          </Button>
                                                        </Box>
                                                      </Box>
                                                    ) : (
                                                      <Box display="flex" alignItems="flex-start" gap={1}>
                                                        {isNote ? (
                                                          <NoteAdd className="h-4 w-4 text-accent-navy mt-0.5" />
                                                        ) : isReminder ? (
                                                          <NotificationsActive className="h-4 w-4 text-warning mt-0.5" />
                                                        ) : (
                                                          getActivityIcon(item.activityType, item.source)
                                                        )}
                                                        <Box flex={1}>
                                                          <Typography variant="body2" fontWeight={isNote ? 400 : 500} sx={{ pr: isNote ? 6 : 0 }}>
                                                            {isReminder
                                                              ? `Reminder: ${item.reminderType || 'sent'}`
                                                              : item.content || item.description}
                                                            {item.source === 'tc_webhook' && (
                                                              <Chip label="via TC" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: `${brandColors.purple}15`, color: brandColors.purple }} />
                                                            )}
                                                          </Typography>
                                                          {item.outcome && (
                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                              Outcome: {item.outcome.replace(/_/g, ' ')}
                                                            </Typography>
                                                          )}
                                                          {item.notes && (
                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
                                                              {item.notes}
                                                            </Typography>
                                                          )}
                                                          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                                            <Chip
                                                              label={isNote ? 'Note' : isReminder ? 'Reminder' : item.activityType === 'phone_call' ? 'Call' : 'Email'}
                                                              size="small"
                                                              sx={{ height: 16, fontSize: '0.6rem', mr: 0.75, bgcolor: `${borderColor}15`, color: borderColor }}
                                                            />
                                                            {item.createdBy || 'System'} • {formatDate(item.createdAt)}
                                                          </Typography>
                                                        </Box>
                                                        {/* Edit/Delete for notes */}
                                                        {isNote && (item.createdBy === currentUser.name || item.createdBy === currentUser.email) && (
                                                          <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                                                            <IconButton size="small" onClick={() => handleStartEditNote(item.id, item.content)} sx={{ p: 0.5 }}>
                                                              <Edit className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => setConfirmDeleteNoteId(item.id)} sx={{ p: 0.5 }}>
                                                              <Delete className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            {confirmDeleteNoteId === item.id && (
                                                              <Box sx={{ position: 'absolute', right: 0, top: 28, zIndex: 10, width: 200, bgcolor: 'white', borderRadius: 1, boxShadow: 3, border: '1px solid #e0e0e0', p: 1.5 }}>
                                                                <Typography variant="body2" fontWeight={500} gutterBottom>Delete this note?</Typography>
                                                                <Box display="flex" gap={1}>
                                                                  <Button size="small" variant="contained" color="error" onClick={() => handleDeleteNote(item.id, invoice.invoice_id)} sx={{ flex: 1 }}>Delete</Button>
                                                                  <Button size="small" onClick={() => setConfirmDeleteNoteId(null)} sx={{ flex: 1 }}>Cancel</Button>
                                                                </Box>
                                                              </Box>
                                                            )}
                                                          </Box>
                                                        )}
                                                      </Box>
                                                    )}
                                                  </Box>
                                                );
                                              })
                                            )}
                                          </Stack>
                                        </Box>
                                      )}
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* Pending Invoices Section */}
              {(selectedSchool.pendingInvoices || []).length > 0 && (
                <Box mb={3}>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning className="h-5 w-5 text-primary-500" />
                    Pending Invoices ({selectedSchool.pendingInvoices.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#f5f3ff' }}>
                          <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Sent</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedSchool.pendingInvoices.map((invoice) => (
                          <TableRow key={invoice.invoice_id} hover>
                            <TableCell sx={{ py: 1 }}></TableCell>
                            <TableCell>
                              <MuiLink
                                href={`https://account.acmeops.com/accounting/invoices/${invoice.invoice_id}/`}
                                target="_blank"
                                rel="noopener"
                                sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                              >
                                #{invoice.display_id || invoice.invoice_id}
                                <OpenInNew className="h-3.5 w-3.5" />
                              </MuiLink>
                            </TableCell>
                            <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                            <TableCell>{formatDate(invoice.date_sent)}</TableCell>
                            <TableCell>
                              <Chip label="Awaiting Payment" size="small" sx={{ bgcolor: `${brandColors.purple}15`, color: brandColors.purple, fontWeight: 500 }} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {/* Paid Invoices Section */}
              {selectedSchool.paidInvoices.length > 0 && (
                <Box>
                  <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircle className="h-5 w-5 text-success" />
                    Paid Invoices ({selectedSchool.paidInvoices.length})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                          <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Collected</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Sent</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Paid</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedSchool.paidInvoices.map((invoice) => {
                          const isExpanded = expandedInvoiceId === invoice.invoice_id;
                          const timeline = invoiceTimelines[invoice.invoice_id] || [];

                          return (
                            <React.Fragment key={invoice.invoice_id}>
                              <TableRow
                                hover
                                sx={{
                                  cursor: 'pointer',
                                  '&:hover': { bgcolor: `${brandColors.light}50` },
                                  ...(isExpanded && { bgcolor: `${brandColors.light}30` })
                                }}
                                onClick={() => handleToggleInvoiceExpand(invoice.invoice_id)}
                              >
                                <TableCell sx={{ py: 1 }}>
                                  <IconButton size="small" sx={{ p: 0 }}>
                                    {isExpanded ? <ExpandLess className="h-5 w-5" /> : <ExpandMore className="h-5 w-5" />}
                                  </IconButton>
                                </TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <MuiLink
                                    href={`https://account.acmeops.com/accounting/invoices/${invoice.invoice_id}/`}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                                  >
                                    #{invoice.display_id || invoice.invoice_id}
                                    <OpenInNew className="h-3.5 w-3.5" />
                                  </MuiLink>
                                </TableCell>
                                <TableCell>{formatCurrency(invoice.amount)}</TableCell>
                                <TableCell sx={{ color: brandColors.green, fontWeight: 500 }}>
                                  {formatCurrency(invoice.amount_collected || invoice.amount)}
                                </TableCell>
                                <TableCell>{formatDate(invoice.date_sent)}</TableCell>
                                <TableCell sx={{ color: brandColors.green }}>
                                  {invoice.date_paid ? formatDate(invoice.date_paid) : '-'}
                                </TableCell>
                              </TableRow>

                              {/* Expandable Notes & Activity Section for Paid Invoices */}
                              <TableRow>
                                <TableCell colSpan={6} sx={{ p: 0, borderBottom: isExpanded ? '1px solid #e0e0e0' : 'none' }}>
                                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                    <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                                      {timelineLoading[invoice.invoice_id] ? (
                                        <Box display="flex" justifyContent="center" py={2}>
                                          <CircularProgress size={24} sx={{ color: brandColors.purple }} />
                                        </Box>
                                      ) : (
                                        <Box>
                                          {/* Unified Input Area */}
                                          <Box sx={{ mb: 2 }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                                              <Typography variant="subtitle2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <History className="h-4 w-4 text-primary-500" />
                                                Timeline ({timeline.length})
                                              </Typography>
                                              <Box display="flex" gap={0.5} ml="auto">
                                                {[
                                                  { type: 'note', label: 'Note', icon: <NoteAdd className="h-3.5 w-3.5" />, color: brandColors.navy },
                                                  { type: 'phone_call', label: 'Call', icon: <Phone className="h-3.5 w-3.5" />, color: brandColors.cyan },
                                                  { type: 'email_sent', label: 'Email', icon: <Email className="h-3.5 w-3.5" />, color: brandColors.orange },
                                                ].map(({ type, label, icon, color }) => (
                                                  <Button
                                                    key={type}
                                                    size="small"
                                                    variant={timelineInputType === type ? 'contained' : 'outlined'}
                                                    startIcon={icon}
                                                    onClick={() => setTimelineInputType(type)}
                                                    sx={{
                                                      minWidth: 'auto',
                                                      px: 1.5,
                                                      py: 0.25,
                                                      fontSize: '0.75rem',
                                                      textTransform: 'none',
                                                      ...(timelineInputType === type
                                                        ? { bgcolor: color, borderColor: color, '&:hover': { bgcolor: color, opacity: 0.9 } }
                                                        : { borderColor: `${color}60`, color, '&:hover': { borderColor: color, bgcolor: `${color}08` } }
                                                      ),
                                                    }}
                                                  >
                                                    {label}
                                                  </Button>
                                                ))}
                                              </Box>
                                            </Box>
                                            <Box display="flex" gap={1}>
                                              <TextField
                                                size="small"
                                                placeholder={
                                                  timelineInputType === 'note' ? 'Add a note...' :
                                                  timelineInputType === 'phone_call' ? 'Log a phone call...' :
                                                  'Log an email...'
                                                }
                                                value={newInvoiceNote}
                                                onChange={(e) => setNewInvoiceNote(e.target.value)}
                                                fullWidth
                                                multiline
                                                maxRows={3}
                                                sx={{
                                                  bgcolor: 'white',
                                                  '& .MuiOutlinedInput-root': {
                                                    borderLeft: `3px solid ${
                                                      timelineInputType === 'note' ? brandColors.navy :
                                                      timelineInputType === 'phone_call' ? brandColors.cyan :
                                                      brandColors.orange
                                                    }`,
                                                  }
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter' && !e.shiftKey && newInvoiceNote.trim()) {
                                                    e.preventDefault();
                                                    handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId);
                                                  }
                                                }}
                                              />
                                              <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => handleAddInvoiceNote(invoice.invoice_id, selectedSchool.clientId)}
                                                disabled={savingNote || !newInvoiceNote.trim()}
                                                sx={{
                                                  bgcolor: timelineInputType === 'note' ? brandColors.navy :
                                                           timelineInputType === 'phone_call' ? brandColors.cyan :
                                                           brandColors.orange,
                                                  minWidth: 'auto',
                                                  px: 2,
                                                  '&:hover': { opacity: 0.9 }
                                                }}
                                              >
                                                {savingNote ? <CircularProgress size={16} color="inherit" /> : <Send className="h-4 w-4" />}
                                              </Button>
                                            </Box>
                                            {(timelineInputType === 'phone_call' || timelineInputType === 'email_sent') && (
                                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                                Quick log above, or{' '}
                                                <MuiLink
                                                  component="button"
                                                  variant="caption"
                                                  onClick={() => handleOpenActivityForm(invoice, timelineInputType)}
                                                  sx={{ cursor: 'pointer' }}
                                                >
                                                  add with outcome details
                                                </MuiLink>
                                              </Typography>
                                            )}
                                          </Box>

                                          {/* Unified Timeline */}
                                          <Stack spacing={1} sx={{ maxHeight: 280, overflow: 'auto' }}>
                                            {timeline.length === 0 ? (
                                              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                                                No activity yet — add a note, call, or email above
                                              </Typography>
                                            ) : (
                                              timeline.map((item) => {
                                                const isNote = item.type === 'note';
                                                const isReminder = item.type === 'reminder';
                                                const borderColor = isReminder ? brandColors.orange :
                                                  isNote ? brandColors.navy :
                                                  item.source === 'tc_webhook' ? brandColors.purple :
                                                  item.activityType === 'phone_call' ? brandColors.cyan :
                                                  item.activityType === 'email_sent' ? brandColors.orange :
                                                  brandColors.navy;

                                                return (
                                                  <Box
                                                    key={`${item.type}-${item.id}`}
                                                    sx={{
                                                      p: 1.5,
                                                      bgcolor: isReminder ? `${brandColors.orange}08` : 'white',
                                                      borderRadius: 1,
                                                      border: '1px solid #e0e0e0',
                                                      borderLeft: `3px solid ${borderColor}`,
                                                      position: 'relative'
                                                    }}
                                                  >
                                                    {isNote && editingNoteId === item.id ? (
                                                      <Box>
                                                        <TextField
                                                          size="small"
                                                          value={editNoteContent}
                                                          onChange={(e) => setEditNoteContent(e.target.value)}
                                                          fullWidth
                                                          multiline
                                                          maxRows={3}
                                                          sx={{ mb: 1 }}
                                                        />
                                                        <Box display="flex" gap={1}>
                                                          <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => handleSaveEditNote(item.id, invoice.invoice_id)}
                                                            disabled={savingNote}
                                                            sx={{ bgcolor: brandColors.green, '&:hover': { bgcolor: '#2a9248' } }}
                                                          >
                                                            Save
                                                          </Button>
                                                          <Button
                                                            size="small"
                                                            onClick={() => { setEditingNoteId(null); setEditNoteContent(''); }}
                                                          >
                                                            Cancel
                                                          </Button>
                                                        </Box>
                                                      </Box>
                                                    ) : (
                                                      <Box display="flex" alignItems="flex-start" gap={1}>
                                                        {isNote ? (
                                                          <NoteAdd className="h-4 w-4 text-accent-navy mt-0.5" />
                                                        ) : isReminder ? (
                                                          <NotificationsActive className="h-4 w-4 text-warning mt-0.5" />
                                                        ) : (
                                                          getActivityIcon(item.activityType, item.source)
                                                        )}
                                                        <Box flex={1}>
                                                          <Typography variant="body2" fontWeight={isNote ? 400 : 500} sx={{ pr: isNote ? 6 : 0 }}>
                                                            {isReminder
                                                              ? `Reminder: ${item.reminderType || 'sent'}`
                                                              : item.content || item.description}
                                                            {item.source === 'tc_webhook' && (
                                                              <Chip label="via TC" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: `${brandColors.purple}15`, color: brandColors.purple }} />
                                                            )}
                                                          </Typography>
                                                          {item.outcome && (
                                                            <Typography variant="caption" color="text.secondary" display="block">
                                                              Outcome: {item.outcome.replace(/_/g, ' ')}
                                                            </Typography>
                                                          )}
                                                          {item.notes && (
                                                            <Typography variant="caption" color="text.secondary" display="block" sx={{ fontStyle: 'italic' }}>
                                                              {item.notes}
                                                            </Typography>
                                                          )}
                                                          <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                                            <Chip
                                                              label={isNote ? 'Note' : isReminder ? 'Reminder' : item.activityType === 'phone_call' ? 'Call' : 'Email'}
                                                              size="small"
                                                              sx={{ height: 16, fontSize: '0.6rem', mr: 0.75, bgcolor: `${borderColor}15`, color: borderColor }}
                                                            />
                                                            {item.createdBy || 'System'} • {formatDate(item.createdAt)}
                                                          </Typography>
                                                        </Box>
                                                        {isNote && (item.createdBy === currentUser.name || item.createdBy === currentUser.email) && (
                                                          <Box sx={{ position: 'absolute', top: 8, right: 8 }}>
                                                            <IconButton size="small" onClick={() => handleStartEditNote(item.id, item.content)} sx={{ p: 0.5 }}>
                                                              <Edit className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => setConfirmDeleteNoteId(item.id)} sx={{ p: 0.5 }}>
                                                              <Delete className="h-3.5 w-3.5 text-neutral-500" />
                                                            </IconButton>
                                                            {confirmDeleteNoteId === item.id && (
                                                              <Box sx={{ position: 'absolute', right: 0, top: 28, zIndex: 10, width: 200, bgcolor: 'white', borderRadius: 1, boxShadow: 3, border: '1px solid #e0e0e0', p: 1.5 }}>
                                                                <Typography variant="body2" fontWeight={500} gutterBottom>Delete this note?</Typography>
                                                                <Box display="flex" gap={1}>
                                                                  <Button size="small" variant="contained" color="error" onClick={() => handleDeleteNote(item.id, invoice.invoice_id)} sx={{ flex: 1 }}>Delete</Button>
                                                                  <Button size="small" onClick={() => setConfirmDeleteNoteId(null)} sx={{ flex: 1 }}>Cancel</Button>
                                                                </Box>
                                                              </Box>
                                                            )}
                                                          </Box>
                                                        )}
                                                      </Box>
                                                    )}
                                                  </Box>
                                                );
                                              })
                                            )}
                                          </Stack>
                                        </Box>
                                      )}
                                    </Box>
                                  </Collapse>
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {selectedSchool.validInvoices.length === 0 && (
                <Box textAlign="center" py={4}>
                  <Typography color="text.secondary">No invoices found for this school</Typography>
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button
                variant="outlined"
                href={`https://account.acmeops.com/clients/${selectedSchool.clientId}/`}
                target="_blank"
                startIcon={<OpenInNew className="h-5 w-5" />}
                sx={{ borderColor: brandColors.purple, color: brandColors.purple }}
              >
                View in TutorCruncher
              </Button>
              <Button onClick={handleCloseModal}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Payment Modal */}
      <Dialog
        open={paymentModalOpen}
        onClose={handleClosePaymentModal}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={600}>Take Payment</Typography>
              {paymentInvoice && (
                <Typography variant="body2" color="text.secondary">
                  Invoice #{paymentInvoice.display_id || paymentInvoice.invoice_id}
                </Typography>
              )}
            </Box>
            <IconButton onClick={handleClosePaymentModal} size="small">
              <Close className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {paymentInvoice && (
            <Box>
              <Box mb={3} p={2} bgcolor="#f5f5f5" borderRadius={1}>
                <Typography variant="body2" color="text.secondary">Amount Due</Typography>
                <Typography variant="h5" fontWeight={600} color={brandColors.orange}>
                  {formatCurrency(paymentInvoice.amount_outstanding || paymentInvoice.amount)}
                </Typography>
              </Box>

              {paymentError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {paymentError}
                </Alert>
              )}

              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  label="Payment Method"
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="cheque">Cheque / Check</MenuItem>
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="manual">Manual / Other</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                helperText="Edit for partial payments"
                sx={{ mb: 2 }}
              />

              {paymentMethod === 'cheque' && (
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <TextField
                    label="Check Number"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="e.g. 1234"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="Check Date"
                    type="date"
                    value={checkDate}
                    onChange={(e) => setCheckDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={{ flex: 1 }}
                  />
                </Box>
              )}

              <FormControlLabel
                control={
                  <Checkbox
                    checked={sendReceipt}
                    onChange={(e) => setSendReceipt(e.target.checked)}
                    color="primary"
                  />
                }
                label="Send receipt to client"
              />

              <Alert severity="info" sx={{ mt: 2 }}>
                This records an offline payment (cash, check, or bank transfer already received).
                For card payments, use TutorCruncher directly.
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleClosePaymentModal} disabled={paymentLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleTakePayment}
            disabled={paymentLoading || !paymentMethod}
            sx={{
              bgcolor: brandColors.green,
              '&:hover': { bgcolor: '#2a9248' }
            }}
          >
            {paymentLoading ? <CircularProgress size={20} color="inherit" /> : 'Take Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reminder Menu */}
      <Menu
        anchorEl={reminderMenuAnchor}
        open={Boolean(reminderMenuAnchor)}
        onClose={handleCloseReminderMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleSendReminder}>
          <ListItemIcon>
            <NotificationsActive className="h-5 w-5 text-primary-500" />
          </ListItemIcon>
          <ListItemText>Send Reminder</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleViewReminderHistory}>
          <ListItemIcon>
            <History className="h-5 w-5 text-primary-500" />
          </ListItemIcon>
          <ListItemText>View Reminder History</ListItemText>
        </MenuItem>
      </Menu>

      {/* Reminder History Dialog */}
      <Dialog
        open={reminderHistoryOpen}
        onClose={handleCloseReminderHistory}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={600}>Reminder History</Typography>
              {selectedInvoiceForReminder && (
                <Typography variant="body2" color="text.secondary">
                  Invoice #{selectedInvoiceForReminder.display_id || selectedInvoiceForReminder.invoice_id}
                </Typography>
              )}
            </Box>
            <IconButton onClick={handleCloseReminderHistory} size="small">
              <Close className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {reminderLoading ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={30} sx={{ color: brandColors.purple }} />
            </Box>
          ) : reminderHistory.length === 0 ? (
            <Box textAlign="center" py={4}>
              <History className="h-12 w-12 text-neutral-300 mb-1" />
              <Typography color="text.secondary">No reminders sent yet</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {reminderHistory.map((reminder, index) => (
                <Box
                  key={reminder.id || index}
                  p={2}
                  bgcolor="#f5f5f5"
                  borderRadius={1}
                  sx={{ borderLeft: `3px solid ${brandColors.purple}` }}
                >
                  <Typography variant="body2" fontWeight={500}>
                    Reminder sent
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(reminder.sent_at || reminder.created_at)}
                    {reminder.sent_by && ` by ${reminder.sent_by}`}
                  </Typography>
                  {reminder.notes && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {reminder.notes}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseReminderHistory}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Detail Modal for KPI Card Drill-downs */}
      <Dialog
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6" fontWeight={600}>
                {detailModalType === 'outstanding' && 'Outstanding Invoices'}
                {detailModalType === 'collected' && 'Collected Payments'}
                {detailModalType === 'pending' && 'Pending Payments'}
                {detailModalType === 'invoiced' && 'All Invoices'}
                {detailModalType === 'pastDue30' && 'Past Due (30+ days outstanding)'}
                {detailModalType === 'pastDue60' && '60+ Days Past Due (90+ days outstanding)'}
                {detailModalType === 'fulfilled' && 'Schools Fully Paid'}
                {detailModalType === 'no-invoices' && 'Schools with No Invoices'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {detailModalData.length} {detailModalData.length === 1 ? 'record' : 'records'}
              </Typography>
            </Box>
            <IconButton onClick={() => setDetailModalOpen(false)} size="small">
              <Close className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {detailModalData.length === 0 ? (
            <Box textAlign="center" py={4}>
              <Typography color="text.secondary">No data available</Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell
                      sx={{ fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => handleDetailSort('schoolName')}
                    >
                      School{getDetailSortIcon('schoolName')}
                    </TableCell>
                    <TableCell
                      sx={{ fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => handleDetailSort('schoolLocation')}
                    >
                      Location{getDetailSortIcon('schoolLocation')}
                    </TableCell>
                    {/* Invoice-level columns for invoiced, outstanding, collected, pending */}
                    {['invoiced', 'outstanding', 'collected', 'pending', 'pastDue30', 'pastDue60'].includes(detailModalType) && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Invoice</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('amount')}
                        >
                          Amount{getDetailSortIcon('amount')}
                        </TableCell>
                      </>
                    )}
                    {/* Outstanding/aging-specific columns */}
                    {['outstanding', 'pastDue30', 'pastDue60'].includes(detailModalType) && (
                      <>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('amountOutstanding')}
                        >
                          Outstanding{getDetailSortIcon('amountOutstanding')}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('daysOutstanding')}
                        >
                          Days{getDetailSortIcon('daysOutstanding')}
                        </TableCell>
                      </>
                    )}
                    {/* Collected-specific columns */}
                    {detailModalType === 'collected' && (
                      <>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('amountCollected')}
                        >
                          Collected{getDetailSortIcon('amountCollected')}
                        </TableCell>
                        <TableCell
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('datePaid')}
                        >
                          Date Paid{getDetailSortIcon('datePaid')}
                        </TableCell>
                      </>
                    )}
                    {/* Pending-specific columns */}
                    {detailModalType === 'pending' && (
                      <TableCell
                        sx={{ fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => handleDetailSort('dateSent')}
                      >
                        Date Sent{getDetailSortIcon('dateSent')}
                      </TableCell>
                    )}
                    {/* Invoiced-specific columns */}
                    {detailModalType === 'invoiced' && (
                      <>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('dateSent')}
                        >
                          Date Sent{getDetailSortIcon('dateSent')}
                        </TableCell>
                      </>
                    )}
                    {/* School-level columns for fulfilled, outstanding (schools), pending (schools), no-invoices */}
                    {['fulfilled'].includes(detailModalType) && (
                      <>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('totalCollected')}
                        >
                          Total Collected{getDetailSortIcon('totalCollected')}
                        </TableCell>
                        <TableCell
                          align="center"
                          sx={{ fontWeight: 600, cursor: 'pointer' }}
                          onClick={() => handleDetailSort('paidCount')}
                        >
                          Invoices{getDetailSortIcon('paidCount')}
                        </TableCell>
                      </>
                    )}
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detailModalData.map((row, index) => (
                    <TableRow key={row.invoiceId || row.clientId || index} hover>
                      <TableCell>
                        <Typography fontWeight={500}>{row.schoolName}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.schoolEmail}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={row.schoolLocation || 'Unknown'}
                          size="small"
                          sx={{
                            bgcolor: `${brandColors.purple}15`,
                            color: brandColors.purple,
                            fontWeight: 500,
                          }}
                        />
                      </TableCell>
                      {/* Invoice-level data */}
                      {['invoiced', 'outstanding', 'collected', 'pending', 'pastDue30', 'pastDue60'].includes(detailModalType) && (
                        <>
                          <TableCell>
                            <MuiLink
                              href={`https://account.acmeops.com/accounting/invoices/${row.invoiceId}/`}
                              target="_blank"
                              rel="noopener"
                              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                            >
                              #{row.displayId || row.invoiceId}
                              <OpenInNew className="h-3.5 w-3.5" />
                            </MuiLink>
                          </TableCell>
                          <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                        </>
                      )}
                      {/* Outstanding/aging-specific data */}
                      {['outstanding', 'pastDue30', 'pastDue60'].includes(detailModalType) && (
                        <>
                          <TableCell align="right" sx={{ color: brandColors.pink, fontWeight: 500 }}>
                            {formatCurrency(row.amountOutstanding)}
                          </TableCell>
                          <TableCell align="center">
                            {row.daysOutstanding !== null && (
                              <Chip
                                label={`${row.daysOutstanding}d`}
                                size="small"
                                sx={{
                                  bgcolor: row.daysOutstanding > 30 ? `${brandColors.pink}20` : row.daysOutstanding > 14 ? `${brandColors.orange}20` : '#f5f5f5',
                                  color: row.daysOutstanding > 30 ? brandColors.pink : row.daysOutstanding > 14 ? brandColors.orange : 'text.secondary',
                                  fontWeight: 500,
                                }}
                              />
                            )}
                          </TableCell>
                        </>
                      )}
                      {/* Collected-specific data */}
                      {detailModalType === 'collected' && (
                        <>
                          <TableCell align="right" sx={{ color: brandColors.green, fontWeight: 500 }}>
                            {formatCurrency(row.amountCollected)}
                          </TableCell>
                          <TableCell sx={{ color: brandColors.green }}>
                            {row.datePaid ? formatDate(row.datePaid) : '-'}
                          </TableCell>
                        </>
                      )}
                      {/* Pending-specific data */}
                      {detailModalType === 'pending' && (
                        <TableCell>{formatDate(row.dateSent)}</TableCell>
                      )}
                      {/* Invoiced-specific data */}
                      {detailModalType === 'invoiced' && (
                        <>
                          <TableCell>
                            <Chip
                              label={row.status}
                              size="small"
                              sx={{
                                bgcolor: row.status === 'paid' ? `${brandColors.green}20` : row.status === 'unpaid' ? `${brandColors.pink}20` : `${brandColors.orange}20`,
                                color: row.status === 'paid' ? brandColors.green : row.status === 'unpaid' ? brandColors.pink : brandColors.orange,
                                fontWeight: 500,
                              }}
                            />
                          </TableCell>
                          <TableCell>{formatDate(row.dateSent)}</TableCell>
                        </>
                      )}
                      {/* School-level data for fulfilled */}
                      {detailModalType === 'fulfilled' && (
                        <>
                          <TableCell align="right" sx={{ color: brandColors.green, fontWeight: 500 }}>
                            {formatCurrency(row.totalCollected)}
                          </TableCell>
                          <TableCell align="center">
                            <Typography color={brandColors.green} fontWeight={500}>
                              {row.paidCount}
                            </Typography>
                          </TableCell>
                        </>
                      )}
                      {/* School-level data for no-invoices - no extra columns */}
                      <TableCell align="center">
                        <Tooltip title="View in TutorCruncher">
                          <IconButton
                            size="small"
                            href={row.invoiceId
                              ? `https://account.acmeops.com/accounting/invoices/${row.invoiceId}/`
                              : `https://account.acmeops.com/clients/${row.clientId}/`
                            }
                            target="_blank"
                            sx={{ color: brandColors.purple }}
                          >
                            <OpenInNew className="h-5 w-5" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDetailModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Activity Form Modal */}
      <Dialog
        open={activityFormOpen}
        onClose={handleCloseActivityForm}
        maxWidth="sm"
        fullWidth
        sx={{ zIndex: 1500 }}
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box display="flex" alignItems="center" gap={1}>
              {activityForm.activityType === 'phone_call' ? (
                <Phone className="h-5 w-5 text-info" />
              ) : (
                <Email className="h-5 w-5 text-warning" />
              )}
              <Typography variant="h6" fontWeight={600}>
                Log {activityForm.activityType === 'phone_call' ? 'Phone Call' : 'Email'}
              </Typography>
            </Box>
            <IconButton onClick={handleCloseActivityForm} size="small">
              <Close className="h-5 w-5" />
            </IconButton>
          </Box>
          {activityFormInvoice && (
            <Typography variant="body2" color="text.secondary">
              Invoice #{activityFormInvoice.display_id || activityFormInvoice.invoice_id}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <TextField
              label="Description"
              placeholder={activityForm.activityType === 'phone_call'
                ? "e.g., Called to follow up on payment status..."
                : "e.g., Sent reminder email about outstanding balance..."
              }
              value={activityForm.description}
              onChange={(e) => setActivityForm(prev => ({ ...prev, description: e.target.value }))}
              fullWidth
              required
              multiline
              rows={2}
            />

            <FormControl fullWidth>
              <InputLabel shrink>Outcome</InputLabel>
              <Select
                native
                value={activityForm.outcome}
                onChange={(e) => setActivityForm(prev => ({ ...prev, outcome: e.target.value }))}
                label="Outcome"
                sx={{ mt: 2 }}
              >
                <option value="">— Select Outcome —</option>
                {activityForm.activityType === 'phone_call' ? (
                  <>
                    <option value="spoke_with_contact">Spoke with contact</option>
                    <option value="left_voicemail">Left voicemail</option>
                    <option value="no_answer">No answer</option>
                    <option value="payment_promised">Payment promised</option>
                    <option value="wrong_number">Wrong number</option>
                  </>
                ) : (
                  <>
                    <option value="email_sent">Email sent</option>
                    <option value="received_response">Received response</option>
                    <option value="payment_promised">Payment promised</option>
                    <option value="bounced">Email bounced</option>
                  </>
                )}
              </Select>
            </FormControl>

            <TextField
              label="Internal Notes (optional)"
              placeholder="Any additional notes for the team..."
              value={activityForm.notes}
              onChange={(e) => setActivityForm(prev => ({ ...prev, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseActivityForm} disabled={savingActivity}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveActivity}
            disabled={savingActivity || !activityForm.description.trim()}
            sx={{
              bgcolor: activityForm.activityType === 'phone_call' ? brandColors.cyan : brandColors.orange,
              '&:hover': {
                bgcolor: activityForm.activityType === 'phone_call' ? '#3ba5bc' : '#d68527'
              }
            }}
          >
            {savingActivity ? <CircularProgress size={20} color="inherit" /> : 'Save Activity'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
