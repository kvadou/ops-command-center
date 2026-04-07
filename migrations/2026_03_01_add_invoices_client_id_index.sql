-- Add index on invoices.client_id for faster billing queries
-- 113 query sites reference this column across routes and services
-- Existing indexes: status, date_sent, date_void, still_to_pay, date_paid,
--   invoice_number, stripe_payment_intent_id, payment_method, automated_reminder_date
--
-- IMPORTANT: Run on ALL environments (main, staging, eastside, westside)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
