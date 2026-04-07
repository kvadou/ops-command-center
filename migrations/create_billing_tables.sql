-- Lesson Billing Engine Database Schema
-- Created: 2026-01-09
-- Purpose: Support STC billing system replacing TutorCruncher
--
-- IMPORTANT: Run this on ALL environments (main, staging, eastside, westside)
-- to prevent franchise database drift.

-- =============================================================================
-- SHADOW BILLING LOGS
-- Tracks what WOULD happen in shadow mode for reconciliation with TC
-- =============================================================================
CREATE TABLE IF NOT EXISTS shadow_billing_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  appointment_id INTEGER,
  client_id INTEGER,
  client_name TEXT,
  lesson_charge NUMERIC(10,2),
  current_available_balance NUMERIC(10,2),
  would_deduct_from_balance NUMERIC(10,2),
  would_charge_stripe NUMERIC(10,2),
  payment_method TEXT, -- 'balance_only', 'stripe_only', 'balance_plus_stripe'
  would_succeed BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for reconciliation queries
CREATE INDEX IF NOT EXISTS idx_shadow_logs_timestamp
  ON shadow_billing_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_shadow_logs_client
  ON shadow_billing_logs(client_id);

CREATE INDEX IF NOT EXISTS idx_shadow_logs_appointment
  ON shadow_billing_logs(appointment_id);

-- =============================================================================
-- PAYMENT RETRIES
-- Tracks retry attempts for failed Stripe charges
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_retries (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER,
  client_id INTEGER,
  retry_attempt INTEGER NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NOT NULL,
  executed_at TIMESTAMPTZ,
  result TEXT DEFAULT 'pending', -- 'pending', 'success', 'failed'
  error_message TEXT,
  stripe_error_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for scheduled retry processing
CREATE INDEX IF NOT EXISTS idx_retries_scheduled
  ON payment_retries(scheduled_at)
  WHERE result = 'pending';

CREATE INDEX IF NOT EXISTS idx_retries_invoice
  ON payment_retries(invoice_id);

-- =============================================================================
-- IDEMPOTENCY KEYS
-- Prevents duplicate processing across multiple Heroku dynos
-- Used by services/idempotency.js
-- =============================================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cleanup of expired keys
CREATE INDEX IF NOT EXISTS idx_idempotency_expires
  ON idempotency_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_key
  ON idempotency_keys(key);

-- =============================================================================
-- INVOICES TABLE EXTENSIONS
-- Add billing source tracking to existing invoices table
-- =============================================================================

-- Billing source: 'tutorcruncher' or 'stc'
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS billing_source TEXT DEFAULT 'tutorcruncher';

-- Track if auto-payment was attempted
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS auto_payment_attempted BOOLEAN DEFAULT false;

-- Store payment failure reason
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_failure_reason TEXT;

-- Store payment metadata (JSON: deducted_from_balance, charged_to_stripe, etc.)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS payment_metadata JSONB;

-- =============================================================================
-- CLIENT BALANCES EXTENSIONS
-- Ensure stripe_customer_id column exists for billing integration
-- =============================================================================
ALTER TABLE client_balances
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run this query to verify tables were created:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_name IN ('shadow_billing_logs', 'payment_retries', 'idempotency_keys');
