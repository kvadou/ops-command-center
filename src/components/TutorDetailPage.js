import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EntityDetailPage, { ContactInfo, RelatedEntitiesList } from './EntityDetailPage';
import NotFound from './NotFound';
import TutorCalendar from './TutorCalendar';
import { safeRender } from '../utils/safeRender';

import { RoleProvider } from '../contexts/RoleContext';
import { BranchProvider } from '../contexts/BranchContext';
import { useCompanyName } from '../contexts/CompanyNameContext';
import AdHocChargeModal from './AdHocChargeModal';
import TutorActivityTab from './TutorActivityTab';
import TutorPublicProfileCard from './TutorPublicProfileCard';
import { Badge } from './ui';
import {
  ChartBarIcon,
  EnvelopeIcon,
  StarIcon,
  CurrencyDollarIcon,
  AcademicCapIcon,
  DocumentTextIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  CalendarIcon,
  PlusIcon,
  BriefcaseIcon,
  GiftIcon,
  CalendarDaysIcon,
  TagIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Format review duration from hours to readable format
function formatReviewDuration(hours) {
  if (!hours) return '';
  const totalHours = Math.floor(hours);
  const minutes = Math.round((hours - totalHours) * 60);
  
  if (totalHours > 0 && minutes > 0) {
    return `${totalHours}h ${minutes}m`;
  } else if (totalHours > 0) {
    return `${totalHours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return '';
}

// Extract review text from extra_attrs_value, handling both plain text and JSON formats
function extractReviewText(extraAttrsValue) {
  if (!extraAttrsValue) return '';
  
  // If it's already a string (plain text), return it
  if (typeof extraAttrsValue === 'string') {
    // Check if it's a JSON string
    try {
      const parsed = JSON.parse(extraAttrsValue);
      // If parsing succeeded, it's JSON - extract the review text
      if (Array.isArray(parsed)) {
        const reviewDetails = parsed.find(attr => attr.machine_name === 'review_details');
        return reviewDetails?.value || '';
      }
      return '';
    } catch (e) {
      // Not JSON, return as-is
      return extraAttrsValue;
    }
  }
  
  // If it's an object/array, extract the review text
  if (Array.isArray(extraAttrsValue)) {
    const reviewDetails = extraAttrsValue.find(attr => attr.machine_name === 'review_details');
    return reviewDetails?.value || '';
  }
  
  // Fallback: convert to string
  return String(extraAttrsValue);
}

export default function TutorDetailPage() {
  const { id } = useParams();
  const { companyName, isMainBranch } = useCompanyName();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [localImageUrl, setLocalImageUrl] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [referralStats, setReferralStats] = useState(null);
  const [referralsLoading, setReferralsLoading] = useState(false);
  const [cancellationData, setCancellationData] = useState(null);
  const [loadingCancellations, setLoadingCancellations] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioEditValue, setBioEditValue] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);
  const [isEditingEmergency, setIsEditingEmergency] = useState(false);
  const [emergencyEditData, setEmergencyEditData] = useState({});
  const [isSavingEmergency, setIsSavingEmergency] = useState(false);
  const [webflowPreview, setWebflowPreview] = useState(null);
  const [loadingWebflow, setLoadingWebflow] = useState(false);
  const [syncingWebflow, setSyncingWebflow] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  useEffect(() => {
    fetch(`/api/entity-details/tutors/${id}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) {
            setError('not-found');
          } else {
            throw new Error('Failed to fetch tutor details');
          }
          return null;
        }
        return res.json();
      })
      .then(data => {
        if (data) {
          setData(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // Update localImageUrl when tutor data loads
  useEffect(() => {
    if (data?.tutor?.local_image_url) {
      setLocalImageUrl(data.tutor.local_image_url);
    }
  }, [data]);

  // Fetch referrals when tab is active
  useEffect(() => {
    if (activeTab !== 'referrals' || !data?.tutor?.contractor_id) return;
    setReferralsLoading(true);
    Promise.all([
      fetch(`/api/referrals?contractor_id=${data.tutor.contractor_id}`).then(r => r.ok ? r.json() : { referrals: [] }),
      fetch(`/api/referrals/stats/${data.tutor.contractor_id}`).then(r => r.ok ? r.json() : null)
    ])
      .then(([refData, statsData]) => {
        setReferrals(refData.referrals || refData || []);
        setReferralStats(statsData);
      })
      .catch(err => console.error('Error fetching referrals:', err))
      .finally(() => setReferralsLoading(false));
  }, [activeTab, data?.tutor?.contractor_id]);

  // Fetch Webflow preview when tab is active
  useEffect(() => {
    if (activeTab !== 'website' || !data?.tutor?.contractor_id || webflowPreview || loadingWebflow) return;
    setLoadingWebflow(true);
    fetch(`/api/webflow-sync/tutors/${data.tutor.contractor_id}/preview`)
      .then(r => r.ok ? r.json() : null)
      .then(result => setWebflowPreview(result))
      .catch(err => console.error('Error fetching Webflow preview:', err))
      .finally(() => setLoadingWebflow(false));
  }, [activeTab, data?.tutor?.contractor_id, webflowPreview, loadingWebflow]);

  // Fetch cancellations when tab is active
  useEffect(() => {
    if (activeTab !== 'cancellations' || !data?.tutor?.contractor_id || cancellationData || loadingCancellations) return;
    setLoadingCancellations(true);
    fetch(`/api/entity-details/tutors/${data.tutor.contractor_id}/cancellations`)
      .then(r => r.ok ? r.json() : { cancellations: [], summary: {} })
      .then(result => setCancellationData(result))
      .catch(err => {
        console.error('Error fetching cancellations:', err);
        setCancellationData({ cancellations: [], summary: {} });
      })
      .finally(() => setLoadingCancellations(false));
  }, [activeTab, data?.tutor?.contractor_id, cancellationData, loadingCancellations]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading tutor details...</p>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return <NotFound entityType="Tutor" entityId={id} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#AE255B]">Error: {error}</p>
        </div>
      </div>
    );
  }

  const { tutor, relatedLessons, relatedServices, paymentOrders, paymentOrderCharges, adhocCharges, tutorNotes, reviews, tutorCruncherUrl } = data;
  
  // Defensive: Ensure tutor object doesn't have any object values that could be rendered
  // This is a safety check - all rendering should use safeString/safeRender
  if (!tutor) {
    return <NotFound entityType="Tutor" entityId={id} />;
  }

  const getStatusColor = (status) => {
    const statusStr = safeString(status);
    switch (statusStr?.toLowerCase()) {
      case 'approved':
      case 'active':
        return 'green';
      case 'pending':
        return 'yellow';
      case 'inactive':
      case 'dormant':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const getStatusBadgeVariant = (status) => {
    const statusLower = safeString(status)?.toLowerCase() || '';
    if (statusLower.includes('active') || statusLower.includes('in-progress') || statusLower.includes('approved')) {
      return 'in-progress';
    } else if (statusLower.includes('planned') || statusLower.includes('pending')) {
      return 'planned';
    } else if (statusLower.includes('completed') || statusLower.includes('done') || statusLower === 'complete') {
      return 'complete';
    } else if (statusLower.includes('cancelled') || statusLower.includes('error') || statusLower.includes('rejected')) {
      return 'cancelled';
    }
    return 'editable';
  };

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'activity', name: 'Activity', icon: ChartBarIcon },
    { id: 'calendar', name: 'Calendar', icon: CalendarIcon },
    { id: 'communications', name: 'Communications', icon: EnvelopeIcon },
    { id: 'reviews', name: 'Reviews', icon: StarIcon },
    { id: 'accounting', name: 'Accounting', icon: CurrencyDollarIcon },
    { id: 'referrals', name: 'Referrals', icon: GiftIcon },
    { id: 'cancellations', name: 'Cancellations', icon: CalendarDaysIcon },
    { id: 'website', name: 'Website', icon: GlobeAltIcon }
  ];

  // Helper to safely convert any value to string (using safeRender from utils)
  const safeString = (value) => {
    const rendered = safeRender(value);
    return rendered === null ? '' : String(rendered);
  };

  const firstNameStr = safeString(tutor.first_name);
  const lastNameStr = safeString(tutor.last_name);
  const initials = firstNameStr && lastNameStr
    ? `${firstNameStr[0]}${lastNameStr[0]}`.toUpperCase()
    : '?';

  const address = [
    safeString(tutor.street),
    safeString(tutor.town),
    safeString(tutor.state),
    safeString(tutor.postcode),
    safeString(tutor.country)
  ]
    .filter(Boolean)
    .map(addr => safeString(addr)) // Double-check each part is a string
    .join(', ');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const handleSaveBio = async () => {
    setIsSavingBio(true);
    try {
      const res = await fetch(`/api/contractors/${id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ profileBio: bioEditValue }),
      });
      if (res.ok) {
        setData(prev => ({ ...prev, tutor: { ...prev.tutor, profile_bio: bioEditValue } }));
        setIsEditingBio(false);
      }
    } catch (err) {
      console.error('Failed to save bio:', err);
    } finally {
      setIsSavingBio(false);
    }
  };

  const handleSaveEmergency = async () => {
    setIsSavingEmergency(true);
    try {
      const res = await fetch(`/api/contractors/${id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          emergencyContactName: emergencyEditData.name,
          emergencyContactPhone: emergencyEditData.phone,
          emergencyContactRelation: emergencyEditData.relation,
        }),
      });
      if (res.ok) {
        setData(prev => ({
          ...prev,
          tutor: {
            ...prev.tutor,
            emergency_contact_name: emergencyEditData.name,
            emergency_contact_phone: emergencyEditData.phone,
            emergency_contact_relation: emergencyEditData.relation,
          },
        }));
        setIsEditingEmergency(false);
      }
    } catch (err) {
      console.error('Failed to save emergency contacts:', err);
    } finally {
      setIsSavingEmergency(false);
    }
  };

  return (
    <RoleProvider>
      <BranchProvider>
          <EntityDetailPage
            title={`Tutor: ${safeString(tutor.first_name)} ${safeString(tutor.last_name)}`}
            status={safeString(tutor.status) || 'Unknown'}
            statusColor={getStatusColor(safeString(tutor.status))}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tutorCruncherUrl={tutorCruncherUrl}
            extraLinks={[
              { url: `https://acme-workforce-f4064215d92d.herokuapp.com/admin/tutors/by-tc/${id}`, label: 'View in STT' }
            ]}
            backToListUrl="/people/tutors"
      backToListLabel="Tutors"
    >
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Contact */}
            <ContactInfo
              email={safeString(tutor.email)}
              phone={safeString(tutor.phone)}
              mobile={safeString(tutor.mobile)}
              address={safeString(address)}
              photo={safeString(tutor.photo)}
              localImageUrl={localImageUrl}
              contractorId={tutor.contractor_id}
              onImageUpdate={setLocalImageUrl}
            />

            {/* Public Profile Editor */}
            <TutorPublicProfileCard
              tutor={tutor}
              onProfileUpdate={(updatedProfile) => {
                setData(prev => ({ ...prev, tutor: { ...prev.tutor, ...updatedProfile } }));
              }}
            />

            {/* Bio */}
            {(() => {
              const bioValue = tutor.profile_bio || (() => {
                if (!tutor.extra_attrs) return null;
                if (Array.isArray(tutor.extra_attrs)) {
                  const bioAttr = tutor.extra_attrs.find(attr =>
                    attr.machine_name === 'contractor_bio' || attr.name === 'Bio'
                  );
                  return bioAttr?.value || null;
                }
                if (typeof tutor.extra_attrs === 'object') {
                  return tutor.extra_attrs.contractor_bio || tutor.extra_attrs.bio || null;
                }
                return null;
              })();

              return (bioValue || isEditingBio) ? (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-neutral-900">Bio</h3>
                    {!isEditingBio && (
                      <button
                        onClick={() => { setIsEditingBio(true); setBioEditValue(bioValue || ''); }}
                        className="text-sm text-brand-purple hover:text-brand-navy font-medium transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {isEditingBio ? (
                    <div>
                      <textarea
                        value={bioEditValue}
                        onChange={e => setBioEditValue(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm resize-y mb-3 focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                        placeholder="Write a bio..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveBio}
                          disabled={isSavingBio}
                          className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy transition-colors disabled:opacity-50"
                        >
                          {isSavingBio ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setIsEditingBio(false)}
                          className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm whitespace-pre-wrap text-neutral-700 leading-relaxed">
                      {safeString(bioValue).replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n')}
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Emergency Contact */}
            {(() => {
              const hasContact = tutor.emergency_contact_name || tutor.emergency_contact_phone || tutor.emergency_contact_relation;
              return (hasContact || isEditingEmergency) ? (
                <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-neutral-900">Emergency Contact</h3>
                    {!isEditingEmergency && (
                      <button
                        onClick={() => {
                          setIsEditingEmergency(true);
                          setEmergencyEditData({
                            name: tutor.emergency_contact_name || '',
                            phone: tutor.emergency_contact_phone || '',
                            relation: tutor.emergency_contact_relation || '',
                          });
                        }}
                        className="text-sm text-brand-purple hover:text-brand-navy font-medium transition-colors"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {isEditingEmergency ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Name</label>
                        <input
                          type="text"
                          value={emergencyEditData.name || ''}
                          onChange={e => setEmergencyEditData(prev => ({ ...prev, name: e.target.value }))}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                          placeholder="Contact name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Phone</label>
                        <input
                          type="tel"
                          value={emergencyEditData.phone || ''}
                          onChange={e => setEmergencyEditData(prev => ({ ...prev, phone: e.target.value }))}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                          placeholder="Phone number"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 mb-1">Relationship</label>
                        <input
                          type="text"
                          value={emergencyEditData.relation || ''}
                          onChange={e => setEmergencyEditData(prev => ({ ...prev, relation: e.target.value }))}
                          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-purple/30 focus:border-brand-purple"
                          placeholder="e.g. Spouse, Parent, Sibling"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={handleSaveEmergency}
                          disabled={isSavingEmergency}
                          className="px-4 py-2 bg-brand-purple text-white rounded-lg text-sm font-medium hover:bg-brand-navy transition-colors disabled:opacity-50"
                        >
                          {isSavingEmergency ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setIsEditingEmergency(false)}
                          className="px-4 py-2 bg-neutral-100 text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-200 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-500 w-20">Name</span>
                        <span className="text-sm text-neutral-700">{safeString(tutor.emergency_contact_name) || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-500 w-20">Phone</span>
                        <span className="text-sm text-neutral-700">{safeString(tutor.emergency_contact_phone) || '—'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-500 w-20">Relation</span>
                        <span className="text-sm text-neutral-700 capitalize">{safeString(tutor.emergency_contact_relation) || '—'}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Teaching Skills */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
                  Teaching Skills
                  <span className="ml-2 text-[#34B256] cursor-help" title="Skills and subjects the tutor teaches">
                    ?
                  </span>
                </h3>
              </div>
              {tutor.skills && Array.isArray(tutor.skills) && tutor.skills.length > 0 ? (
                <div className="space-y-2">
                  {tutor.skills.map((skill, idx) => {
                    const skillName = safeString(skill?.subject || skill?.name || skill);
                    const skillLevel = skill?.level ? safeString(skill.level) : null;
                    return (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-neutral-700">{skillName}</span>
                        {skillLevel && (
                          <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full">
                            {skillLevel}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-neutral-500">No teaching skills listed</p>
              )}
            </div>

            {/* Qualifications */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
                  Qualifications
                  <span className="ml-2 text-[#34B256] cursor-help" title="Tutor qualifications and certifications">
                    ?
                  </span>
                </h3>
              </div>
              {tutor.qualifications && Array.isArray(tutor.qualifications) && tutor.qualifications.length > 0 ? (
                <div className="space-y-2">
                  {tutor.qualifications.map((qual, idx) => {
                    const qualName = safeString(qual?.name || qual);
                    const qualLevel = qual?.level ? safeString(qual.level) : '';
                    const qualText = qualLevel ? `${qualName} • ${qualLevel}` : qualName;
                    return (
                      <div key={idx} className="text-neutral-700">
                        {qualText}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-neutral-500">No qualifications listed</p>
              )}
            </div>

            {/* Uploaded Documents */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
                  Uploaded Documents
                  <span className="ml-2 text-[#34B256] cursor-help" title="Documents uploaded for this tutor">
                    ?
                  </span>
                </h3>
              </div>
              <p className="text-neutral-500">No Uploaded Documents</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Profile Details */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Profile</h3>
                {tutor.status && (
                  <Badge variant={getStatusBadgeVariant(safeString(tutor.status))}>
                    {safeString(tutor.status)}
                  </Badge>
                )}
              </div>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-neutral-500">ID</dt>
                  <dd className="mt-1 text-sm text-neutral-900">{safeString(tutor.contractor_id)}</dd>
                </div>
                {tutor.date_created && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Date Created</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      {new Date(tutor.date_created).toLocaleDateString()}
                    </dd>
                  </div>
                )}
                {tutor.updated_at && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Last Active</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      {new Date(tutor.updated_at).toLocaleString()}
                    </dd>
                  </div>
                )}
                {tutor.default_rate && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Default Rate</dt>
                    <dd className="mt-1 text-sm text-neutral-900 tabular-nums">${parseFloat(safeString(tutor.default_rate)).toFixed(2)}</dd>
                  </div>
                )}
                {tutor.review_rating && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Review Rating</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      {parseFloat(safeString(tutor.review_rating)).toFixed(1)} / 5.0
                    </dd>
                  </div>
                )}
                {tutor.calendar_colour && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Calendar Color</dt>
                    <dd className="mt-1 flex items-center">
                      <div 
                        className="w-6 h-6 rounded mr-2 border border-neutral-300" 
                        style={{ backgroundColor: safeString(tutor.calendar_colour) }}
                      />
                      <span className="text-sm text-neutral-900">{safeString(tutor.calendar_colour)}</span>
                    </dd>
                  </div>
                )}
                {tutor.timezone && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Timezone</dt>
                    <dd className="mt-1 text-sm text-neutral-900">{safeString(tutor.timezone)}</dd>
                  </div>
                )}
                {tutor.received_notifications && Array.isArray(tutor.received_notifications) && tutor.received_notifications.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Notification Preferences</dt>
                    <dd className="mt-1">
                      <div className="flex flex-wrap gap-1">
                        {tutor.received_notifications.map((notif, idx) => (
                          <span key={idx} className="inline-block px-2 py-1 text-xs bg-[#E8FBFF] text-[#3BA8BD] rounded">
                            {safeString(notif)}
                          </span>
                        ))}
                      </div>
                    </dd>
                  </div>
                )}
                {tutor.labels && Array.isArray(tutor.labels) && tutor.labels.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Labels</dt>
                    <dd className="mt-1">
                      <div className="flex flex-wrap gap-1">
                        {tutor.labels.map((label, idx) => {
                          const labelName = typeof label === 'object' ? (label.name || label.machine_name || label.id) : label;
                          const labelColor = typeof label === 'object' ? (label.color || '#d3d3d3') : '#d3d3d3';
                          
                          // Convert hex color to RGB for background with opacity
                          const hexToRgb = (hex) => {
                            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                            return result ? {
                              r: parseInt(result[1], 16),
                              g: parseInt(result[2], 16),
                              b: parseInt(result[3], 16)
                            } : null;
                          };
                          
                          const rgb = hexToRgb(labelColor);
                          const bgColor = rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)` : 'rgba(211, 211, 211, 0.15)';
                          const textColor = labelColor;
                          
                          return (
                            <span 
                              key={idx} 
                              className="inline-block px-2 py-1 text-xs rounded font-medium"
                              style={{
                                backgroundColor: bgColor,
                                color: textColor,
                                border: `1px solid ${textColor}40` // 40 = 25% opacity in hex
                              }}
                            >
                              {safeString(labelName)}
                            </span>
                          );
                        })}
                      </div>
                    </dd>
                  </div>
                )}
                {(() => {
                  let bgCheckValue = null;
                  if (tutor.extra_attrs) {
                    if (Array.isArray(tutor.extra_attrs)) {
                      const bgCheckAttr = tutor.extra_attrs.find(attr => 
                        (attr.machine_name === 'bgcheck' || attr.machine_name === 'background_check') ||
                        (attr.name && attr.name.toLowerCase().includes('background'))
                      );
                      bgCheckValue = bgCheckAttr?.value;
                    } else if (typeof tutor.extra_attrs === 'object') {
                      bgCheckValue = tutor.extra_attrs.background_check || tutor.extra_attrs.bgcheck;
                    }
                  }
                  return bgCheckValue !== null && bgCheckValue !== undefined ? (
                    <div>
                      <dt className="text-sm font-medium text-neutral-500">Background Check</dt>
                      <dd className="mt-1">
                        {bgCheckValue === true || bgCheckValue === 'True' || bgCheckValue === 'true' ? (
                          <CheckCircleIcon className="h-5 w-5 text-[#34B256]" />
                        ) : (
                          <XCircleIcon className="h-5 w-5 text-[#DA2E72]" />
                        )}
                      </dd>
                    </div>
                  ) : null;
                })()}
              </dl>
            </div>

            {/* Additional Attributes - Clean Format */}
            {(() => {
              if (!tutor.extra_attrs) return null;

              // Helper to format field names
              const formatFieldName = (name, machineName) => {
                const nameMap = {
                  'tier_rate': 'Tier Rate',
                  'contractor_dob': 'Date of Birth',
                  'pronouns': 'Pronouns',
                  'contractor_bio': 'Bio',
                  'preferred_teaching_area': 'Preferred Teaching Area',
                  'contractor_gender': 'Gender',
                  'bgcheck': 'Background Check',
                  'background_check': 'Background Check',
                  'chessable': 'Chessable Classroom'
                };
                return nameMap[machineName] || name || machineName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              };

              // Helper to format field values
              const formatFieldValue = (machineName, value, type) => {
                if (machineName === 'contractor_dob' || machineName === 'dob' || type === 'Date') {
                  try {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                      return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
                    }
                  } catch {
                    // Fall through to default
                  }
                }
                if (machineName === 'bgcheck' || machineName === 'background_check' || (type === 'Checkbox' && (value === true || value === 'True' || value === 'true'))) {
                  return <CheckCircleIcon className="h-5 w-5 text-[#34B256]" />;
                }
                if (machineName === 'chessable' && typeof value === 'string' && value.startsWith('http')) {
                  return (
                    <a href={value} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-700 transition-colors break-all">
                      {value}
                    </a>
                  );
                }
                if (typeof value === 'object' && value !== null) {
                  // If it's an object with a value property, use that
                  if (value.value !== undefined) {
                    return safeString(value.value);
                  }
                  return JSON.stringify(value);
                }
                return safeString(value);
              };

              // Fields to exclude (already shown elsewhere or not needed)
              const excludeFields = ['background_check', 'bgcheck', 'contractor_bio', 'bio'];
              
              let attrs = [];
              
              // Handle array format (from TutorCruncher)
              if (Array.isArray(tutor.extra_attrs)) {
                attrs = tutor.extra_attrs
                  .filter(attr => {
                    const machineName = attr.machine_name || attr.key;
                    return !excludeFields.includes(machineName) && 
                           attr.value !== null && 
                           attr.value !== undefined && 
                           attr.value !== '';
                  })
                  .map(attr => ({
                    name: attr.name,
                    machineName: attr.machine_name || attr.key,
                    value: attr.value,
                    type: attr.type
                  }));
              } 
              // Handle object format
              else if (typeof tutor.extra_attrs === 'object') {
                attrs = Object.entries(tutor.extra_attrs)
                  .filter(([key]) => !excludeFields.includes(key))
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([key, value]) => ({
                    name: null,
                    machineName: key,
                    value: value,
                    type: null
                  }));
              }

              if (attrs.length === 0) return null;

              return (
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
                  <h3 className="text-lg font-semibold text-neutral-900 mb-4">Additional Attributes</h3>
                  <dl className="space-y-4">
                    {attrs.map((attr, idx) => {
                      const displayName = formatFieldName(attr.name, attr.machineName);
                      const displayValue = formatFieldValue(attr.machineName, attr.value, attr.type);
                      
                      if (!displayValue) return null;

                      return (
                        <div key={idx} className="border-b border-neutral-100 pb-3 last:border-b-0 last:pb-0">
                          <dt className="text-sm font-medium text-neutral-500 mb-1">{displayName}</dt>
                          <dd className="text-sm text-neutral-900">{displayValue}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })()}

            {/* Institutions Attended */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
                  Institutions Attended
                  <span className="ml-2 text-[#34B256] cursor-help" title="Educational institutions">
                    ?
                  </span>
                </h3>
              </div>
              {tutor.institutions && Array.isArray(tutor.institutions) && tutor.institutions.length > 0 ? (
                <div className="space-y-2">
                  {tutor.institutions.map((inst, idx) => {
                    const instName = safeString(inst?.name || inst);
                    return (
                      <div key={idx} className="text-neutral-700">
                        {instName}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-neutral-500">No Institutions Attended</p>
              )}
            </div>

            {/* Notes - Check if we have notes in extra_attrs or a separate field */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900 flex items-center">
                  Notes
                  <span className="ml-2 text-[#34B256] cursor-help" title="Internal notes about this tutor">
                    ?
                  </span>
                </h3>
              </div>
              {tutor.extra_attrs && typeof tutor.extra_attrs === 'object' && tutor.extra_attrs.notes ? (
                <div className="text-neutral-700 whitespace-pre-wrap">{safeString(tutor.extra_attrs.notes)}</div>
              ) : (
                <p className="text-neutral-500">No notes available</p>
              )}
            </div>

            {/* Related Services */}
            <RelatedEntitiesList
              title="Related Jobs"
              entities={relatedServices}
              entityType="job"
              getLink={(service) => `/jobs/${service.service_id}`}
              getName={(service) => {
                const name = service.name;
                const nameStr = safeRender(name) || `Job ${service.service_id}`;
                return nameStr;
              }}
              getSubtitle={(service) => {
                const status = service.status;
                const statusStr = safeRender(status) || 'Unknown';
                return `Status: ${statusStr}`;
              }}
              emptyMessage="No related jobs"
            />

            {/* Related Lessons */}
            <RelatedEntitiesList
              title="Recent Lessons"
              entities={relatedLessons?.slice(0, 10)}
              entityType="lesson"
              getLink={(lesson) => `/lessons/${lesson.appointment_id}`}
              getName={(lesson) => {
                const date = new Date(lesson.start);
                return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
              }}
              getSubtitle={(lesson) => {
                const serviceName = lesson.service_name;
                const status = lesson.status;
                const serviceNameStr = safeRender(serviceName) || 'Unknown Service';
                const statusStr = safeRender(status) || 'Unknown';
                return `${serviceNameStr} • ${statusStr}`;
              }}
              emptyMessage="No lessons found"
            />
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <TutorCalendar lessons={relatedLessons || []} />
      )}

      {activeTab === 'activity' && (
        <TutorActivityTab 
          tutorId={id}
          tutor={tutor}
          relatedServices={relatedServices}
          relatedLessons={relatedLessons}
          adhocCharges={adhocCharges}
        />
      )}

      {activeTab === 'communications' && (
        <div className="space-y-6">
          {/* Tutor Notes */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Notes</h3>
            </div>
            {tutorNotes && tutorNotes.length > 0 ? (
              <div className="space-y-4">
                {tutorNotes.map((note) => (
                  <div key={note.id} className="border-l-4 border-primary-500 pl-4 py-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-neutral-700 whitespace-pre-wrap">{safeString(note.note)}</p>
                        <div className="mt-2 flex items-center text-xs text-neutral-500">
                          <span>By {safeString(note.created_by)}</span>
                          <span className="mx-2">•</span>
                          <span>{new Date(note.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500">No notes available</p>
            )}
          </div>

          {/* Adhoc Charges (can indicate communications/actions) */}
          {adhocCharges && adhocCharges.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Adhoc Charges & Adjustments</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Related</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {adhocCharges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                          {charge.date_occurred ? new Date(charge.date_occurred).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.category_name)}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.description) || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 tabular-nums">
                          ${parseFloat(safeString(charge.net_gross) || 0).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-500">
                          {charge.appointment_id ? (
                            <Link to={`/lessons/${charge.appointment_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              Lesson {charge.appointment_id}
                            </Link>
                          ) : charge.service_id ? (
                            <Link to={`/jobs/${charge.service_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              Job {charge.service_id}
                            </Link>
                          ) : charge.client_id ? (
                            <Link to={`/clients/${charge.client_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              Client {charge.client_id}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'reviews' && (
        <div className="space-y-6">
          {/* Overall Rating Summary */}
          {tutor.review_rating && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Overall Rating</h3>
              <div className="space-y-2">
                <div>
                  <span className="text-sm text-neutral-500">Rating:</span>
                  <span className="ml-2 text-2xl font-semibold text-neutral-900">
                    {parseFloat(safeString(tutor.review_rating)).toFixed(1)} / 5.0
                  </span>
                </div>
                {(tutor.review_duration_hours || (tutor.review_duration && typeof tutor.review_duration === 'object' && Object.keys(tutor.review_duration).length > 0)) && (
                  <div>
                    <span className="text-sm text-neutral-500">Review Duration:</span>
                    <span className="ml-2 text-neutral-700">
                      {tutor.review_duration_hours 
                        ? formatReviewDuration(tutor.review_duration_hours)
                        : tutor.review_duration?.hours && tutor.review_duration?.minutes
                          ? `${tutor.review_duration.hours}h ${tutor.review_duration.minutes}m`
                          : safeString(tutor.review_duration)
                      }
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Individual Reviews */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Individual Reviews</h3>
            {reviews && reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.review_id} className="border-l-4 border-[#FACC29] pl-4 py-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          {review.star_rating_value && (
                            <div className="flex items-center mr-4">
                              <span className="text-lg font-semibold text-neutral-900 mr-1">
                                {safeString(review.star_rating_value)}
                              </span>
                              <span className="text-[#FACC29]">★</span>
                            </div>
                          )}
                          {review.client_name && (
                            <span className="text-sm text-neutral-600">
                              Review from{' '}
                              {review.client_id ? (
                                <Link to={`/clients/${review.client_id}`} className="text-primary-500 hover:text-primary-700 transition-colors font-medium">
                                  {safeString(review.client_name)}
                                </Link>
                              ) : (
                                safeString(review.client_name)
                              )}
                            </span>
                          )}
                        </div>
                        {review.extra_attrs_value && (
                          <p className="text-neutral-700 mt-2 whitespace-pre-wrap">
                            {extractReviewText(review.extra_attrs_value)}
                          </p>
                        )}
                        {review.date_created && (
                          <p className="text-xs text-neutral-500 mt-2">
                            {new Date(review.date_created).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500">No individual reviews found</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'accounting' && (
        <div className="space-y-6">
          {/* Work Done Summary */}
          {tutor.work_done_details && typeof tutor.work_done_details === 'object' && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Work Summary</h3>
              <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tutor.work_done_details.amount_owed !== undefined && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Amount Owed</dt>
                    <dd className="mt-1 text-lg font-semibold text-neutral-900 tabular-nums">
                      ${parseFloat(safeString(tutor.work_done_details.amount_owed)).toFixed(2)}
                    </dd>
                  </div>
                )}
                {tutor.work_done_details.amount_paid !== undefined && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Amount Paid</dt>
                    <dd className="mt-1 text-lg font-semibold text-[#2A9147] tabular-nums">
                      ${parseFloat(safeString(tutor.work_done_details.amount_paid)).toFixed(2)}
                    </dd>
                  </div>
                )}
                {tutor.work_done_details.total_paid_hours && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Total Paid Hours</dt>
                    <dd className="mt-1 text-lg font-semibold text-neutral-900">
                      {safeString(tutor.work_done_details.total_paid_hours)}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {/* Payment Orders */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Payment Orders</h3>
            {paymentOrders && paymentOrders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">ID</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date Sent</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date Paid</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Charges</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {paymentOrders.map((po) => {
                      const chargesForOrder = paymentOrderCharges?.filter(c => c.payment_order_id === po.id) || [];
                      return (
                        <tr key={po.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {po.url ? (
                              <a href={po.url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-700 transition-colors">
                                {safeString(po.display_id)}
                              </a>
                            ) : (
                              <span className="text-neutral-900">{safeString(po.display_id)}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                            {po.date_sent ? new Date(po.date_sent).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                            {po.date_paid ? new Date(po.date_paid).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 tabular-nums">
                            ${parseFloat(safeString(po.amount)).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                            {chargesForOrder.length} charge{chargesForOrder.length !== 1 ? 's' : ''}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              po.status === 'paid' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                              po.status === 'pending' ? 'bg-[#FEF4E8] text-[#C77A26]' :
                              'bg-neutral-100 text-neutral-800'
                            }`}>
                              {safeString(po.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-neutral-500">No payment orders found</p>
            )}
          </div>

          {/* Payment Order Charges Details */}
          {paymentOrderCharges && paymentOrderCharges.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Payment Order Charges</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Payment Order</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Lesson</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Rate</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Units</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {paymentOrderCharges.slice(0, 50).map((charge, idx) => (
                      <tr key={`${charge.payment_order_id}-${charge.charge_index}`} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                          {paymentOrders.find(po => po.id === charge.payment_order_id)?.display_id || charge.payment_order_id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                          {charge.date ? new Date(charge.date).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">
                          {charge.appointment_id ? (
                            <Link to={`/lessons/${charge.appointment_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              {charge.service_name || `Lesson ${charge.appointment_id}`}
                              {charge.appointment_start && (
                                <span className="text-neutral-500 text-xs ml-2">
                                  ({new Date(charge.appointment_start).toLocaleDateString()})
                                </span>
                              )}
                            </Link>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900 tabular-nums">
                          ${parseFloat(safeString(charge.amount)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500 tabular-nums">
                          ${parseFloat(safeString(charge.rate)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-500">
                          {safeString(charge.units)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="space-y-6">
          {referralsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
              <span className="ml-3 text-neutral-500">Loading referrals...</span>
            </div>
          ) : (
            <>
              {/* Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Submitted</dt>
                  <dd className="mt-1 text-2xl font-semibold text-neutral-900">{referralStats?.total_submitted ?? 0}</dd>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Total Converted</dt>
                  <dd className="mt-1 text-2xl font-semibold text-brand-green">{referralStats?.total_converted ?? 0}</dd>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Pay Bonus</dt>
                  <dd className="mt-1 text-2xl font-semibold text-neutral-900">${referralStats?.pay_bonus ?? 0}/hr</dd>
                </div>
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
                  <dt className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Next Tier Progress</dt>
                  <dd className="mt-1 text-2xl font-semibold text-neutral-900">
                    {referralStats?.next_tier_progress ?? 0}/{referralStats?.next_tier_target ?? 5}
                  </dd>
                  <div className="mt-2 w-full bg-neutral-100 rounded-full h-2">
                    <div
                      className="bg-brand-purple rounded-full h-2 transition-all"
                      style={{ width: `${Math.min(100, ((referralStats?.next_tier_progress ?? 0) / (referralStats?.next_tier_target ?? 5)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Referrals Table */}
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Referrals</h3>
                {Array.isArray(referrals) && referrals.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Referred Person</th>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Points</th>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Matched Client</th>
                          <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Submitted</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {referrals.map((ref) => {
                          const statusColors = {
                            submitted: 'bg-neutral-100 text-neutral-700',
                            pending_review: 'bg-[#FEF4E8] text-[#C77A26]',
                            tracking: 'bg-[#E8FBFF] text-[#2BA3BD]',
                            converted: 'bg-[#E8F8ED] text-[#2A9147]',
                            rejected: 'bg-[#FDE8F0] text-[#AE255B]'
                          };
                          const statusLabel = (ref.status || '').replace(/_/g, ' ');
                          const showProgress = ref.status === 'tracking' || ref.status === 'converted';
                          return (
                            <tr key={ref.id} className="hover:bg-neutral-50">
                              <td className="px-4 py-3 text-sm">
                                <div className="font-medium text-neutral-900">{safeString(ref.referred_name)}</div>
                                {(ref.referred_email || ref.referred_phone) && (
                                  <div className="text-xs text-neutral-500">{safeString(ref.referred_email || ref.referred_phone)}</div>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                                {safeString(ref.referral_type)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs rounded-full capitalize ${statusColors[ref.status] || 'bg-neutral-100 text-neutral-700'}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                {showProgress ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-neutral-900 font-medium tabular-nums">{ref.points ?? 0}</span>
                                    <div className="w-16 bg-neutral-100 rounded-full h-1.5">
                                      <div
                                        className="bg-brand-cyan rounded-full h-1.5 transition-all"
                                        style={{ width: `${Math.min(100, ((ref.points ?? 0) / (ref.points_target ?? 10)) * 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-neutral-500 tabular-nums">{ref.points ?? 0}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                {ref.matched_client_id ? (
                                  <Link to={`/clients/${ref.matched_client_id}`} className="text-brand-purple hover:text-brand-navy transition-colors font-medium">
                                    {safeString(ref.matched_client_name) || `Client ${ref.matched_client_id}`}
                                  </Link>
                                ) : (
                                  <span className="text-neutral-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                                {ref.submitted_at ? new Date(ref.submitted_at).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-neutral-500">No referrals found</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'website' && (
        <div className="space-y-6">
          {loadingWebflow ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto" />
              <p className="mt-2 text-sm text-neutral-500">Loading website sync preview...</p>
            </div>
          ) : webflowPreview ? (
            <>
              {/* Status banner */}
              <div className={`rounded-xl border p-4 ${webflowPreview.webflow_item_id ? 'bg-[#E8FBFF] border-[#50C8DF]/30' : 'bg-[#FEF4E8] border-[#F79A30]/30'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GlobeAltIcon className="h-5 w-5 text-brand-purple" />
                    <span className="text-sm font-medium text-neutral-900">
                      {webflowPreview.webflow_item_id ? 'Connected to Webflow' : 'Not yet synced to Webflow'}
                    </span>
                  </div>
                  {webflowPreview.last_synced && (
                    <span className="text-xs text-neutral-500">
                      Last synced: {new Date(webflowPreview.last_synced).toLocaleString()}
                    </span>
                  )}
                </div>
                {webflowPreview.webflow_item_id && (
                  <div className="mt-1 text-xs text-neutral-500">
                    Webflow ID: {webflowPreview.webflow_item_id}
                  </div>
                )}
              </div>

              {/* Missing fields warning */}
              {webflowPreview.missing_fields && Object.values(webflowPreview.missing_fields).some(v => v) && (
                <div className="rounded-xl border border-[#F79A30]/30 bg-[#FEF4E8] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <ExclamationTriangleIcon className="h-5 w-5 text-[#F79A30]" />
                    <span className="text-sm font-medium text-neutral-900">Missing Fields</span>
                  </div>
                  <ul className="text-sm text-neutral-700 space-y-1 ml-7">
                    {webflowPreview.missing_fields.slug && <li>Slug (URL identifier)</li>}
                    {webflowPreview.missing_fields.bio && <li>Bio</li>}
                    {webflowPreview.missing_fields.title && <li>Role / Title</li>}
                    {webflowPreview.missing_fields.teaching_style && <li>Short Description (Teaching Style)</li>}
                    {webflowPreview.missing_fields.photo && <li>Photo</li>}
                  </ul>
                </div>
              )}

              {/* Preview card */}
              <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-3 border-b border-neutral-100">
                  <h3 className="text-base font-semibold text-neutral-900">Sync Preview</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">This is what will be sent to the website</p>
                </div>
                <div className="divide-y divide-neutral-100">
                  {[
                    { label: 'Name', value: webflowPreview.field_preview?.name },
                    { label: 'Slug', value: webflowPreview.field_preview?.slug },
                    { label: 'Role', value: webflowPreview.field_preview?.role },
                    { label: 'Short Description', value: webflowPreview.field_preview?.['short-description'] },
                    { label: 'Bio', value: webflowPreview.field_preview?.bio, truncate: true },
                    { label: 'Booking Link', value: webflowPreview.field_preview?.['booking-link'] },
                  ].map(({ label, value, truncate }) => (
                    <div key={label} className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                      <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider w-40 flex-shrink-0">{label}</div>
                      <div className={`text-sm text-neutral-900 ${truncate ? 'line-clamp-3' : ''} ${!value ? 'text-neutral-400 italic' : ''}`}>
                        {value || 'Not set'}
                      </div>
                    </div>
                  ))}
                  <div className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider w-40 flex-shrink-0">Photo</div>
                    {webflowPreview.photo_url ? (
                      <img
                        src={webflowPreview.photo_url}
                        alt={webflowPreview.name}
                        className="h-16 w-16 rounded-lg object-cover border border-neutral-200"
                      />
                    ) : (
                      <span className="text-sm text-neutral-400 italic">No photo</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Sync button */}
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setSyncingWebflow(true);
                    setSyncResult(null);
                    try {
                      const res = await fetch(`/api/webflow-sync/tutors/${data.tutor.contractor_id}`, {
                        method: 'POST',
                      });
                      const result = await res.json();
                      if (res.ok) {
                        setSyncResult({ success: true, ...result });
                        // Refresh preview
                        setWebflowPreview(null);
                      } else {
                        setSyncResult({ success: false, error: result.error || 'Sync failed' });
                      }
                    } catch (err) {
                      setSyncResult({ success: false, error: err.message });
                    } finally {
                      setSyncingWebflow(false);
                    }
                  }}
                  disabled={syncingWebflow || !webflowPreview.profile_visible}
                  className={`
                    inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${syncingWebflow
                      ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                      : !webflowPreview.profile_visible
                        ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                        : 'bg-brand-purple text-white hover:bg-brand-navy shadow-sm'
                    }
                  `}
                >
                  {syncingWebflow ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <GlobeAltIcon className="h-4 w-4" />
                      Sync to Website
                    </>
                  )}
                </button>
                {!webflowPreview.profile_visible && (
                  <span className="text-xs text-neutral-500">Profile must be visible to sync</span>
                )}
              </div>

              {/* Sync result */}
              {syncResult && (
                <div className={`rounded-xl border p-4 ${syncResult.success ? 'bg-[#E6F9ED] border-[#34B256]/30' : 'bg-[#FCE8F0] border-[#DA2E72]/30'}`}>
                  <div className="flex items-center gap-2">
                    {syncResult.success ? (
                      <CheckCircleIcon className="h-5 w-5 text-[#34B256]" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-[#DA2E72]" />
                    )}
                    <span className="text-sm font-medium text-neutral-900">
                      {syncResult.success
                        ? `Synced successfully${syncResult.photo_synced ? ' (with photo)' : ''}`
                        : `Sync failed: ${syncResult.error}`}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <GlobeAltIcon className="h-8 w-8 text-neutral-300 mx-auto" />
              <p className="mt-2 text-sm text-neutral-500">Could not load Webflow preview</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cancellations' && (
        <div className="space-y-6">
          {loadingCancellations ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto" />
              <p className="mt-2 text-sm text-neutral-500">Loading cancellation data...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-neutral-500 mb-1">Total Cancelled</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{cancellationData?.summary?.totalCancelled || 0}</div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-neutral-500 mb-1">Cancellation Rate</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{cancellationData?.summary?.cancellationRate || 0}%</div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-neutral-500 mb-1">Total Completed</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{cancellationData?.summary?.totalCompleted || 0}</div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <div className="text-xs text-neutral-500 mb-1">Total Lessons</div>
                  <div className="text-2xl font-bold text-neutral-900 tabular-nums">{cancellationData?.summary?.totalLessons || 0}</div>
                </div>
              </div>

              <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 sm:px-6 py-3 border-b border-neutral-100">
                  <h3 className="text-base font-semibold text-neutral-900">Cancelled Lessons</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Service / Topic</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Client</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Cancelled By</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(cancellationData?.cancellations || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                            No cancellations found for this tutor
                          </td>
                        </tr>
                      ) : (
                        (cancellationData?.cancellations || []).map((c) => {
                          const dt = c.start ? new Date(c.start) : null;
                          const cancelledByStyles = {
                            client: 'bg-[#FCE8F0] text-[#AE255B]',
                            tutor: 'bg-[#FEF4E8] text-[#C77A26]',
                            admin: 'bg-neutral-100 text-neutral-600',
                          };
                          const reasonLabels = {
                            rescheduled: 'Rescheduled', no_show: 'No Show', sick: 'Sick',
                            schedule_conflict: 'Schedule Conflict', weather: 'Weather', other: 'Other',
                          };
                          return (
                            <tr key={c.appointment_id} className="hover:bg-neutral-50 transition-colors">
                              <td className="px-4 py-2.5">
                                <Link to={`/lessons/${c.appointment_id}`} className="text-sm font-medium text-[#6A469D] hover:text-[#4C3271] transition-colors tabular-nums">
                                  {dt ? dt.toLocaleDateString() : '—'}
                                </Link>
                                <div className="text-xs text-neutral-500 tabular-nums">{dt ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-neutral-700 truncate max-w-[200px]">{c.service_name || c.topic || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-neutral-700">{c.client_name || '—'}</td>
                              <td className="px-4 py-2.5">
                                {c.cancelled_by ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ${cancelledByStyles[c.cancelled_by] || 'bg-neutral-100 text-neutral-600'}`}>
                                    {c.cancelled_by.charAt(0).toUpperCase() + c.cancelled_by.slice(1)}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium bg-[#FACC29]/10 text-[#C77A26]">
                                    <TagIcon className="h-3 w-3" /> Untagged
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-neutral-700">{reasonLabels[c.cancellation_reason] || '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
          </EntityDetailPage>
      </BranchProvider>
    </RoleProvider>
  );
}

