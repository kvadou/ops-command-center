-- Fix invoice_notes and invoice_activity_log client_id to VARCHAR
-- These tables store TC client_id which is a string, not BIGINT

-- First ensure tables exist (idempotent)
CREATE TABLE IF NOT EXISTS invoice_notes (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    client_id VARCHAR(255),
    note TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON invoice_notes(invoice_id);

CREATE TABLE IF NOT EXISTS invoice_activity_log (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    client_id VARCHAR(255),
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual',
    contact_method VARCHAR(50),
    contact_person VARCHAR(255),
    outcome VARCHAR(100),
    follow_up_date DATE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_activity_invoice_id ON invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_follow_up ON invoice_activity_log(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- Alter existing tables if client_id is BIGINT -> VARCHAR
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_notes' AND column_name = 'client_id' AND data_type = 'bigint'
    ) THEN
        ALTER TABLE invoice_notes ALTER COLUMN client_id TYPE VARCHAR(255) USING client_id::text;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invoice_activity_log' AND column_name = 'client_id' AND data_type = 'bigint'
    ) THEN
        ALTER TABLE invoice_activity_log ALTER COLUMN client_id TYPE VARCHAR(255) USING client_id::text;
    END IF;
END $$;
