-- Add client conversion tracker tables and columns

BEGIN;

-- Add status and pipeline_stage_id columns to clients table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'status'
  ) THEN
    ALTER TABLE clients ADD COLUMN status VARCHAR(50) DEFAULT 'prospect';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'clients' AND column_name = 'pipeline_stage_id'
  ) THEN
    ALTER TABLE clients ADD COLUMN pipeline_stage_id INTEGER;
  END IF;
END $$;

-- Add foreign key constraint for pipeline_stage_id if pipeline_stages table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'pipeline_stages'
  ) THEN
    ALTER TABLE clients ADD CONSTRAINT fk_clients_pipeline_stage 
      FOREIGN KEY (pipeline_stage_id) REFERENCES pipeline_stages(id);
  END IF;
END $$;

-- Create client_notes table for CRM functionality
CREATE TABLE IF NOT EXISTS client_notes (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create client_conversion_events table to track stage changes
CREATE TABLE IF NOT EXISTS client_conversion_events (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    from_stage_id INTEGER REFERENCES pipeline_stages(id),
    to_stage_id INTEGER NOT NULL REFERENCES pipeline_stages(id),
    from_status VARCHAR(50),
    to_status VARCHAR(50) NOT NULL,
    changed_by VARCHAR(255) NOT NULL,
    change_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_clients_pipeline_stage ON clients(pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_created_at ON client_notes(created_at);
CREATE INDEX IF NOT EXISTS idx_conversion_events_client_id ON client_conversion_events(client_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_created_at ON client_conversion_events(created_at);

COMMIT;
