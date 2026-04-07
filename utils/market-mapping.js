/**
 * Market mapping utility for client conversion tracker
 * Maps client labels to standardized market names
 */

const MARKET_MAPPING = {
  'Club - Park Slope': 'Park Slope Club',
  'Club - UES': 'NYC',
  'Home - Hamptons': 'Hamptons',
  'Home - LA': 'LA',
  'Home - NYC': 'NYC',
  'Home - SF': 'SF',
  'Home - Westchester': 'Westchester',
  'Online': 'Online',
  'School - Hamptons': 'Hamptons',
  'School - LA': 'LA',
  'School - NYC': 'NYC',
  'School - SF': 'SF',
  'Tournament': 'Tournament'
};

/**
 * Get market from client labels
 * @param {Array} labels - Array of label objects or strings
 * @returns {string} - Market name or empty string if not found
 */
function getMarketFromLabels(labels) {
  if (!labels || !Array.isArray(labels)) {
    return '';
  }

  for (const label of labels) {
    const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
    if (MARKET_MAPPING[labelName]) {
      return MARKET_MAPPING[labelName];
    }
  }

  return '';
}

/**
 * Get all available markets
 * @returns {Array} - Array of unique market names
 */
function getAvailableMarkets() {
  return [...new Set(Object.values(MARKET_MAPPING))];
}

/**
 * Get market mapping for reference
 * @returns {Object} - Market mapping object
 */
function getMarketMapping() {
  return { ...MARKET_MAPPING };
}

module.exports = {
  MARKET_MAPPING,
  getMarketFromLabels,
  getAvailableMarkets,
  getMarketMapping
};
