/**
 * Billing Feature Flags
 *
 * Controls the rollout of STC's lesson billing engine.
 * ALL flags default to DISABLED for safety.
 *
 * Usage:
 *   const billingFlags = require('../config/billing-flags');
 *   if (!billingFlags.isActive()) return; // Early exit if disabled
 *
 * Safety:
 *   - All flags default to false (disabled)
 *   - Must be explicitly enabled via environment variables
 *   - Master kill switch (BILLING_SYSTEM_ACTIVE) overrides all other flags
 */


const { logger } = require('../utils/logger');
const billingFlags = {
  /**
   * Master kill switch - if false, ALL billing operations are disabled
   * This is the only flag that needs to be toggled for instant rollback
   */
  get BILLING_SYSTEM_ACTIVE() {
    return process.env.BILLING_SYSTEM_ACTIVE === 'true';
  },

  /**
   * Invoice source - who creates invoices
   * 'tutorcruncher' = TC creates invoices (current state)
   * 'stc' = STC creates invoices (go-live state)
   */
  get INVOICE_SOURCE() {
    return process.env.INVOICE_SOURCE || 'tutorcruncher';
  },

  /**
   * Shadow mode - logs what WOULD happen without executing
   * Enable this for testing and reconciliation
   */
  get SHADOW_MODE() {
    return process.env.BILLING_SHADOW_MODE === 'true';
  },

  /**
   * Granular feature flags - all require BILLING_SYSTEM_ACTIVE to be true
   */
  get INVOICE_CREATION_ENABLED() {
    return this.BILLING_SYSTEM_ACTIVE && process.env.BILLING_INVOICE_CREATION_ENABLED === 'true';
  },

  get AUTO_PAYMENT_ENABLED() {
    return this.BILLING_SYSTEM_ACTIVE && process.env.BILLING_AUTO_PAYMENT_ENABLED === 'true';
  },

  get STRIPE_CHARGING_ENABLED() {
    return this.BILLING_SYSTEM_ACTIVE && process.env.BILLING_STRIPE_CHARGING_ENABLED === 'true';
  },

  get EMAIL_NOTIFICATIONS_ENABLED() {
    return this.BILLING_SYSTEM_ACTIVE && process.env.BILLING_EMAIL_NOTIFICATIONS_ENABLED === 'true';
  },

  /**
   * Check if the billing system is active (convenience method)
   */
  isActive() {
    return this.BILLING_SYSTEM_ACTIVE;
  },

  /**
   * Check if STC is the invoice source
   */
  isSTCBilling() {
    return this.INVOICE_SOURCE === 'stc';
  },

  /**
   * Check if we're in shadow mode (test mode)
   */
  isShadowMode() {
    return this.SHADOW_MODE;
  },

  /**
   * Check if real payments can be processed
   * Requires: system active + not shadow mode + auto payment + stripe charging
   */
  canProcessPayments() {
    return this.BILLING_SYSTEM_ACTIVE &&
           !this.SHADOW_MODE &&
           this.AUTO_PAYMENT_ENABLED &&
           this.STRIPE_CHARGING_ENABLED;
  },

  /**
   * Get current state for logging/debugging
   */
  getState() {
    return {
      BILLING_SYSTEM_ACTIVE: this.BILLING_SYSTEM_ACTIVE,
      INVOICE_SOURCE: this.INVOICE_SOURCE,
      SHADOW_MODE: this.SHADOW_MODE,
      INVOICE_CREATION_ENABLED: this.INVOICE_CREATION_ENABLED,
      AUTO_PAYMENT_ENABLED: this.AUTO_PAYMENT_ENABLED,
      STRIPE_CHARGING_ENABLED: this.STRIPE_CHARGING_ENABLED,
      EMAIL_NOTIFICATIONS_ENABLED: this.EMAIL_NOTIFICATIONS_ENABLED,
      // Computed states
      isActive: this.isActive(),
      isSTCBilling: this.isSTCBilling(),
      isShadowMode: this.isShadowMode(),
      canProcessPayments: this.canProcessPayments()
    };
  },

  /**
   * Log current flag state (call on startup for debugging)
   */
  logState() {
    const state = this.getState();
    logger.info({ data: JSON.stringify(state, null, 2) }, '📊 Billing Feature Flags:');

    if (!state.BILLING_SYSTEM_ACTIVE) {
      logger.info('💤 Billing system is DISABLED (TutorCruncher handling all billing)');
    } else if (state.SHADOW_MODE) {
      logger.info('🔍 Billing system in SHADOW MODE (logging only, no real charges)');
    } else if (state.canProcessPayments) {
      logger.info('💳 Billing system ACTIVE and processing payments');
    } else {
      logger.info('⚠️  Billing system active but some features disabled');
    }

    return state;
  }
};

module.exports = billingFlags;
