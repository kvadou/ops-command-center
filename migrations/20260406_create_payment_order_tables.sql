-- Create payment_orders and payment_order_charges tables
-- These tables are referenced by analytics adhoc pay queries

CREATE TABLE IF NOT EXISTS payment_orders (
    id BIGINT PRIMARY KEY,
    display_id TEXT NOT NULL,
    date_sent TIMESTAMP WITH TIME ZONE NOT NULL,
    amount NUMERIC NOT NULL,
    payee_id BIGINT NOT NULL,
    payee_first TEXT NOT NULL,
    payee_last TEXT NOT NULL,
    payee_email TEXT,
    status TEXT NOT NULL,
    url TEXT NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    date_paid TIMESTAMP WITH TIME ZONE,
    remote_last_updated TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS payment_order_charges (
    payment_order_id BIGINT NOT NULL,
    charge_index INTEGER NOT NULL,
    adhoc_charge_id BIGINT,
    appointment_id BIGINT,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    amount NUMERIC NOT NULL,
    rate NUMERIC NOT NULL,
    sales_code TEXT NOT NULL,
    tax_amount NUMERIC NOT NULL,
    units NUMERIC NOT NULL,
    payer TEXT NOT NULL,
    payee_id BIGINT NOT NULL,
    PRIMARY KEY (payment_order_id, charge_index)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_poc_adhoc_charge_id ON payment_order_charges(adhoc_charge_id);
CREATE INDEX IF NOT EXISTS idx_poc_appointment_id ON payment_order_charges(appointment_id);
CREATE INDEX IF NOT EXISTS idx_poc_payment_order_id ON payment_order_charges(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_poc_date ON payment_order_charges(date);
