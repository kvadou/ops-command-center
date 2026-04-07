-- Add date_paid column to invoices table
-- This column stores the date when the invoice was paid

ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS date_paid TIMESTAMP WITH TIME ZONE;

-- Add index for filtering by date_paid
CREATE INDEX IF NOT EXISTS idx_invoices_date_paid 
ON invoices(date_paid) 
WHERE date_paid IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN invoices.date_paid IS 'Date when the invoice was paid';
