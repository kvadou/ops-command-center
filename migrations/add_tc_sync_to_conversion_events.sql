-- Migration: Add TC sync tracking columns to client_conversion_events
-- Tracks whether TutorCruncher was successfully updated when prospect status changes

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'client_conversion_events'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'client_conversion_events' AND column_name = 'tc_sync_status'
    ) THEN
      ALTER TABLE client_conversion_events ADD COLUMN tc_sync_status VARCHAR(20);
      COMMENT ON COLUMN client_conversion_events.tc_sync_status IS 'TutorCruncher sync result: success, failed, skipped';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'client_conversion_events' AND column_name = 'tc_sync_error'
    ) THEN
      ALTER TABLE client_conversion_events ADD COLUMN tc_sync_error TEXT;
    END IF;
  END IF;
END $$;

COMMIT;
