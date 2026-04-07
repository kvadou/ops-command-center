-- Add state column to clients table
-- This column stores the US state code for clients with US addresses
-- Required for proper address storage from TutorCruncher webhooks

ALTER TABLE clients ADD COLUMN IF NOT EXISTS state VARCHAR(50);

-- Add comment for documentation
COMMENT ON COLUMN clients.state IS 'US state code (2-letter abbreviation) for clients with US addresses';

