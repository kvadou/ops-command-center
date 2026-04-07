/**
 * useClientConversionForms Hook
 * Manages form state for bundles and manual intake
 * Extracted from ClientConversionTracker.js for better maintainability
 */

import { useState } from 'react';

const createDefaultManualForm = () => ({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  mobile: '',
  market: '',
  lead_type: '',
  pipeline_stage_id: '',
  timezone: 'America/New_York',
  calendar_colour: '#6a469d',
  intake_notes: '',
  intake_source: '',
  follow_up_due_at: '',
  address: {
    street: '',
    city: '',
    state: '',
    country: 'United States',
    postcode: '',
  },
  labels: [],
  extra_attrs: {},
  received_notifications: ['invoice_reminders', 'lesson_scheduled', 'pfi_reminders'],
});

const createDefaultBundleForm = () => ({
  clientSearch: '',
  selectedClient: null,
  bundleName: '',
  numberOfLessons: '',
  lessonRate: '',
  discountPercentage: '',
  paymentMethod: 'auto_charge', // 'auto_charge', 'cash', 'send_request'
});

export function useClientConversionForms() {
  const [manualIntakeForm, setManualIntakeForm] = useState(createDefaultManualForm);
  const [bundleForm, setBundleForm] = useState(createDefaultBundleForm);
  const [isCreatingBundle, setIsCreatingBundle] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [editingData, setEditingData] = useState({});

  const resetManualIntakeForm = () => {
    setManualIntakeForm(createDefaultManualForm());
  };

  const resetBundleForm = () => {
    setBundleForm(createDefaultBundleForm());
    setIsCreatingBundle(false);
  };

  const updateManualFormField = (field, value) => {
    setManualIntakeForm(prev => ({ ...prev, [field]: value }));
  };

  const updateBundleFormField = (field, value) => {
    setBundleForm(prev => ({ ...prev, [field]: value }));
  };

  return {
    // Manual Intake Form
    manualIntakeForm,
    setManualIntakeForm,
    updateManualFormField,
    resetManualIntakeForm,

    // Bundle Form
    bundleForm,
    setBundleForm,
    updateBundleFormField,
    isCreatingBundle,
    setIsCreatingBundle,
    resetBundleForm,

    // Other form states
    newNote,
    setNewNote,
    editingData,
    setEditingData,
  };
}
