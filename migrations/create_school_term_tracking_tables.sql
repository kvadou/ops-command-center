-- School Term Tracking Tables Migration
-- Creates tables for tracking school metadata and per-term renewal workflow

-- Table for persistent school metadata (info that doesn't change per term)
CREATE TABLE IF NOT EXISTS school_metadata (
  id SERIAL PRIMARY KEY,
  school_name TEXT UNIQUE NOT NULL,
  school_type TEXT DEFAULT 'regular' CHECK (school_type IN ('regular', 'elective')),
  payment_method TEXT CHECK (payment_method IN ('ACH', 'Check', 'Credit Card', 'Invoice', NULL)),
  default_lesson_day TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Table for per-term renewal workflow tracking
CREATE TABLE IF NOT EXISTS school_term_status (
  id SERIAL PRIMARY KEY,
  school_name TEXT NOT NULL,
  term TEXT NOT NULL,  -- 'Spring 2026', 'Fall 2025', etc.
  school_confirmed BOOLEAN DEFAULT false,
  tutor_assigned BOOLEAN DEFAULT false,
  contract_signed BOOLEAN DEFAULT false,
  job_created BOOLEAN DEFAULT false,
  roster_connected BOOLEAN DEFAULT false,
  contract_value DECIMAL(10,2),
  sessions_count INTEGER,
  lesson_days TEXT,  -- 'Monday', 'Monday, Wednesday', etc.
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(school_name, term)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_school_metadata_school_name ON school_metadata(school_name);
CREATE INDEX IF NOT EXISTS idx_school_term_status_school_name ON school_term_status(school_name);
CREATE INDEX IF NOT EXISTS idx_school_term_status_term ON school_term_status(term);
CREATE INDEX IF NOT EXISTS idx_school_term_status_school_term ON school_term_status(school_name, term);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to school_metadata
DROP TRIGGER IF EXISTS update_school_metadata_updated_at ON school_metadata;
CREATE TRIGGER update_school_metadata_updated_at
    BEFORE UPDATE ON school_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to school_term_status
DROP TRIGGER IF EXISTS update_school_term_status_updated_at ON school_term_status;
CREATE TRIGGER update_school_term_status_updated_at
    BEFORE UPDATE ON school_term_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE school_metadata IS 'Persistent school information that does not change per term';
COMMENT ON TABLE school_term_status IS 'Per-term renewal workflow tracking for school partnerships';
COMMENT ON COLUMN school_metadata.school_type IS 'regular = school pays, elective = parents pay';
COMMENT ON COLUMN school_term_status.term IS 'Term identifier like Spring 2026, Fall 2025';
COMMENT ON COLUMN school_term_status.school_confirmed IS 'Manual: School confirmed they want to continue';
COMMENT ON COLUMN school_term_status.tutor_assigned IS 'Auto-detected: Tutor assigned to active job';
COMMENT ON COLUMN school_term_status.contract_signed IS 'Manual: Contract sent and signed';
COMMENT ON COLUMN school_term_status.job_created IS 'Auto-detected: TC job exists for term';
COMMENT ON COLUMN school_term_status.roster_connected IS 'Auto-detected: Job has students enrolled';
