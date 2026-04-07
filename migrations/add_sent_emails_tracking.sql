-- Add column to track all email addresses that lesson reports were sent to
-- This allows storing multiple email addresses (client + all student parents)

ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS sent_emails JSONB DEFAULT '[]';

-- Add comment to document the purpose
COMMENT ON COLUMN client_reports.sent_emails IS 'JSON array of email addresses and student names that the lesson report was sent to. Format: [{"email": "email@example.com", "studentName": "Student Name", "type": "client|student"}]';

