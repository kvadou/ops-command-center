-- Migration: Add market field to clients table
-- This migration adds a market column to store the calculated market based on labels

-- Add market column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS market VARCHAR(50);

-- Create index for better performance on market filtering
CREATE INDEX IF NOT EXISTS idx_clients_market ON clients(market);

-- Add comment to document the market mapping
COMMENT ON COLUMN clients.market IS 'Market derived from client labels: NYC, LA, SF, Westchester, Hamptons, Online, Tournament';
