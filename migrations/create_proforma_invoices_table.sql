-- Migration: Create proforma_invoices table
-- This table stores proforma invoices from TutorCruncher API
-- Proforma invoices capture trial lesson payments that may not result in completed lessons

CREATE TABLE IF NOT EXISTS proforma_invoices (
  id bigint NOT NULL,
  display_id text NOT NULL,
  description text,
  amount numeric(10,2),
  date_sent timestamp with time zone,
  date_paid timestamp with time zone,
  client_id bigint,
  client_first_name text,
  client_last_name text,
  client_email text,
  status text,
  still_to_pay numeric(10,2) DEFAULT 0,
  url text,
  fetched_at timestamp with time zone DEFAULT now(),
  remote_last_updated timestamp with time zone,
  CONSTRAINT proforma_invoices_pkey PRIMARY KEY (id)
);

-- Create index on client_id for faster joins
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_client_id 
ON proforma_invoices(client_id) 
WHERE client_id IS NOT NULL;

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_status 
ON proforma_invoices(status);

-- Create index on date_paid for date range queries
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_date_paid 
ON proforma_invoices(date_paid) 
WHERE date_paid IS NOT NULL;

-- Create index on date_sent for date range queries
CREATE INDEX IF NOT EXISTS idx_proforma_invoices_date_sent 
ON proforma_invoices(date_sent) 
WHERE date_sent IS NOT NULL;

COMMENT ON TABLE proforma_invoices IS 'Proforma invoices from TutorCruncher API - captures trial lesson payments';
COMMENT ON COLUMN proforma_invoices.amount IS 'Total amount of the proforma invoice';
COMMENT ON COLUMN proforma_invoices.date_sent IS 'Date when the proforma invoice was sent';
COMMENT ON COLUMN proforma_invoices.date_paid IS 'Date when the proforma invoice was paid';
COMMENT ON COLUMN proforma_invoices.status IS 'Status of the proforma invoice (paid, unpaid, etc.)';
COMMENT ON COLUMN proforma_invoices.still_to_pay IS 'Amount still to pay on the proforma invoice';



