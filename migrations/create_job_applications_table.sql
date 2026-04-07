-- Create job_applications table to store TutorCruncher tender/job application data
-- This table stores applications from contractors (tutors) for services (jobs)

CREATE TABLE IF NOT EXISTS job_applications (
    id BIGINT PRIMARY KEY,
    service_id BIGINT NOT NULL,
    contractor_id INTEGER NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'requested', 'accepted', 'rejected', 'withdrawn'
    date_created TIMESTAMP WITH TIME ZONE NOT NULL,
    date_updated TIMESTAMP WITH TIME ZONE,
    creator_id INTEGER,
    creator_first_name TEXT,
    creator_last_name TEXT,
    creator_email TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_applications_service_id ON job_applications(service_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_contractor_id ON job_applications(contractor_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status ON job_applications(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_date_created ON job_applications(date_created);

-- Add comments
COMMENT ON TABLE job_applications IS 'Stores job applications (tenders) from contractors for services';
COMMENT ON COLUMN job_applications.status IS 'Application status: pending, requested, accepted, rejected, withdrawn';


