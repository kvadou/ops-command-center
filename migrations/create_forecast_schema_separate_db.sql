-- Migration: Create forecast schema for separate forecast database
-- This migration creates a dedicated forecast schema with UUID-based run IDs
-- and ETL sync tracking tables for the standalone forecast engine

-- Create forecast schema
CREATE SCHEMA IF NOT EXISTS forecast;

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: forecast.forecast_runs
-- Tracks each forecast run with metadata and metrics (UUID-based ID)
CREATE TABLE IF NOT EXISTS forecast.forecast_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- Table: forecast.daily_actuals
-- Stores historical daily revenue by segment (market, lesson_type)
CREATE TABLE IF NOT EXISTS forecast.daily_actuals (
    date DATE NOT NULL,
    revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (date, market, lesson_type)
);

-- Table: forecast.daily_pipeline
-- Stores expected value from planned lessons by date and segment
-- run_id is nullable: NULL for raw synced data, UUID for forecast-run-specific data
CREATE TABLE IF NOT EXISTS forecast.daily_pipeline (
    date DATE NOT NULL,
    expected_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    count_lessons INTEGER NOT NULL DEFAULT 0,
    avg_probability NUMERIC(5, 4),
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    run_id UUID REFERENCES forecast.forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (date, market, lesson_type, run_id)
);

-- Note: For synced pipeline data without a forecast run, run_id will be NULL
-- This allows syncing raw pipeline data before forecast runs are executed

-- Table: forecast.daily_forecast
-- Stores forecast predictions (P10, P50, P90) by date and segment
CREATE TABLE IF NOT EXISTS forecast.daily_forecast (
    date DATE NOT NULL,
    p10 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    p50 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    p90 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    component_ts NUMERIC(12, 2),
    component_pipeline NUMERIC(12, 2),
    market VARCHAR(100),
    lesson_type VARCHAR(100),
    run_id UUID NOT NULL REFERENCES forecast.forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (date, market, lesson_type, run_id)
);

-- Table: forecast.lesson_pipeline_features
-- Stores features and probabilities for planned lessons used in pipeline model
CREATE TABLE IF NOT EXISTS forecast.lesson_pipeline_features (
    appointment_id INTEGER NOT NULL,
    feature JSONB NOT NULL DEFAULT '{}'::jsonb,
    label INTEGER,
    prob NUMERIC(5, 4),
    price NUMERIC(10, 2),
    date DATE NOT NULL,
    run_id UUID REFERENCES forecast.forecast_runs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (appointment_id, run_id)
);

-- Table: forecast.sync_log
-- Tracks the last sync date for ETL process
CREATE TABLE IF NOT EXISTS forecast.sync_log (
    id SERIAL PRIMARY KEY,
    last_sync_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: forecast.sync_audit
-- Tracks sync job execution for monitoring and debugging
CREATE TABLE IF NOT EXISTS forecast.sync_audit (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    records_processed INTEGER,
    duration_ms INTEGER,
    success BOOLEAN,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_forecast_runs_run_at ON forecast.forecast_runs(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_actuals_date ON forecast.daily_actuals(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_actuals_market_lesson ON forecast.daily_actuals(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_date ON forecast.daily_pipeline(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_run_id ON forecast.daily_pipeline(run_id);
CREATE INDEX IF NOT EXISTS idx_daily_pipeline_market_lesson ON forecast.daily_pipeline(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_date ON forecast.daily_forecast(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_run_id ON forecast.daily_forecast(run_id);
CREATE INDEX IF NOT EXISTS idx_daily_forecast_market_lesson ON forecast.daily_forecast(market, lesson_type, date);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_appointment ON forecast.lesson_pipeline_features(appointment_id);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_date ON forecast.lesson_pipeline_features(date);
CREATE INDEX IF NOT EXISTS idx_lesson_pipeline_run_id ON forecast.lesson_pipeline_features(run_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_last_sync_date ON forecast.sync_log(last_sync_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_started_at ON forecast.sync_audit(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_audit_success ON forecast.sync_audit(success);

-- Add comments for documentation
COMMENT ON SCHEMA forecast IS 'Dedicated schema for revenue forecasting system';
COMMENT ON TABLE forecast.forecast_runs IS 'Tracks each forecast run with metadata, metrics, and model version';
COMMENT ON TABLE forecast.daily_actuals IS 'Historical daily revenue actuals aggregated by date, market, and lesson_type';
COMMENT ON TABLE forecast.daily_pipeline IS 'Expected value from planned lessons pipeline by date and segment';
COMMENT ON TABLE forecast.daily_forecast IS 'Forecast predictions (P10, P50, P90) with component breakdowns';
COMMENT ON TABLE forecast.lesson_pipeline_features IS 'Features and probabilities for individual planned lessons';
COMMENT ON TABLE forecast.sync_log IS 'Tracks the last ETL sync date';
COMMENT ON TABLE forecast.sync_audit IS 'Audit trail for ETL sync job executions';

