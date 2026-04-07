-- Migration: Add margin_percent and channel_mix columns to forecast_targets
-- For quarterly target planning feature

-- Add margin_percent column (default 50%)
ALTER TABLE forecast_targets
ADD COLUMN IF NOT EXISTS margin_percent INTEGER DEFAULT 50;

-- Add channel_mix column (JSONB for storing channel percentages)
ALTER TABLE forecast_targets
ADD COLUMN IF NOT EXISTS channel_mix JSONB;

-- Add comments
COMMENT ON COLUMN forecast_targets.margin_percent IS 'Target profit margin percentage (default 50%)';
COMMENT ON COLUMN forecast_targets.channel_mix IS 'JSON object with channel revenue percentages, e.g. {"home": 45, "digital": 35, "clubs": 15, "schools": 5}';
