-- Migration: Add unique constraint on email for affiliates table
-- This ensures we can use ON CONFLICT (email) in sync scripts

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'affiliates_email_key'
  ) THEN
    ALTER TABLE affiliates ADD CONSTRAINT affiliates_email_key UNIQUE (email);
  END IF;
END $$;

