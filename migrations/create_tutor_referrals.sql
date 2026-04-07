-- Tutor Referral Tracking Tables
-- Idempotent: safe to run on all 5 databases (main, staging, westside, eastside, local)

-- Enable pg_trgm for fuzzy name matching (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS tutor_referrals (
    id SERIAL PRIMARY KEY,
    contractor_id INTEGER NOT NULL,
    referred_name VARCHAR(255) NOT NULL,
    referred_email VARCHAR(255),
    referred_phone VARCHAR(100),
    referral_type VARCHAR(50) NOT NULL DEFAULT 'friend_neighbor',
    referring_client_id VARCHAR(50),
    referring_client_name VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    matched_client_id VARCHAR(50),
    matched_client_name VARCHAR(255),
    points_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
    points_threshold NUMERIC(10,2) NOT NULL DEFAULT 300,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    reviewed_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_referral_status CHECK (status IN ('submitted', 'pending_review', 'tracking', 'converted', 'rejected')),
    CONSTRAINT chk_referral_type CHECK (referral_type IN ('friend_neighbor', 'sibling', 'school_lead', 'auction', 'other')),
    CONSTRAINT chk_contact_info CHECK (referred_email IS NOT NULL OR referred_phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_referrals_contractor ON tutor_referrals(contractor_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON tutor_referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_matched_client ON tutor_referrals(matched_client_id);
CREATE INDEX IF NOT EXISTS idx_referrals_email ON tutor_referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referrals_phone ON tutor_referrals(referred_phone);

-- Trigram index for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_referrals_name_trgm ON tutor_referrals USING gin(referred_name gin_trgm_ops);

-- Referral points threshold setting
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'referral_points_threshold',
    '300',
    'Revenue points ($1 = 1 point) required for a referral to count as converted toward tutor pay tier escalation'
)
ON CONFLICT (setting_key) DO NOTHING;
