/**
 * useClientConversionUI Hook
 * Manages UI state (tabs, highlights, active items)
 * Extracted from ClientConversionTracker.js for better maintainability
 */

import { useState } from 'react';

const STORAGE_KEY = 'client-conversion-tracker-active-tab';
const TAB_EXPIRY_HOURS = 24; // Reset to pipeline after 24 hours

const loadPersistedTab = () => {
  try {
    // Check URL params for navigation reset (e.g., ?reset=pipeline)
    const urlParams = new URLSearchParams(window.location.search);
    const resetTab = urlParams.get('reset');
    if (resetTab === 'pipeline' || resetTab === 'prospects') {
      return 'prospects';
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const { tab, timestamp } = JSON.parse(stored);
      const now = Date.now();
      const expiryTime = TAB_EXPIRY_HOURS * 60 * 60 * 1000; // Convert hours to milliseconds

      // Check if stored tab is still valid (not expired)
      if (now - timestamp < expiryTime) {
        // Don't restore analytics tab — it's a standalone page now
        if (tab === 'analytics') return 'prospects';
        return tab === 'pipeline' ? 'prospects' : tab;
      } else {
        // Tab expired, clear it
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error('Error loading persisted tab:', error);
  }
  return 'prospects'; // Default tab
};

const saveTab = (tab) => {
  // Don't persist analytics tab — it's accessed via standalone sidebar route
  if (tab === 'analytics') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tab,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Error saving tab:', error);
  }
};

export function useClientConversionUI() {
  const [activeTab, setActiveTab] = useState(() => loadPersistedTab());
  const [activeId, setActiveId] = useState(null);
  const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);
  const [highlightedTutorIndex, setHighlightedTutorIndex] = useState(-1);

  // Persist tab selection with timestamp
  const changeTab = (tab) => {
    setActiveTab(tab);
    saveTab(tab);
  };

  return {
    // Tab state
    activeTab,
    setActiveTab: changeTab,

    // Active/highlighted items
    activeId,
    setActiveId,
    highlightedClientIndex,
    setHighlightedClientIndex,
    highlightedTutorIndex,
    setHighlightedTutorIndex,
  };
}
