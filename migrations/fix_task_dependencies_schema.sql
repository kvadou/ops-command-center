-- Migration: Fix task_dependencies table schema
-- Renames columns from item_id/depends_on_item_id to task_id/depends_on_task_id
-- Adds missing columns from automation tables migration (dependency_type, created_by)
-- This fixes the 500 error when fetching task dependencies

BEGIN;

-- Check if we need to rename columns (if item_id exists but task_id doesn't)
DO $$
BEGIN
  -- Rename item_id to task_id if it exists and task_id doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'item_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'task_id'
  ) THEN
    ALTER TABLE task_dependencies RENAME COLUMN item_id TO task_id;
    RAISE NOTICE 'Renamed item_id to task_id';
  END IF;
  
  -- Rename depends_on_item_id to depends_on_task_id if it exists and depends_on_task_id doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'depends_on_item_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'depends_on_task_id'
  ) THEN
    ALTER TABLE task_dependencies RENAME COLUMN depends_on_item_id TO depends_on_task_id;
    RAISE NOTICE 'Renamed depends_on_item_id to depends_on_task_id';
  END IF;
END $$;

-- Add dependency_type column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'dependency_type'
  ) THEN
    ALTER TABLE task_dependencies 
    ADD COLUMN dependency_type TEXT NOT NULL DEFAULT 'finish_to_start';
    
    -- Add check constraint for dependency_type values
    ALTER TABLE task_dependencies 
    ADD CONSTRAINT task_dependencies_type_check 
    CHECK (dependency_type IN ('finish_to_start', 'start_to_start', 'finish_to_finish'));
    
    RAISE NOTICE 'Added dependency_type column';
  END IF;
END $$;

-- Add created_by column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND column_name = 'created_by'
  ) THEN
    ALTER TABLE task_dependencies 
    ADD COLUMN created_by TEXT;
    
    RAISE NOTICE 'Added created_by column';
  END IF;
END $$;

-- Update constraint names if they still reference old column names
DO $$
BEGIN
  -- Rename unique constraint if it exists with old name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND constraint_name = 'task_dependencies_item_id_depends_on_item_id_key'
  ) THEN
    ALTER TABLE task_dependencies 
    RENAME CONSTRAINT task_dependencies_item_id_depends_on_item_id_key 
    TO unique_dependency;
    RAISE NOTICE 'Renamed unique constraint';
  END IF;
  
  -- Rename check constraint for self-dependency if it exists with old name
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
    AND table_name = 'task_dependencies' 
    AND constraint_name = 'task_dependencies_check'
    AND constraint_type = 'CHECK'
  ) THEN
    -- Drop old constraint and recreate with new name
    ALTER TABLE task_dependencies 
    DROP CONSTRAINT IF EXISTS task_dependencies_check;
    
    ALTER TABLE task_dependencies 
    ADD CONSTRAINT no_self_dependency 
    CHECK (task_id != depends_on_task_id);
    
    RAISE NOTICE 'Recreated self-dependency check constraint';
  END IF;
END $$;

-- Update indexes if they reference old column names
DO $$
BEGIN
  -- Drop old index if it exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'task_dependencies' 
    AND indexname = 'idx_task_dependencies_item'
  ) THEN
    DROP INDEX IF EXISTS idx_task_dependencies_item;
    RAISE NOTICE 'Dropped old index idx_task_dependencies_item';
  END IF;
  
  -- Create new index if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'task_dependencies' 
    AND indexname = 'idx_task_dependencies_task_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id 
    ON task_dependencies(task_id);
    RAISE NOTICE 'Created index idx_task_dependencies_task_id';
  END IF;
  
  -- Drop old depends_on index if it exists
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'task_dependencies' 
    AND indexname = 'idx_task_dependencies_depends_on'
  ) THEN
    DROP INDEX IF EXISTS idx_task_dependencies_depends_on;
    RAISE NOTICE 'Dropped old index idx_task_dependencies_depends_on';
  END IF;
  
  -- Create new depends_on index if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'task_dependencies' 
    AND indexname = 'idx_task_dependencies_depends_on'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on 
    ON task_dependencies(depends_on_task_id);
    RAISE NOTICE 'Created index idx_task_dependencies_depends_on';
  END IF;
END $$;

COMMIT;
