-- Migration: Create Ramp integration tables
-- This migration creates tables for storing Ramp expense data

-- Table: ramp_transactions (append-only)
CREATE TABLE IF NOT EXISTS ramp_transactions (
    id SERIAL PRIMARY KEY,
    ramp_transaction_id VARCHAR(255) UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    merchant_name VARCHAR(255),
    category VARCHAR(255),
    card_id VARCHAR(255),
    department VARCHAR(255),
    memo TEXT,
    tags JSONB,
    state VARCHAR(50) NOT NULL,
    transaction_date DATE NOT NULL,
    raw_data JSONB NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ramp_transactions_date ON ramp_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_ramp_transactions_category ON ramp_transactions(category);
CREATE INDEX IF NOT EXISTS idx_ramp_transactions_state ON ramp_transactions(state);
CREATE INDEX IF NOT EXISTS idx_ramp_transactions_merchant ON ramp_transactions(merchant_name);

-- Table: ramp_vendors
CREATE TABLE IF NOT EXISTS ramp_vendors (
    id SERIAL PRIMARY KEY,
    ramp_vendor_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ramp_vendors_name ON ramp_vendors(name);

-- Table: ramp_categories
CREATE TABLE IF NOT EXISTS ramp_categories (
    id SERIAL PRIMARY KEY,
    ramp_category_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    parent_category_id VARCHAR(255),
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ramp_categories_parent ON ramp_categories(parent_category_id);

-- Table: ramp_cards
CREATE TABLE IF NOT EXISTS ramp_cards (
    id SERIAL PRIMARY KEY,
    ramp_card_id VARCHAR(255) UNIQUE NOT NULL,
    last_four VARCHAR(4),
    cardholder_name VARCHAR(255),
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: ramp_reimbursements
CREATE TABLE IF NOT EXISTS ramp_reimbursements (
    id SERIAL PRIMARY KEY,
    ramp_reimbursement_id VARCHAR(255) UNIQUE NOT NULL,
    employee_name VARCHAR(255),
    amount NUMERIC(12, 2) NOT NULL,
    category VARCHAR(255),
    state VARCHAR(50) NOT NULL,
    receipt_date DATE,
    raw_data JSONB,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_outlier BOOLEAN DEFAULT FALSE,
    outlier_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_ramp_reimbursements_outlier ON ramp_reimbursements(is_outlier);
CREATE INDEX IF NOT EXISTS idx_ramp_reimbursements_date ON ramp_reimbursements(receipt_date);
CREATE INDEX IF NOT EXISTS idx_ramp_reimbursements_employee ON ramp_reimbursements(employee_name);

-- Materialized view: ramp_monthly_aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS ramp_monthly_aggregates AS
SELECT 
    DATE_TRUNC('month', transaction_date)::DATE AS month,
    SUM(amount) AS total_spend,
    COUNT(*) AS transaction_count,
    -- Card vs reimbursement breakdown
    SUM(CASE WHEN card_id IS NOT NULL THEN amount ELSE 0 END) AS card_spend,
    COALESCE((
        SELECT SUM(amount) FROM ramp_reimbursements 
        WHERE DATE_TRUNC('month', receipt_date) = DATE_TRUNC('month', rt.transaction_date)
        AND state = 'APPROVED'
    ), 0) AS reimbursement_spend
FROM ramp_transactions rt
WHERE state = 'SETTLED'
GROUP BY DATE_TRUNC('month', transaction_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ramp_monthly_aggregates_month ON ramp_monthly_aggregates(month);
