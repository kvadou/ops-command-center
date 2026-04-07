-- Add is_deleted column to appointments table to track deleted appointments from TutorCruncher
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_appointments_is_deleted ON appointments(is_deleted);

-- Mark the specific appointment that's deleted as an example
UPDATE appointments SET is_deleted = TRUE WHERE appointment_id = 18406579;

