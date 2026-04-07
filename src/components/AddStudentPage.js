import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

function AddStudentPageContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);
  
  // Get client_id from URL params if present
  const clientIdFromUrl = searchParams.get('client_id');
  
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
    client_id: clientIdFromUrl || '', // Pre-fill from URL if provided
    calendar_colour: '#D2B48C',
    receive_sms: true,
    received_notifications: ['broadcasts', 'apt_reminders', 'lesson_scheduled'],
    academic_year: '',
    photo: null,
    // Extra Fields
    date_of_birth: '',
    gender: '',
    current_school: '',
    status: '',
    class_section: '',
    parent_name: '',
    localOnly: false // Create locally without TutorCruncher sync (for testing)
  });

  const [expandedSections, setExpandedSections] = useState({
    address: true,
    extra: false
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

    // Fetch clients for dropdown
    fetch('/api/entity-lists/clients?limit=1000')
      .then(res => res.json())
      .then(data => {
        if (data.clients) {
          setClients(data.clients);
        }
        setLoadingClients(false);
      })
      .catch(err => {
        console.error('Error fetching clients:', err);
        setLoadingClients(false);
      });
  }, []);

  // Update client_id when URL param changes
  useEffect(() => {
    if (clientIdFromUrl) {
      setFormData(prev => ({
        ...prev,
        client_id: clientIdFromUrl
      }));
    }
  }, [clientIdFromUrl]);

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

    if (!formData.client_id) {
      setError('Client is required');
      setLoading(false);
      return;
    }

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

      const response = await fetch('/api/entity-lists/students', {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create student');
      }

      if (data.student && data.student.recipient_id) {
        navigate(`/students/${data.student.recipient_id}`);
      } else {
        navigate('/students');
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">Add Student</h1>
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
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Personal Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Title</label>
                <select
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                >
                  <option value="">---------</option>
                  <option value="Mr">Mr</option>
                  <option value="Mrs">Mrs</option>
                  <option value="Ms">Ms</option>
                  <option value="Miss">Miss</option>
                  <option value="Dr">Dr</option>
                </select>
              </div>

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
                  placeholder="The user's email address"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Client <span className="text-red-500">*</span>
                </label>
                <select
                  name="client_id"
                  value={formData.client_id}
                  onChange={handleInputChange}
                  required
                  disabled={loadingClients}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple disabled:bg-neutral-100"
                >
                  <option value="">Select Client</option>
                  {clients.map(client => (
                    <option key={client.client_id} value={client.client_id}>
                      {client.first_name} {client.last_name} {client.email ? `(${client.email})` : ''}
                    </option>
                  ))}
                </select>
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
                  Check this to create the student directly in the local database without syncing to TutorCruncher. Useful for testing workflows like credit requests, invoices, and payment orders.
                </p>
              </div>
            </div>
          </div>

          {/* Address & Contact Details */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => toggleSection('address')}
              className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <span className="font-medium text-neutral-900">Address & Contact Details {expandedSections.address ? '▼' : '▶'}</span>
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
                      <option value="">---------</option>
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
                </div>
              </div>
            )}
          </div>

          {/* Other Details */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-4">Other Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Academic year</label>
                <select
                  name="academic_year"
                  value={formData.academic_year}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                >
                  <option value="">---------</option>
                  <option value="Pre-K">Pre-K</option>
                  <option value="Kindergarten">Kindergarten</option>
                  <option value="1st Grade">1st Grade</option>
                  <option value="2nd Grade">2nd Grade</option>
                  <option value="3rd Grade">3rd Grade</option>
                  <option value="4th Grade">4th Grade</option>
                  <option value="5th Grade">5th Grade</option>
                  <option value="6th Grade">6th Grade</option>
                  <option value="7th Grade">7th Grade</option>
                  <option value="8th Grade">8th Grade</option>
                  <option value="9th Grade">9th Grade</option>
                  <option value="10th Grade">10th Grade</option>
                  <option value="11th Grade">11th Grade</option>
                  <option value="12th Grade">12th Grade</option>
                </select>
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
                <label className="block text-sm font-medium text-neutral-700 mb-2">Received notifications</label>
                <div className="space-y-2">
                  {[
                    { key: 'broadcasts', label: 'Broadcasts' },
                    { key: 'apt_reminders', label: 'Lesson Reminders' },
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
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Date of birth</label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Students</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Gender</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">----------</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Students</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Current School</label>
                    <input
                      type="text"
                      name="current_school"
                      value={formData.current_school}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Status</label>
                    <input
                      type="text"
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      placeholder="Active or Inactive"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      Active: Currently Enrolled in a Job Inactive: Not Currently Enrolled in a Job. Viewable by: Administrators
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Class Section</label>
                    <input
                      type="text"
                      name="class_section"
                      value={formData.class_section}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      <strong>**For Schools Only**</strong>. Viewable by: Administrators
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Parent Name</label>
                    <input
                      type="text"
                      name="parent_name"
                      value={formData.parent_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">
                      <strong>**For Schools Only**</strong>. Viewable by: Administrators
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
              onClick={() => navigate('/students')}
              className="px-6 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.client_id}
              className="px-6 py-2 bg-brand-purple text-white rounded-md hover:bg-brand-navy transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
  );
}

export default function AddStudentPage() {
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
        <AddStudentPageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
