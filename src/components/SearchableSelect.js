import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

/**
 * Reusable searchable select component for filters
 * Supports lazy loading and search functionality
 */
export default function SearchableSelect({
  label,
  placeholder = "Search...",
  value,
  onChange,
  searchFunction,
  getDisplayValue = (item) => item.name || item.label || String(item),
  getItemValue = (item) => item.id || item.value || String(item),
  emptyLabel = "All",
  emptyValue = "",
  minSearchLength = 2,
  debounceMs = 300,
  className = "",
  showClearButton = true,
  disabled = false
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle search with debouncing
  const performSearch = useCallback(async (query) => {
    if (!query || query.length < minSearchLength) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchFunction(query);
      setSearchResults(Array.isArray(results) ? results : []);
      setHasSearched(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchFunction, minSearchLength]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length >= minSearchLength) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, debounceMs);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch, debounceMs, minSearchLength]);

  // Handle selection
  const handleSelect = (item) => {
    const itemValue = getItemValue(item);
    setSelectedItem(item);
    onChange(itemValue);
    setIsOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setHighlightedIndex(-1);
  };

  // Update selected item when value prop changes
  useEffect(() => {
    if (!value || value === emptyValue) {
      setSelectedItem(null);
    } else if (selectedItem && getItemValue(selectedItem) !== value) {
      // Value changed externally, clear selection
      setSelectedItem(null);
    }
  }, [value, emptyValue, selectedItem, getItemValue]);

  // Handle clear
  const handleClear = (e) => {
    e.stopPropagation();
    setSelectedItem(null);
    onChange(emptyValue);
    setSearchQuery("");
    setSearchResults([]);
    setIsOpen(false);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (!isOpen && (e.key === 'Enter' || e.key === 'ArrowDown')) {
      setIsOpen(true);
      inputRef.current?.focus();
      return;
    }

    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < searchResults.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && searchResults[highlightedIndex]) {
          handleSelect(searchResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSearchQuery("");
        setSearchResults([]);
        setHighlightedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Get display text
  const displayText = selectedItem 
    ? getDisplayValue(selectedItem)
    : emptyLabel;

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <label className="block text-sm font-medium text-neutral-700 mb-2">
        {label}
      </label>
      <div className="relative">
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`
            w-full px-3 py-2 border border-neutral-300 rounded-lg 
            focus-within:ring-2 focus-within:ring-brand-purple focus-within:border-brand-purple 
            text-sm cursor-pointer
            ${disabled ? 'bg-neutral-100 cursor-not-allowed' : 'bg-white'}
            flex items-center justify-between
          `}
        >
          <span className={selectedItem ? 'text-neutral-900' : 'text-neutral-500'}>
            {displayText}
          </span>
          <div className="flex items-center gap-1">
            {showClearButton && value && value !== emptyValue && (
              <button
                onClick={handleClear}
                className="p-1 hover:bg-neutral-100 rounded"
                type="button"
              >
                <XMarkIcon className="h-4 w-4 text-neutral-400" />
              </button>
            )}
            <MagnifyingGlassIcon className="h-4 w-4 text-neutral-400" />
          </div>
        </div>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-lg shadow-lg">
            <div className="p-2 border-b border-neutral-200">
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                placeholder={placeholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-2 py-1 text-sm border border-neutral-300 rounded focus:ring-2 focus:ring-brand-purple focus:border-brand-purple"
                autoFocus
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto">
              {isSearching && (
                <div className="px-3 py-2 text-xs text-neutral-500 text-center">
                  Searching...
                </div>
              )}
              
              {!isSearching && searchQuery.length < minSearchLength && (
                <div className="px-3 py-2 text-xs text-neutral-500 text-center">
                  Type at least {minSearchLength} characters to search
                </div>
              )}
              
              {!isSearching && searchQuery.length >= minSearchLength && searchResults.length === 0 && hasSearched && (
                <div className="px-3 py-2 text-xs text-neutral-500 text-center">
                  No results found
                </div>
              )}
              
              {!isSearching && searchResults.length > 0 && (
                <>
                  {emptyValue !== null && (
                    <div
                      onClick={() => handleSelect({ id: emptyValue, name: emptyLabel })}
                      className={`px-3 py-2 cursor-pointer border-b border-neutral-100 ${
                        highlightedIndex === -1 
                          ? 'bg-brand-purple/10 border-brand-purple/20' 
                          : 'hover:bg-neutral-50'
                      }`}
                      onMouseEnter={() => setHighlightedIndex(-1)}
                    >
                      <div className="text-sm font-medium text-neutral-900">{emptyLabel}</div>
                    </div>
                  )}
                  {searchResults.map((item, index) => {
                    const itemValue = getItemValue(item);
                    const isSelected = value === itemValue;
                    return (
                      <div
                        key={itemValue}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={`px-3 py-2 cursor-pointer border-b border-neutral-100 last:border-b-0 ${
                          highlightedIndex === index || isSelected
                            ? 'bg-brand-purple/10 border-brand-purple/20' 
                            : 'hover:bg-neutral-50'
                        }`}
                      >
                        <div className="text-sm font-medium text-neutral-900">
                          {getDisplayValue(item)}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}











