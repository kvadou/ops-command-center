-- Create adhoc_charge_categories table to store ad hoc charge category information from TutorCruncher API
CREATE TABLE IF NOT EXISTS adhoc_charge_categories (
    id BIGINT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_tax_setup BIGINT,
    contractor_tax_setup BIGINT,
    contractor_usable BOOLEAN NOT NULL DEFAULT false,
    default_description TEXT,
    default_pay_amount NUMERIC,
    default_charge_amount NUMERIC,
    dft_net_gross TEXT,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_adhoc_charge_categories_name ON adhoc_charge_categories(name);
CREATE INDEX IF NOT EXISTS idx_adhoc_charge_categories_contractor_usable ON adhoc_charge_categories(contractor_usable);
CREATE INDEX IF NOT EXISTS idx_adhoc_charge_categories_fetched_at ON adhoc_charge_categories(fetched_at);

-- Add comment to table
COMMENT ON TABLE adhoc_charge_categories IS 'Stores ad hoc charge category information synced from TutorCruncher API';

