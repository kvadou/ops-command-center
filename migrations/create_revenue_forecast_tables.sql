-- Migration: Create revenue forecasting tables
-- This migration creates tables for storing forecast runs, actuals, pipeline data, and forecasts

-- Table: forecast_runs
-- Tracks each forecast run with metadata and metrics
CREATE TABLE IF NOT EXISTS forecast_runs (
    id SERIAL PRIMARY KEY,
    run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    horizon_days INTEGER NOT NULL DEFAULT 90,
    model_version VARCHAR(50),
    method VARCHAR(50) DEFAULT 'ensemble',
    backtest_mape NUMERIC(10, 4),
    backtest_wape NUMERIC(10, 4),
    coverage_p80 NUMERIC(10, 4),
    blend_weight NUMERIC(5, 4),
    notes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: daily_actuals
-- Stores historical daily revenue by segment (market, lesson_type)
CREATE TABLE IF NOT EXISTS daily_actuals (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, market, lesson_type)
);

-- Table: daily_pipeline
-- Stores expected value from planned lessons by date and segment
CREATE TABLE IF NOT EXISTS daily_pipeline (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    expected_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    count_lessons INTEGER NOT NULL DEFAULT 0,
    avg_probability NUMERIC(5, 4),
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    run_id INTEGER REFERENCES forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, market, lesson_type, run_id)
);

-- Table: daily_forecast
-- Stores forecast predictions (P10, P50, P90) by date and segment
CREATE TABLE IF NOT EXISTS daily_forecast (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    p10 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    p50 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    p90 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    component_ts NUMERIC(12, 2),
    component_pipeline NUMERIC(12, 2),
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    run_id INTEGER NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(date, market, lesson_type, run_id)
);

-- Table: lesson_pipeline_features
-- Stores features and probabilities for planned lessons used in pipeline model
CREATE TABLE IF NOT EXISTS lesson_pipeline_features (
    id SERIAL PRIMARY KEY,
    appointment_id INTEGER NOT NULL,
    feature JSONB NOT NULL DEFAULT '{}'::jsonb,
    label INTEGER,
    prob NUMERIC(5, 4),
    price NUMERIC(10, 2),
    date DATE NOT NULL,
    run_id INTEGER REFERENCES forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forecast_runs_run_at ON forecast_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_actuals_date ON daily_actuals(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_actuals_market_lesson ON daily_actuals(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_date ON daily_pipeline(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_run_id ON daily_pipeline(run_id);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_market_lesson ON daily_pipeline(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_date ON daily_forecast(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_run_id ON daily_forecast(run_id);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_market_lesson ON daily_forecast(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_appointment ON lesson_pipeline_features(appointment_id);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_date ON lesson_pipeline_features(date);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_run_id ON lesson_pipeline_features(run_id);

-- Add comments for documentation
COMMENT ON TABLE forecast_runs IS 'Tracks each forecast run with metadata, metrics, and model version';
COMMENT ON TABLE daily_actuals IS 'Historical daily revenue actuals aggregated by date, market, and lesson_type';
COMMENT ON TABLE daily_pipeline IS 'Expected value from planned lessons pipeline by date and segment';
COMMENT ON TABLE daily_forecast IS 'Forecast predictions (P10, P50, P90) with component breakdowns';
COMMENT ON TABLE lesson_pipeline_features IS 'Features and probabilities for individual planned lessons';

