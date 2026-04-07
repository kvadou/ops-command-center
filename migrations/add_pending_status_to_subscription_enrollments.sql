-- Migration: Add 'pending' status to subscription_enrollments
-- This allows enrollment records to be created immediately with pending status
-- and updated to active when subscription is fully set up

-- First, drop the existing CHECK constraint
ALTER TABLE subscription_enrollments 
DROP CONSTRAINT IF EXISTS subscription_enrollments_status_check;

-- Add the constraint back with 'pending' included
ALTER TABLE subscription_enrollments 
ADD CONSTRAINT subscription_enrollments_status_check 
CHECK (status IN ('active', 'cancelled', 'completed', 'failed', 'suspended', 'pending'));

-- Add index for pending enrollments (for quick lookups)
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_pending 
ON subscription_enrollments(status) 
WHERE status = 'pending';

-- Add index on metadata->>'submissionId' for quick lookups by submission ID
-- Using expression index for JSONB field access
CREATE INDEX IF NOT EXISTS idx_subscription_enrollments_submission_id 
ON subscription_enrollments ((metadata->>'submissionId'))
WHERE metadata->>'submissionId' IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN subscription_enrollments.status IS 'Enrollment status: pending (being set up), active (billing), cancelled, completed, failed, or suspended';
