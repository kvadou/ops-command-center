/**
 * Environment Configuration Management
 * Handles configuration for all 4 environments: local, staging, production, westside, eastside
 */

const environments = {
  local: {
    name: 'local',
    description: 'Local Development Environment',
    herokuApp: null,
    databaseUrl: process.env.DATABASE_URL,
    url: 'http://localhost:5000',
    isProduction: false,
    logLevel: 'debug',
    mcpConfig: 'local',
    autoSendClientReports: false // Disabled in local for testing
  },
  
  staging: {
    name: 'staging',
    description: 'Staging Environment',
    herokuApp: 'story-time-staging-784b74d757f2',
    pipeline: 'd2d07c8c-e4c8-4e6a-a04c-37d66425be89',
    databaseUrl: process.env.STAGING_DATABASE_URL,
    url: 'https://story-time-staging-784b74d757f2.herokuapp.com',
    isProduction: false,
    logLevel: 'info',
    mcpConfig: 'staging',
    autoSendClientReports: false // DISABLED: Staging should not send production emails to prevent duplicates when TutorCruncher sends webhooks to both staging and production
  },
  
  production: {
    name: 'production',
    description: 'Main Production Environment',
    herokuApp: 'acme-ops-main',
    databaseUrl: process.env.PRODUCTION_DATABASE_URL,
    url: 'https://analytics.chessat3.com',
    isProduction: true,
    logLevel: 'info',
    mcpConfig: 'production',
    autoSendClientReports: true // Enabled in production - GO LIVE!
  },
  
  'westside': {
    name: 'westside',
    description: 'Westside Location Environment',
    herokuApp: 'acmeops-westside',
    databaseUrl: process.env.WESTSIDE_DATABASE_URL,
    url: 'https://acmeops-westside-cbc977fb06de.herokuapp.com',
    isProduction: true,
    logLevel: 'info',
    mcpConfig: 'westside',
    autoSendClientReports: true // Enabled in westside
  },
  
  'eastside': {
    name: 'eastside',
    description: 'Eastside Location Environment',
    herokuApp: 'acmeops-eastside',
    databaseUrl: process.env.EASTSIDE_DATABASE_URL,
    url: 'https://acmeops-eastside.herokuapp.com',
    isProduction: true,
    logLevel: 'info',
    mcpConfig: 'eastside',
    autoSendClientReports: true // Enabled in eastside
  }
};

/**
 * Get current environment configuration
 */
function getCurrentEnvironment() {
  const envName = process.env.NODE_ENV || 'local';
  const env = environments[envName];
  
  if (!env) {
    throw new Error(`Unknown environment: ${envName}. Available environments: ${Object.keys(environments).join(', ')}`);
  }
  
  return env;
}

/**
 * Get configuration for specific environment
 */
function getEnvironmentConfig(envName) {
  const env = environments[envName];
  if (!env) {
    throw new Error(`Unknown environment: ${envName}. Available environments: ${Object.keys(environments).join(', ')}`);
  }
  return env;
}

/**
 * List all available environments
 */
function getAllEnvironments() {
  return Object.keys(environments).map(name => ({
    name,
    ...environments[name]
  }));
}

/**
 * Get MCP configuration for specific environment
 */
function getMCPConfig(envName) {
  const env = getEnvironmentConfig(envName);
  
  const baseConfig = {
    mcpServers: {
      postgres: {
        command: "npx",
        args: ["@modelcontextprotocol/server-postgres"],
        env: {
          POSTGRES_CONNECTION_STRING: env.databaseUrl
        }
      },
      heroku: {
        command: "npx",
        args: ["@modelcontextprotocol/server-heroku"],
        env: {
          HEROKU_API_KEY: process.env.HEROKU_API_KEY
        }
      },
      papertrail: {
        command: "node",
        args: ["./mcp-servers/papertrail-mcp.js"],
        env: {
          PAPERTRAIL_API_TOKEN: process.env.PAPERTRAIL_API_TOKEN,
          PAPERTRAIL_SYSTEM_ID: process.env[`PAPERTRAIL_SYSTEM_ID_${envName.toUpperCase()}`] || process.env.PAPERTRAIL_SYSTEM_ID
        }
      }
    }
  };
  
  return baseConfig;
}

/**
 * Generate environment-specific .env files
 */
function generateEnvFile(envName) {
  const env = getEnvironmentConfig(envName);
  
  return `# ${env.description} Environment Configuration
# Generated on ${new Date().toISOString()}

# =============================================================================
# ENVIRONMENT IDENTIFICATION
# =============================================================================
NODE_ENV=${envName}
ENVIRONMENT_NAME=${env.name}
ENVIRONMENT_DESCRIPTION="${env.description}"

# =============================================================================
# DATABASE CONFIGURATION
# =============================================================================
DATABASE_URL=${env.databaseUrl}

# =============================================================================
# HEROKU CONFIGURATION
# =============================================================================
HEROKU_API_KEY=your_heroku_api_key_here
${env.herokuApp ? `HEROKU_APP_NAME=${env.herokuApp}` : '# No Heroku app for local environment'}

# =============================================================================
# PAPERTRAIL CONFIGURATION
# =============================================================================
PAPERTRAIL_API_TOKEN=your_papertrail_api_token_here
PAPERTRAIL_SYSTEM_ID_${envName.toUpperCase()}=your_papertrail_system_id_for_${envName}

# =============================================================================
# APPLICATION CONFIGURATION
# =============================================================================
LOG_LEVEL=${env.logLevel}
PORT=5000
APP_URL=${env.url}

# =============================================================================
# SLACK INTEGRATION (Optional)
# =============================================================================
SLACK_WEBHOOK_URL_${envName.toUpperCase()}=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK

# =============================================================================
# EXISTING APPLICATION VARIABLES
# =============================================================================
# (Copy your existing environment variables here)
JWT_SECRET=your_jwt_secret
TUTORCRUNCHER_API_TOKEN=your_tutorcruncher_token
TUTORCRUNCHER_API_BASE=https://account.acmeops.com/api/
STRIPE_SECRET_KEY=your_stripe_secret_key
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
KLAVIYO_API_KEY=your_klaviyo_key
GRAVITY_FORMS_API_BASE_URL=https://join.chessat3.com/wp-json/gf/v2/
LABEL_ID=276463
LIST_A_ID=your_list_a_id
LIST_B_ID=your_list_b_id
`;
}

module.exports = {
  environments,
  getCurrentEnvironment,
  getEnvironmentConfig,
  getAllEnvironments,
  getMCPConfig,
  generateEnvFile
};
