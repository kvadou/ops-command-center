import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import SchoolEmailCampaigns from './SchoolEmailCampaigns';
import SchoolStudentImport from './SchoolStudentImport';
import KpiCard from './ui/KpiCard';
import { useToast } from '../hooks/useToast';
import ConfirmationModal from './ConfirmationModal';
import MetricChip from './ui/MetricChip';
import StudentBillingDetailsModal from './StudentBillingDetailsModal';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Tabs,
  Tab,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Link as MuiLink,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Switch,
  FormControlLabel,
  FormGroup,
} from '@mui/material';
import {
  ArrowLeftIcon,
  AcademicCapIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  ExclamationCircleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronRightIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';

export default function SchoolDetailPage() {
  const toast = useToast();
  const { schoolId } = useParams();
  const clientId = schoolId; // Map schoolId to clientId for backward compatibility
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [school, setSchool] = useState(null);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });
  
  // Map tab names to indices (Billing tab removed, Communications tab consolidates 4 tabs)
  const tabMap = {
    'jobs': 0,
    'students': 1,
    'invoices': 2,
    'communications': 3,
  };
  
  // Map sub-tab names for communications tab
  const communicationsSubTabMap = {
    'contacts': 0,
    'schedules': 1,
    'campaigns': 2,
    'analytics': 3,
  };
  
  // Get initial tab from URL or default to 0
  const getInitialTab = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabMap[tabParam] !== undefined) {
      return tabMap[tabParam];
    }
    // Legacy support: if old tab names are used, map to communications tab
    if (tabParam && ['contacts', 'schedules', 'campaigns', 'analytics'].includes(tabParam)) {
      return tabMap['communications'];
    }
    return 0;
  };
  
  const [currentTab, setCurrentTab] = useState(getInitialTab());
  
  // Get initial communications sub-tab from URL
  const getInitialCommunicationsSubTab = () => {
    const subTabParam = searchParams.get('subtab');
    if (subTabParam && communicationsSubTabMap[subTabParam] !== undefined) {
      return communicationsSubTabMap[subTabParam];
    }
    // Legacy support: if old tab name is used, map to appropriate sub-tab
    const tabParam = searchParams.get('tab');
    if (tabParam && communicationsSubTabMap[tabParam] !== undefined) {
      return communicationsSubTabMap[tabParam];
    }
    return 0;
  };
  
  const [communicationsSubTab, setCommunicationsSubTab] = useState(getInitialCommunicationsSubTab());
  const [selectedJob, setSelectedJob] = useState(null);
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonDetails, setLessonDetails] = useState(null);
  const [lessonDetailsLoading, setLessonDetailsLoading] = useState(false);
  const [enrollmentModalOpen, setEnrollmentModalOpen] = useState(false);
  const [enrollmentDetails, setEnrollmentDetails] = useState(null);
  const [enrollmentDetailsLoading, setEnrollmentDetailsLoading] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderInvoiceId, setReminderInvoiceId] = useState(null);
  const [syncingReminders, setSyncingReminders] = useState(false);
  const [studentPaymentMethods, setStudentPaymentMethods] = useState({}); // Map of student_id -> payment method
  const [lessonFilter, setLessonFilter] = useState('all'); // Filter for lessons: 'all', 'complete', 'pending', 'cancelled'
  const [expandedJobPanels, setExpandedJobPanels] = useState({}); // Track which job panels are expanded in Students tab
  const [studentBillingModalOpen, setStudentBillingModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null); // { studentId, serviceId, studentName, paymentMethod }
  const [updatingDoNotWorkWith, setUpdatingDoNotWorkWith] = useState(false);

  // Brand colors
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

  // Update tab when URL parameter changes
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && tabMap[tabParam] !== undefined) {
      setCurrentTab(tabMap[tabParam]);
    } else if (tabParam && ['contacts', 'schedules', 'campaigns', 'analytics'].includes(tabParam)) {
      // Legacy support: map old tab names to communications tab
      setCurrentTab(tabMap['communications']);
      const subTabIndex = communicationsSubTabMap[tabParam];
      if (subTabIndex !== undefined) {
        setCommunicationsSubTab(subTabIndex);
      }
    }
    
    // Update communications sub-tab from URL (only if we're on communications tab)
    if (currentTab === tabMap['communications'] || tabParam === 'communications') {
      const subTabParam = searchParams.get('subtab');
      if (subTabParam && communicationsSubTabMap[subTabParam] !== undefined) {
        setCommunicationsSubTab(communicationsSubTabMap[subTabParam]);
      } else if (!subTabParam && tabParam && communicationsSubTabMap[tabParam] !== undefined) {
        // Legacy: if old tab name is used, set sub-tab
        setCommunicationsSubTab(communicationsSubTabMap[tabParam]);
      }
    }
  }, [searchParams, currentTab]);

  // Update URL when tab changes
  const handleTabChange = (e, newValue) => {
    setCurrentTab(newValue);
    // Find tab name from index
    const tabName = Object.keys(tabMap).find(key => tabMap[key] === newValue);
    if (tabName) {
      // If switching to communications tab, preserve sub-tab if exists
      if (tabName === 'communications') {
        const subTabName = Object.keys(communicationsSubTabMap).find(
          key => communicationsSubTabMap[key] === communicationsSubTab
        );
        if (subTabName) {
          setSearchParams({ tab: tabName, subtab: subTabName });
        } else {
          setSearchParams({ tab: tabName });
        }
      } else {
        setSearchParams({ tab: tabName });
      }
    } else {
      setSearchParams({});
    }
  };
  
  // Handle communications sub-tab change
  const handleCommunicationsSubTabChange = (e, newValue) => {
    setCommunicationsSubTab(newValue);
    const subTabName = Object.keys(communicationsSubTabMap).find(
      key => communicationsSubTabMap[key] === newValue
    );
    if (subTabName) {
      setSearchParams({ tab: 'communications', subtab: subTabName });
    }
  };

  useEffect(() => {
    fetchSchoolData();
  }, [clientId]);

  // Fetch payment methods for students when school data loads
  useEffect(() => {
    if (school && school.jobs) {
      fetchStudentPaymentMethods();
    }
  }, [school]);

  const fetchSchoolData = async () => {
    try {
      setLoading(true);
      setError(null);

      const axiosInstance = axios.create({
        withCredentials: true
      });

      const response = await axiosInstance.get(`/api/schools/${clientId}`);
      setSchool(response.data);
    } catch (err) {
      console.error('Error fetching school data:', err);
      setError(err.response?.data?.error || 'Failed to load school data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDoNotWorkWith = async (newValue) => {
    // Only allow updates for real client IDs (not synthetic SCHOOL_* IDs)
    if (clientId.startsWith('SCHOOL_')) {
      toast.error('Cannot update "Do Not Work With" status for schools grouped by name. This school does not have a direct client_id.');
      return;
    }

    try {
      setUpdatingDoNotWorkWith(true);
      const axiosInstance = axios.create({
        withCredentials: true
      });

      await axiosInstance.put(`/api/schools/${clientId}/do-not-work-with`, {
        doNotWorkWith: newValue
      });

      // Update local state
      setSchool(prev => ({
        ...prev,
        doNotWorkWith: newValue
      }));
    } catch (err) {
      console.error('Error updating do_not_work_with status:', err);
      toast.error(`Failed to update status: ${err.response?.data?.error || err.message}`);
    } finally {
      setUpdatingDoNotWorkWith(false);
    }
  };

  const fetchStudentPaymentMethods = async () => {
    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      // Get all student IDs from jobs
      const studentIds = [];
      if (school && school.jobs) {
        school.jobs.forEach(job => {
          if (job.students && Array.isArray(job.students)) {
            job.students.forEach(student => {
              if (student.student_id) {
                studentIds.push(student.student_id);
              }
            });
          }
        });
      }

      if (studentIds.length === 0) {
        return;
      }

      // Query subscription enrollments for these students
      // Note: This endpoint may not be available in all environments
      try {
        const response = await axiosInstance.get('/api/subscriptions', {
          params: {
            limit: 1000, // Get all subscriptions
            status: 'active' // Only active subscriptions
          },
          timeout: 10000 // 10 second timeout
        });

        // Build map of recipient_id -> payment method
        // Map by both recipient_id AND client_id to handle all cases
        const paymentMethodMap = {};
        if (response.data && response.data.subscriptions) {
          response.data.subscriptions.forEach(sub => {
            // Map by recipient_id if available
            if (sub.recipient_id) {
              paymentMethodMap[sub.recipient_id] = {
                type: sub.payment_type, // 'monthly' or 'term'
                status: sub.status,
                enrollmentId: sub.id
              };
            }
            // ALWAYS also map by client_id (even if recipient_id is set)
            // This handles cases where enrollment.client_id matches student.client_id
            if (sub.client_id) {
              paymentMethodMap[sub.client_id] = {
                type: sub.payment_type,
                status: sub.status,
                enrollmentId: sub.id
              };
            }
          });
        }

        setStudentPaymentMethods(paymentMethodMap);
      } catch (apiError) {
        // Silently handle API errors - subscriptions feature may not be available
        // or the table may not exist in this environment
        if (apiError.response?.status !== 500) {
          // Only log non-500 errors (500s are expected if table doesn't exist)
          console.warn('Subscriptions API not available:', apiError.message);
        }
        // Set empty map so UI doesn't break
        setStudentPaymentMethods({});
      }
    } catch (err) {
      console.error('Error fetching student payment methods:', err);
      // Don't show error to user, just log it and set empty map
      setStudentPaymentMethods({});
    }
  };

  const handleJobClick = async (job) => {
    if (!job || !job.serviceId) {
      console.error('Invalid job data:', job);
      setError('Invalid job data - missing serviceId');
      return;
    }

    setSelectedJob(job);
    setLessonModalOpen(true);
    setLessonDetailsLoading(true);
    setLessonDetails(null);
    setError(null);

    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      const response = await axiosInstance.get(`/api/schools/service/${job.serviceId}/lessons`);
      setLessonDetails(response.data);
    } catch (err) {
      console.error('Error fetching lesson details:', err);
      setError(err.response?.data?.error || 'Failed to load lesson details');
      setLessonDetails(null);
    } finally {
      setLessonDetailsLoading(false);
    }
  };

  const handleEnrollmentClick = async (job) => {
    if (!job || !job.serviceId) {
      console.error('Invalid job data:', job);
      setError('Invalid job data - missing serviceId');
      return;
    }

    setSelectedJob(job);
    setEnrollmentModalOpen(true);
    setEnrollmentDetailsLoading(true);
    setEnrollmentDetails(null);
    setError(null);

    try {
      const axiosInstance = axios.create({
        withCredentials: true
      });

      // Fetch all enrollments for this service (both monthly and term)
      const response = await axiosInstance.get(`/api/subscriptions`, {
        params: {
          serviceId: job.serviceId,
          limit: 1000, // Get all enrollments
        }
      });

      // Build map of recipient_id -> payment method for students
      // Map by both recipient_id AND client_id to handle all cases
      const enrollmentPaymentMap = {};
      (response.data.subscriptions || []).forEach(enrollment => {
        // Map by recipient_id if available
        if (enrollment.recipient_id) {
          enrollmentPaymentMap[enrollment.recipient_id] = {
            type: enrollment.payment_type, // 'monthly' or 'term'
            status: enrollment.status,
            enrollmentId: enrollment.id
          };
        }
        // ALWAYS also map by client_id (even if recipient_id is set)
        // This handles cases where enrollment.client_id matches student.client_id
        if (enrollment.client_id) {
          enrollmentPaymentMap[enrollment.client_id] = {
            type: enrollment.payment_type,
            status: enrollment.status,
            enrollmentId: enrollment.id
          };
        }
      });

      // Get students from the job data
      const jobBillingModel = job?.billingModel || school?.billingModel || null;
      const students = (job.students || []).map(student => {
        const studentId = student.student_id || student.recipient_id;
        const clientId = student.client_id;
        const paymentMethod = enrollmentPaymentMap[studentId] || enrollmentPaymentMap[clientId];
        
        return {
          student_id: studentId,
          student_name: student.student_name || student.recipient_name || `Student ${studentId}`,
          client_id: clientId,
          // If no enrollment is found, fall back to job-level billing model so
          // school-paid invoice services don't show as "Per Lesson".
          paymentMethod: paymentMethod
            ? (paymentMethod.type === 'monthly' ? 'monthly' : 'term')
            : (jobBillingModel === 'invoice_school_paid' ? 'invoice' : null)
        };
      });

      // Also include enrollments that don't have matching students yet
      // (e.g., monthly billing enrollments where recipient hasn't been added to appointments)
      const enrollmentsWithoutStudents = (response.data.subscriptions || [])
        .filter(enrollment => {
          // Check if this enrollment's client_id or recipient_id matches any existing student
          const hasMatchingStudent = students.some(student => 
            student.student_id === enrollment.recipient_id ||
            student.student_id === enrollment.client_id ||
            student.client_id === enrollment.recipient_id ||
            student.client_id === enrollment.client_id
          );
          
          // Also check: if enrollment has no recipient_id but client_id matches an existing student's client_id,
          // don't create a synthetic entry (the student is already represented)
          if (!enrollment.recipient_id && enrollment.client_id) {
            const hasMatchingClient = students.some(student => 
              student.client_id === enrollment.client_id
            );
            if (hasMatchingClient) {
              return false; // Skip - student already exists for this client
            }
          }
          
          return !hasMatchingStudent && enrollment.status === 'active';
        })
        .map(enrollment => {
          // Get parent name from enrollment metadata or use client_id
          const metadata = enrollment.metadata || {};
          const parentName = metadata.parentName || `Client ${enrollment.client_id}`;
          
          // Only use client_id as student_id if recipient_id is truly missing
          // This prevents creating synthetic entries when a real student exists
          const studentId = enrollment.recipient_id || enrollment.client_id;
          
          return {
            student_id: studentId,
            student_name: parentName,
            client_id: enrollment.client_id,
            paymentMethod: enrollment.payment_type === 'monthly' ? 'monthly' : 'term'
          };
        });

      // Combine existing students with enrollments that don't have matching students
      // and dedupe by (student_id, client_id). We can see duplicates when a student
      // is present both as a service recipient and as an enrollment-derived row.
      const allStudentsRaw = [...students, ...enrollmentsWithoutStudents];
      const dedupedStudentsMap = new Map();
      
      for (const s of allStudentsRaw) {
        const key = `${s.student_id || ''}:${s.client_id || ''}`;
        
        // Check for exact match first
        if (dedupedStudentsMap.has(key)) {
          const existing = dedupedStudentsMap.get(key);
          // Prefer the entry with better name and payment method
          const existingScore =
            (existing?.paymentMethod ? 2 : 0) +
            (existing?.student_name && !String(existing.student_name).startsWith('Client ') ? 1 : 0);
          const newScore =
            (s?.paymentMethod ? 2 : 0) +
            (s?.student_name && !String(s.student_name).startsWith('Client ') ? 1 : 0);
          if (newScore > existingScore) {
            dedupedStudentsMap.set(key, s);
          }
          continue;
        }
        
        // Check for duplicates by client_id (same client, different student_id)
        // This catches cases where:
        // 1. Real student exists (student_id != client_id) 
        // 2. Synthetic entry created (student_id == client_id)
        // We should merge them and prefer the real student entry
        let foundDuplicate = false;
        for (const [mapKey, mapValue] of dedupedStudentsMap.entries()) {
          if (mapValue.client_id === s.client_id && s.client_id) {
            // Same client_id found - check if one is synthetic
            const mapIsSynthetic = mapValue.student_id === mapValue.client_id;
            const sIsSynthetic = s.student_id === s.client_id;
            
            if (mapIsSynthetic && !sIsSynthetic) {
              // Existing is synthetic, new is real - replace with real
              dedupedStudentsMap.delete(mapKey);
              dedupedStudentsMap.set(key, s);
              foundDuplicate = true;
              break;
            } else if (!mapIsSynthetic && sIsSynthetic) {
              // Existing is real, new is synthetic - skip the synthetic one
              foundDuplicate = true;
              break;
            } else if (mapIsSynthetic && sIsSynthetic) {
              // Both synthetic - merge them (prefer better name/payment method)
              const existingScore =
                (mapValue?.paymentMethod ? 2 : 0) +
                (mapValue?.student_name && !String(mapValue.student_name).startsWith('Client ') ? 1 : 0);
              const newScore =
                (s?.paymentMethod ? 2 : 0) +
                (s?.student_name && !String(s.student_name).startsWith('Client ') ? 1 : 0);
              if (newScore > existingScore) {
                dedupedStudentsMap.delete(mapKey);
                dedupedStudentsMap.set(key, s);
              }
              foundDuplicate = true;
              break;
            }
            // Both are real students with same client_id but different student_ids
            // This is valid (multiple children from same family) - keep both
          }
        }
        
        if (!foundDuplicate) {
          // New unique entry, add it
          dedupedStudentsMap.set(key, s);
        }
      }
      const allStudents = Array.from(dedupedStudentsMap.values());

      setEnrollmentDetails({
        serviceId: job.serviceId,
        serviceName: job.serviceName,
        students: allStudents,
        enrollments: response.data.subscriptions || []
      });
    } catch (err) {
      console.error('Error fetching enrollment details:', err);
      setError(err.response?.data?.error || 'Failed to load enrollment details');
      setEnrollmentDetails(null);
    } finally {
      setEnrollmentDetailsLoading(false);
    }
  };


  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const handleSendReminder = async (invoice) => {
    if (!invoice || !invoice.id) {
      toast.error('Invalid invoice data');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Send Reminder',
      message: `Send reminder for invoice ${invoice.display_id || `INV-${invoice.id}`}?`,
      action: async () => {
        try {
          setSendingReminder(true);
          setReminderInvoiceId(invoice.id);

          const axiosInstance = axios.create({
            withCredentials: true
          });

          const response = await axiosInstance.post(`/api/invoices/${invoice.id}/send-reminder`);

          // Refresh school data to get updated reminder counts
          await fetchSchoolData();

          toast.success(`Reminder sent successfully! This is reminder #${response.data.reminderCount} (${response.data.reminderType}).`);
        } catch (err) {
          console.error('Error sending reminder:', err);
          toast.error(`Failed to send reminder: ${err.response?.data?.error || err.message}`);
        } finally {
          setSendingReminder(false);
          setReminderInvoiceId(null);
        }
      },
    });
  };

  const handleSyncReminders = async (invoice) => {
    if (!invoice || !invoice.id) {
      return;
    }

    try {
      setSyncingReminders(true);

      const axiosInstance = axios.create({
        withCredentials: true
      });

      const response = await axiosInstance.post(`/api/invoices/${invoice.id}/sync-reminders`);
      
      // Refresh school data to get updated reminder counts
      await fetchSchoolData();
      
      console.log('Sync result:', response.data);
    } catch (err) {
      console.error('Error syncing reminders:', err);
      toast.error(`Failed to sync reminders: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncingReminders(false);
    }
  };

  const formatDate = formatDateTime;

  const formatDateForCSV = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const exportLessonsToCSV = () => {
    if (!lessonDetails || !lessonDetails.lessons || lessonDetails.lessons.length === 0) {
      return;
    }

    // P&L Format - Matching Excel template format
    const headers = [
      'School',
      'Month',
      'Date',
      'Revenue',
      'Tutor Cost',
      'Margin',
      'Notes for TC'
    ];

    // Get school name from the school object
    const schoolName = school?.name || 'Unknown School';

    // Prepare CSV rows
    const rows = lessonDetails.lessons.map(lesson => {
      const startDate = lesson.start ? new Date(lesson.start) : null;
      
      // Format month as "Mon-YY" (e.g., "Oct-25")
      const monthAbbr = startDate 
        ? startDate.toLocaleDateString('en-US', { month: 'short' })
        : '';
      const year = startDate 
        ? String(startDate.getFullYear()).slice(-2)
        : '';
      const month = startDate ? `${monthAbbr}-${year}` : '';
      
      // Format date as "MM/DD/YY"
      const date = startDate 
        ? `${String(startDate.getMonth() + 1).padStart(2, '0')}/${String(startDate.getDate()).padStart(2, '0')}/${String(startDate.getFullYear()).slice(-2)}`
        : '';
      
      // Format revenue as currency with $ and space (e.g., "$ 70.00")
      const revenue = lesson.revenue 
        ? `$ ${lesson.revenue.toFixed(2)}`
        : '$ -';
      
      // Format tutor cost as currency with $ and space (e.g., "$ 40.00" or "$ -")
      const tutorCost = lesson.tutorCost && lesson.tutorCost > 0
        ? `$ ${lesson.tutorCost.toFixed(2)}`
        : '$ -';
      
      // Format margin as currency with $ and space, negative in parentheses (e.g., "$ 30.00" or "$ (60.00)")
      let margin;
      if (lesson.margin > 0) {
        margin = `$ ${lesson.margin.toFixed(2)}`;
      } else if (lesson.margin < 0) {
        margin = `$ (${Math.abs(lesson.margin).toFixed(2)})`;
      } else {
        margin = '$ -';
      }
      
      // Notes for TC - empty by default, can be populated with any relevant notes
      const notes = '';

      return [
        schoolName,
        month,
        date,
        revenue,
        tutorCost,
        margin,
        notes
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    
    // Generate filename based on school and date
    const safeSchoolName = (schoolName || 'School').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `PNL_${safeSchoolName}_${dateStr}.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy':
        return brandColors.green;
      case 'unhealthy':
        return brandColors.pink;
      case 'needs_attention':
        return brandColors.orange;
      default:
        return '#9e9e9e';
    }
  };

  const getHealthStatusIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleSolidIcon className="h-4 w-4" />;
      case 'unhealthy':
        return <ExclamationCircleIcon className="h-4 w-4" />;
      case 'needs_attention':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: brandColors.purple }} />
      </Box>
    );
  }

  if (error && !school) {
    return (
      <Box>
        <Button
          startIcon={<ArrowLeftIcon className="h-5 w-5" />}
          onClick={() => navigate('/school-dashboard')}
          sx={{ mb: 2 }}
        >
          Back to School Dashboard
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!school) {
    return (
      <Box>
        <Button
          startIcon={<ArrowLeftIcon className="h-5 w-5" />}
          onClick={() => navigate('/school-dashboard')}
          sx={{ mb: 2 }}
        >
          Back to School Dashboard
        </Button>
        <Alert severity="info">School not found</Alert>
      </Box>
    );
  }

  const marginPercent = school.totalMarginPercent || 0;
  const marginColor = marginPercent >= 20 ? brandColors.green : marginPercent >= 0 ? brandColors.orange : brandColors.pink;

  // Billing model chips (schools can be mixed: monthly + term + per lesson)
  const computedBreakdown = (() => {
    if (school.billingModelBreakdown) return school.billingModelBreakdown;
    const monthly = new Set();
    const term = new Set();
    const perLesson = new Set();
    const invoice = new Set();
    for (const j of school.jobs || []) {
      if (j.billingModel === 'invoice_school_paid') invoice.add(String(j.serviceId || 'invoice'));
      if (j.billingModel === 'monthly_billing') monthly.add(String(j.serviceId));
      if (j.billingModel === 'term_billing') term.add(String(j.serviceId));
      if (j.billingModel === 'per_lesson') perLesson.add(String(j.serviceId));
      if (j.billingModel === 'mixed') {
        // If job is mixed, we can't count precisely without per-student info; treat as presence only.
        monthly.add(`mixed:${j.serviceId}`);
        term.add(`mixed:${j.serviceId}`);
        perLesson.add(`mixed:${j.serviceId}`);
      }
    }
    return {
      per_lesson: perLesson.size,
      monthly_billing: monthly.size,
      term_billing: term.size,
      invoice_school_paid: invoice.size,
      mixed: 0
    };
  })();

  const hasMultipleModels =
    (computedBreakdown.invoice_school_paid ? 1 : 0) +
      (computedBreakdown.monthly_billing ? 1 : 0) +
      (computedBreakdown.term_billing ? 1 : 0) +
      (computedBreakdown.per_lesson ? 1 : 0) >
    1;

  const billingChips = [
    { key: 'invoice_school_paid', label: 'School Invoice', count: computedBreakdown.invoice_school_paid || 0, color: brandColors.navy },
    { key: 'monthly_billing', label: 'Monthly Billing', count: computedBreakdown.monthly_billing || 0, color: brandColors.green },
    { key: 'term_billing', label: 'Term Billing', count: computedBreakdown.term_billing || 0, color: brandColors.purple },
    { key: 'per_lesson', label: 'Per Lesson', count: computedBreakdown.per_lesson || 0, color: brandColors.cyan },
  ].filter((c) => c.count > 0);

  return (
    <Box sx={{ px: { xs: 1, sm: 2, md: 3 }, pb: { xs: 2, sm: 3 } }}>
      {/* Alert banner for "Do Not Work With" schools */}
      {school?.doNotWorkWith && (
        <Alert 
          severity="warning" 
          icon={<NoSymbolIcon className="h-5 w-5" />}
          sx={{ mb: 3, borderRadius: '12px' }}
          action={
            <FormControlLabel
              control={
                <Switch
                  checked={school.doNotWorkWith}
                  onChange={(e) => handleToggleDoNotWorkWith(e.target.checked)}
                  disabled={updatingDoNotWorkWith || clientId.startsWith('SCHOOL_')}
                  size="small"
                />
              }
              label="Do Not Work With"
              sx={{ m: 0 }}
            />
          }
        >
          <Typography variant="body2" fontWeight={600}>
            This school is marked as "Do Not Work With"
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Do not follow up or continue servicing this school. Toggle the switch to remove this status.
          </Typography>
        </Alert>
      )}

      {/* Header with back button - Mobile optimized */}
      <Box 
        display="flex" 
        flexDirection={{ xs: 'column', sm: 'row' }}
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        justifyContent="space-between" 
        mb={3}
        gap={{ xs: 2, sm: 0 }}
      >
        <Box 
          display="flex" 
          alignItems="center" 
          gap={2}
          flexWrap="wrap"
          width={{ xs: '100%', sm: 'auto' }}
        >
          <Button
            startIcon={<ArrowLeftIcon className="h-5 w-5" />}
            onClick={() => navigate('/school-dashboard')}
            variant="outlined"
            size="small"
            sx={{ minWidth: 'auto' }}
          >
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Back to Dashboard</Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>Back</Box>
          </Button>
          <Typography 
            variant="h4" 
            component="h1" 
            sx={{ 
              fontSize: { xs: '1.25rem', sm: '1.5rem' }, 
              fontWeight: 600,
              wordBreak: 'break-word',
              flex: { xs: '1 1 100%', sm: 'none' }
            }}
          >
            {school.name}
          </Typography>
        </Box>
        <Chip
          icon={getHealthStatusIcon(school.healthStatus)}
          label={school.healthStatus.replace('_', ' ')}
          sx={{
            bgcolor: getHealthStatusColor(school.healthStatus),
            color: 'white',
            fontWeight: 500,
            fontSize: { xs: '0.7rem', sm: '0.875rem' },
            height: { xs: '24px', sm: '32px' },
            '& .MuiChip-icon': { color: 'white', fontSize: { xs: '0.875rem', sm: '1rem' } }
          }}
        />
      </Box>

      {/* Summary Cards - Using KpiCard */}
      <Box
        sx={{
          bgcolor: 'white',
          py: { xs: 2, sm: 2, md: 2 },
          mb: 3,
        }}
      >
        <Grid container spacing={{ xs: 1.5, sm: 2 }}>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Revenue"
              value={formatCurrency(school.totalRevenue)}
              tone="default"
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Tutor Cost"
              value={formatCurrency(school.totalTutorCost)}
              tone="default"
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Margin"
              value={formatCurrency(school.totalMargin)}
              subtitle={school.totalMarginPercent !== undefined ? `${school.totalMarginPercent >= 0 ? '+' : ''}${school.totalMarginPercent.toFixed(1)}%` : ''}
              tone={school.totalMargin >= 0 ? 'success' : 'danger'}
            />
          </Grid>
          <Grid item xs={6} sm={6} md={3}>
            <KpiCard
              title="Enrollment"
              value={`${school.totalEnrollment || 0}`}
              subtitle={`${school.totalLessons || 0} lessons`}
              tone="default"
            />
          </Grid>
        </Grid>
      </Box>

      {/* School Info - Compact card design matching dashboard */}
      <Card sx={{ mb: 3, borderRadius: '12px', border: '1px solid', borderColor: 'grey.200', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          {/* Row 1: School name + badges */}
          <Box 
            display="flex" 
            alignItems="center" 
            justifyContent="space-between"
            sx={{ mb: 0.5 }}
          >
            <Typography 
              variant="h6" 
              sx={{ 
                fontSize: '1.125rem',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
                mr: 1,
              }}
            >
              {school.name}
            </Typography>
            <Box 
              display="flex" 
              alignItems="center" 
              gap={1} 
              flexShrink={0}
              sx={{ pr: 2 }}
            >
              {/* Region/Location badge */}
              {school.location && (
                <Chip
                  label={school.location}
                  size="small"
                  sx={{
                    bgcolor: 'grey.100',
                    color: 'text.primary',
                    fontWeight: 500,
                    fontSize: '0.7rem',
                    height: '20px',
                  }}
                />
              )}
              {/* Health badge */}
              <Chip
                icon={getHealthStatusIcon(school.healthStatus)}
                label={school.healthStatus.replace('_', ' ')}
                size="small"
                sx={{
                  bgcolor: getHealthStatusColor(school.healthStatus),
                  color: 'white',
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  height: '20px',
                  '& .MuiChip-icon': { color: 'white', fontSize: '0.875rem' }
                }}
              />
            </Box>
          </Box>

          {/* Row 2: Metadata line */}
          {(() => {
            const metadataParts = [];
            if (school.email) metadataParts.push(school.email);
            if (school.totalLessons > 0) metadataParts.push(`${school.totalLessons} lessons`);
            if (school.totalEnrollment > 0) metadataParts.push(`${school.totalEnrollment} students`);
            const metadataLine = metadataParts.join(' • ');
            
            return metadataLine ? (
              <Typography 
                variant="caption" 
                sx={{ 
                  fontSize: '0.8125rem',
                  color: 'text.secondary',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  mt: 0.5,
                  mb: 0.5,
                }}
              >
                {metadataLine}
              </Typography>
            ) : null;
          })()}

          {/* Divider */}
          <Box 
            sx={{ 
              height: '1px',
              bgcolor: 'grey.100',
              my: 0.75,
            }}
          />

          {/* Do Not Work With Toggle */}
          <Box 
            sx={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 1,
              px: 1,
              bgcolor: school?.doNotWorkWith ? 'error.light' : 'grey.50',
              borderRadius: '8px',
              border: school?.doNotWorkWith ? '1px solid' : 'none',
              borderColor: school?.doNotWorkWith ? 'error.main' : 'transparent',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <NoSymbolIcon className={`h-5 w-5 ${school?.doNotWorkWith ? 'text-red-600' : 'text-gray-500'}`} />
              <Typography 
                variant="body2" 
                sx={{ 
                  fontWeight: school?.doNotWorkWith ? 600 : 500,
                  color: school?.doNotWorkWith ? 'error.main' : 'text.primary'
                }}
              >
                Do Not Work With This School
              </Typography>
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={school?.doNotWorkWith || false}
                  onChange={(e) => handleToggleDoNotWorkWith(e.target.checked)}
                  disabled={updatingDoNotWorkWith || clientId.startsWith('SCHOOL_')}
                  color="error"
                />
              }
              label=""
              sx={{ m: 0 }}
            />
          </Box>
          {clientId.startsWith('SCHOOL_') && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
              Note: This school is grouped by name and does not have a direct client_id. Status cannot be updated.
            </Typography>
          )}

          {/* Divider */}
          <Box 
            sx={{ 
              height: '1px',
              bgcolor: 'grey.100',
              my: 0.75,
            }}
          />

          {/* Financial + Payment metrics container */}
          <Box 
            sx={{ 
              mt: 0.75,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            {/* Financial metrics */}
            <Box 
              sx={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 1.5,
                fontSize: '0.875rem',
              }}
            >
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, flex: '1 1 auto', minWidth: 0 }}>
                <MetricChip 
                  label="Revenue" 
                  value={formatCurrency(school.totalRevenue || 0)} 
                  tone="default"
                />
                <MetricChip 
                  label="Cost" 
                  value={formatCurrency(school.totalTutorCost || 0)} 
                  tone="default"
                />
                <MetricChip 
                  label="Margin" 
                  value={`${formatCurrency(school.totalMargin || 0)} (${formatPercent(marginPercent)})`}
                  tone={marginPercent >= 20 ? 'success' : marginPercent >= 10 ? 'warning' : 'danger'}
                />
                <MetricChip 
                  label="Enrollment" 
                  value={`${school.totalEnrollment || 0} students`}
                  tone="default"
                />
              </Box>

              {/* Payment model chips (top-right of the metrics block) */}
              {billingChips.length > 0 && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, justifyContent: 'flex-end', flexShrink: 0 }}>
                  {/* Show "Mixed" tag if school has multiple billing models */}
                  {school.billingModel === 'mixed' || hasMultipleModels ? (
                    <Chip
                      label="Mixed"
                      size="small"
                      sx={{
                        bgcolor: brandColors.orange,
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        height: '20px',
                      }}
                    />
                  ) : (
                    // Show individual chips if not mixed
                    billingChips.map((c) => (
                      <Chip
                        key={c.key}
                        label={c.label}
                        size="small"
                        sx={{
                          bgcolor: c.color,
                          color: 'white',
                          fontWeight: 600,
                          fontSize: '0.7rem',
                          height: '20px',
                        }}
                      />
                    ))
                  )}
                </Box>
              )}
            </Box>

            {/* Payment metrics */}
            <Box 
              sx={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: 1.5,
                mt: 0,
                mb: 0,
                fontSize: '0.875rem',
              }}
            >
              <MetricChip 
                label="Paid" 
                value={formatCurrency(school.invoices?.paidAmount || 0)} 
                tone="success"
              />
              <MetricChip 
                label="Unpaid" 
                value={formatCurrency(school.invoices?.unpaidAmount || 0)} 
                tone="warning"
              />
              <MetricChip 
                label="Late" 
                value={formatCurrency(school.invoices?.lateAmount || 0)} 
                tone="danger"
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Tabs - Cleaner styling - Mobile optimized */}
      <Card sx={{ borderRadius: '12px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: { xs: 1, sm: 2 }, overflowX: 'auto' }}>
          <Tabs 
            value={currentTab} 
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: '48px',
              '& .MuiTab-root': {
                textTransform: 'none',
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                fontWeight: 500,
                minHeight: '48px',
                color: 'text.secondary',
                minWidth: { xs: 'auto', sm: '72px' },
                px: { xs: 1, sm: 2 },
                '&.Mui-selected': {
                  color: brandColors.purple,
                },
              },
              '& .MuiTabs-indicator': {
                backgroundColor: brandColors.purple,
                height: '3px',
              },
            }}
          >
            <Tab label={`Jobs (${school.jobs.length})`} />
            <Tab label={`Students (${school.totalStudents})`} />
            <Tab label={`Invoices (${school.invoices.details.length})`} />
            <Tab label="Communications" />
          </Tabs>
        </Box>

        <CardContent>
          {/* Jobs Tab */}
          {currentTab === 0 && (
            <Box>
              {school.jobs.length === 0 ? (
                <Alert severity="info">No jobs found for this school.</Alert>
              ) : (
                <TableContainer 
                  component={Paper} 
                  variant="outlined"
                  sx={{
                    overflowX: 'auto',
                    '&::-webkit-scrollbar': {
                      height: '8px',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: 'rgba(0,0,0,0.05)',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      borderRadius: '4px',
                    },
                  }}
                >
                  <Table sx={{ minWidth: { xs: 800, sm: 'auto' } }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Job Name</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', md: 'table-cell' } }}>Term/Season</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', lg: 'table-cell' } }}>Charge Type</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Students</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Lessons</TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>Tutors</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Revenue</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>Margin</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        // Sort jobs: in-progress first, then finished in descending order
                        const sortedJobs = [...school.jobs].sort((a, b) => {
                          const aIsFinished = a.isFinished || a.serviceStatus?.toLowerCase() === 'finished';
                          const bIsFinished = b.isFinished || b.serviceStatus?.toLowerCase() === 'finished';
                          
                          // In-progress jobs come first
                          if (!aIsFinished && bIsFinished) return -1;
                          if (aIsFinished && !bIsFinished) return 1;
                          
                          // If both are finished, sort in descending order (by serviceName or another field)
                          if (aIsFinished && bIsFinished) {
                            return (b.serviceName || '').localeCompare(a.serviceName || '');
                          }
                          
                          // If both are in-progress, maintain original order
                          return 0;
                        });
                        
                        return sortedJobs.map((job, idx) => {
                          const isFinished = job.isFinished || job.serviceStatus?.toLowerCase() === 'finished';
                          const isInProgress = !isFinished && (job.serviceStatus?.toLowerCase() === 'in progress' || job.serviceStatus?.toLowerCase() === 'in-progress');
                          const jobMarginPercent = job.marginPercent || 0;
                          const marginColor = jobMarginPercent >= 35 ? brandColors.green : jobMarginPercent >= 20 ? brandColors.orange : brandColors.pink;
                          const hasLessons = job.lessonCount > 0;
                          
                          return (
                            <TableRow 
                              key={idx} 
                              hover
                              sx={{
                                backgroundColor: isInProgress 
                                  ? `${brandColors.green}08`
                                  : isFinished 
                                    ? `${brandColors.pink}08`
                                    : 'transparent',
                                '&:hover': {
                                  backgroundColor: isInProgress
                                    ? `${brandColors.green}15`
                                    : isFinished
                                      ? `${brandColors.pink}15`
                                      : 'action.hover',
                                }
                              }}
                            >
                              <TableCell
                                onClick={(e) => {
                                  // Only open modal if clicking on the text itself (not the link)
                                  if (e.target.tagName !== 'A' && hasLessons) {
                                    handleJobClick(job);
                                  }
                                }}
                                sx={{
                                  cursor: hasLessons ? 'pointer' : 'default',
                                  position: { xs: 'static', md: 'sticky' },
                                  left: { md: 0 },
                                  bgcolor: 'inherit',
                                  zIndex: { md: 1 },
                                  fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                }}
                              >
                                <Box display="flex" alignItems="center" gap={1}>
                                  {hasLessons && (
                                    <Box
                                      sx={{
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        bgcolor: isInProgress ? brandColors.green : isFinished ? brandColors.pink : 'grey.400',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  {job.serviceId ? (
                                    <Typography
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEnrollmentClick(job);
                                      }}
                                      sx={{
                                        color: brandColors.purple,
                                        textDecoration: 'none',
                                        fontWeight: 500,
                                        fontSize: { xs: '0.75rem', sm: '0.875rem' },
                                        cursor: 'pointer',
                                        '&:hover': {
                                          textDecoration: 'underline',
                                          color: brandColors.navy,
                                        },
                                      }}
                                    >
                                      {job.serviceName}
                                    </Typography>
                                  ) : (
                                    <Typography 
                                      variant="body2" 
                                      fontWeight="medium"
                                      sx={{ 
                                        color: hasLessons ? brandColors.purple : 'text.primary',
                                        '&:hover': hasLessons ? { textDecoration: 'underline', color: brandColors.navy } : {}
                                      }}
                                    >
                                      {job.serviceName}
                                    </Typography>
                                  )}
                                </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                            <Chip 
                              label={job.serviceStatus || 'Unknown'} 
                              size="small"
                              sx={{
                                bgcolor: isInProgress 
                                  ? brandColors.green 
                                  : isFinished 
                                    ? brandColors.pink 
                                    : 'grey.300',
                                color: (isInProgress || isFinished) ? 'white' : 'text.primary',
                                fontWeight: 500,
                                fontSize: { xs: '0.65rem', sm: '0.75rem' },
                                height: { xs: '20px', sm: '24px' },
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{job.termSeason || 'N/A'}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{job.chargeType || 'N/A'}</TableCell>
                          <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{job.studentCount || 0}</TableCell>
                          <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{job.lessonCount || 0}</TableCell>
                          <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' }, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                            {job.tutorNames ? (
                              <Tooltip title={job.tutorNames}>
                                <Typography variant="body2" sx={{ cursor: 'help', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                  {job.tutorNames.length > 30 ? `${job.tutorNames.substring(0, 30)}...` : job.tutorNames}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>No tutors</Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                            <Typography variant="body2" fontWeight="600" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                              {formatCurrency(job.revenue)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                            <Typography 
                              variant="body2" 
                              fontWeight="600"
                              sx={{ color: marginColor, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                            >
                              {formatCurrency(job.margin)}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                color: marginColor,
                                fontWeight: 500,
                                fontSize: { xs: '0.65rem', sm: '0.7rem' },
                              }}
                            >
                              {formatPercent(jobMarginPercent)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                          );
                        });
                      })()}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}

          {/* Students Tab - Improved with collapsible panels */}
          {currentTab === 1 && (
            <Box>
              {/* Student Import Section */}
              <Box sx={{ mb: 4 }}>
                <SchoolStudentImport 
                  schoolClientId={school.clientId || clientId}
                  schoolName={school.name}
                  currentJobs={school.jobs || []}
                />
              </Box>

              <Divider sx={{ my: 4 }} />

              {/* Enrolled Students Section */}
              <Typography variant="h6" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
                Enrolled Students ({school.totalStudents})
              </Typography>
              {school.totalStudents === 0 ? (
                <Alert severity="info">No enrolled students found for this school.</Alert>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {school.jobs
                    .filter(job => job.students && job.students.length > 0)
                    .map((job, idx) => {
                      const jobKey = job.serviceId || idx;
                      const isExpanded = expandedJobPanels[jobKey] !== false; // Default to expanded
                      
                      return (
                        <Card 
                          key={jobKey} 
                          sx={{ 
                            borderRadius: '12px',
                            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                            overflow: 'hidden',
                          }}
                        >
                          <Box
                            onClick={() => setExpandedJobPanels(prev => ({ ...prev, [jobKey]: !isExpanded }))}
                            sx={{
                              p: 2,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              bgcolor: 'grey.50',
                              '&:hover': {
                                bgcolor: 'grey.100',
                              },
                              transition: 'background-color 0.2s',
                            }}
                          >
                            <Box display="flex" alignItems="center" gap={1}>
                              {isExpanded ? (
                                <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                              ) : (
                                <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                              )}
                              <Typography variant="subtitle1" fontWeight={600}>
                                {job.serviceName} ({job.students.length} {job.students.length === 1 ? 'student' : 'students'})
                              </Typography>
                            </Box>
                          </Box>
                          {isExpanded && (
                            <TableContainer>
                              <Table size="small">
                                <TableHead>
                                  <TableRow sx={{ bgcolor: 'grey.50' }}>
                                    <TableCell sx={{ fontWeight: 600 }}>Student Name</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Student ID</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>Client ID</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 600 }}>Payment Method</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {job.students.map((student, sIdx) => {
                                    // Check both student_id and client_id for payment method mapping
                                    const paymentMethod = studentPaymentMethods[student.student_id] || studentPaymentMethods[student.client_id];
                                    const showSchoolInvoice = !paymentMethod && job.billingModel === 'invoice_school_paid';
                                    const paymentMethodType = paymentMethod 
                                      ? (paymentMethod.type === 'monthly' ? 'Subscription' : 'Term Payment')
                                      : (showSchoolInvoice ? 'School Invoice' : 'Per Lesson');
                                    
                                    return (
                                      <TableRow key={sIdx} hover>
                                        <TableCell>
                                          <Typography
                                            sx={{
                                              color: brandColors.purple,
                                              cursor: 'pointer',
                                              textDecoration: 'underline',
                                              '&:hover': { color: brandColors.navy }
                                            }}
                                            onClick={() => {
                                              setSelectedStudent({
                                                studentId: student.student_id,
                                                serviceId: job.serviceId,
                                                studentName: student.student_name || `Student ${student.student_id}`,
                                                paymentMethod: paymentMethodType
                                              });
                                              setStudentBillingModalOpen(true);
                                            }}
                                          >
                                            {student.student_name || `Student ${student.student_id}`}
                                          </Typography>
                                        </TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{student.student_id}</TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{student.client_id}</TableCell>
                                        <TableCell align="center">
                                          {paymentMethod ? (
                                            <Chip
                                              label={paymentMethod.type === 'monthly' ? 'Subscription' : 'Term Payment'}
                                              size="small"
                                              sx={{
                                                bgcolor: paymentMethod.type === 'monthly' ? brandColors.green : brandColors.purple,
                                                color: 'white',
                                                fontWeight: 500,
                                                fontSize: '0.75rem',
                                              }}
                                            />
                                          ) : showSchoolInvoice ? (
                                            <Chip
                                              label="School Invoice"
                                              size="small"
                                              sx={{
                                                bgcolor: brandColors.navy,
                                                color: 'white',
                                                fontWeight: 500,
                                                fontSize: '0.75rem',
                                              }}
                                            />
                                          ) : (
                                            <Chip
                                              label="Per Lesson"
                                              size="small"
                                              sx={{
                                                bgcolor: brandColors.cyan,
                                                color: 'white',
                                                fontWeight: 500,
                                                fontSize: '0.75rem',
                                              }}
                                            />
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableContainer>
                          )}
                        </Card>
                      );
                    })}
                </Box>
              )}
            </Box>
          )}

          {/* Invoices Tab - Improved with KPI row */}
          {currentTab === 2 && (
            <Box>
              {school.invoices.details.length === 0 ? (
                <Card 
                  sx={{ 
                    p: 4, 
                    textAlign: 'center',
                    borderRadius: '12px',
                    bgcolor: 'grey.50',
                    border: '2px dashed',
                    borderColor: 'grey.300',
                  }}
                >
                  <DocumentTextIcon className="h-12 w-12 text-gray-500 mb-4" />
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                    No Invoices Found
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    This school doesn't have any invoices yet.
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<DocumentTextIcon className="h-5 w-5" />}
                    onClick={() => navigate('/school-dashboard/invoice-fulfillment')}
                    sx={{
                      bgcolor: brandColors.purple,
                      '&:hover': { bgcolor: brandColors.navy },
                    }}
                  >
                    Create Invoice in Invoice Fulfillment
                  </Button>
                </Card>
              ) : (
                <>
                  {/* KPI Row */}
                  <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={4}>
                      <KpiCard
                        title="Paid Total"
                        value={formatCurrency(school.invoices.paidAmount)}
                        subtitle={`${school.invoices.paidCount} invoices`}
                        tone="success"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <KpiCard
                        title="Outstanding Total"
                        value={formatCurrency(school.invoices.unpaidAmount)}
                        subtitle={`${school.invoices.unpaidCount} unpaid`}
                        tone="danger"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <KpiCard
                        title="Pending Total"
                        value={formatCurrency((school.invoices.details || [])
                          .filter(inv => inv.status === 'payment-pending' || inv.status === 'pending')
                          .reduce((sum, inv) => sum + (inv.gross || 0), 0))}
                        subtitle={`${(school.invoices.details || []).filter(inv => inv.status === 'payment-pending' || inv.status === 'pending').length} pending`}
                        tone="warning"
                      />
                    </Grid>
                  </Grid>

                  {/* Invoice Table */}
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: '12px' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600 }}>Invoice ID</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Date Sent</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Amount</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Status</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>Days Outstanding</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Reminders</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {school.invoices.details.map((invoice) => (
                          <TableRow key={invoice.id} hover>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              {invoice.display_id || `INV-${invoice.id}`}
                            </TableCell>
                            <TableCell>
                              {invoice.date_sent 
                                ? new Date(invoice.date_sent).toLocaleDateString()
                                : 'N/A'}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 500 }}>
                              {formatCurrency(invoice.gross)}
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={invoice.status}
                                size="small"
                                sx={{
                                  bgcolor: invoice.status === 'paid' 
                                    ? brandColors.green 
                                    : invoice.status === 'unpaid' && invoice.days_outstanding > 30 
                                      ? brandColors.pink 
                                      : invoice.status === 'unpaid' 
                                        ? brandColors.orange 
                                        : '#e0e0e0',
                                  color: invoice.status === 'paid' || invoice.status === 'unpaid' 
                                    ? 'white' 
                                    : '#616161',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              {invoice.days_outstanding !== null && invoice.days_outstanding !== undefined
                                ? `${Math.floor(invoice.days_outstanding)} days`
                                : 'N/A'}
                            </TableCell>
                            <TableCell align="center">
                              {invoice.reminder_count !== undefined && invoice.reminder_count !== null ? (
                                <Box display="flex" flexDirection="column" alignItems="center" gap={0.5}>
                                  <Chip
                                    label={invoice.reminder_count || 0}
                                    size="small"
                                    sx={{
                                      bgcolor: (invoice.reminder_count || 0) > 0 ? brandColors.orange : '#e0e0e0',
                                      color: (invoice.reminder_count || 0) > 0 ? 'white' : '#616161',
                                      fontSize: '0.75rem',
                                    }}
                                  />
                                  {invoice.last_reminder_sent_at && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                      {new Date(invoice.last_reminder_sent_at).toLocaleDateString()}
                                    </Typography>
                                  )}
                                </Box>
                              ) : (
                                <Typography variant="caption" color="text.secondary">
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          <TableCell align="center">
                            <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                              {invoice.id && (
                                <>
                                  {invoice.status === 'unpaid' && (
                                    <>
                                      <Tooltip title="Send Reminder">
                                        <IconButton
                                          size="small"
                                          onClick={() => handleSendReminder(invoice)}
                                          disabled={sendingReminder && reminderInvoiceId === invoice.id}
                                          sx={{ 
                                            color: brandColors.purple,
                                            '&:hover': { bgcolor: `${brandColors.purple}15` }
                                          }}
                                        >
                                          {sendingReminder && reminderInvoiceId === invoice.id ? (
                                            <CircularProgress size={16} />
                                          ) : (
                                            <PaperAirplaneIcon className="h-4 w-4" />
                                          )}
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Sync Reminders">
                                        <IconButton
                                          size="small"
                                          onClick={() => handleSyncReminders(invoice)}
                                          disabled={syncingReminders}
                                          sx={{ 
                                            color: brandColors.cyan,
                                            '&:hover': { bgcolor: `${brandColors.cyan}15` }
                                          }}
                                        >
                                          {syncingReminders ? (
                                            <CircularProgress size={16} />
                                          ) : (
                                            <ArrowPathIcon className="h-4 w-4" />
                                          )}
                                        </IconButton>
                                      </Tooltip>
                                    </>
                                  )}
                                  <Tooltip title="View in TutorCruncher">
                                    <IconButton
                                      size="small"
                                      onClick={() => {
                                        window.open(`https://account.acmeops.com/accounting/invoices/${invoice.id}/`, '_blank');
                                      }}
                                      sx={{ color: brandColors.purple }}
                                    >
                                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                    </IconButton>
                                  </Tooltip>
                                </>
                              )}
                            </Box>
                          </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
            </Box>
          )}

          {/* Communications Tab - Consolidated Contacts, Schedules, Campaigns, Analytics */}
          {currentTab === 3 && (
            <Box>
              <SchoolEmailCampaigns 
                schoolClientId={school.clientId || clientId} 
                schoolName={school.name}
                defaultTab={communicationsSubTab}
                onSubTabChange={handleCommunicationsSubTabChange}
              />
            </Box>
          )}

        </CardContent>
      </Card>

      {/* Lesson Details Modal - Improved */}
      <Dialog
        open={lessonModalOpen}
        onClose={() => {
          setLessonModalOpen(false);
          setLessonFilter('all');
        }}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
          }
        }}
      >
        <DialogTitle sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box>
              <Typography variant="h6" fontWeight="bold" sx={{ fontSize: '1.125rem' }}>
                {selectedJob?.serviceName || 'Lesson Details'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Lesson Details
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              {lessonDetails && lessonDetails.lessons && lessonDetails.lessons.length > 0 && (
                <Tooltip title="Export CSV">
                  <IconButton
                    onClick={exportLessonsToCSV}
                    size="small"
                    sx={{
                      color: brandColors.purple,
                      '&:hover': {
                        bgcolor: `${brandColors.purple}10`,
                      },
                    }}
                  >
                    <ArrowDownTrayIcon className="h-5 w-5" />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton
                size="small"
                onClick={() => {
                  setLessonModalOpen(false);
                  setLessonFilter('all');
                }}
                sx={{ color: 'text.secondary' }}
              >
                <XMarkIcon className="h-5 w-5" />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          {lessonDetailsLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress sx={{ color: brandColors.purple }} />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : lessonDetails && lessonDetails.lessons && lessonDetails.lessons.length > 0 ? (
            <Box>
              {/* Summary KPI Cards */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                  <KpiCard
                    title="Total Lessons"
                    value={lessonDetails.lessons.length}
                    tone="default"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <KpiCard
                    title="Total Revenue"
                    value={formatCurrency(lessonDetails.lessons.reduce((sum, l) => sum + (l.revenue || 0), 0))}
                    tone="default"
                  />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <KpiCard
                    title="Total Margin"
                    value={formatCurrency(lessonDetails.lessons.reduce((sum, l) => sum + (l.margin || 0), 0))}
                    tone={lessonDetails.lessons.reduce((sum, l) => sum + (l.margin || 0), 0) >= 0 ? 'success' : 'danger'}
                  />
                </Grid>
              </Grid>

              {/* Filters */}
              <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {['all', 'complete', 'pending', 'cancelled'].map((filter) => (
                  <Chip
                    key={filter}
                    label={filter.charAt(0).toUpperCase() + filter.slice(1)}
                    onClick={() => setLessonFilter(filter)}
                    sx={{
                      bgcolor: lessonFilter === filter ? brandColors.purple : 'grey.100',
                      color: lessonFilter === filter ? 'white' : 'text.primary',
                      fontWeight: lessonFilter === filter ? 600 : 400,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: lessonFilter === filter ? brandColors.navy : 'grey.200',
                      },
                    }}
                  />
                ))}
              </Box>

              {/* Lessons Table */}
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Date</strong></TableCell>
                      <TableCell><strong>Time</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell align="right"><strong>Units</strong></TableCell>
                      <TableCell><strong>Students</strong></TableCell>
                      <TableCell><strong>Tutors</strong></TableCell>
                      <TableCell align="right"><strong>Revenue</strong></TableCell>
                      <TableCell align="right"><strong>Tutor Cost</strong></TableCell>
                      <TableCell align="right"><strong>Margin</strong></TableCell>
                      <TableCell align="right"><strong>Margin %</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lessonDetails.lessons
                      .filter(lesson => {
                        if (lessonFilter === 'all') return true;
                        const status = (lesson.status || '').toLowerCase();
                        if (lessonFilter === 'complete') return status === 'complete';
                        if (lessonFilter === 'pending') return status.includes('pending') || status === 'scheduled';
                        if (lessonFilter === 'cancelled') return status.includes('cancel');
                        return true;
                      })
                      .map((lesson, idx) => {
                      const startDate = lesson.start ? new Date(lesson.start) : null;
                      const endDate = lesson.finish ? new Date(lesson.finish) : null;
                      const marginPercent = lesson.revenue > 0 
                        ? ((lesson.margin / lesson.revenue) * 100).toFixed(2)
                        : '0.00';
                      const students = lesson.students && Array.isArray(lesson.students)
                        ? lesson.students.map(s => s.student_name || s.recipient_name || 'Unknown').join(', ')
                        : 'N/A';
                      const tutors = lesson.tutors && Array.isArray(lesson.tutors)
                        ? lesson.tutors.map(t => t.contractor_name || 'Unknown').join(', ')
                        : 'N/A';
                      const lessonStatus = (lesson.status || '').toLowerCase();
                      const statusColor = lessonStatus === 'complete' ? brandColors.green : 
                                         lessonStatus.includes('cancel') ? brandColors.pink :
                                         lessonStatus.includes('pending') ? brandColors.orange : 'grey.400';

                      return (
                        <TableRow key={idx} hover>
                          <TableCell>
                            {startDate ? startDate.toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            }) : 'N/A'}
                          </TableCell>
                          <TableCell>
                            {startDate && endDate 
                              ? `${startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                              : 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Box
                                sx={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  bgcolor: statusColor,
                                }}
                              />
                              <Chip
                                label={lesson.status || 'Unknown'}
                                size="small"
                                sx={{
                                  bgcolor: statusColor,
                                  color: 'white',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            </Box>
                          </TableCell>
                          <TableCell align="right">{lesson.units || '0'}</TableCell>
                          <TableCell>
                            <Tooltip title={students}>
                              <Typography variant="body2" sx={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {students}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Tooltip title={tutors}>
                              <Typography variant="body2" sx={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {tutors}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(lesson.revenue)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {formatCurrency(lesson.tutorCost)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography 
                              variant="body2" 
                              fontWeight="medium"
                              sx={{ color: lesson.margin >= 0 ? brandColors.green : brandColors.pink }}
                            >
                              {formatCurrency(lesson.margin)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography 
                              variant="body2"
                              sx={{ color: lesson.margin >= 0 ? brandColors.green : brandColors.pink }}
                            >
                              {lesson.revenue > 0 ? formatPercent(parseFloat(marginPercent)) : '0.0%'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : (
            <Alert severity="info">No lesson details available for this job.</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLessonModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Enrollment Details Modal */}
      <Dialog
        open={enrollmentModalOpen}
        onClose={() => setEnrollmentModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h6">
                {selectedJob?.serviceName || 'Enrollment Details'}
              </Typography>
              <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                <Typography variant="caption" color="text.secondary">
                  Service ID: {selectedJob?.serviceId || 'N/A'}
                </Typography>
                {selectedJob?.serviceId && (
                  <>
                    <Typography variant="caption" color="text.secondary">•</Typography>
                    <MuiLink
                      href={`https://account.acmeops.com/cal/service/${selectedJob.serviceId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        textDecoration: 'none',
                        color: brandColors.purple,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        '&:hover': {
                          textDecoration: 'underline',
                        },
                      }}
                    >
                      Open in TutorCruncher
                      <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                    </MuiLink>
                  </>
                )}
              </Box>
            </Box>
            <IconButton onClick={() => setEnrollmentModalOpen(false)} size="small">
              <XMarkIcon className="h-5 w-5" />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {enrollmentDetailsLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
              <CircularProgress />
            </Box>
          ) : enrollmentDetails && enrollmentDetails.students && enrollmentDetails.students.length > 0 ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
                {enrollmentDetails.serviceName} ({enrollmentDetails.students.length} {enrollmentDetails.students.length === 1 ? 'student' : 'students'})
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Student Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Student ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Client ID</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Payment Method</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {enrollmentDetails.students.map((student, idx) => {
                      const paymentMethod = student.paymentMethod;
                      const paymentMethodType = paymentMethod === 'monthly' 
                        ? 'Monthly Billing' 
                        : paymentMethod === 'term' 
                        ? 'Term Billing' 
                        : paymentMethod === 'invoice'
                        ? 'School Invoice'
                        : 'Per Lesson';
                      
                      return (
                        <TableRow key={idx} hover>
                          <TableCell>
                            <Typography
                              sx={{
                                color: brandColors.purple,
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                '&:hover': { color: brandColors.navy }
                              }}
                              onClick={() => {
                                setSelectedStudent({
                                  studentId: student.student_id,
                                  serviceId: enrollmentDetails.serviceId,
                                  studentName: student.student_name || `Student ${student.student_id}`,
                                  paymentMethod: paymentMethodType
                                });
                                setStudentBillingModalOpen(true);
                              }}
                            >
                              {student.student_name || `Student ${student.student_id}`}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{student.student_id}</TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{student.client_id}</TableCell>
                          <TableCell align="center">
                            {paymentMethod === 'monthly' ? (
                              <Chip
                                label="Monthly Billing"
                                size="small"
                                sx={{
                                  bgcolor: brandColors.green,
                                  color: 'white',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            ) : paymentMethod === 'term' ? (
                              <Chip
                                label="Term Billing"
                                size="small"
                                sx={{
                                  bgcolor: brandColors.purple,
                                  color: 'white',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            ) : paymentMethod === 'invoice' ? (
                              <Chip
                                label="School Invoice"
                                size="small"
                                sx={{
                                  bgcolor: brandColors.navy,
                                  color: 'white',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            ) : (
                              <Chip
                                label="Per Lesson"
                                size="small"
                                sx={{
                                  bgcolor: brandColors.cyan,
                                  color: 'white',
                                  fontWeight: 500,
                                  fontSize: '0.75rem',
                                }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <Box sx={{ mt: 3, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Total Students
                    </Typography>
                    <Typography variant="h6">
                      {enrollmentDetails.students.length}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Per Lesson
                    </Typography>
                    <Typography variant="h6" sx={{ color: brandColors.cyan }}>
                      {enrollmentDetails.students.filter(s => !s.paymentMethod).length}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Monthly Billing
                    </Typography>
                    <Typography variant="h6" sx={{ color: brandColors.green }}>
                      {enrollmentDetails.students.filter(s => s.paymentMethod === 'monthly').length}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Term Billing
                    </Typography>
                    <Typography variant="h6" sx={{ color: brandColors.purple }}>
                      {enrollmentDetails.students.filter(s => s.paymentMethod === 'term').length}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      School Invoice
                    </Typography>
                    <Typography variant="h6" sx={{ color: brandColors.orange }}>
                      {enrollmentDetails.students.filter(s => s.paymentMethod === 'invoice').length}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          ) : (
            <Alert severity="info">
              No students found for this service.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEnrollmentModalOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Student Billing Details Modal */}
      {selectedStudent && (
        <StudentBillingDetailsModal
          open={studentBillingModalOpen}
          onClose={() => {
            setStudentBillingModalOpen(false);
            setSelectedStudent(null);
          }}
          studentId={selectedStudent.studentId}
          serviceId={selectedStudent.serviceId}
          studentName={selectedStudent.studentName}
          paymentMethod={selectedStudent.paymentMethod}
        />
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(s => ({ ...s, isOpen: false }))}
        onConfirm={() => { confirmState.action?.(); setConfirmState(s => ({ ...s, isOpen: false })); }}
        title={confirmState.title}
        message={confirmState.message}
      />
    </Box>
  );
}








