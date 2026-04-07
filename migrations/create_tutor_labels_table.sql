-- Create tutor_labels table if it doesn't exist
-- This table stores tutor labels fetched from TutorCruncher API

CREATE TABLE IF NOT EXISTS tutor_labels (
    id SERIAL PRIMARY KEY,
    contractor_id INTEGER UNIQUE NOT NULL,
    labels TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_tutor_labels_contractor_id ON tutor_labels(contractor_id);

-- Add comment for documentation
COMMENT ON TABLE tutor_labels IS 'Stores tutor labels fetched from TutorCruncher API';
COMMENT ON COLUMN tutor_labels.contractor_id IS 'TutorCruncher contractor ID';
COMMENT ON COLUMN tutor_labels.labels IS 'Comma-separated list of label names';
COMMENT ON COLUMN tutor_labels.updated_at IS 'When the labels were last updated';
