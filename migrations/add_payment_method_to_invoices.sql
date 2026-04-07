-- Add payment_method column to invoices table
-- This column stores the payment method used (Stripe, GoCardless, Manual, etc.)

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Add index for filtering by payment method
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method 
ON invoices(payment_method) 
WHERE payment_method IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN invoices.payment_method IS 'Payment method used for invoice (Stripe, GoCardless, Manual, etc.)';
