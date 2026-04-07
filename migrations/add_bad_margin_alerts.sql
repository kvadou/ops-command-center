-- Migration: Add bad margin alerts tables
-- This migration creates tables for managing bad margin alert configuration and history

-- Table: bad_margin_alert_config
-- Stores configuration for bad margin alerts (emails, threshold, exceptions)
CREATE TABLE IF NOT EXISTS bad_margin_alert_config (
    id SERIAL PRIMARY KEY,
    margin_threshold NUMERIC(5, 2) NOT NULL DEFAULT 29.00, -- Percentage threshold (e.g., 29.00 for 29%)
    alert_emails TEXT[] NOT NULL DEFAULT ARRAY['support@acmeops.com'], -- Array of email addresses
    exception_service_ids INTEGER[], -- Service IDs to exclude from alerts
    exception_labels TEXT[], -- Label names/substrings to exclude (e.g., 'school', 'non', 'support')
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT single_config CHECK (id = 1) -- Only allow one config row
);

-- Insert default config (id must be 1 due to constraint)
INSERT INTO bad_margin_alert_config (id, margin_threshold, alert_emails, exception_labels, enabled)
VALUES (1, 29.00, ARRAY['support@acmeops.com'], ARRAY['school', 'non', 'support'], true)
ON CONFLICT (id) DO NOTHING;

-- Table: bad_margin_alerts
-- Stores history of all bad margin alerts that have been sent
CREATE TABLE IF NOT EXISTS bad_margin_alerts (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL,
    service_id INTEGER NOT NULL,
    service_name VARCHAR(255),
    tutor_name VARCHAR(255),
    tutor_id INTEGER,
    
    -- Financial details
    total_revenue NUMERIC(10, 2) NOT NULL,
    base_tutor_cost NUMERIC(10, 2) NOT NULL,
    student_premium NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_tutor_cost NUMERIC(10, 2) NOT NULL,
    profit_loss NUMERIC(10, 2) NOT NULL,
    margin_percentage NUMERIC(5, 2) NOT NULL,
    
    -- Student details
    student_count INTEGER NOT NULL DEFAULT 0,
    units NUMERIC(5, 2),
    sr_premium NUMERIC(10, 2),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'ignored'
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    resolution_notes TEXT,
    
    -- Metadata
    alert_sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tutorcruncher_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_bad_margin_alerts_appointment_id ON bad_margin_alerts(appointment_id);
CREATE INDEX IF NOT EXISTS idx_bad_margin_alerts_service_id ON bad_margin_alerts(service_id);
CREATE INDEX IF NOT EXISTS idx_bad_margin_alerts_status ON bad_margin_alerts(status);
CREATE INDEX IF NOT EXISTS idx_bad_margin_alerts_alert_sent_at ON bad_margin_alerts(alert_sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_bad_margin_alerts_margin_percentage ON bad_margin_alerts(margin_percentage);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bad_margin_alert_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bad_margin_alert_config_updated_at
    BEFORE UPDATE ON bad_margin_alert_config
    FOR EACH ROW
    EXECUTE FUNCTION update_bad_margin_alert_config_updated_at();

CREATE OR REPLACE FUNCTION update_bad_margin_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bad_margin_alerts_updated_at
    BEFORE UPDATE ON bad_margin_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_bad_margin_alerts_updated_at();
