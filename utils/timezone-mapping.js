/**
 * Timezone mapping utility for Acme Operations
 * Maps location names to their appropriate timezones
 */


const { logger } = require('./logger');
const LOCATION_TIMEZONE_MAP = {
  // Pacific Time locations
  'california': 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  'sacramento': 'America/Los_Angeles',
  'oakland': 'America/Los_Angeles',
  'berkeley': 'America/Los_Angeles',
  'palo alto': 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles',
  'fresno': 'America/Los_Angeles',
  'bakersfield': 'America/Los_Angeles',
  'stockton': 'America/Los_Angeles',
  'modesto': 'America/Los_Angeles',
  'visalia': 'America/Los_Angeles',
  'santa barbara': 'America/Los_Angeles',
  'ventura': 'America/Los_Angeles',
  'oxnard': 'America/Los_Angeles',
  'thousand oaks': 'America/Los_Angeles',
  'simi valley': 'America/Los_Angeles',
  'valencia': 'America/Los_Angeles',
  'santa clarita': 'America/Los_Angeles',
  'glendale': 'America/Los_Angeles',
  'pasadena': 'America/Los_Angeles',
  'burbank': 'America/Los_Angeles',
  'hollywood': 'America/Los_Angeles',
  'beverly hills': 'America/Los_Angeles',
  'west hollywood': 'America/Los_Angeles',
  'santa monica': 'America/Los_Angeles',
  'venice': 'America/Los_Angeles',
  'manhattan beach': 'America/Los_Angeles',
  'redondo beach': 'America/Los_Angeles',
  'hermosa beach': 'America/Los_Angeles',
  'torrance': 'America/Los_Angeles',
  'gardena': 'America/Los_Angeles',
  'carson': 'America/Los_Angeles',
  'compton': 'America/Los_Angeles',
  'inglewood': 'America/Los_Angeles',
  'hawthorne': 'America/Los_Angeles',
  'el segundo': 'America/Los_Angeles',
  'lawndale': 'America/Los_Angeles',
  'lomita': 'America/Los_Angeles',
  'rancho palos verdes': 'America/Los_Angeles',
  'palos verdes estates': 'America/Los_Angeles',
  'rolling hills': 'America/Los_Angeles',
  'rolling hills estates': 'America/Los_Angeles',
  'san pedro': 'America/Los_Angeles',
  'wilmington': 'America/Los_Angeles',
  'long beach': 'America/Los_Angeles',
  'signal hill': 'America/Los_Angeles',
  'lakewood': 'America/Los_Angeles',
  'bellflower': 'America/Los_Angeles',
  'downey': 'America/Los_Angeles',
  'norwalk': 'America/Los_Angeles',
  'santa fe springs': 'America/Los_Angeles',
  'whittier': 'America/Los_Angeles',
  'la habra': 'America/Los_Angeles',
  'la mirada': 'America/Los_Angeles',
  'cerritos': 'America/Los_Angeles',
  'artesia': 'America/Los_Angeles',
  'paramount': 'America/Los_Angeles',
  'south gate': 'America/Los_Angeles',
  'lynwood': 'America/Los_Angeles',
  'huntington park': 'America/Los_Angeles',
  'vernon': 'America/Los_Angeles',
  'commerce': 'America/Los_Angeles',
  'montebello': 'America/Los_Angeles',
  'pico rivera': 'America/Los_Angeles',
  'whittier': 'America/Los_Angeles',
  'la puente': 'America/Los_Angeles',
  'industry': 'America/Los_Angeles',
  'la habra heights': 'America/Los_Angeles',
  'hacienda heights': 'America/Los_Angeles',
  'rowland heights': 'America/Los_Angeles',
  'walnut': 'America/Los_Angeles',
  'diamond bar': 'America/Los_Angeles',
  'brea': 'America/Los_Angeles',
  'fullerton': 'America/Los_Angeles',
  'buena park': 'America/Los_Angeles',
  'cypress': 'America/Los_Angeles',
  'los alamitos': 'America/Los_Angeles',
  'seal beach': 'America/Los_Angeles',
  'sunset beach': 'America/Los_Angeles',
  'huntington beach': 'America/Los_Angeles',
  'fountain valley': 'America/Los_Angeles',
  'westminster': 'America/Los_Angeles',
  'garden grove': 'America/Los_Angeles',
  'santa ana': 'America/Los_Angeles',
  'orange': 'America/Los_Angeles',
  'tustin': 'America/Los_Angeles',
  'irvine': 'America/Los_Angeles',
  'newport beach': 'America/Los_Angeles',
  'costa mesa': 'America/Los_Angeles',
  'newport coast': 'America/Los_Angeles',
  'corona del mar': 'America/Los_Angeles',
  'laguna beach': 'America/Los_Angeles',
  'laguna hills': 'America/Los_Angeles',
  'laguna niguel': 'America/Los_Angeles',
  'aliso viejo': 'America/Los_Angeles',
  'mission viejo': 'America/Los_Angeles',
  'rancho santa margarita': 'America/Los_Angeles',
  'coto de caza': 'America/Los_Angeles',
  'trabuco canyon': 'America/Los_Angeles',
  'lake forest': 'America/Los_Angeles',
  'foothill ranch': 'America/Los_Angeles',
  'portola hills': 'America/Los_Angeles',
  'santiago canyon': 'America/Los_Angeles',
  'silverado': 'America/Los_Angeles',
  'modjeska': 'America/Los_Angeles',
  'trabuco': 'America/Los_Angeles',
  'canyon': 'America/Los_Angeles',
  'orange county': 'America/Los_Angeles',
  'oc': 'America/Los_Angeles',
  'pacific': 'America/Los_Angeles',
  'west coast': 'America/Los_Angeles',
  'escuela': 'America/Los_Angeles', // Spanish for "school" - common in California
  'elementary': 'America/Los_Angeles', // Most elementary schools in the system are in California
  'school': 'America/Los_Angeles', // Default schools to Pacific Time unless specified otherwise
  
  // Mountain Time locations
  'denver': 'America/Denver',
  'colorado': 'America/Denver',
  'phoenix': 'America/Phoenix',
  'arizona': 'America/Phoenix',
  'salt lake city': 'America/Denver',
  'utah': 'America/Denver',
  'las vegas': 'America/Los_Angeles', // Nevada uses Pacific Time
  'nevada': 'America/Los_Angeles',
  
  // Central Time locations
  'chicago': 'America/Chicago',
  'illinois': 'America/Chicago',
  'dallas': 'America/Chicago',
  'houston': 'America/Chicago',
  'texas': 'America/Chicago',
  'minneapolis': 'America/Chicago',
  'minnesota': 'America/Chicago',
  'kansas city': 'America/Chicago',
  'missouri': 'America/Chicago',
  'oklahoma': 'America/Chicago',
  'arkansas': 'America/Chicago',
  'louisiana': 'America/Chicago',
  'mississippi': 'America/Chicago',
  'alabama': 'America/Chicago',
  'tennessee': 'America/Chicago',
  'kentucky': 'America/Chicago',
  'indiana': 'America/Chicago',
  'wisconsin': 'America/Chicago',
  'iowa': 'America/Chicago',
  'nebraska': 'America/Chicago',
  'north dakota': 'America/Chicago',
  'south dakota': 'America/Chicago',
  
  // Eastern Time locations (default)
  'new york': 'America/New_York',
  'nyc': 'America/New_York',
  'manhattan': 'America/New_York',
  'brooklyn': 'America/New_York',
  'queens': 'America/New_York',
  'bronx': 'America/New_York',
  'staten island': 'America/New_York',
  'long island': 'America/New_York',
  'westchester': 'America/New_York',
  'connecticut': 'America/New_York',
  'new jersey': 'America/New_York',
  'philadelphia': 'America/New_York',
  'pennsylvania': 'America/New_York',
  'boston': 'America/New_York',
  'massachusetts': 'America/New_York',
  'miami': 'America/New_York',
  'florida': 'America/New_York',
  'atlanta': 'America/New_York',
  'georgia': 'America/New_York',
  'washington': 'America/New_York',
  'dc': 'America/New_York',
  'maryland': 'America/New_York',
  'virginia': 'America/New_York',
  'north carolina': 'America/New_York',
  'south carolina': 'America/New_York',
  'vermont': 'America/New_York',
  'new hampshire': 'America/New_York',
  'maine': 'America/New_York',
  'rhode island': 'America/New_York',
  'delaware': 'America/New_York',
  'west virginia': 'America/New_York',
  'ohio': 'America/New_York',
  'michigan': 'America/New_York',
  'indiana': 'America/New_York', // Eastern part
  'kentucky': 'America/New_York', // Eastern part
  'tennessee': 'America/New_York', // Eastern part
};

/**
 * Get timezone for a given location name
 * @param {string} locationName - The location name to look up
 * @returns {string} - The timezone string (defaults to America/New_York)
 */
function getTimezoneForLocation(locationName) {
  if (!locationName) {
    return 'America/New_York'; // Default to Eastern Time
  }
  
  const normalizedLocation = locationName.toLowerCase().trim();
  
  // Direct match
  if (LOCATION_TIMEZONE_MAP[normalizedLocation]) {
    return LOCATION_TIMEZONE_MAP[normalizedLocation];
  }
  
  // Partial match - check if any key is contained in the location name
  for (const [key, timezone] of Object.entries(LOCATION_TIMEZONE_MAP)) {
    if (normalizedLocation.includes(key)) {
      return timezone;
    }
  }
  
  // Default to Eastern Time if no match found
  return 'America/New_York';
}

/**
 * Get timezone for a service based on client timezone, service labels, and location
 * @param {string} clientTimezone - The client's timezone (highest priority)
 * @param {Array|string} serviceLabels - The service labels (fallback)
 * @param {string} serviceLocation - The service location (fallback)
 * @returns {string} - The timezone string
 */
function getTimezoneForService(clientTimezone = null, serviceLabels = null, serviceLocation = null) {
  // Priority 1: Use client timezone if available
  if (clientTimezone && clientTimezone.trim() !== '') {
    // Validate that it's a proper timezone string
    try {
      // Test if it's a valid timezone by trying to use it
      new Date().toLocaleString('en-US', { timeZone: clientTimezone });
      return clientTimezone;
    } catch (e) {
      logger.info(`⚠️ Invalid client timezone "${clientTimezone}", falling back to service labels`);
    }
  }
  // First, try to determine timezone from service labels
  if (serviceLabels) {
    let labels = serviceLabels;
    
    // Handle JSON string format
    if (typeof serviceLabels === 'string') {
      try {
        labels = JSON.parse(serviceLabels);
      } catch (e) {
        // If parsing fails, treat as single label string
        labels = [serviceLabels];
      }
    }
    
    // Ensure labels is an array
    if (!Array.isArray(labels)) {
      labels = [labels];
    }
    
    // Check for timezone-specific labels (order matters - most specific first)
    for (const label of labels) {
      const labelStr = label.toString().toLowerCase();
      
      // Pacific Time labels - most specific first
      if (labelStr.includes('school - la') ||
          labelStr.includes('school - los angeles') ||
          labelStr.includes('school - sf') ||
          labelStr.includes('school - san francisco') ||
          labelStr.includes('home - la') ||
          labelStr.includes('home - los angeles') ||
          labelStr.includes('home - sf') ||
          labelStr.includes('home - san francisco') ||
          labelStr.includes('los angeles') || 
          labelStr.includes('san francisco') ||
          labelStr.includes('california') ||
          labelStr.includes('pacific') ||
          labelStr.includes('west coast') ||
          (labelStr.includes('la') && !labelStr.includes('dallas') && !labelStr.includes('unknown')) ||
          (labelStr.includes('sf') && !labelStr.includes('dallas') && !labelStr.includes('unknown'))) {
        return 'America/Los_Angeles';
      }
      
      // Eastern Time labels - most specific first
      if (labelStr.includes('school - ny') ||
          labelStr.includes('school - new york') ||
          labelStr.includes('home - ny') ||
          labelStr.includes('home - new york') ||
          labelStr.includes('new york') || 
          labelStr.includes('east coast') ||
          labelStr.includes('florida') ||
          labelStr.includes('boston') ||
          labelStr.includes('ny')) {
        return 'America/New_York';
      }
      
      // Central Time labels - most specific first
      if (labelStr.includes('school - chicago') ||
          labelStr.includes('home - chicago') ||
          labelStr.includes('home - dallas') ||
          labelStr.includes('dallas elementary') ||
          labelStr.includes('chicago') || 
          labelStr.includes('texas') || 
          labelStr.includes('dallas')) {
        return 'America/Chicago';
      }
      
      // Mountain Time labels - most specific first
      if (labelStr.includes('school - denver') ||
          labelStr.includes('home - denver') ||
          labelStr.includes('home - phoenix') ||
          labelStr.includes('denver') || 
          labelStr.includes('colorado') || 
          labelStr.includes('phoenix')) {
        return 'America/Denver';
      }
    }
  }
  
  // Fallback to location-based detection if no label match
  if (serviceLocation) {
    return getTimezoneForLocation(serviceLocation);
  }
  
  // Default to Eastern Time
  return 'America/New_York';
}

/**
 * Get timezone for an appointment based on client timezone, service labels and location
 * @param {Object} appointment - The appointment object
 * @param {Object} service - The service object with labels and location
 * @param {string} clientTimezone - The client's timezone (highest priority)
 * @returns {string} - The timezone string
 */
function getTimezoneForAppointment(appointment, service, clientTimezone = null) {
  // Priority 1: Use client timezone if available
  if (clientTimezone && clientTimezone.trim() !== '') {
    try {
      new Date().toLocaleString('en-US', { timeZone: clientTimezone });
      return clientTimezone;
    } catch (e) {
      logger.info(`⚠️ Invalid client timezone "${clientTimezone}", falling back to service data`);
    }
  }
  
  // Priority 2: Try to get timezone from service labels
  if (service && service.labels) {
    const timezone = getTimezoneForService(null, service.labels, service.location || service.dft_location?.name);
    if (timezone !== 'America/New_York' || !service.location) {
      return timezone;
    }
  }
  
  // Priority 3: Fallback to service location if available
  if (service && (service.location || service.dft_location?.name)) {
    return getTimezoneForLocation(service.location || service.dft_location.name);
  }
  
  // Priority 4: Fallback to appointment location if available
  if (appointment && appointment.location) {
    const locationName = typeof appointment.location === 'string' 
      ? appointment.location 
      : appointment.location.name;
    return getTimezoneForLocation(locationName);
  }
  
  // Default to Eastern Time
  return 'America/New_York';
}

module.exports = {
  getTimezoneForLocation,
  getTimezoneForService,
  getTimezoneForAppointment,
  LOCATION_TIMEZONE_MAP
};
