-- Migration: Add unique constraint to prevent duplicate lesson reports
-- This fixes the issue where TutorCruncher sends multiple webhooks for the same lesson
-- when tutors use "copy all fields" functionality

-- First, clean up any existing duplicates (keep the oldest one per appointment + client combination)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY appointment_id, client_email ORDER BY id ASC) as rn
  FROM client_reports
  WHERE appointment_id IS NOT NULL AND client_email IS NOT NULL
)
DELETE FROM client_reports 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Add unique constraint to prevent future duplicates
-- Using a partial unique index to only enforce uniqueness when both fields are not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_reports_appointment_client_unique 
ON client_reports(appointment_id, client_email) 
WHERE appointment_id IS NOT NULL AND client_email IS NOT NULL;

-- Add comment to document the constraint
COMMENT ON INDEX idx_client_reports_appointment_client_unique IS 
'Prevents duplicate lesson reports for the same appointment and client combination. This addresses the issue where TutorCruncher sends multiple CREATED_REPORT webhooks when tutors use "copy all fields" functionality.';
