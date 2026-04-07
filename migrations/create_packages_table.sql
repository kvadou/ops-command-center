-- Create packages table to store TutorCruncher package data
-- This table stores packages that clients can purchase

CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
    bonus_credit NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_value NUMERIC(10, 2) GENERATED ALWAYS AS (cost + bonus_credit) STORED,
    icon VARCHAR(255),
    icon_colour VARCHAR(7) DEFAULT '#000000',
    sort_index INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT true,
    times_bought INTEGER DEFAULT 0,
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_packages_active ON packages(active);
CREATE INDEX IF NOT EXISTS idx_packages_sort_index ON packages(sort_index);
CREATE INDEX IF NOT EXISTS idx_packages_date_created ON packages(date_created);

-- Add comments
COMMENT ON TABLE packages IS 'Stores packages that clients can purchase from TutorCruncher';
COMMENT ON COLUMN packages.total_value IS 'Calculated as cost + bonus_credit';
COMMENT ON COLUMN packages.times_bought IS 'Number of times this package has been purchased';

