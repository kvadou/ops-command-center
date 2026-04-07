-- Add flag columns to invoices table for issue tracking
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS flag VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS flag_note TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS flagged_by VARCHAR(255);
