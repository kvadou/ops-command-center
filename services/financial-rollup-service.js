const { logger } = require('../utils/logger');
const EbitdaService = require('./ebitda-service');

/**
 * FinancialRollupService - Handles monthly financial rollup computation
 */
class FinancialRollupService {
  constructor(pool) {
    this.pool = pool;
    this.ebitdaService = new EbitdaService(pool);
  }

  /**
   * Compute monthly rollup for a specific month and account
   */
  async computeMonthlyRollup(month, stripeAccountId = null) {
    try {
      const startDate = new Date(month);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

      // Get revenue
      let revenueData;
      if (stripeAccountId) {
        revenueData = await this.pool.query(
          `SELECT 
              SUM(gross_revenue) AS gross_revenue,
              SUM(net_revenue) AS net_revenue,
              SUM(refunds) AS refunds
           FROM stripe_daily_revenue
           WHERE stripe_account_id = $1
             AND revenue_date >= $2 AND revenue_date < $3`,
          [stripeAccountId, startDate, endDate]
        );
      } else {
        revenueData = await this.pool.query(
          `SELECT 
              SUM(gross_revenue) AS gross_revenue,
              SUM(net_revenue) AS net_revenue,
              SUM(refunds) AS refunds
           FROM stripe_daily_revenue
           WHERE revenue_date >= $1 AND revenue_date < $2`,
          [startDate, endDate]
        );
      }

      const revenue = revenueData.rows[0] || {
        gross_revenue: 0,
        net_revenue: 0,
        refunds: 0
      };

      // Get Ramp spend
      const rampSpendData = await this.pool.query(
        `SELECT SUM(amount) AS total_spend
         FROM ramp_transactions
         WHERE state = 'SETTLED'
           AND transaction_date >= $1 AND transaction_date < $2`,
        [startDate, endDate]
      );
      const rampSpend = parseFloat(rampSpendData.rows[0]?.total_spend || 0);

      // Get payroll
      const payrollData = await this.pool.query(
        `SELECT SUM(total_payroll_cost) AS total_payroll
         FROM payroll_periods
         WHERE pay_period_date >= $1 AND pay_period_date < $2`,
        [startDate, endDate]
      );
      const payrollCost = parseFloat(payrollData.rows[0]?.total_payroll || 0);

      // Compute EBITDA
      const ebitdaData = await this.ebitdaService.computeEbitdaForPeriod(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0],
        stripeAccountId
      );

      const netRevenue = parseFloat(revenue.net_revenue || 0);
      const ebitdaProxy = ebitdaData.ebitda;
      const ebitdaMargin = netRevenue > 0 ? (ebitdaProxy / netRevenue) : 0;
      const netBurn = rampSpend + payrollCost - netRevenue;

      // Insert or update rollup
      await this.pool.query(
        `INSERT INTO monthly_financial_rollups (
          period_month, stripe_account_id, gross_revenue, net_revenue, refunds,
          ramp_spend, payroll_cost, ebitda_proxy, ebitda_margin, net_burn
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (period_month, stripe_account_id) DO UPDATE SET
          gross_revenue = EXCLUDED.gross_revenue,
          net_revenue = EXCLUDED.net_revenue,
          refunds = EXCLUDED.refunds,
          ramp_spend = EXCLUDED.ramp_spend,
          payroll_cost = EXCLUDED.payroll_cost,
          ebitda_proxy = EXCLUDED.ebitda_proxy,
          ebitda_margin = EXCLUDED.ebitda_margin,
          net_burn = EXCLUDED.net_burn,
          computed_at = NOW()`,
        [
          startDate,
          stripeAccountId,
          parseFloat(revenue.gross_revenue || 0),
          netRevenue,
          parseFloat(revenue.refunds || 0),
          rampSpend,
          payrollCost,
          ebitdaProxy,
          ebitdaMargin,
          netBurn
        ]
      );

      logger.info(`Computed monthly rollup for ${month.toISOString().split('T')[0]}, account: ${stripeAccountId || 'combined'}`);
      return {
        period_month: startDate,
        stripe_account_id: stripeAccountId,
        gross_revenue: parseFloat(revenue.gross_revenue || 0),
        net_revenue: netRevenue,
        refunds: parseFloat(revenue.refunds || 0),
        ramp_spend: rampSpend,
        payroll_cost: payrollCost,
        ebitda_proxy: ebitdaProxy,
        ebitda_margin: ebitdaMargin,
        net_burn: netBurn
      };
    } catch (error) {
      logger.error('Error computing monthly rollup:', error);
      throw error;
    }
  }

  /**
   * Compute rollups for a date range
   */
  async computeAllRollups(startDate, endDate) {
    try {
      // Get all active Stripe accounts
      const accountsResult = await this.pool.query(
        'SELECT id FROM stripe_accounts WHERE active = TRUE'
      );
      const accounts = accountsResult.rows.map(a => a.id);
      accounts.push(null); // Add null for combined view

      const results = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Generate all months in range
      const months = [];
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        months.push(new Date(current));
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }

      // Compute for each month and account
      for (const month of months) {
        for (const accountId of accounts) {
          try {
            const result = await this.computeMonthlyRollup(month, accountId);
            results.push(result);
          } catch (error) {
            logger.error(`Failed to compute rollup for ${month}, account ${accountId}:`, error);
          }
        }
      }

      return results;
    } catch (error) {
      logger.error('Error computing all rollups:', error);
      throw error;
    }
  }

  /**
   * Refresh all materialized views
   */
  async refreshMaterializedViews() {
    try {
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY stripe_daily_revenue');
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY ramp_monthly_aggregates');
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY payroll_monthly_aggregates');
      logger.info('Refreshed all materialized views');
      return { success: true };
    } catch (error) {
      logger.error('Error refreshing materialized views:', error);
      throw error;
    }
  }
}

module.exports = FinancialRollupService;
