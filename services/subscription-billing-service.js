/**
 * Subscription Billing Service
 * Handles all billing calculations for monthly subscriptions and term payments
 * Includes: proration, monthly charge calculation, cancellation logic, family discounts
 */


const { logger } = require('../utils/logger');
const { pool } = global;

class SubscriptionBillingService {
  /**
   * Calculate lessons and amount for initial charge (when enrolling mid-month)
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} config - Term billing config
   * @param {Date} enrollmentDate - Date when enrollment occurs
   * @returns {Object} { lessons: number, amount: number }
   */
  calculateInitialCharge(enrollment, config, enrollmentDate) {
    const classDates = config.class_dates || [];
    const ratePerLesson = parseFloat(config.rate_per_lesson);
    
    // Filter dates that are on or after enrollment date and in current month
    const enrollmentMonth = new Date(enrollmentDate);
    const currentMonth = enrollmentMonth.getMonth();
    const currentYear = enrollmentMonth.getFullYear();
    
    const remainingDates = classDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date >= enrollmentDate && 
             date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear;
    });
    
    const lessons = remainingDates.length;
    const amount = lessons * ratePerLesson;
    
    return { lessons, amount, dates: remainingDates };
  }

  /**
   * Calculate lessons and amount for a specific month
   * @param {Object} config - Term billing config
   * @param {Date} targetMonth - First day of target month
   * @returns {Object} { lessons: number, amount: number }
   */
  calculateMonthlyCharge(config, targetMonth) {
    const classDates = config.class_dates || [];
    const ratePerLesson = parseFloat(config.rate_per_lesson);
    
    const targetMonthNum = targetMonth.getMonth();
    const targetYear = targetMonth.getFullYear();
    
    // Filter dates that fall in target month
    const monthDates = classDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date.getMonth() === targetMonthNum && 
             date.getFullYear() === targetYear;
    });
    
    const lessons = monthDates.length;
    const amount = lessons * ratePerLesson;
    
    return { lessons, amount, dates: monthDates };
  }

  /**
   * Calculate monthly distribution from class dates
   * @param {Array<string>} classDates - Array of ISO date strings
   * @returns {Object} { "2025-09": 4, "2025-10": 5, ... }
   */
  calculateMonthlyDistribution(classDates) {
    const distribution = {};
    
    classDates.forEach(dateStr => {
      const date = new Date(dateStr);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!distribution[monthKey]) {
        distribution[monthKey] = 0;
      }
      distribution[monthKey]++;
    });
    
    return distribution;
  }

  /**
   * Calculate term totals (with and without discount)
   * @param {Array<string>} classDates - Array of ISO date strings
   * @param {number} ratePerLesson - Rate per lesson
   * @param {number|null} discountPercent - Discount percentage (0-100)
   * @returns {Object} { totalLessons, termTotal, discountedTermTotal }
   */
  calculateTermTotals(classDates, ratePerLesson, discountPercent = null) {
    const totalLessons = classDates.length;
    const termTotal = totalLessons * ratePerLesson;
    
    let discountedTermTotal = null;
    if (discountPercent && discountPercent > 0) {
      const discountMultiplier = 1 - (discountPercent / 100);
      discountedTermTotal = termTotal * discountMultiplier;
    }
    
    return {
      totalLessons,
      termTotal: parseFloat(termTotal.toFixed(2)),
      discountedTermTotal: discountedTermTotal ? parseFloat(discountedTermTotal.toFixed(2)) : null
    };
  }

  /**
   * Calculate prorated term payment for late joiners
   * @param {Array<string>} classDates - All class dates in term
   * @param {Date} enrollmentDate - Date when enrollment occurs
   * @param {number} ratePerLesson - Rate per lesson
   * @param {number|null} discountPercent - Term discount percentage
   * @returns {Object} { lessons, amount, discountedAmount }
   */
  calculateProratedTermPayment(classDates, enrollmentDate, ratePerLesson, discountPercent = null) {
    // Filter dates that are on or after enrollment date
    const remainingDates = classDates.filter(dateStr => {
      const date = new Date(dateStr);
      return date >= enrollmentDate;
    });
    
    const lessons = remainingDates.length;
    const amount = lessons * ratePerLesson;
    
    let discountedAmount = null;
    if (discountPercent && discountPercent > 0) {
      const discountMultiplier = 1 - (discountPercent / 100);
      discountedAmount = amount * discountMultiplier;
    }
    
    return {
      lessons,
      amount: parseFloat(amount.toFixed(2)),
      discountedAmount: discountedAmount ? parseFloat(discountedAmount.toFixed(2)) : null,
      dates: remainingDates
    };
  }

  /**
   * Check if subscription should be cancelled (final class date has passed)
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} config - Term billing config
   * @returns {boolean}
   */
  shouldCancelSubscription(enrollment, config) {
    const finalClassDate = new Date(enrollment.final_class_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    finalClassDate.setHours(0, 0, 0, 0);
    
    return today > finalClassDate;
  }

  /**
   * Calculate family discount for multiple children
   * @param {number} totalAmount - Combined amount for all children
   * @param {number} discountPercent - Family discount percentage (0-100)
   * @returns {number} Discounted amount
   */
  calculateFamilyDiscount(totalAmount, discountPercent) {
    if (!discountPercent || discountPercent <= 0) {
      return totalAmount;
    }
    
    const discountMultiplier = 1 - (discountPercent / 100);
    return parseFloat((totalAmount * discountMultiplier).toFixed(2));
  }

  /**
   * Get next billing date (1st of next month)
   * @param {Date} currentDate - Current date
   * @returns {Date} First day of next month
   */
  getNextBillingDate(currentDate = new Date()) {
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    nextMonth.setHours(0, 0, 0, 0);
    return nextMonth;
  }

  /**
   * Get first of current month
   * @param {Date} date - Date to get month from
   * @returns {Date} First day of month
   */
  getFirstOfMonth(date = new Date()) {
    const first = new Date(date);
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    return first;
  }

  /**
   * Check if a month has any classes
   * @param {Object} config - Term billing config
   * @param {Date} targetMonth - First day of target month
   * @returns {boolean}
   */
  hasClassesInMonth(config, targetMonth) {
    const { lessons } = this.calculateMonthlyCharge(config, targetMonth);
    return lessons > 0;
  }

  /**
   * Get all months with classes in term
   * @param {Object} config - Term billing config
   * @returns {Array<Date>} Array of first-of-month dates
   */
  getMonthsWithClasses(config) {
    const distribution = this.calculateMonthlyDistribution(config.class_dates || []);
    const months = [];
    
    Object.keys(distribution).forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const firstOfMonth = new Date(year, month - 1, 1);
      months.push(firstOfMonth);
    });
    
    return months.sort((a, b) => a - b);
  }

  /**
   * Update term config if new lessons are added to job (dynamic term updates)
   * @param {number} configId - Term billing config ID
   * @param {Array<string>} newClassDates - Updated list of all class dates
   * @param {Pool} customPool - Optional custom database pool (for location-specific connections)
   * @returns {Promise<Object>} Updated config
   */
  async updateTermConfigForNewLessons(configId, newClassDates, customPool = null) {
    const poolToUse = customPool || pool;
    
    try {
      // Get existing config
      const configResult = await poolToUse.query(
        'SELECT * FROM term_billing_configs WHERE id = $1',
        [configId]
      );
      
      if (configResult.rows.length === 0) {
        throw new Error(`Term billing config ${configId} not found`);
      }
      
      const existingConfig = configResult.rows[0];
      const ratePerLesson = parseFloat(existingConfig.rate_per_lesson);
      const discountPercent = existingConfig.term_discount_percent 
        ? parseFloat(existingConfig.term_discount_percent) 
        : null;
      
      // Recalculate totals
      const totals = this.calculateTermTotals(newClassDates, ratePerLesson, discountPercent);
      const distribution = this.calculateMonthlyDistribution(newClassDates);
      
      // Find latest class date for final_class_date
      const sortedDates = newClassDates.map(d => new Date(d)).sort((a, b) => a - b);
      const finalClassDate = sortedDates[sortedDates.length - 1];
      
      // Update config
      const updateResult = await poolToUse.query(
        `UPDATE term_billing_configs 
         SET class_dates = $1,
             total_lessons = $2,
             term_total = $3,
             discounted_term_total = $4,
             lessons_per_month = $5,
             updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          JSON.stringify(newClassDates),
          totals.totalLessons,
          totals.termTotal,
          totals.discountedTermTotal,
          JSON.stringify(distribution),
          configId
        ]
      );
      
      // Update all active enrollments' final_class_date (only if subscription_enrollments table exists)
      try {
        await poolToUse.query(
        `UPDATE subscription_enrollments 
         SET final_class_date = $1,
             updated_at = NOW()
         WHERE service_id = $2 
           AND status = 'active'`,
        [finalClassDate.toISOString().split('T')[0], existingConfig.service_id]
      );
      } catch (enrollmentError) {
        // Table might not exist yet, that's okay - just log and continue
        logger.warn({ data: enrollmentError.message }, 'Could not update subscription enrollments:');
      }
      
      return updateResult.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate combined billing for multiple children (family discount)
   * @param {Array<Object>} childrenEnrollments - Array of enrollment objects for each child
   * @param {Object} config - Term billing config
   * @param {Date} targetMonth - Target month for billing
   * @returns {Object} { totalLessons, totalAmount, discountedAmount, children }
   */
  calculateFamilyBilling(childrenEnrollments, config, targetMonth) {
    const ratePerLesson = parseFloat(config.rate_per_lesson);
    const familyDiscountPercent = config.family_discount_percent 
      ? parseFloat(config.family_discount_percent) 
      : null;
    
    let totalLessons = 0;
    const children = [];
    
    // Calculate lessons for each child
    childrenEnrollments.forEach(enrollment => {
      const { lessons } = this.calculateMonthlyCharge(config, targetMonth);
      totalLessons += lessons;
      children.push({
        enrollmentId: enrollment.id,
        recipientId: enrollment.recipient_id,
        lessons
      });
    });
    
    const totalAmount = totalLessons * ratePerLesson;
    const discountedAmount = familyDiscountPercent 
      ? this.calculateFamilyDiscount(totalAmount, familyDiscountPercent)
      : totalAmount;
    
    return {
      totalLessons,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      discountedAmount: parseFloat(discountedAmount.toFixed(2)),
      discountApplied: familyDiscountPercent || 0,
      children
    };
  }
}

module.exports = new SubscriptionBillingService();










