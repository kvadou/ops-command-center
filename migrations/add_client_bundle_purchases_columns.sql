-- Add missing columns to client_bundle_purchases table
-- These columns are expected by the CCT bundle creation handler

ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS market VARCHAR(50);
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS first_name VARCHAR(255);
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS last_name VARCHAR(255);
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS number_of_lessons INTEGER;
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS lesson_rate DECIMAL(10,2);
ALTER TABLE client_bundle_purchases ADD COLUMN IF NOT EXISTS proforma_invoice_id VARCHAR(100);
