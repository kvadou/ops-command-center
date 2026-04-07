-- Migration: Add date_registration_complete field to clients table
-- This migration adds a date_registration_complete column to store when clients completed their booking form

-- Add date_registration_complete column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_registration_complete TIMESTAMP;

-- Create index for better performance on date_registration_complete filtering
CREATE INDEX IF NOT EXISTS idx_clients_date_registration_complete ON clients(date_registration_complete);

-- Add comment to document the registration complete date
COMMENT ON COLUMN clients.date_registration_complete IS 'Date when client completed their booking form submission (registration)';
