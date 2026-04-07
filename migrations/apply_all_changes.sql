-- Apply all database changes made today to client_reports table
-- This script combines all the individual migration files

-- 1. Add lesson_id and appointment_id columns
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS lesson_id INTEGER,
ADD COLUMN IF NOT EXISTS appointment_id INTEGER;

-- 2. Add student_email column
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS student_email VARCHAR(255);

-- 3. Add email_subject column
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS email_subject VARCHAR(255) DEFAULT 'Acme Operations Lesson Report';

-- 4. Modify date_sent column to allow NULL values
ALTER TABLE client_reports 
ALTER COLUMN date_sent DROP NOT NULL;

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_client_reports_lesson_id ON client_reports(lesson_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_appointment_id ON client_reports(appointment_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_email_subject ON client_reports(email_subject);

-- 6. Add comment to document the student_email column purpose
COMMENT ON COLUMN client_reports.student_email IS 'Email address of the student (recipient) - may be null if student has no email';

-- 7. Update existing records to have the default email subject if they don't have one
UPDATE client_reports 
SET email_subject = 'Acme Operations Lesson Report' 
WHERE email_subject IS NULL;

-- 8. Set date_sent to NULL for existing records that were created but not actually sent
-- (This assumes reports with status 'pending' should have NULL date_sent)
UPDATE client_reports 
SET date_sent = NULL 
WHERE status = 'pending' AND date_sent IS NOT NULL;
