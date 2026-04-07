-- Migration: Add app_access column to users table
-- Controls which Heroku apps each user can log into
-- Default: all apps enabled (preserves existing behavior)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS app_access JSONB DEFAULT '{"main":true,"staging":true,"westside":true,"eastside":true}'::jsonb;

-- Backfill existing users to have full access
UPDATE users SET app_access = '{"main":true,"staging":true,"westside":true,"eastside":true}'::jsonb
WHERE app_access IS NULL;

COMMENT ON COLUMN users.app_access IS 'Per-application access control: {main, staging, westside, eastside} = true/false';
