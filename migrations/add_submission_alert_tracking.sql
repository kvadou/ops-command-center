-- Migration: Add submission alert tracking table
-- This table tracks which submission IDs have already been alerted about
-- to prevent sending duplicate alerts for the same issues

CREATE TABLE IF NOT EXISTS submission_alert_tracking (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL,
    alert_type VARCHAR(50) NOT NULL, -- 'stuck' or 'orphaned_paid'
    environment VARCHAR(50) NOT NULL, -- 'production', 'staging', etc.
    first_alerted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_alerted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    alert_count INTEGER DEFAULT 1,
    UNIQUE(submission_id, alert_type, environment)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_submission_alert_tracking_submission_id ON submission_alert_tracking(submission_id);
CREATE INDEX IF NOT EXISTS idx_submission_alert_tracking_environment ON submission_alert_tracking(environment);
CREATE INDEX IF NOT EXISTS idx_submission_alert_tracking_alert_type ON submission_alert_tracking(alert_type);

-- Add comment
COMMENT ON TABLE submission_alert_tracking IS 'Tracks which submission IDs have been alerted about to prevent duplicate alerts';
