-- Migration: Add items and service_recipients to proforma_invoices table
-- This adds support for storing the items array and service_recipients from TutorCruncher API

DO $$
BEGIN
    -- Add items JSONB column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proforma_invoices' AND column_name = 'items'
    ) THEN
        ALTER TABLE proforma_invoices ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add service_recipients JSONB column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'proforma_invoices' AND column_name = 'service_recipients'
    ) THEN
        ALTER TABLE proforma_invoices ADD COLUMN service_recipients JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- Create index on items for faster queries
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_items ON proforma_invoices USING GIN (items);

-- Add comments
COMMENT ON COLUMN proforma_invoices.items IS 'JSONB array of line items from TutorCruncher API (amount, custom_description, sales_codes, rcra)';
COMMENT ON COLUMN proforma_invoices.service_recipients IS 'JSONB array of service recipients from TutorCruncher API';









