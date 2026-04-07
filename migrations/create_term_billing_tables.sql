-- Migration: Create term billing system tables
-- This migration creates tables for monthly subscription billing with date-based proration

-- Table: term_billing_configs
-- Stores term billing configuration per Job/Service
CREATE TABLE IF NOT EXISTS term_billing_configs (
    id SERIAL PRIMARY KEY,
    service_id VARCHAR(255) NOT NULL,
    term_name VARCHAR(255) NOT NULL,
    rate_per_lesson NUMERIC(10, 2) NOT NULL,
    term_discount_percent NUMERIC(5, 2) DEFAULT NULL,
    class_dates JSONB NOT NULL, -- Array of ISO date strings: ["2025-09-03", "2025-09-10", ...]
    total_lessons INTEGER NOT NULL,
    term_total NUMERIC(10, 2) NOT NULL,
    discounted_term_total NUMERIC(10, 2) DEFAULT NULL,
    lessons_per_month JSONB NOT NULL, -- {"2025-09": 4, "2025-10": 5, ...}
    family_discount_percent NUMERIC(5, 2) DEFAULT NULL, -- Configurable per franchise/school
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_term_billing_configs_service 
        FOREIGN KEY (service_id) REFERENCES "Services"("serviceId") 
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Table: subscription_enrollments
-- Tracks client subscriptions (monthly or term payments)
CREATE TABLE IF NOT EXISTS subscription_enrollments (
    id SERIAL PRIMARY KEY,
    service_id VARCHAR(255) NOT NULL,
    client_id VARCHAR(255) NOT NULL, -- TutorCruncher client ID
    recipient_id VARCHAR(255) DEFAULT NULL, -- TutorCruncher recipient/student ID
    stripe_customer_id VARCHAR(255) NOT NULL,
    stripe_subscription_id VARCHAR(255) DEFAULT NULL, -- NULL for term payments
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('monthly', 'term')),
    enrollment_date DATE NOT NULL,
    first_billing_date DATE NOT NULL,
    final_class_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'completed', 'failed', 'suspended')),
    current_month_lessons INTEGER DEFAULT 0,
    total_lessons_remaining INTEGER NOT NULL,
    family_enrollment_id INTEGER DEFAULT NULL, -- Links multiple children in same family subscription
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional data (proration info, discounts applied, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_subscription_enrollments_service 
        FOREIGN KEY (service_id) REFERENCES "Services"("serviceId") 
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_enrollments_family 
        FOREIGN KEY (family_enrollment_id) REFERENCES subscription_enrollments(id) 
        ON DELETE SET NULL
);

-- Table: subscription_billing_history
-- Tracks all billing events (charges, retries, failures)
CREATE TABLE IF NOT EXISTS subscription_billing_history (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER NOT NULL,
    billing_month DATE NOT NULL, -- First of month (e.g., 2025-09-01)
    lessons_count INTEGER NOT NULL,
    amount_charged NUMERIC(10, 2) NOT NULL,
    stripe_invoice_id VARCHAR(255) DEFAULT NULL,
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'retry')),
    retry_attempt INTEGER DEFAULT 0,
    tutorcruncher_manual_charge_id VARCHAR(255) DEFAULT NULL, -- If manual charge was synced
    manual_charge_credited BOOLEAN DEFAULT false, -- If manual charge was credited to next month
    billed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    metadata JSONB DEFAULT '{}'::jsonb, -- Additional billing details
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_subscription_billing_history_enrollment 
        FOREIGN KEY (enrollment_id) REFERENCES subscription_enrollments(id) 
        ON DELETE CASCADE
);

-- Table: subscription_payment_failures
-- Tracks payment failure events and retry attempts
CREATE TABLE IF NOT EXISTS subscription_payment_failures (
    id SERIAL PRIMARY KEY,
    enrollment_id INTEGER NOT NULL,
    billing_history_id INTEGER DEFAULT NULL,
    failure_reason TEXT,
    retry_attempt INTEGER NOT NULL,
    stripe_error_code VARCHAR(100) DEFAULT NULL,
    stripe_error_message TEXT DEFAULT NULL,
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT fk_subscription_payment_failures_enrollment 
        FOREIGN KEY (enrollment_id) REFERENCES subscription_enrollments(id) 
        ON DELETE CASCADE,
    CONSTRAINT fk_subscription_payment_failures_billing_history 
        FOREIGN KEY (billing_history_id) REFERENCES subscription_billing_history(id) 
        ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_term_billing_configs_service_id ON term_billing_configs(service_id);
CREATE INDEX IF NOT EXISTS idx_term_billing_configs_active ON term_billing_configs(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_service_id ON subscription_enrollments(service_id);
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_client_id ON subscription_enrollments(client_id);
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_stripe_subscription_id ON subscription_enrollments(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_status ON subscription_enrollments(status);
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_final_class_date ON subscription_enrollments(final_class_date);
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_family ON subscription_enrollments(family_enrollment_id);

CREATE INDEX IF NOT EXISTS idx_subscription_billing_history_enrollment_id ON subscription_billing_history(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_subscription_billing_history_billing_month ON subscription_billing_history(billing_month);
CREATE INDEX IF NOT EXISTS idx_subscription_billing_history_status ON subscription_billing_history(status);
CREATE INDEX IF NOT EXISTS idx_subscription_billing_history_stripe_invoice_id ON subscription_billing_history(stripe_invoice_id);

-- Unique constraint to prevent duplicate billing records
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_billing_history_unique 
  ON subscription_billing_history(enrollment_id, billing_month);

CREATE INDEX IF NOT EXISTS idx_subscription_payment_failures_enrollment_id ON subscription_payment_failures(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payment_failures_resolved ON subscription_payment_failures(resolved) WHERE resolved = false;

-- Comments for documentation
COMMENT ON TABLE term_billing_configs IS 'Stores term billing configuration per Job/Service with date-based lesson distribution';
COMMENT ON TABLE subscription_enrollments IS 'Tracks client subscriptions for monthly or term payments';
COMMENT ON TABLE subscription_billing_history IS 'Tracks all billing events including charges, retries, and failures';
COMMENT ON TABLE subscription_payment_failures IS 'Tracks payment failure events and retry attempts for monitoring and alerts';

COMMENT ON COLUMN term_billing_configs.class_dates IS 'Array of ISO date strings for all class dates in the term';
COMMENT ON COLUMN term_billing_configs.lessons_per_month IS 'JSON object mapping month (YYYY-MM) to lesson count';
COMMENT ON COLUMN subscription_enrollments.family_enrollment_id IS 'Links multiple children in same family subscription for combined billing';
COMMENT ON COLUMN subscription_billing_history.tutorcruncher_manual_charge_id IS 'TutorCruncher charge ID if manual charge was synced';
COMMENT ON COLUMN subscription_billing_history.manual_charge_credited IS 'Whether manual charge amount was credited to next month bill';














