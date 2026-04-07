-- Migration: Create School Notes and Contacts Tables
-- Tables for storing notes and contacts associated with schools
-- Required by api-school-term-tracking.js

-- Table for school notes (activity log / comments)
CREATE TABLE IF NOT EXISTS school_notes (
  id SERIAL PRIMARY KEY,
  school_name TEXT NOT NULL,
  content TEXT NOT NULL,
  author VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table for school contacts (personnel at each school)
CREATE TABLE IF NOT EXISTS school_contacts (
  id SERIAL PRIMARY KEY,
  school_id VARCHAR(255) NOT NULL,  -- This is the client_id from TC
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  role VARCHAR(100),
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_school_notes_school_name ON school_notes(school_name);
CREATE INDEX IF NOT EXISTS idx_school_notes_created_at ON school_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_school_contacts_school_id ON school_contacts(school_id);
CREATE INDEX IF NOT EXISTS idx_school_contacts_is_primary ON school_contacts(is_primary);

-- Apply trigger for updated_at on school_contacts
DROP TRIGGER IF EXISTS update_school_contacts_updated_at ON school_contacts;
CREATE TRIGGER update_school_contacts_updated_at
    BEFORE UPDATE ON school_contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE school_notes IS 'Activity notes and comments for school partnerships';
COMMENT ON TABLE school_contacts IS 'Contact personnel at each school (principals, coordinators, etc.)';
COMMENT ON COLUMN school_contacts.school_id IS 'References the client_id from TutorCruncher for the school';
COMMENT ON COLUMN school_contacts.is_primary IS 'Whether this is the main point of contact for the school';
