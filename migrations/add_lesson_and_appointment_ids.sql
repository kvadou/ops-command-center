-- Add lesson_id and appointment_id columns to client_reports table
ALTER TABLE client_reports 
ADD COLUMN IF NOT EXISTS lesson_id INTEGER,
ADD COLUMN IF NOT EXISTS appointment_id INTEGER;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_client_reports_lesson_id ON client_reports(lesson_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_appointment_id ON client_reports(appointment_id);
