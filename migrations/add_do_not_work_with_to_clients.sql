-- Add do_not_work_with field to clients table
-- This field marks schools/clients that should not be contacted or serviced

BEGIN;

-- Add do_not_work_with column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'do_not_work_with'
  ) THEN
    ALTER TABLE clients ADD COLUMN do_not_work_with BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add index for filtering
CREATE INDEX IF NOT EXISTS idx_clients_do_not_work_with ON clients(do_not_work_with) WHERE do_not_work_with = TRUE;

-- Add comment
COMMENT ON COLUMN clients.do_not_work_with IS 'Marks clients/schools that should not be contacted or serviced in the future';

COMMIT;
