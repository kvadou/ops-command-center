-- Create broadcasts table to store email broadcasts
-- This table stores broadcasts that can be sent to clients or tutors

CREATE TABLE IF NOT EXISTS broadcasts (
    id SERIAL PRIMARY KEY,
    send_to VARCHAR(50) NOT NULL DEFAULT 'client', -- 'client' or 'contractor'
    status_filter JSONB DEFAULT '[]'::jsonb, -- Array of statuses: ['prospect', 'live', 'dormant']
    label_filter JSONB DEFAULT '[]'::jsonb, -- Array of label IDs
    email_style VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    email_body TEXT NOT NULL,
    recipient_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'sent', 'scheduled'
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_sent TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_broadcasts_status ON broadcasts(status);
CREATE INDEX IF NOT EXISTS idx_broadcasts_send_to ON broadcasts(send_to);
CREATE INDEX IF NOT EXISTS idx_broadcasts_date_created ON broadcasts(date_created);
CREATE INDEX IF NOT EXISTS idx_broadcasts_last_sent ON broadcasts(last_sent);

-- Create broadcast_history table to track broadcast sends
CREATE TABLE IF NOT EXISTS broadcast_history (
    id SERIAL PRIMARY KEY,
    broadcast_id INTEGER NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
    sent_by INTEGER, -- User/contractor ID who sent it
    sent_by_name VARCHAR(255),
    recipient_count INTEGER DEFAULT 0,
    label_filter VARCHAR(255), -- Label filter used for this send
    description TEXT, -- Description of the send action
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for broadcast history
CREATE INDEX IF NOT EXISTS idx_broadcast_history_broadcast_id ON broadcast_history(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_history_timestamp ON broadcast_history(timestamp);

-- Add comments
COMMENT ON TABLE broadcasts IS 'Stores email broadcasts that can be sent to clients or tutors';
COMMENT ON COLUMN broadcasts.send_to IS 'Target audience: client or contractor (tutor)';
COMMENT ON COLUMN broadcasts.status_filter IS 'JSON array of client/tutor statuses to filter recipients';
COMMENT ON COLUMN broadcasts.label_filter IS 'JSON array of label IDs to filter recipients';
COMMENT ON COLUMN broadcasts.recipient_count IS 'Number of recipients that will receive this broadcast';
COMMENT ON TABLE broadcast_history IS 'Tracks history of broadcast sends';

