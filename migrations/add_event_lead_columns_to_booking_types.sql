-- Adds event lead capture fields to booking_types
-- Safe to run multiple times due to IF NOT EXISTS

ALTER TABLE booking_types
  ADD COLUMN IF NOT EXISTS is_event_lead_capture BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS event_name VARCHAR(255) DEFAULT '';

COMMENT ON COLUMN booking_types.is_event_lead_capture IS 'Marks booking type as Event Lead Capture (single-page lead form)';
COMMENT ON COLUMN booking_types.event_name IS 'Display name for the event lead capture form.';


