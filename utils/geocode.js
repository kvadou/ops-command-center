/**
 * Geocoding utility for converting addresses to latitude/longitude
 * Uses Google Geocoding API
 */

const axios = require('axios');
const { logger } = require('./logger');

/**
 * Geocode an address using Google Geocoding API
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lng: number} | null>} - Coordinates or null if geocoding fails
 */
async function geocodeAddress(address) {
  if (!address || address.trim() === '') {
    return null;
  }

  // Check for Google Maps API key (backend uses GOOGLE_MAPS_API_KEY, frontend uses REACT_APP_GOOGLE_MAPS_API_KEY)
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.REACT_APP_GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    logger.warn('Google Maps API key not found - skipping geocoding. Set GOOGLE_MAPS_API_KEY environment variable.');
    return null;
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address: address.trim(),
        key: apiKey
      },
      timeout: 5000 // 5 second timeout
    });

    if (response.data.status === 'OK' && response.data.results && response.data.results.length > 0) {
      const location = response.data.results[0].geometry.location;
      return {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lng)
      };
    } else {
      logger.warn(`Geocoding failed for address: ${address}. Status: ${response.data.status}`);
      return null;
    }
  } catch (error) {
    logger.error({ error: error.message }, `Error geocoding address "${address}":`);
    return null;
  }
}

/**
 * Build a full address string from components
 * @param {Object} addressComponents - Address components
 * @returns {string} - Full address string
 */
function buildAddressString(addressComponents) {
  const { street, town, state, postcode, country } = addressComponents;
  return [street, town, state, postcode, country]
    .filter(Boolean)
    .join(', ');
}

/**
 * Geocode an address from components
 * @param {Object} addressComponents - Address components (street, town, state, postcode, country)
 * @returns {Promise<{lat: number, lng: number} | null>} - Coordinates or null
 */
async function geocodeAddressFromComponents(addressComponents) {
  const address = buildAddressString(addressComponents);
  if (!address || address.trim() === '') {
    return null;
  }
  return geocodeAddress(address);
}

module.exports = {
  geocodeAddress,
  geocodeAddressFromComponents,
  buildAddressString
};

