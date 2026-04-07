import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

function AddTutorPageContent() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
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
    status: 'approved',
    default_rate: '',
    tier_rate: '',
    calendar_colour: '#757575',
    receive_service_notifications: true,
    receive_sms: false,
    received_notifications: ['available_job_notifications', 'broadcasts', 'apt_reminders', 'mark_lesson_complete_reminder', 'lesson_scheduled'],
    photo: null,
    date_of_birth: '',
    pronouns: '',
    bio: '',
    rating: 0,
    preferred_teaching_area: '',
    gender: '',
    background_check: false,
    background_check_date: '',
    recipient_email: '',
    chessable_classroom: '',
    tax_setup: '',
    clients_do_not_pay_tax: false,
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
      
      // Add all form fields
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

      const response = await fetch('/api/entity-lists/tutors', {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create tutor');
      }

      // Navigate to the new tutor's detail page
      if (data.tutor && data.tutor.contractor_id) {
        navigate(`/tutors/${data.tutor.contractor_id}`);
      } else {
        navigate('/tutors');
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">Add Tutor</h1>
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
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  required
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

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="The Tutor uses their email address to log in and to receive all correspondence from you."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
                <p className="mt-1 text-xs text-neutral-500">The Tutor uses their email address to log in and to receive all correspondence from you.</p>
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
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="dormant">Dormant</option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Approved tutors can work with clients and apply for new jobs. Pending tutors haven't gone through your recruitment process yet, whilst Rejected tutors didn't make the cut and Dormant tutors have simply gone cold.
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
                  Check this to create the tutor directly in the local database without syncing to TutorCruncher. Useful for testing workflows like credit requests, invoices, and payment orders.
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
                      {/* Add more countries as needed */}
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
                        { key: 'available_job_notifications', label: 'Available Job Notifications' },
                        { key: 'broadcasts', label: 'Broadcasts' },
                        { key: 'apt_reminders', label: 'Lesson Reminders' },
                        { key: 'mark_lesson_complete_reminder', label: 'Mark Lesson Complete/Write Report Reminder' },
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
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900">Extra Fields</span>
                <span className="text-xs text-neutral-500">There are some fields here which require your attention.</span>
              </div>
              <span className="text-neutral-500">{expandedSections.extra ? '▼' : '▶'}</span>
            </button>
            
            {expandedSections.extra && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Tier Rate <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      name="tier_rate"
                      value={formData.tier_rate}
                      onChange={handleInputChange}
                      step="0.01"
                      placeholder="0.00"
                      required
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
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
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Pronouns</label>
                    <input
                      type="text"
                      name="pronouns"
                      value={formData.pronouns}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Bio</label>
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleInputChange}
                      rows={6}
                      placeholder="Name: Education (College/Degree): Chess/Tutoring/Childcare Experience: Passion for Teaching at Chess at Three: Activities Outside of Chess:"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors, Clients</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Rating</label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, rating: star }))}
                          className="text-2xl focus:outline-none"
                        >
                          {star <= formData.rating ? '★' : '☆'}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Preferred Teaching Area</label>
                    <input
                      type="text"
                      name="preferred_teaching_area"
                      value={formData.preferred_teaching_area}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">-------</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Tutors</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="background_check"
                        checked={formData.background_check}
                        onChange={handleInputChange}
                        className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                      />
                      <span className="text-sm font-medium text-neutral-700">Background check</span>
                    </label>
                    <p className="mt-1 text-xs text-neutral-500 ml-6">Viewable by: Administrators, Tutors</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Background check Date</label>
                    <input
                      type="date"
                      name="background_check_date"
                      value={formData.background_check_date}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">recipientEmail</label>
                    <input
                      type="email"
                      name="recipient_email"
                      value={formData.recipient_email}
                      onChange={handleInputChange}
                      placeholder="wise.com email for payments"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">This is the email address associated with wise.com for payments. Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Chessable Classroom</label>
                    <input
                      type="text"
                      name="chessable_classroom"
                      value={formData.chessable_classroom}
                      onChange={handleInputChange}
                      placeholder="www.chessable.com/classroom/ChessatThree/FirstnameLastname"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Accounting */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => toggleSection('accounting')}
              className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-neutral-900">Accounting</span>
                <span className="text-xs text-neutral-500">These fields are only editable by Administrators.</span>
              </div>
              <span className="text-neutral-500">{expandedSections.accounting ? '▼' : '▶'}</span>
            </button>
            {expandedSections.accounting && (
              <div className="mt-4 space-y-4 p-4 bg-neutral-50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Tax Setup</label>
                    <select
                      name="tax_setup"
                      value={formData.tax_setup}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">----------</option>
                      {/* Add tax setup options as needed */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">Leave blank to use Branch default</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Default Rate</label>
                    <input
                      type="number"
                      name="default_rate"
                      value={formData.default_rate}
                      onChange={handleInputChange}
                      step="0.01"
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        name="clients_do_not_pay_tax"
                        checked={formData.clients_do_not_pay_tax}
                        onChange={handleInputChange}
                        className="mt-1 rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                      />
                      <div>
                        <span className="text-sm font-medium text-neutral-700">Clients do not pay tax</span>
                        <p className="mt-1 text-xs text-neutral-500">
                          For any Lessons or Ad Hoc Charges that this tutor is on, the client will not pay tax to the Branch. This will not work for lessons where there is more than one tutor. <strong>Please note, you will need to regenerate accounting for these changes to take effect.</strong>
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => navigate('/tutors')}
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

export default function AddTutorPage() {
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
        <AddTutorPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
