-- Add booking_notification_sent_at column to booking_submissions table
-- This column tracks when booking notification emails were sent to prevent duplicates

ALTER TABLE booking_submissions 
ADD COLUMN IF NOT EXISTS booking_notification_sent_at TIMESTAMP WITH TIME ZONE;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_booking_submissions_notification_sent_at 
ON booking_submissions (booking_notification_sent_at) 
WHERE booking_notification_sent_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN booking_submissions.booking_notification_sent_at IS 
'Tracks when booking notification email was sent to support@acmeops.com to prevent duplicate emails';

