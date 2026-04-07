// utils/locationParser.js
/**
 * Utility functions to parse location information from Meta ad campaign/ad set names
 * 
 * Campaign naming convention examples:
 * - "PH | PRS | Location Targeting | Brooklyn | Consolidated Lead Campaign | July 17th"
 * - "PH | PRS | Location Targeting | SF | Consolidated Lead Campaign | November 4th"
 * - "PH | PRS | Open Targeting | Online | USA | Consolidated Lead Campaign | July 17th"
 * - "PH | PRS | Location Targeting | NY | Consolidated Lead Campaign | July 17th"
 * - "PH | PRS | Location Targeting | LA | Consolidated Lead Campaign | November 4th"
 */

/**
 * Parse location from campaign or ad set name
 * @param {string} name - Campaign or ad set name
 * @returns {string|null} - Parsed location (e.g., "NY", "Online", "LA", "SF", "Park Slope Club") or the raw location segment if not recognized
 */
function parseLocationFromName(name) {
  if (!name || typeof name !== 'string') {
    return null;
  }

  // Normalize the name
  const normalized = name.trim();

  // Pattern 1: "Location Targeting | [LOCATION] | ..."
  // Pattern 2: "Open Targeting | [LOCATION] | ..."
  const locationPattern = /(?:Location Targeting|Open Targeting)\s*\|\s*([^|]+?)(?:\s*\||$)/i;
  const match = normalized.match(locationPattern);

  if (match && match[1]) {
    let location = match[1].trim();
    const originalLocation = location; // Keep original for fallback
    
    // Normalize location names
    // Brooklyn -> Park Slope Club (as per user request)
    if (location.toLowerCase() === 'brooklyn') {
      location = 'Park Slope Club';
    }
    // Standardize other common variations
    else if (location.toLowerCase() === 'ny' || location.toLowerCase() === 'new york') {
      location = 'NY';
    }
    else if (location.toLowerCase() === 'la' || location.toLowerCase() === 'los angeles') {
      location = 'LA';
    }
    else if (location.toLowerCase() === 'sf' || location.toLowerCase() === 'san francisco') {
      location = 'SF';
    }
    else if (location.toLowerCase() === 'online' || location.toLowerCase() === 'usa') {
      location = 'Online';
    }
    else if (location.toLowerCase() === 'ues' || location.toLowerCase() === 'upper east side') {
      location = 'UES';
    }
    // If we found a location segment but it doesn't match known patterns,
    // return the original location segment so user can see what needs to be fixed
    else {
      // Return the raw location segment - this allows user to see exactly what the ad set calls it
      return originalLocation;
    }
    
    return location;
  }

  // Fallback: Try to find common location keywords anywhere in the name
  const locationKeywords = {
    'brooklyn': 'Park Slope Club',
    'park slope': 'Park Slope Club',
    'ny': 'NY',
    'new york': 'NY',
    'la': 'LA',
    'los angeles': 'LA',
    'sf': 'SF',
    'san francisco': 'SF',
    'online': 'Online',
    'usa': 'Online',
    'ues': 'UES',
    'upper east side': 'UES'
  };

  const lowerName = normalized.toLowerCase();
  for (const [keyword, location] of Object.entries(locationKeywords)) {
    if (lowerName.includes(keyword)) {
      return location;
    }
  }

  // If we can't parse a location, try to extract a meaningful segment
  // Look for patterns like "| [something] |" and return the first non-standard segment
  const segments = normalized.split('|').map(s => s.trim()).filter(s => s.length > 0);
  
  // Skip known prefixes like "PH", "PRS", "Location Targeting", "Open Targeting"
  const knownPrefixes = ['ph', 'prs', 'location targeting', 'open targeting', 'consolidated lead campaign'];
  
  for (const segment of segments) {
    const lowerSegment = segment.toLowerCase();
    // If this segment isn't a known prefix and looks like it could be a location
    if (!knownPrefixes.some(prefix => lowerSegment.includes(prefix)) && 
        segment.length < 50) { // Reasonable length for a location name
      return segment; // Return the raw segment so user can see what needs to be standardized
    }
  }

  // Last resort: return null (will show as "Unknown" in UI)
  return null;
}

/**
 * Get standardized location list
 * @returns {Array<string>} - List of all possible locations
 */
function getStandardLocations() {
  return ['NY', 'Online', 'LA', 'SF', 'Park Slope Club', 'UES'];
}

module.exports = {
  parseLocationFromName,
  getStandardLocations
};

