-- Database Indexes for Performance Optimization
-- Run this migration to add indexes for commonly queried columns

-- Client conversion tracking indexes
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_pipeline_stage_id ON clients(pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_market ON clients(market);
CREATE INDEX IF NOT EXISTS idx_clients_lead_type ON clients(lead_type);
CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);

-- Pipeline stages indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_active ON pipeline_stages(active);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON pipeline_stages(pipeline, order_index);

-- Client notes indexes
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes(created_at DESC);

-- Appointments indexes
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start);
CREATE INDEX IF NOT EXISTS idx_appointments_start_status ON appointments(start, status) WHERE status IN ('complete', 'cancelled-chargeable');

-- Services indexes
CREATE INDEX IF NOT EXISTS idx_services_service_id ON services(service_id);
CREATE INDEX IF NOT EXISTS idx_services_labels ON services USING GIN (labels);

-- Booking submissions indexes
CREATE INDEX IF NOT EXISTS idx_booking_submissions_tc_client_id ON booking_submissions(tc_client_id);
CREATE INDEX IF NOT EXISTS idx_booking_submissions_status ON booking_submissions(status);
CREATE INDEX IF NOT EXISTS idx_booking_submissions_created_at ON booking_submissions(created_at DESC);

-- Job templates indexes
CREATE INDEX IF NOT EXISTS idx_job_templates_environment ON job_templates(environment);
CREATE INDEX IF NOT EXISTS idx_job_templates_category ON job_templates(category);
CREATE INDEX IF NOT EXISTS idx_job_templates_active ON job_templates(is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_job_templates_name_env ON job_templates(name, environment);

-- Brick configurations indexes
CREATE INDEX IF NOT EXISTS idx_brick_configurations_template_id ON brick_configurations(template_id);

-- Analytics settings indexes
CREATE INDEX IF NOT EXISTS idx_analytics_settings_id ON analytics_settings(id);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_clients_status_created_at ON clients(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appointments_service_status_start ON appointments(service_id, status, start) 
  WHERE status IN ('complete', 'cancelled-chargeable');

-- Comments on indexes
COMMENT ON INDEX idx_clients_status IS 'Index for filtering clients by status';
COMMENT ON INDEX idx_clients_pipeline_stage_id IS 'Index for joining with pipeline_stages';
COMMENT ON INDEX idx_appointments_start_status IS 'Index for date range queries with status filter';
