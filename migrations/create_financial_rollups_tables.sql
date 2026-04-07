-- Migration: Create financial rollups table
-- This migration creates a table for precomputed monthly financial aggregates

CREATE TABLE IF NOT EXISTS monthly_financial_rollups (
    id SERIAL PRIMARY KEY,
    period_month DATE NOT NULL,
    stripe_account_id INTEGER REFERENCES stripe_accounts(id),
    gross_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    refunds NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ramp_spend NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payroll_cost NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ebitda_proxy NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ebitda_margin NUMERIC(5, 4),
    net_burn NUMERIC(12, 2) NOT NULL DEFAULT 0,
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(period_month, stripe_account_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_financial_rollups_month ON monthly_financial_rollups(period_month);
CREATE INDEX IF NOT EXISTS idx_monthly_financial_rollups_account ON monthly_financial_rollups(stripe_account_id);
CREATE INDEX IF NOT EXISTS idx_monthly_financial_rollups_account_month ON monthly_financial_rollups(stripe_account_id, period_month);
