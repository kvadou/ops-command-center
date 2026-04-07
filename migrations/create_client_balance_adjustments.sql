-- Credit & Balance Adjustment Tracking
-- Captures TC balance adjustments (bonus credits, balance corrections)
-- with admin categorization for visibility into credits given

CREATE TABLE IF NOT EXISTS client_balance_adjustments (
    id SERIAL PRIMARY KEY,
    client_id BIGINT NOT NULL,
    client_first_name TEXT,
    client_last_name TEXT,
    amount NUMERIC(12, 2) NOT NULL,
    tc_type TEXT NOT NULL,              -- 'bonus_credit' or 'balance_correction' (from TC extra_msg)
    category TEXT DEFAULT 'uncategorized', -- 'error', 'trial', 'bundle', 'goodwill', 'uncategorized'
    description TEXT,                    -- from TC extra_msg
    actor_name TEXT,                     -- who did it in TC (from event.actor.name)
    actor_id BIGINT,                     -- TC actor ID
    categorized_by TEXT,                 -- OpsHub user who tagged it
    categorized_at TIMESTAMPTZ,
    notes TEXT,                          -- admin notes when categorizing
    tc_webhook_timestamp TIMESTAMPTZ,    -- event.timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cba_client_id ON client_balance_adjustments(client_id);
CREATE INDEX IF NOT EXISTS idx_cba_category ON client_balance_adjustments(category);
CREATE INDEX IF NOT EXISTS idx_cba_created_at ON client_balance_adjustments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cba_tc_type ON client_balance_adjustments(tc_type);
