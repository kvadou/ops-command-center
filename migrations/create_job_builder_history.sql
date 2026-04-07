-- Job Builder History table for audit trail and anomaly detection
-- Stores summary + full payloads for every job created via Job Builder

CREATE TABLE IF NOT EXISTS job_builder_history (
  id SERIAL PRIMARY KEY,
  -- Summary columns (quick browsing)
  template_id INTEGER NOT NULL,
  template_name VARCHAR(255),
  category VARCHAR(100),
  job_title VARCHAR(500),
  tc_service_id INTEGER,
  created_by VARCHAR(255),
  lesson_count INTEGER DEFAULT 0,
  appointment_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
  error_message TEXT,
  -- Drill-down columns
  request_payload JSONB,
  response_payload JSONB,
  lesson_dates JSONB,
  anomalies JSONB,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_builder_history_created_at ON job_builder_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_builder_history_tc_service_id ON job_builder_history(tc_service_id);
CREATE INDEX IF NOT EXISTS idx_job_builder_history_status ON job_builder_history(status);
CREATE INDEX IF NOT EXISTS idx_job_builder_history_category ON job_builder_history(category);
