-- Ensure required pipeline stages exist for client conversion tracker
-- These stages should already exist in TutorCruncher and be synced via syncPipelineStages,
-- but this migration ensures they exist locally if needed

BEGIN;

-- Check if pipeline_stages table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'pipeline_stages'
  ) THEN
    RAISE EXCEPTION 'pipeline_stages table does not exist. Please run add_labels_and_pipeline_stages.sql first.';
  END IF;
END $$;

-- Required pipeline stages for client conversion tracker
-- Note: These stages should be created in TutorCruncher first, then synced via syncPipelineStages
-- This migration only ensures they exist locally with the correct names
-- The IDs will be synced from TutorCruncher when syncPipelineStages runs

-- We'll create a function to check and optionally create stages if they don't exist
-- However, since stages are synced from TutorCruncher, we'll just verify they exist
-- and log a warning if they don't

DO $$
DECLARE
  required_stages TEXT[] := ARRAY['New Lead', 'Home or Online', 'Waiting to Pair', 'Trial Bucket', 'Won', 'Lost'];
  stage_name TEXT;
  stage_exists BOOLEAN;
  missing_stages TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Check each required stage
  FOREACH stage_name IN ARRAY required_stages
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM pipeline_stages 
      WHERE LOWER(name) = LOWER(stage_name)
    ) INTO stage_exists;
    
    IF NOT stage_exists THEN
      missing_stages := array_append(missing_stages, stage_name);
    END IF;
  END LOOP;
  
  -- Log missing stages (they should be created in TutorCruncher and synced)
  IF array_length(missing_stages, 1) > 0 THEN
    RAISE NOTICE 'The following pipeline stages are missing and should be created in TutorCruncher: %', array_to_string(missing_stages, ', ');
    RAISE NOTICE 'After creating them in TutorCruncher, run syncPipelineStages() to sync them to the local database.';
  ELSE
    RAISE NOTICE 'All required pipeline stages exist in the database.';
  END IF;
END $$;

-- Create indexes if they don't exist for better performance
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_name_lower ON pipeline_stages(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_active ON pipeline_stages(active) WHERE active = TRUE;

COMMIT;

