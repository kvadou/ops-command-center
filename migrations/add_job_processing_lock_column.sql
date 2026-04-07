-- Add database-level processing lock column for booking submissions
-- This replaces the in-memory PROCESSING_TRACKER which didn't work across multiple Heroku dynos
-- Added: 2026-01-07

-- Add column for tracking when job creation was claimed
ALTER TABLE booking_submissions
ADD COLUMN IF NOT EXISTS job_processing_claimed_at TIMESTAMP WITH TIME ZONE;

-- Add partial index for faster lookups on unclaimed submissions
CREATE INDEX IF NOT EXISTS idx_booking_submissions_processing
ON booking_submissions(id) WHERE job_processing_claimed_at IS NULL;

-- Comment explaining the column purpose
COMMENT ON COLUMN booking_submissions.job_processing_claimed_at IS
  'Timestamp when job creation processing was claimed. Used for distributed locking across dynos.';
