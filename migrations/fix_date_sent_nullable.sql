-- Migration to make date_sent nullable in client_reports table
-- This allows reports to be created in "pending" status before being sent

-- Make date_sent nullable
ALTER TABLE client_reports 
ALTER COLUMN date_sent DROP NOT NULL;

-- Add a helpful comment
COMMENT ON COLUMN client_reports.date_sent IS 'Timestamp when the report was sent to the client. NULL if status is pending.';

