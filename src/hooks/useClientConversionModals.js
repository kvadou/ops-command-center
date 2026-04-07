/**
 * useClientConversionModals Hook
 * Manages all modal and dropdown visibility state
 * Extracted from ClientConversionTracker.js for better maintainability
 */

import { useState } from 'react';

export function useClientConversionModals() {
  // Modal states
  const [showCreateBundleModal, setShowCreateBundleModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProspectModal, setShowProspectModal] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showManualIntakeModal, setShowManualIntakeModal] = useState(false);

  // Dropdown states
  const [showTutorDropdown, setShowTutorDropdown] = useState(null);
  const [showMarketDropdown, setShowMarketDropdown] = useState(null);
  const [showLeadTypeDropdown, setShowLeadTypeDropdown] = useState(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(null);

  // Selected items
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProspect, setSelectedProspect] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  // Helper functions
  const closeAllModals = () => {
    setShowCreateBundleModal(false);
    setShowNotesModal(false);
    setShowEditModal(false);
    setShowProspectModal(false);
    setShowSubmissionModal(false);
    setShowManualIntakeModal(false);
  };

  const closeAllDropdowns = () => {
    setShowTutorDropdown(null);
    setShowMarketDropdown(null);
    setShowLeadTypeDropdown(null);
    setShowStatusDropdown(null);
  };

  return {
    // Modal states
    showCreateBundleModal,
    setShowCreateBundleModal,
    showNotesModal,
    setShowNotesModal,
    showEditModal,
    setShowEditModal,
    showProspectModal,
    setShowProspectModal,
    showSubmissionModal,
    setShowSubmissionModal,
    showManualIntakeModal,
    setShowManualIntakeModal,

    // Dropdown states
    showTutorDropdown,
    setShowTutorDropdown,
    showMarketDropdown,
    setShowMarketDropdown,
    showLeadTypeDropdown,
    setShowLeadTypeDropdown,
    showStatusDropdown,
    setShowStatusDropdown,

    // Selected items
    selectedClient,
    setSelectedClient,
    selectedProspect,
    setSelectedProspect,
    selectedSubmission,
    setSelectedSubmission,

    // Helper functions
    closeAllModals,
    closeAllDropdowns,
  };
}
