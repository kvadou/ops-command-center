-- Add preferences JSONB column to users table for storing user-specific settings
-- This allows each user to have their own preferences (e.g., marketing analytics visibility settings)

BEGIN;

-- Check if column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'preferences'
  ) THEN
    ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{}'::jsonb;
    
    -- Create index for efficient queries on preferences
    CREATE INDEX IF NOT EXISTS idx_users_preferences ON users USING gin (preferences);
    
    COMMENT ON COLUMN users.preferences IS 'User-specific preferences stored as JSON (e.g., marketing analytics visibility settings)';
  END IF;
END $$;

COMMIT;

