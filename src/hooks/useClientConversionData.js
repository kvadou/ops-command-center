/**
 * useClientConversionData Hook
 * Manages main data state for Client Conversion Tracker
 * Extracted from ClientConversionTracker.js for better maintainability
 */

import { useState } from 'react';

export function useClientConversionData() {
  const [clients, setClients] = useState([]);
  const [archivedClients, setArchivedClients] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState([]);
  const [analytics, setAnalytics] = useState({
    leadType: [],
    market: [],
    weeklyStats: [],
    yearOverYear: []
  });

  return {
    // State
    clients,
    archivedClients,
    pipelineStages,
    loading,
    bundles,
    analytics,
    // Setters
    setClients,
    setArchivedClients,
    setPipelineStages,
    setLoading,
    setBundles,
    setAnalytics,
  };
}
