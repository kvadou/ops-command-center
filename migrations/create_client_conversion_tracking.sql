-- Migration: Create Client Conversion Tracking Tables
-- This migration creates tables to track the complete client conversion process
-- as used in the Google Sheets tracker

-- 1. Client Conversion Tracking Table
-- This table tracks the main conversion process for each client
CREATE TABLE IF NOT EXISTS client_conversion_tracking (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Lead Type (New Lead, Referral, Takeover, Returning Lead, etc.)
    lead_type VARCHAR(50),
    
    -- Market (NYC, LA, Online, Hamptons, SF, Other)
    market VARCHAR(50),
    
    -- Registration Process Dates
    date_registration_out DATE,
    date_registration_complete DATE,
    date_offered_to_tutors DATE,
    date_tutor_client_paired DATE,
    date_trial_first_lesson DATE,
    
    -- Tutor Assignment
    assigned_tutor_id INTEGER,
    assigned_tutor_name VARCHAR(255),
    
    -- Follow-up Tracking
    trial_follow_up_completed BOOLEAN DEFAULT FALSE,
    first_paid_lesson_scheduled BOOLEAN DEFAULT FALSE,
    first_paid_lesson_completed BOOLEAN DEFAULT FALSE,
    
    -- Bundle Purchase Tracking
    bundle_purchased BOOLEAN DEFAULT FALSE,
    bundle_name VARCHAR(100),
    bundle_purchase_date DATE,
    bundle_total DECIMAL(10,2),
    bundle_discount_percentage INTEGER,
    bundle_credit_total DECIMAL(10,2),
    
    -- Status Tracking
    conversion_status VARCHAR(50) DEFAULT 'prospect', -- prospect, trial_scheduled, trial_completed, converted, dormant
    final_outcome VARCHAR(50), -- converted, not_interested, scheduling_issues, price_objection, etc.
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- 2. Client Bundle Purchases Table
-- Separate table to track multiple bundle purchases per client
CREATE TABLE IF NOT EXISTS client_bundle_purchases (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Bundle Details
    bundle_name VARCHAR(100) NOT NULL,
    purchase_date DATE NOT NULL,
    bundle_total DECIMAL(10,2) NOT NULL,
    discount_percentage INTEGER DEFAULT 10,
    credit_total DECIMAL(10,2),
    
    -- Source tracking
    source VARCHAR(100), -- Jena, Nicholas, Caitlin, Client, etc.
    
    -- Status
    continued_after_bundle BOOLEAN,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- 3. Weekly Lesson Statistics Table
-- Track weekly metrics for dashboard
CREATE TABLE IF NOT EXISTS weekly_lesson_stats (
    id SERIAL PRIMARY KEY,
    
    -- Week Information
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    year INTEGER NOT NULL,
    
    -- Statistics
    clients_paired INTEGER DEFAULT 0,
    first_lessons_trials INTEGER DEFAULT 0,
    
    -- Year-over-year comparison
    clients_paired_yoy_change DECIMAL(5,2),
    first_lessons_trials_yoy_change DECIMAL(5,2),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Tutor Assignments Table
-- Track tutor assignments and availability
CREATE TABLE IF NOT EXISTS tutor_assignments (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Tutor Information
    tutor_name VARCHAR(255) NOT NULL,
    tutor_id INTEGER, -- If we have tutor IDs from TutorCruncher
    
    -- Assignment Details
    assignment_date DATE NOT NULL,
    assignment_type VARCHAR(50), -- trial, regular, takeover
    previous_tutor VARCHAR(255), -- For takeovers
    
    -- Status
    status VARCHAR(50) DEFAULT 'assigned', -- assigned, confirmed, completed, cancelled
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_by VARCHAR(255)
);

-- 5. Client Follow-up Actions Table
-- Track specific follow-up actions and their outcomes
CREATE TABLE IF NOT EXISTS client_follow_up_actions (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    
    -- Follow-up Details
    action_type VARCHAR(100) NOT NULL, -- trial_follow_up, bundle_offer, scheduling_follow_up, etc.
    action_date DATE NOT NULL,
    action_by VARCHAR(255) NOT NULL,
    
    -- Outcome
    outcome VARCHAR(100), -- completed, no_response, not_interested, etc.
    notes TEXT,
    
    -- Next Action
    next_action VARCHAR(100),
    next_action_date DATE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_client_conversion_tracking_client_id ON client_conversion_tracking(client_id);
CREATE INDEX IF NOT EXISTS idx_client_conversion_tracking_lead_type ON client_conversion_tracking(lead_type);
CREATE INDEX IF NOT EXISTS idx_client_conversion_tracking_market ON client_conversion_tracking(market);
CREATE INDEX IF NOT EXISTS idx_client_conversion_tracking_status ON client_conversion_tracking(conversion_status);
CREATE INDEX IF NOT EXISTS idx_client_conversion_tracking_trial_date ON client_conversion_tracking(date_trial_first_lesson);

CREATE INDEX IF NOT EXISTS idx_client_bundle_purchases_client_id ON client_bundle_purchases(client_id);
CREATE INDEX IF NOT EXISTS idx_client_bundle_purchases_date ON client_bundle_purchases(purchase_date);

CREATE INDEX IF NOT EXISTS idx_weekly_lesson_stats_week ON weekly_lesson_stats(week_start, week_end);
CREATE INDEX IF NOT EXISTS idx_weekly_lesson_stats_year ON weekly_lesson_stats(year);

CREATE INDEX IF NOT EXISTS idx_tutor_assignments_client_id ON tutor_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_tutor_assignments_tutor ON tutor_assignments(tutor_name);

CREATE INDEX IF NOT EXISTS idx_client_follow_up_actions_client_id ON client_follow_up_actions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_follow_up_actions_date ON client_follow_up_actions(action_date);

-- Add triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_client_conversion_tracking_updated_at BEFORE UPDATE ON client_conversion_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_bundle_purchases_updated_at BEFORE UPDATE ON client_bundle_purchases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_weekly_lesson_stats_updated_at BEFORE UPDATE ON weekly_lesson_stats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tutor_assignments_updated_at BEFORE UPDATE ON tutor_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_client_follow_up_actions_updated_at BEFORE UPDATE ON client_follow_up_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
