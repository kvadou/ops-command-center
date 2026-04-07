-- Add Brevo email tracking fields to client_reports table
-- This migration adds fields to track email opens, clicks, and other engagement metrics

-- 1. Add Brevo message ID for tracking
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS brevo_message_id VARCHAR(255);

-- 2. Add email open tracking
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_opened_count INTEGER DEFAULT 0;

-- 3. Add email click tracking
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS email_clicked_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_clicked_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS email_clicked_urls TEXT[];

-- 4. Add delivery status tracking
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS email_delivered_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_bounced_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_complained_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS email_unsubscribed_at TIMESTAMP;

-- 5. Add engagement score and last activity
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS engagement_score DECIMAL(3,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMP;

-- 6. Add Brevo webhook event log
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS brevo_events JSONB DEFAULT '[]';

-- 7. Create indexes for tracking queries
CREATE INDEX IF NOT EXISTS idx_client_reports_brevo_message_id ON client_reports(brevo_message_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_email_opened_at ON client_reports(email_opened_at);
CREATE INDEX IF NOT EXISTS idx_client_reports_email_clicked_at ON client_reports(email_clicked_at);
CREATE INDEX IF NOT EXISTS idx_client_reports_engagement_score ON client_reports(engagement_score);
CREATE INDEX IF NOT EXISTS idx_client_reports_last_engagement_at ON client_reports(last_engagement_at);

-- 8. Add comments to document the new columns
COMMENT ON COLUMN client_reports.brevo_message_id IS 'Brevo message ID for tracking email events';
COMMENT ON COLUMN client_reports.email_opened_at IS 'Timestamp when email was first opened';
COMMENT ON COLUMN client_reports.email_opened_count IS 'Number of times email has been opened';
COMMENT ON COLUMN client_reports.email_clicked_at IS 'Timestamp when email was first clicked';
COMMENT ON COLUMN client_reports.email_clicked_count IS 'Number of times email has been clicked';
COMMENT ON COLUMN client_reports.email_clicked_urls IS 'Array of URLs that were clicked in the email';
COMMENT ON COLUMN client_reports.email_delivered_at IS 'Timestamp when email was delivered';
COMMENT ON COLUMN client_reports.email_bounced_at IS 'Timestamp when email bounced';
COMMENT ON COLUMN client_reports.email_complained_at IS 'Timestamp when recipient marked as spam';
COMMENT ON COLUMN client_reports.email_unsubscribed_at IS 'Timestamp when recipient unsubscribed';
COMMENT ON COLUMN client_reports.engagement_score IS 'Calculated engagement score (0.00-1.00)';
COMMENT ON COLUMN client_reports.last_engagement_at IS 'Timestamp of most recent engagement';
COMMENT ON COLUMN client_reports.brevo_events IS 'JSON array of all Brevo webhook events for this email';
