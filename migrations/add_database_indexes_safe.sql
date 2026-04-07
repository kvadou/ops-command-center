-- Database Indexes for Performance Optimization (Safe Version)
-- This version checks for column/table existence before creating indexes
-- Run this migration to add indexes for commonly queried columns

-- Helper function to check if column exists (will be used in script)
-- Client conversion tracking indexes (only if columns exist)
DO $$
BEGIN
  -- Check if clients table exists and has status column
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'pipeline_stage_id') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_pipeline_stage_id ON clients(pipeline_stage_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at DESC);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'market') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_market ON clients(market);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'lead_type') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_lead_type ON clients(lead_type);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'client_id') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_client_id ON clients(client_id);
    END IF;
    
    -- Composite index if both columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'status') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_clients_status_created_at ON clients(status, created_at DESC);
    END IF;
  END IF;
END $$;

-- Pipeline stages indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_stages') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_stages' AND column_name = 'active') THEN
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_active ON pipeline_stages(active);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_stages' AND column_name = 'pipeline') THEN
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_stages' AND column_name = 'pipeline') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pipeline_stages' AND column_name = 'order_index') THEN
      CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline, order_index);
    END IF;
  END IF;
END $$;

-- Client notes indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_notes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_notes' AND column_name = 'client_id') THEN
      CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'client_notes' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes(created_at DESC);
    END IF;
  END IF;
END $$;

-- Appointments indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'appointments') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'service_id') THEN
      CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON appointments(service_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'start') THEN
      CREATE INDEX IF NOT EXISTS idx_appointments_start ON appointments(start);
    END IF;
    
    -- Composite index with WHERE clause
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'start') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_appointments_start_status ON appointments(start, status) 
        WHERE status IN ('complete', 'cancelled-chargeable');
    END IF;
    
    -- Another composite index
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'service_id') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'status') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'start') THEN
      CREATE INDEX IF NOT EXISTS idx_appointments_service_status_start ON appointments(service_id, status, start) 
        WHERE status IN ('complete', 'cancelled-chargeable');
    END IF;
  END IF;
END $$;

-- Services indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'services') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'service_id') THEN
      CREATE INDEX IF NOT EXISTS idx_services_service_id ON services(service_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'labels') THEN
      -- Check if GIN index extension is available
      BEGIN
        CREATE INDEX IF NOT EXISTS idx_services_labels ON services USING GIN (labels);
      EXCEPTION WHEN OTHERS THEN
        -- If GIN not available, create regular index
        CREATE INDEX IF NOT EXISTS idx_services_labels_btree ON services(labels);
      END;
    END IF;
  END IF;
END $$;

-- Booking submissions indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'booking_submissions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_submissions' AND column_name = 'tc_client_id') THEN
      CREATE INDEX IF NOT EXISTS idx_booking_submissions_tc_client_id ON booking_submissions(tc_client_id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_submissions' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_booking_submissions_status ON booking_submissions(status);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'booking_submissions' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_booking_submissions_created_at ON booking_submissions(created_at DESC);
    END IF;
  END IF;
END $$;

-- Job templates indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_templates') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'environment') THEN
      CREATE INDEX IF NOT EXISTS idx_job_templates_environment ON job_templates(environment);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'category') THEN
      CREATE INDEX IF NOT EXISTS idx_job_templates_category ON job_templates(category);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'is_active') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'is_archived') THEN
      CREATE INDEX IF NOT EXISTS idx_job_templates_active ON job_templates(is_active, is_archived);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'name') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_templates' AND column_name = 'environment') THEN
      CREATE INDEX IF NOT EXISTS idx_job_templates_name_env ON job_templates(name, environment);
    END IF;
  END IF;
END $$;

-- Brick configurations indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'brick_configurations') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'brick_configurations' AND column_name = 'template_id') THEN
      CREATE INDEX IF NOT EXISTS idx_brick_configurations_template_id ON brick_configurations(template_id);
    END IF;
  END IF;
END $$;

-- Analytics settings indexes (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_settings') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analytics_settings' AND column_name = 'id') THEN
      CREATE INDEX IF NOT EXISTS idx_analytics_settings_id ON analytics_settings(id);
    END IF;
  END IF;
END $$;
