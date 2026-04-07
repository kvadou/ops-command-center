-- Migration: Create Stripe transactions tables
-- This migration creates tables for storing Stripe transaction data from multiple accounts

-- Table: stripe_transactions (append-only raw data)
CREATE TABLE IF NOT EXISTS stripe_transactions (
    id SERIAL PRIMARY KEY,
    stripe_account_id INTEGER NOT NULL REFERENCES stripe_accounts(id) ON DELETE CASCADE,
    stripe_transaction_id VARCHAR(255) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('charge', 'refund', 'fee')),
    amount NUMERIC(12, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    raw_data JSONB NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(stripe_account_id, stripe_transaction_id, transaction_type)
);

CREATE INDEX IF NOT EXISTS idx_stripe_transactions_account_id ON stripe_transactions(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_created_at ON stripe_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_type ON stripe_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_stripe_transactions_account_date ON stripe_transactions(stripe_account_id, created_at);

-- Materialized view: stripe_daily_revenue
-- Aggregates daily gross/net revenue per account with refund totals and rates
CREATE MATERIALIZED VIEW IF NOT EXISTS stripe_daily_revenue AS
SELECT 
    stripe_account_id,
    DATE(created_at) AS revenue_date,
    SUM(CASE WHEN transaction_type = 'charge' THEN amount ELSE 0 END) AS gross_revenue,
    SUM(CASE WHEN transaction_type = 'charge' THEN amount ELSE 0 END) - 
    ABS(SUM(CASE WHEN transaction_type = 'fee' THEN amount ELSE 0 END)) AS net_revenue,
    ABS(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END)) AS refunds,
    ABS(SUM(CASE WHEN transaction_type = 'fee' THEN amount ELSE 0 END)) AS fees,
    CASE 
        WHEN SUM(CASE WHEN transaction_type = 'charge' THEN amount ELSE 0 END) > 0 
        THEN ABS(SUM(CASE WHEN transaction_type = 'refund' THEN amount ELSE 0 END)) / 
             SUM(CASE WHEN transaction_type = 'charge' THEN amount ELSE 0 END)
        ELSE 0 
    END AS refund_rate
FROM stripe_transactions
WHERE status IN ('succeeded', 'paid', 'completed')
GROUP BY stripe_account_id, DATE(created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stripe_daily_revenue_unique ON stripe_daily_revenue(stripe_account_id, revenue_date);
CREATE INDEX IF NOT EXISTS idx_stripe_daily_revenue_date ON stripe_daily_revenue(revenue_date);
