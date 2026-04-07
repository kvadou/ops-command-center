-- Migration: Add monthly_subscription_enabled column to term_billing_configs
-- This allows storing whether monthly billing option is enabled for a term billing config

ALTER TABLE term_billing_configs 
ADD COLUMN IF NOT EXISTS monthly_subscription_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN term_billing_configs.monthly_subscription_enabled IS 'If true, allows customers to pay monthly for upcoming lessons instead of full term upfront';
