-- Migration: Add lesson reports alert tracking table
-- This table tracks which report IDs have already been alerted about
-- to prevent sending duplicate alerts for the same issues

CREATE TABLE IF NOT EXISTS lesson_reports_alert_tracking (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'missing_brevo_id', 'pending_reports', 'unsent_reports', etc.
    environment VARCHAR(50) NOT NULL, -- 'production', 'staging', etc.
    first_alerted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_alerted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    alert_count INTEGER DEFAULT 1,
    UNIQUE(report_id, alert_type, environment)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_lesson_reports_alert_tracking_report_id ON lesson_reports_alert_tracking(report_id);
CREATE INDEX IF NOT EXISTS idx_lesson_reports_alert_tracking_environment ON lesson_reports_alert_tracking(environment);
CREATE INDEX IF NOT EXISTS idx_lesson_reports_alert_tracking_alert_type ON lesson_reports_alert_tracking(alert_type);
CREATE INDEX IF NOT EXISTS idx_lesson_reports_alert_tracking_last_alerted_at ON lesson_reports_alert_tracking(last_alerted_at DESC);

-- Add comment
COMMENT ON TABLE lesson_reports_alert_tracking IS 'Tracks which report IDs have been alerted about to prevent duplicate alerts';
