-- School Requirements Table Migration
-- Stores certification/clearance requirements for each school

-- Master list of available requirement types
CREATE TABLE IF NOT EXISTS requirement_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'clearance',
  display_order INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- School-specific requirements (which requirements apply to each school)
CREATE TABLE IF NOT EXISTS school_requirements (
  id SERIAL PRIMARY KEY,
  school_name TEXT NOT NULL,
  requirement_code VARCHAR(50) NOT NULL,
  is_required BOOLEAN DEFAULT true,
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(school_name, requirement_code)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_school_requirements_school ON school_requirements(school_name);
CREATE INDEX IF NOT EXISTS idx_school_requirements_code ON school_requirements(requirement_code);
CREATE INDEX IF NOT EXISTS idx_requirement_types_category ON requirement_types(category);

-- Insert default requirement types
INSERT INTO requirement_types (code, name, description, category, display_order) VALUES
  ('background_check', 'Background Check', 'Criminal background check clearance', 'clearance', 10),
  ('fingerprinting', 'Fingerprinting', 'Fingerprint-based identity verification', 'clearance', 20),
  ('livescan', 'LiveScan', 'Electronic fingerprint submission for DOJ/FBI', 'clearance', 25),
  ('doe_clearance', 'DOE Clearance', 'Department of Education clearance', 'clearance', 30),
  ('nyc_pets', 'NYC PETS', 'NYC Personnel Eligibility Tracking System clearance', 'clearance', 35),
  ('physical_exam', 'Physical Exam', 'Medical physical examination', 'medical', 40),
  ('tb_test', 'TB Test', 'Tuberculosis skin test or chest X-ray', 'medical', 50),
  ('immunization_record', 'Immunization Record', 'Proof of vaccinations', 'medical', 55),
  ('covid_vaccination', 'COVID-19 Vaccination', 'COVID-19 vaccination proof', 'medical', 57),
  ('first_aid_cpr', 'First Aid / CPR', 'First Aid and CPR certification', 'training', 60),
  ('child_safety', 'Child Safety Training', 'Child abuse recognition and prevention training', 'training', 70),
  ('mandated_reporter', 'Mandated Reporter', 'Mandated reporter training certification', 'training', 75),
  ('sexual_harassment', 'Sexual Harassment Training', 'Sexual harassment prevention training', 'training', 80),
  ('osfs_training', 'OSFS Training', 'Office of School Food Services training', 'training', 85),
  ('safety_plan', 'Safety Plan Review', 'School safety plan acknowledgment', 'administrative', 90),
  ('photo_id_badge', 'Photo ID Badge', 'School-issued photo identification badge', 'administrative', 95),
  ('emergency_contact', 'Emergency Contact Form', 'Emergency contact information on file', 'administrative', 100),
  ('confidentiality_agreement', 'Confidentiality Agreement', 'Signed confidentiality/NDA agreement', 'administrative', 105),
  ('liability_waiver', 'Liability Waiver', 'Signed liability waiver form', 'administrative', 110)
ON CONFLICT (code) DO NOTHING;

-- Apply trigger for updated_at
DROP TRIGGER IF EXISTS update_school_requirements_updated_at ON school_requirements;
CREATE TRIGGER update_school_requirements_updated_at
    BEFORE UPDATE ON school_requirements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE requirement_types IS 'Master list of available certification/clearance requirement types';
COMMENT ON TABLE school_requirements IS 'School-specific requirements mapping';
COMMENT ON COLUMN requirement_types.category IS 'Category: clearance, medical, training, administrative';
COMMENT ON COLUMN school_requirements.is_required IS 'Whether this requirement is mandatory for the school';
