-- Migration: Create payroll history table
-- Stores completed payroll runs with pay period information

CREATE TABLE IF NOT EXISTS payroll_history (
    id SERIAL PRIMARY KEY,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    payroll_deadline DATE NOT NULL,
    payday DATE NOT NULL,
    csv_data TEXT NOT NULL, -- Store the generated CSV content
    summary_data JSONB NOT NULL DEFAULT '{}'::jsonb, -- Store summary totals, employee data, etc.
    employee_rates JSONB NOT NULL DEFAULT '{}'::jsonb, -- Store rates used at time of generation
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups by pay period
CREATE INDEX IF NOT EXISTS idx_payroll_history_pay_period ON payroll_history(pay_period_start, pay_period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_history_payday ON payroll_history(payday);

-- Table: pay_cycles
-- Stores pay cycle definitions for automatic generation
CREATE TABLE IF NOT EXISTS pay_cycles (
    id SERIAL PRIMARY KEY,
    pay_period_start DATE NOT NULL,
    pay_period_end DATE NOT NULL,
    payroll_deadline DATE NOT NULL,
    payday DATE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(pay_period_start, pay_period_end)
);

-- Index for active pay cycles
CREATE INDEX IF NOT EXISTS idx_pay_cycles_active ON pay_cycles(is_active, payday);

