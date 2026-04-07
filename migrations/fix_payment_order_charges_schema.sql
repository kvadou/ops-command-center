-- Fix payment_order_charges table schema to match sync expectations
-- Add missing columns that syncPaymentOrders expects

-- Add appointment_id column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS appointment_id bigint;

-- Add date column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS date timestamp with time zone;

-- Add rate column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS rate numeric;

-- Add sales_code column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS sales_code text;

-- Add tax_amount column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS tax_amount numeric;

-- Add units column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS units numeric;

-- Add payer column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS payer text;

-- Add payee_id column
ALTER TABLE payment_order_charges 
ADD COLUMN IF NOT EXISTS payee_id bigint;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_appointment_id ON payment_order_charges(appointment_id);
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_payee_id ON payment_order_charges(payee_id);
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_date ON payment_order_charges(date);

-- Update the primary key constraint to match the expected schema
-- First, drop the existing primary key constraint
ALTER TABLE payment_order_charges DROP CONSTRAINT IF EXISTS payment_order_charges_pkey;

-- Add the composite primary key that the sync code expects
ALTER TABLE payment_order_charges 
ADD CONSTRAINT payment_order_charges_pkey PRIMARY KEY (payment_order_id, charge_index);
