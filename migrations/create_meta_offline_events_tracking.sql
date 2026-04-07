-- Migration: Create Meta Offline Events Tracking Table
-- This table tracks which booking submissions have been uploaded to Meta as offline events
-- to prevent duplicate uploads and enable retry logic

CREATE TABLE IF NOT EXISTS meta_offline_events (
    id SERIAL PRIMARY KEY,
    submission_id INTEGER NOT NULL REFERENCES booking_submissions(id) ON DELETE CASCADE,
    
    -- Event details
    event_name VARCHAR(50) NOT NULL DEFAULT 'Lead', -- Lead, Purchase, CompleteRegistration, etc.
    event_id VARCHAR(255) UNIQUE, -- Unique event ID for deduplication
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Upload tracking
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    upload_status VARCHAR(20) DEFAULT 'pending', -- pending, success, failed
    upload_error TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one upload record per submission (can retry if failed)
    UNIQUE(submission_id, event_name)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_meta_offline_events_submission_id ON meta_offline_events(submission_id);
CREATE INDEX IF NOT EXISTS idx_meta_offline_events_upload_status ON meta_offline_events(upload_status);
CREATE INDEX IF NOT EXISTS idx_meta_offline_events_event_id ON meta_offline_events(event_id);
CREATE INDEX IF NOT EXISTS idx_meta_offline_events_event_time ON meta_offline_events(event_time);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meta_offline_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_meta_offline_events_updated_at
    BEFORE UPDATE ON meta_offline_events
    FOR EACH ROW
    EXECUTE FUNCTION update_meta_offline_events_updated_at();

COMMENT ON TABLE meta_offline_events IS 'Tracks offline events uploaded to Meta Conversions API';
COMMENT ON COLUMN meta_offline_events.submission_id IS 'Reference to the booking submission that generated this event';
COMMENT ON COLUMN meta_offline_events.event_name IS 'Meta event name (Lead, Purchase, CompleteRegistration, etc.)';
COMMENT ON COLUMN meta_offline_events.event_id IS 'Unique event ID for Meta deduplication';
COMMENT ON COLUMN meta_offline_events.upload_status IS 'Status of upload: pending, success, failed';
COMMENT ON COLUMN meta_offline_events.retry_count IS 'Number of retry attempts for failed uploads';

