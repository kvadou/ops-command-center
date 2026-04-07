-- Add event lead capture fields to booking_types table
ALTER TABLE booking_types 
ADD COLUMN IF NOT EXISTS is_event_lead_capture BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS event_name VARCHAR(255) DEFAULT '';

-- Add comments for documentation
COMMENT ON COLUMN booking_types.is_event_lead_capture IS 'Whether this booking type is for event lead capture (no payment required)';
COMMENT ON COLUMN booking_types.event_name IS 'Name of the event for lead capture forms';

-- Create index for better performance on event lead capture queries
CREATE INDEX IF NOT EXISTS idx_booking_types_event_lead_capture ON booking_types(is_event_lead_capture);
CREATE INDEX IF NOT EXISTS idx_booking_types_event_name ON booking_types(event_name);
