-- Migration: Add extra_attrs and calendar_colour to affiliates table
-- This migration adds support for storing TutorCruncher agent extra_attrs and calendar_colour
-- to match the comprehensive data we're collecting in the Add Affiliate form

-- Add calendar_colour column
ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS calendar_colour VARCHAR(7);

-- Add extra_attrs JSONB column for storing custom fields
ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS extra_attrs JSONB;

-- Add other TutorCruncher agent fields that might be useful
ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mobile VARCHAR(50),
  ADD COLUMN IF NOT EXISTS street VARCHAR(255),
  ADD COLUMN IF NOT EXISTS town VARCHAR(255),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postcode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100),
  ADD COLUMN IF NOT EXISTS title VARCHAR(100),
  ADD COLUMN IF NOT EXISTS photo TEXT,
  ADD COLUMN IF NOT EXISTS received_notifications JSONB,
  ADD COLUMN IF NOT EXISTS labels JSONB,
  ADD COLUMN IF NOT EXISTS agent_id INTEGER; -- TutorCruncher agent ID

-- Create unique index on agent_id (allows multiple NULLs, but unique non-null values)
-- PostgreSQL unique constraints/indexes allow multiple NULLs by default
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_agent_id_unique ON affiliates(agent_id) WHERE agent_id IS NOT NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_affiliates_agent_id ON affiliates(agent_id);
-- Create unique index on agent_id (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliates_agent_id_unique ON affiliates(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliates_calendar_colour ON affiliates(calendar_colour);
CREATE INDEX IF NOT EXISTS idx_affiliates_extra_attrs ON affiliates USING GIN (extra_attrs);
CREATE INDEX IF NOT EXISTS idx_affiliates_first_name ON affiliates(first_name);
CREATE INDEX IF NOT EXISTS idx_affiliates_last_name ON affiliates(last_name);

-- Add comments to document the new fields
COMMENT ON COLUMN affiliates.calendar_colour IS 'Calendar colour for the affiliate (required field)';
COMMENT ON COLUMN affiliates.extra_attrs IS 'Additional affiliate attributes (gender, date_of_birth, commission_percent, etc.)';
COMMENT ON COLUMN affiliates.agent_id IS 'TutorCruncher agent ID for syncing';
