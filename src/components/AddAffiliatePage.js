import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';

function AddAffiliatePageContent() {
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
    calendar_colour: '#FFA500',
    receive_sms: false,
    received_notifications: ['broadcasts'],
    photo: null,
    // Extra Fields
    gender: '',
    date_of_birth: '',
    // Accounting
    tax_setup: '',
    commission_percent: ''
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
          } else {
            formDataToSend.append(key, formData[key]);
          }
        }
      });

      if (formData.photo) {
        formDataToSend.append('photo', formData.photo);
      }

      const response = await fetch('/api/entity-lists/affiliates', {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create affiliate');
      }

      if (data.affiliate && data.affiliate.agent_id) {
        navigate(`/affiliates/${data.affiliate.agent_id}`);
      } else {
        navigate('/affiliates');
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
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">Add Affiliate</h1>
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
                  placeholder="The user's email address"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                />
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
                      {['broadcasts'].map(notification => (
                        <label key={notification} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.received_notifications.includes(notification)}
                            onChange={() => handleNotificationChange(notification)}
                            className="rounded border-neutral-300 text-brand-purple focus:ring-brand-purple"
                          />
                          <span className="text-sm text-neutral-700 capitalize">{notification.replace(/_/g, ' ')}</span>
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
                      <option value="">------</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Affiliates</p>
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
                    <p className="mt-1 text-xs text-neutral-500">Viewable by: Administrators, Affiliates</p>
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
                      {/* TODO: Populate from API */}
                    </select>
                    <p className="mt-1 text-xs text-neutral-500">
                      If you set this, tax will be added onto any Payment Orders the Affiliates receive.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">Commission %</label>
                    <input
                      type="number"
                      name="commission_percent"
                      value={formData.commission_percent}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-6 border-t border-neutral-200">
            <button
              type="button"
              onClick={() => navigate('/affiliates')}
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

export default function AddAffiliatePage() {
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
        <AddAffiliatePageContent />
      </BranchProvider>
    </RoleProvider>
  );
}
