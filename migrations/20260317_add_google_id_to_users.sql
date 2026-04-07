-- Add Google OAuth fields to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
