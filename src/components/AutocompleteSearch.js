import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function AutocompleteSearch({
  value,
  onChange,
  onSearch,
  placeholder = "Search...",
  getSuggestions,
  getEntityLink,
  getEntityName,
  getEntitySubtitle,
  minChars = 2
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (value && value.length >= minChars) {
      setIsLoading(true);
      const fetchSuggestions = async () => {
        try {
          const results = await getSuggestions(value);
          setSuggestions(results || []);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        } catch (error) {
          console.error('Error fetching suggestions:', error);
          setSuggestions([]);
        } finally {
          setIsLoading(false);
        }
      };
      
      // Debounce the search
      const timeoutId = setTimeout(fetchSuggestions, 300);
      return () => clearTimeout(timeoutId);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [value, getSuggestions, minChars]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') {
        onSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        } else {
          onSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  };

  const handleSelect = (entity) => {
    const link = getEntityLink(entity);
    if (link) {
      navigate(link);
      setShowSuggestions(false);
      onChange('');
    }
  };

  const handleBlur = (e) => {
    // Delay hiding suggestions to allow click events to fire
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(e.relatedTarget)) {
        setShowSuggestions(false);
      }
    }, 200);
  };

  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  return (
    <div className="relative flex-1">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2 border border-neutral-300 rounded-md focus:ring-brand-purple focus:border-brand-purple"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-brand-purple"></div>
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {suggestions.map((entity, index) => {
            const name = getEntityName(entity);
            const subtitle = getEntitySubtitle ? getEntitySubtitle(entity) : null;
            const isSelected = index === selectedIndex;
            
            return (
              <div
                key={entity.contractor_id || entity.client_id || entity.recipient_id || entity.service_id || entity.appointment_id || index}
                onClick={() => handleSelect(entity)}
                className={`
                  px-4 py-3 cursor-pointer transition-colors
                  ${isSelected 
                    ? 'bg-brand-purple text-white' 
                    : 'hover:bg-neutral-50 text-neutral-900'
                  }
                `}
              >
                <div className="font-medium">{name}</div>
                {subtitle && (
                  <div className={`text-sm ${isSelected ? 'text-white opacity-90' : 'text-neutral-500'}`}>
                    {subtitle}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

