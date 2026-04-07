-- Failed Payment Cases: tracks clients with unpaid invoices requiring AR follow-up
-- AR Activity: outreach/contact log per case (calls, emails, notes, auto-events)

-- ============================================================================
-- Table: failed_payment_cases
-- ============================================================================
CREATE TABLE IF NOT EXISTS failed_payment_cases (
    id SERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,                         -- joins to clients.client_id (VARCHAR)
    client_name TEXT,
    client_email TEXT,
    status VARCHAR(20) DEFAULT 'open',               -- 'open' or 'resolved'
    issue_type VARCHAR(50),                           -- 'no_card', 'insufficient_funds', 'card_declined', 'card_inactive', 'pays_ach', 'other'
    card_on_file BOOLEAN,
    assignee VARCHAR(255),                            -- e.g. "Stephanie"
    total_outstanding NUMERIC(12,2),
    invoice_count INTEGER,
    oldest_invoice_date DATE,
    tutor_name TEXT,
    tc_link TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255),
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Only one open case per client at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_failed_payment_cases_client_open
    ON failed_payment_cases(client_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_failed_payment_cases_status
    ON failed_payment_cases(status);

CREATE INDEX IF NOT EXISTS idx_failed_payment_cases_assignee
    ON failed_payment_cases(assignee) WHERE assignee IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_payment_cases_created
    ON failed_payment_cases(created_at DESC);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_failed_payment_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_failed_payment_cases_updated_at ON failed_payment_cases;
CREATE TRIGGER trg_failed_payment_cases_updated_at
    BEFORE UPDATE ON failed_payment_cases
    FOR EACH ROW
    EXECUTE FUNCTION update_failed_payment_cases_updated_at();

-- ============================================================================
-- Table: ar_activity
-- ============================================================================
CREATE TABLE IF NOT EXISTS ar_activity (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES failed_payment_cases(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    activity_type VARCHAR(50) NOT NULL,               -- 'call', 'email', 'note', 'status_change', 'auto_detected', 'auto_resolved'
    description TEXT NOT NULL,
    contact_person VARCHAR(255),
    outcome VARCHAR(100),
    follow_up_date DATE,
    follow_up_completed BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_activity_case
    ON ar_activity(case_id);

CREATE INDEX IF NOT EXISTS idx_ar_activity_follow_up
    ON ar_activity(follow_up_date) WHERE follow_up_date IS NOT NULL AND follow_up_completed = FALSE;

CREATE INDEX IF NOT EXISTS idx_ar_activity_created
    ON ar_activity(created_at DESC);
