/**
 * useClientConversionSearch Hook
 * Manages search and filter state
 * Extracted from ClientConversionTracker.js for better maintainability
 */

import { useState } from 'react';

export function useClientConversionSearch() {
  const [tutorSearchResults, setTutorSearchResults] = useState([]);
  const [tutorSearchQuery, setTutorSearchQuery] = useState('');
  const [clientSearchResults, setClientSearchResults] = useState([]);
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  const clearTutorSearch = () => {
    setTutorSearchResults([]);
    setTutorSearchQuery('');
  };

  const clearClientSearch = () => {
    setClientSearchResults([]);
    setClientSearchQuery('');
  };

  return {
    // Tutor search
    tutorSearchResults,
    setTutorSearchResults,
    tutorSearchQuery,
    setTutorSearchQuery,
    clearTutorSearch,

    // Client search
    clientSearchResults,
    setClientSearchResults,
    clientSearchQuery,
    setClientSearchQuery,
    clearClientSearch,
  };
}
