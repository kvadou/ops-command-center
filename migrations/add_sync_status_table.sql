-- Migration: Add sync_status table for incremental sync tracking
-- This table tracks the last sync time for each sync type to enable incremental syncing

CREATE TABLE IF NOT EXISTS sync_status (
    sync_type VARCHAR(50) PRIMARY KEY,
    last_sync TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert initial sync status records
INSERT INTO sync_status (sync_type, last_sync) VALUES 
    ('services', NOW() - INTERVAL '1 day'),
    ('appointments', NOW() - INTERVAL '1 day'),
    ('invoices', NOW() - INTERVAL '1 day'),
    ('payment_orders', NOW() - INTERVAL '1 day')
ON CONFLICT (sync_type) DO NOTHING;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_sync_status_sync_type ON sync_status(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_status_last_sync ON sync_status(last_sync);

-- Add comments for documentation
COMMENT ON TABLE sync_status IS 'Tracks the last sync time for each TutorCruncher sync type to enable incremental syncing';
COMMENT ON COLUMN sync_status.sync_type IS 'Type of sync (services, appointments, invoices, payment_orders)';
COMMENT ON COLUMN sync_status.last_sync IS 'Timestamp of the last successful sync for this type';
