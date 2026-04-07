import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../../utils/formatters';
import {
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  BuildingOffice2Icon,
  PlusIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  CalendarDaysIcon,
  PencilIcon,
  ChevronDownIcon,
  TrashIcon
} from '@heroicons/react/24/outline';

export default function SchoolOverviewTab({ school, onRefresh }) {
  const [notes, setNotes] = useState([]);

  // Term Setup state
  const [termStatus, setTermStatus] = useState(null);
  const [schoolMetadata, setSchoolMetadata] = useState(null);
  const [termLoading, setTermLoading] = useState(true);
  const [currentTerm, setCurrentTerm] = useState('');
  const [availableTerms, setAvailableTerms] = useState([]);
  const [editingTerm, setEditingTerm] = useState(false);
  const [termFormData, setTermFormData] = useState({});

  // Fetch term status and metadata
  useEffect(() => {
    fetchTermData();
  }, [school.name]);

  const fetchTermData = async () => {
    try {
      setTermLoading(true);
      const schoolName = encodeURIComponent(school.name);

      // Fetch available terms
      const termsRes = await fetch('/api/school-term-tracking/available-terms', {
        credentials: 'include',
      });
      if (termsRes.ok) {
        const termsData = await termsRes.json();
        setAvailableTerms(termsData.availableTerms || []);
        setCurrentTerm(termsData.currentTerm);
      }

      // Fetch term status
      const statusRes = await fetch(`/api/school-term-tracking/term-status/${schoolName}`, {
        credentials: 'include',
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setTermStatus(statusData);
        setTermFormData({
          contract_value: statusData.contract_value || '',
          sessions_count: statusData.sessions_count || '',
          lesson_days: statusData.lesson_days || ''
        });
      }

      // Fetch school metadata
      const metaRes = await fetch(`/api/school-term-tracking/metadata/${schoolName}`, {
        credentials: 'include',
      });
      if (metaRes.ok) {
        const metaData = await metaRes.json();
        setSchoolMetadata(metaData);
      }

      // Fetch school notes
      const notesRes = await fetch(`/api/school-term-tracking/notes/${schoolName}`, {
        credentials: 'include',
      });
      if (notesRes.ok) {
        const notesData = await notesRes.json();
        setNotes(notesData);
      }
    } catch (error) {
      console.error('Error fetching term data:', error);
    } finally {
      setTermLoading(false);
    }
  };

  const handleCheckboxChange = async (field, value) => {
    try {
      const schoolName = encodeURIComponent(school.name);

      const response = await fetch(`/api/school-term-tracking/term-status/${schoolName}/checkbox`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ field, value, term: currentTerm })
      });

      if (response.ok) {
        const updated = await response.json();
        setTermStatus(updated);
      }
    } catch (error) {
      console.error('Error updating checkbox:', error);
    }
  };

  const handleSaveTermData = async () => {
    try {
      const schoolName = encodeURIComponent(school.name);

      const response = await fetch(`/api/school-term-tracking/term-status/${schoolName}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          term: currentTerm,
          contract_value: termFormData.contract_value ? parseFloat(termFormData.contract_value) : null,
          sessions_count: termFormData.sessions_count ? parseInt(termFormData.sessions_count) : null,
          lesson_days: termFormData.lesson_days || null
        })
      });

      if (response.ok) {
        const updated = await response.json();
        setTermStatus(updated);
        setEditingTerm(false);
      }
    } catch (error) {
      console.error('Error saving term data:', error);
    }
  };

  const handleTermChange = async (newTerm) => {
    setCurrentTerm(newTerm);
    // Refetch term status for new term
    try {
      const schoolName = encodeURIComponent(school.name);
      const response = await fetch(`/api/school-term-tracking/term-status/${schoolName}?term=${encodeURIComponent(newTerm)}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const statusData = await response.json();
        setTermStatus(statusData);
        setTermFormData({
          contract_value: statusData.contract_value || '',
          sessions_count: statusData.sessions_count || '',
          lesson_days: statusData.lesson_days || ''
        });
      }
    } catch (error) {
      console.error('Error fetching term status:', error);
    }
  };
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editNoteContent, setEditNoteContent] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);


  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getHealthIcon = (status) => {
    switch (status) {
      case 'healthy':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'needs_attention':
        return <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />;
      case 'unhealthy':
        return <XCircleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <CheckCircleIcon className="h-5 w-5 text-neutral-400" />;
    }
  };

  const getHealthLabel = (status) => {
    switch (status) {
      case 'healthy': return 'Healthy';
      case 'needs_attention': return 'Needs Attention';
      case 'unhealthy': return 'Unhealthy';
      default: return 'Unknown';
    }
  };

  const getHealthExplanation = (school) => {
    if (school.healthStatus === 'unhealthy') {
      const reasons = [];
      if (school.invoices?.lateAmount > 0) {
        reasons.push(`Late invoices: ${formatCurrency(school.invoices.lateAmount)}`);
      }
      if (school.marginPercent < 10) {
        reasons.push(`Low margin: ${school.marginPercent}%`);
      }
      if (school.invoices?.unpaidAmount > 0 && school.invoices?.maxDaysOutstandingUnpaid > 30) {
        reasons.push(`Overdue: ${school.invoices.maxDaysOutstandingUnpaid} days`);
      }
      return reasons.length > 0 ? reasons.join(' • ') : 'Multiple issues detected';
    }
    if (school.healthStatus === 'needs_attention') {
      const reasons = [];
      if (school.marginPercent >= 10 && school.marginPercent < 20) {
        reasons.push(`Margin ${school.marginPercent}% (target: 20%+)`);
      }
      if (school.invoices?.unpaidAmount > 0) {
        reasons.push(`Unpaid: ${formatCurrency(school.invoices.unpaidAmount)}`);
      }
      return reasons.length > 0 ? reasons.join(' • ') : 'Some areas need review';
    }
    return null;
  };

  const getBillingModelLabel = (model) => {
    const labels = {
      per_lesson: 'Per Lesson',
      per_student: 'Per Student',
      monthly_billing: 'Monthly',
      term_billing: 'Term',
      invoice_school_paid: 'Invoice (School Pays)',
      mixed: 'Mixed'
    };
    return labels[model] || model || 'N/A';
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    setSavingNote(true);
    try {
      const schoolName = encodeURIComponent(school.name);
      const response = await fetch(`/api/school-term-tracking/notes/${schoolName}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: newNote })
      });

      if (response.ok) {
        const newNoteData = await response.json();
        setNotes([newNoteData, ...notes]);
        setNewNote('');
        setAddingNote(false);
      }
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleEditNote = async (noteId) => {
    if (!editNoteContent.trim()) return;

    setSavingNote(true);
    try {
      const response = await fetch(`/api/school-term-tracking/notes/${noteId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: editNoteContent })
      });

      if (response.ok) {
        const updatedNote = await response.json();
        setNotes(notes.map(n => n.id === noteId ? updatedNote : n));
        setEditingNoteId(null);
        setEditNoteContent('');
      }
    } catch (error) {
      console.error('Error updating note:', error);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId) => {
    try {
      const response = await fetch(`/api/school-term-tracking/notes/${noteId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setNotes(notes.filter(n => n.id !== noteId));
        setConfirmDeleteId(null);
      }
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const startEditingNote = (note) => {
    setEditingNoteId(note.id);
    setEditNoteContent(note.content);
    setConfirmDeleteId(null); // Close any open delete confirmation
  };

  const cancelEditingNote = () => {
    setEditingNoteId(null);
    setEditNoteContent('');
  };

  // Get contact info from school data
  const contactName = school.contactName || school.name;
  const email = school.email || 'N/A';
  const phone = school.phone || 'N/A';
  const location = school.location || 'Unknown';

  // Calculate balance
  const balance = (school.invoices?.unpaidAmount || 0) + (school.invoices?.lateAmount || 0);

  return (
    <div className="space-y-6">
      {/* Top Row - Contact & Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact Card */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Contact</h3>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-brand-purple/10 flex items-center justify-center flex-shrink-0">
              <BuildingOffice2Icon className="h-8 w-8 text-brand-purple" />
            </div>
            <div className="space-y-2 min-w-0 flex-1">
              <p className="text-sm text-neutral-500">Contact</p>
              <p className="font-medium text-neutral-900 truncate">{contactName}</p>

              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <EnvelopeIcon className="h-4 w-4 flex-shrink-0" />
                <a href={`mailto:${email}`} className="text-brand-purple hover:underline truncate">
                  {email}
                </a>
              </div>

              {phone !== 'N/A' && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <PhoneIcon className="h-4 w-4 flex-shrink-0" />
                  <span>{phone}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <MapPinIcon className="h-4 w-4 flex-shrink-0" />
                <span>{location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Profile</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">ID</span>
              <span className="text-sm font-medium text-neutral-900">{school.clientId || school.id || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Created</span>
              <span className="text-sm font-medium text-neutral-900">{formatDate(school.createdAt)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Status</span>
              <span className={`text-sm font-medium ${school.isActive ? 'text-green-600' : 'text-neutral-500'}`}>
                {school.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Health</span>
              <div className="flex items-center gap-2">
                {getHealthIcon(school.healthStatus)}
                <span className={`text-sm font-medium ${
                  school.healthStatus === 'healthy' ? 'text-green-600' :
                  school.healthStatus === 'needs_attention' ? 'text-yellow-600' :
                  'text-red-600'
                }`}>
                  {getHealthLabel(school.healthStatus)}
                </span>
              </div>
            </div>
            {school.schoolLabel && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-500">Labels</span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-purple/10 text-brand-purple">
                  {school.schoolLabel}
                </span>
              </div>
            )}
          </div>

          {/* Health Explanation */}
          {getHealthExplanation(school) && (
            <div className={`mt-4 p-3 rounded-lg text-sm ${
              school.healthStatus === 'unhealthy' ? 'bg-red-50 text-red-700' :
              school.healthStatus === 'needs_attention' ? 'bg-yellow-50 text-yellow-700' :
              'bg-neutral-50 text-neutral-700'
            }`}>
              {getHealthExplanation(school)}
            </div>
          )}
        </div>
      </div>

      {/* Term Setup Card */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <CalendarDaysIcon className="h-5 w-5 text-brand-purple" />
            <h3 className="text-lg font-semibold text-neutral-900">Term Setup</h3>
            {/* Term Selector */}
            <div className="relative">
              <select
                value={currentTerm}
                onChange={(e) => handleTermChange(e.target.value)}
                className="appearance-none bg-brand-purple/10 text-brand-purple px-3 py-1 pr-8 rounded-full text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-purple"
              >
                {availableTerms.map(term => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
              <ChevronDownIcon className="h-4 w-4 text-brand-purple absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          {!editingTerm && (
            <button
              onClick={() => setEditingTerm(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-purple/10 rounded-md transition-colors"
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>
          )}
        </div>

        {termLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-purple"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Workflow Checkboxes */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { key: 'school_confirmed', label: 'School Confirmed', auto: false },
                { key: 'tutor_assigned', label: 'Tutor Assigned', auto: true },
                { key: 'contract_signed', label: 'Contract Signed', auto: false },
                { key: 'job_created', label: 'Job Created', auto: true },
                { key: 'roster_connected', label: 'Roster Connected', auto: true }
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={termStatus?.[item.key] || false}
                    onChange={(e) => handleCheckboxChange(item.key, e.target.checked)}
                    className="w-4 h-4 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple cursor-pointer"
                  />
                  <span className="text-sm text-neutral-700 group-hover:text-neutral-900">
                    {item.label}
                    {item.auto && <span className="text-xs text-neutral-400 ml-1">(auto)</span>}
                  </span>
                </label>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-neutral-100"></div>

            {/* Term Details */}
            {editingTerm ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-500 mb-1">Contract Value ($)</label>
                    <input
                      type="number"
                      value={termFormData.contract_value}
                      onChange={(e) => setTermFormData({ ...termFormData, contract_value: e.target.value })}
                      placeholder="e.g., 2500"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-500 mb-1">Sessions</label>
                    <input
                      type="number"
                      value={termFormData.sessions_count}
                      onChange={(e) => setTermFormData({ ...termFormData, sessions_count: e.target.value })}
                      placeholder="e.g., 17"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-500 mb-1">Lesson Days</label>
                    <input
                      type="text"
                      value={termFormData.lesson_days}
                      onChange={(e) => setTermFormData({ ...termFormData, lesson_days: e.target.value })}
                      placeholder="e.g., Mon, Wed"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveTermData}
                    className="px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingTerm(false);
                      setTermFormData({
                        contract_value: termStatus?.contract_value || '',
                        sessions_count: termStatus?.sessions_count || '',
                        lesson_days: termStatus?.lesson_days || ''
                      });
                    }}
                    className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-neutral-500">Contract Value</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    {termStatus?.contract_value ? `$${Number(termStatus.contract_value).toLocaleString()}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-500">Sessions</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    {termStatus?.sessions_count || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-500">Lesson Days</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    {termStatus?.lesson_days || school.lessonDays || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-500">School Type</p>
                  <p className="text-lg font-semibold text-neutral-900">
                    {schoolMetadata?.school_type === 'elective' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                        Elective
                      </span>
                    ) : (
                      <span className="text-neutral-600">Regular</span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle Row - Key Metrics & Billing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Metrics Card */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Key Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-neutral-500">Students</p>
              <p className="text-2xl font-bold text-neutral-900">{school.totalStudents || 0}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Lessons</p>
              <p className="text-2xl font-bold text-neutral-900">{school.totalLessons || 0}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Revenue</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(school.totalRevenue)}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-500">Margin</p>
              <p className="text-2xl font-bold text-neutral-900">
                {formatCurrency(school.totalMargin)}
                <span className="text-sm font-normal text-neutral-500 ml-1">
                  ({school.marginPercent || 0}%)
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Billing Summary Card */}
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Billing Summary</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Billing Model</span>
              <span className="text-sm font-medium text-neutral-900">
                {getBillingModelLabel(school.billingModel)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Balance Due</span>
              <span className={`text-sm font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(balance)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Unpaid</span>
              <span className={`text-sm font-medium ${school.invoices?.unpaidAmount > 0 ? 'text-yellow-600' : 'text-neutral-900'}`}>
                {formatCurrency(school.invoices?.unpaidAmount || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Late</span>
              <span className={`text-sm font-medium ${school.invoices?.lateAmount > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
                {formatCurrency(school.invoices?.lateAmount || 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-neutral-500">Paid</span>
              <span className="text-sm font-medium text-green-600">
                {formatCurrency(school.invoices?.paidAmount || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-neutral-900">Notes</h3>
          {!addingNote && (
            <button
              onClick={() => {
                setAddingNote(true);
                setConfirmDeleteId(null); // Close any open delete confirmation
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-brand-purple hover:text-brand-navy hover:bg-brand-purple/10 rounded-md transition-colors"
            >
              <PlusIcon className="h-4 w-4" />
              Add Note
            </button>
          )}
        </div>

        {addingNote && (
          <div className="mb-4 space-y-3">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add a note about this school..."
              rows={3}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAddNote}
                disabled={savingNote || !newNote.trim()}
                className="px-4 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingNote ? 'Saving...' : 'Save Note'}
              </button>
              <button
                onClick={() => {
                  setAddingNote(false);
                  setNewNote('');
                }}
                className="px-4 py-2 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {notes.length === 0 ? (
          <p className="text-sm text-neutral-500 italic">No notes yet</p>
        ) : (
          <div className="space-y-3">
            {notes.map((note, index) => (
              <div key={note.id || index} className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0 group">
                {editingNoteId === note.id ? (
                  /* Edit mode */
                  <div className="space-y-3">
                    <textarea
                      value={editNoteContent}
                      onChange={(e) => setEditNoteContent(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditNote(note.id)}
                        disabled={savingNote || !editNoteContent.trim()}
                        className="px-3 py-1.5 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingNote ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEditingNote}
                        className="px-3 py-1.5 border border-neutral-300 rounded-md hover:bg-neutral-50 transition-colors text-sm font-medium text-neutral-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div className="relative">
                    <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                      <button
                        onClick={() => startEditingNote(note)}
                        className="p-1 text-neutral-400 hover:text-brand-purple hover:bg-brand-purple/10 rounded transition-colors"
                        title="Edit note"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setConfirmDeleteId(confirmDeleteId === note.id ? null : note.id)}
                          className={`p-1 rounded transition-colors ${
                            confirmDeleteId === note.id
                              ? 'text-red-600 bg-red-50'
                              : 'text-neutral-400 hover:text-red-600 hover:bg-red-50'
                          }`}
                          title="Delete note"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                        {/* Delete Confirmation Popover */}
                        {confirmDeleteId === note.id && (
                          <div className="absolute right-0 top-8 z-50 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-start gap-2 mb-3">
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                <TrashIcon className="h-4 w-4 text-red-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-neutral-900">Delete note?</p>
                                <p className="text-xs text-neutral-500">This action cannot be undone.</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex-1 px-3 py-1.5 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-md hover:bg-neutral-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-neutral-700 whitespace-pre-wrap pr-16">{note.content}</p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {note.author && `${note.author} • `}
                      {formatDate(note.createdAt)}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
