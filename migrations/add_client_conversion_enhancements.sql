-- Migration: Add Client Conversion Tracker Enhancements
-- This migration adds new columns and tables needed for the enhanced client conversion tracker

BEGIN;

-- Add new columns to clients table
DO $$
BEGIN
  -- Internal notes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'internal_notes'
  ) THEN
    ALTER TABLE clients ADD COLUMN internal_notes TEXT;
  END IF;
  
  -- Date registration out column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'date_registration_out'
  ) THEN
    ALTER TABLE clients ADD COLUMN date_registration_out DATE;
  END IF;
  
  -- Archived at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'archived_at'
  ) THEN
    ALTER TABLE clients ADD COLUMN archived_at TIMESTAMPTZ;
  END IF;
  
  -- Is takeover flag
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'is_takeover'
  ) THEN
    ALTER TABLE clients ADD COLUMN is_takeover BOOLEAN DEFAULT FALSE;
  END IF;
  
  -- Client spend (cached, can be calculated on-the-fly)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'client_spend'
  ) THEN
    ALTER TABLE clients ADD COLUMN client_spend DECIMAL(10,2) DEFAULT 0;
  END IF;
END $$;

-- Create client_tutor_history table to track previous tutor pairings
CREATE TABLE IF NOT EXISTS client_tutor_history (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tutor_id INTEGER,
  tutor_name VARCHAR(255) NOT NULL,
  paired_at TIMESTAMPTZ NOT NULL,
  unpaired_at TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_internal_notes ON clients(internal_notes) WHERE internal_notes IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_date_registration_out ON clients(date_registration_out) WHERE date_registration_out IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON clients(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_is_takeover ON clients(is_takeover) WHERE is_takeover = TRUE;
CREATE INDEX IF NOT EXISTS idx_clients_client_spend ON clients(client_spend) WHERE client_spend > 0;

CREATE INDEX IF NOT EXISTS idx_client_tutor_history_client_id ON client_tutor_history(client_id);
CREATE INDEX IF NOT EXISTS idx_client_tutor_history_tutor_id ON client_tutor_history(tutor_id);
CREATE INDEX IF NOT EXISTS idx_client_tutor_history_paired_at ON client_tutor_history(paired_at);

-- Add trigger for updated_at on client_tutor_history
CREATE TRIGGER update_client_tutor_history_updated_at 
BEFORE UPDATE ON client_tutor_history 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Ensure Dead Lead is in lead_type options (this is handled in application code, but document here)
-- Lead types: New Lead, Returning Lead, Referral, New Lead/Auction, Takeover, Unregistered, Other, Dead Lead

COMMIT;

