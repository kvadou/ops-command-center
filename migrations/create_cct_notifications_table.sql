-- CCT Notifications System Migration
-- Creates tables for CCT-specific notifications (team-wide alerts for automated Won/Lost)
-- Run this migration on all environments: local, staging, production, westside, eastside

-- ============================================
-- PHASE 1: Create cct_notifications table
-- ============================================

CREATE TABLE IF NOT EXISTS cct_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Notification content
    type VARCHAR(50) NOT NULL, -- 'auto_won', 'auto_lost_14_day', 'auto_lost_30_day_building', 'auto_lost_30_day_trial', 'manual_won', 'manual_lost', 'restored'
    title VARCHAR(255) NOT NULL,
    body TEXT,

    -- Related client
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    client_name VARCHAR(255),
    client_email VARCHAR(255),

    -- Automation context
    automation_trigger VARCHAR(100), -- '14_day_timeout', '30_day_building_timeout', '30_day_trial_timeout', 'first_paid_lesson', 'manual'
    previous_pipeline_stage_id INTEGER REFERENCES pipeline_stages(id),
    previous_prospect_status VARCHAR(50),

    -- Team-wide read state (not per-user, shared across all CCT users)
    read_at TIMESTAMP,
    read_by VARCHAR(255), -- Email of first user who read it

    -- Restoration tracking
    restored_at TIMESTAMP,
    restored_by VARCHAR(255), -- Email of user who restored

    -- Additional metadata
    data JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_cct_notifications_type ON cct_notifications(type);
CREATE INDEX IF NOT EXISTS idx_cct_notifications_unread ON cct_notifications(read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cct_notifications_client ON cct_notifications(client_id);
CREATE INDEX IF NOT EXISTS idx_cct_notifications_created ON cct_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cct_notifications_not_restored ON cct_notifications(restored_at) WHERE restored_at IS NULL;

-- ============================================
-- PHASE 2: Add columns to clients table for restore functionality
-- ============================================

-- Store previous pipeline stage before moving to Won/Lost (for restore)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS previous_pipeline_stage_id INTEGER REFERENCES pipeline_stages(id);

-- Store previous prospect status before moving to Won/Lost (for restore)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS previous_prospect_status VARCHAR(50);

-- Track last automation check to prevent duplicate processing
ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_automation_check_at TIMESTAMP;

-- Index for automation efficiency
CREATE INDEX IF NOT EXISTS idx_clients_last_automation_check ON clients(last_automation_check_at);

-- ============================================
-- PHASE 3: Link notifications to conversion events (optional - only if table exists)
-- ============================================

DO $$
BEGIN
    IF EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'client_conversion_events'
    ) THEN
        ALTER TABLE client_conversion_events ADD COLUMN IF NOT EXISTS cct_notification_id UUID REFERENCES cct_notifications(id);
    END IF;
END $$;

-- ============================================
-- Helper function to get unread CCT notification count
-- ============================================

CREATE OR REPLACE FUNCTION get_unread_cct_notification_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM cct_notifications
        WHERE read_at IS NULL
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unread_cct_notification_count IS 'Returns count of unread CCT notifications (team-wide)';

-- ============================================
-- Documentation
-- ============================================

COMMENT ON TABLE cct_notifications IS 'Team-wide notifications for CCT automated Won/Lost actions';
COMMENT ON COLUMN cct_notifications.type IS 'Notification type: auto_won, auto_lost_14_day, auto_lost_30_day_building, auto_lost_30_day_trial, manual_won, manual_lost, restored';
COMMENT ON COLUMN cct_notifications.automation_trigger IS 'What triggered the automation: 14_day_timeout, 30_day_building_timeout, 30_day_trial_timeout, first_paid_lesson, manual';
COMMENT ON COLUMN cct_notifications.previous_pipeline_stage_id IS 'Pipeline stage before automation moved client to Won/Lost (for restore)';
COMMENT ON COLUMN cct_notifications.previous_prospect_status IS 'Prospect status before automation moved client to Won/Lost (for restore)';
COMMENT ON COLUMN cct_notifications.read_at IS 'Team-wide read timestamp (not per-user)';
COMMENT ON COLUMN cct_notifications.restored_at IS 'Timestamp when client was restored from Won/Lost';

COMMENT ON COLUMN clients.previous_pipeline_stage_id IS 'Stores pipeline stage before moving to Won/Lost for restore functionality';
COMMENT ON COLUMN clients.previous_prospect_status IS 'Stores prospect status before moving to Won/Lost for restore functionality';
COMMENT ON COLUMN clients.last_automation_check_at IS 'Tracks when this client was last checked by automation to prevent duplicates';
