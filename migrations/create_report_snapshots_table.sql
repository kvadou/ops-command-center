-- Create report_snapshots table for pre-computed Executive Reports
-- This enables sub-100ms load times by serving cached daily snapshots

CREATE TABLE IF NOT EXISTS report_snapshots (
  id SERIAL PRIMARY KEY,
  report_type VARCHAR(20) NOT NULL,        -- 'weekly' or 'monthly'
  period_key VARCHAR(20) NOT NULL,          -- '2026-W05' or '2026-01'
  week_offset INT,                          -- 0 = current, 1 = last week, etc. (for weekly)
  month_offset INT,                         -- 0 = current, 1 = last month, etc. (for monthly)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  data JSONB NOT NULL,                      -- Full report payload (includes YoY)
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  computation_time_ms INT,                  -- Track performance for monitoring
  UNIQUE(report_type, period_key)
);

-- Index for fast lookups by report type and period
CREATE INDEX IF NOT EXISTS idx_report_snapshots_lookup
  ON report_snapshots(report_type, period_key);

-- Index for finding snapshots by offset (used when serving requests)
CREATE INDEX IF NOT EXISTS idx_report_snapshots_offset
  ON report_snapshots(report_type, week_offset) WHERE week_offset IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_report_snapshots_month_offset
  ON report_snapshots(report_type, month_offset) WHERE month_offset IS NOT NULL;

COMMENT ON TABLE report_snapshots IS 'Pre-computed Executive Reports data, refreshed daily at midnight';
COMMENT ON COLUMN report_snapshots.period_key IS 'ISO week (2026-W05) or month (2026-01) identifier';
COMMENT ON COLUMN report_snapshots.data IS 'Full generateMultiPeriodAnalytics response including YoY data';
