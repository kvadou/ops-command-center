const { Pool } = require('pg');

/**
 * Get database connection pool for production database
 * Uses EXACT same configuration as main app (config/deps.js buildDeps function)
 */
function getProdDbPool() {
  // Use DATABASE_URL (same as main app - no PROD_DATABASE_URL needed)
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable not set');
  }
  
  // Match EXACT logic from config/deps.js buildDeps()
  const isProduction = process.env.NODE_ENV === 'production';
  const needsSSL = ['production', 'westside', 'eastside', 'staging'].includes(process.env.NODE_ENV) || process.env.NODE_ENV === 'production';
  const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
  
  // Use EXACT same Pool configuration as main app
  return new Pool({
    connectionString: DATABASE_URL,
    ssl: (needsSSL && !isLocal) ? { rejectUnauthorized: false } : false,
    
    // Same pool settings as main app
    max: isProduction ? 30 : 20,
    min: isProduction ? 8 : 5,
    idleTimeoutMillis: isProduction ? 20000 : 30000,
    connectionTimeoutMillis: isProduction ? 3000 : 5000,
    acquireTimeoutMillis: isProduction ? 5000 : 10000,
    allowExitOnIdle: false,
    statement_timeout: isProduction ? 30000 : 60000,
    query_timeout: isProduction ? 25000 : 55000,
    application_name: 'forecast-sync-worker',
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
}

/**
 * Get database connection pool for forecast database
 */
function getForecastDbPool() {
  const forecastDbUrl = process.env.FORECAST_DATABASE_URL;
  if (!forecastDbUrl) {
    throw new Error('FORECAST_DATABASE_URL environment variable not set');
  }
  
  // Check if this is an AWS RDS connection (requires SSL)
  const isRDS = forecastDbUrl.includes('amazonaws.com');
  const isLocal = forecastDbUrl.includes('localhost') || forecastDbUrl.includes('127.0.0.1');
  
  return new Pool({ 
    connectionString: forecastDbUrl,
    ssl: (isRDS && !isLocal) ? { 
      rejectUnauthorized: false 
    } : false,
    // Add connection pool settings
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: 'forecast-sync-worker'
  });
}

module.exports = {
  getProdDbPool,
  getForecastDbPool
};

