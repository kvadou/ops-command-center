import React, { useState, useEffect, useRef } from 'react';
import ConfirmationModal from '../../ConfirmationModal';
import { useToast } from '../../../hooks/useToast';
import {
  ShieldCheckIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentCheckIcon,
  HeartIcon,
  AcademicCapIcon,
  ClipboardDocumentCheckIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  DocumentArrowUpIcon,
  UserIcon,
  ClockIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

const CATEGORY_CONFIG = {
  clearance: {
    label: 'Clearances',
    icon: ShieldCheckIcon,
    color: 'purple',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
    iconColor: 'text-purple-600'
  },
  medical: {
    label: 'Medical',
    icon: HeartIcon,
    color: 'red',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
    iconColor: 'text-red-600'
  },
  training: {
    label: 'Training & Certifications',
    icon: AcademicCapIcon,
    color: 'blue',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
    iconColor: 'text-blue-600'
  },
  administrative: {
    label: 'Administrative',
    icon: ClipboardDocumentCheckIcon,
    color: 'gray',
    bgColor: 'bg-neutral-50',
    borderColor: 'border-neutral-200',
    textColor: 'text-neutral-700',
    iconColor: 'text-neutral-600'
  }
};

const STATUS_CONFIG = {
  pending: { label: 'Pending Review', color: 'yellow', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
  approved: { label: 'Approved', color: 'green', bgColor: 'bg-green-100', textColor: 'text-green-800' },
  rejected: { label: 'Rejected', color: 'red', bgColor: 'bg-red-100', textColor: 'text-red-800' },
  expired: { label: 'Expired', color: 'gray', bgColor: 'bg-neutral-100', textColor: 'text-neutral-800' }
};

export default function SchoolRequirementsTab({ school }) {
  const toast = useToast();
  const [requirements, setRequirements] = useState([]);
  const [availableTypes, setAvailableTypes] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editNotes, setEditNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Upload modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    tutorId: '',
    tutorName: '',
    tutorEmail: '',
    requirementCode: '',
    issueDate: '',
    expirationDate: '',
    certificateNumber: '',
    issuingAuthority: '',
    notes: ''
  });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Confirmation modal state
  const [confirmState, setConfirmState] = useState({ isOpen: false, action: null, title: '', message: '' });

  // View mode state
  const [viewMode, setViewMode] = useState('requirements'); // 'requirements' or 'compliance'

  useEffect(() => {
    fetchData();
  }, [school.name]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const schoolName = encodeURIComponent(school.name);

      const [reqRes, typesRes, certsRes] = await Promise.all([
        fetch(`/api/school-term-tracking/requirements/${schoolName}`, {
          credentials: 'include',
        }),
        fetch('/api/school-term-tracking/requirement-types', {
          credentials: 'include',
        }),
        fetch(`/api/school-term-tracking/certifications/school/${schoolName}`, {
          credentials: 'include',
        })
      ]);

      if (reqRes.ok) setRequirements(await reqRes.json());
      if (typesRes.ok) setAvailableTypes(await typesRes.json());
      if (certsRes.ok) setCertifications(await certsRes.json());
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRequirement = async (code) => {
    try {
      setSaving(true);
      const schoolName = encodeURIComponent(school.name);

      const response = await fetch(`/api/school-term-tracking/requirements/${schoolName}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirementCode: code, isRequired: true })
      });

      if (response.ok) {
        const newReq = await response.json();
        setRequirements([...requirements, newReq].sort((a, b) => a.displayOrder - b.displayOrder));
      }
    } catch (error) {
      console.error('Error adding requirement:', error);
    } finally {
      setSaving(false);
      setShowAddDropdown(false);
    }
  };

  const handleUpdateNotes = async (id) => {
    try {
      setSaving(true);

      const response = await fetch(`/api/school-term-tracking/requirements/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: editNotes })
      });

      if (response.ok) {
        const updated = await response.json();
        setRequirements(requirements.map(r => r.id === id ? updated : r));
        setEditingId(null);
        setEditNotes('');
      }
    } catch (error) {
      console.error('Error updating requirement:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRequirement = async (id) => {
    try {
      const response = await fetch(`/api/school-term-tracking/requirements/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setRequirements(requirements.filter(r => r.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (error) {
      console.error('Error deleting requirement:', error);
    }
  };

  const handleOpenUploadModal = (requirementCode = '') => {
    setUploadForm({
      tutorId: '',
      tutorName: '',
      tutorEmail: '',
      requirementCode,
      issueDate: '',
      expirationDate: '',
      certificateNumber: '',
      issuingAuthority: '',
      notes: ''
    });
    setUploadFile(null);
    setUploadModalOpen(true);
  };

  const handleUploadCertification = async () => {
    if (!uploadForm.tutorId || !uploadForm.requirementCode) {
      toast.error('Please select a tutor and requirement type');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();

      Object.entries(uploadForm).forEach(([key, value]) => {
        if (value) formData.append(key, value);
      });
      formData.append('schoolName', school.name);

      if (uploadFile) {
        formData.append('file', uploadFile);
      }

      const response = await fetch('/api/school-term-tracking/certifications', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (response.ok) {
        setUploadModalOpen(false);
        fetchData();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to upload certification');
      }
    } catch (error) {
      console.error('Error uploading certification:', error);
      toast.error('Failed to upload certification');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateCertStatus = async (certId, status) => {
    try {
      const response = await fetch(`/api/school-term-tracking/certifications/${certId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error updating certification:', error);
    }
  };

  const handleDownloadCert = async (certId, fileName) => {
    try {
      const response = await fetch(`/api/school-term-tracking/certifications/${certId}/download`, {
        credentials: 'include',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading certification:', error);
    }
  };

  const handleDeleteCert = (certId) => {
    setConfirmState({
      isOpen: true,
      title: 'Delete Certification',
      message: 'Are you sure you want to delete this certification?',
      action: async () => {
        try {
          await fetch(`/api/school-term-tracking/certifications/${certId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          fetchData();
        } catch (error) {
          console.error('Error deleting certification:', error);
        }
      },
    });
  };

  // Get requirements not yet added
  const unaddedTypes = availableTypes.filter(
    type => !requirements.some(r => r.requirementCode === type.code)
  );

  // Group requirements by category
  const groupedRequirements = requirements.reduce((acc, req) => {
    const category = req.category || 'administrative';
    if (!acc[category]) acc[category] = [];
    acc[category].push(req);
    return acc;
  }, {});

  // Group unadded types by category
  const groupedUnaddedTypes = unaddedTypes.reduce((acc, type) => {
    const category = type.category || 'administrative';
    if (!acc[category]) acc[category] = [];
    acc[category].push(type);
    return acc;
  }, {});

  // Group certifications by tutor
  const certsByTutor = certifications.reduce((acc, cert) => {
    if (!acc[cert.tutorId]) {
      acc[cert.tutorId] = {
        tutorId: cert.tutorId,
        tutorName: cert.tutorName,
        tutorEmail: cert.tutorEmail,
        certs: []
      };
    }
    acc[cert.tutorId].certs.push(cert);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with View Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">Tutor Requirements</h3>
          <p className="text-sm text-neutral-500">
            Certifications and clearances required for tutors at this school
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex bg-neutral-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('requirements')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'requirements'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Requirements
            </button>
            <button
              onClick={() => setViewMode('compliance')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'compliance'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Tutor Compliance
            </button>
          </div>

          {/* Add Requirement Button */}
          {viewMode === 'requirements' && (
            <div className="relative">
              <button
                onClick={() => setShowAddDropdown(!showAddDropdown)}
                disabled={unaddedTypes.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PlusIcon className="h-5 w-5" />
                Add Requirement
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${showAddDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showAddDropdown && unaddedTypes.length > 0 && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 max-h-96 overflow-y-auto">
                  <div className="p-2">
                    {Object.entries(groupedUnaddedTypes).map(([category, types]) => {
                      const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.administrative;
                      const Icon = config.icon;
                      return (
                        <div key={category} className="mb-2">
                          <div className={`flex items-center gap-2 px-3 py-1.5 ${config.bgColor} rounded-t-lg`}>
                            <Icon className={`h-4 w-4 ${config.iconColor}`} />
                            <span className={`text-xs font-semibold ${config.textColor}`}>{config.label}</span>
                          </div>
                          {types.map(type => (
                            <button
                              key={type.code}
                              onClick={() => handleAddRequirement(type.code)}
                              disabled={saving}
                              className="w-full text-left px-3 py-2 hover:bg-neutral-50 transition-colors border-l border-r border-neutral-200 last:border-b last:rounded-b-lg"
                            >
                              <div className="font-medium text-sm text-neutral-900">{type.name}</div>
                              {type.description && <div className="text-xs text-neutral-500">{type.description}</div>}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Certification Button */}
          {viewMode === 'compliance' && (
            <button
              onClick={() => handleOpenUploadModal()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <DocumentArrowUpIcon className="h-5 w-5" />
              Upload Certification
            </button>
          )}
        </div>
      </div>

      {showAddDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowAddDropdown(false)} />}

      {/* Requirements View */}
      {viewMode === 'requirements' && (
        <>
          {/* Requirements Summary */}
          {requirements.length > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <DocumentCheckIcon className="h-5 w-5 text-neutral-400" />
                  <span className="text-sm text-neutral-600">
                    <span className="font-semibold text-neutral-900">{requirements.length}</span> requirement{requirements.length !== 1 ? 's' : ''} configured
                  </span>
                </div>
                {Object.entries(groupedRequirements).map(([category, items]) => {
                  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.administrative;
                  const Icon = config.icon;
                  return (
                    <div key={category} className="flex items-center gap-1.5">
                      <Icon className={`h-4 w-4 ${config.iconColor}`} />
                      <span className={`text-sm ${config.textColor}`}>
                        {items.length} {config.label.toLowerCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty State */}
          {requirements.length === 0 && (
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-8 text-center">
              <ShieldCheckIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
              <h4 className="text-lg font-medium text-neutral-900 mb-1">No requirements configured</h4>
              <p className="text-sm text-neutral-500 mb-4">
                Add requirements to track what certifications tutors need to work at this school.
              </p>
            </div>
          )}

          {/* Requirements by Category */}
          {Object.entries(groupedRequirements).map(([category, items]) => {
            const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.administrative;
            const Icon = config.icon;

            return (
              <div key={category} className="space-y-3">
                <div className={`flex items-center gap-2 px-4 py-2 ${config.bgColor} rounded-lg`}>
                  <Icon className={`h-5 w-5 ${config.iconColor}`} />
                  <h4 className={`font-semibold ${config.textColor}`}>{config.label}</h4>
                  <span className={`text-sm ${config.textColor} opacity-75`}>({items.length})</span>
                </div>

                <div className="grid gap-3">
                  {items.map(req => (
                    <div key={req.id} className={`bg-white rounded-lg border ${config.borderColor} p-4 hover:shadow-sm transition-shadow`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`flex-shrink-0 w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center`}>
                            <CheckCircleIcon className={`h-5 w-5 ${config.iconColor}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h5 className="font-medium text-neutral-900">{req.requirementName}</h5>
                            {req.requirementDescription && <p className="text-sm text-neutral-500 mt-0.5">{req.requirementDescription}</p>}

                            {editingId === req.id ? (
                              <div className="mt-3 space-y-2">
                                <textarea
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  placeholder="Add notes about this requirement..."
                                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => handleUpdateNotes(req.id)} disabled={saving} className="px-3 py-1.5 text-sm bg-brand-purple text-white rounded-lg hover:bg-brand-navy transition-colors disabled:opacity-50">
                                    {saving ? 'Saving...' : 'Save'}
                                  </button>
                                  <button onClick={() => { setEditingId(null); setEditNotes(''); }} className="px-3 py-1.5 text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : req.notes ? (
                              <div className="mt-2 text-sm text-neutral-600 bg-neutral-50 px-3 py-2 rounded-lg">
                                <span className="font-medium text-neutral-500">Notes: </span>{req.notes}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 relative">
                          <button onClick={() => { setEditingId(req.id); setEditNotes(req.notes || ''); setConfirmDeleteId(null); }} className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded transition-colors" title="Edit notes">
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setConfirmDeleteId(req.id); setEditingId(null); }} className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Remove requirement">
                            <TrashIcon className="h-4 w-4" />
                          </button>

                          {confirmDeleteId === req.id && (
                            <div className="absolute right-0 top-8 z-50 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-3">
                              <div className="flex items-start gap-2 mb-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                                  <TrashIcon className="h-4 w-4 text-red-600" />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-neutral-900">Remove requirement?</p>
                                  <p className="text-xs text-neutral-500">This action cannot be undone.</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleDeleteRequirement(req.id)} className="flex-1 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">Remove</button>
                                <button onClick={() => setConfirmDeleteId(null)} className="flex-1 px-3 py-1.5 border border-neutral-300 text-neutral-700 text-sm font-medium rounded-lg hover:bg-neutral-50 transition-colors">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Quick Add Presets */}
          {requirements.length === 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 p-6">
              <h4 className="font-medium text-neutral-900 mb-3">Quick Start: Common Requirement Sets</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={async () => {
                    const codes = ['background_check', 'fingerprinting', 'tb_test', 'child_safety'];
                    setSaving(true);
                    try {
                      const schoolName = encodeURIComponent(school.name);
                      const response = await fetch(`/api/school-term-tracking/requirements/${schoolName}/bulk`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requirementCodes: codes })
                      });
                      if (response.ok) fetchData();
                    } finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                    <ShieldCheckIcon className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900">Basic Clearances</div>
                    <div className="text-sm text-neutral-500">Background, Fingerprinting, TB Test, Child Safety</div>
                  </div>
                </button>

                <button
                  onClick={async () => {
                    const codes = ['background_check', 'fingerprinting', 'doe_clearance', 'nyc_pets', 'physical_exam', 'tb_test', 'child_safety', 'mandated_reporter'];
                    setSaving(true);
                    try {
                      const schoolName = encodeURIComponent(school.name);
                      const response = await fetch(`/api/school-term-tracking/requirements/${schoolName}/bulk`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requirementCodes: codes })
                      });
                      if (response.ok) fetchData();
                    } finally { setSaving(false); }
                  }}
                  disabled={saving}
                  className="flex items-center gap-3 p-4 border border-neutral-200 rounded-lg hover:border-brand-purple hover:bg-brand-purple/5 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <AcademicCapIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900">NYC Public School</div>
                    <div className="text-sm text-neutral-500">Full DOE/PETS clearances + medical + training</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Compliance View */}
      {viewMode === 'compliance' && (
        <>
          {/* Compliance Summary */}
          <div className="bg-white rounded-xl border border-neutral-200 p-4">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-neutral-400" />
                <span className="text-sm text-neutral-600">
                  <span className="font-semibold text-neutral-900">{Object.keys(certsByTutor).length}</span> tutor{Object.keys(certsByTutor).length !== 1 ? 's' : ''} with certifications
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DocumentCheckIcon className="h-5 w-5 text-neutral-400" />
                <span className="text-sm text-neutral-600">
                  <span className="font-semibold text-neutral-900">{certifications.length}</span> certification{certifications.length !== 1 ? 's' : ''} on file
                </span>
              </div>
            </div>
          </div>

          {/* Empty State */}
          {certifications.length === 0 && (
            <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-8 text-center">
              <DocumentArrowUpIcon className="h-12 w-12 text-neutral-300 mx-auto mb-3" />
              <h4 className="text-lg font-medium text-neutral-900 mb-1">No certifications uploaded</h4>
              <p className="text-sm text-neutral-500 mb-4">
                Upload certifications to track tutor compliance with school requirements.
              </p>
              <button
                onClick={() => handleOpenUploadModal()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <DocumentArrowUpIcon className="h-5 w-5" />
                Upload First Certification
              </button>
            </div>
          )}

          {/* Certifications by Tutor */}
          {Object.values(certsByTutor).map(tutor => (
            <div key={tutor.tutorId} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-brand-purple/10 rounded-full flex items-center justify-center">
                    <UserIcon className="h-5 w-5 text-brand-purple" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-neutral-900">{tutor.tutorName || `Tutor #${tutor.tutorId}`}</h4>
                    {tutor.tutorEmail && <p className="text-sm text-neutral-500">{tutor.tutorEmail}</p>}
                  </div>
                </div>
                <span className="text-sm text-neutral-500">{tutor.certs.length} certification{tutor.certs.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="divide-y divide-neutral-100">
                {tutor.certs.map(cert => {
                  const statusConfig = STATUS_CONFIG[cert.status] || STATUS_CONFIG.pending;
                  const isExpired = cert.expirationDate && new Date(cert.expirationDate) < new Date();

                  return (
                    <div key={cert.id} className="p-4 hover:bg-neutral-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-medium text-neutral-900">{cert.requirementName}</h5>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig.bgColor} ${statusConfig.textColor}`}>
                              {statusConfig.label}
                            </span>
                            {isExpired && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                                <ExclamationCircleIcon className="h-3 w-3" /> Expired
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex items-center gap-4 text-sm text-neutral-500 flex-wrap">
                            {cert.issueDate && (
                              <span className="flex items-center gap-1">
                                <ClockIcon className="h-4 w-4" /> Issued: {new Date(cert.issueDate).toLocaleDateString()}
                              </span>
                            )}
                            {cert.expirationDate && (
                              <span className={`flex items-center gap-1 ${isExpired ? 'text-red-600' : ''}`}>
                                <ExclamationTriangleIcon className="h-4 w-4" /> Expires: {new Date(cert.expirationDate).toLocaleDateString()}
                              </span>
                            )}
                            {cert.certificateNumber && <span>#{cert.certificateNumber}</span>}
                          </div>

                          {cert.fileName && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={() => handleDownloadCert(cert.id, cert.fileName)}
                                className="inline-flex items-center gap-1 text-sm text-brand-purple hover:text-brand-navy transition-colors"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                                {cert.fileName}
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {cert.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleUpdateCertStatus(cert.id, 'approved')}
                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleUpdateCertStatus(cert.id, 'rejected')}
                                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteCert(cert.id)}
                            className="p-1.5 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete certification"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, action: null, title: '', message: '' })}
        onConfirm={() => {
          confirmState.action?.();
          setConfirmState({ isOpen: false, action: null, title: '', message: '' });
        }}
        title={confirmState.title}
        message={confirmState.message}
        confirmText="Delete"
        isDestructive={true}
      />

      {/* Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-neutral-900">Upload Certification</h3>
              <button onClick={() => setUploadModalOpen(false)} className="p-1 hover:bg-neutral-100 rounded transition-colors">
                <XMarkIcon className="h-5 w-5 text-neutral-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Tutor Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tutor ID *</label>
                  <input
                    type="text"
                    value={uploadForm.tutorId}
                    onChange={(e) => setUploadForm({ ...uploadForm, tutorId: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                    placeholder="TC Contractor ID"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Tutor Name</label>
                  <input
                    type="text"
                    value={uploadForm.tutorName}
                    onChange={(e) => setUploadForm({ ...uploadForm, tutorName: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                    placeholder="Full name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Tutor Email</label>
                <input
                  type="email"
                  value={uploadForm.tutorEmail}
                  onChange={(e) => setUploadForm({ ...uploadForm, tutorEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  placeholder="email@example.com"
                />
              </div>

              {/* Requirement Type */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Requirement Type *</label>
                <select
                  value={uploadForm.requirementCode}
                  onChange={(e) => setUploadForm({ ...uploadForm, requirementCode: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                >
                  <option value="">Select requirement...</option>
                  {availableTypes.map(type => (
                    <option key={type.code} value={type.code}>{type.name}</option>
                  ))}
                </select>
              </div>

              {/* Dates */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={uploadForm.issueDate}
                    onChange={(e) => setUploadForm({ ...uploadForm, issueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={uploadForm.expirationDate}
                    onChange={(e) => setUploadForm({ ...uploadForm, expirationDate: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  />
                </div>
              </div>

              {/* Certificate Details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Certificate Number</label>
                  <input
                    type="text"
                    value={uploadForm.certificateNumber}
                    onChange={(e) => setUploadForm({ ...uploadForm, certificateNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                    placeholder="ID or certificate #"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Issuing Authority</label>
                  <input
                    type="text"
                    value={uploadForm.issuingAuthority}
                    onChange={(e) => setUploadForm({ ...uploadForm, issuingAuthority: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                    placeholder="Organization name"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Notes</label>
                <textarea
                  value={uploadForm.notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-transparent"
                  rows={2}
                  placeholder="Additional notes..."
                />
              </div>

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Certification Document</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-neutral-300 rounded-lg p-6 text-center cursor-pointer hover:border-brand-purple transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                    className="hidden"
                  />
                  {uploadFile ? (
                    <div className="flex items-center justify-center gap-2 text-brand-purple">
                      <DocumentCheckIcon className="h-6 w-6" />
                      <span className="font-medium">{uploadFile.name}</span>
                    </div>
                  ) : (
                    <>
                      <DocumentArrowUpIcon className="h-8 w-8 text-neutral-400 mx-auto mb-2" />
                      <p className="text-sm text-neutral-600">Click to upload or drag and drop</p>
                      <p className="text-xs text-neutral-500 mt-1">PDF, JPG, PNG, DOC up to 10MB</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-neutral-200 flex justify-end gap-3">
              <button
                onClick={() => setUploadModalOpen(false)}
                className="px-4 py-2 text-neutral-700 hover:text-neutral-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadCertification}
                disabled={uploading || !uploadForm.tutorId || !uploadForm.requirementCode}
                className="px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload Certification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
