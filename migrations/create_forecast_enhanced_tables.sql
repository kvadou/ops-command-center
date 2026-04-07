-- Migration: Enhanced Revenue Forecasting Tables
-- Adds pattern tracking, targets, seasonality, and stale jobs view
-- Run on ALL environments: main, staging, westside, eastside

-- =============================================================================
-- Table: job_lesson_patterns
-- Tracks lesson frequency patterns per job for forward projection
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_lesson_patterns (
    id SERIAL PRIMARY KEY,
    service_id INTEGER NOT NULL UNIQUE,
    avg_days_between_lessons NUMERIC(5, 2),
    typical_day_of_week INTEGER[],          -- Array of 0-6 (Sun-Sat)
    typical_hour INTEGER,                    -- 0-23
    last_lesson_date DATE,
    lesson_count_last_90_days INTEGER,
    completion_rate NUMERIC(5, 4),           -- completed / (completed + cancelled)
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_patterns_service ON job_lesson_patterns(service_id);
CREATE INDEX IF NOT EXISTS idx_job_patterns_last_lesson ON job_lesson_patterns(last_lesson_date);
CREATE INDEX IF NOT EXISTS idx_job_patterns_computed ON job_lesson_patterns(computed_at);

COMMENT ON TABLE job_lesson_patterns IS 'Stores lesson frequency patterns per job for forward projection';
COMMENT ON COLUMN job_lesson_patterns.avg_days_between_lessons IS 'Average days between consecutive lessons';
COMMENT ON COLUMN job_lesson_patterns.completion_rate IS 'Historical completion rate (0-1) for probability weighting';

-- =============================================================================
-- Table: forecast_targets
-- Admin-configurable targets for lessons and revenue
-- =============================================================================
CREATE TABLE IF NOT EXISTS forecast_targets (
    id SERIAL PRIMARY KEY,
    target_type VARCHAR(50) NOT NULL,       -- 'weekly_lessons', 'quarterly_revenue', 'monthly_revenue'
    channel VARCHAR(50),                     -- 'home', 'digital', 'schools', 'clubs', NULL for all
    market VARCHAR(100),                     -- 'NYC', 'LA', etc., NULL for all markets
    target_value NUMERIC(12, 2) NOT NULL,
    quarter INTEGER,                         -- 1-4 for quarterly targets, NULL otherwise
    year INTEGER NOT NULL,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,                       -- NULL means currently active
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(target_type, channel, market, quarter, year)
);

CREATE INDEX IF NOT EXISTS idx_forecast_targets_lookup ON forecast_targets(target_type, channel, market, year);
CREATE INDEX IF NOT EXISTS idx_forecast_targets_active ON forecast_targets(effective_from, effective_to);

COMMENT ON TABLE forecast_targets IS 'Admin-configurable targets for weekly lessons and quarterly revenue';
COMMENT ON COLUMN forecast_targets.target_type IS 'Type: weekly_lessons, quarterly_revenue, monthly_revenue';
COMMENT ON COLUMN forecast_targets.channel IS 'Channel filter: home, digital, schools, clubs, or NULL for all';

-- =============================================================================
-- Table: seasonality_factors
-- Pre-computed seasonality adjustments from historical data
-- =============================================================================
CREATE TABLE IF NOT EXISTS seasonality_factors (
    id SERIAL PRIMARY KEY,
    week_of_year INTEGER NOT NULL,          -- 1-52
    channel VARCHAR(50),                     -- NULL for all channels
    market VARCHAR(100),                     -- NULL for all markets
    factor NUMERIC(5, 4) NOT NULL,          -- Multiplier (e.g., 0.6 for 40% drop, 1.2 for 20% increase)
    sample_size INTEGER,                     -- Number of data points used
    base_year INTEGER NOT NULL,              -- Year this factor was computed from
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(week_of_year, channel, market, base_year)
);

CREATE INDEX IF NOT EXISTS idx_seasonality_lookup ON seasonality_factors(week_of_year, channel, market);
CREATE INDEX IF NOT EXISTS idx_seasonality_year ON seasonality_factors(base_year);

COMMENT ON TABLE seasonality_factors IS 'Historical seasonality adjustments by week, channel, and market';
COMMENT ON COLUMN seasonality_factors.factor IS 'Multiplier applied to projections (1.0 = average, 0.6 = 40% below average)';
COMMENT ON COLUMN seasonality_factors.base_year IS 'Year the historical data came from';

-- =============================================================================
-- Table: forecast_scenario_runs
-- Tracks forecast scenario calculations
-- =============================================================================
CREATE TABLE IF NOT EXISTS forecast_scenario_runs (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    horizon_start DATE NOT NULL,
    horizon_end DATE NOT NULL,
    scenario_type VARCHAR(20) NOT NULL,      -- 'optimistic' or 'realistic'
    completion_rate_used NUMERIC(5, 4),      -- NULL for optimistic (1.0 implied)
    channel_filter VARCHAR(50),              -- NULL for all
    market_filter VARCHAR(100),              -- NULL for all
    total_lessons INTEGER,
    total_revenue NUMERIC(12, 2),
    total_tutor_pay NUMERIC(12, 2),
    scheduled_lessons INTEGER,
    scheduled_revenue NUMERIC(12, 2),
    projected_lessons INTEGER,
    projected_revenue NUMERIC(12, 2),
    seasonality_applied BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_runs_date ON forecast_scenario_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_horizon ON forecast_scenario_runs(horizon_start, horizon_end);
CREATE INDEX IF NOT EXISTS idx_scenario_runs_type ON forecast_scenario_runs(scenario_type);

COMMENT ON TABLE forecast_scenario_runs IS 'Tracks each forecast scenario calculation for auditing and caching';

-- =============================================================================
-- View: v_stale_jobs
-- Jobs marked "in progress" with no lessons in 45+ days
-- =============================================================================
DROP VIEW IF EXISTS v_stale_jobs;

CREATE VIEW v_stale_jobs AS
WITH job_last_lesson AS (
    SELECT
        a.service_id,
        MAX(a.start) AS last_lesson_date,
        COUNT(DISTINCT a.appointment_id) AS total_lessons
    FROM appointments a
    WHERE a.status IN ('complete', 'cancelled-chargeable')
      AND a.is_deleted IS NOT TRUE
    GROUP BY a.service_id
),
job_client_info AS (
    -- Get client info from most recent appointment's recipients
    SELECT DISTINCT ON (a.service_id)
        a.service_id,
        ar.paying_client_id,
        ar.paying_client_name
    FROM appointments a
    JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
    WHERE a.is_deleted IS NOT TRUE
    ORDER BY a.service_id, a.start DESC
)
SELECT
    s.service_id,
    s.name AS job_name,
    s.status,
    s.labels,
    s.dft_charge_rate,
    s.dft_charge_type,
    jci.paying_client_id AS client_id,
    jci.paying_client_name AS client_name,
    jll.last_lesson_date,
    CASE
        WHEN jll.last_lesson_date IS NULL THEN NULL
        ELSE NOW()::DATE - jll.last_lesson_date::DATE
    END AS days_since_last_lesson,
    COALESCE(jll.total_lessons, 0) AS total_lessons,
    -- Determine channel from labels
    CASE
        WHEN s.labels::text ILIKE '%Home%' THEN 'home'
        WHEN s.labels::text ILIKE '%Online%' THEN 'digital'
        WHEN s.labels::text ILIKE '%Club%' THEN 'clubs'
        WHEN s.labels::text ILIKE '%School%' THEN 'schools'
        ELSE 'other'
    END AS channel,
    -- Extract market from labels
    CASE
        WHEN s.labels::text ILIKE '%NYC%' OR s.labels::text ILIKE '%New York%' THEN 'NYC'
        WHEN s.labels::text ILIKE '%LA%' OR s.labels::text ILIKE '%Los Angeles%' THEN 'LA'
        WHEN s.labels::text ILIKE '%SF%' OR s.labels::text ILIKE '%San Francisco%' THEN 'SF'
        WHEN s.labels::text ILIKE '%Westside%' THEN Westside
        WHEN s.labels::text ILIKE '%Eastside%' THEN Eastside
        WHEN s.labels::text ILIKE '%Westchester%' THEN 'Westchester'
        WHEN s.labels::text ILIKE '%Hamptons%' THEN 'Hamptons'
        ELSE NULL
    END AS market
FROM services s
LEFT JOIN job_last_lesson jll ON s.service_id = jll.service_id
LEFT JOIN job_client_info jci ON s.service_id = jci.service_id
WHERE s.status = 'in-progress'
  AND (s.archived IS NULL OR s.archived = FALSE)
  -- Exclude non-teaching jobs
  AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
      WHERE lbl.value ILIKE '%Non teaching%'
         OR lbl.value ILIKE '%Job Finished%'
         OR lbl.value ILIKE '%Admin%'
         OR lbl.value ILIKE '%Support%'
  )
  -- 45+ days since last lesson OR no lessons at all
  AND (
      jll.last_lesson_date IS NULL
      OR NOW()::DATE - jll.last_lesson_date::DATE > 45
  );

COMMENT ON VIEW v_stale_jobs IS 'Jobs in progress with no lessons in 45+ days - needs follow-up';

-- =============================================================================
-- View: v_scheduled_lessons
-- Future appointments that are scheduled but not yet completed
-- =============================================================================
DROP VIEW IF EXISTS v_scheduled_lessons;

CREATE VIEW v_scheduled_lessons AS
SELECT
    a.appointment_id,
    a.service_id,
    s.name AS job_name,
    a.start AS scheduled_date,
    a.units,
    a.charge_type,
    s.dft_charge_type,
    ar.recipient_id,
    ar.recipient_name,
    ar.paying_client_id,
    ar.paying_client_name,
    ar.charge_rate,
    ac.contractor_id,
    ac.contractor_name,
    ac.pay_rate,
    -- Calculate expected revenue
    CASE
        WHEN s.dft_charge_type = 'hourly' THEN ar.charge_rate * a.units
        WHEN s.dft_charge_type = 'one-off' THEN ar.charge_rate
        WHEN s.dft_charge_type = 'one-off-split' THEN ar.charge_rate
        WHEN s.dft_charge_type = 'hourly-split' THEN ar.charge_rate * a.units
        ELSE ar.charge_rate * a.units
    END AS expected_revenue,
    -- Calculate expected tutor pay
    CASE
        WHEN a.charge_type = 'hourly' THEN ac.pay_rate * a.units
        WHEN a.charge_type = 'one-off' THEN ac.pay_rate
        ELSE ac.pay_rate * a.units
    END AS expected_tutor_pay,
    -- Determine channel
    CASE
        WHEN s.labels::text ILIKE '%Home%' THEN 'home'
        WHEN s.labels::text ILIKE '%Online%' THEN 'digital'
        WHEN s.labels::text ILIKE '%Club%' THEN 'clubs'
        WHEN s.labels::text ILIKE '%School%' THEN 'schools'
        ELSE 'other'
    END AS channel,
    s.labels
FROM appointments a
JOIN services s ON a.service_id = s.service_id
LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
WHERE a.start > NOW()
  AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')
  AND a.is_deleted IS NOT TRUE
  AND ar.status <> 'missed';

COMMENT ON VIEW v_scheduled_lessons IS 'Future scheduled lessons with calculated expected revenue and tutor pay';

-- =============================================================================
-- Seed default targets (Q1 2026 from the image provided)
-- =============================================================================
INSERT INTO forecast_targets (target_type, channel, target_value, quarter, year, created_by)
VALUES
    -- Q1 Revenue targets by channel
    ('quarterly_revenue', 'home', 441288, 1, 2026, 'migration'),
    ('quarterly_revenue', 'digital', 120027, 1, 2026, 'migration'),
    ('quarterly_revenue', 'schools', 327826, 1, 2026, 'migration'),
    ('quarterly_revenue', 'clubs', 153533, 1, 2026, 'migration'),
    -- Weekly lesson targets by channel
    ('weekly_lessons', 'home', 263, NULL, 2026, 'migration'),
    ('weekly_lessons', 'digital', 117, NULL, 2026, 'migration'),
    ('weekly_lessons', 'schools', 210, NULL, 2026, 'migration'),
    ('weekly_lessons', 'clubs', 51, NULL, 2026, 'migration'),
    -- Total targets
    ('quarterly_revenue', NULL, 1066168, 1, 2026, 'migration'),
    ('weekly_lessons', NULL, 641, NULL, 2026, 'migration')
ON CONFLICT (target_type, channel, market, quarter, year) DO NOTHING;

-- =============================================================================
-- Seed NYC summer slump seasonality factors (June-August = weeks 23-35)
-- Based on typical 30-40% lesson reduction for NYC home lessons
-- =============================================================================
INSERT INTO seasonality_factors (week_of_year, channel, market, factor, sample_size, base_year)
SELECT
    week_num,
    'home' AS channel,
    'NYC' AS market,
    CASE
        WHEN week_num BETWEEN 24 AND 26 THEN 0.85  -- Early June - gradual decline
        WHEN week_num BETWEEN 27 AND 31 THEN 0.65  -- July - peak summer
        WHEN week_num BETWEEN 32 AND 35 THEN 0.75  -- August - gradual recovery
        ELSE 1.0
    END AS factor,
    52 AS sample_size,  -- Placeholder until computed from actuals
    2025 AS base_year
FROM generate_series(1, 52) AS week_num
WHERE week_num BETWEEN 24 AND 35
ON CONFLICT (week_of_year, channel, market, base_year) DO NOTHING;

-- Also add for Westchester and Hamptons (similar pattern)
INSERT INTO seasonality_factors (week_of_year, channel, market, factor, sample_size, base_year)
SELECT
    week_num,
    'home' AS channel,
    market_name,
    CASE
        WHEN week_num BETWEEN 24 AND 26 THEN 0.85
        WHEN week_num BETWEEN 27 AND 31 THEN 0.65
        WHEN week_num BETWEEN 32 AND 35 THEN 0.75
        ELSE 1.0
    END AS factor,
    52 AS sample_size,
    2025 AS base_year
FROM generate_series(1, 52) AS week_num
CROSS JOIN (VALUES ('Westchester'), ('Hamptons')) AS markets(market_name)
WHERE week_num BETWEEN 24 AND 35
ON CONFLICT (week_of_year, channel, market, base_year) DO NOTHING;
