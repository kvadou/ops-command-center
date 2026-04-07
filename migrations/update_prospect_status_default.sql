-- Update the default value for prospect_status from 'Waiting for Response' to 'Need To Contact'
-- This is the new first status in the workflow - Jena will use this to indicate prospects she hasn't contacted yet

ALTER TABLE clients
ALTER COLUMN prospect_status SET DEFAULT 'Need To Contact';

-- Note: This does NOT update existing records - only new records will get the new default
-- Existing prospects with 'Waiting for Response' will keep that status as it indicates Jena has already made contact
