-- Create lesson_reminders table for managing lesson reminder emails
-- Reminders can be configured to send emails to different recipient types before lessons

CREATE TABLE IF NOT EXISTS lesson_reminders (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    enabled BOOLEAN DEFAULT true,
    label_ids JSONB DEFAULT '[]'::jsonb, -- Array of label IDs to filter which jobs get reminders
    recipient_types JSONB DEFAULT '[]'::jsonb, -- Array of recipient types: 'administrator', 'tutor', 'client', 'student'
    send_to_associated_clients BOOLEAN DEFAULT false, -- Whether to send to associated clients (separate from paying client)
    delivery_time_offset VARCHAR(100) NOT NULL, -- e.g., "48 hours before", "24 hours before"
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lesson_reminders_enabled ON lesson_reminders(enabled);
CREATE INDEX IF NOT EXISTS idx_lesson_reminders_date_created ON lesson_reminders(date_created);

COMMENT ON TABLE lesson_reminders IS 'Stores lesson reminder configurations for sending reminder emails before lessons';
COMMENT ON COLUMN lesson_reminders.name IS 'Name of the reminder (e.g., "Client 48 Hour Reminder")';
COMMENT ON COLUMN lesson_reminders.enabled IS 'Whether this reminder is currently active';
COMMENT ON COLUMN lesson_reminders.label_ids IS 'JSON array of label IDs. If empty, reminders are sent for all jobs';
COMMENT ON COLUMN lesson_reminders.recipient_types IS 'JSON array of recipient types who should receive the reminder';
COMMENT ON COLUMN lesson_reminders.send_to_associated_clients IS 'Whether to send reminders to associated clients (separate from paying client)';
COMMENT ON COLUMN lesson_reminders.delivery_time_offset IS 'When to send the reminder relative to lesson time (e.g., "48 hours before")';

