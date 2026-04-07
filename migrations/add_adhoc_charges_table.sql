-- Create adhoc_charges table to store detailed adhoc charge information from TutorCruncher API
CREATE TABLE IF NOT EXISTS adhoc_charges (
    id BIGINT PRIMARY KEY,
    agent_id BIGINT,
    appointment_id BIGINT,
    category_id BIGINT NOT NULL,
    category_name TEXT NOT NULL,
    client_id BIGINT,
    contractor_id BIGINT,
    contractor_first_name TEXT,
    contractor_last_name TEXT,
    contractor_email TEXT,
    creator_id BIGINT,
    creator_first_name TEXT,
    creator_last_name TEXT,
    creator_email TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    date_occurred TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT,
    net_gross TEXT NOT NULL,
    pay_contractor NUMERIC NOT NULL,
    service_id BIGINT,
    tax_amount NUMERIC,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_date_occurred ON adhoc_charges(date_occurred);
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_contractor_id ON adhoc_charges(contractor_id);
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_category_id ON adhoc_charges(category_id);
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_creator_id ON adhoc_charges(creator_id);
CREATE INDEX IF NOT EXISTS idx_adhoc_charges_fetched_at ON adhoc_charges(fetched_at);

-- Add comment to table
COMMENT ON TABLE adhoc_charges IS 'Stores detailed adhoc charge information synced from TutorCruncher API';
