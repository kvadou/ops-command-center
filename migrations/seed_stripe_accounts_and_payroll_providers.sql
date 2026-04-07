-- Migration: Seed initial Stripe accounts and payroll providers
-- This migration seeds the initial Stripe accounts and payroll providers

-- Seed Stripe accounts
INSERT INTO stripe_accounts (stripe_account_id, display_name, api_key_env_var, active)
VALUES 
    ('acct_acmeops', 'Acme Operations', 'STRIPE_SECRET_KEY', TRUE),
    ('acct_teachstorytime', 'Teach Story Time', 'STRIPE_TEACH_STORY_TIME_KEY', TRUE)
ON CONFLICT (stripe_account_id) DO NOTHING;

-- Seed payroll providers
INSERT INTO payroll_providers (name, active)
VALUES 
    ('Engage PEO', TRUE),
    ('Justworks', TRUE)
ON CONFLICT (name) DO NOTHING;
