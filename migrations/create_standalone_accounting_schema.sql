-- Migration: Create Standalone Accounting System Schema
-- This migration enhances existing tables and creates new tables for a fully standalone accounting system
-- Run on all environments: local → staging → production → westside → eastside

-- ============================================================================
-- 0. CREATE BASE TABLES IF THEY DON'T EXIST
-- ============================================================================

-- Create credit_requests table if it doesn't exist
CREATE TABLE IF NOT EXISTS credit_requests (
    id BIGINT PRIMARY KEY,
    display_id TEXT NOT NULL,
    client_id BIGINT,
    client_first_name TEXT,
    client_last_name TEXT,
    client_email TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    date_raised TIMESTAMP WITH TIME ZONE,
    date_approved TIMESTAMP WITH TIME ZONE,
    raised_by INTEGER,
    approved_by INTEGER,
    url TEXT,
    notes TEXT,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    remote_last_updated TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create balance_updates table if it doesn't exist
CREATE TABLE IF NOT EXISTS balance_updates (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    client_first_name TEXT,
    client_last_name TEXT,
    update_type TEXT NOT NULL,
    related_id BIGINT,
    related_type TEXT,
    previous_balance NUMERIC(12, 2) NOT NULL,
    change_amount NUMERIC(12, 2) NOT NULL,
    new_balance NUMERIC(12, 2) NOT NULL,
    balance_type TEXT NOT NULL DEFAULT 'invoice_balance',
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure invoices table has status column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'status'
    ) THEN
        ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'unpaid';
    END IF;
END $$;

-- Ensure payment_orders table has status column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'status'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
END $$;

-- ============================================================================
-- 1. ENHANCE INVOICES TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add invoice_number column (unique, auto-generated: INV-{id})
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'invoice_number'
    ) THEN
        ALTER TABLE invoices ADD COLUMN invoice_number TEXT UNIQUE;
    END IF;

    -- Add date_created column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'date_created'
    ) THEN
        ALTER TABLE invoices ADD COLUMN date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;

    -- Add date_paid column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'date_paid'
    ) THEN
        ALTER TABLE invoices ADD COLUMN date_paid TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add deferred_payment_date column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'deferred_payment_date'
    ) THEN
        ALTER TABLE invoices ADD COLUMN deferred_payment_date TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add Stripe payment fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'stripe_payment_intent_id'
    ) THEN
        ALTER TABLE invoices ADD COLUMN stripe_payment_intent_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'stripe_invoice_id'
    ) THEN
        ALTER TABLE invoices ADD COLUMN stripe_invoice_id TEXT;
    END IF;

    -- Add email tracking fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE invoices ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'email_sent_to'
    ) THEN
        ALTER TABLE invoices ADD COLUMN email_sent_to TEXT;
    END IF;

    -- Add items JSONB column for line items
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'items'
    ) THEN
        ALTER TABLE invoices ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add financial breakdown columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'tutor_amount'
    ) THEN
        ALTER TABLE invoices ADD COLUMN tutor_amount NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'branch_net_amount'
    ) THEN
        ALTER TABLE invoices ADD COLUMN branch_net_amount NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'affiliate_amount'
    ) THEN
        ALTER TABLE invoices ADD COLUMN affiliate_amount NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'branch_tax'
    ) THEN
        ALTER TABLE invoices ADD COLUMN branch_tax NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- Update status column default if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'status' AND column_default IS NULL
    ) THEN
        ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'draft';
    END IF;
END $$;

-- Create index on invoice_number
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number) WHERE invoice_number IS NOT NULL;

-- Create index on stripe_payment_intent_id
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_payment_intent_id ON invoices(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- ============================================================================
-- 2. ENHANCE CREDIT_REQUESTS TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add credit_request_number column (unique, auto-generated: PFI-{id})
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'credit_request_number'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN credit_request_number TEXT UNIQUE;
    END IF;

    -- Add items JSONB column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'items'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add Stripe payment fields for refunds
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'stripe_payment_intent_id'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN stripe_payment_intent_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'stripe_refund_id'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN stripe_refund_id TEXT;
    END IF;

    -- Add email tracking fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'email_sent_to'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN email_sent_to TEXT;
    END IF;

    -- Add date_paid column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'credit_requests' AND column_name = 'date_paid'
    ) THEN
        ALTER TABLE credit_requests ADD COLUMN date_paid TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create index on credit_request_number
CREATE INDEX IF NOT EXISTS idx_credit_requests_credit_request_number ON credit_requests(credit_request_number) WHERE credit_request_number IS NOT NULL;

-- ============================================================================
-- 3. ENHANCE PAYMENT_ORDERS TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add payment_order_number column (unique, auto-generated: PO-{id})
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'payment_order_number'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN payment_order_number TEXT UNIQUE;
    END IF;

    -- Add items JSONB column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'items'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN items JSONB DEFAULT '[]'::jsonb;
    END IF;

    -- Add financial breakdown columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'total_to_pay_tutor'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN total_to_pay_tutor NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'total_tax'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN total_tax NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'total_to_charge_client'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN total_to_charge_client NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- Add email tracking fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'email_sent_at'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN email_sent_at TIMESTAMP WITH TIME ZONE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'email_sent_to'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN email_sent_to TEXT;
    END IF;

    -- Add date_created column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'date_created'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
END $$;

-- Create index on payment_order_number
CREATE INDEX IF NOT EXISTS idx_payment_orders_payment_order_number ON payment_orders(payment_order_number) WHERE payment_order_number IS NOT NULL;

-- ============================================================================
-- 4. CREATE INVOICE_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS invoice_items (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    appointment_id BIGINT,
    service_id BIGINT,
    description TEXT NOT NULL,
    item_date TIMESTAMP WITH TIME ZONE NOT NULL,
    units NUMERIC(10, 2) NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    student_names TEXT[],
    tutor_id BIGINT,
    tutor_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_appointment_id ON invoice_items(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoice_items_service_id ON invoice_items(service_id) WHERE service_id IS NOT NULL;

-- ============================================================================
-- 5. CREATE CREDIT_REQUEST_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS credit_request_items (
    id SERIAL PRIMARY KEY,
    credit_request_id BIGINT NOT NULL REFERENCES credit_requests(id) ON DELETE CASCADE,
    invoice_id BIGINT REFERENCES invoices(id),
    appointment_id BIGINT,
    description TEXT NOT NULL,
    reason TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_request_items_credit_request_id ON credit_request_items(credit_request_id);
CREATE INDEX IF NOT EXISTS idx_credit_request_items_invoice_id ON credit_request_items(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_request_items_appointment_id ON credit_request_items(appointment_id) WHERE appointment_id IS NOT NULL;

-- ============================================================================
-- 6. CREATE PAYMENT_ORDER_ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_order_items (
    id SERIAL PRIMARY KEY,
    payment_order_id BIGINT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
    appointment_id BIGINT,
    adhoc_charge_id BIGINT,
    description TEXT NOT NULL,
    item_date TIMESTAMP WITH TIME ZONE NOT NULL,
    units NUMERIC(10, 2) NOT NULL DEFAULT 1,
    rate NUMERIC(12, 2) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    sales_code TEXT,
    payer TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_order_items_payment_order_id ON payment_order_items(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_payment_order_items_appointment_id ON payment_order_items(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_order_items_adhoc_charge_id ON payment_order_items(adhoc_charge_id) WHERE adhoc_charge_id IS NOT NULL;

-- ============================================================================
-- 7. CREATE CLIENT_BALANCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS client_balances (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    invoice_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    available_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id)
);

CREATE INDEX IF NOT EXISTS idx_client_balances_client_id ON client_balances(client_id);
CREATE INDEX IF NOT EXISTS idx_client_balances_invoice_balance ON client_balances(invoice_balance);

-- ============================================================================
-- 8. ENHANCE BALANCE_UPDATES TABLE
-- ============================================================================
DO $$ 
BEGIN
    -- Add Stripe transaction fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'balance_updates' AND column_name = 'stripe_transaction_id'
    ) THEN
        ALTER TABLE balance_updates ADD COLUMN stripe_transaction_id TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'balance_updates' AND column_name = 'payment_method'
    ) THEN
        ALTER TABLE balance_updates ADD COLUMN payment_method TEXT;
    END IF;

    -- Add related document IDs
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'balance_updates' AND column_name = 'related_invoice_id'
    ) THEN
        ALTER TABLE balance_updates ADD COLUMN related_invoice_id BIGINT REFERENCES invoices(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'balance_updates' AND column_name = 'related_credit_request_id'
    ) THEN
        ALTER TABLE balance_updates ADD COLUMN related_credit_request_id BIGINT REFERENCES credit_requests(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'balance_updates' AND column_name = 'related_payment_order_id'
    ) THEN
        ALTER TABLE balance_updates ADD COLUMN related_payment_order_id BIGINT REFERENCES payment_orders(id);
    END IF;
END $$;

-- Create indexes for related document IDs
CREATE INDEX IF NOT EXISTS idx_balance_updates_related_invoice_id ON balance_updates(related_invoice_id) WHERE related_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_balance_updates_related_credit_request_id ON balance_updates(related_credit_request_id) WHERE related_credit_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_balance_updates_related_payment_order_id ON balance_updates(related_payment_order_id) WHERE related_payment_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_balance_updates_stripe_transaction_id ON balance_updates(stripe_transaction_id) WHERE stripe_transaction_id IS NOT NULL;

-- ============================================================================
-- 9. CREATE ACCOUNTING_ACTIVITY_LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounting_activity_log (
    id SERIAL PRIMARY KEY,
    document_type TEXT NOT NULL, -- 'invoice', 'credit_request', 'payment_order'
    document_id BIGINT NOT NULL,
    action TEXT NOT NULL, -- 'created', 'raised', 'sent', 'paid', 'cancelled', etc.
    performed_by TEXT,
    performed_by_id INTEGER,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_activity_log_document ON accounting_activity_log(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_accounting_activity_log_created_at ON accounting_activity_log(created_at DESC);

-- ============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE invoice_items IS 'Line items for invoices, linking to appointments/lessons';
COMMENT ON TABLE credit_request_items IS 'Line items for credit requests, linking to invoices/lessons';
COMMENT ON TABLE payment_order_items IS 'Line items for payment orders, linking to appointments/lessons';
COMMENT ON TABLE client_balances IS 'Current balance state for each client, updated on each transaction';
COMMENT ON TABLE accounting_activity_log IS 'Audit trail for all accounting document actions';

COMMENT ON COLUMN invoices.invoice_number IS 'Unique invoice number format: INV-{id}';
COMMENT ON COLUMN invoices.items IS 'JSONB array of line items (lessons, services)';
COMMENT ON COLUMN invoices.tutor_amount IS 'Amount to be paid to tutor(s)';
COMMENT ON COLUMN invoices.branch_net_amount IS 'Net amount after tutor and affiliate payments';
COMMENT ON COLUMN credit_requests.credit_request_number IS 'Unique credit request number format: PFI-{id}';
COMMENT ON COLUMN payment_orders.payment_order_number IS 'Unique payment order number format: PO-{id}';
COMMENT ON COLUMN balance_updates.stripe_transaction_id IS 'Stripe payment intent or charge ID';
COMMENT ON COLUMN balance_updates.payment_method IS 'Payment method used (card, bank_transfer, etc.)';
