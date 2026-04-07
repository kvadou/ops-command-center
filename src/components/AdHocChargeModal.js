import React, { useState, useEffect } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useToast } from '../hooks/useToast';

export default function AdHocChargeModal({ 
  open, 
  onClose, 
  onSave, 
  charge = null, 
  defaultContractorId = null,
  defaultClientId = null 
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState([]);
  const [clients, setClients] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [services, setServices] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  
  const [formData, setFormData] = useState({
    category_id: '',
    description: '',
    date_occurred: new Date().toISOString().slice(0, 16),
    client_id: defaultClientId || '',
    charge_client: '',
    contractor_id: defaultContractorId || '',
    pay_contractor: '',
    affiliate_id: '',
    affiliate_commission_percentage: '',
    tax_setting: 'calculate_tax_on_amount_enter_gross_values',
    service_id: '',
    appointment_id: '',
    raise_invoice: false
  });

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchClients();
      fetchContractors();
      fetchServices();
      fetchAffiliates();
      
      if (charge) {
        setFormData({
          category_id: charge.category_id || '',
          description: charge.description || '',
          date_occurred: charge.date_occurred 
            ? new Date(charge.date_occurred).toISOString().slice(0, 16)
            : new Date().toISOString().slice(0, 16),
          client_id: charge.client_id || defaultClientId || '',
          charge_client: charge.net_gross || charge.charge_client || '',
          contractor_id: charge.contractor_id || defaultContractorId || '',
          pay_contractor: charge.pay_contractor || '',
          affiliate_id: charge.affiliate_id || '',
          affiliate_commission_percentage: charge.affiliate_commission_percentage || '',
          tax_setting: charge.tax_setting || 'calculate_tax_on_amount_enter_gross_values',
          service_id: charge.service_id || '',
          appointment_id: charge.appointment_id || '',
          raise_invoice: false
        });
      } else {
        setFormData({
          category_id: '',
          description: '',
          date_occurred: new Date().toISOString().slice(0, 16),
          client_id: defaultClientId || '',
          charge_client: '',
          contractor_id: defaultContractorId || '',
          pay_contractor: '',
          affiliate_id: '',
          affiliate_commission_percentage: '',
          tax_setting: 'calculate_tax_on_amount_enter_gross_values',
          service_id: '',
          appointment_id: '',
          raise_invoice: false
        });
      }
    }
  }, [open, charge, defaultContractorId, defaultClientId]);

  const fetchCategories = async () => {
    try {
      const response = await fetch('/api/adhoc-charges/categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await fetch('/api/entity-lists/clients?limit=1000');
      const data = await response.json();
      setClients(data.data || data.clients || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchContractors = async () => {
    try {
      const response = await fetch('/api/entity-lists/tutors?limit=1000');
      const data = await response.json();
      setContractors(data.data || data.tutors || []);
    } catch (error) {
      console.error('Error fetching contractors:', error);
    }
  };

  const fetchServices = async () => {
    try {
      const response = await fetch('/api/entity-lists/jobs?limit=1000');
      const data = await response.json();
      setServices(data.data || data.jobs || []);
    } catch (error) {
      console.error('Error fetching services:', error);
    }
  };

  const fetchAffiliates = async () => {
    try {
      const response = await fetch('/api/entity-lists/affiliates?limit=1000');
      const data = await response.json();
      setAffiliates(data.data || data.affiliates || []);
    } catch (error) {
      console.error('Error fetching affiliates:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        category_id: formData.category_id,
        description: formData.description,
        date_occurred: new Date(formData.date_occurred).toISOString(),
        tax_setting: formData.tax_setting,
        raise_invoice: formData.raise_invoice
      };

      if (formData.client_id) payload.client_id = formData.client_id;
      if (formData.charge_client) payload.charge_client = parseFloat(formData.charge_client);
      if (formData.contractor_id) payload.contractor_id = formData.contractor_id;
      if (formData.pay_contractor) payload.pay_contractor = parseFloat(formData.pay_contractor);
      if (formData.affiliate_id) payload.affiliate_id = formData.affiliate_id;
      if (formData.affiliate_commission_percentage) payload.affiliate_commission_percentage = parseFloat(formData.affiliate_commission_percentage);
      if (formData.service_id) payload.service_id = formData.service_id;
      if (formData.appointment_id) payload.appointment_id = formData.appointment_id;

      const url = charge 
        ? `/api/adhoc-charges/${charge.id}`
        : '/api/adhoc-charges';
      const method = charge ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save ad hoc charge');
      }

      const result = await response.json();
      onSave(result);
      onClose();
    } catch (error) {
      console.error('Error saving ad hoc charge:', error);
      toast.error(error.message || 'Failed to save ad hoc charge');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-3xl bg-white rounded-xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-neutral-200">
            <DialogTitle className="text-lg font-semibold text-neutral-900">
              {charge ? 'Edit Ad Hoc Charge' : 'Add Ad Hoc Charge'}
            </DialogTitle>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-500"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
            <div className="space-y-6">
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.category_id}
                  onChange={(e) => handleChange('category_id', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  The category of the Ad Hoc Charge.{' '}
                  <a href="#" className="text-brand-purple hover:underline">More info.</a>
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>

              {/* Date Occurred */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Date Occurred <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.date_occurred}
                  onChange={(e) => handleChange('date_occurred', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                />
              </div>

              {/* Client and Charge Client */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Client
                  </label>
                  <select
                    value={formData.client_id}
                    onChange={(e) => handleChange('client_id', e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  >
                    <option value="">Client</option>
                    {clients.map(client => (
                      <option key={client.client_id || client.id} value={client.client_id || client.id}>
                        {client.first_name && client.last_name 
                          ? `${client.first_name} ${client.last_name}`
                          : client.name || client.client_id || client.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Charge Client
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.charge_client}
                    onChange={(e) => handleChange('charge_client', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    The amount the Client will be charged
                  </p>
                </div>
              </div>

              {/* Tutor and Pay Tutor */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Tutor
                  </label>
                  <select
                    value={formData.contractor_id}
                    onChange={(e) => handleChange('contractor_id', e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  >
                    <option value="">Tutor</option>
                    {contractors.map(contractor => (
                      <option key={contractor.contractor_id || contractor.id} value={contractor.contractor_id || contractor.id}>
                        {contractor.first_name && contractor.last_name 
                          ? `${contractor.first_name} ${contractor.last_name}`
                          : contractor.name || contractor.contractor_id || contractor.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Pay Tutor
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.pay_contractor}
                    onChange={(e) => handleChange('pay_contractor', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    The amount the Tutor will be paid
                  </p>
                </div>
              </div>

              {/* Affiliate and Commission */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Affiliate
                  </label>
                  <select
                    value={formData.affiliate_id}
                    onChange={(e) => handleChange('affiliate_id', e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  >
                    <option value="">----------</option>
                    {affiliates.map(affiliate => (
                      <option key={affiliate.id} value={affiliate.id}>
                        {affiliate.name || affiliate.first_name && affiliate.last_name
                          ? `${affiliate.first_name} ${affiliate.last_name}`
                          : affiliate.email || affiliate.id}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Affiliate Commission Percentage
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.affiliate_commission_percentage}
                    onChange={(e) => handleChange('affiliate_commission_percentage', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                  />
                </div>
              </div>

              {/* Tax Setting */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Tax Setting <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.tax_setting}
                  onChange={(e) => handleChange('tax_setting', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="calculate_tax_on_amount_enter_gross_values">
                    Calculate tax on amount (enter GROSS values)
                  </option>
                  <option value="calculate_tax_on_amount_enter_net_values">
                    Calculate tax on amount (enter NET values)
                  </option>
                  <option value="do_not_calculate_tax">
                    Do not calculate tax
                  </option>
                </select>
                <p className="mt-1 text-xs text-neutral-500">
                  Whether tax on the Ad Hoc Charge should be calculated on the net or gross amount.{' '}
                  <a href="#" className="text-brand-purple hover:underline">More info.</a>
                </p>
              </div>

              {/* Related Job */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Related Job
                </label>
                <select
                  value={formData.service_id}
                  onChange={(e) => handleChange('service_id', e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                >
                  <option value="">Select job</option>
                  {services.map(service => (
                    <option key={service.service_id || service.id} value={service.service_id || service.id}>
                      {service.name || service.service_id || service.id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Raise Invoice Checkbox */}
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="raise_invoice"
                  checked={formData.raise_invoice}
                  onChange={(e) => handleChange('raise_invoice', e.target.checked)}
                  className="mt-1 h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                />
                <label htmlFor="raise_invoice" className="ml-2 text-sm text-neutral-700">
                  Raise an Invoice now
                </label>
              </div>
              <p className="text-xs text-neutral-500 -mt-4 ml-6">
                Generate and raise an invoice for this Ad Hoc Charge immediately
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-neutral-200">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-purple rounded-lg hover:bg-brand-navy focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-purple disabled:opacity-50"
              >
                {loading ? 'Saving...' : charge ? 'Update' : 'Add'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}


