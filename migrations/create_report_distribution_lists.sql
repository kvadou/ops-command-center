-- Create table for managing report distribution lists
CREATE TABLE IF NOT EXISTS report_distribution_lists (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(report_type, email)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_report_distribution_lists_type_active 
  ON report_distribution_lists(report_type, active) 
  WHERE active = TRUE;

-- Create table for tracking report sends
CREATE TABLE IF NOT EXISTS report_sends (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(50) NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  brevo_message_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'pending'))
);

-- Create index for tracking sends
CREATE INDEX IF NOT EXISTS idx_report_sends_type_period 
  ON report_sends(report_type, period_start, period_end);

