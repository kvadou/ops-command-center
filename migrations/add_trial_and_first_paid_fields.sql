-- Migration: Add trial follow-up and first paid lesson tracking fields to clients table
-- This migration adds boolean fields to track trial follow-up and first paid lesson status

-- Add trial_follow_up_completed column if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS trial_follow_up_completed BOOLEAN DEFAULT FALSE;

-- Add first_paid_lesson_scheduled column if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_paid_lesson_scheduled BOOLEAN DEFAULT FALSE;

-- Add first_paid_lesson_completed column if it doesn't exist
ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_paid_lesson_completed BOOLEAN DEFAULT FALSE;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_trial_follow_up_completed ON clients(trial_follow_up_completed);
CREATE INDEX IF NOT EXISTS idx_clients_first_paid_lesson_scheduled ON clients(first_paid_lesson_scheduled);
CREATE INDEX IF NOT EXISTS idx_clients_first_paid_lesson_completed ON clients(first_paid_lesson_completed);

-- Add comments for documentation
COMMENT ON COLUMN clients.trial_follow_up_completed IS 'Whether the trial follow-up has been completed';
COMMENT ON COLUMN clients.first_paid_lesson_scheduled IS 'Whether the first paid lesson has been scheduled';
COMMENT ON COLUMN clients.first_paid_lesson_completed IS 'Whether the first paid lesson has been completed';

