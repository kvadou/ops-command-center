-- Migration: Create Invoice Reminders Tracking Table
-- This migration creates tables to track invoice reminders and fulfillment status

-- 1. Invoice Reminders Table
-- Tracks all reminders sent for invoices
CREATE TABLE IF NOT EXISTS invoice_reminders (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    
    -- Reminder details
    reminder_type VARCHAR(50) NOT NULL, -- 'first', 'second', 'third', 'final', 'custom'
    reminder_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    reminder_sent_by VARCHAR(255), -- User who sent the reminder
    reminder_method VARCHAR(50) DEFAULT 'email', -- 'email', 'phone', 'sms', 'manual'
    
    -- Email tracking (if sent via email)
    email_subject TEXT,
    email_message_id VARCHAR(255), -- Brevo/Klaviyo message ID for tracking
    email_opened_at TIMESTAMP WITH TIME ZONE,
    email_clicked_at TIMESTAMP WITH TIME ZONE,
    
    -- Reminder content
    reminder_message TEXT,
    reminder_notes TEXT, -- Internal notes about the reminder
    
    -- Status
    reminder_status VARCHAR(50) DEFAULT 'sent', -- 'sent', 'delivered', 'opened', 'clicked', 'failed'
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice_id ON invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_client_id ON invoice_reminders(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_sent_at ON invoice_reminders(reminder_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_type ON invoice_reminders(reminder_type);

-- 2. Invoice Fulfillment Status Table
-- Tracks fulfillment status and collection progress for invoices
CREATE TABLE IF NOT EXISTS invoice_fulfillment_status (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL UNIQUE,
    client_id BIGINT NOT NULL,
    
    -- Invoice details (denormalized for quick access)
    invoice_display_id TEXT,
    invoice_date_sent TIMESTAMP WITH TIME ZONE,
    invoice_amount NUMERIC(10, 2) NOT NULL,
    invoice_status VARCHAR(50) NOT NULL, -- 'paid', 'unpaid', 'partially_paid', 'cancelled'
    
    -- Fulfillment tracking
    fulfillment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'reminded', 'partially_collected', 'fulfilled', 'overdue'
    is_fulfilled BOOLEAN DEFAULT FALSE,
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    
    -- Collection tracking
    amount_collected NUMERIC(10, 2) DEFAULT 0,
    amount_outstanding NUMERIC(10, 2) NOT NULL,
    days_outstanding INTEGER DEFAULT 0,
    
    -- Reminder tracking (denormalized counts)
    reminder_count INTEGER DEFAULT 0,
    last_reminder_sent_at TIMESTAMP WITH TIME ZONE,
    next_reminder_due_at TIMESTAMP WITH TIME ZONE,
    
    -- Term/Period tracking (for school invoices)
    term_season VARCHAR(100), -- 'Fall 2025', 'Spring 2024', etc.
    billing_month DATE, -- Month this invoice is for (e.g., 2025-09-01 for September 2025)
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by VARCHAR(255)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_invoice_id ON invoice_fulfillment_status(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_client_id ON invoice_fulfillment_status(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_status ON invoice_fulfillment_status(fulfillment_status);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_billing_month ON invoice_fulfillment_status(billing_month);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_term_season ON invoice_fulfillment_status(term_season);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_fulfilled ON invoice_fulfillment_status(is_fulfilled);
CREATE INDEX IF NOT EXISTS idx_invoice_fulfillment_days_outstanding ON invoice_fulfillment_status(days_outstanding);

-- 3. School Revenue by Term Table
-- Tracks revenue per school per term for historical analysis
CREATE TABLE IF NOT EXISTS school_revenue_by_term (
    id SERIAL PRIMARY KEY,
    school_client_id BIGINT NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    
    -- Term details
    term_season VARCHAR(100) NOT NULL, -- 'Fall 2025', 'Spring 2024', etc.
    term_start_date DATE,
    term_end_date DATE,
    
    -- Revenue metrics
    total_revenue NUMERIC(10, 2) DEFAULT 0,
    total_tutor_cost NUMERIC(10, 2) DEFAULT 0,
    total_margin NUMERIC(10, 2) DEFAULT 0,
    margin_percentage NUMERIC(5, 2) DEFAULT 0,
    
    -- Enrollment metrics
    total_students INTEGER DEFAULT 0,
    total_lessons INTEGER DEFAULT 0,
    
    -- Invoice metrics
    total_invoiced NUMERIC(10, 2) DEFAULT 0,
    total_collected NUMERIC(10, 2) DEFAULT 0,
    total_outstanding NUMERIC(10, 2) DEFAULT 0,
    invoice_count INTEGER DEFAULT 0,
    paid_invoice_count INTEGER DEFAULT 0,
    unpaid_invoice_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_client_id, term_season)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_revenue_by_term_client_id ON school_revenue_by_term(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_revenue_by_term_season ON school_revenue_by_term(term_season);
CREATE INDEX IF NOT EXISTS idx_school_revenue_by_term_start_date ON school_revenue_by_term(term_start_date);

-- 4. School Revenue Over Time Table
-- Tracks monthly revenue per school for trend analysis
CREATE TABLE IF NOT EXISTS school_revenue_over_time (
    id SERIAL PRIMARY KEY,
    school_client_id BIGINT NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    
    -- Time period
    revenue_month DATE NOT NULL, -- First day of the month (e.g., 2025-09-01)
    
    -- Revenue metrics
    total_revenue NUMERIC(10, 2) DEFAULT 0,
    total_tutor_cost NUMERIC(10, 2) DEFAULT 0,
    total_margin NUMERIC(10, 2) DEFAULT 0,
    margin_percentage NUMERIC(5, 2) DEFAULT 0,
    
    -- Enrollment metrics
    total_students INTEGER DEFAULT 0,
    total_lessons INTEGER DEFAULT 0,
    
    -- Invoice metrics
    total_invoiced NUMERIC(10, 2) DEFAULT 0,
    total_collected NUMERIC(10, 2) DEFAULT 0,
    total_outstanding NUMERIC(10, 2) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(school_client_id, revenue_month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_revenue_over_time_client_id ON school_revenue_over_time(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_revenue_over_time_month ON school_revenue_over_time(revenue_month DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_fulfillment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_reminders_updated_at
    BEFORE UPDATE ON invoice_reminders
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_fulfillment_updated_at();

CREATE TRIGGER update_invoice_fulfillment_status_updated_at
    BEFORE UPDATE ON invoice_fulfillment_status
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_fulfillment_updated_at();

CREATE TRIGGER update_school_revenue_by_term_updated_at
    BEFORE UPDATE ON school_revenue_by_term
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_fulfillment_updated_at();

CREATE TRIGGER update_school_revenue_over_time_updated_at
    BEFORE UPDATE ON school_revenue_over_time
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_fulfillment_updated_at();

-- Comments for documentation
COMMENT ON TABLE invoice_reminders IS 'Tracks all reminders sent for invoices';
COMMENT ON TABLE invoice_fulfillment_status IS 'Tracks fulfillment status and collection progress for invoices';
COMMENT ON TABLE school_revenue_by_term IS 'Tracks revenue per school per term for historical analysis';
COMMENT ON TABLE school_revenue_over_time IS 'Tracks monthly revenue per school for trend analysis';

