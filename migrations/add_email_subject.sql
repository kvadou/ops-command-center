-- Add email_subject column to client_reports table
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255) DEFAULT 'Acme Operations Lesson Report';

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_client_reports_email_subject ON client_reports(email_subject);
