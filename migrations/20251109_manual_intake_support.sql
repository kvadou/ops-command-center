-- Migration: Manual intake support for Client Conversion Tracker
-- Adds flags and metadata needed to track manually entered prospects

BEGIN;

-- Extend clients table with manual intake metadata
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS manual_intake BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS intake_notes TEXT,
  ADD COLUMN IF NOT EXISTS intake_source VARCHAR(100),
  ADD COLUMN IF NOT EXISTS intake_created_by VARCHAR(255),
  ADD COLUMN IF NOT EXISTS follow_up_due_at TIMESTAMPTZ;

-- Ensure manual_intake has a default
ALTER TABLE clients
  ALTER COLUMN manual_intake SET DEFAULT false;

-- Index for follow-up ordering
CREATE INDEX IF NOT EXISTS idx_clients_follow_up_due_at ON clients(follow_up_due_at);

-- Extend conversion tracking table with manual entry metadata
ALTER TABLE client_conversion_tracking
  ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_due_at DATE,
  ADD COLUMN IF NOT EXISTS intake_created_by VARCHAR(255);

ALTER TABLE client_conversion_tracking
  ALTER COLUMN manual_entry SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conversion_tracking_follow_up_due_at
  ON client_conversion_tracking(follow_up_due_at);

-- Keep client_id unique to avoid duplicate tracking rows
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_conversion_tracking_client_unique
  ON client_conversion_tracking(client_id);

COMMENT ON COLUMN clients.manual_intake IS 'True when the client was added via internal manual intake workflow';
COMMENT ON COLUMN clients.intake_notes IS 'Internal notes captured during manual intake';
COMMENT ON COLUMN clients.intake_source IS 'Source label provided during manual intake (e.g., referral, auction)';
COMMENT ON COLUMN clients.intake_created_by IS 'User identifier who created the manual intake';
COMMENT ON COLUMN clients.follow_up_due_at IS 'Timestamp representing the next follow-up deadline for this prospect';

COMMENT ON COLUMN client_conversion_tracking.manual_entry IS 'True when conversion record originated from manual intake';
COMMENT ON COLUMN client_conversion_tracking.follow_up_due_at IS 'Date of next follow-up action for the prospect';
COMMENT ON COLUMN client_conversion_tracking.intake_created_by IS 'User identifier who created the conversion entry';

COMMIT;

