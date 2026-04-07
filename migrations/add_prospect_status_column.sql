-- Migration: Add prospect_status column to clients table
-- This migration adds a new prospect_status column specifically for the prospect pipeline status tracking
-- Separate from the existing 'status' column which tracks overall client status (prospect/live/dormant)

BEGIN;

-- Add prospect_status column to clients table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'prospect_status'
  ) THEN
    ALTER TABLE clients ADD COLUMN prospect_status VARCHAR(50) DEFAULT 'Waiting for Response';
    
    -- Add comment for documentation
    COMMENT ON COLUMN clients.prospect_status IS 'Prospect pipeline status: Waiting for Response, Building, Waiting to Pair, Waiting for Trial, Trial Follow-Up, Won, Lost';
  END IF;
END $$;

-- Update client_conversion_events table to track prospect_status changes
-- Add from_prospect_status and to_prospect_status columns if they don't exist
-- Only if the table exists
DO $$
BEGIN
  -- Check if table exists first
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'client_conversion_events'
  ) THEN
    -- Table exists, add columns if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_conversion_events' AND column_name = 'from_prospect_status'
    ) THEN
      ALTER TABLE client_conversion_events ADD COLUMN from_prospect_status VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_conversion_events' AND column_name = 'to_prospect_status'
    ) THEN
      ALTER TABLE client_conversion_events ADD COLUMN to_prospect_status VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_conversion_events' AND column_name = 'automation_trigger'
    ) THEN
      ALTER TABLE client_conversion_events ADD COLUMN automation_trigger VARCHAR(100);
      COMMENT ON COLUMN client_conversion_events.automation_trigger IS 'Reason for status change: manual, date_offered_to_tutors, trial_date_set, trial_date_passed, 14_day_timeout, trial_completed, paid_lesson_completed';
    END IF;
  END IF;
END $$;

-- Create index for better performance on prospect_status queries
CREATE INDEX IF NOT EXISTS idx_clients_prospect_status ON clients(prospect_status);

-- Create index for prospect_status changes in events table (only if table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'client_conversion_events'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE indexname = 'idx_conversion_events_prospect_status'
    ) THEN
      CREATE INDEX idx_conversion_events_prospect_status ON client_conversion_events(to_prospect_status, created_at);
    END IF;
  END IF;
END $$;

COMMIT;
