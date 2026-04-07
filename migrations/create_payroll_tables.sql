-- Migration: Create payroll tables
-- This migration creates tables for storing payroll data from multiple providers

-- Table: payroll_providers
CREATE TABLE IF NOT EXISTS payroll_providers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: payroll_uploads
CREATE TABLE IF NOT EXISTS payroll_uploads (
    id SERIAL PRIMARY KEY,
    provider_id INTEGER NOT NULL REFERENCES payroll_providers(id),
    uploaded_by VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    raw_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_payroll_uploads_provider ON payroll_uploads(provider_id);
CREATE INDEX IF NOT EXISTS idx_payroll_uploads_period ON payroll_uploads(pay_period_start, pay_period_end);

-- Table: payroll_periods (normalized)
CREATE TABLE IF NOT EXISTS payroll_periods (
    id SERIAL PRIMARY KEY,
    upload_id INTEGER REFERENCES payroll_uploads(id),
    provider_id INTEGER NOT NULL REFERENCES payroll_providers(id),
    pay_period_date DATE NOT NULL,
    gross_wages NUMERIC(12, 2) NOT NULL DEFAULT 0,
    employer_taxes NUMERIC(12, 2) NOT NULL DEFAULT 0,
    benefits NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_payroll_cost NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(provider_id, pay_period_date)
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_date ON payroll_periods(pay_period_date);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_provider_date ON payroll_periods(provider_id, pay_period_date);

-- Materialized view: payroll_monthly_aggregates
CREATE MATERIALIZED VIEW IF NOT EXISTS payroll_monthly_aggregates AS
SELECT 
    DATE_TRUNC('month', pay_period_date)::DATE AS month,
    provider_id,
    SUM(gross_wages) AS total_gross_wages,
    SUM(employer_taxes) AS total_employer_taxes,
    SUM(benefits) AS total_benefits,
    SUM(total_payroll_cost) AS total_payroll_cost,
    COUNT(*) AS period_count
FROM payroll_periods
GROUP BY DATE_TRUNC('month', pay_period_date), provider_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_monthly_aggregates_unique ON payroll_monthly_aggregates(month, provider_id);
