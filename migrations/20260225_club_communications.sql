-- Migration: Club communications tracking tables
-- Date: 2026-02-25
-- Idempotent: Safe to run multiple times

-- Track all automated club communications for deduplication and auditing
CREATE TABLE IF NOT EXISTS club_communications_log (
  id SERIAL PRIMARY KEY,
  club_id INTEGER REFERENCES clubs(id),
  recipient_id INTEGER,                    -- student recipient_id
  client_id VARCHAR(50),                   -- parent client_id
  email VARCHAR(255) NOT NULL,
  communication_type VARCHAR(50) NOT NULL CHECK (communication_type IN (
    'class_reminder',
    'missed_class_followup',
    'trial_followup_1',
    'trial_followup_2',
    'trial_followup_3',
    'pack_depletion',
    'attendance_streak',
    'win_back',
    'custom'
  )),
  reference_id VARCHAR(100),               -- appointment_id or other reference for dedup
  subject TEXT,
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_comms_type_ref ON club_communications_log(communication_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_club_comms_recipient ON club_communications_log(recipient_id, communication_type);
CREATE INDEX IF NOT EXISTS idx_club_comms_created ON club_communications_log(created_at);
CREATE INDEX IF NOT EXISTS idx_club_comms_client ON club_communications_log(client_id, communication_type);

-- Club automation settings per club
CREATE TABLE IF NOT EXISTS club_automation_settings (
  id SERIAL PRIMARY KEY,
  club_id INTEGER NOT NULL REFERENCES clubs(id) UNIQUE,
  class_reminders_enabled BOOLEAN DEFAULT false,
  reminder_hours_before INTEGER DEFAULT 24,
  missed_class_followup_enabled BOOLEAN DEFAULT false,
  trial_followup_enabled BOOLEAN DEFAULT false,
  pack_depletion_enabled BOOLEAN DEFAULT false,
  pack_depletion_threshold INTEGER DEFAULT 2,  -- alert when X sessions remain
  win_back_enabled BOOLEAN DEFAULT false,
  win_back_days_inactive INTEGER DEFAULT 60,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default settings for Park Slope
INSERT INTO club_automation_settings (club_id)
SELECT id FROM clubs WHERE slug = 'park-slope'
ON CONFLICT (club_id) DO NOTHING;
