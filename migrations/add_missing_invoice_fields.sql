-- Migration: Add Missing Invoice Fields
-- Adds fields that are available in TutorCruncher API but not currently stored

-- ============================================================================
-- 1. ADD MISSING FIELDS TO INVOICES TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add date_void column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'date_void'
    ) THEN
        ALTER TABLE invoices ADD COLUMN date_void TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add still_to_pay column (remaining balance)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'still_to_pay'
    ) THEN
        ALTER TABLE invoices ADD COLUMN still_to_pay NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- Add automated_reminder_date column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'automated_reminder_date'
    ) THEN
        ALTER TABLE invoices ADD COLUMN automated_reminder_date TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invoices_date_void ON invoices(date_void) WHERE date_void IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_still_to_pay ON invoices(still_to_pay) WHERE still_to_pay > 0;
CREATE INDEX IF NOT EXISTS idx_invoices_automated_reminder_date ON invoices(automated_reminder_date) WHERE automated_reminder_date IS NOT NULL;

-- ============================================================================
-- 2. ADD MISSING FIELDS TO INVOICE_ITEMS TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add sales_code column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'sales_code'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN sales_code TEXT;
    END IF;

    -- Add payee column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'payee'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN payee TEXT;
    END IF;

    -- Add adhoc_charge_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'adhoc_charge_id'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN adhoc_charge_id BIGINT;
    END IF;

    -- Add rate column (charge rate, separate from unit_price)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'rate'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN rate NUMERIC(12, 2);
    END IF;

    -- Add payer_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'payer_id'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN payer_id BIGINT;
    END IF;

    -- Add payer_name column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'payer_name'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN payer_name TEXT;
    END IF;

    -- Add appointment_details JSONB column for full appointment object
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'appointment_details'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN appointment_details JSONB;
    END IF;

    -- Add service_details JSONB column for full service object
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_items' AND column_name = 'service_details'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN service_details JSONB;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invoice_items_sales_code ON invoice_items(sales_code) WHERE sales_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_adhoc_charge_id ON invoice_items(adhoc_charge_id) WHERE adhoc_charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_payer_id ON invoice_items(payer_id) WHERE payer_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN invoices.date_void IS 'Date when the invoice was voided';
COMMENT ON COLUMN invoices.still_to_pay IS 'Remaining balance to be paid on the invoice';
COMMENT ON COLUMN invoices.automated_reminder_date IS 'Date when automated payment reminder will be sent';
COMMENT ON COLUMN invoice_items.sales_code IS 'Sales code from TutorCruncher charge';
COMMENT ON COLUMN invoice_items.payee IS 'Payee name from TutorCruncher charge';
COMMENT ON COLUMN invoice_items.adhoc_charge_id IS 'ID of adhoc charge if this item is an adhoc charge';
COMMENT ON COLUMN invoice_items.rate IS 'Charge rate from TutorCruncher (may differ from unit_price)';
COMMENT ON COLUMN invoice_items.payer_id IS 'Payer client ID from TutorCruncher charge';
COMMENT ON COLUMN invoice_items.payer_name IS 'Payer client name from TutorCruncher charge';
COMMENT ON COLUMN invoice_items.appointment_details IS 'Full appointment object from TutorCruncher API stored as JSONB';
COMMENT ON COLUMN invoice_items.service_details IS 'Full service object from TutorCruncher API stored as JSONB';









