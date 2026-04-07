-- Migration: Make to_stage_id nullable in client_conversion_events
-- This allows logging prospect_status changes without requiring a pipeline_stage_id

BEGIN;

-- Make to_stage_id nullable if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'client_conversion_events'
  ) THEN
    -- Check if column exists and is NOT NULL
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'client_conversion_events' 
      AND column_name = 'to_stage_id' 
      AND is_nullable = 'NO'
    ) THEN
      -- Drop the NOT NULL constraint
      ALTER TABLE client_conversion_events ALTER COLUMN to_stage_id DROP NOT NULL;
      RAISE NOTICE 'Made to_stage_id nullable';
    END IF;
  END IF;
END $$;

COMMIT;
