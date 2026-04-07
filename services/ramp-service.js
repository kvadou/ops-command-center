const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * RampService - Handles integration with Ramp API using OAuth2
 * Fetches and stores transactions, vendors, categories, cards, and reimbursements
 */
class RampService {
  constructor(clientId, clientSecret, pool) {
    if (!clientId || !clientSecret) {
      throw new Error('Ramp Client ID and Client Secret are required');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.pool = pool;
    this.baseURL = 'https://api.ramp.com/v1';
    this.tokenURL = 'https://api.ramp.com/oauth2/token';
    this.accessToken = null;
    this.tokenExpiresAt = null;
    
    // Create axios client without auth header (will be added dynamically)
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Add request interceptor to inject access token
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  /**
   * Get OAuth2 access token using client credentials flow
   * Caches token and refreshes when expired
   */
  async getAccessToken() {
    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - 300000) {
      return this.accessToken;
    }

    try {
      // Ramp expects client_id and client_secret in the POST body
      const response = await axios.post(
        this.tokenURL,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'transactions:read vendors:read categories:read cards:read reimbursements:read'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      this.accessToken = response.data.access_token;
      // Token expires in expires_in seconds (default to 3600 if not provided)
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiresAt = Date.now() + (expiresIn * 1000);

      logger.info('Ramp OAuth2 token obtained successfully');
      return this.accessToken;
    } catch (error) {
      const errorDetails = error.response?.data || error.message;
      const errorInfo = {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: errorDetails,
        url: this.tokenURL,
        clientIdPrefix: this.clientId?.substring(0, 10) + '...',
        hasClientSecret: !!this.clientSecret
      };
      logger.error({ data: JSON.stringify(errorInfo, null, 2) }, 'Ramp OAuth2 Error Details:');
      logger.error('Error obtaining Ramp OAuth2 token:', errorInfo);
      throw new Error(`Failed to obtain Ramp access token: ${error.response?.data?.error_description || error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Sync all transactions from Ramp
   */
  async syncAllTransactions() {
    try {
      let allTransactions = [];
      let nextCursor = null;
      let hasMore = true;

      while (hasMore) {
        const params = { limit: 100 };
        if (nextCursor) {
          params.cursor = nextCursor;
        }

        const response = await this.client.get('/transactions', { params });
        const transactions = response.data.data || [];
        allTransactions = allTransactions.concat(transactions);

        nextCursor = response.data.next_cursor;
        hasMore = !!nextCursor && transactions.length > 0;

        // Rate limiting - be respectful
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Store transactions in database
      let inserted = 0;
      let updated = 0;

      for (const transaction of allTransactions) {
        const result = await this.pool.query(
          `INSERT INTO ramp_transactions (
            ramp_transaction_id, amount, merchant_name, category, card_id,
            department, memo, tags, state, transaction_date, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (ramp_transaction_id) DO UPDATE SET
            amount = EXCLUDED.amount,
            merchant_name = EXCLUDED.merchant_name,
            category = EXCLUDED.category,
            card_id = EXCLUDED.card_id,
            department = EXCLUDED.department,
            memo = EXCLUDED.memo,
            tags = EXCLUDED.tags,
            state = EXCLUDED.state,
            transaction_date = EXCLUDED.transaction_date,
            raw_data = EXCLUDED.raw_data,
            synced_at = NOW()`,
          [
            transaction.id,
            Math.abs(transaction.amount / 100), // Convert cents to dollars
            transaction.merchant_name,
            transaction.category?.name || null,
            transaction.card?.id || null,
            transaction.department?.name || null,
            transaction.memo || null,
            JSON.stringify(transaction.tags || []),
            transaction.state,
            transaction.transaction_date || transaction.date,
            JSON.stringify(transaction)
          ]
        );

        if (result.rowCount > 0) {
          if (result.command === 'INSERT') {
            inserted++;
          } else {
            updated++;
          }
        }
      }

      logger.info(`Ramp sync: ${inserted} inserted, ${updated} updated`);
      return { inserted, updated, total: allTransactions.length };
    } catch (error) {
      logger.error('Error syncing Ramp transactions:', error);
      throw error;
    }
  }

  /**
   * Sync vendors from Ramp
   */
  async syncVendors() {
    try {
      const response = await this.client.get('/vendors');
      const vendors = response.data.data || [];

      let inserted = 0;
      for (const vendor of vendors) {
        await this.pool.query(
          `INSERT INTO ramp_vendors (ramp_vendor_id, name, category, raw_data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ramp_vendor_id) DO UPDATE SET
             name = EXCLUDED.name,
             category = EXCLUDED.category,
             raw_data = EXCLUDED.raw_data,
             synced_at = NOW()`,
          [
            vendor.id,
            vendor.name,
            vendor.category?.name || null,
            JSON.stringify(vendor)
          ]
        );
        inserted++;
      }

      logger.info(`Ramp vendors sync: ${inserted} vendors synced`);
      return { synced: inserted };
    } catch (error) {
      logger.error('Error syncing Ramp vendors:', error);
      throw error;
    }
  }

  /**
   * Sync categories from Ramp
   */
  async syncCategories() {
    try {
      const response = await this.client.get('/categories');
      const categories = response.data.data || [];

      let inserted = 0;
      for (const category of categories) {
        await this.pool.query(
          `INSERT INTO ramp_categories (ramp_category_id, name, parent_category_id, raw_data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ramp_category_id) DO UPDATE SET
             name = EXCLUDED.name,
             parent_category_id = EXCLUDED.parent_category_id,
             raw_data = EXCLUDED.raw_data,
             synced_at = NOW()`,
          [
            category.id,
            category.name,
            category.parent_id || null,
            JSON.stringify(category)
          ]
        );
        inserted++;
      }

      logger.info(`Ramp categories sync: ${inserted} categories synced`);
      return { synced: inserted };
    } catch (error) {
      logger.error('Error syncing Ramp categories:', error);
      throw error;
    }
  }

  /**
   * Sync cards from Ramp
   */
  async syncCards() {
    try {
      const response = await this.client.get('/cards');
      const cards = response.data.data || [];

      let inserted = 0;
      for (const card of cards) {
        await this.pool.query(
          `INSERT INTO ramp_cards (ramp_card_id, last_four, cardholder_name, raw_data)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (ramp_card_id) DO UPDATE SET
             last_four = EXCLUDED.last_four,
             cardholder_name = EXCLUDED.cardholder_name,
             raw_data = EXCLUDED.raw_data,
             synced_at = NOW()`,
          [
            card.id,
            card.last_four || null,
            card.cardholder?.name || null,
            JSON.stringify(card)
          ]
        );
        inserted++;
      }

      logger.info(`Ramp cards sync: ${inserted} cards synced`);
      return { synced: inserted };
    } catch (error) {
      logger.error('Error syncing Ramp cards:', error);
      throw error;
    }
  }

  /**
   * Sync reimbursements from Ramp
   */
  async syncReimbursements() {
    try {
      let allReimbursements = [];
      let nextCursor = null;
      let hasMore = true;

      while (hasMore) {
        const params = { limit: 100 };
        if (nextCursor) {
          params.cursor = nextCursor;
        }

        const response = await this.client.get('/reimbursements', { params });
        const reimbursements = response.data.data || [];
        allReimbursements = allReimbursements.concat(reimbursements);

        nextCursor = response.data.next_cursor;
        hasMore = !!nextCursor && reimbursements.length > 0;

        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      let inserted = 0;
      for (const reimbursement of allReimbursements) {
        await this.pool.query(
          `INSERT INTO ramp_reimbursements (
            ramp_reimbursement_id, employee_name, amount, category, state, receipt_date, raw_data
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (ramp_reimbursement_id) DO UPDATE SET
            employee_name = EXCLUDED.employee_name,
            amount = EXCLUDED.amount,
            category = EXCLUDED.category,
            state = EXCLUDED.state,
            receipt_date = EXCLUDED.receipt_date,
            raw_data = EXCLUDED.raw_data,
            synced_at = NOW()`,
          [
            reimbursement.id,
            reimbursement.employee?.name || null,
            Math.abs(reimbursement.amount / 100), // Convert cents to dollars
            reimbursement.category?.name || null,
            reimbursement.state,
            reimbursement.receipt_date || reimbursement.date,
            JSON.stringify(reimbursement)
          ]
        );
        inserted++;
      }

      logger.info(`Ramp reimbursements sync: ${inserted} reimbursements synced`);
      return { synced: inserted };
    } catch (error) {
      logger.error('Error syncing Ramp reimbursements:', error);
      throw error;
    }
  }

  /**
   * Detect reimbursement outliers using z-score
   * @param {number} threshold - Z-score threshold (default: 2.5)
   */
  async detectReimbursementOutliers(threshold = 2.5) {
    try {
      // Get all reimbursements with amounts
      const result = await this.pool.query(
        `SELECT id, amount, employee_name, receipt_date
         FROM ramp_reimbursements
         WHERE state = 'APPROVED' AND amount > 0`
      );

      const reimbursements = result.rows;
      if (reimbursements.length === 0) {
        return { detected: 0 };
      }

      // Calculate mean and standard deviation
      const amounts = reimbursements.map(r => parseFloat(r.amount));
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      const stdDev = Math.sqrt(variance);

      if (stdDev === 0) {
        return { detected: 0 };
      }

      // Calculate z-scores and flag outliers
      let detected = 0;
      for (const reimbursement of reimbursements) {
        const zScore = Math.abs((reimbursement.amount - mean) / stdDev);
        if (zScore > threshold) {
          await this.pool.query(
            `UPDATE ramp_reimbursements
             SET is_outlier = TRUE,
                 outlier_reason = $1
             WHERE id = $2`,
            [
              `Z-score: ${zScore.toFixed(2)} (threshold: ${threshold})`,
              reimbursement.id
            ]
          );
          detected++;
        }
      }

      logger.info(`Reimbursement outlier detection: ${detected} outliers detected`);
      return { detected, threshold, mean, stdDev };
    } catch (error) {
      logger.error('Error detecting reimbursement outliers:', error);
      throw error;
    }
  }

  /**
   * Get monthly aggregates
   */
  async getMonthlyAggregates(startDate, endDate) {
    try {
      // Refresh materialized view first
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ramp_monthly_aggregates');

      const result = await this.pool.query(
        `SELECT * FROM ramp_monthly_aggregates
         WHERE month >= $1 AND month <= $2
         ORDER BY month DESC`,
        [startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting monthly aggregates:', error);
      throw error;
    }
  }
}

module.exports = RampService;
