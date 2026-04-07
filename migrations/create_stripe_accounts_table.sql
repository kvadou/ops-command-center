-- Migration: Create Stripe accounts configuration table
-- This migration creates a table to manage multiple Stripe accounts

CREATE TABLE IF NOT EXISTS stripe_accounts (
    id SERIAL PRIMARY KEY,
    stripe_account_id VARCHAR(255) UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    api_key_env_var VARCHAR(255) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_accounts_active ON stripe_accounts(active);
CREATE INDEX IF NOT EXISTS idx_stripe_accounts_stripe_account_id ON stripe_accounts(stripe_account_id);
