const { logger } = require('../utils/logger');

/**
 * EbitdaService - Handles EBITDA calculations and mapping management
 */
class EbitdaService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get effective EBITDA category for a Ramp category at a given date
   */
  async getEffectiveCategoryMapping(rampCategory, date) {
    const result = await this.pool.query(
      `SELECT ebitda_category
       FROM ebitda_category_mappings
       WHERE ramp_category = $1
         AND effective_from <= $2
         AND (effective_to IS NULL OR effective_to >= $2)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [rampCategory, date]
    );

    return result.rows[0]?.ebitda_category || 'OPERATING_EXPENSE'; // Default
  }

  /**
   * Get effective EBITDA category for a vendor at a given date
   */
  async getEffectiveVendorOverride(vendorName, date) {
    const result = await this.pool.query(
      `SELECT ebitda_category
       FROM ebitda_vendor_overrides
       WHERE vendor_name = $1
         AND effective_from <= $2
         AND (effective_to IS NULL OR effective_to >= $2)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [vendorName, date]
    );

    return result.rows[0]?.ebitda_category || null; // No override by default
  }

  /**
   * Compute EBITDA for a period
   */
  async computeEbitdaForPeriod(startDate, endDate, stripeAccountId = null) {
    try {
      // Get revenue
      let revenue;
      if (stripeAccountId) {
        const revenueResult = await this.pool.query(
          `SELECT SUM(net_revenue) AS total_revenue
           FROM stripe_daily_revenue
           WHERE stripe_account_id = $1
             AND revenue_date >= $2 AND revenue_date <= $3`,
          [stripeAccountId, startDate, endDate]
        );
        revenue = parseFloat(revenueResult.rows[0]?.total_revenue || 0);
      } else {
        const revenueResult = await this.pool.query(
          `SELECT SUM(net_revenue) AS total_revenue
           FROM stripe_daily_revenue
           WHERE revenue_date >= $1 AND revenue_date <= $2`,
          [startDate, endDate]
        );
        revenue = parseFloat(revenueResult.rows[0]?.total_revenue || 0);
      }

      // Get Ramp expenses with EBITDA categorization
      const expensesResult = await this.pool.query(
        `SELECT 
            rt.id,
            rt.amount,
            rt.merchant_name,
            rt.category,
            rt.transaction_date
         FROM ramp_transactions rt
         WHERE rt.state = 'SETTLED'
           AND rt.transaction_date >= $1 AND rt.transaction_date <= $2`,
        [startDate, endDate]
      );

      let cogs = 0;
      let operatingExpenses = 0;
      let nonEbitda = 0;

      for (const expense of expensesResult.rows) {
        // Check vendor override first
        const vendorOverride = await this.getEffectiveVendorOverride(
          expense.merchant_name,
          expense.transaction_date
        );

        let ebitdaCategory;
        if (vendorOverride) {
          ebitdaCategory = vendorOverride;
        } else {
          // Use category mapping
          ebitdaCategory = await this.getEffectiveCategoryMapping(
            expense.category || 'Uncategorized',
            expense.transaction_date
          );
        }

        const amount = parseFloat(expense.amount);

        if (ebitdaCategory === 'COGS') {
          cogs += amount;
        } else if (ebitdaCategory === 'OPERATING_EXPENSE') {
          operatingExpenses += amount;
        } else {
          nonEbitda += amount;
        }
      }

      // Get payroll (always operating expense)
      const payrollResult = await this.pool.query(
        `SELECT SUM(total_payroll_cost) AS total_payroll
         FROM payroll_periods
         WHERE pay_period_date >= $1 AND pay_period_date <= $2`,
        [startDate, endDate]
      );
      const payroll = parseFloat(payrollResult.rows[0]?.total_payroll || 0);
      operatingExpenses += payroll;

      const totalExpenses = cogs + operatingExpenses + nonEbitda;
      const ebitda = revenue - cogs - operatingExpenses;
      const ebitdaMargin = revenue > 0 ? (ebitda / revenue) * 100 : 0;

      return {
        revenue,
        cogs,
        operatingExpenses,
        payroll,
        nonEbitda,
        totalExpenses,
        ebitda,
        ebitdaMargin
      };
    } catch (error) {
      logger.error('Error computing EBITDA:', error);
      throw error;
    }
  }

  /**
   * Update category mapping
   */
  async updateCategoryMapping(rampCategory, ebitdaCategory, userId) {
    try {
      // End previous mapping if exists
      await this.pool.query(
        `UPDATE ebitda_category_mappings
         SET effective_to = CURRENT_DATE - INTERVAL '1 day'
         WHERE ramp_category = $1
           AND effective_to IS NULL`,
        [rampCategory]
      );

      // Create new mapping
      await this.pool.query(
        `INSERT INTO ebitda_category_mappings (
          ramp_category, ebitda_category, effective_from, created_by
        ) VALUES ($1, $2, CURRENT_DATE, $3)`,
        [rampCategory, ebitdaCategory, userId]
      );

      logger.info(`Updated EBITDA category mapping: ${rampCategory} -> ${ebitdaCategory}`);
      return { success: true };
    } catch (error) {
      logger.error('Error updating category mapping:', error);
      throw error;
    }
  }

  /**
   * Update vendor override
   */
  async updateVendorOverride(vendorName, ebitdaCategory, userId) {
    try {
      // End previous override if exists
      await this.pool.query(
        `UPDATE ebitda_vendor_overrides
         SET effective_to = CURRENT_DATE - INTERVAL '1 day'
         WHERE vendor_name = $1
           AND effective_to IS NULL`,
        [vendorName]
      );

      // Create new override
      await this.pool.query(
        `INSERT INTO ebitda_vendor_overrides (
          vendor_name, ebitda_category, effective_from, created_by
        ) VALUES ($1, $2, CURRENT_DATE, $3)`,
        [vendorName, ebitdaCategory, userId]
      );

      logger.info(`Updated EBITDA vendor override: ${vendorName} -> ${ebitdaCategory}`);
      return { success: true };
    } catch (error) {
      logger.error('Error updating vendor override:', error);
      throw error;
    }
  }

  /**
   * Get detailed EBITDA breakdown
   */
  async getEbitdaBreakdown(startDate, endDate) {
    try {
      const ebitda = await this.computeEbitdaForPeriod(startDate, endDate);

      // Get breakdown by category
      const categoryBreakdown = await this.pool.query(
        `SELECT 
            rt.category,
            SUM(rt.amount) AS total_amount,
            COUNT(*) AS transaction_count
         FROM ramp_transactions rt
         WHERE rt.state = 'SETTLED'
           AND rt.transaction_date >= $1 AND rt.transaction_date <= $2
         GROUP BY rt.category
         ORDER BY total_amount DESC`,
        [startDate, endDate]
      );

      // Get breakdown by vendor (top 20)
      const vendorBreakdown = await this.pool.query(
        `SELECT 
            rt.merchant_name,
            SUM(rt.amount) AS total_amount,
            COUNT(*) AS transaction_count
         FROM ramp_transactions rt
         WHERE rt.state = 'SETTLED'
           AND rt.transaction_date >= $1 AND rt.transaction_date <= $2
         GROUP BY rt.merchant_name
         ORDER BY total_amount DESC
         LIMIT 20`,
        [startDate, endDate]
      );

      return {
        ...ebitda,
        categoryBreakdown: categoryBreakdown.rows,
        vendorBreakdown: vendorBreakdown.rows
      };
    } catch (error) {
      logger.error('Error getting EBITDA breakdown:', error);
      throw error;
    }
  }
}

module.exports = EbitdaService;
