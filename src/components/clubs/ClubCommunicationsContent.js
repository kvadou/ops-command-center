import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DateTime } from 'luxon';
import {
  EnvelopeIcon,
  BellAlertIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

// ============================================================
// Constants
// ============================================================

const TYPE_DISPLAY_NAMES = {
  class_reminder: 'Class Reminder',
  missed_class_followup: 'Missed Class',
  trial_followup_1: 'Trial Day 1',
  trial_followup_2: 'Trial Day 3',
  trial_followup_3: 'Trial Day 7',
  pack_depletion: 'Pack Alert',
  attendance_streak: 'Streak',
  win_back: 'Win Back',
};

const TYPE_COLORS = {
  class_reminder: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'bg-blue-500' },
  missed_class_followup: { bg: 'bg-amber-100', text: 'text-amber-700', dot: 'bg-amber-500' },
  trial_followup_1: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  trial_followup_2: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  trial_followup_3: { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  pack_depletion: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  attendance_streak: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
  win_back: { bg: 'bg-red-100', text: 'text-red-700', dot: 'bg-red-500' },
};

const STATUS_STYLES = {
  sent: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircleIcon },
  failed: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircleIcon },
};

const PAGE_SIZE = 50;

// ============================================================
// Helper functions
// ============================================================

function getAuthHeaders() {
  return { 'Content-Type': 'application/json' };
}

function getTypeColors(type) {
  // Match partial keys for trial_followup variants
  if (type?.startsWith('trial_followup')) {
    return TYPE_COLORS.trial_followup_1;
  }
  return TYPE_COLORS[type] || { bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-500' };
}

function getTypeDisplayName(type) {
  return TYPE_DISPLAY_NAMES[type] || type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Unknown';
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  return DateTime.fromISO(isoStr).setZone('America/New_York').toFormat('MMM d, yyyy h:mm a');
}

// ============================================================
// Sub-components
// ============================================================

function StatCard({ label, value, icon: Icon, color }) {
  const colorStyles = {
    blue: { bg: 'bg-blue-50', iconBg: 'bg-blue-100', iconText: 'text-blue-600', valueText: 'text-blue-700' },
    amber: { bg: 'bg-amber-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', valueText: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', iconBg: 'bg-purple-100', iconText: 'text-purple-600', valueText: 'text-purple-700' },
    green: { bg: 'bg-green-50', iconBg: 'bg-green-100', iconText: 'text-green-600', valueText: 'text-green-700' },
  };
  const style = colorStyles[color] || colorStyles.purple;

  return (
    <div className={`${style.bg} rounded-xl border border-neutral-200 p-5`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${style.iconBg}`}>
          <Icon className={`h-5 w-5 ${style.iconText}`} />
        </div>
        <div>
          <p className="text-xs text-neutral-500 uppercase tracking-wide font-medium">{label}</p>
          <p className={`text-2xl font-bold ${style.valueText}`}>{value ?? 0}</p>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-purple focus:ring-offset-2 ${
        enabled ? 'bg-brand-purple' : 'bg-neutral-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          enabled ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function AutomationSettingCard({ title, description, icon: Icon, enabled, onToggle, saving, children }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border p-5 transition-all duration-200 ${
      enabled ? 'border-brand-purple/30 ring-1 ring-brand-purple/10' : 'border-neutral-200'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <div className={`p-2 rounded-lg shrink-0 ${enabled ? 'bg-brand-purple/10' : 'bg-neutral-100'}`}>
            <Icon className={`h-5 w-5 ${enabled ? 'text-brand-purple' : 'text-neutral-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-neutral-900">{title}</h4>
              {saving && (
                <span className="text-xs text-brand-purple animate-pulse">Saving...</span>
              )}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">{description}</p>
            {enabled && children && (
              <div className="mt-3 pt-3 border-t border-neutral-100">
                {children}
              </div>
            )}
          </div>
        </div>
        <ToggleSwitch enabled={enabled} onChange={onToggle} disabled={saving} />
      </div>
    </div>
  );
}

function TypeBadge({ type }) {
  const colors = getTypeColors(type);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
      {getTypeDisplayName(type)}
    </span>
  );
}

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.sent;
  const StatusIcon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      <StatusIcon className="h-3 w-3" />
      {status === 'sent' ? 'Sent' : 'Failed'}
    </span>
  );
}

// ============================================================
// Main Component
// ============================================================

export default function ClubCommunicationsContent() {
  // Club resolution
  const [clubId, setClubId] = useState(null);
  const [clubName, setClubName] = useState('');
  const [clubLoading, setClubLoading] = useState(true);

  // Stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Settings
  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingField, setSavingField] = useState(null);

  // Communication log
  const [communications, setCommunications] = useState([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('');

  // Error state
  const [error, setError] = useState(null);

  // Debounce timer ref for config inputs
  const debounceRef = useRef(null);

  // --------------------------------------------------------
  // Fetch active club
  // --------------------------------------------------------
  const fetchClub = useCallback(async () => {
    try {
      setClubLoading(true);
      const res = await fetch('/api/clubs/registry?status=active', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load clubs');
      const data = await res.json();
      const activeClubs = data.clubs || data || [];
      if (activeClubs.length > 0) {
        setClubId(activeClubs[0].id);
        setClubName(activeClubs[0].name || 'Club');
      } else {
        setError('No active clubs found.');
      }
    } catch (err) {
      setError('Failed to load club information. Please try refreshing.');
    } finally {
      setClubLoading(false);
    }
  }, []);

  useEffect(() => { fetchClub(); }, [fetchClub]);

  // --------------------------------------------------------
  // Fetch stats
  // --------------------------------------------------------
  const fetchStats = useCallback(async () => {
    if (!clubId) return;
    try {
      setStatsLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/communications/stats`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch communication stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [clubId]);

  // --------------------------------------------------------
  // Fetch settings
  // --------------------------------------------------------
  const fetchSettings = useCallback(async () => {
    if (!clubId) return;
    try {
      setSettingsLoading(true);
      const res = await fetch(`/api/clubs/${clubId}/automation-settings`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch automation settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  }, [clubId]);

  // --------------------------------------------------------
  // Fetch communication log
  // --------------------------------------------------------
  const fetchCommunications = useCallback(async () => {
    if (!clubId) return;
    try {
      setLogLoading(true);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(logPage * PAGE_SIZE),
      });
      if (typeFilter) {
        params.set('type', typeFilter);
      }
      const res = await fetch(`/api/clubs/${clubId}/communications?${params}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCommunications(data.communications || data.data || []);
        setLogTotal(data.total ?? data.count ?? 0);
      }
    } catch (err) {
      console.error('Failed to fetch communications:', err);
    } finally {
      setLogLoading(false);
    }
  }, [clubId, logPage, typeFilter]);

  // --------------------------------------------------------
  // Load data when clubId resolves
  // --------------------------------------------------------
  useEffect(() => {
    if (clubId) {
      fetchStats();
      fetchSettings();
    }
  }, [clubId, fetchStats, fetchSettings]);

  useEffect(() => {
    if (clubId) {
      fetchCommunications();
    }
  }, [clubId, fetchCommunications]);

  // --------------------------------------------------------
  // Save settings (debounced for config inputs)
  // --------------------------------------------------------
  const saveSettings = useCallback(async (updatedSettings, fieldName) => {
    if (!clubId) return;
    setSavingField(fieldName);
    try {
      const res = await fetch(`/api/clubs/${clubId}/automation-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings || data);
      }
    } catch (err) {
      console.error('Failed to save automation settings:', err);
    } finally {
      setSavingField(null);
    }
  }, [clubId]);

  const handleToggle = useCallback((field, value) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    saveSettings(updated, field);
  }, [settings, saveSettings]);

  const handleConfigChange = useCallback((field, value) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) || numValue < 0) return;
    const updated = { ...settings, [field]: numValue };
    setSettings(updated);

    // Debounce the save
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveSettings(updated, field);
    }, 800);
  }, [settings, saveSettings]);

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // --------------------------------------------------------
  // Pagination
  // --------------------------------------------------------
  const totalPages = Math.ceil(logTotal / PAGE_SIZE);
  const handlePrevPage = () => setLogPage(p => Math.max(0, p - 1));
  const handleNextPage = () => setLogPage(p => Math.min(totalPages - 1, p + 1));

  // Reset page when filter changes
  const handleFilterChange = (e) => {
    setTypeFilter(e.target.value);
    setLogPage(0);
  };

  // --------------------------------------------------------
  // Loading / Error states
  // --------------------------------------------------------
  if (clubLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex items-center gap-3 text-neutral-500">
          <ArrowPathIcon className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading communications...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ExclamationTriangleIcon className="h-12 w-12 text-neutral-300 mb-3" />
        <p className="text-neutral-500 text-sm">{error}</p>
      </div>
    );
  }

  // --------------------------------------------------------
  // Compute stat values
  // --------------------------------------------------------
  const totalSent = stats?.total_sent ?? stats?.totalSent ?? 0;
  const classReminders = stats?.class_reminder ?? stats?.classReminder ?? 0;
  const missedFollowups = stats?.missed_class_followup ?? stats?.missedClassFollowup ?? 0;
  const trialFollowups = (stats?.trial_followup_1 ?? 0) + (stats?.trial_followup_2 ?? 0) + (stats?.trial_followup_3 ?? 0) + (stats?.trialFollowup ?? 0);

  // --------------------------------------------------------
  // Render
  // --------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Stats Summary Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">30-Day Summary</h3>
          {statsLoading && (
            <ArrowPathIcon className="h-4 w-4 text-neutral-400 animate-spin" />
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Sent"
            value={totalSent}
            icon={PaperAirplaneIcon}
            color="purple"
          />
          <StatCard
            label="Class Reminders"
            value={classReminders}
            icon={BellAlertIcon}
            color="blue"
          />
          <StatCard
            label="Missed Class"
            value={missedFollowups}
            icon={ExclamationTriangleIcon}
            color="amber"
          />
          <StatCard
            label="Trial Follow-ups"
            value={trialFollowups}
            icon={UserGroupIcon}
            color="green"
          />
        </div>
      </div>

      {/* Automation Settings */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Cog6ToothIcon className="h-5 w-5 text-brand-purple" />
          <h3 className="text-lg font-semibold text-neutral-900">Automation Settings</h3>
        </div>
        <p className="text-sm text-neutral-500 mb-5">
          Configure automated communications for {clubName}
        </p>

        {settingsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3 text-neutral-500">
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading settings...</span>
            </div>
          </div>
        ) : settings ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AutomationSettingCard
              title="Class Reminders"
              description="Send email reminders before upcoming classes"
              icon={BellAlertIcon}
              enabled={settings.class_reminders_enabled ?? settings.classRemindersEnabled ?? false}
              onToggle={(val) => handleToggle(settings.class_reminders_enabled !== undefined ? 'class_reminders_enabled' : 'classRemindersEnabled', val)}
              saving={savingField === 'class_reminders_enabled' || savingField === 'classRemindersEnabled'}
            >
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <span>Send</span>
                <input
                  type="number"
                  min="1"
                  max="72"
                  value={settings.reminder_hours_before ?? settings.reminderHoursBefore ?? 24}
                  onChange={(e) => handleConfigChange(
                    settings.reminder_hours_before !== undefined ? 'reminder_hours_before' : 'reminderHoursBefore',
                    e.target.value
                  )}
                  className="w-16 px-2 py-1 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-center"
                />
                <span>hours before class</span>
              </label>
            </AutomationSettingCard>

            <AutomationSettingCard
              title="Missed Class Follow-ups"
              description="Automatically follow up when a student misses a class"
              icon={ExclamationTriangleIcon}
              enabled={settings.missed_class_enabled ?? settings.missedClassEnabled ?? false}
              onToggle={(val) => handleToggle(settings.missed_class_enabled !== undefined ? 'missed_class_enabled' : 'missedClassEnabled', val)}
              saving={savingField === 'missed_class_enabled' || savingField === 'missedClassEnabled'}
            />

            <AutomationSettingCard
              title="Trial Follow-up Sequence"
              description="3-email sequence after a student's trial class (Day 1, 3, 7)"
              icon={EnvelopeIcon}
              enabled={settings.trial_followup_enabled ?? settings.trialFollowupEnabled ?? false}
              onToggle={(val) => handleToggle(settings.trial_followup_enabled !== undefined ? 'trial_followup_enabled' : 'trialFollowupEnabled', val)}
              saving={savingField === 'trial_followup_enabled' || savingField === 'trialFollowupEnabled'}
            />

            <AutomationSettingCard
              title="Pack Depletion Alerts"
              description="Alert families when their class pack is running low"
              icon={ClockIcon}
              enabled={settings.pack_depletion_enabled ?? settings.packDepletionEnabled ?? false}
              onToggle={(val) => handleToggle(settings.pack_depletion_enabled !== undefined ? 'pack_depletion_enabled' : 'packDepletionEnabled', val)}
              saving={savingField === 'pack_depletion_enabled' || savingField === 'packDepletionEnabled'}
            >
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <span>Alert when</span>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.pack_depletion_threshold ?? settings.packDepletionThreshold ?? 2}
                  onChange={(e) => handleConfigChange(
                    settings.pack_depletion_threshold !== undefined ? 'pack_depletion_threshold' : 'packDepletionThreshold',
                    e.target.value
                  )}
                  className="w-16 px-2 py-1 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-center"
                />
                <span>classes remaining</span>
              </label>
            </AutomationSettingCard>

            <AutomationSettingCard
              title="Win-back Campaigns"
              description="Re-engage families who haven't attended recently"
              icon={ArrowPathIcon}
              enabled={settings.win_back_enabled ?? settings.winBackEnabled ?? false}
              onToggle={(val) => handleToggle(settings.win_back_enabled !== undefined ? 'win_back_enabled' : 'winBackEnabled', val)}
              saving={savingField === 'win_back_enabled' || savingField === 'winBackEnabled'}
            >
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <span>After</span>
                <input
                  type="number"
                  min="7"
                  max="90"
                  value={settings.win_back_days_inactive ?? settings.winBackDaysInactive ?? 30}
                  onChange={(e) => handleConfigChange(
                    settings.win_back_days_inactive !== undefined ? 'win_back_days_inactive' : 'winBackDaysInactive',
                    e.target.value
                  )}
                  className="w-16 px-2 py-1 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple text-center"
                />
                <span>days inactive</span>
              </label>
            </AutomationSettingCard>
          </div>
        ) : (
          <div className="text-center py-8 text-neutral-500">
            <Cog6ToothIcon className="h-10 w-10 mx-auto mb-2 text-neutral-300" />
            <p className="text-sm">No automation settings configured yet.</p>
          </div>
        )}
      </div>

      {/* Communication Log */}
      <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">Communication Log</h3>
            <p className="text-sm text-neutral-500 mt-0.5">Recent automated emails for {clubName}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <FunnelIcon className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={typeFilter}
                onChange={handleFilterChange}
                className="appearance-none pl-9 pr-8 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:ring-2 focus:ring-brand-purple focus:border-brand-purple cursor-pointer"
              >
                <option value="">All Types</option>
                {Object.entries(TYPE_DISPLAY_NAMES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchCommunications}
              disabled={logLoading}
              className="p-2 text-neutral-500 hover:text-brand-purple hover:bg-brand-purple/5 rounded-lg transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className={`h-4 w-4 ${logLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {logLoading && communications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-neutral-500">
              <ArrowPathIcon className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading communications...</span>
            </div>
          </div>
        ) : communications.length > 0 ? (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date/Time</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Subject</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-100">
                  {communications.map((comm, idx) => (
                    <tr key={comm.id || idx} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                        {formatDateTime(comm.sent_at || comm.sentAt || comm.created_at || comm.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <TypeBadge type={comm.type || comm.communication_type} />
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-900 font-medium">
                        {comm.student_name || comm.studentName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-600 max-w-[200px] truncate">
                        {comm.email || comm.recipient_email || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-neutral-700 max-w-[250px] truncate">
                        {comm.subject || '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={comm.status || 'sent'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {communications.map((comm, idx) => (
                <div
                  key={comm.id || idx}
                  className="border border-neutral-200 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <TypeBadge type={comm.type || comm.communication_type} />
                    <StatusBadge status={comm.status || 'sent'} />
                  </div>
                  <p className="text-sm font-medium text-neutral-900">
                    {comm.student_name || comm.studentName || '-'}
                  </p>
                  <p className="text-xs text-neutral-500 truncate">
                    {comm.email || comm.recipient_email || '-'}
                  </p>
                  <p className="text-xs text-neutral-700 truncate">
                    {comm.subject || '-'}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {formatDateTime(comm.sent_at || comm.sentAt || comm.created_at || comm.createdAt)}
                  </p>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 mt-4 border-t border-neutral-100">
                <p className="text-sm text-neutral-500">
                  Showing {logPage * PAGE_SIZE + 1}-{Math.min((logPage + 1) * PAGE_SIZE, logTotal)} of {logTotal}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevPage}
                    disabled={logPage === 0}
                    className={`p-2 rounded-lg transition-colors ${
                      logPage === 0
                        ? 'text-neutral-300 cursor-not-allowed'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <ChevronLeftIcon className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-medium text-neutral-700">
                    Page {logPage + 1} of {totalPages}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={logPage >= totalPages - 1}
                    className={`p-2 rounded-lg transition-colors ${
                      logPage >= totalPages - 1
                        ? 'text-neutral-300 cursor-not-allowed'
                        : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <EnvelopeIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">
              {typeFilter ? 'No communications found for this filter.' : 'No communications sent yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
