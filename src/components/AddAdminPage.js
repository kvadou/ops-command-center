import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

function AddAdminPageContent() {
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
    photo: null,
    default_client_view: '',
    client_manager: false,
    safeguarding_manager: false,
    received_notifications: ['broadcasts', 'client_enquiry_and_booking_notifications', 'daily_update_notifications', 'lesson_reminders', 'weekly_update_notifications', 'user_data_deletion_requests'],
    // Permissions
    owner: false,
    change_branch: false,
    view_operations: false,
    edit_operations: false,
    export_operations: false,
    view_accounting: false,
    edit_accounting: false,
    export_accounting: false,
    view_analytics: false,
    edit_branch_settings: false,
    import: false,
    edit_company_settings: false,
    use_api: false
  });

  const [expandedSections, setExpandedSections] = useState({
    address: false
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
    setError(null);

    // Validation
    if (!formData.last_name) {
      setError('Last name is required');
      return;
    }
    if (!formData.default_client_view) {
      setError('Default Client View is required');
      return;
    }

    setLoading(true);

    try {
      const submitData = new FormData();
      
      // Add all form fields
      Object.keys(formData).forEach(key => {
        if (key === 'photo') {
          if (formData.photo) {
            submitData.append('photo', formData.photo);
          }
        } else if (key === 'received_notifications') {
          submitData.append('received_notifications', JSON.stringify(formData.received_notifications));
        } else if (typeof formData[key] === 'boolean') {
          submitData.append(key, formData[key] ? 'true' : 'false');
        } else if (formData[key] !== null && formData[key] !== undefined && formData[key] !== '') {
          submitData.append(key, formData[key]);
        }
      });

      const response = await fetch('/api/entity-lists/admins', {
        method: 'POST',
        credentials: 'include',
        body: submitData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create administrator');
      }

      if (data.success) {
        navigate(`/admins/${data.admin.id}`);
      } else {
        throw new Error(data.error || 'Failed to create administrator');
      }
    } catch (err) {
      console.error('Error creating administrator:', err);
      setError(err.message || 'Failed to create administrator. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const notificationOptions = [
    { value: 'job_application_notifications', label: 'Job Application Notifications' },
    { value: 'broadcasts', label: 'Broadcasts' },
    { value: 'client_auto_charge_notifications', label: 'Client Auto Charge Notifications' },
    { value: 'client_enquiry_and_booking_notifications', label: 'Client Enquiry and Booking Notifications' },
    { value: 'daily_update_notifications', label: 'Daily Update Notifications' },
    { value: 'lesson_reminders', label: 'Lesson Reminders' },
    { value: 'subscription_update_notifications', label: 'Subscription Update Notifications' },
    { value: 'weekly_update_notifications', label: 'Weekly Update Notifications' },
    { value: 'user_data_deletion_requests', label: 'User Data Deletion Requests' },
    { value: 'emails_about_lesson_bookings', label: 'Emails about Lesson bookings' }
  ];

  const permissionOptions = [
    { 
      key: 'owner', 
      label: 'Owner', 
      description: 'An Owner can access everything and has all permissions.' 
    },
    { 
      key: 'change_branch', 
      label: 'Change Branch', 
      description: 'This will allow an Admin to switch between Branches.' 
    },
    { 
      key: 'view_operations', 
      label: 'View Operations', 
      description: 'This permission is for viewing the Dashboard, People, Activity and Communications. This includes Roles, Jobs, Lesson and Ad Hoc Charges. It doesn\'t allow editing of them.' 
    },
    { 
      key: 'edit_operations', 
      label: 'Edit Operations', 
      description: 'The same as \'View Operations\', but the Admin will be able to edit items as well as view them.' 
    },
    { 
      key: 'export_operations', 
      label: 'Export Operations', 
      description: 'This permission allows an Admin to export data related to Operations including People and Activity. This includes items such as Roles, Jobs, and Lessons, etc. The \'View Operations\' permission is required to enable this.' 
    },
    { 
      key: 'view_accounting', 
      label: 'View Accounting', 
      description: 'With this permission, an Admin can view Account Balances, Invoices, Payment Orders and other information relating to Accounting.' 
    },
    { 
      key: 'edit_accounting', 
      label: 'Edit Accounting', 
      description: 'The same as \'View Accounting\', but admins can send and edit Invoices, Adjust Client Balances and Take Payments.' 
    },
    { 
      key: 'export_accounting', 
      label: 'Export Accounting', 
      description: 'This permission allows an Admin to export data related to Accounting. This includes items such as Invoices, Credit Requests and Payment Orders, etc. The \'View Accounting\' permission is required to enable this.' 
    },
    { 
      key: 'view_analytics', 
      label: 'View Analytics', 
      description: 'An Admin can access the Analytics section to review Income Reports and more.' 
    },
    { 
      key: 'edit_branch_settings', 
      label: 'Edit Branch Settings', 
      description: 'This allows the Admin to edit settings that relate to the Branch, such as Branch Credentials, Accounting Details and details displayed on PDF documents.' 
    },
    { 
      key: 'import', 
      label: 'Import', 
      description: 'This permission will allow an admin to import users to the system.' 
    },
    { 
      key: 'edit_company_settings', 
      label: 'Edit Company Settings', 
      description: 'This allows an Admin to edit settings that relate to the Company, such as Labels and Tax Setups.' 
    },
    { 
      key: 'use_api', 
      label: 'Use and configure the API', 
      description: 'This permission will allow your other admins to access the API and its settings.' 
    }
  ];

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="max-w-7xl mx-auto w-full">
            <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-6 mb-6">
              <h1 className="text-2xl font-bold text-neutral-900 mb-6">Add Administrator</h1>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      First Name
                    </label>
                    <input
                      type="text"
                      name="first_name"
                      value={formData.first_name}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Photo
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    {formData.photo && (
                      <p className="mt-1 text-sm text-neutral-500">{formData.photo.name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
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
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                    <p className="mt-1 text-xs text-neutral-500">The user's email address.</p>
                  </div>
                </div>

                {/* Address, Contact Details & More - Collapsible */}
                <div className="border border-neutral-200 rounded-md">
                  <button
                    type="button"
                    onClick={() => toggleSection('address')}
                    className="w-full flex items-center justify-between p-4 bg-neutral-50 rounded-md hover:bg-neutral-100 transition-colors"
                  >
                    <span className="font-medium text-neutral-900">Address, Contact Details & More</span>
                    {expandedSections.address ? (
                      <ChevronUpIcon className="h-5 w-5 text-neutral-500" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-neutral-500" />
                    )}
                  </button>

                  {expandedSections.address && (
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Street Address
                          </label>
                          <input
                            type="text"
                            name="street"
                            value={formData.street}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Zipcode/Postcode
                          </label>
                          <input
                            type="text"
                            name="postcode"
                            value={formData.postcode}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Town
                          </label>
                          <input
                            type="text"
                            name="town"
                            value={formData.town}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Country
                          </label>
                          <select
                            name="country"
                            value={formData.country}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          >
                            <option value="">Select Country</option>
                            <option value="US">United States</option>
                            <option value="GB">United Kingdom</option>
                            <option value="CA">Canada</option>
                            <option value="AU">Australia</option>
                            {/* Add more countries as needed */}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Mobile
                          </label>
                          <input
                            type="tel"
                            name="mobile"
                            value={formData.mobile}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-neutral-700 mb-2">
                            Telephone
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Other Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Timezone
                    </label>
                    <select
                      name="timezone"
                      value={formData.timezone}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">Select Timezone</option>
                      <option value="America/New_York">New York</option>
                      <option value="America/Los_Angeles">Los Angeles</option>
                      <option value="America/Chicago">Chicago</option>
                      <option value="America/Denver">Denver</option>
                      <option value="Europe/London">London</option>
                      {/* Add more timezones as needed */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">If blank defaults to the Branch's timezone.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Default Client View <span className="text-red-500">*</span>
                    </label>
                    <select
                      name="default_client_view"
                      value={formData.default_client_view}
                      onChange={handleInputChange}
                      required
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    >
                      <option value="">Select Client View</option>
                      <option value="client_pipeline">Client Pipeline</option>
                      <option value="client_list">Client List</option>
                      {/* Add more options as needed */}
                    </select>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="client_manager"
                      checked={formData.client_manager}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                    />
                    <label className="ml-2 block text-sm text-neutral-700">
                      Client Manager
                    </label>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="safeguarding_manager"
                      checked={formData.safeguarding_manager}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                    />
                    <label className="ml-2 block text-sm text-neutral-700">
                      Safeguarding/Wellbeing Concerns Manager
                    </label>
                  </div>
                </div>

                {/* Received Notifications */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-3">
                    Received notifications
                  </label>
                  <div className="space-y-2">
                    {notificationOptions.map((option) => (
                      <div key={option.value} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.received_notifications.includes(option.value)}
                          onChange={() => handleNotificationChange(option.value)}
                          className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                        />
                        <label className="ml-2 block text-sm text-neutral-700">
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Permissions */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-3">
                    Permissions
                  </label>
                  <div className="space-y-4">
                    {permissionOptions.map((permission) => (
                      <div key={permission.key} className="flex items-start">
                        <input
                          type="checkbox"
                          name={permission.key}
                          checked={formData[permission.key]}
                          onChange={handleInputChange}
                          className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded mt-1"
                        />
                        <div className="ml-3">
                          <label className="block text-sm font-medium text-neutral-700">
                            {permission.label}
                          </label>
                          <p className="text-xs text-neutral-500 mt-1">{permission.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end space-x-4 pt-6 border-t border-neutral-200">
                  <button
                    type="button"
                    onClick={() => navigate('/admins')}
                    className="px-4 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-brand-purple text-white rounded-md text-sm font-medium hover:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating...' : 'Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}

export default function AddAdminPage() {
  return <AddAdminPageContent />;
}
