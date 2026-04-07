-- Migration: Update event_leads table to work without TutorCruncher
-- Date: 2026-01-28
-- Purpose: Remove TC dependency, add student_names, notes, and follow-up columns

-- Make client_id nullable (no longer required since we're not using TC)
ALTER TABLE event_leads ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE event_leads DROP CONSTRAINT IF EXISTS event_leads_client_id_key;

-- Add student_names column for storing multiple student names
ALTER TABLE event_leads ADD COLUMN IF NOT EXISTS student_names TEXT;

-- Add notes column if it doesn't exist
ALTER TABLE event_leads ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add follow-up tracking columns if they don't exist
ALTER TABLE event_leads ADD COLUMN IF NOT EXISTS followed_up BOOLEAN DEFAULT FALSE;
ALTER TABLE event_leads ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE event_leads ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;

-- Add index on email for duplicate checking
CREATE INDEX IF NOT EXISTS idx_event_leads_email_event ON event_leads(email, event_id);

-- Update comments
COMMENT ON COLUMN event_leads.client_id IS 'Legacy: TutorCruncher client ID - now nullable since TC integration removed';
COMMENT ON COLUMN event_leads.student_names IS 'Comma-separated list of student names';
COMMENT ON COLUMN event_leads.notes IS 'Additional notes or questions from the lead';
COMMENT ON COLUMN event_leads.followed_up IS 'Whether someone has followed up with this lead';
COMMENT ON COLUMN event_leads.followed_up_at IS 'When the lead was followed up with';
COMMENT ON COLUMN event_leads.follow_up_notes IS 'Notes from the follow-up conversation';
