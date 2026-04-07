-- Add quarter_offset and year_offset columns to report_snapshots
-- Supports quarterly and annually report types in Executive Reports

ALTER TABLE report_snapshots
  ADD COLUMN IF NOT EXISTS quarter_offset INT,
  ADD COLUMN IF NOT EXISTS year_offset INT;

-- Update report_type comment to reflect all supported types
COMMENT ON COLUMN report_snapshots.report_type IS 'weekly, monthly, quarterly, or annually';

-- Index for fast lookups by quarter offset
CREATE INDEX IF NOT EXISTS idx_report_snapshots_quarter_offset
  ON report_snapshots(report_type, quarter_offset) WHERE quarter_offset IS NOT NULL;

-- Index for fast lookups by year offset
CREATE INDEX IF NOT EXISTS idx_report_snapshots_year_offset
  ON report_snapshots(report_type, year_offset) WHERE year_offset IS NOT NULL;
