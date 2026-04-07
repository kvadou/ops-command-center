-- Completion Rate Analytics Database Schema
-- Created: 2026-01-09
-- Purpose: Support deep-dive completion rate analytics for forecast accuracy
--
-- IMPORTANT: Run this on ALL environments (main, staging, eastside, westside)
-- to prevent franchise database drift.

-- =============================================================================
-- COMPLETION RATE SNAPSHOTS
-- Daily snapshots of completion rates by dimension (channel, tutor, client, market)
-- =============================================================================
CREATE TABLE IF NOT EXISTS completion_rate_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  dimension_type VARCHAR(50) NOT NULL,        -- 'channel', 'tutor', 'client', 'market', 'overall'
  dimension_value VARCHAR(255),               -- 'home', contractor_id, client_id, 'NYC', NULL for overall
  dimension_display_name VARCHAR(255),        -- Human-readable name for display

  -- Core metrics
  appointments_total INTEGER NOT NULL DEFAULT 0,
  appointments_completed INTEGER NOT NULL DEFAULT 0,      -- complete + cancelled-chargeable
  appointments_cancelled INTEGER NOT NULL DEFAULT 0,       -- cancelled (non-chargeable)
  completion_rate NUMERIC(5,4) NOT NULL DEFAULT 0,        -- 0.0000 to 1.0000

  -- Revenue impact
  revenue_realized NUMERIC(12,2) DEFAULT 0,               -- Revenue from completed lessons
  revenue_lost NUMERIC(12,2) DEFAULT 0,                   -- Revenue from cancelled (non-chargeable)

  -- Comparison metrics
  baseline_rate NUMERIC(5,4),                             -- Previous period rate for comparison
  rate_change NUMERIC(5,4),                               -- Current - baseline

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint prevents duplicate snapshots
  UNIQUE(snapshot_date, dimension_type, dimension_value)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_completion_snapshots_date
  ON completion_rate_snapshots(snapshot_date);

CREATE INDEX IF NOT EXISTS idx_completion_snapshots_dimension
  ON completion_rate_snapshots(dimension_type, dimension_value);

CREATE INDEX IF NOT EXISTS idx_completion_snapshots_date_type
  ON completion_rate_snapshots(snapshot_date, dimension_type);

-- Composite index for common dashboard query pattern
CREATE INDEX IF NOT EXISTS idx_completion_snapshots_dashboard
  ON completion_rate_snapshots(dimension_type, snapshot_date DESC, completion_rate);


-- =============================================================================
-- COMPLETION RATE ANOMALIES
-- Auto-detected issues for weekly ops review
-- =============================================================================
CREATE TABLE IF NOT EXISTS completion_rate_anomalies (
  id SERIAL PRIMARY KEY,
  detected_at TIMESTAMPTZ DEFAULT NOW(),

  -- What triggered the anomaly
  dimension_type VARCHAR(50) NOT NULL,        -- 'tutor', 'client', 'market', 'channel'
  dimension_value VARCHAR(255),               -- contractor_id, client_id, market name, channel name
  dimension_display_name VARCHAR(255),        -- Human-readable name

  -- Anomaly details
  anomaly_type VARCHAR(50) NOT NULL,          -- 'low_rate', 'high_variance', 'sudden_drop', 'improving'
  severity VARCHAR(20) DEFAULT 'medium',      -- 'low', 'medium', 'high', 'critical'

  -- Metrics
  current_rate NUMERIC(5,4) NOT NULL,
  baseline_rate NUMERIC(5,4) NOT NULL,
  deviation_percent NUMERIC(5,2),             -- How much off from baseline (%)
  appointments_affected INTEGER,
  revenue_impact NUMERIC(12,2),               -- Estimated revenue at stake

  -- Context
  period_start DATE,
  period_end DATE,
  suggested_action TEXT,

  -- Resolution tracking
  status VARCHAR(20) DEFAULT 'open',          -- 'open', 'acknowledged', 'resolved', 'dismissed'
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER,                        -- User ID who reviewed
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for anomaly queries
CREATE INDEX IF NOT EXISTS idx_completion_anomalies_status
  ON completion_rate_anomalies(status);

CREATE INDEX IF NOT EXISTS idx_completion_anomalies_detected
  ON completion_rate_anomalies(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_completion_anomalies_dimension
  ON completion_rate_anomalies(dimension_type, dimension_value);

CREATE INDEX IF NOT EXISTS idx_completion_anomalies_severity
  ON completion_rate_anomalies(severity, status);

-- Index for weekly review dashboard
CREATE INDEX IF NOT EXISTS idx_completion_anomalies_review
  ON completion_rate_anomalies(status, severity, detected_at DESC);


-- =============================================================================
-- COMPLETION RATE THRESHOLDS (Configuration)
-- Configurable thresholds for anomaly detection
-- =============================================================================
CREATE TABLE IF NOT EXISTS completion_rate_thresholds (
  id SERIAL PRIMARY KEY,
  dimension_type VARCHAR(50) NOT NULL,        -- 'channel', 'tutor', 'client', 'market', 'overall'
  channel VARCHAR(50),                        -- Optional: specific channel thresholds

  -- Thresholds
  low_rate_threshold NUMERIC(5,4) DEFAULT 0.85,           -- Below this = low_rate anomaly
  sudden_drop_threshold NUMERIC(5,4) DEFAULT 0.10,        -- 10pp drop = sudden_drop anomaly
  high_variance_threshold NUMERIC(5,4) DEFAULT 0.15,      -- 15% std dev = high_variance
  improvement_threshold NUMERIC(5,4) DEFAULT 0.05,        -- 5pp improvement = celebrating

  -- Minimum data requirements
  min_appointments INTEGER DEFAULT 10,                    -- Need at least N appointments
  lookback_days INTEGER DEFAULT 30,                       -- Period for rate calculation
  comparison_days INTEGER DEFAULT 90,                     -- Period for baseline

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(dimension_type, channel)
);

-- Seed default thresholds
INSERT INTO completion_rate_thresholds (dimension_type, channel, low_rate_threshold, sudden_drop_threshold)
VALUES
  ('overall', NULL, 0.90, 0.08),
  ('channel', 'home', 0.92, 0.08),
  ('channel', 'digital', 0.88, 0.10),
  ('channel', 'clubs', 0.95, 0.05),
  ('channel', 'schools', 0.94, 0.06),
  ('tutor', NULL, 0.85, 0.10),
  ('client', NULL, 0.80, 0.15),
  ('market', NULL, 0.88, 0.10)
ON CONFLICT (dimension_type, channel) DO NOTHING;


-- =============================================================================
-- AI ANALYSIS LOG
-- Track AI-assisted analysis calls for cost control
-- =============================================================================
CREATE TABLE IF NOT EXISTS completion_rate_ai_logs (
  id SERIAL PRIMARY KEY,
  analysis_type VARCHAR(50) NOT NULL,         -- 'individual', 'weekly_summary', 'revenue_opportunity'
  dimension_type VARCHAR(50),
  dimension_value VARCHAR(255),

  -- Request details
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  model_used VARCHAR(100),
  cost_estimate NUMERIC(8,4),                 -- USD

  -- Response summary
  response_summary TEXT,                      -- Brief summary of AI response

  -- User context
  requested_by INTEGER,                       -- User ID

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for cost tracking
CREATE INDEX IF NOT EXISTS idx_ai_logs_date
  ON completion_rate_ai_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_ai_logs_user
  ON completion_rate_ai_logs(requested_by, created_at DESC);


-- =============================================================================
-- HELPER VIEW: Current Completion Rates by Dimension
-- Efficient view for dashboard queries
-- =============================================================================
CREATE OR REPLACE VIEW v_current_completion_rates AS
WITH latest_snapshot AS (
  SELECT MAX(snapshot_date) as max_date
  FROM completion_rate_snapshots
)
SELECT
  crs.dimension_type,
  crs.dimension_value,
  crs.dimension_display_name,
  crs.appointments_total,
  crs.appointments_completed,
  crs.appointments_cancelled,
  crs.completion_rate,
  crs.revenue_realized,
  crs.revenue_lost,
  crs.baseline_rate,
  crs.rate_change,
  crs.snapshot_date
FROM completion_rate_snapshots crs
JOIN latest_snapshot ls ON crs.snapshot_date = ls.max_date;


-- =============================================================================
-- HELPER VIEW: Open Anomalies for Weekly Review
-- =============================================================================
CREATE OR REPLACE VIEW v_open_anomalies AS
SELECT
  cra.*,
  -- Calculate days since detected
  EXTRACT(DAY FROM NOW() - cra.detected_at) as days_open
FROM completion_rate_anomalies cra
WHERE cra.status IN ('open', 'acknowledged')
ORDER BY
  CASE cra.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    ELSE 4
  END,
  cra.revenue_impact DESC NULLS LAST,
  cra.detected_at DESC;
