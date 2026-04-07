-- Webhook Events Deduplication Table
-- Prevents duplicate processing when external systems retry webhooks

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL,
  event_source VARCHAR(50) NOT NULL, -- 'tutorcruncher', 'stripe', 'missive', 'brevo'
  event_type VARCHAR(100),
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'failed', 'processing'
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint on event_id + source to prevent duplicates
  CONSTRAINT webhook_events_unique_event UNIQUE (event_id, event_source)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
  ON webhook_events(event_id, event_source);

-- Index for cleanup of old events
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
  ON webhook_events(processed_at);

-- Index for monitoring failed events
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON webhook_events(processing_status) WHERE processing_status = 'failed';

COMMENT ON TABLE webhook_events IS 'Tracks processed webhook events for idempotency';
COMMENT ON COLUMN webhook_events.event_id IS 'Unique ID from the webhook source (e.g., Stripe event ID, TC webhook ID)';
COMMENT ON COLUMN webhook_events.event_source IS 'Which system sent the webhook';
