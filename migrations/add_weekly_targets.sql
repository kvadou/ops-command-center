-- Migration: Add weekly target support to forecast_targets
-- This adds a week_number column for granular weekly targets (Sun-Sat)

-- Add week_number column (1-53 for ISO week number, NULL for monthly/quarterly targets)
ALTER TABLE forecast_targets
ADD COLUMN IF NOT EXISTS week_number INTEGER;

-- Add constraint for valid week numbers
ALTER TABLE forecast_targets
DROP CONSTRAINT IF EXISTS forecast_targets_week_number_check;

ALTER TABLE forecast_targets
ADD CONSTRAINT forecast_targets_week_number_check
CHECK (week_number IS NULL OR (week_number >= 1 AND week_number <= 53));

-- Update unique constraint to include week_number
-- Drop old constraint
ALTER TABLE forecast_targets
DROP CONSTRAINT IF EXISTS forecast_targets_target_type_channel_market_quarter_year_key;

-- Create new unique constraint including week
ALTER TABLE forecast_targets
ADD CONSTRAINT forecast_targets_unique_target
UNIQUE NULLS NOT DISTINCT (target_type, channel, market, quarter, week_number, year);

-- Add new target types for weekly/monthly metrics
COMMENT ON COLUMN forecast_targets.target_type IS 'Types: weekly_lessons, weekly_revenue, weekly_hours, monthly_lessons, monthly_revenue, quarterly_revenue';
COMMENT ON COLUMN forecast_targets.week_number IS 'Week number (1-53) for weekly targets, ISO week Sunday-Saturday';

-- Create index for weekly target lookups
CREATE INDEX IF NOT EXISTS idx_forecast_targets_weekly
ON forecast_targets(year, week_number)
WHERE week_number IS NOT NULL;
