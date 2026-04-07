-- Migration: Create indexes for Financial Intelligence tables
-- This migration creates additional indexes for performance optimization

-- Stripe transactions indexes
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_account_created ON stripe_transactions(stripe_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_status ON stripe_transactions(status) WHERE status IN ('succeeded', 'paid', 'completed');

-- Ramp transactions indexes
CREATE INDEX IF NOT EXISTS idx_ramp_transactions_date_category ON ramp_transactions(transaction_date, category);
CREATE INDEX IF NOT EXISTS idx_ramp_transactions_merchant_date ON ramp_transactions(merchant_name, transaction_date DESC);

-- Payroll periods indexes
CREATE INDEX IF NOT EXISTS idx_payroll_periods_month ON payroll_periods(DATE_TRUNC('month', pay_period_date));

-- Financial rollups indexes
CREATE INDEX IF NOT EXISTS idx_monthly_financial_rollups_computed ON monthly_financial_rollups(computed_at DESC);
