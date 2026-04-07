const Stripe = require('stripe');
const { logger } = require('../utils/logger');

/**
 * StripeFinancialService - Handles multi-account Stripe integration
 * Syncs transactions from multiple Stripe accounts and computes revenue aggregates
 */
// Stub mode: active when no STRIPE_SECRET_KEY is set
const STRIPE_STUB_MODE = !process.env.STRIPE_SECRET_KEY;

class StripeFinancialService {
  constructor(pool) {
    this.pool = pool;
    this.stripeInstances = new Map(); // Cache Stripe instances per account
  }

  /**
   * Get Stripe instance for an account
   */
  async getStripeInstance(accountId) {
    if (this.stripeInstances.has(accountId)) {
      return this.stripeInstances.get(accountId);
    }

    const result = await this.pool.query(
      'SELECT api_key_env_var FROM stripe_accounts WHERE id = $1 AND active = TRUE',
      [accountId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Stripe account ${accountId} not found or inactive`);
    }

    const envVarName = result.rows[0].api_key_env_var;
    const apiKey = process.env[envVarName];

    if (!apiKey) {
      throw new Error(`Environment variable ${envVarName} not set for Stripe account ${accountId}`);
    }

    const stripe = new Stripe(apiKey, { apiVersion: '2022-11-15' });
    this.stripeInstances.set(accountId, stripe);
    return stripe;
  }

  /**
   * Sync transactions for a specific Stripe account
   */
  async syncAccountTransactions(accountId) {
    if (STRIPE_STUB_MODE) {
      logger.info(`[STUB] Stripe syncAccountTransactions: account ${accountId}`);
      return { accountId, inserted: 0, updated: 0 };
    }
    try {
      const stripe = await this.getStripeInstance(accountId);
      let hasMore = true;
      let startingAfter = null;
      let inserted = 0;
      let updated = 0;

      // Sync charges
      while (hasMore) {
        const params = { limit: 100 };
        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const charges = await stripe.charges.list(params);

        for (const charge of charges.data) {
          // Insert charge
          await this.pool.query(
            `INSERT INTO stripe_transactions (
              stripe_account_id, stripe_transaction_id, transaction_type,
              amount, currency, status, created_at, raw_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (stripe_account_id, stripe_transaction_id, transaction_type) DO UPDATE SET
              amount = EXCLUDED.amount,
              currency = EXCLUDED.currency,
              status = EXCLUDED.status,
              raw_data = EXCLUDED.raw_data,
              synced_at = NOW()`,
            [
              accountId,
              charge.id,
              'charge',
              charge.amount / 100, // Convert cents to dollars
              charge.currency,
              charge.status,
              new Date(charge.created * 1000),
              JSON.stringify(charge)
            ]
          );

          // Insert fee if exists
          if (charge.balance_transaction) {
            const balanceTx = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
            if (balanceTx.fee) {
              await this.pool.query(
                `INSERT INTO stripe_transactions (
                  stripe_account_id, stripe_transaction_id, transaction_type,
                  amount, currency, status, created_at, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (stripe_account_id, stripe_transaction_id, transaction_type) DO UPDATE SET
                  amount = EXCLUDED.amount,
                  currency = EXCLUDED.currency,
                  status = EXCLUDED.status,
                  raw_data = EXCLUDED.raw_data,
                  synced_at = NOW()`,
                [
                  accountId,
                  `${charge.id}_fee`,
                  'fee',
                  balanceTx.fee / 100,
                  balanceTx.currency,
                  balanceTx.status,
                  new Date(balanceTx.created * 1000),
                  JSON.stringify(balanceTx)
                ]
              );
            }
          }

          // Insert refunds if any
          if (charge.refunded) {
            const refunds = await stripe.refunds.list({ charge: charge.id });
            for (const refund of refunds.data) {
              await this.pool.query(
                `INSERT INTO stripe_transactions (
                  stripe_account_id, stripe_transaction_id, transaction_type,
                  amount, currency, status, created_at, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (stripe_account_id, stripe_transaction_id, transaction_type) DO UPDATE SET
                  amount = EXCLUDED.amount,
                  currency = EXCLUDED.currency,
                  status = EXCLUDED.status,
                  raw_data = EXCLUDED.raw_data,
                  synced_at = NOW()`,
                [
                  accountId,
                  refund.id,
                  'refund',
                  refund.amount / 100,
                  refund.currency,
                  refund.status,
                  new Date(refund.created * 1000),
                  JSON.stringify(refund)
                ]
              );
            }
          }

          inserted++;
        }

        hasMore = charges.has_more;
        if (hasMore && charges.data.length > 0) {
          startingAfter = charges.data[charges.data.length - 1].id;
        } else {
          hasMore = false;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Stripe sync for account ${accountId}: ${inserted} transactions synced`);
      return { accountId, inserted, updated };
    } catch (error) {
      logger.error(`Error syncing Stripe account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Sync all active Stripe accounts
   */
  async syncAllAccounts() {
    if (STRIPE_STUB_MODE) {
      logger.info('[STUB] Stripe syncAllAccounts — skipping');
      return [];
    }
    try {
      const result = await this.pool.query(
        'SELECT id FROM stripe_accounts WHERE active = TRUE'
      );

      const accounts = result.rows;
      const results = [];

      for (const account of accounts) {
        try {
          const syncResult = await this.syncAccountTransactions(account.id);
          results.push(syncResult);
        } catch (error) {
          logger.error(`Failed to sync account ${account.id}:`, error);
          results.push({ accountId: account.id, error: error.message });
        }
      }

      // Refresh daily revenue materialized view
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY stripe_daily_revenue');

      return results;
    } catch (error) {
      logger.error('Error syncing all Stripe accounts:', error);
      throw error;
    }
  }

  /**
   * Get revenue for a specific account
   */
  async getAccountRevenue(accountId, startDate, endDate) {
    if (STRIPE_STUB_MODE) {
      logger.info(`[STUB] Stripe getAccountRevenue: account ${accountId}`);
      const days = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push({ revenue_date: d.toISOString().split('T')[0], gross_revenue: (Math.random() * 800 + 200).toFixed(2), net_revenue: (Math.random() * 700 + 150).toFixed(2), refunds: (Math.random() * 30).toFixed(2), fees: (Math.random() * 40 + 10).toFixed(2), refund_rate: (Math.random() * 0.05).toFixed(4) });
      }
      return days;
    }
    try {
      const result = await this.pool.query(
        `SELECT 
            revenue_date,
            gross_revenue,
            net_revenue,
            refunds,
            fees,
            refund_rate
         FROM stripe_daily_revenue
         WHERE stripe_account_id = $1
           AND revenue_date >= $2
           AND revenue_date <= $3
         ORDER BY revenue_date ASC`,
        [accountId, startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting account revenue:', error);
      throw error;
    }
  }

  /**
   * Get combined revenue across all accounts
   */
  async getCombinedRevenue(startDate, endDate) {
    if (STRIPE_STUB_MODE) {
      logger.info('[STUB] Stripe getCombinedRevenue');
      const days = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push({ revenue_date: d.toISOString().split('T')[0], gross_revenue: (Math.random() * 2000 + 500).toFixed(2), net_revenue: (Math.random() * 1800 + 400).toFixed(2), refunds: (Math.random() * 80).toFixed(2), fees: (Math.random() * 100 + 25).toFixed(2), refund_rate: (Math.random() * 0.04).toFixed(4) });
      }
      return days;
    }
    try {
      const result = await this.pool.query(
        `SELECT 
            revenue_date,
            SUM(gross_revenue) AS gross_revenue,
            SUM(net_revenue) AS net_revenue,
            SUM(refunds) AS refunds,
            SUM(fees) AS fees,
            CASE 
              WHEN SUM(gross_revenue) > 0 
              THEN SUM(refunds) / SUM(gross_revenue)
              ELSE 0 
            END AS refund_rate
         FROM stripe_daily_revenue
         WHERE revenue_date >= $1 AND revenue_date <= $2
         GROUP BY revenue_date
         ORDER BY revenue_date ASC`,
        [startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting combined revenue:', error);
      throw error;
    }
  }

  /**
   * Compute daily revenue aggregates for a specific account and date
   */
  async computeDailyRevenue(accountId, date) {
    try {
      // Refresh materialized view
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY stripe_daily_revenue');

      const result = await this.pool.query(
        `SELECT * FROM stripe_daily_revenue
         WHERE stripe_account_id = $1 AND revenue_date = $2`,
        [accountId, date]
      );

      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error computing daily revenue:', error);
      throw error;
    }
  }
}

module.exports = StripeFinancialService;
