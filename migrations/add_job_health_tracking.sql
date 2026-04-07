-- Add columns to services table for placement tracking
ALTER TABLE services ADD COLUMN IF NOT EXISTS dft_location_address TEXT;
ALTER TABLE services ADD COLUMN IF NOT EXISTS dft_location_lat DECIMAL(10,7);
ALTER TABLE services ADD COLUMN IF NOT EXISTS dft_location_lng DECIMAL(10,7);
ALTER TABLE services ADD COLUMN IF NOT EXISTS inactivity_time INTEGER;
ALTER TABLE services ADD COLUMN IF NOT EXISTS desired_skills JSONB DEFAULT '[]';
ALTER TABLE services ADD COLUMN IF NOT EXISTS sr_premium DECIMAL(10,2) DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS conjobs_count INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS rcrs_count INTEGER DEFAULT 0;
ALTER TABLE services ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS tc_created_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE services ADD COLUMN IF NOT EXISTS latest_apt_ahc TIMESTAMP WITH TIME ZONE;

-- Track status history for duration analysis
CREATE TABLE IF NOT EXISTS service_status_history (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    duration_hours DECIMAL(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_status_history_service_id ON service_status_history(service_id);
CREATE INDEX IF NOT EXISTS idx_service_status_history_to_status ON service_status_history(to_status);
CREATE INDEX IF NOT EXISTS idx_service_status_history_changed_at ON service_status_history(changed_at);

-- Track placement risk scores
CREATE TABLE IF NOT EXISTS job_placement_scores (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL UNIQUE,
    risk_score INTEGER DEFAULT 0,
    risk_factors JSONB DEFAULT '{}',
    tutor_bids_count INTEGER DEFAULT 0,
    days_in_current_status DECIMAL(10,2) DEFAULT 0,
    avg_market_placement_days DECIMAL(10,2),
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_placement_scores_risk ON job_placement_scores(risk_score DESC);
