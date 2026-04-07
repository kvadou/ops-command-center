-- Migration: Create School Student Import System
-- This migration creates tables for managing student imports and prospects

-- 1. School Student Prospects Table
-- Stores prospect students/clients before they're fully enrolled
CREATE TABLE IF NOT EXISTS school_student_prospects (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    
    -- Student Information
    student_first_name VARCHAR(255) NOT NULL,
    student_last_name VARCHAR(255),
    
    -- Parent/Client Information
    parent_first_name VARCHAR(255),
    parent_last_name VARCHAR(255),
    parent_email VARCHAR(255) NOT NULL,
    parent_phone VARCHAR(50),
    
    -- Status
    status VARCHAR(50) DEFAULT 'prospect', -- 'prospect', 'contacted', 'enrolled', 'declined'
    source VARCHAR(50) DEFAULT 'manual', -- 'manual', 'form', 'import'
    form_token VARCHAR(255), -- Unique token for public form submissions
    
    -- Enrollment Options
    add_to_current_job BOOLEAN DEFAULT FALSE,
    add_to_future_lessons BOOLEAN DEFAULT FALSE,
    target_job_service_id INTEGER, -- Specific job/service to add to
    
    -- TutorCruncher Integration
    tutorcruncher_client_id INTEGER, -- Created client ID in TutorCruncher
    tutorcruncher_student_id INTEGER, -- Created student ID if applicable
    
    -- Email Campaign Tracking
    email_campaign_sent BOOLEAN DEFAULT FALSE,
    email_campaign_sent_at TIMESTAMP WITH TIME ZONE,
    email_campaign_type VARCHAR(100), -- Which campaign was sent
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_student_prospects_school_client_id ON school_student_prospects(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_student_prospects_status ON school_student_prospects(status);
CREATE INDEX IF NOT EXISTS idx_school_student_prospects_form_token ON school_student_prospects(form_token);
CREATE INDEX IF NOT EXISTS idx_school_student_prospects_parent_email ON school_student_prospects(parent_email);
CREATE INDEX IF NOT EXISTS idx_school_student_prospects_tutorcruncher_client_id ON school_student_prospects(tutorcruncher_client_id);

-- 2. School Student Import Forms Table
-- Stores public form configurations for each school
CREATE TABLE IF NOT EXISTS school_student_import_forms (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    
    -- Form Configuration
    form_token VARCHAR(255) NOT NULL UNIQUE, -- Unique token for the form URL
    form_name VARCHAR(255) DEFAULT 'Student Registration Form',
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Form Settings
    require_student_name BOOLEAN DEFAULT TRUE,
    require_parent_name BOOLEAN DEFAULT TRUE,
    require_email BOOLEAN DEFAULT TRUE,
    require_phone BOOLEAN DEFAULT FALSE,
    allow_add_to_current_job BOOLEAN DEFAULT TRUE,
    allow_add_to_future_lessons BOOLEAN DEFAULT TRUE,
    default_add_to_current_job BOOLEAN DEFAULT FALSE,
    default_add_to_future_lessons BOOLEAN DEFAULT TRUE,
    
    -- Auto-enrollment Settings
    auto_add_to_service_id INTEGER, -- Auto-add to this service/job
    auto_trigger_email_campaign BOOLEAN DEFAULT TRUE,
    email_campaign_type VARCHAR(100) DEFAULT 'enrollment_reminder', -- Campaign to trigger
    
    -- Form URL
    form_url TEXT, -- Generated URL for the form
    
    -- Statistics
    total_submissions INTEGER DEFAULT 0,
    last_submission_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_student_import_forms_school_client_id ON school_student_import_forms(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_student_import_forms_form_token ON school_student_import_forms(form_token);
CREATE INDEX IF NOT EXISTS idx_school_student_import_forms_is_active ON school_student_import_forms(is_active) WHERE is_active = TRUE;

-- 3. School Student Imports Table
-- Tracks bulk imports and manual additions
CREATE TABLE IF NOT EXISTS school_student_imports (
    id SERIAL PRIMARY KEY,
    school_client_id VARCHAR(255) NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    
    -- Import Details
    import_type VARCHAR(50) DEFAULT 'manual', -- 'manual', 'csv', 'form'
    import_source VARCHAR(255), -- File name, form name, etc.
    
    -- Import Results
    total_records INTEGER DEFAULT 0,
    successful_imports INTEGER DEFAULT 0,
    failed_imports INTEGER DEFAULT 0,
    skipped_imports INTEGER DEFAULT 0,
    
    -- Options Used
    add_to_current_job BOOLEAN DEFAULT FALSE,
    add_to_future_lessons BOOLEAN DEFAULT FALSE,
    target_job_service_id INTEGER,
    
    -- Import Data (JSONB for storing import details)
    import_data JSONB,
    error_log JSONB, -- Store errors for failed imports
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_school_student_imports_school_client_id ON school_student_imports(school_client_id);
CREATE INDEX IF NOT EXISTS idx_school_student_imports_created_at ON school_student_imports(created_at DESC);

-- Functions and Triggers
CREATE OR REPLACE FUNCTION update_school_student_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_school_student_prospects_updated_at ON school_student_prospects;
CREATE TRIGGER update_school_student_prospects_updated_at
    BEFORE UPDATE ON school_student_prospects
    FOR EACH ROW
    EXECUTE FUNCTION update_school_student_updated_at();

DROP TRIGGER IF EXISTS update_school_student_import_forms_updated_at ON school_student_import_forms;
CREATE TRIGGER update_school_student_import_forms_updated_at
    BEFORE UPDATE ON school_student_import_forms
    FOR EACH ROW
    EXECUTE FUNCTION update_school_student_updated_at();

-- Comments
COMMENT ON TABLE school_student_prospects IS 'Stores prospect students/clients before full enrollment in TutorCruncher';
COMMENT ON TABLE school_student_import_forms IS 'Stores public form configurations for school administrators to add students';
COMMENT ON TABLE school_student_imports IS 'Tracks bulk imports and manual student additions';

