/**
 * useBookingFormData Hook
 * Manages main data state for Marketing Analytics (formerly BookingFormAnalytics)
 * Extracted from BookingFormAnalytics.js for better maintainability
 */

import { useState } from 'react';

export function useBookingFormData() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [revenueTrendData, setRevenueTrendData] = useState([]);
  const [roasSummary, setRoasSummary] = useState(null);
  const [enterpriseData, setEnterpriseData] = useState(null);
  const [enterpriseTrendsData, setEnterpriseTrendsData] = useState(null);
  const [historicalMonthlyData, setHistoricalMonthlyData] = useState([]);

  // Google Analytics data
  const [googleData, setGoogleData] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState(null);
  const [googleSyncLoading, setGoogleSyncLoading] = useState(false);

  // Klaviyo Analytics data
  const [klaviyoData, setKlaviyoData] = useState(null);
  const [klaviyoLoading, setKlaviyoLoading] = useState(false);
  const [klaviyoError, setKlaviyoError] = useState(null);
  const [klaviyoSyncLoading, setKlaviyoSyncLoading] = useState(false);
  const [klaviyoSyncStatus, setKlaviyoSyncStatus] = useState(null);

  return {
    // Meta/main data
    loading, setLoading,
    data, setData,
    error, setError,
    revenueTrendData, setRevenueTrendData,
    roasSummary, setRoasSummary,
    enterpriseData, setEnterpriseData,
    enterpriseTrendsData, setEnterpriseTrendsData,
    historicalMonthlyData, setHistoricalMonthlyData,

    // Google Analytics
    googleData, setGoogleData,
    googleLoading, setGoogleLoading,
    googleError, setGoogleError,
    googleSyncLoading, setGoogleSyncLoading,

    // Klaviyo Analytics
    klaviyoData, setKlaviyoData,
    klaviyoLoading, setKlaviyoLoading,
    klaviyoError, setKlaviyoError,
    klaviyoSyncLoading, setKlaviyoSyncLoading,
    klaviyoSyncStatus, setKlaviyoSyncStatus,
  };
}
