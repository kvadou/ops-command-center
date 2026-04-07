-- Add isStaffBooking column to booking_submissions table
-- Tracks whether a submission was made via the staff booking form

ALTER TABLE booking_submissions
    ADD COLUMN IF NOT EXISTS "isStaffBooking" boolean DEFAULT false;

COMMENT ON COLUMN booking_submissions."isStaffBooking" IS 'If true, this submission was made via the staff booking form with staff discounts applied';



