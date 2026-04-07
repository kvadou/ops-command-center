import React, { lazy, Suspense, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DateTime } from 'luxon';
import DateRangePicker from './DateRangePicker';
import { formatCurrency } from '../utils/formatters';
import {
  BuildingStorefrontIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  ClockIcon,
  PencilSquareIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CalendarIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ReceiptPercentIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChartBarIcon,
  EnvelopeIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';

const ClubCalendarContent = lazy(() => import('./clubs/ClubCalendarContent'));
const ClubAnalyticsContent = lazy(() => import('./clubs/ClubAnalyticsContent'));
const ClubFinancialsContent = lazy(() => import('./clubs/ClubFinancialsContent'));
const ClubCommunicationsContent = lazy(() => import('./clubs/ClubCommunicationsContent'));
const ClubCheckInContent = lazy(() => import('./clubs/ClubCheckInContent'));

// ============================================================
// Sub-components
// ============================================================

const colorMap = {
  'brand-purple': { bg: 'bg-brand-purple/10', text: 'text-brand-purple' },
  'brand-cyan': { bg: 'bg-brand-cyan/10', text: 'text-brand-cyan' },
  'brand-green': { bg: 'bg-green-100', text: 'text-green-700' },
  'brand-amber': { bg: 'bg-amber-100', text: 'text-amber-700' },
};

function MetricCard({ label, value, icon: Icon, color = 'brand-purple', subtitle }) {
  const classes = colorMap[color] || colorMap['brand-purple'];
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${classes.bg}`}>
          <Icon className={`h-5 w-5 ${classes.text}`} />
        </div>
        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold text-neutral-900">{value}</p>
          {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function ClubCard({ club, onEdit, onViewStudents, expanded, onToggle }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 overflow-hidden hover:shadow-md hover:border-brand-purple/20 transition-all duration-200">
      <div
        className="p-5 cursor-pointer flex items-center justify-between"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-lg bg-brand-purple/10">
            <BuildingStorefrontIcon className="h-6 w-6 text-brand-purple" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">{club.name}</h3>
            <p className="text-sm text-neutral-500">{club.location || 'No location set'}</p>
          </div>
          <span className={`ml-3 px-2.5 py-1 rounded-full text-xs font-medium ${
            club.status === 'active' ? 'bg-green-100 text-green-700' :
            club.status === 'paused' ? 'bg-amber-100 text-amber-700' :
            'bg-neutral-100 text-neutral-500'
          }`}>
            {club.status}
          </span>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xs text-neutral-500">Active Students</p>
            <p className="text-lg font-bold text-neutral-900">{club.active_students || 0}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-neutral-500">Total Revenue</p>
            <p className="text-lg font-bold text-green-700">${(club.totalRevenue || 0).toLocaleString()}</p>
          </div>
          {expanded ?
            <ChevronUpIcon className="h-5 w-5 text-neutral-400" /> :
            <ChevronDownIcon className="h-5 w-5 text-neutral-400" />
          }
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-200 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-50 rounded-lg p-3">
              <p className="text-xs text-neutral-500">Total Jobs</p>
              <p className="text-lg font-semibold">{club.totalJobs || 0}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-3">
              <p className="text-xs text-neutral-500">Total Lessons</p>
              <p className="text-lg font-semibold">{club.totalLessons || 0}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-3">
              <p className="text-xs text-neutral-500">Total Hours</p>
              <p className="text-lg font-semibold">{(club.totalHours || 0).toFixed(1)}</p>
            </div>
            <div className="bg-neutral-50 rounded-lg p-3">
              <p className="text-xs text-neutral-500">Upcoming</p>
              <p className="text-lg font-semibold">{club.upcomingLessons || 0}</p>
            </div>
          </div>

          {(club.venue_name || club.venue_address) && (
            <div className="flex items-start gap-2 text-sm text-neutral-600">
              <MapPinIcon className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div>
                {club.venue_name && <span className="font-medium">{club.venue_name}</span>}
                {club.venue_name && club.venue_address && <span> — </span>}
                {club.venue_address && <span>{club.venue_address}</span>}
              </div>
            </div>
          )}

          {club.schedule && club.schedule.length > 0 && (
            <div className="flex items-start gap-2 text-sm text-neutral-600">
              <ClockIcon className="h-4 w-4 text-neutral-400 mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-2">
                {club.schedule.map((s, i) => (
                  <span key={i} className="bg-brand-purple/5 text-brand-purple px-2 py-0.5 rounded text-xs font-medium">
                    {s.day} {s.time}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-sm text-neutral-600">
            <span className="text-xs text-neutral-400 shrink-0 mt-0.5">Labels:</span>
            <div className="flex flex-wrap gap-1">
              {(club.service_labels || []).map((label, i) => (
                <span key={i} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{label}</span>
              ))}
              {(club.support_labels || []).map((label, i) => (
                <span key={`s-${i}`} className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded text-xs">{label}</span>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onViewStudents(club.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-purple/10 text-brand-purple hover:bg-brand-purple/20 transition-colors"
            >
              <UserGroupIcon className="h-4 w-4" />
              View Students ({club.active_students || 0})
            </button>
            <button
              onClick={() => onEdit(club)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EditClubModal({ club, onClose, onSave }) {
  const [form, setForm] = useState({
    name: club?.name || '',
    location: club?.location || '',
    venue_name: club?.venue_name || '',
    venue_address: club?.venue_address || '',
    capacity: club?.capacity || '',
    contact_email: club?.contact_email || '',
    contact_phone: club?.contact_phone || '',
    status: club?.status || 'active',
    description: club?.description || '',
    hero_image_url: club?.hero_image_url || '',
    logistics_info: club?.logistics_info || '',
    cancellation_policy: club?.cancellation_policy || '',
    tc_package_url: club?.tc_package_url || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(club.id, form);
      onClose();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-neutral-200">
          <h2 className="text-lg font-semibold text-neutral-900">Edit {club?.name}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100">
            <XMarkIcon className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {[
            { label: 'Club Name', key: 'name', type: 'text' },
            { label: 'Location', key: 'location', type: 'text' },
            { label: 'Venue Name', key: 'venue_name', type: 'text' },
            { label: 'Venue Address', key: 'venue_address', type: 'text' },
            { label: 'Capacity', key: 'capacity', type: 'number' },
            { label: 'Contact Email', key: 'contact_email', type: 'email' },
            { label: 'Contact Phone', key: 'contact_phone', type: 'tel' },
          ].map(({ label, key, type }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none"
              />
            </div>
          ))}

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={e => setForm(prev => ({ ...prev, status: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Landing Page Content */}
          <div className="pt-4 border-t border-neutral-200">
            <h3 className="text-sm font-semibold text-neutral-900 mb-3">Landing Page Content</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Public-facing club description for the landing page"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Hero Image URL</label>
                <input
                  type="text"
                  value={form.hero_image_url}
                  onChange={e => setForm(prev => ({ ...prev, hero_image_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Logistics Info</label>
                <textarea
                  value={form.logistics_info}
                  onChange={e => setForm(prev => ({ ...prev, logistics_info: e.target.value }))}
                  rows={3}
                  placeholder="Parking, building access, check-in details, etc."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Cancellation Policy</label>
                <textarea
                  value={form.cancellation_policy}
                  onChange={e => setForm(prev => ({ ...prev, cancellation_policy: e.target.value }))}
                  rows={3}
                  placeholder="Cancellation terms displayed on the landing page"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none resize-y"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">TC Package URL</label>
                <input
                  type="text"
                  value={form.tc_package_url}
                  onChange={e => setForm(prev => ({ ...prev, tc_package_url: e.target.value }))}
                  placeholder="https://secure.tutorcruncher.com/..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 text-sm focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-purple hover:bg-brand-navy disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LessonDetailModal({ lesson, onClose }) {

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200">
            <div>
              <h3 className="text-lg font-semibold text-neutral-900">Lesson Details</h3>
              <p className="text-sm text-neutral-500">
                {DateTime.fromISO(lesson.date).toFormat('EEEE, MMM d, yyyy')} at {lesson.time}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
              <XMarkIcon className="h-5 w-5 text-neutral-500" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div>
              <h4 className="text-sm font-medium text-neutral-500 mb-2">Job</h4>
              <p className="text-neutral-900">{lesson.jobName}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-neutral-500 mb-2">Tutor</h4>
              <p className="text-neutral-900">{lesson.tutorName}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium text-neutral-500 mb-2">
                Students ({lesson.studentCount})
              </h4>
              <div className="space-y-2">
                {lesson.students && lesson.students.length > 0 ? (
                  lesson.students.map((student, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded-lg ${
                        student.status === 'missed' ? 'bg-red-50' : 'bg-neutral-50'
                      }`}
                    >
                      <span className={student.status === 'missed' ? 'text-red-600' : 'text-neutral-900'}>
                        {student.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {student.status === 'missed' && (
                          <span className="text-xs text-red-600 font-medium">Missed</span>
                        )}
                        <span className="text-sm text-neutral-600">
                          {formatCurrency(student.chargeRate || 0)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-neutral-500 text-sm">No student data available</p>
                )}
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-4">
              <h4 className="text-sm font-medium text-neutral-500 mb-3">Financial Summary</h4>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-neutral-500 mb-1">Revenue</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(lesson.revenue)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-neutral-500 mb-1">Tutor Pay</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(lesson.tutorPay)}</p>
                </div>
                <div className={`${lesson.profit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-3 text-center`}>
                  <p className="text-xs text-neutral-500 mb-1">Profit</p>
                  <p className={`text-lg font-bold ${lesson.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(lesson.profit)}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-500">Status</span>
              {lesson.isCheckedOut ? (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700">
                  <CheckCircleIcon className="h-4 w-4" />
                  Checked Out
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-700">
                  <ExclamationCircleIcon className="h-4 w-4" />
                  {lesson.status}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-neutral-200">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ClubManagement() {
  const navigate = useNavigate();
  const [clubs, setClubs] = useState([]);
  const [dashboardData, setDashboardData] = useState({ clubs: [], combined: {} });
  const [loading, setLoading] = useState(true);
  const [expandedClub, setExpandedClub] = useState(null);
  const [editingClub, setEditingClub] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Operations state
  const today = DateTime.now().setZone('America/New_York').toISODate();
  const [operationsDateRange, setOperationsDateRange] = useState({
    startDate: today,
    endDate: today,
    preset: 'today'
  });
  const [operationsData, setOperationsData] = useState(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [registryRes, dashboardRes] = await Promise.all([
        fetch('/api/clubs/registry', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/clubs/dashboard', { credentials: 'include' }).then(r => r.ok ? r.json() : { clubs: [], combined: {} }).catch(() => ({ clubs: [], combined: {} })),
      ]);

      const merged = (registryRes.clubs || []).map(club => {
        const metrics = (dashboardRes.clubs || []).find(d => d.id === club.id) || {};
        return { ...club, ...metrics };
      });

      setClubs(merged);
      setDashboardData(dashboardRes);

      // Auto-expand first active club
      const firstActive = merged.find(c => c.status === 'active');
      if (firstActive && !expandedClub) {
        setExpandedClub(firstActive.id);
      }
    } catch (err) {
      console.error('Failed to fetch club data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch operations data
  const fetchOperationsData = useCallback(async (startDate, endDate) => {
    setOperationsLoading(true);
    try {
      const response = await fetch(
        `/api/clubs/operations?startDate=${startDate}&endDate=${endDate}`,
        { credentials: 'include' }
      );
      if (response.ok) {
        const data = await response.json();
        setOperationsData(data);
      }
    } catch (error) {
      console.error('Error fetching operations data:', error);
    } finally {
      setOperationsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (operationsDateRange.startDate && operationsDateRange.endDate) {
      fetchOperationsData(operationsDateRange.startDate, operationsDateRange.endDate);
    }
  }, [operationsDateRange, fetchOperationsData]);

  const handleDateRangeChange = (startDate, endDate, preset) => {
    setOperationsDateRange({ startDate, endDate, preset });
  };

  const handleSaveClub = async (clubId, formData) => {
    const res = await fetch(`/api/clubs/registry/${clubId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(formData),
    });
    if (!res.ok) throw new Error('Save failed');
    await fetchData();
  };

  const handleViewStudents = (clubId) => {
    const club = clubs.find(c => c.id === clubId);
    if (club) {
      navigate(`/student-management?club=${club.slug}`);
    }
  };

  const totalStudents = clubs.reduce((sum, c) => sum + (parseInt(c.active_students) || 0), 0);
  const totalRevenue = dashboardData.combined?.totalRevenue || 0;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-neutral-200 rounded w-48" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-neutral-200 rounded-xl" />)}
          </div>
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="h-32 bg-neutral-200 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          label="Active Clubs"
          value={clubs.filter(c => c.status === 'active').length}
          icon={BuildingStorefrontIcon}
          color="brand-purple"
        />
        <MetricCard
          label="Active Students"
          value={totalStudents}
          icon={UserGroupIcon}
          color="brand-cyan"
        />
        <MetricCard
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          icon={CurrencyDollarIcon}
          color="brand-green"
          subtitle="All time"
        />
      </div>

      {/* Club Cards */}
      <div className="space-y-4">
        {clubs.map(club => (
          <ClubCard
            key={club.id}
            club={club}
            expanded={expandedClub === club.id}
            onToggle={() => setExpandedClub(expandedClub === club.id ? null : club.id)}
            onEdit={setEditingClub}
            onViewStudents={handleViewStudents}
          />
        ))}
      </div>

      {clubs.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-neutral-200">
          <BuildingStorefrontIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
          <p className="text-neutral-500">No clubs configured yet.</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-neutral-200">
        <nav className="flex gap-6" aria-label="Club management tabs">
          {[
            { id: 'overview', label: 'Overview', icon: BuildingStorefrontIcon },
            { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
            { id: 'analytics', label: 'Analytics', icon: ChartBarIcon },
            { id: 'financials', label: 'Financials', icon: CurrencyDollarIcon },
            { id: 'checkin', label: 'Check-in', icon: ClipboardDocumentCheckIcon },
            { id: 'communications', label: 'Communications', icon: EnvelopeIcon },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-1 py-3 border-b-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-brand-purple text-brand-purple'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">Club Operations</h2>
              <p className="text-sm text-neutral-500 mt-1">Daily performance and lesson details</p>
            </div>
            <DateRangePicker
              value={operationsDateRange}
              onChange={handleDateRangeChange}
              label="Date Range"
            />
          </div>

          {operationsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-neutral-500">Loading operations data...</div>
            </div>
          ) : operationsData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarIcon className="h-4 w-4 text-brand-purple" />
                    <span className="text-xs font-medium text-neutral-600">Lessons</span>
                  </div>
                  <p className="text-xl font-bold text-neutral-900">{operationsData.summary.lessonCount}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <UserGroupIcon className="h-4 w-4 text-brand-purple" />
                    <span className="text-xs font-medium text-neutral-600">Students</span>
                  </div>
                  <p className="text-xl font-bold text-neutral-900">{operationsData.summary.studentCount}</p>
                  <p className="text-xs text-neutral-500">{operationsData.summary.totalAttendance} attendance</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-neutral-600">Revenue</span>
                  </div>
                  <p className="text-xl font-bold text-green-700">{formatCurrency(operationsData.summary.grossRevenue)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <BanknotesIcon className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium text-neutral-600">Tutor Pay</span>
                  </div>
                  <p className="text-xl font-bold text-amber-700">{formatCurrency(operationsData.summary.tutorPay)}</p>
                </div>
                <div className={`${operationsData.summary.lessonProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} rounded-lg p-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowTrendingUpIcon className={`h-4 w-4 ${operationsData.summary.lessonProfit >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                    <span className="text-xs font-medium text-neutral-600">Profit</span>
                  </div>
                  <p className={`text-xl font-bold ${operationsData.summary.lessonProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(operationsData.summary.lessonProfit)}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ReceiptPercentIcon className="h-4 w-4 text-brand-purple" />
                    <span className="text-xs font-medium text-neutral-600">Margin</span>
                  </div>
                  <p className="text-xl font-bold text-neutral-900">{operationsData.summary.lessonMargin}%</p>
                </div>
              </div>

              {/* Support summary if any */}
              {operationsData.summary.supportCount > 0 && (
                <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg flex items-center gap-4 text-sm">
                  <span className="text-amber-700 font-medium">Support Sessions: {operationsData.summary.supportCount}</span>
                  <span className="text-amber-600">Pay: {formatCurrency(operationsData.summary.supportPay)}</span>
                  <span className="text-neutral-500">|</span>
                  <span className="text-neutral-600">Combined Profit: {formatCurrency(operationsData.summary.combinedProfit)}</span>
                  <span className="text-neutral-600">({operationsData.summary.combinedMargin}%)</span>
                </div>
              )}

              {/* Lessons Table */}
              {operationsData.lessons.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="bg-neutral-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date/Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Job</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Students</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Revenue</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Pay</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Profit</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {operationsData.lessons.map((lesson) => (
                        <tr
                          key={lesson.appointmentId}
                          onClick={() => setSelectedLesson(lesson)}
                          className="hover:bg-brand-purple/5 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-neutral-900">
                              {DateTime.fromISO(lesson.date).toFormat('MMM d')}
                            </div>
                            <div className="text-xs text-neutral-500">{lesson.time}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-neutral-900 max-w-[200px] truncate" title={lesson.jobName}>
                              {lesson.jobName}
                            </div>
                            {lesson.label && (
                              <span
                                className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{ backgroundColor: lesson.labelColor + '20', color: lesson.labelColor }}
                              >
                                {lesson.label.replace('Club - ', '')}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-600">
                            {lesson.tutorName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center text-sm text-neutral-900">
                            {lesson.studentCount}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium text-green-600">
                            {formatCurrency(lesson.revenue)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right text-sm text-amber-600">
                            {formatCurrency(lesson.tutorPay)}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-right text-sm font-medium ${lesson.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(lesson.profit)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {lesson.isCheckedOut ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                <CheckCircleIcon className="h-3 w-3" />
                                Complete
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                <ExclamationCircleIcon className="h-3 w-3" />
                                {lesson.status}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-neutral-500">
                  <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-neutral-300" />
                  <p className="text-sm">No lessons found for this date range</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-sm">Select a date range to view operations data</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
          </div>
        }>
          <ClubCalendarContent />
        </Suspense>
      )}

      {activeTab === 'analytics' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
          </div>
        }>
          <ClubAnalyticsContent />
        </Suspense>
      )}

      {activeTab === 'financials' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
          </div>
        }>
          <ClubFinancialsContent />
        </Suspense>
      )}

      {activeTab === 'checkin' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
          </div>
        }>
          <ClubCheckInContent />
        </Suspense>
      )}

      {activeTab === 'communications' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
          </div>
        }>
          <ClubCommunicationsContent />
        </Suspense>
      )}

      {/* Edit Modal */}
      {editingClub && (
        <EditClubModal
          club={editingClub}
          onClose={() => setEditingClub(null)}
          onSave={handleSaveClub}
        />
      )}

      {/* Lesson Detail Modal */}
      {selectedLesson && (
        <LessonDetailModal
          lesson={selectedLesson}
          onClose={() => setSelectedLesson(null)}
        />
      )}
    </div>
  );
}
