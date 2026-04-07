import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

function AddClientPageContent() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    first_name: '',
    last_name: '',
    email: '',
    mobile: '',
    phone: '',
    street: '',
    town: '',
    state: '',
    country: '',
    postcode: '',
    timezone: '',
    status: 'live',
    calendar_colour: 'ForestGreen',
    receive_sms: false,
    received_notifications: ['invoice_reminders', 'invoices', 'apt_reminders', 'pfi_reminders', 'credit-requests', 'low_balance_reminders', 'broadcasts'],
    auto_charge: false,
    is_taxable: true,
    photo: null,
    localOnly: false // Create locally without TutorCruncher sync (for testing)
  });

  const [expandedSections, setExpandedSections] = useState({
    address: false,
    extra: false,
    accounting: false
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        const parsedUserData = JSON.parse(userData);
        if (parsedUserData) {
          setUser(parsedUserData);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleNotificationChange = (notification) => {
    setFormData(prev => ({
      ...prev,
      received_notifications: prev.received_notifications.includes(notification)
        ? prev.received_notifications.filter(n => n !== notification)
        : [...prev.received_notifications, notification]
    }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(prev => ({ ...prev, photo: file }));
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formDataToSend = new FormData();
      
      Object.keys(formData).forEach(key => {
        if (key !== 'photo' && formData[key] !== null && formData[key] !== '') {
          if (Array.isArray(formData[key])) {
            formDataToSend.append(key, JSON.stringify(formData[key]));
          } else if (key === 'localOnly') {
            // Always include localOnly flag (true/false)
            formDataToSend.append(key, formData[key] ? 'true' : 'false');
          } else {
            formDataToSend.append(key, formData[key]);
          }
        }
      });
      
      // Always include localOnly flag even if false
      if (!formData.localOnly) {
        formDataToSend.append('localOnly', 'false');
      }

      if (formData.photo) {
        formDataToSend.append('photo', formData.photo);
      }

      const response = await fetch('/api/entity-lists/clients', {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create client');
      }

      if (data.client && data.client.client_id) {
        navigate(`/clients/${data.client.client_id}`);
      } else {
        navigate('/clients');
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };


  return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="bg-white border-b border-neutral-200 shadow-sm mb-6">
          <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">Add Client</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Basic Information */}
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Basic Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
                <select
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                >
                  <option value="">-----</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Ms">Ms</option>
                  <option value="Miss">Miss</option>
                  <option value="Dr">Dr</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">First Name</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Photo</label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    name="photo"
                    onChange={handleFileChange}
                    accept="image/*"
                    className="text-sm text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand-navy hover:file:bg-brand-purple hover:file:text-white"
                  />
                  {formData.photo && (
                    <span className="text-sm text-neutral-600">{formData.photo.name}</span>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="The user's email address"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  Your client will receive their invoices, lesson reports and any other correspondence from your company if you enter their email address here.
                </p>
                <a href="#" className="text-xs text-brand-purple hover:underline mt-1 block">Want to add a second email address?</a>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                >
                  <option value="prospect">Prospect</option>
                  <option value="live">Live</option>
                  <option value="dormant">Dormant</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Affects whether a Client can be assigned to Jobs and get a welcome email.
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="localOnly"
                    checked={formData.localOnly}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-brand-purple border-neutral-300 rounded focus:ring-brand-purple"
                  />
                  <span className="text-sm font-medium text-neutral-700">
                    Create locally only (skip TutorCruncher sync)
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-neutral-500">
                  Check this to create the client directly in the local database without syncing to TutorCruncher. Useful for testing workflows like credit requests, invoices, and payment orders.
                </p>
              </div>
            </div>
          </div>

          {/* Address, Contact Details & More */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => toggleSection('address')}
              className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <span className="font-medium text-neutral-900">Address, Contact Details & More</span>
              <span className="text-neutral-500">{expandedSections.address ? '▼' : '▶'}</span>
            </button>
            
            {expandedSections.address && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Street Address</label>
                    <textarea
                      name="street"
                      value={formData.street}
                      onChange={handleInputChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Zipcode/Postcode</label>
                    <input
                      type="text"
                      name="postcode"
                      value={formData.postcode}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Town</label>
                    <input
                      type="text"
                      name="town"
                      value={formData.town}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Country</label>
                    <select
                      name="country"
                      value={formData.country}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">----------</option>
                      <option value="United States">United States</option>
                      <option value="United Kingdom">United Kingdom</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Timezone</label>
                    <input
                      type="text"
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleInputChange}
                      placeholder="New York"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">If blank defaults to the Branch's timezone.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Mobile</label>
                    <input
                      type="tel"
                      name="mobile"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Telephone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="receive_sms"
                        checked={formData.receive_sms}
                        onChange={handleInputChange}
                        className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                      />
                      <span className="text-sm font-medium text-neutral-700">Receive SMSs</span>
                    </label>
                    <p className="mt-1 text-xs text-neutral-500 ml-6">
                      If checked and the user has a mobile number, they will receive SMSs sent to them from the company.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Calendar Colour <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        name="calendar_colour"
                        value={formData.calendar_colour}
                        onChange={handleInputChange}
                        required
                        className="h-10 w-20 border border-neutral-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        name="calendar_colour"
                        value={formData.calendar_colour}
                        onChange={handleInputChange}
                        required
                        className="flex-1 px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Received notifications</label>
                    <div className="space-y-2">
                      {[
                        { key: 'broadcasts', label: 'Broadcasts' },
                        { key: 'apt_reminders', label: 'Lesson reminders' },
                        { key: 'low_balance_reminders', label: 'Low balance reminders' },
                        { key: 'invoice_reminders', label: 'Invoice reminders' },
                        { key: 'pfi_reminders', label: 'Credit Request reminders' },
                        { key: 'invoice_payment_requests', label: 'Invoice payment requests' },
                        { key: 'pfi_payment_requests', label: 'Credit Request payment requests' },
                        { key: 'lesson_scheduled', label: 'Lesson scheduled' }
                      ].map(notification => (
                        <label key={notification.key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.received_notifications.includes(notification.key)}
                            onChange={() => handleNotificationChange(notification.key)}
                            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                          />
                          <span className="text-sm text-neutral-700">{notification.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Extra Fields */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => toggleSection('extra')}
              className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <span className="font-medium text-neutral-900">Extra Fields</span>
              <span className="text-neutral-500">{expandedSections.extra ? '▼' : '▶'}</span>
            </button>
            {expandedSections.extra && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">-----</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Clients</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Date of birth</label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Clients</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Additional Information</label>
                    <textarea
                      name="additional_information"
                      value={formData.additional_information}
                      onChange={handleInputChange}
                      rows={6}
                      placeholder="Add a description explaining your needs from the company."
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Clients</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Off-Season Address</label>
                    <input
                      type="text"
                      name="off_season_address"
                      value={formData.off_season_address}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors, Clients</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Cancellation Policy</label>
                    <input
                      type="text"
                      name="cancellation_policy"
                      value={formData.cancellation_policy}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Service Agreement</label>
                    <input
                      type="text"
                      name="service_agreement"
                      value={formData.service_agreement}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Photo Release</label>
                    <input
                      type="text"
                      name="photo_release"
                      value={formData.photo_release}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Client Notes</label>
                    <textarea
                      name="client_notes"
                      value={formData.client_notes}
                      onChange={handleInputChange}
                      rows={6}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Event Name</label>
                    <input
                      type="text"
                      name="event_name"
                      value={formData.event_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Program Interest</label>
                    <input
                      type="text"
                      name="program_interest"
                      value={formData.program_interest}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Format Interest</label>
                    <input
                      type="text"
                      name="format_interest"
                      value={formData.format_interest}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Campaign</label>
                    <input
                      type="text"
                      name="campaign"
                      value={formData.campaign}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Referral</label>
                    <input
                      type="text"
                      name="referral"
                      value={formData.referral}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Tutor Ref</label>
                    <input
                      type="text"
                      name="tutor_ref"
                      value={formData.tutor_ref}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-neutral-700 mb-3 mt-4">UTM Fields</h3>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">utm_source</label>
                    <input
                      type="text"
                      name="utm_source"
                      value={formData.utm_source}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Booking Form</label>
                    <input
                      type="text"
                      name="booking_form"
                      value={formData.booking_form}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">utm_medium</label>
                    <input
                      type="text"
                      name="utm_medium"
                      value={formData.utm_medium}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">utm_campaign</label>
                    <input
                      type="text"
                      name="utm_campaign"
                      value={formData.utm_campaign}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">utm_content</label>
                    <input
                      type="text"
                      name="utm_content"
                      value={formData.utm_content}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">utm_term</label>
                    <input
                      type="text"
                      name="utm_term"
                      value={formData.utm_term}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accounting & Client Manager */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => toggleSection('accounting')}
              className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900">Accounting & Client Manager</span>
                <span className="text-xs text-neutral-500">These fields are only editable by Administrators.</span>
              </div>
              <span className="text-neutral-500">{expandedSections.accounting ? '▼' : '▶'}</span>
            </button>
            {expandedSections.accounting && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="is_taxable"
                        checked={formData.is_taxable}
                        onChange={handleInputChange}
                        className="mt-1 rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                      />
                      <div>
                        <span className="text-sm font-medium text-neutral-700">Taxable</span>
                        <p className="mt-1 text-xs text-neutral-500">
                          Whether or not tax should be paid on payments from this Client.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Client Manager</label>
                    <select
                      name="client_manager"
                      value={formData.client_manager}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">Select Client Manager</option>
                      {/* TODO: Populate from API */}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Attach Invoice and Credit Request PDFs to Payment request emails</label>
                    <select
                      name="attach_pdfs_to_payment_emails"
                      value={formData.attach_pdfs_to_payment_emails}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="follow_branch">Follow the Branch setting</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Auto charge override</label>
                    <select
                      name="auto_charge_override"
                      value={formData.auto_charge_override}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="follow_branch">Follow the Branch setting</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Allows you to override the Branch default 'Auto charge' setting.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Invoice Grouping</label>
                    <select
                      name="invoice_grouping"
                      value={formData.invoice_grouping}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="follow_branch">Follow the Branch setting</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="biweekly">Biweekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      Choose how Invoices are grouped for this Client. Changing the Invoice grouping will delete any existing draft Invoices for this Client. When you regenerate Invoices, the new grouping will be applied.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => navigate('/clients')}
              className="px-6 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
  );
}

export default function AddClientPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData && userData !== "undefined") {
      try {
        const parsedUserData = JSON.parse(userData);
        if (parsedUserData) {
          setUser(parsedUserData);
        }
      } catch (error) {
        console.error("Error parsing user data:", error);
      }
    }
  }, []);

  return (
    <RoleProvider user={user}>
      <BranchProvider user={user}>
        <AddClientPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
