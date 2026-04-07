-- Create consistency_bonuses table to track applied consistency bonus ad hoc charges
CREATE TABLE IF NOT EXISTS consistency_bonuses (
    id SERIAL PRIMARY KEY,
    contractor_id BIGINT NOT NULL,
    contractor_name TEXT NOT NULL,
    bonus_amount NUMERIC NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    hours_worked NUMERIC NOT NULL,
    bucket_name TEXT NOT NULL,
    adhoc_charge_id BIGINT, -- Reference to adhoc_charges.id after creation
    tutorcruncher_charge_id BIGINT, -- Reference to TutorCruncher adhoc charge ID
    applied_by TEXT, -- User who applied the bonus
    applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Ensure we don't apply the same bonus twice for the same period
    UNIQUE(contractor_id, period_start, period_end, bucket_name)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_consistency_bonuses_contractor_id ON consistency_bonuses(contractor_id);
CREATE INDEX IF NOT EXISTS idx_consistency_bonuses_period ON consistency_bonuses(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_consistency_bonuses_adhoc_charge_id ON consistency_bonuses(adhoc_charge_id);
CREATE INDEX IF NOT EXISTS idx_consistency_bonuses_tutorcruncher_charge_id ON consistency_bonuses(tutorcruncher_charge_id);

-- Add comment to table
COMMENT ON TABLE consistency_bonuses IS 'Tracks applied consistency bonus ad hoc charges for tutors based on hour buckets';










