-- Add location column to services table
-- This column will store the default location from TutorCruncher services

BEGIN;

-- Add location column to services table
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS location VARCHAR(255);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_services_location ON services(location);

COMMIT;
