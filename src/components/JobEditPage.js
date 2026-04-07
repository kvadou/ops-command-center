import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import NotFound from './NotFound';
import Button from './ui/Button';
import Card from './ui/Card';
import Badge from './ui/Badge';
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

export default function JobEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showMoreSettings, setShowMoreSettings] = useState(false);
  const [showAccountingSettings, setShowAccountingSettings] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    brief_title: '',
    description: '',
    concise_description: '',
    dft_charge_type: 'hourly',
    dft_charge_rate: '',
    dft_contractor_rate: '',
    sr_premium: '',
    status: 'in-progress',
    colour: '#6A469D',
    require_student: false,
    require_tutor: false,
    default_tutor_permissions: 'view',
    cap: '',
    added_fee_per_lesson: '',
    max_students: '',
    job_inactivity_time: '',
    review_units: '',
    lesson_reports_required: false,
    auto_invoice: false,
    sales_codes: '',
    commission_tax: '',
    tax_setting: 'gross',
    tutor_tax: '',
    location_id: null,
    labels: [],
  });

  useEffect(() => {
    fetchJobData();
  }, [id]);

  const fetchJobData = async () => {
    try {
      const res = await fetch(`/api/entity-details/jobs/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('not-found');
          setLoading(false);
          return;
        }
        throw new Error('Failed to fetch job details');
      }
      const jobData = await res.json();
      setData(jobData);
      
      // Populate form with existing data
      const service = jobData.service;
      setFormData({
        name: service.name || '',
        brief_title: service.brief_title || service.name || '',
        description: service.description || '',
        concise_description: service.concise_description || '',
        dft_charge_type: service.dft_charge_type || 'hourly',
        dft_charge_rate: service.dft_charge_rate || '',
        dft_contractor_rate: service.dft_contractor_rate || '',
        sr_premium: service.sr_premium || '',
        status: service.status || 'in-progress',
        colour: service.colour || service.calendar_colour || '#6A469D',
        require_student: service.require_student || false,
        require_tutor: service.require_tutor || false,
        default_tutor_permissions: service.default_tutor_permissions || 'view',
        cap: service.cap || '',
        added_fee_per_lesson: service.added_fee_per_lesson || '',
        max_students: service.max_students || '',
        job_inactivity_time: service.job_inactivity_time || '',
        review_units: service.review_units || '5',
        lesson_reports_required: service.lesson_reports_required || false,
        auto_invoice: service.auto_invoice || false,
        sales_codes: service.sales_codes || '',
        commission_tax: service.commission_tax || '',
        tax_setting: service.tax_setting || 'gross',
        tutor_tax: service.tutor_tax || '',
        location_id: service.location_id || (service.location?.id || null),
        labels: service.labels || [],
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/jobs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update job');
      }

      // Redirect back to job detail page
      navigate(`/jobs/${id}`);
    } catch (err) {
      console.error('Error updating job:', err);
      setError(err.message);
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-neutral-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (error === 'not-found') {
    return <NotFound entityType="Job" entityId={id} />;
  }

  if (error && !loading) {
    return (
      <div className="min-h-screen bg-brand-light flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error: {error}</p>
          <Link to={`/jobs/${id}`} className="mt-4 text-primary-600 hover:text-primary-700">
            Back to Job
          </Link>
        </div>
      </div>
    );
  }

  const { service } = data;

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-bold text-primary-500">Edit Job</h1>
              <p className="text-sm text-neutral-600 mt-1">
                {service.name || `Job ${service.service_id}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link to={`/jobs/${id}`}>
                <Button variant="secondary" size="md">
                  <ArrowLeftIcon className="h-4 w-4 mr-2 inline" />
                  Cancel
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Job Identification */}
          <Card>
            <h3 className="text-lg font-semibold text-primary-700 mb-4">Job Identification</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Charge Type *
                </label>
                <select
                  name="dft_charge_type"
                  value={formData.dft_charge_type}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                >
                  <option value="hourly">Per hour, for each student</option>
                  <option value="lesson">Per lesson, for each student</option>
                  <option value="flat">Flat rate</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  The charge type allows you to set the default unit in which lessons are charged. This can be per hour or per lesson, but you can also decide whether to issue charges to each student, or assign a general flat rate that would be split equally depending on how many students have been assigned.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Job Name (read-only)
                </label>
                <input
                  type="text"
                  value={service.name || `Job ${service.service_id}`}
                  disabled
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-50 text-neutral-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Brief title for the Job visible to all Users involved
                </label>
                <input
                  type="text"
                  name="brief_title"
                  value={formData.brief_title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter brief title"
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Calendar Colour *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      name="colour"
                      value={formData.colour}
                      onChange={handleInputChange}
                      className="h-10 w-20 border border-neutral-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      name="colour"
                      value={formData.colour}
                      onChange={handleInputChange}
                      className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="#6A469D"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Description */}
          <Card>
            <h3 className="text-lg font-semibold text-primary-700 mb-4">Description</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows={10}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter detailed job description..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Concise description of the Job to be shown to Tutors and Administrators
                </label>
                <textarea
                  name="concise_description"
                  value={formData.concise_description}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Enter concise description..."
                />
              </div>
            </div>
          </Card>

          {/* Charge and Rate Settings */}
          <Card>
            <h3 className="text-lg font-semibold text-primary-700 mb-4">Charge and Rate Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Default Charge Rate *
                </label>
                <input
                  type="number"
                  name="dft_charge_rate"
                  value={formData.dft_charge_rate}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <p className="mt-1 text-xs text-neutral-500">
                  The amount the Student's paying Client will be charged per hour or lesson.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Default Tutor Rate *
                </label>
                <input
                  type="number"
                  name="dft_contractor_rate"
                  value={formData.dft_contractor_rate}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  required
                />
                <p className="mt-1 text-xs text-neutral-500">
                  The amount the Tutor will be paid per hour or lesson.
                </p>
              </div>
            </div>
          </Card>

          {/* More Settings */}
          <Card>
            <button
              type="button"
              onClick={() => setShowMoreSettings(!showMoreSettings)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <h3 className="text-lg font-semibold text-primary-700">More Settings</h3>
              {showMoreSettings ? (
                <ChevronUpIcon className="h-5 w-5 text-neutral-500" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-neutral-500" />
              )}
            </button>
            {showMoreSettings && (
              <div className="space-y-4 pt-4 border-t border-neutral-200">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Student Premium
                  </label>
                  <input
                    type="number"
                    name="sr_premium"
                    value={formData.sr_premium}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    An extra amount paid to each Tutor per Student per unit (eg. hour).
                  </p>
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="require_student"
                    checked={formData.require_student}
                    onChange={handleInputChange}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                  />
                  <div className="ml-3">
                    <label className="text-sm font-medium text-neutral-700">Require Student</label>
                    <p className="text-xs text-neutral-500">
                      Require Student to be attached before Lesson can be completed.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Default Tutor Permissions
                  </label>
                  <select
                    name="default_tutor_permissions"
                    value={formData.default_tutor_permissions}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="view">Tutor can view Lessons</option>
                    <option value="edit">Tutor can add and edit Lessons</option>
                    <option value="full">Tutor has full control</option>
                  </select>
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="require_tutor"
                    checked={formData.require_tutor}
                    onChange={handleInputChange}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                  />
                  <div className="ml-3">
                    <label className="text-sm font-medium text-neutral-700">Require Tutor</label>
                    <p className="text-xs text-neutral-500">
                      Require Tutor to be attached before Lesson can be completed.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Cap
                  </label>
                  <input
                    type="number"
                    name="cap"
                    value={formData.cap}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Maximum number of units, see Charge Type.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Added fee per Lesson
                  </label>
                  <input
                    type="number"
                    name="added_fee_per_lesson"
                    value={formData.added_fee_per_lesson}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    A fixed amount that will be added for each completed Lesson.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Max Students
                  </label>
                  <input
                    type="number"
                    name="max_students"
                    value={formData.max_students}
                    onChange={handleInputChange}
                    min="1"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Maximum Students on a lesson, can be overridden on each Lesson leave blank for no maximum.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Job Inactivity Time
                  </label>
                  <input
                    type="number"
                    name="job_inactivity_time"
                    value={formData.job_inactivity_time}
                    onChange={handleInputChange}
                    min="0"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Time (in days) of inactivity on the Job before it is marked as 'Gone Cold'.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Review Units
                  </label>
                  <input
                    type="number"
                    name="review_units"
                    value={formData.review_units}
                    onChange={handleInputChange}
                    min="0"
                    step="0.1"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    The amount of hours before an automatic review request is sent.
                  </p>
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    name="lesson_reports_required"
                    checked={formData.lesson_reports_required}
                    onChange={handleInputChange}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                  />
                  <div className="ml-3">
                    <label className="text-sm font-medium text-neutral-700">Lesson Reports Required</label>
                    <p className="text-xs text-neutral-500">
                      Prevents Lessons being marked as complete until they have a Report. Turned on automatically if auto invoice is enabled (see accounting settings).
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Accounting Settings */}
          <Card>
            <button
              type="button"
              onClick={() => setShowAccountingSettings(!showAccountingSettings)}
              className="w-full flex items-center justify-between text-left mb-4"
            >
              <h3 className="text-lg font-semibold text-primary-700">Accounting Settings</h3>
              {showAccountingSettings ? (
                <ChevronUpIcon className="h-5 w-5 text-neutral-500" />
              ) : (
                <ChevronDownIcon className="h-5 w-5 text-neutral-500" />
              )}
            </button>
            {showAccountingSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-neutral-200">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Sales Codes
                  </label>
                  <select
                    name="sales_codes"
                    value={formData.sales_codes}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">---------</option>
                    {/* TODO: Fetch from API */}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">
                    Leave blank to use Branch default.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Commission Tax
                  </label>
                  <select
                    name="commission_tax"
                    value={formData.commission_tax}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Default Company Tax (no tax)</option>
                    {/* TODO: Fetch from API */}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">
                    Leave blank to use Branch default.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Tax Setting
                  </label>
                  <select
                    name="tax_setting"
                    value={formData.tax_setting}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="gross">Calculate tax on amount (enter GROSS values)</option>
                    <option value="net">Calculate tax on amount (enter NET values)</option>
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">
                    Net or Gross.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Tutor Tax
                  </label>
                  <select
                    name="tutor_tax"
                    value={formData.tutor_tax}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="">Default Tutor Tax (no tax)</option>
                    {/* TODO: Fetch from API */}
                  </select>
                  <p className="mt-1 text-xs text-neutral-500">
                    Leave blank to use Branch default, will be overridden by Tutor tax setup.
                  </p>
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-start">
                    <input
                      type="checkbox"
                      name="auto_invoice"
                      checked={formData.auto_invoice}
                      onChange={handleInputChange}
                      className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-neutral-300 rounded"
                    />
                    <div className="ml-3">
                      <label className="text-sm font-medium text-neutral-700">Auto Invoice</label>
                      <p className="text-xs text-neutral-500">
                        If checked, invoices and reports will be sent immediately after a lesson is marked complete. This overrides the lesson reports required setting.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Labels */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-primary-700">Labels</h3>
              <Link 
                to={`/jobs/${id}`}
                className="text-sm text-primary-600 hover:text-primary-700 underline"
              >
                Manage Labels
              </Link>
            </div>
            <div className="space-y-4">
              {service.labels && Array.isArray(service.labels) && service.labels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {service.labels.map((label, idx) => {
                    const labelName = typeof label === 'string' ? label : (label.name || label.machine_name || JSON.stringify(label));
                    const labelId = typeof label === 'object' ? label.id : null;
                    return (
                      <Badge key={idx} variant="label" labelName={labelName}>
                        {labelName}
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-neutral-600">No labels assigned. Use the Actions menu on the job detail page to add labels.</p>
              )}
            </div>
          </Card>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Link to={`/jobs/${id}`}>
              <Button type="button" variant="secondary" size="md">
                Cancel
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}














