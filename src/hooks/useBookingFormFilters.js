/**
 * useBookingFormFilters Hook
 * Manages filter and configuration state for Marketing Analytics
 * Extracted from BookingFormAnalytics.js for better maintainability
 */

import { useState } from 'react';

export function useBookingFormFilters() {
  // Date range filter
  const [dateRangeValue, setDateRangeValue] = useState(null);

  // Backfill date range
  const [backfillStartDate, setBackfillStartDate] = useState('');
  const [backfillEndDate, setBackfillEndDate] = useState('');

  // Metric detail filters
  const [metricDetailType, setMetricDetailType] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);

  // Configuration state
  const [ltvConfigOpen, setLtvConfigOpen] = useState(false);
  const [ltvMetric, setLtvMetric] = useState('average'); // 'average' or 'median'
  const [configTab, setConfigTab] = useState(0); // 0 = Metric Visibility, 1 = ROAS Config

  // Full client conversion data
  const [realizedRevenueData, setRealizedRevenueData] = useState(null);
  const [googleRealizedRevenueData, setGoogleRealizedRevenueData] = useState(null);
  const [falseStartsData, setFalseStartsData] = useState(null);
  const [fullClientConversionData, setFullClientConversionData] = useState(null);
  const [metaFullClientConversionData, setMetaFullClientConversionData] = useState(null);
  const [googleFullClientConversionData, setGoogleFullClientConversionData] = useState(null);
  const [klaviyoFullClientConversionData, setKlaviyoFullClientConversionData] = useState(null);

  return {
    // Date range
    dateRangeValue, setDateRangeValue,

    // Backfill
    backfillStartDate, setBackfillStartDate,
    backfillEndDate, setBackfillEndDate,

    // Metric detail
    metricDetailType, setMetricDetailType,
    selectedCampaign, setSelectedCampaign,

    // Configuration
    ltvConfigOpen, setLtvConfigOpen,
    ltvMetric, setLtvMetric,
    configTab, setConfigTab,

    // Conversion data
    realizedRevenueData, setRealizedRevenueData,
    googleRealizedRevenueData, setGoogleRealizedRevenueData,
    falseStartsData, setFalseStartsData,
    fullClientConversionData, setFullClientConversionData,
    metaFullClientConversionData, setMetaFullClientConversionData,
    googleFullClientConversionData, setGoogleFullClientConversionData,
    klaviyoFullClientConversionData, setKlaviyoFullClientConversionData,
  };
}
