-- Migration: Create company_metrics table
-- Stores verified lifetime metrics across MindBody, E4, and TutorCruncher eras
-- Used by Intel Hub live counter and historical analytics

CREATE TABLE IF NOT EXISTS company_metrics (
  id SERIAL PRIMARY KEY,
  metric_key VARCHAR(100) UNIQUE NOT NULL,
  metric_value DECIMAL(12, 2) NOT NULL,
  description TEXT,
  source_breakdown JSONB,
  base_date DATE,
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by VARCHAR(255),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_metrics_key ON company_metrics(metric_key);

COMMENT ON TABLE company_metrics IS 'Verified lifetime company metrics across MindBody (2016-2023), E4 (2023-2024), and TutorCruncher (2024-present) eras';
COMMENT ON COLUMN company_metrics.metric_value IS 'Base value from historical data (MB + E4). TC delta computed live at query time.';
COMMENT ON COLUMN company_metrics.base_date IS 'Date the base value was seeded. TC counts after this date are added live.';
COMMENT ON COLUMN company_metrics.source_breakdown IS 'JSON breakdown by era: { mindbody: N, e4: N, tutorcruncher: N }';
