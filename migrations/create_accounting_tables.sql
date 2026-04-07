-- Migration: Create Accounting Tables
-- This migration creates tables for credit requests and balance updates

-- 1. Credit Requests Table
-- Stores credit requests from TutorCruncher (if endpoint exists) or manually created
CREATE TABLE IF NOT EXISTS credit_requests (
    id BIGINT PRIMARY KEY,
    display_id TEXT NOT NULL,
    client_id BIGINT REFERENCES clients(client_id),
    client_first_name TEXT,
    client_last_name TEXT,
    client_email TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'raised', 'approved', 'rejected'
    date_created TIMESTAMP WITH TIME ZONE,
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

-- Indexes for credit requests
CREATE INDEX IF NOT EXISTS idx_credit_requests_client_id ON credit_requests(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_requests_status ON credit_requests(status);
CREATE INDEX IF NOT EXISTS idx_credit_requests_date_created ON credit_requests(date_created);
CREATE INDEX IF NOT EXISTS idx_credit_requests_date_raised ON credit_requests(date_raised);

-- 2. Balance Updates Table
-- Tracks all balance changes for clients over time
CREATE TABLE IF NOT EXISTS balance_updates (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(client_id),
    client_first_name TEXT,
    client_last_name TEXT,
    update_type TEXT NOT NULL, -- 'invoice', 'payment', 'credit', 'refund', 'adjustment'
    related_id BIGINT, -- ID of related invoice, payment_order, credit_request, etc.
    related_type TEXT, -- 'invoice', 'payment_order', 'credit_request', etc.
    previous_balance NUMERIC(12, 2) NOT NULL,
    change_amount NUMERIC(12, 2) NOT NULL,
    new_balance NUMERIC(12, 2) NOT NULL,
    balance_type TEXT NOT NULL DEFAULT 'invoice_balance', -- 'invoice_balance', 'available_balance'
    description TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for balance updates
CREATE INDEX IF NOT EXISTS idx_balance_updates_client_id ON balance_updates(client_id);
CREATE INDEX IF NOT EXISTS idx_balance_updates_created_at ON balance_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_balance_updates_update_type ON balance_updates(update_type);
CREATE INDEX IF NOT EXISTS idx_balance_updates_related ON balance_updates(related_type, related_id);

-- 3. Add status column to invoices if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoices' AND column_name = 'status'
    ) THEN
        ALTER TABLE invoices ADD COLUMN status TEXT DEFAULT 'unpaid';
    END IF;
END $$;

-- 4. Add status column to payment_orders if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'status'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN status TEXT DEFAULT 'pending';
    END IF;
END $$;

-- 5. Add indexes for invoice status filtering
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_date_sent ON invoices(date_sent);

-- 6. Add indexes for payment order status filtering
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_date_sent ON payment_orders(date_sent);

-- Comments for documentation
COMMENT ON TABLE credit_requests IS 'Stores credit requests from TutorCruncher or manually created';
COMMENT ON TABLE balance_updates IS 'Tracks all balance changes for clients over time for audit trail';
COMMENT ON COLUMN credit_requests.status IS 'Status: draft, raised, approved, rejected';
COMMENT ON COLUMN balance_updates.update_type IS 'Type of update: invoice, payment, credit, refund, adjustment';
COMMENT ON COLUMN balance_updates.balance_type IS 'Which balance was updated: invoice_balance or available_balance';

