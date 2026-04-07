import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ClockIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  CurrencyDollarIcon,
  UserPlusIcon,
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  FunnelIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  BellAlertIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  UserIcon
} from '@heroicons/react/24/outline';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = [
  { id: 'call', label: 'Call', icon: PhoneIcon, color: 'bg-blue-50 text-blue-600 border-blue-200', dotColor: 'bg-blue-500' },
  { id: 'email', label: 'Email', icon: EnvelopeIcon, color: 'bg-violet-50 text-violet-600 border-violet-200', dotColor: 'bg-violet-500' },
  { id: 'note', label: 'Note', icon: DocumentTextIcon, color: 'bg-amber-50 text-amber-600 border-amber-200', dotColor: 'bg-amber-500' },
  { id: 'meeting', label: 'Meeting', icon: UserGroupIcon, color: 'bg-teal-50 text-teal-600 border-teal-200', dotColor: 'bg-teal-500' },
  { id: 'task', label: 'Task', icon: ClipboardDocumentListIcon, color: 'bg-rose-50 text-rose-600 border-rose-200', dotColor: 'bg-rose-500' },
];

const CALL_OUTCOMES = [
  { id: 'connected', label: 'Connected' },
  { id: 'voicemail', label: 'Left Voicemail' },
  { id: 'no_answer', label: 'No Answer' },
  { id: 'callback_requested', label: 'Callback Requested' },
  { id: 'resolved', label: 'Resolved' },
];

const FILTER_TABS = [
  { id: 'all', label: 'All Activity' },
  { id: 'call', label: 'Calls' },
  { id: 'email', label: 'Emails' },
  { id: 'note', label: 'Notes' },
  { id: 'meeting', label: 'Meetings' },
  { id: 'task', label: 'Tasks' },
  { id: 'job', label: 'Jobs' },
  { id: 'invoice', label: 'Invoices' },
  { id: 'enrollment', label: 'Enrollments' },
];

const POLL_INTERVAL = 30000; // 30 seconds

// ─── Email Compose Modal ─────────────────────────────────────────────────────

function EmailComposePanel({ contacts, onClose, onSent, clientId }) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);

  async function handleSend() {
    if (!to || !message.trim()) return;
    setSending(true);
    try {
      // Send the email
      const emailRes = await fetch('/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: to,
          subject: subject || 'Message from Acme Operations',
          message: `<div style="font-family: sans-serif; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</div>`,
        }),
      });

      if (emailRes.ok) {
        // Log to school_activity
        const contactName = contacts.find(c => c.email === to)?.name || to;
        await fetch(`/api/school-activity/${clientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activityType: 'email',
            subject: subject || null,
            description: `Email sent to ${contactName}: ${message.slice(0, 200)}${message.length > 200 ? '...' : ''}`,
            contactPerson: contactName,
          }),
        });
        setSent(true);
        setTimeout(() => {
          onSent();
          onClose();
        }, 1500);
      }
    } catch (err) {
      console.error('Failed to send email:', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-neutral-100 bg-gradient-to-r from-violet-50 to-violet-50/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PaperAirplaneIcon className="h-4 w-4 text-violet-600" />
            <span className="text-sm font-semibold text-neutral-900">Compose Email</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {sent ? (
        <div className="p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 mx-auto flex items-center justify-center mb-3">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
          </div>
          <p className="text-sm font-medium text-neutral-900">Email sent successfully</p>
          <p className="text-xs text-neutral-500 mt-1">Activity logged to timeline</p>
        </div>
      ) : (
        <div className="p-5 space-y-3">
          {/* To field with contact picker */}
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">To</label>
            <div className="relative">
              <input
                type="email"
                value={to}
                onChange={e => { setTo(e.target.value); setShowContactPicker(false); }}
                placeholder="email@school.com"
                className="w-full px-3 py-2 pr-10 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors"
              />
              {contacts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowContactPicker(!showContactPicker)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-neutral-400 hover:text-violet-600 hover:bg-violet-50"
                  title="Pick from contacts"
                >
                  <UserIcon className="h-4 w-4" />
                </button>
              )}
              {showContactPicker && contacts.length > 0 && (
                <div className="absolute z-20 top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-neutral-200 py-1 max-h-48 overflow-y-auto">
                  {contacts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setTo(c.email); setShowContactPicker(false); }}
                      className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-neutral-50 text-sm"
                    >
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold shrink-0">
                        {c.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-900 truncate">{c.name}</p>
                        <p className="text-xs text-neutral-500 truncate">{c.email}{c.role ? ` — ${c.role}` : ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Email subject"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your message..."
              rows={5}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-300 focus:border-violet-400 transition-colors resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !to || !message.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
              {sending ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete Confirmation Popover ─────────────────────────────────────────────

function DeleteConfirmPopover({ onConfirm, onCancel }) {
  return (
    <div className="absolute right-0 top-8 z-50 w-52 bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
      <div className="flex items-start gap-2 mb-3">
        <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <TrashIcon className="h-3.5 w-3.5 text-red-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-900">Delete activity?</p>
          <p className="text-xs text-neutral-500">Cannot be undone.</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="flex-1 px-3 py-1.5 border border-neutral-300 text-neutral-700 text-xs font-medium rounded-md hover:bg-neutral-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function SchoolActivityTab({ school }) {
  const [crmActivities, setCrmActivities] = useState([]);
  const [derivedActivities, setDerivedActivities] = useState([]);
  const [allActivities, setAllActivities] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [formType, setFormType] = useState('call');
  const [editingActivity, setEditingActivity] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [newActivityCount, setNewActivityCount] = useState(0);
  const lastPollCount = useRef(0);
  const pollTimer = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    contactPerson: '',
    outcome: '',
    followUpDate: '',
  });

  const clientId = school.clientId;

  // ─── Data Fetching ───────────────────────────────────────────────────────

  const fetchCrmActivities = useCallback(async (silent = false) => {
    if (!clientId) return;
    try {
      const res = await fetch(`/api/school-activity/${clientId}`);
      if (res.ok) {
        const data = await res.json();
        const activities = data.activities || [];

        // Detect new activities from other sources (poll comparison)
        if (silent && lastPollCount.current > 0 && activities.length > lastPollCount.current) {
          const diff = activities.length - lastPollCount.current;
          setNewActivityCount(prev => prev + diff);
        }
        lastPollCount.current = activities.length;

        setCrmActivities(activities);
      }
    } catch (err) {
      console.error('Failed to fetch CRM activities:', err);
    }
  }, [clientId]);

  // Fetch contacts for the contact picker
  const fetchContacts = useCallback(async () => {
    if (!clientId) return;
    try {
      const res = await fetch(`/api/school-term-tracking/contacts/${clientId}`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, [clientId]);

  // Build derived activities from school data
  useEffect(() => {
    const timeline = [];

    (school.jobs || []).forEach(job => {
      if (job.createdAt) {
        timeline.push({
          id: `job-created-${job.serviceId}`,
          type: 'job',
          title: 'Job Created',
          description: job.serviceName,
          timestamp: job.createdAt,
          isDerived: true
        });
      }
      if (job.lessonCount > 0) {
        timeline.push({
          id: `lessons-${job.serviceId}`,
          type: 'lesson',
          title: `${job.lessonCount} Lesson${job.lessonCount > 1 ? 's' : ''} Completed`,
          description: job.serviceName,
          timestamp: job.updatedAt || job.createdAt,
          isDerived: true
        });
      }
    });

    (school.invoices?.details || []).forEach(invoice => {
      timeline.push({
        id: `invoice-${invoice.id}`,
        type: 'invoice',
        title: invoice.status === 'paid' ? 'Invoice Paid' : 'Invoice Created',
        description: `$${parseFloat(invoice.amount || 0).toFixed(2)}`,
        timestamp: invoice.dateCreated || invoice.date,
        status: invoice.status,
        isDerived: true
      });
    });

    const studentSet = new Set();
    (school.jobs || []).forEach(job => {
      (job.students || []).forEach(student => {
        const key = student.student_id || student.recipient_id;
        if (key && !studentSet.has(key)) {
          studentSet.add(key);
          timeline.push({
            id: `student-${key}`,
            type: 'enrollment',
            title: 'Student Enrolled',
            description: student.student_name || student.recipient_name,
            timestamp: student.enrolledAt || job.createdAt,
            isDerived: true
          });
        }
      });
    });

    setDerivedActivities(timeline);
  }, [school]);

  // Initial data fetch
  useEffect(() => {
    Promise.all([fetchCrmActivities(), fetchContacts()]).then(() => setLoading(false));
  }, [fetchCrmActivities, fetchContacts]);

  // Polling for new activities (Phase 4: real-time sync)
  useEffect(() => {
    pollTimer.current = setInterval(() => {
      fetchCrmActivities(true); // silent poll
    }, POLL_INTERVAL);
    return () => clearInterval(pollTimer.current);
  }, [fetchCrmActivities]);

  // Listen for cross-tab activity broadcasts (Phase 4)
  useEffect(() => {
    function handleStorageEvent(e) {
      if (e.key === `school_activity_update_${clientId}`) {
        fetchCrmActivities(true);
      }
    }
    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, [clientId, fetchCrmActivities]);

  // Merge CRM + derived activities
  useEffect(() => {
    const crmMapped = crmActivities.map(a => ({
      id: `crm-${a.id}`,
      crmId: a.id,
      type: a.activityType,
      title: getActivityTitle(a.activityType, a.outcome),
      subject: a.subject,
      description: a.description,
      contactPerson: a.contactPerson,
      outcome: a.outcome,
      followUpDate: a.followUpDate,
      followUpCompleted: a.followUpCompleted,
      timestamp: a.createdAt,
      createdBy: a.createdBy,
      invoiceId: a.invoiceId,
      source: a.source,
      isDerived: false
    }));

    const merged = [...crmMapped, ...derivedActivities];
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    setAllActivities(merged);
  }, [crmActivities, derivedActivities]);

  const filteredActivities = typeFilter === 'all'
    ? allActivities
    : allActivities.filter(a => a.type === typeFilter);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function getActivityTitle(type, outcome) {
    const labels = { call: 'Phone Call', email: 'Email', note: 'Note', meeting: 'Meeting', task: 'Task' };
    const base = labels[type] || type;
    if (type === 'call' && outcome) {
      const outcomeLabel = CALL_OUTCOMES.find(o => o.id === outcome)?.label;
      return outcomeLabel ? `${base} — ${outcomeLabel}` : base;
    }
    return base;
  }

  function resetForm() {
    setFormData({ subject: '', description: '', contactPerson: '', outcome: '', followUpDate: '' });
    setEditingActivity(null);
    setShowForm(false);
  }

  function openNewActivity(type) {
    if (type === 'email') {
      setShowEmailCompose(true);
      setShowForm(false);
      return;
    }
    setFormType(type);
    setEditingActivity(null);
    setFormData({ subject: '', description: '', contactPerson: '', outcome: '', followUpDate: '' });
    setShowForm(true);
    setShowEmailCompose(false);
  }

  function openEditActivity(activity) {
    setFormType(activity.type);
    setEditingActivity(activity);
    setFormData({
      subject: activity.subject || '',
      description: activity.description || '',
      contactPerson: activity.contactPerson || '',
      outcome: activity.outcome || '',
      followUpDate: activity.followUpDate ? activity.followUpDate.split('T')[0] : '',
    });
    setShowForm(true);
    setShowEmailCompose(false);
  }

  // Broadcast activity update to other tabs
  function broadcastUpdate() {
    try {
      localStorage.setItem(`school_activity_update_${clientId}`, Date.now().toString());
    } catch {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.description.trim()) return;
    setSubmitting(true);

    try {
      const payload = {
        activityType: formType,
        subject: formData.subject || null,
        description: formData.description,
        contactPerson: formData.contactPerson || null,
        outcome: formData.outcome || null,
        followUpDate: formData.followUpDate || null,
      };

      let res;
      if (editingActivity) {
        res = await fetch(`/api/school-activity/${clientId}/${editingActivity.crmId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/school-activity/${clientId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        resetForm();
        fetchCrmActivities();
        broadcastUpdate();
      }
    } catch (err) {
      console.error('Failed to save activity:', err);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(activityId) {
    try {
      const res = await fetch(`/api/school-activity/${clientId}/${activityId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCrmActivities();
        broadcastUpdate();
        setConfirmDeleteId(null);
      }
    } catch (err) {
      console.error('Failed to delete activity:', err);
    }
  }

  async function handleCompleteFollowUp(activity) {
    if (!activity.crmId) return;
    try {
      const res = await fetch(`/api/school-activity/${clientId}/${activity.crmId}/complete-follow-up`, { method: 'PATCH' });
      if (res.ok) {
        fetchCrmActivities();
        broadcastUpdate();
      }
    } catch (err) {
      console.error('Failed to complete follow-up:', err);
    }
  }

  function dismissNewActivity() {
    setNewActivityCount(0);
    fetchCrmActivities();
  }

  // ─── Formatting ──────────────────────────────────────────────────────────

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const formatFollowUp = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diffDays = Math.round((date - now) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `in ${diffDays}d`;
  };

  const getTypeConfig = (type) => {
    const config = ACTIVITY_TYPES.find(t => t.id === type);
    if (config) return config;
    const derived = {
      job: { icon: DocumentTextIcon, color: 'bg-slate-50 text-slate-600 border-slate-200', dotColor: 'bg-slate-400' },
      lesson: { icon: AcademicCapIcon, color: 'bg-indigo-50 text-indigo-600 border-indigo-200', dotColor: 'bg-indigo-400' },
      invoice: { icon: CurrencyDollarIcon, color: 'bg-emerald-50 text-emerald-600 border-emerald-200', dotColor: 'bg-emerald-400' },
      enrollment: { icon: UserPlusIcon, color: 'bg-cyan-50 text-cyan-600 border-cyan-200', dotColor: 'bg-cyan-400' },
    };
    return derived[type] || { icon: ClockIcon, color: 'bg-neutral-50 text-neutral-500 border-neutral-200', dotColor: 'bg-neutral-400' };
  };

  // ─── Stats ───────────────────────────────────────────────────────────────

  const typeCounts = allActivities.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  const pendingFollowUps = allActivities.filter(a => a.followUpDate && !a.followUpCompleted && !a.isDerived);
  const overdueFollowUps = pendingFollowUps.filter(a => {
    const d = new Date(a.followUpDate + 'T00:00:00');
    return d < new Date(new Date().toDateString());
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with quick-action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Activity Timeline</h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            {allActivities.length} total event{allActivities.length !== 1 ? 's' : ''}
            {pendingFollowUps.length > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                {pendingFollowUps.length} follow-up{pendingFollowUps.length !== 1 ? 's' : ''} pending
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {ACTIVITY_TYPES.slice(0, 3).map(type => (
            <button
              key={type.id}
              onClick={() => openNewActivity(type.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all duration-150 hover:shadow-sm ${type.color}`}
            >
              <type.icon className="h-4 w-4" />
              {type.id === 'email' ? 'Send Email' : `Log ${type.label}`}
            </button>
          ))}
          <div className="relative group">
            <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 transition-all">
              <PlusIcon className="h-4 w-4" />
              More
              <ChevronDownIcon className="h-3 w-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-neutral-200 py-1 z-20 hidden group-hover:block">
              {ACTIVITY_TYPES.slice(3).map(type => (
                <button
                  key={type.id}
                  onClick={() => openNewActivity(type.id)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  <type.icon className="h-4 w-4" />
                  Log {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* New activity notification banner (Phase 4) */}
      {newActivityCount > 0 && (
        <button
          onClick={dismissNewActivity}
          className="w-full bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4" />
          {newActivityCount} new activit{newActivityCount === 1 ? 'y' : 'ies'} from other sources — click to refresh
        </button>
      )}

      {/* Overdue follow-ups banner */}
      {overdueFollowUps.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <BellAlertIcon className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {overdueFollowUps.length} overdue follow-up{overdueFollowUps.length !== 1 ? 's' : ''}
              </p>
              <div className="mt-2 space-y-1.5">
                {overdueFollowUps.slice(0, 3).map(a => (
                  <div key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-red-700 truncate">{a.description?.slice(0, 60)}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-red-500 text-xs">{formatFollowUp(a.followUpDate)}</span>
                      <button
                        onClick={() => handleCompleteFollowUp(a)}
                        className="text-red-600 hover:text-red-800 text-xs font-medium underline"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Compose (Phase 2) */}
      {showEmailCompose && (
        <EmailComposePanel
          contacts={contacts}
          clientId={clientId}
          onClose={() => setShowEmailCompose(false)}
          onSent={() => {
            fetchCrmActivities();
            broadcastUpdate();
          }}
        />
      )}

      {/* Activity form (slide-down) */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100 bg-neutral-50/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-neutral-900">
                  {editingActivity ? 'Edit' : 'Log'} Activity
                </span>
                <div className="flex gap-1.5">
                  {ACTIVITY_TYPES.filter(t => t.id !== 'email').map(type => (
                    <button
                      key={type.id}
                      onClick={() => setFormType(type.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        formType === type.id
                          ? `${type.color} border shadow-sm`
                          : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 border border-transparent'
                      }`}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={resetForm} className="text-neutral-400 hover:text-neutral-600">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Subject */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Subject</label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={e => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder={formType === 'call' ? 'e.g. Follow up on Fall billing' : 'Subject (optional)'}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors"
                />
              </div>
              {/* Contact Person with quick-pick (Phase 3) */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Contact Person</label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={e => setFormData(prev => ({ ...prev, contactPerson: e.target.value }))}
                    placeholder="Who did you speak with?"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors"
                    list={`contacts-list-${clientId}`}
                  />
                  <datalist id={`contacts-list-${clientId}`}>
                    {contacts.map(c => (
                      <option key={c.id} value={c.name}>{c.role ? `${c.name} (${c.role})` : c.name}</option>
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                {formType === 'note' ? 'Note' : 'Details'} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={
                  formType === 'call' ? 'What was discussed? Any action items?'
                  : formType === 'note' ? 'Add your note here...'
                  : formType === 'meeting' ? 'Meeting summary and key takeaways...'
                  : 'What needs to be done?'
                }
                rows={3}
                required
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Outcome (calls/meetings) */}
              {(formType === 'call' || formType === 'meeting') && (
                <div>
                  <label className="block text-xs font-medium text-neutral-600 mb-1">Outcome</label>
                  <select
                    value={formData.outcome}
                    onChange={e => setFormData(prev => ({ ...prev, outcome: e.target.value }))}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple bg-white transition-colors"
                  >
                    <option value="">Select outcome...</option>
                    {CALL_OUTCOMES.map(o => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* Follow-up Date */}
              <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Follow-up Date</label>
                <input
                  type="date"
                  value={formData.followUpDate}
                  onChange={e => setFormData(prev => ({ ...prev, followUpDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !formData.description.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-purple/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Saving...' : editingActivity ? 'Update' : 'Save Activity'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar">
          <FunnelIcon className="h-4 w-4 text-neutral-400 shrink-0" />
          {FILTER_TABS.map(tab => {
            const count = tab.id === 'all' ? allActivities.length : (typeCounts[tab.id] || 0);
            if (tab.id !== 'all' && count === 0) return null;
            return (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  typeFilter === tab.id
                    ? 'bg-brand-purple text-white shadow-sm'
                    : 'text-neutral-600 hover:bg-neutral-100'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none ${
                    typeFilter === tab.id ? 'bg-white/20' : 'bg-neutral-200/80'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden">
        {filteredActivities.length === 0 ? (
          <div className="p-12 text-center">
            <ChatBubbleLeftRightIcon className="mx-auto h-12 w-12 text-neutral-300" />
            <h3 className="mt-3 text-sm font-medium text-neutral-900">No activity yet</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {typeFilter !== 'all'
                ? 'No activity of this type found'
                : 'Start logging calls, emails, and notes to build a relationship history'
              }
            </p>
            {typeFilter === 'all' && (
              <button
                onClick={() => openNewActivity('call')}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-brand-purple text-white hover:bg-brand-purple/90 transition-colors"
              >
                <PhoneIcon className="h-4 w-4" />
                Log First Activity
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredActivities.map((activity) => {
              const config = getTypeConfig(activity.type);
              const IconComp = config.icon;
              const isExpanded = expandedId === activity.id;
              const isCrm = !activity.isDerived;

              return (
                <div
                  key={activity.id}
                  className={`group relative transition-colors ${isExpanded ? 'bg-neutral-50/50' : 'hover:bg-neutral-50/30'}`}
                >
                  <div className="flex items-start gap-3 px-5 py-4">
                    {/* Type indicator icon */}
                    <div className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border ${config.color}`}>
                      <IconComp className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 leading-tight">
                            {activity.title || activity.subject || activity.type}
                          </p>
                          {activity.subject && activity.title !== activity.subject && (
                            <p className="text-xs text-neutral-500 mt-0.5">{activity.subject}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {activity.followUpDate && !activity.followUpCompleted && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              new Date(activity.followUpDate + 'T00:00:00') < new Date(new Date().toDateString())
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              <CalendarDaysIcon className="h-3 w-3" />
                              {formatFollowUp(activity.followUpDate)}
                            </span>
                          )}
                          {activity.followUpCompleted && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <CheckCircleIcon className="h-3 w-3" />
                              Done
                            </span>
                          )}
                          <span className="text-xs text-neutral-400">{formatDate(activity.timestamp)}</span>
                        </div>
                      </div>

                      {/* Description */}
                      <p className={`mt-1 text-sm text-neutral-600 ${isExpanded ? '' : 'line-clamp-2'}`}>
                        {activity.description}
                      </p>

                      {/* Meta line */}
                      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                        {activity.contactPerson && (
                          <span className="text-xs text-neutral-400">
                            Contact: <span className="text-neutral-600">{activity.contactPerson}</span>
                          </span>
                        )}
                        {activity.createdBy && (
                          <span className="text-xs text-neutral-400">
                            by <span className="text-neutral-500">{activity.createdBy}</span>
                          </span>
                        )}
                        {activity.invoiceId && (
                          <span className="text-xs text-neutral-400">
                            Invoice #{activity.invoiceId}
                          </span>
                        )}
                        {activity.source === 'invoice_fulfillment' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-100 text-neutral-500">
                            from billing
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {activity.description?.length > 100 && (
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                          className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                          title={isExpanded ? 'Collapse' : 'Expand'}
                        >
                          {isExpanded ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
                        </button>
                      )}
                      {isCrm && (
                        <>
                          {activity.followUpDate && !activity.followUpCompleted && (
                            <button
                              onClick={() => handleCompleteFollowUp(activity)}
                              className="p-1.5 rounded-md text-neutral-400 hover:text-green-600 hover:bg-green-50"
                              title="Complete follow-up"
                            >
                              <CheckCircleIcon className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => openEditActivity(activity)}
                            className="p-1.5 rounded-md text-neutral-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Edit"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setConfirmDeleteId(confirmDeleteId === activity.crmId ? null : activity.crmId)}
                              className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50"
                              title="Delete"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                            {confirmDeleteId === activity.crmId && (
                              <DeleteConfirmPopover
                                onConfirm={() => handleDelete(activity.crmId)}
                                onCancel={() => setConfirmDeleteId(null)}
                              />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Calls', count: typeCounts.call || 0, color: 'text-blue-600' },
          { label: 'Emails', count: typeCounts.email || 0, color: 'text-violet-600' },
          { label: 'Notes', count: typeCounts.note || 0, color: 'text-amber-600' },
          { label: 'Invoices', count: typeCounts.invoice || 0, color: 'text-emerald-600' },
          { label: 'Follow-ups', count: pendingFollowUps.length, color: pendingFollowUps.length > 0 ? 'text-red-600' : 'text-neutral-400' },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3.5 text-center">
            <p className="text-xs text-neutral-500 font-medium">{stat.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${stat.color}`}>{stat.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
