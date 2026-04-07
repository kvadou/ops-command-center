-- Migration: Add tutor fields to clients table
-- This migration adds tutor-related fields to track which tutor is assigned to each client

-- Add tutor fields to clients table
ALTER TABLE clients
ADD COLUMN assigned_tutor_id INTEGER,
ADD COLUMN assigned_tutor_name VARCHAR(255);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_assigned_tutor_id ON clients (assigned_tutor_id);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_tutor_name ON clients (assigned_tutor_name);

-- Add foreign key constraint to contractors table
ALTER TABLE clients
ADD CONSTRAINT fk_clients_assigned_tutor_id 
FOREIGN KEY (assigned_tutor_id) REFERENCES contractors(contractor_id);

-- Add comments to document the fields
COMMENT ON COLUMN clients.assigned_tutor_id IS 'TutorCruncher contractor ID of the assigned tutor';
COMMENT ON COLUMN clients.assigned_tutor_name IS 'Name of the assigned tutor for display purposes';
