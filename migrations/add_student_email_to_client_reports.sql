-- Add student_email column to client_reports table
-- This allows storing student email addresses for sending reports to both parents and students

ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS student_email VARCHAR(255);

-- Add a comment to document the purpose
COMMENT ON COLUMN client_reports.student_email IS 'Email address of the student (recipient) - may be null if student has no email';
