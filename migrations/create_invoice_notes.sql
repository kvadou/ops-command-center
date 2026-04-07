-- Invoice Notes and Activity Log Tables Migration
-- Stores notes and activity tracking for invoice collection

-- Invoice Notes Table
CREATE TABLE IF NOT EXISTS invoice_notes (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    client_id BIGINT,
    note TEXT NOT NULL,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_notes_invoice_id ON invoice_notes(invoice_id);

-- Invoice Activity Log Table
CREATE TABLE IF NOT EXISTS invoice_activity_log (
    id SERIAL PRIMARY KEY,
    invoice_id BIGINT NOT NULL,
    client_id BIGINT,
    activity_type VARCHAR(50) NOT NULL, -- 'reminder_sent', 'phone_call', 'email_sent', 'custom'
    description TEXT NOT NULL,
    notes TEXT,
    source VARCHAR(50) DEFAULT 'manual', -- 'tc_webhook', 'manual'
    contact_method VARCHAR(50), -- 'phone', 'email', 'in_person'
    contact_person VARCHAR(255),
    outcome VARCHAR(100), -- 'left_voicemail', 'spoke_with_contact', 'payment_promised'
    follow_up_date DATE,
    created_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_activity_invoice_id ON invoice_activity_log(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_activity_follow_up ON invoice_activity_log(follow_up_date) WHERE follow_up_date IS NOT NULL;

-- Apply trigger for updated_at on invoice_notes
DROP TRIGGER IF EXISTS update_invoice_notes_updated_at ON invoice_notes;
CREATE TRIGGER update_invoice_notes_updated_at
    BEFORE UPDATE ON invoice_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE invoice_notes IS 'Stores freeform notes about invoice collection efforts';
COMMENT ON TABLE invoice_activity_log IS 'Logs discrete collection activities like calls, emails, and reminders';
COMMENT ON COLUMN invoice_activity_log.source IS 'manual = logged by admin, tc_webhook = from TutorCruncher webhook';
