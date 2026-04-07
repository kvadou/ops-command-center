import React, { useState } from 'react';
import { PencilSquareIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

const LANGUAGE_OPTIONS = [
  'English', 'Spanish', 'French', 'Mandarin', 'Cantonese',
  'Japanese', 'Korean', 'German', 'Italian', 'Portuguese',
  'Russian', 'Arabic', 'Hindi', 'Other'
];

const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'child', label: 'Child' },
  { value: 'friend', label: 'Friend' },
  { value: 'other', label: 'Other' },
];

const inputClass = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-purple/20 focus:border-brand-purple outline-none';
const labelClass = 'text-sm font-medium text-neutral-500 mb-1';

function buildInitialFormData(tutor) {
  return {
    profileTitle: tutor.profile_title || '',
    profileBio: tutor.profile_bio || '',
    profileHeadshotUrl: tutor.profile_headshot_url || '',
    profileTeachingStyle: tutor.profile_teaching_style || '',
    profileYearsExperience: tutor.profile_years_experience || '',
    profileLanguages: tutor.profile_languages || [],
    profilePreviousExperience: tutor.profile_previous_experience || '',
    profileAvailabilityNotes: tutor.profile_availability_notes || '',
    emergencyContactName: tutor.emergency_contact_name || '',
    emergencyContactPhone: tutor.emergency_contact_phone || '',
    emergencyContactRelation: tutor.emergency_contact_relation || '',
  };
}

export default function TutorPublicProfileCard({ tutor, onProfileUpdate }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileVisible, setProfileVisible] = useState(!!tutor.profile_visible);
  const [formData, setFormData] = useState(() => buildInitialFormData(tutor));

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleLanguage = (lang) => {
    setFormData(prev => {
      const langs = prev.profileLanguages || [];
      return {
        ...prev,
        profileLanguages: langs.includes(lang)
          ? langs.filter(l => l !== lang)
          : [...langs, lang],
      };
    });
  };

  const handleToggleVisibility = async () => {
    const newValue = !profileVisible;
    setProfileVisible(newValue);
    try {
      const res = await fetch(`/api/contractors/${tutor.contractor_id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileVisible: newValue }),
      });
      if (!res.ok) throw new Error('Failed to update visibility');
      const data = await res.json();
      toast.success(newValue ? 'Profile visible' : 'Profile hidden');
      if (onProfileUpdate) onProfileUpdate(data.profile);
    } catch (err) {
      setProfileVisible(!newValue);
      toast.error('Failed to update visibility');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/contractors/${tutor.contractor_id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, profileVisible }),
      });
      if (!res.ok) throw new Error('Failed to save profile');
      const data = await res.json();
      toast.success('Profile saved');
      setEditing(false);
      if (onProfileUpdate) onProfileUpdate(data.profile);
    } catch (err) {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData(buildInitialFormData(tutor));
    setEditing(false);
  };

  const renderValue = (val) => {
    if (val === null || val === undefined || val === '') {
      return <span className="text-neutral-400">—</span>;
    }
    return <span className="text-neutral-900">{val}</span>;
  };

  const headshotUrl = editing ? formData.profileHeadshotUrl : (tutor.profile_headshot_url || '');

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-neutral-900">Public Profile</h3>
          <a
            href={`https://acme-workforce-f4064215d92d.herokuapp.com/admin/tutors/by-tc/${tutor.contractor_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-cyan hover:text-brand-navy transition-colors"
            title="View in Tutor Portal"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            STT
          </a>
        </div>
        <div className="flex items-center gap-3">
          {/* Visibility toggle */}
          <button
            onClick={handleToggleVisibility}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              profileVisible
                ? 'bg-brand-green/10 text-brand-green'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {profileVisible ? 'Visible' : 'Hidden'}
          </button>

          {/* Edit / Save / Cancel */}
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-purple hover:bg-brand-purple/5 rounded-lg transition-colors"
            >
              <PencilSquareIcon className="h-4 w-4" />
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-sm font-medium text-white bg-brand-purple hover:bg-brand-purple/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className={labelClass}>Title</label>
          {editing ? (
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. Tutor & Martial Artist"
              value={formData.profileTitle}
              onChange={e => handleChange('profileTitle', e.target.value)}
            />
          ) : (
            <div className="text-sm">{renderValue(tutor.profile_title)}</div>
          )}
        </div>

        {/* Bio */}
        <div>
          <label className={labelClass}>Bio</label>
          {editing ? (
            <textarea
              rows={4}
              className={inputClass}
              value={formData.profileBio}
              onChange={e => handleChange('profileBio', e.target.value)}
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{renderValue(tutor.profile_bio)}</div>
          )}
        </div>

        {/* Headshot URL */}
        <div>
          <label className={labelClass}>Headshot URL</label>
          <div className="flex items-start gap-3">
            {editing ? (
              <div className="flex-1">
                <input
                  type="text"
                  className={inputClass}
                  placeholder="https://..."
                  value={formData.profileHeadshotUrl}
                  onChange={e => handleChange('profileHeadshotUrl', e.target.value)}
                />
              </div>
            ) : (
              <div className="text-sm flex-1 truncate">{renderValue(tutor.profile_headshot_url)}</div>
            )}
            {headshotUrl && (
              <img
                src={headshotUrl}
                alt="Headshot"
                className="h-12 w-12 rounded-lg object-cover border border-neutral-200 flex-shrink-0"
              />
            )}
          </div>
        </div>

        {/* Teaching Style */}
        <div>
          <label className={labelClass}>Teaching Style</label>
          {editing ? (
            <textarea
              rows={3}
              className={inputClass}
              value={formData.profileTeachingStyle}
              onChange={e => handleChange('profileTeachingStyle', e.target.value)}
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{renderValue(tutor.profile_teaching_style)}</div>
          )}
        </div>

        {/* Years of Experience */}
        <div>
          <label className={labelClass}>Years of Experience</label>
          {editing ? (
            <input
              type="number"
              className={inputClass + ' max-w-[120px]'}
              value={formData.profileYearsExperience}
              onChange={e => handleChange('profileYearsExperience', e.target.value)}
            />
          ) : (
            <div className="text-sm">{renderValue(tutor.profile_years_experience)}</div>
          )}
        </div>

        {/* Languages */}
        <div>
          <label className={labelClass}>Languages</label>
          {editing ? (
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map(lang => {
                const selected = (formData.profileLanguages || []).includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLanguage(lang)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-brand-purple text-white'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(tutor.profile_languages || []).length > 0
                ? tutor.profile_languages.map(lang => (
                    <span key={lang} className="px-2.5 py-1 rounded-full text-xs font-medium bg-brand-purple/10 text-brand-purple">
                      {lang}
                    </span>
                  ))
                : <span className="text-sm text-neutral-400">—</span>
              }
            </div>
          )}
        </div>

        {/* Previous Experience */}
        <div>
          <label className={labelClass}>Previous Experience</label>
          {editing ? (
            <textarea
              rows={3}
              className={inputClass}
              value={formData.profilePreviousExperience}
              onChange={e => handleChange('profilePreviousExperience', e.target.value)}
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{renderValue(tutor.profile_previous_experience)}</div>
          )}
        </div>

        {/* Availability Notes */}
        <div>
          <label className={labelClass}>Availability Notes</label>
          {editing ? (
            <textarea
              rows={2}
              className={inputClass}
              value={formData.profileAvailabilityNotes}
              onChange={e => handleChange('profileAvailabilityNotes', e.target.value)}
            />
          ) : (
            <div className="text-sm whitespace-pre-wrap">{renderValue(tutor.profile_availability_notes)}</div>
          )}
        </div>

        {/* Emergency Contact */}
        <div className="pt-4 border-t border-neutral-200">
          <h4 className="text-sm font-semibold text-neutral-700 mb-3">Emergency Contact</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Name</label>
              {editing ? (
                <input
                  type="text"
                  className={inputClass}
                  value={formData.emergencyContactName}
                  onChange={e => handleChange('emergencyContactName', e.target.value)}
                />
              ) : (
                <div className="text-sm">{renderValue(tutor.emergency_contact_name)}</div>
              )}
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              {editing ? (
                <input
                  type="text"
                  className={inputClass}
                  value={formData.emergencyContactPhone}
                  onChange={e => handleChange('emergencyContactPhone', e.target.value)}
                />
              ) : (
                <div className="text-sm">{renderValue(tutor.emergency_contact_phone)}</div>
              )}
            </div>
            <div>
              <label className={labelClass}>Relationship</label>
              {editing ? (
                <select
                  className={inputClass}
                  value={formData.emergencyContactRelation}
                  onChange={e => handleChange('emergencyContactRelation', e.target.value)}
                >
                  {RELATIONSHIP_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm capitalize">{renderValue(tutor.emergency_contact_relation)}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Webflow Sync Status */}
      <div className="mt-6 pt-4 border-t border-neutral-200 flex items-center gap-2 text-xs text-neutral-500">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            tutor.webflow_item_id ? 'bg-brand-green' : 'bg-neutral-300'
          }`}
        />
        {tutor.webflow_item_id ? (
          <span>
            Published to Webflow
            {tutor.profile_synced_at && (
              <span className="ml-1 text-neutral-400">
                · {new Date(tutor.profile_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
          </span>
        ) : (
          <span>Not published</span>
        )}
        {tutor.slug && profileVisible && (
          <span className="ml-auto">
            <a
              href={`https://www.acmeops.com/tutorprofiles/${tutor.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-purple hover:text-brand-navy transition-colors"
            >
              View public page →
            </a>
          </span>
        )}
      </div>
    </div>
  );
}
