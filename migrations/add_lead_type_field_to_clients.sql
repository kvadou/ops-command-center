-- Migration: Add lead_type field to clients table
-- This migration adds a lead_type column to store the lead type for each client

-- Add lead_type column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_type VARCHAR(50);

-- Create index for better performance on lead_type filtering
CREATE INDEX IF NOT EXISTS idx_clients_lead_type ON clients(lead_type);

-- Add comment to document the lead type options
COMMENT ON COLUMN clients.lead_type IS 'Lead type for client: New Lead, Returning Lead, Unregistered, Referral, New Lead/Auction, Takeover, Other';
