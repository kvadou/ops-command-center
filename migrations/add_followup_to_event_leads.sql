-- Add follow-up tracking to event_leads

ALTER TABLE event_leads
  ADD COLUMN IF NOT EXISTS followed_up BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;

COMMENT ON COLUMN event_leads.followed_up IS 'Whether someone has followed up with this lead';
COMMENT ON COLUMN event_leads.followed_up_at IS 'Timestamp of follow-up action';
COMMENT ON COLUMN event_leads.follow_up_notes IS 'Optional notes about the follow-up';


