-- School Activity: unified CRM activity table for school-level interactions
-- This becomes the single source of truth for all CRM interactions (calls, emails, notes)

CREATE TABLE IF NOT EXISTS school_activity (
    id SERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,                -- school's paying_client_id
    activity_type VARCHAR(50) NOT NULL,     -- 'call', 'email', 'note', 'task', 'meeting'
    subject VARCHAR(255),                   -- optional subject line
    description TEXT NOT NULL,              -- main content
    contact_person VARCHAR(255),            -- who was contacted
    outcome VARCHAR(100),                   -- call/meeting outcome: 'connected', 'voicemail', 'no_answer', 'callback_requested', 'resolved'
    follow_up_date DATE,                    -- follow-up reminder
    follow_up_completed BOOLEAN DEFAULT FALSE,
    invoice_id BIGINT,                      -- optional link to specific invoice (for dual-write from invoice fulfillment)
    source VARCHAR(50) DEFAULT 'school_crm', -- 'school_crm', 'invoice_fulfillment', 'billing_tab'
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_school_activity_client ON school_activity(client_id);
CREATE INDEX IF NOT EXISTS idx_school_activity_type ON school_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_school_activity_follow_up ON school_activity(follow_up_date) WHERE follow_up_date IS NOT NULL AND follow_up_completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_school_activity_invoice ON school_activity(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_activity_created ON school_activity(created_at DESC);

-- Backfill: Copy existing invoice_activity_log entries into school_activity
INSERT INTO school_activity (client_id, activity_type, description, contact_person, outcome, follow_up_date, invoice_id, source, created_by, created_at)
SELECT
    COALESCE(ial.client_id::text, i.client_id::text),
    ial.activity_type,
    ial.description,
    ial.contact_person,
    ial.outcome,
    ial.follow_up_date,
    ial.invoice_id,
    'invoice_fulfillment',
    ial.created_by,
    ial.created_at
FROM invoice_activity_log ial
LEFT JOIN invoices i ON i.id = ial.invoice_id
WHERE COALESCE(ial.client_id::text, i.client_id::text) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: Copy existing invoice_notes into school_activity as type='note'
INSERT INTO school_activity (client_id, activity_type, description, invoice_id, source, created_by, created_at)
SELECT
    COALESCE(n.client_id::text, i.client_id::text),
    'note',
    n.note,
    n.invoice_id,
    'invoice_fulfillment',
    n.created_by,
    n.created_at
FROM invoice_notes n
LEFT JOIN invoices i ON i.id = n.invoice_id
WHERE COALESCE(n.client_id::text, i.client_id::text) IS NOT NULL
ON CONFLICT DO NOTHING;
