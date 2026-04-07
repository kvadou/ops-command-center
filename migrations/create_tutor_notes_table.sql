-- Migration: Create tutor_notes table for CRM functionality
-- Similar to client_notes table structure

-- Create tutor_notes table
CREATE TABLE IF NOT EXISTS tutor_notes (
    id SERIAL PRIMARY KEY,
    contractor_id INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraint if contractors table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'contractors'
  ) THEN
    -- Check if contractor_id column exists in contractors table
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'contractors' AND column_name = 'contractor_id'
    ) THEN
      ALTER TABLE tutor_notes 
      ADD CONSTRAINT fk_tutor_notes_contractor 
      FOREIGN KEY (contractor_id) REFERENCES contractors(contractor_id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tutor_notes_contractor_id ON tutor_notes(contractor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_notes_created_at ON tutor_notes(created_at DESC);

-- Add comment
COMMENT ON TABLE tutor_notes IS 'Stores notes for tutors/contractors, similar to client_notes';

