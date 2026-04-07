-- Lead Scoring Migration
-- Adds lead_score columns to clients and lead_score_history table for audit trail
-- Idempotent: safe to run multiple times

-- Add scoring columns to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score_tier VARCHAR(10);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score_reasoning TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score_components JSONB;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score_stale BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMP WITH TIME ZONE;

-- Index for background worker to find stale scores efficiently
CREATE INDEX IF NOT EXISTS idx_clients_lead_score_stale
  ON clients (lead_score_stale)
  WHERE lead_score_stale = true AND status = 'prospect';

-- Index for sorting by score in CCT list
CREATE INDEX IF NOT EXISTS idx_clients_lead_score
  ON clients (lead_score DESC NULLS LAST)
  WHERE status = 'prospect';

-- Score history for debugging and calibration
CREATE TABLE IF NOT EXISTS lead_score_history (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  tier VARCHAR(10) NOT NULL,
  components JSONB NOT NULL,
  reasoning TEXT NOT NULL,
  trigger_event VARCHAR(100),
  model_used VARCHAR(50),
  tokens_used INTEGER,
  scored_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_history_client
  ON lead_score_history (client_id, scored_at DESC);
