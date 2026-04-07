-- Add error tracking fields to booking_submissions table
ALTER TABLE booking_submissions 
ADD COLUMN IF NOT EXISTS submission_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS checkout_session_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS payment_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS client_creation_errors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS recommendations JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS error_summary TEXT;

-- Add index for querying submissions with errors
CREATE INDEX IF NOT EXISTS idx_booking_submissions_has_errors 
ON booking_submissions ((CASE WHEN submission_errors != '[]'::jsonb OR checkout_session_errors != '[]'::jsonb OR payment_errors != '[]'::jsonb OR client_creation_errors != '[]'::jsonb THEN true ELSE false END));

COMMENT ON COLUMN booking_submissions.submission_errors IS 'Array of errors that occurred during form submission';
COMMENT ON COLUMN booking_submissions.checkout_session_errors IS 'Array of errors that occurred during Stripe checkout session creation';
COMMENT ON COLUMN booking_submissions.payment_errors IS 'Array of errors that occurred during payment processing';
COMMENT ON COLUMN booking_submissions.client_creation_errors IS 'Array of errors that occurred during TutorCruncher client creation';
COMMENT ON COLUMN booking_submissions.recommendations IS 'Array of recommendations for improving conversion';
COMMENT ON COLUMN booking_submissions.last_error_at IS 'Timestamp of the most recent error';
COMMENT ON COLUMN booking_submissions.error_summary IS 'Human-readable summary of errors';

