import React, { useState, useEffect, useRef } from 'react';
import { RoleProvider, useRole } from '../contexts/RoleContext';
import { BranchProvider, useBranch } from '../contexts/BranchContext';
import { MapPinIcon } from '@heroicons/react/24/outline';

function MapsPageContent() {
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState([]); // Keep for display count
  const [mapType, setMapType] = useState('roadmap'); // 'roadmap' or 'satellite'
  const mapRef = useRef(null);
  const googleMapRef = useRef(null);
  const markersRef = useRef([]);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  const [locations, setLocations] = useState([]);
  const [geocodedLocations, setGeocodedLocations] = useState([]);
  const [geocodingProgress, setGeocodingProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filter state - all unchecked by default
  const [filters, setFilters] = useState({
    roleTypes: {
      tutors: false,
      clients: false,
      students: false,
      affiliates: false
    },
    onlyActiveUsers: false,
    onlyLiveClientsApprovedTutors: false,
    address: '',
    radius: ''
  });

  // Load Google Maps API
  useEffect(() => {
    if (window.google && window.google.maps) {
      setIsGoogleMapsLoaded(true);
      return;
    }

    const script = document.createElement('script');
    // Vite uses import.meta.env - check both VITE_ and REACT_APP_ prefixes
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY 
      || import.meta.env.REACT_APP_GOOGLE_MAPS_API_KEY 
      || 'YOUR_GOOGLE_MAPS_API_KEY';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleMapsLoaded(true);
    script.onerror = () => {
      console.error('Failed to load Google Maps API');
      setIsGoogleMapsLoaded(false);
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup script if component unmounts
      const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
      if (existingScript) {
        document.head.removeChild(existingScript);
      }
    };
  }, []);

  // Initialize map when Google Maps is loaded
  useEffect(() => {
    if (!isGoogleMapsLoaded || !mapRef.current || map) return;
    
    // Wait for Google Maps to be fully available
    if (!window.google || !window.google.maps || !window.google.maps.Map) {
      // Check again after a short delay
      const checkInterval = setInterval(() => {
        if (window.google && window.google.maps && window.google.maps.Map) {
          clearInterval(checkInterval);
          initializeMap();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!window.google?.maps?.Map) {
          console.error('Google Maps API failed to load');
        }
      }, 10000);
      
      return () => clearInterval(checkInterval);
    }
    
    initializeMap();
    
    function initializeMap() {
      try {
        const newMap = new window.google.maps.Map(mapRef.current, {
          center: { lat: 40.7128, lng: -74.0060 }, // Default to NYC
          zoom: 3,
          mapTypeId: mapType === 'satellite' ? 'satellite' : 'roadmap',
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true
        });

        setMap(newMap);
        googleMapRef.current = newMap;
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
  }, [isGoogleMapsLoaded, mapType, map]);

  // Fetch locations from API
  useEffect(() => {
    fetchLocations();
  }, []);

  // Geocode addresses when locations are loaded (only for addresses without cached lat/lng)
  useEffect(() => {
    if (!isGoogleMapsLoaded || !locations.length || geocodedLocations.length > 0) return;

    const geocodeLocations = async () => {
      const geocoder = new window.google.maps.Geocoder();
      const geocoded = [];
      const toGeocode = [];
      let processed = 0;
      const total = locations.length;

      // First, add locations that already have lat/lng (cached)
      locations.forEach(loc => {
        if (loc.lat && loc.lng) {
          geocoded.push({
            ...loc,
            lat: parseFloat(loc.lat),
            lng: parseFloat(loc.lng)
          });
          processed++;
        } else if (loc.address && loc.address.trim() !== '') {
          toGeocode.push(loc);
        } else {
          processed++; // Skip locations without addresses
        }
      });

      setGeocodingProgress(Math.round((processed / total) * 100));

      // Only geocode addresses that don't have cached coordinates
      for (const loc of toGeocode) {
        try {
          await new Promise((resolve) => {
            geocoder.geocode({ address: loc.address }, async (results, status) => {
              if (status === 'OK' && results[0]) {
                const lat = results[0].geometry.location.lat();
                const lng = results[0].geometry.location.lng();
                geocoded.push({
                  ...loc,
                  lat: lat,
                  lng: lng
                });
                
                // Save to database for future use (fire and forget - don't wait for response)
                fetch('/api/geocode/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    entityType: loc.entityType,
                    entityId: loc.id,
                    lat: lat,
                    lng: lng,
                    address: loc.address
                  })
                }).catch(err => {
                  // Silently fail - coordinates will be cached next time
                  console.debug('Failed to save coordinates (non-critical):', err);
                });
              }
              processed++;
              setGeocodingProgress(Math.round((processed / total) * 100));
              // Add a small delay to respect rate limits
              setTimeout(resolve, 100);
            });
          });
        } catch (error) {
          console.error(`Error geocoding ${loc.address}:`, error);
          processed++;
          setGeocodingProgress(Math.round((processed / total) * 100));
        }
      }

      setGeocodedLocations(geocoded);
      setGeocodingProgress(100);
    };

    geocodeLocations();
  }, [isGoogleMapsLoaded, locations]);

  // Update markers when geocoded locations or filters change
  useEffect(() => {
    if (!map || !geocodedLocations.length) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];
    const newMarkers = [];

    // Filter locations based on role types and activity filters
    const filteredLocations = geocodedLocations.filter(loc => {
      // Role type filter
      if (!filters.roleTypes[loc.entityType]) return false;

      // Activity filters
      if (filters.onlyActiveUsers && loc.status !== 'active' && loc.status !== 'live' && loc.status !== 'approved') {
        return false;
      }

      if (filters.onlyLiveClientsApprovedTutors) {
        if (loc.entityType === 'clients' && loc.status !== 'live') return false;
        if (loc.entityType === 'tutors' && loc.status !== 'approved') return false;
      }

      return true;
    });

    // Create markers for filtered locations
    filteredLocations.forEach(loc => {
      if (loc.lat && loc.lng) {
        const marker = new window.google.maps.Marker({
          position: { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) },
          map: map,
          title: loc.name,
          icon: {
            url: getMarkerIcon(loc.entityType),
            scaledSize: new window.google.maps.Size(32, 32)
          }
        });

        // Add info window
        const infoWindow = new window.google.maps.InfoWindow({
          content: `
            <div style="padding: 8px; min-width: 200px;">
              <h3 style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">${loc.name}</h3>
              <p style="margin: 4px 0; font-size: 12px; color: #666;">${loc.entityType.charAt(0).toUpperCase() + loc.entityType.slice(1)}</p>
              ${loc.address ? `<p style="margin: 4px 0; font-size: 12px; color: #666;">${loc.address}</p>` : ''}
              ${loc.email ? `<p style="margin: 4px 0; font-size: 12px; color: #666;">${loc.email}</p>` : ''}
            </div>
          `
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        newMarkers.push(marker);
      }
    });

    markersRef.current = newMarkers;
    setMarkers(newMarkers);

    // Fit map to show all markers, or default to NYC if no markers
    if (newMarkers.length > 0) {
      const bounds = new window.google.maps.LatLngBounds();
      newMarkers.forEach(marker => bounds.extend(marker.getPosition()));
      map.fitBounds(bounds);
    } else {
      // Default view when no markers are shown
      map.setCenter({ lat: 40.7128, lng: -74.0060 }); // NYC
      map.setZoom(3);
    }
    
    // Return cleanup function
    return () => {
      newMarkers.forEach(marker => marker.setMap(null));
    };
  }, [map, geocodedLocations, filters]);

  const fetchLocations = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/entity-lists/map-locations');
      const data = await response.json();
      setLocations(data.locations || []);
    } catch (error) {
      console.error('Error fetching locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMarkerIcon = (entityType) => {
    const colors = {
      tutors: '#6A469D', // brand-purple
      clients: '#FACC29', // brand-yellow
      students: '#50C8DF', // brand-light
      affiliates: '#F79A30' // brand-orange
    };
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C10.477 0 6 4.477 6 10c0 5.523 10 22 10 22s10-16.477 10-22C26 4.477 21.523 0 16 0z" fill="${colors[entityType] || '#666'}"/>
        <circle cx="16" cy="10" r="4" fill="white"/>
      </svg>
    `)}`;
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleRoleTypeChange = (roleType) => {
    setFilters(prev => ({
      ...prev,
      roleTypes: {
        ...prev.roleTypes,
        [roleType]: !prev.roleTypes[roleType]
      }
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      roleTypes: {
        tutors: false,
        clients: false,
        students: false,
        affiliates: false
      },
      onlyActiveUsers: false,
      onlyLiveClientsApprovedTutors: false,
      address: '',
      radius: ''
    });
  };

  const handleFilter = () => {
    // Filters are applied automatically via useEffect
    // This function can be used for address/radius filtering if needed
    if (filters.address) {
      // Geocode address and filter by radius
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: filters.address }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const center = results[0].geometry.location;
          map.setCenter(center);
          if (filters.radius) {
            const radiusInMeters = parseFloat(filters.radius) * 1609.34; // Convert miles to meters
            const circle = new window.google.maps.Circle({
              center: center,
              radius: radiusInMeters,
              map: map,
              fillColor: '#FF0000',
              fillOpacity: 0.1,
              strokeColor: '#FF0000',
              strokeOpacity: 0.5,
              strokeWeight: 2
            });
            map.fitBounds(circle.getBounds());
          } else {
            map.setZoom(12);
          }
        }
      });
    }
  };

  return (
    <RoleProvider>
      <BranchProvider>
          <div className="max-w-full mx-auto w-full h-full flex flex-col">
            <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 lg:px-8 py-4">
              <h1 className="text-2xl font-bold text-neutral-900">User Map</h1>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Map Container */}
              <div className="flex-1 relative">
                {!isGoogleMapsLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 z-10">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-purple mx-auto mb-4"></div>
                      <p className="text-neutral-600">Loading map...</p>
                      <p className="text-xs text-neutral-500 mt-2">If this takes too long, check Google Maps API key restrictions</p>
                    </div>
                  </div>
                )}
                {isGoogleMapsLoaded && !window.google?.maps && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-10">
                    <div className="text-center p-4 bg-white rounded-lg shadow-md border border-red-200">
                      <p className="text-red-800 font-semibold mb-2">Google Maps API Error</p>
                      <p className="text-sm text-red-600 mb-4">
                        Please add <code className="bg-red-100 px-2 py-1 rounded">http://localhost:3001/*</code> to your Google Maps API key restrictions.
                      </p>
                      <p className="text-xs text-neutral-600">
                        Go to Google Cloud Console → APIs & Services → Credentials → Your API Key → Application restrictions → HTTP referrers
                      </p>
                    </div>
                  </div>
                )}
                <div ref={mapRef} className="w-full h-full" style={{ minHeight: '600px' }} />
                
                {/* Map Type Toggle */}
                {isGoogleMapsLoaded && (
                  <div className="absolute top-4 left-4 bg-white rounded-md shadow-md flex">
                    <button
                      onClick={() => setMapType('roadmap')}
                      className={`px-4 py-2 text-sm font-medium rounded-l-md ${
                        mapType === 'roadmap' 
                          ? 'bg-brand-purple text-white' 
                          : 'bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Map
                    </button>
                    <button
                      onClick={() => setMapType('satellite')}
                      className={`px-4 py-2 text-sm font-medium rounded-r-md ${
                        mapType === 'satellite' 
                          ? 'bg-brand-purple text-white' 
                          : 'bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      Satellite
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Sidebar */}
              <div className="w-80 bg-white border-l border-neutral-200 overflow-y-auto p-4">
                <h2 className="text-lg font-semibold text-neutral-900 mb-4">Filters</h2>

                {/* Role Types */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-neutral-700 mb-3">Role Types</h3>
                  <div className="space-y-2">
                    {['tutors', 'clients', 'students', 'affiliates'].map(roleType => (
                      <label key={roleType} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={filters.roleTypes[roleType] || false}
                          onChange={() => handleRoleTypeChange(roleType)}
                          className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                        />
                        <span className="ml-2 text-sm text-neutral-700 capitalize">{roleType}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Activity Filters */}
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-neutral-700 mb-3">Activity</h3>
                  <div className="space-y-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.onlyActiveUsers}
                        onChange={(e) => handleFilterChange('onlyActiveUsers', e.target.checked)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                      />
                      <span className="ml-2 text-sm text-neutral-700">Only show active users</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.onlyLiveClientsApprovedTutors}
                        onChange={(e) => handleFilterChange('onlyLiveClientsApprovedTutors', e.target.checked)}
                        className="h-4 w-4 text-brand-purple focus:ring-brand-purple border-neutral-300 rounded"
                      />
                      <span className="ml-2 text-sm text-neutral-700">Only show live clients and approved tutors</span>
                    </label>
                  </div>
                </div>

                {/* Address Input */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Address
                  </label>
                  <input
                    type="text"
                    value={filters.address}
                    onChange={(e) => handleFilterChange('address', e.target.value)}
                    placeholder="Enter address"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                  />
                </div>

                {/* Radius Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Radius
                  </label>
                  <select
                    value={filters.radius}
                    onChange={(e) => handleFilterChange('radius', e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-purple text-sm"
                  >
                    <option value="">Select radius</option>
                    <option value="5">5 miles</option>
                    <option value="10">10 miles</option>
                    <option value="25">25 miles</option>
                    <option value="50">50 miles</option>
                    <option value="100">100 miles</option>
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleClearFilters}
                    className="flex-1 px-4 py-2 border border-neutral-300 rounded-md text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleFilter}
                    className="flex-1 px-4 py-2 bg-brand-purple text-white rounded-md text-sm font-medium hover:bg-brand-navy"
                  >
                    Filter
                  </button>
                </div>

                {/* Stats */}
                <div className="mt-6 pt-6 border-t border-neutral-200">
                  {loading || geocodingProgress < 100 ? (
                    <div>
                      <p className="text-sm text-neutral-600 mb-2">
                        {geocodingProgress > 0 ? `Geocoding addresses... ${geocodingProgress}%` : 'Loading locations...'}
                      </p>
                      <div className="w-full bg-neutral-200 rounded-full h-2">
                        <div 
                          className="bg-brand-purple h-2 rounded-full transition-all duration-300"
                          style={{ width: `${geocodingProgress}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-600">
                      Showing <span className="font-semibold">{markersRef.current.length}</span> locations
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
      </BranchProvider>
    </RoleProvider>
  );
}

export default function MapsPage() {
  return <MapsPageContent />;
}
