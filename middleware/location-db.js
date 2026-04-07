// Middleware to set location-specific database connection based on subdomain
const { getPool } = require('../database-connections');

function getLocationFromHostname(hostname) {
  if (!hostname) return 'production';
  
  // Check for local development first
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    return 'local';
  }
  
  // Check for staging environment
  if (hostname.includes('staging')) {
    return 'staging';
  }
  
  // Check for franchise locations by checking if hostname contains the location name
  // This handles both custom domains (westside.acmeops.com) 
  // and Heroku app names (acmeops-westside-xxx.herokuapp.com)
  const hostnameNormalized = hostname.toLowerCase();
  if (hostnameNormalized.includes('westside')) {
    return 'westside';
  }
  if (hostnameNormalized.includes('eastside')) {
    return 'eastside';
  }
  
  // Legacy check using subdomain for backwards compatibility
  const subdomain = hostname.split('.')[0];
  switch (subdomain) {
    case 'eastside':
      return 'eastside';
    case 'westside':
      return 'westside';
    case 'join':
      return 'production';
    default:
      return 'production';
  }
}

function resolveFranchiseLocationOverride(req, currentLocation) {
  if (!req || !req.path) return currentLocation;
  if (!req.path.startsWith('/api/franchisee-analytics')) return currentLocation;

  const queryLocation = (req.query?.location || req.query?.market || '').toLowerCase();
  if (queryLocation === 'eastside' || queryLocation === 'westside') {
    return queryLocation;
  }

  return currentLocation;
}

function locationDbMiddleware(req, res, next) {
  const hostname = req.get('host') || req.hostname;
  let location = getLocationFromHostname(hostname);

  // Allow franchise analytics route to explicitly select a franchise DB
  location = resolveFranchiseLocationOverride(req, location);
  
  // Set location-specific database connection
  req.locationPool = getPool(location);
  req.location = location;

  // Provide quick access to franchise pools when aggregating data across markets
  if (req.path && req.path.startsWith('/api/franchisee-analytics')) {
    req.franchisePools = req.franchisePools || {
      'westside': getPool('westside'),
      'eastside': getPool('eastside'),
    };
  }
  
  next();
}

module.exports = { locationDbMiddleware, getLocationFromHostname, resolveFranchiseLocationOverride };
