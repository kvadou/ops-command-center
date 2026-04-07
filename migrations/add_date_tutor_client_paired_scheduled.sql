-- Migration: Add date_tutor_client_paired_scheduled field to clients table
-- This migration adds a date_tutor_client_paired_scheduled column to store when tutor and client are scheduled together

-- Add date_tutor_client_paired_scheduled column to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_tutor_client_paired_scheduled TIMESTAMP WITHOUT TIME ZONE;

-- Create index for better performance on date_tutor_client_paired_scheduled filtering
CREATE INDEX IF NOT EXISTS idx_clients_date_tutor_client_paired_scheduled ON clients(date_tutor_client_paired_scheduled);

-- Add comment to document the scheduled pairing date
COMMENT ON COLUMN clients.date_tutor_client_paired_scheduled IS 'Date when tutor and client are actually scheduled together (scheduled pairing)';

-- Also ensure date_tutor_client_paired and date_trial_first_lesson exist if they don't already
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_tutor_client_paired TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_trial_first_lesson TIMESTAMP WITHOUT TIME ZONE;

-- Create indexes for these fields if they don't exist
CREATE INDEX IF NOT EXISTS idx_clients_date_tutor_client_paired ON clients(date_tutor_client_paired);
CREATE INDEX IF NOT EXISTS idx_clients_date_trial_first_lesson ON clients(date_trial_first_lesson);

