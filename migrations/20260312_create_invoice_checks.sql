-- Check reconciliation table for tracking check deposits
CREATE TABLE IF NOT EXISTS invoice_checks (
  id SERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL,
  client_id TEXT,
  school_name VARCHAR(255),
  check_number VARCHAR(50),
  amount DECIMAL(10,2) NOT NULL,
  date_received DATE,
  deposited BOOLEAN DEFAULT FALSE,
  deposited_at TIMESTAMP WITH TIME ZONE,
  flagged_reason VARCHAR(100), -- 'voided', 'lost', 'issue'
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_checks_invoice_id ON invoice_checks (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_checks_deposited ON invoice_checks (deposited) WHERE deposited = FALSE;
