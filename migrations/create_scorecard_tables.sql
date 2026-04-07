-- EOS Scorecard Tables
-- Creates scorecard_metrics (config) and scorecard_snapshots (weekly data) tables
-- Idempotent: safe to run on all 5 databases (main, staging, westside, eastside, local)

CREATE TABLE IF NOT EXISTS scorecard_metrics (
    id SERIAL PRIMARY KEY,
    metric_key VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    owner VARCHAR(200) NOT NULL,
    category VARCHAR(100),
    goal_value NUMERIC(14,2),
    goal_direction VARCHAR(10) DEFAULT 'above',
    data_source VARCHAR(20) DEFAULT 'auto',
    computation_key VARCHAR(100),
    display_format VARCHAR(20) DEFAULT 'number',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scorecard_snapshots (
    id SERIAL PRIMARY KEY,
    metric_key VARCHAR(100) NOT NULL REFERENCES scorecard_metrics(metric_key),
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    actual_value NUMERIC(14,2),
    goal_value NUMERIC(14,2),
    is_on_track BOOLEAN,
    source VARCHAR(20) DEFAULT 'auto',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(metric_key, week_start)
);

CREATE INDEX IF NOT EXISTS idx_scorecard_snapshots_week
    ON scorecard_snapshots(week_start DESC);

CREATE INDEX IF NOT EXISTS idx_scorecard_snapshots_metric
    ON scorecard_snapshots(metric_key, week_start DESC);
