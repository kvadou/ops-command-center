-- Add preferred tutor columns to booking_submissions
-- Captures tutor preference when parent books from a tutor's public profile page
-- Does NOT auto-assign — admins still do manual tutor matching

ALTER TABLE booking_submissions ADD COLUMN IF NOT EXISTS preferred_tutor_id INTEGER;
ALTER TABLE booking_submissions ADD COLUMN IF NOT EXISTS preferred_tutor_name VARCHAR(255);
