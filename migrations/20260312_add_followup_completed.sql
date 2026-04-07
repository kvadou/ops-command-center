-- Add follow_up_completed column to invoice_activity_log
-- Allows marking follow-ups as complete so they don't show in the queue
ALTER TABLE invoice_activity_log ADD COLUMN IF NOT EXISTS follow_up_completed BOOLEAN DEFAULT FALSE;

-- Index for efficient follow-up queue queries
CREATE INDEX IF NOT EXISTS idx_invoice_activity_log_followup_queue
  ON invoice_activity_log (follow_up_date, follow_up_completed)
  WHERE follow_up_date IS NOT NULL AND follow_up_completed = FALSE;
