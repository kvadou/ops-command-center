-- Create booking_form_views table to track landing page views
-- This tracks when someone views the booking form page, before they start filling it out

CREATE TABLE IF NOT EXISTS booking_form_views (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  utm JSONB DEFAULT '{}'::jsonb,
  landing_url TEXT,
  referrer TEXT,
  booking_type_id INTEGER,
  service_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on session_id for quick lookups (to prevent duplicate tracking)
CREATE INDEX IF NOT EXISTS idx_booking_form_views_session_id ON booking_form_views(session_id);

-- Create index on created_at for analytics queries
CREATE INDEX IF NOT EXISTS idx_booking_form_views_created_at ON booking_form_views(created_at);

-- Create index on utm_source for filtering by source
CREATE INDEX IF NOT EXISTS idx_booking_form_views_utm_source ON booking_form_views((utm->>'utm_source'));

-- Create index on utm_campaign for filtering by campaign
CREATE INDEX IF NOT EXISTS idx_booking_form_views_utm_campaign ON booking_form_views((utm->>'utm_campaign'));

COMMENT ON TABLE booking_form_views IS 'Tracks landing page views for booking forms - when someone visits the form page before starting to fill it out';
COMMENT ON COLUMN booking_form_views.session_id IS 'Unique session identifier to prevent duplicate tracking';
COMMENT ON COLUMN booking_form_views.utm IS 'UTM parameters for attribution tracking';
COMMENT ON COLUMN booking_form_views.landing_url IS 'The URL where the user first landed';
COMMENT ON COLUMN booking_form_views.referrer IS 'HTTP referrer header';

