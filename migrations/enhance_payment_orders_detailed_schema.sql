-- Migration: Enhance Payment Orders with Detailed Information
-- This migration adds all fields needed to store complete payment order details from TutorCruncher API
-- Run on all environments: local → staging → production → westside → eastside

-- ============================================================================
-- 1. ENHANCE PAYMENT_ORDERS TABLE
-- ============================================================================

-- Add date_void column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'date_void'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN date_void TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Add still_to_pay column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'still_to_pay'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN still_to_pay NUMERIC(12, 2) DEFAULT 0;
    END IF;
END $$;

-- Add payee_role_type column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'payee_role_type'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN payee_role_type TEXT;
    END IF;
END $$;

-- Add charges JSONB column to store full charge details
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_orders' AND column_name = 'charges'
    ) THEN
        ALTER TABLE payment_orders ADD COLUMN charges JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- ============================================================================
-- 2. ENHANCE PAYMENT_ORDER_CHARGES TABLE
-- ============================================================================

-- Add appointment details columns
DO $$ 
BEGIN
    -- Appointment topic
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'appointment_topic'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN appointment_topic TEXT;
    END IF;

    -- Appointment start time
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'appointment_start'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN appointment_start TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Appointment finish time
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'appointment_finish'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN appointment_finish TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Appointment status
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'appointment_status'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN appointment_status TEXT;
    END IF;

    -- Service ID (from appointment)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'service_id'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN service_id BIGINT;
    END IF;

    -- Service name (from appointment)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'service_name'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN service_name TEXT;
    END IF;
END $$;

-- Add adhoc charge details columns
DO $$ 
BEGIN
    -- Adhoc charge description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_description'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_description TEXT;
    END IF;

    -- Adhoc charge date occurred
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_date_occurred'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_date_occurred TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Adhoc charge category ID
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_category_id'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_category_id BIGINT;
    END IF;

    -- Adhoc charge category name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_category_name'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_category_name TEXT;
    END IF;

    -- Adhoc charge pay contractor amount
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_pay_contractor'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_pay_contractor NUMERIC(12, 2);
    END IF;

    -- Adhoc charge client cost
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'adhoc_charge_client_cost'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN adhoc_charge_client_cost NUMERIC(12, 2);
    END IF;
END $$;

-- Add payee details columns
DO $$ 
BEGIN
    -- Payee first name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'payee_first_name'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN payee_first_name TEXT;
    END IF;

    -- Payee last name
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'payee_last_name'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN payee_last_name TEXT;
    END IF;

    -- Payee email
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'payee_email'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN payee_email TEXT;
    END IF;

    -- Payee role type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'payee_role_type'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN payee_role_type TEXT;
    END IF;
END $$;

-- Add full charge JSONB column for storing complete charge details
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payment_order_charges' AND column_name = 'charge_details'
    ) THEN
        ALTER TABLE payment_order_charges ADD COLUMN charge_details JSONB;
    END IF;
END $$;

-- ============================================================================
-- 3. CREATE INDEXES FOR NEW COLUMNS
-- ============================================================================

-- Indexes for payment orders
CREATE INDEX IF NOT EXISTS idx_payment_orders_date_void ON payment_orders(date_void) WHERE date_void IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_orders_still_to_pay ON payment_orders(still_to_pay) WHERE still_to_pay > 0;

-- Indexes for payment order charges
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_service_id ON payment_order_charges(service_id) WHERE service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_adhoc_charge_category_id ON payment_order_charges(adhoc_charge_category_id) WHERE adhoc_charge_category_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_order_charges_appointment_start ON payment_order_charges(appointment_start) WHERE appointment_start IS NOT NULL;

-- ============================================================================
-- 4. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN payment_orders.date_void IS 'Date when payment order was voided';
COMMENT ON COLUMN payment_orders.still_to_pay IS 'Amount still to be paid (0 if fully paid)';
COMMENT ON COLUMN payment_orders.payee_role_type IS 'Role type of payee (e.g., Tutor, Contractor)';
COMMENT ON COLUMN payment_orders.charges IS 'Full JSONB array of all charges from TutorCruncher API';

COMMENT ON COLUMN payment_order_charges.appointment_topic IS 'Topic/title of the appointment';
COMMENT ON COLUMN payment_order_charges.appointment_start IS 'Start time of the appointment';
COMMENT ON COLUMN payment_order_charges.appointment_finish IS 'Finish time of the appointment';
COMMENT ON COLUMN payment_order_charges.appointment_status IS 'Status of the appointment (e.g., complete)';
COMMENT ON COLUMN payment_order_charges.service_id IS 'Service ID associated with the appointment';
COMMENT ON COLUMN payment_order_charges.service_name IS 'Service name associated with the appointment';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_description IS 'Description of the adhoc charge';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_date_occurred IS 'Date when adhoc charge occurred';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_category_id IS 'Category ID of the adhoc charge';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_category_name IS 'Category name of the adhoc charge';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_pay_contractor IS 'Amount to pay contractor for adhoc charge';
COMMENT ON COLUMN payment_order_charges.adhoc_charge_client_cost IS 'Client cost for adhoc charge';
COMMENT ON COLUMN payment_order_charges.charge_details IS 'Full JSONB object of complete charge details from TutorCruncher API';
