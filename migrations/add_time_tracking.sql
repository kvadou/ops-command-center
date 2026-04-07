-- Time Tracking Migration
-- Adds support for time tracking on tasks

-- Time entries table
CREATE TABLE IF NOT EXISTS task_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- User ID or email
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_seconds INTEGER, -- Duration in seconds (calculated or manual)
  notes TEXT,
  is_billable BOOLEAN DEFAULT TRUE,
  hourly_rate NUMERIC(10, 2), -- Optional hourly rate for billing
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Time estimates table (optional estimates for tasks)
CREATE TABLE IF NOT EXISTS task_time_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  estimated_hours NUMERIC(10, 2) NOT NULL,
  estimated_by VARCHAR(255) NOT NULL, -- User ID or email
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_id) -- One estimate per task
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_time_entries_item ON task_time_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_user ON task_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_date ON task_time_entries(start_time) WHERE start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_time_entries_deleted ON task_time_entries(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_time_estimates_item ON task_time_estimates(item_id);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_task_time_entries_updated_at
  BEFORE UPDATE ON task_time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

CREATE TRIGGER update_task_time_estimates_updated_at
  BEFORE UPDATE ON task_time_estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

-- Function to calculate duration if start_time and end_time are provided
CREATE OR REPLACE FUNCTION calculate_time_entry_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_task_time_entry_duration
  BEFORE INSERT OR UPDATE ON task_time_entries
  FOR EACH ROW
  WHEN (NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL)
  EXECUTE FUNCTION calculate_time_entry_duration();

-- Comments for documentation
COMMENT ON TABLE task_time_entries IS 'Time tracking entries for tasks';
COMMENT ON TABLE task_time_estimates IS 'Time estimates for tasks';
COMMENT ON COLUMN task_time_entries.duration_seconds IS 'Duration in seconds (auto-calculated from start_time and end_time if both provided)';
COMMENT ON COLUMN task_time_entries.is_billable IS 'Whether this time entry is billable to clients';
