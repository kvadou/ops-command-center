-- Migration to add error_logs table for better error tracking
-- This table will store critical errors that need manual review

CREATE TABLE IF NOT EXISTS error_logs (
    id SERIAL PRIMARY KEY,
    error_type VARCHAR(100) NOT NULL,
    client_id INTEGER,
    submission_id INTEGER,
    error_message TEXT NOT NULL,
    error_data JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_client_id ON error_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_submission_id ON error_logs(submission_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON error_logs(resolved);
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at);

-- Add comments for documentation
COMMENT ON TABLE error_logs IS 'Stores critical errors that need manual review and resolution';
COMMENT ON COLUMN error_logs.error_type IS 'Type of error (e.g., auto_charge_update_failed, client_creation_failed)';
COMMENT ON COLUMN error_logs.client_id IS 'TutorCruncher client ID if applicable';
COMMENT ON COLUMN error_logs.submission_id IS 'Booking submission ID if applicable';
COMMENT ON COLUMN error_logs.error_message IS 'Human-readable error message';
COMMENT ON COLUMN error_logs.error_data IS 'Additional error data in JSON format';
COMMENT ON COLUMN error_logs.resolved IS 'Whether the error has been resolved';
COMMENT ON COLUMN error_logs.resolved_at IS 'When the error was resolved';
COMMENT ON COLUMN error_logs.resolved_by IS 'Who resolved the error';
