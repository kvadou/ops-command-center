-- Migration: Add realized_revenue and aroas columns to booking_submissions
-- This migration adds columns to store calculated realized revenue and AROAS values
-- for Meta-acquired clients

-- Add columns if they don't exist
ALTER TABLE booking_submissions 
ADD COLUMN IF NOT EXISTS realized_revenue NUMERIC(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS aroas NUMERIC(10,4) DEFAULT NULL;

-- Add index for faster queries on realized_revenue
CREATE INDEX IF NOT EXISTS idx_booking_submissions_realized_revenue 
ON booking_submissions(realized_revenue) 
WHERE realized_revenue > 0;

-- Add index for tc_client_id to speed up joins with invoices
CREATE INDEX IF NOT EXISTS idx_booking_submissions_tc_client_id_realized 
ON booking_submissions(tc_client_id) 
WHERE tc_client_id IS NOT NULL;

COMMENT ON COLUMN booking_submissions.realized_revenue IS 'Total realized revenue from invoices for Meta-acquired clients';
COMMENT ON COLUMN booking_submissions.aroas IS 'Advertising Return on Ad Spend (AROAS) = realized_revenue / ad_spend';

