/**
 * Unified Billing API Routes
 * Handles both monthly and term billing for the school dashboard
 * Provides overview stats, upcoming charges, reconciliation, and failed payment management
 */

const express = require('express');
const router = express.Router();
const { getPool } = require('../database-connections');
const pool = getPool();
const { requireAuth: auth } = require('../middleware/auth');
const axios = require('axios');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// TutorCruncher API configuration
const TUTORCRUNCHER_API_URL = 'https://secure.tutorcruncher.com/api';
const TUTORCRUNCHER_API_TOKEN = process.env.TUTORCRUNCHER_API_TOKEN;

const tutorCruncherAPI = axios.create({
  baseURL: TUTORCRUNCHER_API_URL,
  headers: {
    'Authorization': `token ${TUTORCRUNCHER_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

/**
 * GET /api/billing/overview
 * Returns comprehensive summary statistics for the unified billing dashboard
 * Includes both monthly and term billing data
 */
router.get('/overview', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    
    // Get all active subscriptions count by type
    const activeByTypeResult = await locationPool.query(
      `SELECT 
         payment_type, 
         COUNT(*) as count, 
         SUM(total_lessons_remaining) as lessons_remaining,
         COALESCE(SUM(
           CASE WHEN metadata->>'totalAmount' IS NOT NULL 
           THEN (metadata->>'totalAmount')::numeric 
           ELSE 0 END
         ), 0) as total_value
       FROM subscription_enrollments 
       WHERE status = 'active'
       GROUP BY payment_type`
    );
    
    // Get failed subscriptions count
    const failedResult = await locationPool.query(
      `SELECT COUNT(*) as count FROM subscription_enrollments WHERE status = 'failed'`
    );
    
    // Get total failed payments (from billing history)
    const failedPaymentsResult = await locationPool.query(
      `SELECT COUNT(*) as count FROM subscription_billing_history WHERE status = 'failed'`
    );
    
    // Get current month stats
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);
    
    // Credited this month (all types)
    const creditedThisMonthResult = await locationPool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN se.payment_type = 'monthly' THEN sbh.amount_charged ELSE 0 END), 0) as monthly_credited,
         COALESCE(SUM(CASE WHEN se.payment_type = 'term' THEN sbh.amount_charged ELSE 0 END), 0) as term_credited,
         COALESCE(SUM(sbh.amount_charged), 0) as total_credited
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       WHERE sbh.status = 'succeeded'
       AND sbh.billing_month >= $1`,
      [currentMonth.toISOString().split('T')[0]]
    );
    
    // Total successful payments all time by type
    const totalPaidResult = await locationPool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN se.payment_type = 'monthly' THEN sbh.amount_charged ELSE 0 END), 0) as monthly_total,
         COALESCE(SUM(CASE WHEN se.payment_type = 'term' THEN sbh.amount_charged ELSE 0 END), 0) as term_total,
         COALESCE(SUM(sbh.amount_charged), 0) as total
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       WHERE sbh.status = 'succeeded'`
    );
    
    // Calculate upcoming revenue (next month's expected charges for monthly subscriptions)
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    
    const upcomingRevenueResult = await locationPool.query(
      `SELECT 
         COALESCE(SUM(
           CASE 
             WHEN se.payment_type = 'monthly' THEN 
               COALESCE(tbc.rate_per_lesson::numeric, 0) * 
               COALESCE(
                 (SELECT COUNT(*) FROM jsonb_array_elements_text(tbc.class_dates::jsonb) as d 
                  WHERE d::date >= $1 AND d::date < $2),
                 0
               )
             ELSE 0
           END
         ), 0) as upcoming_revenue
       FROM subscription_enrollments se
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       WHERE se.status = 'active' AND se.payment_type = 'monthly'`,
      [nextMonth.toISOString().split('T')[0], new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 1).toISOString().split('T')[0]]
    );
    
    // Recent payment activity (last 30 days) by type
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentActivityResult = await locationPool.query(
      `SELECT 
         se.payment_type,
         COUNT(CASE WHEN sbh.status = 'succeeded' THEN 1 END) as successful,
         COUNT(CASE WHEN sbh.status = 'failed' THEN 1 END) as failed,
         COUNT(CASE WHEN sbh.status = 'pending' THEN 1 END) as pending,
         COALESCE(SUM(CASE WHEN sbh.status = 'succeeded' THEN sbh.amount_charged ELSE 0 END), 0) as total_collected
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       WHERE sbh.created_at >= $1
       GROUP BY se.payment_type`,
      [thirtyDaysAgo.toISOString()]
    );
    
    // Get term billing summary - total term payments this year
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const termSummaryResult = await locationPool.query(
      `SELECT 
         COUNT(DISTINCT se.id) as total_term_enrollments,
         COUNT(DISTINCT CASE WHEN sbh.status = 'succeeded' THEN se.id END) as paid_term_enrollments,
         COALESCE(SUM(CASE WHEN sbh.status = 'succeeded' THEN sbh.amount_charged ELSE 0 END), 0) as total_term_revenue
       FROM subscription_enrollments se
       LEFT JOIN subscription_billing_history sbh ON se.id = sbh.enrollment_id
       WHERE se.payment_type = 'term'
       AND se.enrollment_date >= $1`,
      [yearStart.toISOString().split('T')[0]]
    );
    
    // Get count of term payments with credit requests applied
    const termCreditsResult = await locationPool.query(
      `SELECT 
         COUNT(*) as total_term_payments,
         COUNT(CASE WHEN sbh.metadata->>'creditRequestId' IS NOT NULL THEN 1 END) as with_credit_request
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       WHERE se.payment_type = 'term' AND sbh.status = 'succeeded'`
    );
    
    // Build response
    const byType = {};
    for (const row of activeByTypeResult.rows) {
      byType[row.payment_type] = {
        count: parseInt(row.count),
        lessonsRemaining: parseInt(row.lessons_remaining) || 0,
        totalValue: parseFloat(row.total_value) || 0
      };
    }
    
    const recentByType = { monthly: null, term: null };
    for (const row of recentActivityResult.rows) {
      recentByType[row.payment_type] = {
        successful: parseInt(row.successful),
        failed: parseInt(row.failed),
        pending: parseInt(row.pending),
        totalCollected: parseFloat(row.total_collected)
      };
    }
    
    res.json({
      // Overall stats
      totalActiveSubscriptions: activeByTypeResult.rows.reduce((sum, r) => sum + parseInt(r.count), 0),
      failedSubscriptions: parseInt(failedResult.rows[0].count),
      failedPayments: parseInt(failedPaymentsResult.rows[0].count),
      
      // By payment type breakdown
      byPaymentType: byType,
      
      // Monthly billing specific
      monthlyBilling: {
        activeCount: byType.monthly?.count || 0,
        lessonsRemaining: byType.monthly?.lessonsRemaining || 0,
        creditedThisMonth: parseFloat(creditedThisMonthResult.rows[0].monthly_credited),
        totalPaidAllTime: parseFloat(totalPaidResult.rows[0].monthly_total),
        upcomingRevenue: parseFloat(upcomingRevenueResult.rows[0].upcoming_revenue),
        recentActivity: recentByType.monthly || { successful: 0, failed: 0, pending: 0, totalCollected: 0 }
      },
      
      // Term billing specific
      termBilling: {
        activeCount: byType.term?.count || 0,
        lessonsRemaining: byType.term?.lessonsRemaining || 0,
        creditedThisMonth: parseFloat(creditedThisMonthResult.rows[0].term_credited),
        totalPaidAllTime: parseFloat(totalPaidResult.rows[0].term_total),
        totalTermRevenue: parseFloat(termSummaryResult.rows[0].total_term_revenue),
        paidEnrollmentsThisYear: parseInt(termSummaryResult.rows[0].paid_term_enrollments) || 0,
        totalTermPayments: parseInt(termCreditsResult.rows[0].total_term_payments) || 0,
        paymentsWithCredit: parseInt(termCreditsResult.rows[0].with_credit_request) || 0,
        recentActivity: recentByType.term || { successful: 0, failed: 0, pending: 0, totalCollected: 0 }
      },
      
      // Combined totals
      totals: {
        creditedThisMonth: parseFloat(creditedThisMonthResult.rows[0].total_credited),
        totalPaidAllTime: parseFloat(totalPaidResult.rows[0].total),
        recentActivity: {
          successful: (recentByType.monthly?.successful || 0) + (recentByType.term?.successful || 0),
          failed: (recentByType.monthly?.failed || 0) + (recentByType.term?.failed || 0),
          pending: (recentByType.monthly?.pending || 0) + (recentByType.term?.pending || 0),
          totalCollected: (recentByType.monthly?.totalCollected || 0) + (recentByType.term?.totalCollected || 0)
        }
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching billing overview');
    res.status(500).json({
      error: 'Failed to fetch billing overview',
      message: error.message
    });
  }
}));

/**
 * GET /api/billing/upcoming-charges
 * Returns upcoming charges for the next 3 months (monthly billing only)
 * 
 * Billing model: Charge on the 1st of the month for lessons IN that month
 * Example: January lessons are charged on January 1st
 */
router.get('/upcoming-charges', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    
    // Get all active monthly subscriptions with their configs
    const enrollmentsResult = await locationPool.query(
      `SELECT 
         se.*,
         tbc.term_name,
         tbc.rate_per_lesson,
         tbc.class_dates,
         tbc.lessons_per_month,
         c.first_name as client_first_name,
         c.last_name as client_last_name,
         s.name as service_name
       FROM subscription_enrollments se
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       LEFT JOIN clients c ON c.client_id::text = se.client_id::text
       LEFT JOIN "Services" s ON s."serviceId" = se.service_id
       WHERE se.status = 'active' AND se.payment_type = 'monthly'
       ORDER BY se.service_id, se.client_id`
    );
    
    const upcomingCharges = [];
    const now = new Date();
    
    // Calculate charges for next 3 months
    // Monthly billing model: charge on the 1st of the month for lessons IN that month
    for (let monthOffset = 1; monthOffset <= 3; monthOffset++) {
      // Start from next month (offset 1) - we charge for upcoming months, not current month
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const targetMonthEnd = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0);
      const monthKey = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}`;
      // Charge on the 1st of the TARGET month (same month as lessons)
      const chargeDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
      
      const monthCharges = {
        month: monthKey,
        monthName: targetMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        chargeDate: chargeDate.toISOString().split('T')[0],
        chargeDateFormatted: chargeDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        subscriptions: [],
        totalAmount: 0,
        totalLessons: 0
      };
      
      for (const enrollment of enrollmentsResult.rows) {
        // Parse class_dates
        let classDates = enrollment.class_dates;
        if (typeof classDates === 'string') {
          try {
            classDates = JSON.parse(classDates);
          } catch (e) {
            classDates = [];
          }
        }
        if (!Array.isArray(classDates)) classDates = [];
        
        // Count lessons in this month
        const lessonsInMonth = classDates.filter(dateStr => {
          const date = new Date(dateStr);
          return date >= targetMonth && date <= targetMonthEnd;
        }).length;
        
        if (lessonsInMonth === 0) continue;
        
        const ratePerLesson = parseFloat(enrollment.rate_per_lesson) || 0;
        const amount = lessonsInMonth * ratePerLesson;
        
        // Parse metadata for additional info
        let metadata = {};
        try {
          metadata = typeof enrollment.metadata === 'string' 
            ? JSON.parse(enrollment.metadata) 
            : (enrollment.metadata || {});
        } catch (e) {
          metadata = {};
        }
        
        const clientName = enrollment.client_first_name && enrollment.client_last_name
          ? `${enrollment.client_first_name} ${enrollment.client_last_name}`
          : metadata.parentName || `Client ${enrollment.client_id}`;
        
        monthCharges.subscriptions.push({
          enrollmentId: enrollment.id,
          serviceId: enrollment.service_id,
          serviceName: enrollment.service_name || enrollment.term_name || `Service ${enrollment.service_id}`,
          clientId: enrollment.client_id,
          clientName: clientName,
          clientEmail: metadata.parentEmail || null,
          lessonsCount: lessonsInMonth,
          ratePerLesson: ratePerLesson,
          amount: amount,
          stripeSubscriptionId: enrollment.stripe_subscription_id
        });
        
        monthCharges.totalAmount += amount;
        monthCharges.totalLessons += lessonsInMonth;
      }
      
      // Only add month if there are charges
      if (monthCharges.subscriptions.length > 0) {
        upcomingCharges.push(monthCharges);
      }
    }
    
    res.json({
      upcomingCharges: upcomingCharges,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching upcoming charges');
    res.status(500).json({
      error: 'Failed to fetch upcoming charges',
      message: error.message
    });
  }
}));

/**
 * GET /api/billing/reconciliation
 * Returns payment-to-credit request mapping for reconciliation view
 * Includes both monthly and term billing
 */
router.get('/reconciliation', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { startDate, endDate, status, paymentType } = req.query;
    
    // Default to last 60 days if no date range provided
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 60);
    
    const filterStartDate = startDate || defaultStartDate.toISOString().split('T')[0];
    const filterEndDate = endDate || new Date().toISOString().split('T')[0];
    
    // Get billing history with enrollment and client info
    let query = `
      SELECT 
        sbh.*,
        se.client_id,
        se.service_id,
        se.payment_type,
        se.stripe_customer_id,
        se.stripe_subscription_id,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email,
        s.name as service_name,
        tbc.term_name
      FROM subscription_billing_history sbh
      JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
      LEFT JOIN clients c ON c.client_id::text = se.client_id::text
      LEFT JOIN "Services" s ON s."serviceId" = se.service_id
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      WHERE sbh.billing_month >= $1 AND sbh.billing_month <= $2
    `;
    
    const params = [filterStartDate, filterEndDate];
    let paramCount = 2;
    
    if (status && status !== 'all') {
      paramCount++;
      query += ` AND sbh.status = $${paramCount}`;
      params.push(status);
    }
    
    if (paymentType && paymentType !== 'all') {
      paramCount++;
      query += ` AND se.payment_type = $${paramCount}`;
      params.push(paymentType);
    }
    
    query += ` ORDER BY sbh.billing_month DESC, sbh.created_at DESC`;
    
    const result = await locationPool.query(query, params);
    
    // Process results to extract credit request info from metadata
    const reconciliationData = result.rows.map(row => {
      let metadata = {};
      try {
        metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : (row.metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      // Check for credit request info in metadata
      const creditRequestId = metadata.creditRequestId || null;
      const creditRequestIds = metadata.creditRequestIds || [];
      
      // Get the latest credit request info if it's an array
      let latestCreditRequest = null;
      if (creditRequestIds.length > 0) {
        latestCreditRequest = creditRequestIds[creditRequestIds.length - 1];
      }
      
      const clientName = row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : `Client ${row.client_id}`;
      
      return {
        billingHistoryId: row.id,
        enrollmentId: row.enrollment_id,
        billingMonth: row.billing_month,
        lessonsCount: row.lessons_count,
        amountCharged: parseFloat(row.amount_charged),
        stripeInvoiceId: row.stripe_invoice_id,
        stripePaymentIntentId: row.stripe_payment_intent_id,
        status: row.status,
        retryAttempt: row.retry_attempt,
        billedAt: row.billed_at,
        createdAt: row.created_at,
        
        // Enrollment info
        clientId: row.client_id,
        clientName: clientName,
        clientEmail: row.client_email,
        serviceId: row.service_id,
        serviceName: row.service_name || row.term_name || `Service ${row.service_id}`,
        paymentType: row.payment_type,
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        
        // Credit request info
        creditRequestId: creditRequestId || (latestCreditRequest?.creditRequestId) || null,
        creditRequestStatus: creditRequestId || latestCreditRequest ? 'created' : 'missing',
        creditRequestAmount: latestCreditRequest?.amount || null,
        
        // Flag for missing credit request
        hasCreditRequest: !!(creditRequestId || latestCreditRequest),
        needsAttention: row.status === 'succeeded' && !(creditRequestId || latestCreditRequest),
        
        // Term-specific: Mark as "Paid in Full"
        isPaidInFull: row.payment_type === 'term'
      };
    });
    
    // Calculate summary stats
    const summary = {
      total: reconciliationData.length,
      succeeded: reconciliationData.filter(r => r.status === 'succeeded').length,
      failed: reconciliationData.filter(r => r.status === 'failed').length,
      pending: reconciliationData.filter(r => r.status === 'pending').length,
      withCreditRequest: reconciliationData.filter(r => r.hasCreditRequest).length,
      missingCreditRequest: reconciliationData.filter(r => r.needsAttention).length,
      totalAmount: reconciliationData.reduce((sum, r) => sum + r.amountCharged, 0),
      // By type
      byType: {
        monthly: {
          count: reconciliationData.filter(r => r.paymentType === 'monthly').length,
          amount: reconciliationData.filter(r => r.paymentType === 'monthly').reduce((sum, r) => sum + r.amountCharged, 0)
        },
        term: {
          count: reconciliationData.filter(r => r.paymentType === 'term').length,
          amount: reconciliationData.filter(r => r.paymentType === 'term').reduce((sum, r) => sum + r.amountCharged, 0)
        }
      }
    };
    
    res.json({
      reconciliation: reconciliationData,
      summary: summary,
      dateRange: {
        startDate: filterStartDate,
        endDate: filterEndDate
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching reconciliation data');
    res.status(500).json({
      error: 'Failed to fetch reconciliation data',
      message: error.message
    });
  }
}));

/**
 * GET /api/billing/failed-payments
 * Returns failed payments that need attention (both monthly and term)
 */
router.get('/failed-payments', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { resolved, paymentType } = req.query;
    
    // Get failed billing history records
    let query = `
      SELECT 
        sbh.*,
        se.client_id,
        se.service_id,
        se.payment_type,
        se.stripe_customer_id,
        se.stripe_subscription_id,
        se.status as enrollment_status,
        c.first_name as client_first_name,
        c.last_name as client_last_name,
        c.email as client_email,
        c.phone as client_phone,
        s.name as service_name,
        tbc.term_name
      FROM subscription_billing_history sbh
      JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
      LEFT JOIN clients c ON c.client_id::text = se.client_id::text
      LEFT JOIN "Services" s ON s."serviceId" = se.service_id
      LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
      WHERE sbh.status = 'failed'
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (paymentType && paymentType !== 'all') {
      paramCount++;
      query += ` AND se.payment_type = $${paramCount}`;
      params.push(paymentType);
    }
    
    query += ` ORDER BY sbh.created_at DESC`;
    
    const failedBillingResult = await locationPool.query(query, params);
    
    // Also get payment failure details if available
    const failureDetailsResult = await locationPool.query(
      `SELECT * FROM subscription_payment_failures 
       WHERE resolved = $1
       ORDER BY created_at DESC`,
      [resolved === 'true']
    );
    
    // Create a map of failure details by billing_history_id
    const failureDetailsMap = new Map();
    for (const failure of failureDetailsResult.rows) {
      if (failure.billing_history_id) {
        failureDetailsMap.set(failure.billing_history_id, failure);
      }
    }
    
    const failedPayments = failedBillingResult.rows.map(row => {
      let metadata = {};
      try {
        metadata = typeof row.metadata === 'string' 
          ? JSON.parse(row.metadata) 
          : (row.metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      const failureDetails = failureDetailsMap.get(row.id);
      
      const clientName = row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : metadata.parentName || `Client ${row.client_id}`;
      
      return {
        billingHistoryId: row.id,
        enrollmentId: row.enrollment_id,
        billingMonth: row.billing_month,
        lessonsCount: row.lessons_count,
        amountDue: parseFloat(row.amount_charged),
        retryAttempt: row.retry_attempt || 0,
        createdAt: row.created_at,
        
        // Client info
        clientId: row.client_id,
        clientName: clientName,
        clientEmail: row.client_email || metadata.parentEmail,
        clientPhone: row.client_phone || metadata.parentPhone,
        
        // Service info
        serviceId: row.service_id,
        serviceName: row.service_name || row.term_name || `Service ${row.service_id}`,
        paymentType: row.payment_type,
        enrollmentStatus: row.enrollment_status,
        
        // Stripe info
        stripeCustomerId: row.stripe_customer_id,
        stripeSubscriptionId: row.stripe_subscription_id,
        stripeInvoiceId: row.stripe_invoice_id,
        
        // Failure details
        failureReason: failureDetails?.failure_reason || metadata.failureReason || 'Payment failed',
        stripeErrorCode: failureDetails?.stripe_error_code || metadata.stripeErrorCode,
        stripeErrorMessage: failureDetails?.stripe_error_message || metadata.stripeErrorMessage,
        resolved: failureDetails?.resolved || false,
        resolvedAt: failureDetails?.resolved_at,
        emailSent: failureDetails?.email_sent || false,
        emailSentAt: failureDetails?.email_sent_at
      };
    });
    
    // Summary stats
    const summary = {
      total: failedPayments.length,
      totalAmount: failedPayments.reduce((sum, p) => sum + p.amountDue, 0),
      resolved: failedPayments.filter(p => p.resolved).length,
      unresolved: failedPayments.filter(p => !p.resolved).length,
      emailsSent: failedPayments.filter(p => p.emailSent).length,
      byType: {
        monthly: failedPayments.filter(p => p.paymentType === 'monthly').length,
        term: failedPayments.filter(p => p.paymentType === 'term').length
      }
    };
    
    res.json({
      failedPayments: failedPayments,
      summary: summary
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching failed payments');
    res.status(500).json({
      error: 'Failed to fetch failed payments',
      message: error.message
    });
  }
}));

/**
 * POST /api/billing/create-missing-credit/:billingHistoryId
 * Manually create a credit request for a payment that's missing one
 */
router.post('/create-missing-credit/:billingHistoryId', auth, asyncHandler(async (req, res) => {
  try {
    const { billingHistoryId } = req.params;
    const locationPool = req.locationPool || pool;
    
    // Get billing history record with enrollment info
    const billingResult = await locationPool.query(
      `SELECT 
         sbh.*,
         se.client_id,
         se.service_id,
         se.payment_type,
         tbc.term_name
       FROM subscription_billing_history sbh
       JOIN subscription_enrollments se ON sbh.enrollment_id = se.id
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       WHERE sbh.id = $1`,
      [billingHistoryId]
    );
    
    if (billingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Billing history record not found' });
    }
    
    const billing = billingResult.rows[0];
    
    // Check if payment was successful
    if (billing.status !== 'succeeded') {
      return res.status(400).json({ 
        error: 'Cannot create credit request for non-successful payment',
        status: billing.status
      });
    }
    
    // Parse existing metadata
    let metadata = {};
    try {
      metadata = typeof billing.metadata === 'string' 
        ? JSON.parse(billing.metadata) 
        : (billing.metadata || {});
    } catch (e) {
      metadata = {};
    }
    
    // Check if credit request already exists
    if (metadata.creditRequestId || (metadata.creditRequestIds && metadata.creditRequestIds.length > 0)) {
      return res.status(400).json({ 
        error: 'Credit request already exists for this payment',
        creditRequestId: metadata.creditRequestId || metadata.creditRequestIds[metadata.creditRequestIds.length - 1]?.creditRequestId
      });
    }
    
    // Create credit request in TutorCruncher
    const amountCharged = parseFloat(billing.amount_charged);
    const lessonsCount = billing.lessons_count || 1;
    const billingMonthFormatted = new Date(billing.billing_month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    logger.info({ clientId: billing.client_id, amount: amountCharged }, '💳 Creating missing credit request');
    
    const paymentTypeLabel = billing.payment_type === 'monthly' ? 'Monthly Subscription' : 'Term';
    const creditRequestPayload = {
      amount: parseFloat(amountCharged.toFixed(2)),
      client: parseInt(billing.client_id),
      send_pfi: false, // Don't auto-raise — Stripe already collected payment, just create the accounting record
      description: `${paymentTypeLabel} Payment: $${amountCharged.toFixed(2)} for ${lessonsCount} lesson${lessonsCount !== 1 ? 's' : ''} (${billingMonthFormatted}) - Manual credit creation`
    };
    
    logger.info({ data: creditRequestPayload }, '📋 Credit request payload');
    
    const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
    const creditRequestId = creditResponse.data.id;
    const creditRequestStatus = creditResponse.data.status;
    logger.info({ creditRequestId, status: creditRequestStatus }, '✅ Created credit request (proforma invoice)');
    
    // Wait for credit request to be fully created
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mark credit as paid immediately
    try {
      await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
        amount: parseFloat(amountCharged.toFixed(2)),
        method: 'cash', // Record as externally paid — Stripe already collected the payment
        send_receipt: false
      });
      logger.info({ creditRequestId, amount: amountCharged }, '✅ Marked credit request as paid');
    } catch (paymentError) {
      logger.error({ error: paymentError.response?.data || paymentError.message }, '⚠️ Failed to mark credit request as paid');
      // Continue anyway - credit was created
    }
    
    // Update billing history metadata with credit request ID
    const updatedMetadata = {
      ...metadata,
      creditRequestId: creditRequestId,
      creditRequestCreatedAt: new Date().toISOString(),
      creditRequestManuallyCreated: true
    };
    
    await locationPool.query(
      `UPDATE subscription_billing_history 
       SET metadata = $1, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(updatedMetadata), billingHistoryId]
    );
    
    res.json({
      success: true,
      creditRequestId: creditRequestId,
      amount: amountCharged,
      clientId: billing.client_id,
      paymentType: billing.payment_type,
      message: `Credit request ${creditRequestId} created and marked as paid`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating missing credit request');
    res.status(500).json({
      error: 'Failed to create credit request',
      message: error.response?.data || error.message
    });
  }
}));

/**
 * POST /api/billing/mark-failure-resolved/:billingHistoryId
 * Mark a failed payment as resolved (manually handled)
 */
router.post('/mark-failure-resolved/:billingHistoryId', auth, asyncHandler(async (req, res) => {
  try {
    const { billingHistoryId } = req.params;
    const { resolution, notes } = req.body;
    const locationPool = req.locationPool || pool;
    
    // Update payment_failures table if record exists
    await locationPool.query(
      `UPDATE subscription_payment_failures 
       SET resolved = true, 
           resolved_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
       WHERE billing_history_id = $2`,
      [JSON.stringify({ resolution, notes, resolvedBy: 'admin' }), billingHistoryId]
    );
    
    // Update billing history metadata
    const billingResult = await locationPool.query(
      `SELECT metadata FROM subscription_billing_history WHERE id = $1`,
      [billingHistoryId]
    );
    
    if (billingResult.rows.length > 0) {
      let metadata = {};
      try {
        metadata = typeof billingResult.rows[0].metadata === 'string' 
          ? JSON.parse(billingResult.rows[0].metadata) 
          : (billingResult.rows[0].metadata || {});
      } catch (e) {
        metadata = {};
      }
      
      const updatedMetadata = {
        ...metadata,
        failureResolved: true,
        failureResolvedAt: new Date().toISOString(),
        failureResolution: resolution,
        failureNotes: notes
      };
      
      await locationPool.query(
        `UPDATE subscription_billing_history 
         SET metadata = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedMetadata), billingHistoryId]
      );
    }
    
    res.json({
      success: true,
      message: 'Payment failure marked as resolved'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error marking failure as resolved');
    res.status(500).json({
      error: 'Failed to mark failure as resolved',
      message: error.message
    });
  }
}));

/**
 * GET /api/billing/term-payments
 * Returns all term payments for the Term Payments view
 */
router.get('/term-payments', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await locationPool.query(
      `SELECT 
         se.*,
         sbh.amount_charged,
         sbh.status as payment_status,
         sbh.billing_month,
         sbh.metadata as billing_metadata,
         c.first_name as client_first_name,
         c.last_name as client_last_name,
         c.email as client_email,
         s.name as service_name,
         tbc.term_name,
         tbc.rate_per_lesson,
         tbc.term_discount_percent
       FROM subscription_enrollments se
       LEFT JOIN subscription_billing_history sbh ON se.id = sbh.enrollment_id
       LEFT JOIN clients c ON c.client_id::text = se.client_id::text
       LEFT JOIN "Services" s ON s."serviceId" = se.service_id
       LEFT JOIN term_billing_configs tbc ON se.service_id = tbc.service_id AND tbc.is_active = true
       WHERE se.payment_type = 'term'
       ORDER BY se.enrollment_date DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    
    const countResult = await locationPool.query(
      `SELECT COUNT(*) FROM subscription_enrollments WHERE payment_type = 'term'`
    );
    
    const termPayments = result.rows.map(row => {
      let metadata = {};
      let billingMetadata = {};
      try {
        metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
        billingMetadata = typeof row.billing_metadata === 'string' ? JSON.parse(row.billing_metadata) : (row.billing_metadata || {});
      } catch (e) {
        metadata = {};
        billingMetadata = {};
      }
      
      const clientName = row.client_first_name && row.client_last_name
        ? `${row.client_first_name} ${row.client_last_name}`
        : metadata.parentName || `Client ${row.client_id}`;
      
      return {
        enrollmentId: row.id,
        clientId: row.client_id,
        clientName: clientName,
        clientEmail: row.client_email || metadata.parentEmail,
        serviceId: row.service_id,
        serviceName: row.service_name || row.term_name || `Service ${row.service_id}`,
        enrollmentDate: row.enrollment_date,
        amountPaid: parseFloat(row.amount_charged) || 0,
        paymentStatus: row.payment_status || 'pending',
        lessonsRemaining: row.total_lessons_remaining || 0,
        ratePerLesson: parseFloat(row.rate_per_lesson) || 0,
        discountApplied: parseFloat(row.term_discount_percent) || 0,
        creditRequestId: billingMetadata.creditRequestId || metadata.creditRequestId || null,
        hasCreditRequest: !!(billingMetadata.creditRequestId || metadata.creditRequestId),
        status: row.status,
        isPaidInFull: row.status === 'active' && row.payment_status === 'succeeded'
      };
    });
    
    res.json({
      termPayments: termPayments,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching term payments');
    res.status(500).json({
      error: 'Failed to fetch term payments',
      message: error.message
    });
  }
}));

module.exports = router;
