-- Migration: Add comprehensive recipient fields to match TutorCruncher API
-- This migration adds all available fields from the TutorCruncher recipients API
-- to ensure we have complete student data including date of birth

-- Add new columns for comprehensive recipient data
ALTER TABLE recipients 
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS photo TEXT,
  ADD COLUMN IF NOT EXISTS mobile VARCHAR(50),
  ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100),
  ADD COLUMN IF NOT EXISTS title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS default_rate DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(255),
  ADD COLUMN IF NOT EXISTS calendar_colour VARCHAR(7),
  ADD COLUMN IF NOT EXISTS labels JSONB,
  ADD COLUMN IF NOT EXISTS extra_attrs JSONB,
  ADD COLUMN IF NOT EXISTS paying_client_id INTEGER,
  ADD COLUMN IF NOT EXISTS associated_clients JSONB,
  ADD COLUMN IF NOT EXISTS date_created TIMESTAMP WITH TIME ZONE;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_recipients_date_of_birth ON recipients(date_of_birth);
CREATE INDEX IF NOT EXISTS idx_recipients_paying_client_id ON recipients(paying_client_id);
CREATE INDEX IF NOT EXISTS idx_recipients_calendar_colour ON recipients(calendar_colour);
CREATE INDEX IF NOT EXISTS idx_recipients_email ON recipients(email) WHERE email IS NOT NULL;

-- Add comments to document the new fields
COMMENT ON COLUMN recipients.date_of_birth IS 'Student date of birth (extracted from extra_attrs.sr_dob)';
COMMENT ON COLUMN recipients.photo IS 'URL to student photo';
COMMENT ON COLUMN recipients.labels IS 'Array of label objects from TutorCruncher (e.g., Home - NYC, School - SF)';
COMMENT ON COLUMN recipients.extra_attrs IS 'Additional attributes including sr_dob, current_school, chess_level, etc.';
COMMENT ON COLUMN recipients.paying_client_id IS 'ID of the paying client (parent) for this recipient';
COMMENT ON COLUMN recipients.associated_clients IS 'Array of associated client IDs';
