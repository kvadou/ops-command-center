import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  TrophyIcon,
  SparklesIcon,
  FireIcon,
  StarIcon,
  CheckBadgeIcon,
  ArrowPathIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import FranchiseAcademyLayout from '../../../components/academy/layout/FranchiseAcademyLayout';
import AcademySidebar from '../../../components/academy/layout/AcademySidebar';
import { useToast } from '../../../hooks/useToast';
import ConfirmationModal from '../../../components/ConfirmationModal';

// Available icons for badges
const BADGE_ICONS = [
  { value: 'trophy', label: 'Trophy', icon: TrophyIcon },
  { value: 'star', label: 'Star', icon: StarIcon },
  { value: 'fire', label: 'Fire', icon: FireIcon },
  { value: 'sparkles', label: 'Sparkles', icon: SparklesIcon },
  { value: 'check-badge', label: 'Check Badge', icon: CheckBadgeIcon },
];

// Unlock types
const UNLOCK_TYPES = [
  { value: 'points', label: 'Points Threshold', description: 'Awarded when franchisee reaches a certain number of points' },
  { value: 'streak', label: 'Streak', description: 'Awarded when franchisee maintains a consecutive day streak' },
  { value: 'phase_complete', label: 'Phase Completion', description: 'Awarded when franchisee completes a phase' },
  { value: 'modules_complete', label: 'Modules Completed', description: 'Awarded when franchisee completes X modules' },
  { value: 'manual', label: 'Manual', description: 'Awarded manually by admin' },
];

// Color schemes for badges
const COLOR_SCHEMES = [
  { value: 'yellow', label: 'Gold', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  { value: 'blue', label: 'Blue', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  { value: 'green', label: 'Green', bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { value: 'red', label: 'Red', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  { value: 'pink', label: 'Pink', bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300' },
  { value: 'slate', label: 'Silver', bg: 'bg-neutral-100', text: 'text-neutral-800', border: 'border-neutral-300' },
];

function getIconComponent(iconName) {
  const iconDef = BADGE_ICONS.find(i => i.value === iconName);
  return iconDef?.icon || TrophyIcon;
}

function BadgeCard({ badge, onEdit, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const IconComponent = getIconComponent(badge.icon);
  const colorScheme = badge.color_scheme || COLOR_SCHEMES[0];

  return (
    <div className={`bg-white rounded-lg border border-neutral-200 p-4 ${!badge.is_active ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-4">
        {/* Badge Icon */}
        <div className={`w-14 h-14 rounded-xl ${colorScheme.bg} ${colorScheme.border} border-2 flex items-center justify-center flex-shrink-0`}>
          <IconComponent className={`h-7 w-7 ${colorScheme.text}`} />
        </div>

        {/* Badge Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-neutral-900">{badge.title}</h3>
            {!badge.is_active && (
              <span className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-500 rounded">Inactive</span>
            )}
          </div>
          <p className="text-sm text-neutral-600 mt-1">{badge.description || 'No description'}</p>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <SparklesIcon className="h-3.5 w-3.5" />
              {badge.points_reward} pts
            </span>
            <span className="capitalize">{badge.unlock_type || 'manual'}</span>
            {badge.times_earned > 0 && (
              <span className="text-green-600">Earned {badge.times_earned}x</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <div className="flex flex-col">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30"
              title="Move up"
            >
              <ChevronUpIcon className="h-4 w-4 text-neutral-500" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className="p-1 hover:bg-neutral-100 rounded disabled:opacity-30"
              title="Move down"
            >
              <ChevronDownIcon className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-neutral-100 rounded-lg"
            title="Edit badge"
          >
            <PencilIcon className="h-4 w-4 text-neutral-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-lg"
            title="Delete badge"
          >
            <TrashIcon className="h-4 w-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BadgeEditorModal({ badge, onSave, onClose, saving }) {
  const isEdit = !!badge?.id;
  const [formData, setFormData] = useState({
    badge_key: badge?.badge_key || '',
    title: badge?.title || '',
    description: badge?.description || '',
    icon: badge?.icon || 'trophy',
    color_scheme: badge?.color_scheme || COLOR_SCHEMES[0],
    unlock_type: badge?.unlock_type || 'manual',
    unlock_condition: badge?.unlock_condition || {},
    points_reward: badge?.points_reward || 0,
    is_active: badge?.is_active !== false,
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Auto-generate badge_key from title
    if (field === 'title' && !isEdit) {
      const key = value.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');
      setFormData(prev => ({ ...prev, badge_key: key }));
    }
  };

  const handleColorChange = (colorKey) => {
    const scheme = COLOR_SCHEMES.find(c => c.value === colorKey);
    if (scheme) {
      setFormData(prev => ({
        ...prev,
        color_scheme: { bg: scheme.bg, text: scheme.text, border: scheme.border }
      }));
    }
  };

  const handleConditionChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      unlock_condition: { ...prev.unlock_condition, [key]: value }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const currentColorKey = COLOR_SCHEMES.find(
    c => c.bg === formData.color_scheme?.bg
  )?.value || 'yellow';

  const IconComponent = getIconComponent(formData.icon);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-neutral-900">
            {isEdit ? 'Edit Badge' : 'Create Badge'}
          </h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 text-2xl">&times;</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Preview */}
          <div className="flex items-center gap-4 p-4 bg-neutral-50 rounded-lg">
            <div className={`w-16 h-16 rounded-xl ${formData.color_scheme.bg} ${formData.color_scheme.border} border-2 flex items-center justify-center`}>
              <IconComponent className={`h-8 w-8 ${formData.color_scheme.text}`} />
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{formData.title || 'Badge Name'}</p>
              <p className="text-sm text-neutral-600">{formData.description || 'Badge description'}</p>
            </div>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                placeholder="e.g., Point Prodigy"
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Key *</label>
              <input
                type="text"
                value={formData.badge_key}
                onChange={(e) => handleChange('badge_key', e.target.value)}
                required
                placeholder="point_prodigy"
                className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30 font-mono text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={2}
              placeholder="Describe what this badge represents..."
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30 resize-none"
            />
          </div>

          {/* Appearance */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Icon</label>
              <div className="flex flex-wrap gap-2">
                {BADGE_ICONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleChange('icon', value)}
                    className={`p-2 rounded-lg border-2 transition-colors ${
                      formData.icon === value
                        ? 'border-brand-purple bg-brand-purple/5'
                        : 'border-neutral-200 hover:border-neutral-300'
                    }`}
                    title={label}
                  >
                    <Icon className="h-5 w-5 text-neutral-600" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_SCHEMES.map(({ value, label, bg }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleColorChange(value)}
                    className={`w-8 h-8 rounded-full ${bg} border-2 transition-all ${
                      currentColorKey === value
                        ? 'ring-2 ring-brand-purple ring-offset-2'
                        : 'border-white hover:scale-110'
                    }`}
                    title={label}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Unlock Conditions */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Unlock Type</label>
            <select
              value={formData.unlock_type}
              onChange={(e) => handleChange('unlock_type', e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30 bg-white"
            >
              {UNLOCK_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              {UNLOCK_TYPES.find(t => t.value === formData.unlock_type)?.description}
            </p>
          </div>

          {/* Unlock Condition Details */}
          {formData.unlock_type === 'points' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Points Threshold</label>
              <input
                type="number"
                value={formData.unlock_condition.threshold || ''}
                onChange={(e) => handleConditionChange('threshold', parseInt(e.target.value))}
                placeholder="e.g., 100"
                className="w-32 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>
          )}

          {formData.unlock_type === 'streak' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Streak Days</label>
              <input
                type="number"
                value={formData.unlock_condition.days || ''}
                onChange={(e) => handleConditionChange('days', parseInt(e.target.value))}
                placeholder="e.g., 7"
                className="w-32 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>
          )}

          {formData.unlock_type === 'modules_complete' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Modules Required</label>
              <input
                type="number"
                value={formData.unlock_condition.count || ''}
                onChange={(e) => handleConditionChange('count', parseInt(e.target.value))}
                placeholder="e.g., 10"
                className="w-32 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>
          )}

          {formData.unlock_type === 'phase_complete' && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Phase Number</label>
              <input
                type="number"
                value={formData.unlock_condition.phase || ''}
                onChange={(e) => handleConditionChange('phase', parseInt(e.target.value))}
                placeholder="e.g., 1"
                className="w-32 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              />
            </div>
          )}

          {/* Points Reward */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Points Reward</label>
            <input
              type="number"
              value={formData.points_reward}
              onChange={(e) => handleChange('points_reward', parseInt(e.target.value) || 0)}
              min={0}
              className="w-32 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            />
            <p className="text-xs text-neutral-500 mt-1">Points awarded when badge is earned</p>
          </div>

          {/* Active Status */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => handleChange('is_active', e.target.checked)}
              className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
            />
            <span className="text-sm text-neutral-700">Active (visible and can be earned)</span>
          </label>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-neutral-200 bg-neutral-50 sticky bottom-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-neutral-700 hover:bg-neutral-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.title || !formData.badge_key}
            className="px-4 py-2 bg-brand-purple text-white font-medium rounded-lg hover:bg-brand-purple/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Badge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BadgesAdminPage() {
  const toast = useToast();
  const [badges, setBadges] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBadge, setEditingBadge] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/admin/badges');
      if (res.ok) {
        const data = await res.json();
        setBadges(data);
      }
    } catch (error) {
      console.error('Error fetching badges:', error);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/admin/badges/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchBadges(), fetchStats()]);
      setLoading(false);
    };
    loadData();
  }, [fetchBadges, fetchStats]);

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      const url = editingBadge?.id
        ? `/api/academy/admin/badges/${editingBadge.id}`
        : '/api/academy/admin/badges';
      const method = editingBadge?.id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchBadges();
        setShowModal(false);
        setEditingBadge(null);
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to save badge');
      }
    } catch (error) {
      console.error('Error saving badge:', error);
      toast.error('Failed to save badge');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (badge) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Badge',
      message: `Delete "${badge.title}"?${badge.times_earned > 0 ? ' This badge has been earned - it will be deactivated instead.' : ''}`,
      action: async () => {
        try {
          const res = await fetch(`/api/academy/admin/badges/${badge.id}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            await fetchBadges();
          }
        } catch (error) {
          console.error('Error deleting badge:', error);
        }
      },
    });
  };

  const handleReorder = async (index, direction) => {
    const newBadges = [...badges];
    const [removed] = newBadges.splice(index, 1);
    newBadges.splice(index + direction, 0, removed);
    setBadges(newBadges);

    try {
      await fetch('/api/academy/admin/badges/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newBadges.map(b => b.id) }),
      });
    } catch (error) {
      console.error('Error reordering badges:', error);
      await fetchBadges(); // Revert on error
    }
  };

  const sidebar = <AcademySidebar isMainBranch={true} />;

  return (
    <FranchiseAcademyLayout sidebar={sidebar}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Badge Management</h1>
            <p className="text-neutral-600 mt-1">Create and manage achievement badges for franchisees</p>
          </div>
          <button
            onClick={() => { setEditingBadge(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-purple text-white font-medium rounded-lg hover:bg-brand-purple/90 transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Create Badge
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <ArrowPathIcon className="h-8 w-8 text-neutral-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <TrophyIcon className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-neutral-900">{stats.total_badges}</p>
                      <p className="text-sm text-neutral-600">Active Badges</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckBadgeIcon className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-neutral-900">{stats.total_earned}</p>
                      <p className="text-sm text-neutral-600">Total Earned</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <SparklesIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-neutral-900">{stats.franchisees_with_badges}</p>
                      <p className="text-sm text-neutral-600">Franchisees with Badges</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Badges List */}
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
                <h2 className="font-semibold text-neutral-900">All Badges ({badges.length})</h2>
              </div>
              <div className="divide-y divide-neutral-100">
                {badges.length === 0 ? (
                  <div className="p-8 text-center text-neutral-500">
                    <TrophyIcon className="h-12 w-12 mx-auto mb-3 text-neutral-300" />
                    <p>No badges created yet</p>
                    <button
                      onClick={() => { setEditingBadge(null); setShowModal(true); }}
                      className="mt-4 text-brand-purple hover:underline"
                    >
                      Create your first badge
                    </button>
                  </div>
                ) : (
                  badges.map((badge, index) => (
                    <div key={badge.id} className="p-4">
                      <BadgeCard
                        badge={badge}
                        onEdit={() => { setEditingBadge(badge); setShowModal(true); }}
                        onDelete={() => handleDelete(badge)}
                        onMoveUp={() => handleReorder(index, -1)}
                        onMoveDown={() => handleReorder(index, 1)}
                        isFirst={index === 0}
                        isLast={index === badges.length - 1}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            {stats?.recent_earned?.length > 0 && (
              <div className="mt-6 bg-white rounded-xl border border-neutral-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50">
                  <h2 className="font-semibold text-neutral-900">Recent Badge Activity</h2>
                </div>
                <div className="divide-y divide-neutral-100">
                  {stats.recent_earned.map((earned, index) => (
                    <div key={index} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                        <TrophyIcon className="h-4 w-4 text-yellow-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium text-neutral-900">{earned.franchise_id}</span>
                          {' '}earned{' '}
                          <span className="font-medium text-neutral-900">{earned.title}</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(earned.earned_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Badge Editor Modal */}
        {showModal && (
          <BadgeEditorModal
            badge={editingBadge}
            onSave={handleSave}
            onClose={() => { setShowModal(false); setEditingBadge(null); }}
            saving={saving}
          />
        )}
      </div>
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={async () => {
          if (confirmState.action) await confirmState.action();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        isDestructive
      />
    </FranchiseAcademyLayout>
  );
}
