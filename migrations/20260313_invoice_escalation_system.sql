-- Migration: Invoice escalation system
-- Adds config to app_settings + tracking table for sent escalations

-- 1) Seed default escalation config
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
  'invoice_escalation_config',
  '{
    "enabled": true,
    "recipients": ["partnerships@acmeops.com"],
    "thresholds": [
      {
        "days": 30,
        "label": "30-Day Notice",
        "enabled": true,
        "subject": "Invoice {{display_id}} for {{school_name}} is 30 days overdue ({{amount}})",
        "body": "This is an automated notice that invoice #{{display_id}} for <strong>{{school_name}}</strong> in the amount of <strong>{{amount}}</strong> is now <strong>{{days_overdue}} days</strong> past the payment terms date of {{date_sent}}."
      },
      {
        "days": 45,
        "label": "45-Day Warning",
        "enabled": true,
        "subject": "⚠️ Invoice {{display_id}} for {{school_name}} is 45 days overdue ({{amount}})",
        "body": "This is an escalated warning that invoice #{{display_id}} for <strong>{{school_name}}</strong> in the amount of <strong>{{amount}}</strong> is now <strong>{{days_overdue}} days</strong> past the payment terms date of {{date_sent}}. Please prioritize follow-up."
      },
      {
        "days": 60,
        "label": "60-Day Final Notice",
        "enabled": true,
        "subject": "🚨 FINAL: Invoice {{display_id}} for {{school_name}} is 60+ days overdue ({{amount}})",
        "body": "Invoice #{{display_id}} for <strong>{{school_name}}</strong> in the amount of <strong>{{amount}}</strong> is now <strong>{{days_overdue}} days</strong> past the payment terms date of {{date_sent}}. This invoice is now 90+ days from send date. Direct phone outreach to the school is required."
      }
    ],
    "digestEnabled": true,
    "digestRecipients": ["partnerships@acmeops.com"]
  }'::jsonb,
  'Configuration for automated invoice escalation emails and daily digest. Managed from Settings > Invoice Collections.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 2) Tracking table — prevents duplicate escalation emails
CREATE TABLE IF NOT EXISTS invoice_escalation_log (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  threshold_days INTEGER NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  recipients TEXT[] NOT NULL,
  UNIQUE(invoice_id, threshold_days)
);

CREATE INDEX IF NOT EXISTS idx_invoice_escalation_log_invoice
  ON invoice_escalation_log(invoice_id);
