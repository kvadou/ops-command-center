/**
 * useBookingFormUI Hook
 * Manages UI state (modals, tabs, loading states)
 * Extracted from BookingFormAnalytics.js for better maintainability
 */

import { useState } from 'react';

export function useBookingFormUI() {
  // Tab state with localStorage persistence
  const [activeTab, setActiveTab] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const savedTab = localStorage.getItem('marketingAnalyticsActiveTab');
        return savedTab !== null ? parseInt(savedTab, 10) : 0;
      }
    } catch (e) {
      console.warn('Error accessing localStorage:', e);
    }
    return 0;
  });

  // Primary modals
  const [modalOpen, setModalOpen] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSubmissions, setModalSubmissions] = useState([]);
  const [modalDetailView, setModalDetailView] = useState(false);
  const [modalDetailData, setModalDetailData] = useState(null);
  const [modalDetailLoading, setModalDetailLoading] = useState(false);

  // Enterprise modals
  const [enterpriseModalOpen, setEnterpriseModalOpen] = useState(false);
  const [enterpriseModalData, setEnterpriseModalData] = useState(null);

  // Revenue modals (Meta)
  const [realizedRevenueModalOpen, setRealizedRevenueModalOpen] = useState(false);
  const [realizedRevenueDetailView, setRealizedRevenueDetailView] = useState(false);
  const [realizedRevenueDetailData, setRealizedRevenueDetailData] = useState(null);

  // Revenue modals (Google)
  const [googleRealizedRevenueModalOpen, setGoogleRealizedRevenueModalOpen] = useState(false);
  const [googleRealizedRevenueDetailView, setGoogleRealizedRevenueDetailView] = useState(false);
  const [googleRealizedRevenueDetailData, setGoogleRealizedRevenueDetailData] = useState(null);

  // False starts modals
  const [falseStartsModalOpen, setFalseStartsModalOpen] = useState(false);
  const [falseStartsDetailView, setFalseStartsDetailView] = useState(false);
  const [falseStartsDetailData, setFalseStartsDetailData] = useState(null);

  // AROAS modal
  const [aroasModalOpen, setAroasModalOpen] = useState(false);
  const [aroasModalLoading, setAroasModalLoading] = useState(false);
  const [aroasModalData, setAroasModalData] = useState(null);

  // Full client conversion modals
  const [fullClientConversionModalOpen, setFullClientConversionModalOpen] = useState(false);
  const [fullClientConversionSource, setFullClientConversionSource] = useState(null);

  // Dialogs
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [backfillDialogOpen, setBackfillDialogOpen] = useState(false);
  const [metricDetailDialogOpen, setMetricDetailDialogOpen] = useState(false);

  // Loading states
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [historicalMonthlyLoading, setHistoricalMonthlyLoading] = useState(false);
  const [realizedRevenueLoading, setRealizedRevenueLoading] = useState(false);
  const [realizedRevenueDetailLoading, setRealizedRevenueDetailLoading] = useState(false);
  const [googleRealizedRevenueLoading, setGoogleRealizedRevenueLoading] = useState(false);
  const [googleRealizedRevenueDetailLoading, setGoogleRealizedRevenueDetailLoading] = useState(false);
  const [falseStartsLoading, setFalseStartsLoading] = useState(false);
  const [falseStartsDetailLoading, setFalseStartsDetailLoading] = useState(false);
  const [fullClientConversionLoading, setFullClientConversionLoading] = useState(false);

  // Tab change handler with localStorage
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('marketingAnalyticsActiveTab', newValue.toString());
      }
    } catch (e) {
      console.warn('Error saving to localStorage:', e);
    }
  };

  return {
    // Tab state
    activeTab, setActiveTab, handleTabChange,

    // Primary modals
    modalOpen, setModalOpen,
    modalData, setModalData,
    modalLoading, setModalLoading,
    modalSubmissions, setModalSubmissions,
    modalDetailView, setModalDetailView,
    modalDetailData, setModalDetailData,
    modalDetailLoading, setModalDetailLoading,

    // Enterprise modals
    enterpriseModalOpen, setEnterpriseModalOpen,
    enterpriseModalData, setEnterpriseModalData,

    // Revenue modals (Meta)
    realizedRevenueModalOpen, setRealizedRevenueModalOpen,
    realizedRevenueDetailView, setRealizedRevenueDetailView,
    realizedRevenueDetailData, setRealizedRevenueDetailData,

    // Revenue modals (Google)
    googleRealizedRevenueModalOpen, setGoogleRealizedRevenueModalOpen,
    googleRealizedRevenueDetailView, setGoogleRealizedRevenueDetailView,
    googleRealizedRevenueDetailData, setGoogleRealizedRevenueDetailData,

    // False starts modals
    falseStartsModalOpen, setFalseStartsModalOpen,
    falseStartsDetailView, setFalseStartsDetailView,
    falseStartsDetailData, setFalseStartsDetailData,

    // AROAS modal
    aroasModalOpen, setAroasModalOpen,
    aroasModalLoading, setAroasModalLoading,
    aroasModalData, setAroasModalData,

    // Full client conversion modals
    fullClientConversionModalOpen, setFullClientConversionModalOpen,
    fullClientConversionSource, setFullClientConversionSource,

    // Dialogs
    deleteConfirmOpen, setDeleteConfirmOpen,
    deleting, setDeleting,
    backfillDialogOpen, setBackfillDialogOpen,
    metricDetailDialogOpen, setMetricDetailDialogOpen,

    // Loading states
    trendsLoading, setTrendsLoading,
    historicalMonthlyLoading, setHistoricalMonthlyLoading,
    realizedRevenueLoading, setRealizedRevenueLoading,
    realizedRevenueDetailLoading, setRealizedRevenueDetailLoading,
    googleRealizedRevenueLoading, setGoogleRealizedRevenueLoading,
    googleRealizedRevenueDetailLoading, setGoogleRealizedRevenueDetailLoading,
    falseStartsLoading, setFalseStartsLoading,
    falseStartsDetailLoading, setFalseStartsDetailLoading,
    fullClientConversionLoading, setFullClientConversionLoading,
  };
}
