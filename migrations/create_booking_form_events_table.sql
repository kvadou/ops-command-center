-- Create booking_form_events table to track user progress through the booking form
-- This tracks when users reach different steps, create Stripe checkout sessions, and abandon the process

CREATE TABLE IF NOT EXISTS booking_form_events (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  submission_id INTEGER REFERENCES booking_submissions(id) ON DELETE SET NULL,
  
  -- Event details
  event_type VARCHAR(100) NOT NULL, -- 'form_view', 'form_start', 'step_completed', 'stripe_checkout_created', 'stripe_checkout_abandoned', 'payment_completed', 'form_abandoned'
  step_name VARCHAR(100), -- 'parent_info', 'student_info', 'time_selection', 'payment', etc.
  step_number INTEGER, -- Sequential step number
  
  -- Context data
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional event data (form data snapshot, error messages, etc.)
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Duration tracking (time spent on previous step)
  duration_ms INTEGER -- Time in milliseconds since previous event
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_booking_form_events_session_id ON booking_form_events(session_id);
CREATE INDEX IF NOT EXISTS idx_booking_form_events_submission_id ON booking_form_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_booking_form_events_event_type ON booking_form_events(event_type);
CREATE INDEX IF NOT EXISTS idx_booking_form_events_created_at ON booking_form_events(created_at);
CREATE INDEX IF NOT EXISTS idx_booking_form_events_step_name ON booking_form_events(step_name);

-- Composite index for common queries (get all events for a submission)
CREATE INDEX IF NOT EXISTS idx_booking_form_events_submission_type ON booking_form_events(submission_id, event_type);

COMMENT ON TABLE booking_form_events IS 'Tracks user progress through booking forms - steps completed, Stripe checkout events, and abandonment points';
COMMENT ON COLUMN booking_form_events.session_id IS 'Unique session identifier linking events to a user session';
COMMENT ON COLUMN booking_form_events.submission_id IS 'Links events to a booking submission (null until submission is created)';
COMMENT ON COLUMN booking_form_events.event_type IS 'Type of event: form_view, form_start, step_completed, stripe_checkout_created, stripe_checkout_abandoned, payment_completed, form_abandoned';
COMMENT ON COLUMN booking_form_events.step_name IS 'Name of the form step (parent_info, student_info, time_selection, payment, etc.)';
COMMENT ON COLUMN booking_form_events.step_number IS 'Sequential step number in the form flow';
COMMENT ON COLUMN booking_form_events.metadata IS 'Additional event data (form state snapshot, error messages, Stripe session ID, etc.)';
COMMENT ON COLUMN booking_form_events.duration_ms IS 'Time in milliseconds spent on the previous step';

