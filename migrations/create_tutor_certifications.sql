-- Tutor Certifications Table Migration
-- Stores tutor certification documents and tracks compliance

CREATE TABLE IF NOT EXISTS tutor_certifications (
  id SERIAL PRIMARY KEY,
  tutor_id BIGINT NOT NULL,                    -- TC contractor ID
  tutor_name VARCHAR(255),                      -- Denormalized for quick access
  tutor_email VARCHAR(255),
  requirement_code VARCHAR(50) NOT NULL,        -- Links to requirement_types
  school_name TEXT,                             -- NULL = universal cert, not school-specific

  -- File information
  file_name VARCHAR(255),                       -- Original filename
  file_path TEXT,                               -- Storage path
  file_size INTEGER,
  file_type VARCHAR(100),                       -- MIME type

  -- Certification details
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  issue_date DATE,
  expiration_date DATE,
  certificate_number VARCHAR(100),              -- For certs with ID numbers
  issuing_authority VARCHAR(255),               -- Who issued it

  -- Metadata
  notes TEXT,
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  uploaded_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tutor_certs_tutor_id ON tutor_certifications(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_certs_requirement ON tutor_certifications(requirement_code);
CREATE INDEX IF NOT EXISTS idx_tutor_certs_school ON tutor_certifications(school_name) WHERE school_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tutor_certs_status ON tutor_certifications(status);
CREATE INDEX IF NOT EXISTS idx_tutor_certs_expiration ON tutor_certifications(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tutor_certs_tutor_req ON tutor_certifications(tutor_id, requirement_code);

-- Unique constraint: One cert per tutor per requirement per school (or universal)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_certs_unique
  ON tutor_certifications(tutor_id, requirement_code, COALESCE(school_name, ''));

-- Apply trigger for updated_at
DROP TRIGGER IF EXISTS update_tutor_certifications_updated_at ON tutor_certifications;
CREATE TRIGGER update_tutor_certifications_updated_at
    BEFORE UPDATE ON tutor_certifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE tutor_certifications IS 'Stores tutor certification documents and tracks compliance status';
COMMENT ON COLUMN tutor_certifications.school_name IS 'NULL means universal cert applicable to all schools';
COMMENT ON COLUMN tutor_certifications.status IS 'pending=awaiting review, approved=valid, rejected=denied, expired=past expiration';
