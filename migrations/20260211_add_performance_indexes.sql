-- Performance indexes identified by audit (Sprint 1)
-- Run on ALL 5 databases

-- 1. Expression index for DATE(start) queries
-- 60 queries use DATE(a.start) which bypasses the existing idx_appointments_start index
CREATE INDEX IF NOT EXISTS idx_appointments_start_date
  ON appointments (((start AT TIME ZONE 'UTC')::date));

-- 2. GIN index on contractors.labels (matches existing clients.labels GIN index)
-- Entity list queries do JSONB operations on contractor labels without index support
CREATE INDEX IF NOT EXISTS idx_contractors_labels
  ON contractors USING GIN (labels);

-- 3. Partial index on booking_submissions.is_trial
-- Trial report queries filter WHERE is_trial = true on the full table
CREATE INDEX IF NOT EXISTS idx_booking_submissions_trial
  ON booking_submissions (is_trial) WHERE is_trial = true;
