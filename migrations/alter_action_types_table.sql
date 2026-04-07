-- Alter action_types table to match the API response structure
-- The API returns action types with a 'key' field instead of 'id'

-- Drop the old primary key constraint if it exists
ALTER TABLE IF EXISTS action_types DROP CONSTRAINT IF EXISTS action_types_pkey;

-- Add new columns
ALTER TABLE IF EXISTS action_types ADD COLUMN IF NOT EXISTS action_key VARCHAR(255);
ALTER TABLE IF EXISTS action_types ADD COLUMN IF NOT EXISTS help_text TEXT;
ALTER TABLE IF EXISTS action_types ADD COLUMN IF NOT EXISTS extra_msg TEXT;
ALTER TABLE IF EXISTS action_types ADD COLUMN IF NOT EXISTS subject_types JSONB;

-- Change id to SERIAL if it's not already
-- First, check if we need to recreate the table
DO $$
BEGIN
  -- If id column exists and is INTEGER PRIMARY KEY, we need to change it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'action_types' 
    AND column_name = 'id' 
    AND data_type = 'integer'
  ) THEN
    -- Add a new SERIAL id column
    ALTER TABLE action_types ADD COLUMN IF NOT EXISTS id_new SERIAL;
    -- Drop old id column
    ALTER TABLE action_types DROP COLUMN IF EXISTS id;
    -- Rename new column
    ALTER TABLE action_types RENAME COLUMN id_new TO id;
    -- Add primary key
    ALTER TABLE action_types ADD PRIMARY KEY (id);
  END IF;
END $$;

-- Add unique constraint on action_key
ALTER TABLE action_types ADD CONSTRAINT action_types_action_key_unique UNIQUE (action_key);

-- Create index on action_key
CREATE INDEX IF NOT EXISTS idx_action_types_action_key ON action_types(action_key);


