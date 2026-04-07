import React, { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import EntityDetailPage, { ContactInfo, RelatedEntitiesList } from './EntityDetailPage';
import NotFound from './NotFound';
import { RoleProvider } from '../contexts/RoleContext';
import { BranchProvider } from '../contexts/BranchContext';
import {
  ChartBarIcon,
  EnvelopeIcon,
  StarIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  UserIcon,
  UsersIcon,
  CreditCardIcon,
  ArrowPathIcon,
  BuildingLibraryIcon,
  QuestionMarkCircleIcon,
  CheckCircleIcon,
  PlusIcon,
  XCircleIcon,
  CalendarDaysIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

const CATEGORY_BADGES = {
  error: "bg-accent-pink/10 text-accent-pink",
  trial: "bg-accent-cyan/10 text-accent-cyan",
  bundle: "bg-primary-50 text-primary-500",
  goodwill: "bg-accent-green/10 text-accent-green",
  uncategorized: "bg-accent-orange/10 text-accent-orange"
};
const CATEGORY_LABELS = {
  error: "Error Make-Good", trial: "Trial Credit", bundle: "Bundle",
  goodwill: "Goodwill", uncategorized: "Uncategorized"
};
const CATEGORY_OPTIONS = ["error", "trial", "bundle", "goodwill", "uncategorized"];

function ClientCreditHistory({ clientId }) {
  const [adjustments, setAdjustments] = useState([]);
  const [totalCredits, setTotalCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const fetchCredits = async () => {
      try {
        const res = await fetch(`/api/balance-adjustments/client/${clientId}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          setAdjustments(data.adjustments);
          setTotalCredits(data.totalCredits);
        }
      } catch (err) {
        console.error("Failed to fetch credit history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCredits();
  }, [clientId]);

  const saveCategorization = async (id) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/balance-adjustments/${id}/categorize`, {
        method: "PATCH",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: editCategory, notes: editNotes })
      });
      if (res.ok) {
        const updated = await res.json();
        setAdjustments(prev => prev.map(a => a.id === id ? updated : a));
        setEditingId(null);
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Credit & Balance Adjustments</h3>
        <div className="animate-pulse h-20 bg-neutral-100 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-900">Credit & Balance Adjustments</h3>
        {totalCredits > 0 && (
          <span className="text-sm font-medium text-neutral-500">
            Total: <span className="text-neutral-900 font-semibold tabular-nums">${totalCredits.toFixed(2)}</span>
          </span>
        )}
      </div>
      {adjustments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-neutral-400">No balance adjustments recorded for this client</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Actor</th>
                <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {adjustments.map(adj => (
                <tr key={adj.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-700 whitespace-nowrap">
                    {new Date(adj.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-neutral-900 whitespace-nowrap tabular-nums">
                    ${parseFloat(adj.amount || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    {adj.tc_type === "bonus_credit" ? "Bonus Credit" : "Balance Correction"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingId === adj.id ? (
                      <select
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value)}
                        className="px-2 py-1.5 border border-neutral-300 rounded-[10px] text-sm hover:border-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 transition-colors"
                      >
                        {CATEGORY_OPTIONS.map(c => (
                          <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CATEGORY_BADGES[adj.category] || CATEGORY_BADGES.uncategorized}`}>
                        {CATEGORY_LABELS[adj.category] || adj.category}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600 whitespace-nowrap">
                    {adj.actor_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {editingId === adj.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text"
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder="Notes..."
                          className="w-24 px-2 py-1.5 border border-neutral-300 rounded-[10px] text-sm hover:border-neutral-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-100 placeholder:text-neutral-400 transition-colors"
                        />
                        <button
                          onClick={() => saveCategorization(adj.id)}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-primary-500 rounded-[10px] hover:bg-primary-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {saving ? "..." : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 rounded-[10px] transition-all duration-200"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingId(adj.id); setEditCategory(adj.category); setEditNotes(adj.notes || ""); }}
                        className="px-3 py-1.5 text-xs font-medium text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded-[10px] transition-all duration-200"
                      >
                        {adj.category === "uncategorized" ? "Tag" : "Edit"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [paymentMethods, setPaymentMethods] = useState(null);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [adHocChargeModalOpen, setAdHocChargeModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [createJobModalOpen, setCreateJobModalOpen] = useState(false);
  const [creatingAdHocCharge, setCreatingAdHocCharge] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [adHocChargeCategories, setAdHocChargeCategories] = useState([]);
  const [taskBoards, setTaskBoards] = useState([]);
  const [taskGroups, setTaskGroups] = useState([]);
  const [availableJobs, setAvailableJobs] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [cancellationData, setCancellationData] = useState(null);
  const [loadingCancellations, setLoadingCancellations] = useState(false);
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [filteredJobs, setFilteredJobs] = useState([]);
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const [selectedJobIndex, setSelectedJobIndex] = useState(-1);
  const [jobCreatedNotification, setJobCreatedNotification] = useState(null);
  const [adHocChargeFormData, setAdHocChargeFormData] = useState({
    category_id: '',
    description: '',
    date_occurred: new Date().toISOString().split('T')[0],
    charge_client: '',
    localOnly: false
  });
  const [taskFormData, setTaskFormData] = useState({
    board_id: '',
    group_id: '',
    name: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    localOnly: false
  });

  useEffect(() => {
    fetch(`/api/entity-details/clients/${id}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404) {
            setError('not-found');
          } else {
            throw new Error('Failed to fetch client details');
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

  // Use relatedJobs from client data when modal opens
  useEffect(() => {
    if (createJobModalOpen && data && data.relatedJobs) {
      setAvailableJobs(data.relatedJobs);
      setFilteredJobs(data.relatedJobs);
      setJobSearchQuery('');
      setSelectedJobId('');
      setJobDropdownOpen(false);
    }
  }, [createJobModalOpen, data]);

  // Filter jobs based on search query
  useEffect(() => {
    if (!jobSearchQuery.trim()) {
      // When search is empty, show all available jobs
      setFilteredJobs(availableJobs);
      setSelectedJobIndex(-1);
    } else {
      const query = jobSearchQuery.toLowerCase();
      const filtered = availableJobs.filter(job => {
        const jobName = safeString(job.name);
        return jobName.toLowerCase().includes(query);
      });
      setFilteredJobs(filtered);
      setSelectedJobIndex(-1);
    }
  }, [jobSearchQuery, availableJobs]);

  // Helper to safely convert any value to string (needed for filtering and display)
  const safeString = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map(item => safeString(item)).filter(Boolean).join(', ');
      }
      return value.name || value.id || value.machine_name || JSON.stringify(value);
    }
    return String(value);
  };

  // Handle keyboard navigation for job search
  const handleJobSearchKeyDown = (e) => {
    if (!jobDropdownOpen && filteredJobs.length > 0) {
      setJobDropdownOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setJobDropdownOpen(true);
      setSelectedJobIndex(prev => 
        prev < filteredJobs.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedJobIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedJobIndex >= 0 && filteredJobs[selectedJobIndex]) {
      e.preventDefault();
      const selectedJob = filteredJobs[selectedJobIndex];
      setSelectedJobId(selectedJob.service_id);
      setJobSearchQuery(selectedJob.name);
      setJobDropdownOpen(false);
      setSelectedJobIndex(-1);
    } else if (e.key === 'Escape') {
      setJobDropdownOpen(false);
      setSelectedJobIndex(-1);
    }
  };

  // Check for job_created notification in URL
  useEffect(() => {
    const jobCreatedId = searchParams.get('job_created');
    if (jobCreatedId) {
      setJobCreatedNotification(jobCreatedId);
      // Remove from URL
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('job_created');
      setSearchParams(newParams, { replace: true });
      // Auto-dismiss after 5 seconds
      setTimeout(() => setJobCreatedNotification(null), 5000);
    }
  }, [searchParams, setSearchParams]);


  // Filter jobs based on search query
  useEffect(() => {
    if (!jobSearchQuery.trim()) {
      setFilteredJobs(availableJobs);
      setSelectedJobIndex(-1);
    } else {
      const query = jobSearchQuery.toLowerCase();
      const filtered = availableJobs.filter(job => {
        const jobName = job?.name || '';
        return jobName.toLowerCase().includes(query);
      });
      setFilteredJobs(filtered);
      setSelectedJobIndex(-1);
    }
  }, [jobSearchQuery, availableJobs]);

  // Fetch payment methods when billing tab is active
  useEffect(() => {
    if (activeTab === 'billing' && id && !paymentMethods && !loadingPaymentMethods) {
      setLoadingPaymentMethods(true);
      fetch(`/api/client-billing/${id}/payment-methods`)
        .then((res) => res.json())
        .then((data) => {
          setPaymentMethods(data);
          setLoadingPaymentMethods(false);
        })
        .catch((err) => {
          console.error('Error fetching payment methods:', err);
          setPaymentMethods({ error: err.message });
          setLoadingPaymentMethods(false);
        });
    }
  }, [activeTab, id, paymentMethods, loadingPaymentMethods]);

  // Fetch cancellation data when cancellations tab is active
  useEffect(() => {
    if (activeTab === 'cancellations' && id && !cancellationData && !loadingCancellations) {
      setLoadingCancellations(true);
      fetch(`/api/entity-details/clients/${id}/cancellations`)
        .then((res) => res.json())
        .then((result) => {
          setCancellationData(result);
          setLoadingCancellations(false);
        })
        .catch((err) => {
          console.error('Error fetching cancellations:', err);
          setCancellationData({ cancellations: [], summary: {} });
          setLoadingCancellations(false);
        });
    }
  }, [activeTab, id, cancellationData, loadingCancellations]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading client details...</p>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return <NotFound entityType="Client" entityId={id} />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#DA2E72]">Error: {error}</p>
        </div>
      </div>
    );
  }

  const { client, relatedStudents, relatedLessons, relatedJobs, relatedTasks, relatedInvoices, proformaInvoices, clientNotes, adhocCharges, creditRequests, balanceUpdates, activityFeed, tutorCruncherUrl } = data;
  
  // Handle student deletion
  const handleDeleteStudent = async (student) => {
    try {
      const response = await fetch(`/api/entity-lists/students/${student.recipient_id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete student');
      }

      // Refresh the page to update the student list
      window.location.reload();
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error(`Failed to delete student: ${error.message}`);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'live':
      case 'active':
        return 'green';
      case 'prospect':
        return 'yellow';
      case 'dormant':
        return 'gray';
      default:
        return 'gray';
    }
  };

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'activity', name: 'Activity', icon: ChartBarIcon },
    { id: 'communications', name: 'Communications', icon: EnvelopeIcon },
    { id: 'tutor-reviews', name: 'Tutor Reviews', icon: StarIcon },
    { id: 'accounting', name: 'Accounting', icon: CurrencyDollarIcon },
    { id: 'billing', name: 'Billing', icon: DocumentTextIcon },
    { id: 'cancellations', name: 'Cancellations', icon: CalendarDaysIcon }
  ];

  const initials = client.first_name && client.last_name
    ? `${client.first_name[0]}${client.last_name[0]}`.toUpperCase()
    : '?';

  const address = [client.street, client.town, client.state, client.postcode, client.country]
    .filter(Boolean)
    .join(', ');

  return (
    <RoleProvider>
      <BranchProvider>
        <>
          {/* Job Created Success Notification */}
          {jobCreatedNotification && (
            <div className="mb-4 bg-[#E8F8ED] border border-[#34B256]/30 rounded-xl p-4 flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <CheckCircleIcon className="h-5 w-5 text-[#34B256]" />
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    Job created successfully!
                  </p>
                  <p className="text-xs text-neutral-600 mt-1">
                    The job has been associated with this client and selected students.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to={`/jobs/${jobCreatedNotification}`}
                  className="text-sm font-medium text-primary-500 hover:text-primary-700 transition-colors"
                >
                  View Job
                </Link>
                <button
                  onClick={() => setJobCreatedNotification(null)}
                  className="text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  <XCircleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
          <EntityDetailPage
      title={`Client: ${client.first_name} ${client.last_name}`}
      status={client.status || 'Unknown'}
      statusColor={getStatusColor(client.status)}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tutorCruncherUrl={tutorCruncherUrl}
      backToListUrl="/pipeline/clients"
      backToListLabel="Clients"
    >
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Contact */}
            <ContactInfo
              email={client.email}
              phone={client.phone}
              mobile={client.mobile}
              address={address}
              photo={client.photo}
              initials={initials}
              placeholderIcon={UsersIcon}
            />

            {/* Client Notes */}
            {client.extra_attrs && typeof client.extra_attrs === 'object' && client.extra_attrs.notes && (
              <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-neutral-900 mb-4">Client Notes</h3>
                <p className="text-neutral-700 whitespace-pre-wrap">{client.extra_attrs.notes}</p>
              </div>
            )}

            {/* Students */}
            <RelatedEntitiesList
              title="Students"
              entities={relatedStudents}
              entityType="student"
              getLink={(student) => `/students/${student.recipient_id}`}
              getName={(student) => student.recipient_name || 'Unknown Student'}
              getSubtitle={(student) => `Paying Client: ${student.paying_client_name || 'Unknown'}`}
              emptyMessage="No students found"
              addButton={
                <Link
                  to={`/students/add?client_id=${client.client_id}`}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2"
                >
                  <UserIcon className="h-4 w-4" />
                  Add Student
                </Link>
              }
              onDelete={handleDeleteStudent}
              getDeleteId={(student) => student.recipient_id}
            />

            {/* Uploaded Documents */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Uploaded Documents</h3>
              <p className="text-neutral-500">No Uploaded Documents</p>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Profile Details */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Profile</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-neutral-500">ID</dt>
                  <dd className="mt-1 text-sm text-neutral-900">{client.client_id}</dd>
                </div>
                {client.tc_created_at && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Date Created</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      {new Date(client.tc_created_at).toLocaleDateString()}
                    </dd>
                  </div>
                )}
                {client.pipeline_stage_name && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Pipeline Stage</dt>
                    <dd className="mt-1 text-sm text-neutral-900">{client.pipeline_stage_name}</dd>
                  </div>
                )}
                {client.invoice_balance !== null && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Invoice Balance</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      ${parseFloat(client.invoice_balance || 0).toFixed(2)}
                    </dd>
                  </div>
                )}
                {client.available_balance !== null && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Available Balance</dt>
                    <dd className="mt-1 text-sm text-neutral-900">
                      ${parseFloat(client.available_balance || 0).toFixed(2)}
                    </dd>
                  </div>
                )}
                {client.labels && Array.isArray(client.labels) && client.labels.length > 0 && (
                  <div>
                    <dt className="text-sm font-medium text-neutral-500">Labels</dt>
                    <dd className="mt-1 flex flex-wrap gap-2">
                      {client.labels.map((label, idx) => {
                        const labelName = typeof label === 'string' ? label : (label.name || label.machine_name || JSON.stringify(label));
                        return (
                          <span key={idx} className="px-2.5 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                            {labelName}
                          </span>
                        );
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Notes</h3>
              <p className="text-neutral-500">No Notes</p>
            </div>

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
              getSubtitle={(lesson) => `${lesson.service_name || 'Unknown Service'} • ${lesson.status || 'Unknown'}`}
              emptyMessage="No lessons found"
            />
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Jobs Section */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Jobs</h3>
              <button
                onClick={() => setCreateJobModalOpen(true)}
                className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2"
              >
                <PlusIcon className="h-4 w-4" />
                Create Job
              </button>
            </div>
            {relatedJobs && relatedJobs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date Created</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Lessons</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {relatedJobs.map((job) => (
                      <tr key={job.service_id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 text-sm">
                          <Link to={`/jobs/${job.service_id}`} className="text-primary-500 hover:text-primary-700 transition-colors font-medium">
                            {safeString(job.name)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                          {job.date_created ? new Date(job.date_created).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">
                          {job.lesson_count || 0}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                            job.status === 'in-progress' ? 'bg-[#E8FBFF] text-[#3BA8BD]' :
                            job.status === 'finished' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                            job.status === 'gone-cold' ? 'bg-neutral-100 text-neutral-600' :
                            'bg-[#FEF4E8] text-[#C77A26]'
                          }`}>
                            {safeString(job.status || 'pending')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-neutral-500">No jobs found</p>
            )}
          </div>

          {/* Lesson History */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Lesson History</h3>
            {relatedLessons && relatedLessons.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Job</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {relatedLessons.slice(0, 20).map((lesson) => {
                      const startDate = new Date(lesson.start);
                      return (
                        <tr key={lesson.appointment_id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-900">
                            <Link to={`/lessons/${lesson.appointment_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              {startDate.toLocaleDateString()} {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700">
                            <Link to={`/jobs/${lesson.service_id}`} className="text-primary-500 hover:text-primary-700 transition-colors">
                              {safeString(lesson.service_name)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                              lesson.status === 'complete' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                              lesson.status === 'cancelled' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                              'bg-[#FEF4E8] text-[#C77A26]'
                            }`}>
                              {safeString(lesson.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-neutral-500">No lessons found</p>
            )}
          </div>

          {/* Ad Hoc Charges and Tasks - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ad Hoc Charges Section - Left Column */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Ad Hoc Charges</h3>
                <button
                  onClick={() => setAdHocChargeModalOpen(true)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
                </button>
              </div>
              {adhocCharges && adhocCharges.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {adhocCharges.map((charge) => (
                        <tr key={charge.id} className="hover:bg-neutral-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                            {charge.date_occurred ? new Date(charge.date_occurred).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.category_name)}</td>
                          <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.description) || '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
                            ${parseFloat(safeString(charge.net_gross) || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-neutral-500">No Ad Hoc Charges</p>
              )}
            </div>

            {/* Tasks Section - Right Column */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-neutral-900">Tasks</h3>
                <button
                  onClick={() => setTaskModalOpen(true)}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add
                </button>
              </div>
              {relatedTasks && relatedTasks.length > 0 ? (
                <div className="space-y-2">
                  {relatedTasks.map((task) => (
                    <div key={task.id} className="p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-neutral-900">{safeString(task.name)}</div>
                          {task.description && (
                            <div className="text-sm text-neutral-600 mt-1">{safeString(task.description)}</div>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                              task.status === 'done' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                              task.status === 'in-progress' ? 'bg-[#E8FBFF] text-[#3BA8BD]' :
                              'bg-neutral-100 text-neutral-600'
                            }`}>
                              {safeString(task.status || 'todo')}
                            </span>
                            {task.due_date && (
                              <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                            )}
                            {task.assignee_first_name && (
                              <span>Assigned to: {task.assignee_first_name} {task.assignee_last_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-neutral-500">No Tasks</p>
              )}
            </div>
          </div>

          {/* Activity Feed Section */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-4">Activity Feed</h3>
            {activityFeed && activityFeed.length > 0 ? (
              <div className="space-y-3">
                {activityFeed.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 pb-3 border-b border-neutral-100 last:border-0">
                    <div className="flex-shrink-0 mt-1">
                      <div className={`h-2 w-2 rounded-full ${
                        activity.activity_type === 'appointment' ? 'bg-[#50C8DF]' :
                        activity.activity_type === 'invoice' ? 'bg-[#34B256]' :
                        activity.activity_type === 'adhoc_charge' ? 'bg-primary-500' :
                        'bg-neutral-400'
                      }`}></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-neutral-900">{safeString(activity.title)}</div>
                      <div className="text-sm text-neutral-600 mt-1">{safeString(activity.description)}</div>
                      <div className="text-xs text-neutral-500 mt-1">
                        {activity.activity_date ? new Date(activity.activity_date).toLocaleString() : '—'}
                      </div>
                    </div>
                    {activity.status && (
                      <div className="flex-shrink-0">
                        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          activity.status === 'complete' || activity.status === 'paid' ? 'bg-[#E8F8ED] text-[#2A9147]' :
                          activity.status === 'cancelled' ? 'bg-[#FCE8F0] text-[#AE255B]' :
                          'bg-[#FEF4E8] text-[#C77A26]'
                        }`}>
                          {safeString(activity.status)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500">No recent activity</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'communications' && (
        <div className="space-y-6">
          {/* Client Notes */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Notes</h3>
            </div>
            {clientNotes && clientNotes.length > 0 ? (
              <div className="space-y-4">
                {clientNotes.map((note) => (
                  <div key={note.id} className="border-l-4 border-brand-purple pl-4 py-2">
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

          {/* Adhoc Charges (can be a form of communication/action) */}
          {adhocCharges && adhocCharges.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-neutral-900 mb-4">Adhoc Charges</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200">
                  <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Related</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {adhocCharges.map((charge) => (
                      <tr key={charge.id} className="hover:bg-neutral-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                          {charge.date_occurred ? new Date(charge.date_occurred).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.category_name)}</td>
                        <td className="px-4 py-3 text-sm text-neutral-700">{safeString(charge.description) || '—'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-neutral-900">
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

      {activeTab === 'tutor-reviews' && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">Tutor Reviews</h3>
          <p className="text-neutral-500">Tutor reviews coming soon...</p>
        </div>
      )}

      {activeTab === 'accounting' && (
        <div className="space-y-6">
          {/* Balance Details */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Balance Details</h3>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200">
                  View full history
                </button>
                <button className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200">
                  Manual adjustment
                </button>
                <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200">
                  Quick payment
                </button>
              </div>
            </div>
            <dl className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div>
                <dt className="text-xs font-medium text-neutral-500">Invoice Balance</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums ${
                  parseFloat(client.invoice_balance || 0) < 0 ? 'text-[#DA2E72]' : 'text-neutral-900'
                }`}>
                  ${parseFloat(client.invoice_balance || 0).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Number of Payments</dt>
                <dd className="mt-1 text-lg font-semibold text-neutral-900 tabular-nums">
                  {balanceUpdates?.filter(bu => bu.update_type === 'payment').length || 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Available Balance</dt>
                <dd className={`mt-1 text-lg font-semibold tabular-nums ${
                  parseFloat(client.available_balance || 0) < 0 ? 'text-[#DA2E72]' : 'text-[#34B256]'
                }`}>
                  ${parseFloat(client.available_balance || 0).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-neutral-500">Usually pays by</dt>
                <dd className="mt-1 text-sm text-neutral-700">
                  {paymentMethods?.defaultPaymentMethod ? 'Card Payment with Stripe' : '—'}
                </dd>
              </div>
            </dl>
            
            {/* Transaction History */}
            {balanceUpdates && balanceUpdates.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-neutral-900 mb-3">Transaction History</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-neutral-200">
                    <thead className="border-t border-b border-neutral-200 bg-neutral-50/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Credit</th>
                        <th className="px-4 py-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Debit</th>
                        <th className="px-4 py-3 text-right text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {balanceUpdates.slice(0, 20).map((update, index) => {
                        const amount = parseFloat(update.amount || 0);
                        const isCredit = amount > 0;
                        const runningBalance = balanceUpdates.slice(0, index + 1).reduce((sum, u) => sum + parseFloat(u.amount || 0), 0);
                        return (
                          <tr key={update.id} className="hover:bg-neutral-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                              {update.date_created ? new Date(update.date_created).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-700">
                              {update.description || `${update.update_type} - ${update.method || ''}`}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-neutral-700">
                              {update.update_type || 'Balance Update'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-[#2A9147] tabular-nums">
                              {isCredit ? `$${amount.toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-[#AE255B] tabular-nums">
                              {!isCredit ? `$${Math.abs(amount).toFixed(2)}` : '—'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-neutral-900 tabular-nums">
                              ${runningBalance.toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Invoices</h3>
            </div>
            <div className="mb-4 flex gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Total Paid:</span>
                <span className="ml-2 font-semibold text-[#2A9147] tabular-nums">
                  ${relatedInvoices?.filter(inv => inv.status === 'paid').reduce((sum, inv) => sum + parseFloat(inv.gross || 0), 0).toFixed(2) || '0.00'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Total Unpaid:</span>
                <span className="ml-2 font-semibold text-[#AE255B] tabular-nums">
                  {relatedInvoices?.filter(inv => inv.status === 'unpaid' || inv.status === 'partially_paid').length || 0}
                </span>
              </div>
            </div>
            {relatedInvoices && relatedInvoices.length > 0 ? (
              <div className="space-y-2">
                {relatedInvoices.slice(0, 10).map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <div className="flex items-center gap-3">
                      {invoice.url ? (
                        <a href={invoice.url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-700 transition-colors font-medium">
                          {safeString(invoice.display_id) || `Invoice ${invoice.id}`}
                        </a>
                      ) : (
                        <span className="text-neutral-900 font-medium">{safeString(invoice.display_id) || `Invoice ${invoice.id}`}</span>
                      )}
                      <span className="text-sm text-neutral-500">•</span>
                      <span className="text-sm font-medium text-neutral-900">
                        ${parseFloat(safeString(invoice.gross) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-neutral-500">1 Lessons</span>
                      {invoice.status === 'paid' && (
                        <span className="px-2.5 py-0.5 text-xs font-medium bg-[#E8F8ED] text-[#2A9147] rounded-full">
                          Paid
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <a href={`/accounting/raised-invoices?client=${id}`} className="text-sm font-medium text-primary-500 hover:text-primary-700 transition-colors">
                    View all Invoices →
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">No invoices found</p>
            )}
          </div>

          {/* Credit Requests */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Credit Requests</h3>
              <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200">
                + Add
              </button>
            </div>
            <div className="mb-4 flex gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Total Paid:</span>
                <span className="ml-2 font-semibold text-[#2A9147] tabular-nums">
                  ${creditRequests?.filter(cr => cr.status === 'paid').reduce((sum, cr) => sum + parseFloat(cr.gross || 0), 0).toFixed(2) || '0.00'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500">Total Unpaid:</span>
                <span className="ml-2 font-semibold text-[#AE255B] tabular-nums">
                  {creditRequests?.filter(cr => cr.status === 'unpaid' || cr.status === 'draft').length || 0}
                </span>
              </div>
            </div>
            {creditRequests && creditRequests.length > 0 ? (
              <div className="space-y-2">
                {creditRequests.slice(0, 10).map((cr) => (
                  <div key={cr.id} className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <div className="flex items-center gap-3">
                      {cr.url ? (
                        <a href={cr.url} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-700 transition-colors font-medium">
                          {safeString(cr.display_id) || `Credit Request ${cr.id}`}
                        </a>
                      ) : (
                        <span className="text-neutral-900 font-medium">{safeString(cr.display_id) || `Credit Request ${cr.id}`}</span>
                      )}
                      <span className="text-sm text-neutral-500">•</span>
                      <span className="text-sm font-medium text-neutral-900">
                        ${parseFloat(safeString(cr.gross) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-neutral-500">1 items</span>
                      {cr.status === 'paid' && (
                        <span className="px-2.5 py-0.5 text-xs font-medium bg-[#E8F8ED] text-[#2A9147] rounded-full">
                          {new Date(cr.date_created).toLocaleDateString()} Paid
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <a href={`/accounting/raised-credit-requests?client=${id}`} className="text-sm font-medium text-primary-500 hover:text-primary-700 transition-colors">
                    View all Credit Requests →
                  </a>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">No credit requests found</p>
            )}
          </div>

          {/* Credit & Balance Adjustment History */}
          <ClientCreditHistory clientId={id} />
        </div>
      )}

      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Default Payment Method */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900">Default Payment Method</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    {paymentMethods?.defaultPaymentMethod 
                      ? "This client currently has their default payment method set to pay by card. This means that any new invoices will be paid using their saved cards."
                      : "No default payment method set."}
                  </p>
                </div>
                {paymentMethods?.stripeCustomerId && (
                  <CheckCircleIcon className="h-5 w-5 text-neutral-400 flex-shrink-0" title="Synced to Stripe" />
                )}
              </div>
              {paymentMethods?.stripeCustomerId && (
                <a 
                  href={`https://dashboard.stripe.com/customers/${paymentMethods.stripeCustomerId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2"
                >
                  <CreditCardIcon className="h-4 w-4" />
                  View customer in Stripe
                </a>
              )}
            </div>
            {paymentMethods?.defaultPaymentMethod && (
              <div className="mt-4 p-4 bg-neutral-50 rounded-lg">
                <div className="text-sm text-neutral-700">
                  <strong>Current default payment method:</strong> Credit/Debit Card with Stripe
                </div>
              </div>
            )}
          </div>

          {/* Credit/Debit Cards */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">Credit/Debit cards</h3>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 hover:border-neutral-400 transition-all duration-200 flex items-center gap-2">
                  <ArrowPathIcon className="h-4 w-4" />
                  Refresh Details
                </button>
                <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2">
                  <CreditCardIcon className="h-4 w-4" />
                  Add new card
                </button>
                <QuestionMarkCircleIcon className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
            {loadingPaymentMethods ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple mx-auto"></div>
                <p className="mt-2 text-sm text-neutral-500">Loading payment methods...</p>
              </div>
            ) : paymentMethods?.error ? (
              <div className="text-center py-8">
                <p className="text-[#DA2E72]">Error loading payment methods: {paymentMethods.error}</p>
              </div>
            ) : paymentMethods?.paymentMethods && paymentMethods.paymentMethods.length > 0 ? (
              <div className="space-y-3">
                {paymentMethods.paymentMethods.map((pm) => (
                  <div 
                    key={pm.id} 
                    className={`p-4 border rounded-xl ${
                      pm.isDefault
                        ? 'bg-[#E8F8ED] border-[#34B256]/30'
                        : 'bg-white border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-8 bg-neutral-200 rounded flex items-center justify-center">
                          {pm.card?.brand && (
                            <span className="text-xs font-semibold uppercase text-neutral-700">
                              {pm.card.brand === 'visa' ? 'VISA' : 
                               pm.card.brand === 'mastercard' ? 'MC' :
                               pm.card.brand === 'amex' ? 'AMEX' :
                               pm.card.brand === 'discover' ? 'DISC' :
                               pm.card.brand?.substring(0, 4).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-neutral-900">
                            {pm.card?.brand ? `${pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1)}` : 'Card'} ending in {pm.card?.last4 || '****'}
                          </div>
                          <div className="text-sm text-neutral-500">
                            expires {pm.card?.exp_month || 'MM'}/{pm.card?.exp_year || 'YYYY'}
                          </div>
                          {pm.billing_details?.name && (
                            <div className="text-sm text-neutral-500 flex items-center gap-1 mt-1">
                              <UserIcon className="h-4 w-4" />
                              {pm.billing_details.name}
                            </div>
                          )}
                          {pm.billing_details?.address && (
                            <div className="text-sm text-neutral-500 flex items-center gap-1 mt-1">
                              <BuildingLibraryIcon className="h-4 w-4" />
                              {[
                                pm.billing_details.address.line1,
                                pm.billing_details.address.city,
                                pm.billing_details.address.state,
                                pm.billing_details.address.postal_code
                              ].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {pm.isDefault ? (
                          <span className="px-2.5 py-0.5 text-xs font-medium bg-[#E8F8ED] text-[#2A9147] rounded-full flex items-center gap-1">
                            Default card
                            <QuestionMarkCircleIcon className="h-4 w-4" />
                          </span>
                        ) : (
                          <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200">
                            Make default
                          </button>
                        )}
                        <button className="px-3 py-1.5 text-sm font-medium text-white bg-[#DA2E72] rounded-md hover:bg-[#AE255B] transition-all duration-200">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-neutral-500">No payment methods saved.</p>
              </div>
            )}
          </div>

          {/* GoCardless Direct Debit */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-neutral-900">GoCardless direct debit</h3>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200 flex items-center gap-2">
                  <BuildingLibraryIcon className="h-4 w-4" />
                  Add Direct Debit Mandate
                </button>
                <QuestionMarkCircleIcon className="h-5 w-5 text-neutral-400" />
              </div>
            </div>
            <p className="text-neutral-500">No direct debit payment methods saved.</p>
          </div>
        </div>
      )}

      {/* Create Job Modal - Student and Job Selection */}
      {createJobModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.15)] max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-neutral-900">Add to Job</h2>
                <button
                  onClick={() => {
                    setCreateJobModalOpen(false);
                    setSelectedStudents([]);
                    setSelectedJobId('');
                    setJobSearchQuery('');
                    setJobDropdownOpen(false);
                    setSelectedJobIndex(-1);
                  }}
                  className="text-neutral-400 hover:text-neutral-600"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Students Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Students <span className="text-[#DA2E72]">*</span>
                </label>
                <p className="text-sm text-neutral-500 mb-3">Please select the Students you would like to attach to the Job</p>
                <div className="border border-neutral-200 rounded-lg p-4 max-h-48 overflow-y-auto">
                  {relatedStudents && relatedStudents.length > 0 ? (
                    <div className="space-y-2">
                      {relatedStudents.map((student) => (
                        <label key={student.recipient_id} className="flex items-center gap-3 p-2 hover:bg-neutral-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.recipient_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const newSelection = [...selectedStudents, student.recipient_id];
                                console.log('Student selected:', student.recipient_id, student.recipient_name, 'New selection:', newSelection);
                                setSelectedStudents(newSelection);
                              } else {
                                const newSelection = selectedStudents.filter(id => id !== student.recipient_id);
                                console.log('Student deselected:', student.recipient_id, 'New selection:', newSelection);
                                setSelectedStudents(newSelection);
                              }
                            }}
                            className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                          />
                          <span className="text-sm text-neutral-900">{safeString(student.recipient_name || 'Unknown Student')}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">No students available</p>
                  )}
                </div>
              </div>

              {/* Choose from existing Jobs Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Choose from existing Jobs
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={jobSearchQuery}
                    onChange={(e) => {
                      const value = e.target.value;
                      setJobSearchQuery(value);
                      setJobDropdownOpen(true);
                      setSelectedJobId('');
                      setSelectedJobIndex(-1);
                    }}
                    onFocus={() => {
                      if (availableJobs.length > 0) {
                        setJobDropdownOpen(true);
                      }
                    }}
                    onKeyDown={handleJobSearchKeyDown}
                    placeholder="Search for existing jobs..."
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                  />
                  {jobDropdownOpen && filteredJobs.length > 0 && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => {
                          setJobDropdownOpen(false);
                          setSelectedJobIndex(-1);
                        }}
                      />
                      <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredJobs.map((job, index) => (
                          <div
                            key={job.service_id}
                            onClick={() => {
                              setSelectedJobId(job.service_id);
                              setJobSearchQuery(safeString(job.name));
                              setJobDropdownOpen(false);
                              setSelectedJobIndex(-1);
                            }}
                            onMouseEnter={() => setSelectedJobIndex(index)}
                            className={`px-4 py-2 cursor-pointer ${
                              index === selectedJobIndex
                                ? 'bg-brand-purple text-white'
                                : 'hover:bg-neutral-100'
                            }`}
                          >
                            {safeString(job.name)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {jobDropdownOpen && !jobSearchQuery.trim() && availableJobs.length > 0 && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => {
                          setJobDropdownOpen(false);
                          setSelectedJobIndex(-1);
                        }}
                      />
                      <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {availableJobs.map((job, index) => (
                          <div
                            key={job.service_id}
                            onClick={() => {
                              setSelectedJobId(job.service_id);
                              setJobSearchQuery(safeString(job.name));
                              setJobDropdownOpen(false);
                              setSelectedJobIndex(-1);
                            }}
                            onMouseEnter={() => setSelectedJobIndex(index)}
                            className={`px-4 py-2 cursor-pointer ${
                              index === selectedJobIndex
                                ? 'bg-brand-purple text-white'
                                : 'hover:bg-neutral-100'
                            }`}
                          >
                            {safeString(job.name)}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {jobSearchQuery && filteredJobs.length === 0 && availableJobs.length > 0 && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => {
                          setJobDropdownOpen(false);
                          setSelectedJobIndex(-1);
                        }}
                      />
                      <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg p-4 text-sm text-neutral-500">
                        No jobs found matching "{jobSearchQuery}"
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  onClick={() => {
                    setCreateJobModalOpen(false);
                    setSelectedStudents([]);
                    setSelectedJobId('');
                    setJobSearchQuery('');
                    setJobDropdownOpen(false);
                    setSelectedJobIndex(-1);
                  }}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 transition-all duration-200"
                >
                  Cancel
                </button>
                {selectedJobId && (
                  <button
                    onClick={() => {
                      // Add students to existing job
                      // TODO: Implement add students to job functionality
                      toast.info('Adding students to existing job - functionality coming soon');
                      setCreateJobModalOpen(false);
                      setSelectedStudents([]);
                      setSelectedJobId('');
                      setJobSearchQuery('');
                      setJobDropdownOpen(false);
                      setSelectedJobIndex(-1);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200"
                  >
                    Add to Job
                  </button>
                )}
                <button
                  onClick={() => {
                    console.log('Create New Job clicked - selectedStudents:', selectedStudents); // Debug log
                    if (selectedStudents.length === 0) {
                      toast.error('Please select at least one student');
                      return;
                    }
                    // Navigate to new job creation page with pre-filled data
                    // Use RESTful URL structure: /clients/:clientId/jobs/create
                    const studentIds = selectedStudents.map(id => String(id)).join(',');
                    console.log('Navigating with studentIds:', studentIds); // Debug log
                    const url = `/clients/${client.client_id}/jobs/create?student_ids=${encodeURIComponent(studentIds)}`;
                    console.log('Navigation URL:', url); // Debug log
                    window.location.href = url;
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-500 rounded-md hover:bg-primary-600 transition-all duration-200"
                >
                  Create New Job
                </button>
              </div>
            </div>
          </div>
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
              {/* Summary Cards */}
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

              {/* Cancellations Table */}
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
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Tutor</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Cancelled By</th>
                        <th className="px-4 py-2.5 text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(cancellationData?.cancellations || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                            No cancellations found for this client
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
                              <td className="px-4 py-2.5 text-sm text-neutral-700">{c.tutor_name || '—'}</td>
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
        </>
      </BranchProvider>
    </RoleProvider>
  );
}

