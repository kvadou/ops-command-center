-- Migration: Create contractors table to store TutorCruncher contractor data
-- This migration creates a comprehensive contractors table with all TutorCruncher fields

CREATE TABLE IF NOT EXISTS contractors (
    id SERIAL PRIMARY KEY,
    contractor_id INTEGER UNIQUE NOT NULL,
    latitude DECIMAL(10, 7),
    longitude DECIMAL(11, 7),
    date_created TIMESTAMP WITH TIME ZONE,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    email VARCHAR(255),
    mobile VARCHAR(50),
    phone VARCHAR(50),
    street VARCHAR(255),
    state VARCHAR(100),
    town VARCHAR(255),
    country VARCHAR(100),
    postcode VARCHAR(20),
    timezone VARCHAR(100),
    title VARCHAR(100),
    photo TEXT,
    status VARCHAR(50),
    default_rate DECIMAL(10, 2),
    qualifications JSONB,
    skills JSONB,
    institutions JSONB,
    received_notifications JSONB,
    review_rating DECIMAL(3, 2),
    review_duration INTERVAL,
    calendar_colour VARCHAR(7),
    labels JSONB,
    extra_attrs JSONB,
    work_done_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contractors_contractor_id ON contractors(contractor_id);
CREATE INDEX IF NOT EXISTS idx_contractors_email ON contractors(email);
CREATE INDEX IF NOT EXISTS idx_contractors_status ON contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractors_first_name ON contractors(first_name);
CREATE INDEX IF NOT EXISTS idx_contractors_last_name ON contractors(last_name);
CREATE INDEX IF NOT EXISTS idx_contractors_town ON contractors(town);
CREATE INDEX IF NOT EXISTS idx_contractors_state ON contractors(state);

-- Add comments to document the table purpose
COMMENT ON TABLE contractors IS 'Stores TutorCruncher contractor (tutor) data for local application use';
COMMENT ON COLUMN contractors.contractor_id IS 'TutorCruncher contractor ID';
COMMENT ON COLUMN contractors.labels IS 'Contractor labels (e.g., Home - SF, School - SF, 1099)';
COMMENT ON COLUMN contractors.extra_attrs IS 'Additional contractor attributes (bio, tier rate, background check)';
COMMENT ON COLUMN contractors.work_done_details IS 'Payment and work statistics from TutorCruncher';
