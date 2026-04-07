-- Failed Checkout Tracking
-- Tracks appointments where tutors haven't checked out and email escalation history.
-- Run on ALL databases: main, staging, westside, eastside, local.

-- 1) Tracking table for failed checkout events and email escalations
CREATE TABLE IF NOT EXISTS failed_checkout_log (
  id SERIAL PRIMARY KEY,
  appointment_id INTEGER NOT NULL,
  contractor_id INTEGER NOT NULL,
  service_id INTEGER,
  lesson_date TIMESTAMP WITH TIME ZONE NOT NULL,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  hours_late NUMERIC(10,2),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_hours NUMERIC(10,2),
  soft_email_sent_at TIMESTAMP WITH TIME ZONE,
  hard_email_sent_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  UNIQUE(appointment_id, contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_fcl_contractor ON failed_checkout_log(contractor_id);
CREATE INDEX IF NOT EXISTS idx_fcl_status ON failed_checkout_log(status);
CREATE INDEX IF NOT EXISTS idx_fcl_lesson_date ON failed_checkout_log(lesson_date);

-- 2) App settings config for thresholds and email templates
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
  'failed_checkout_config',
  '{
    "enabled": true,
    "detection_hours": 24,
    "escalation_recipients": ["bri@acmeops.com"],
    "soft_email_subject": "Urgent Reminder: Update Your Schedule in TutorCruncher",
    "hard_email_subject": "Immediate Action Required – Unresolved Lessons in TutorCruncher"
  }'::jsonb,
  'Configuration for failed checkout detection and automated tutor reminder emails'
)
ON CONFLICT (setting_key) DO NOTHING;
