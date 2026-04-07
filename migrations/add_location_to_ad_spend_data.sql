-- Add location and ad set columns to ad_spend_data table
-- This allows tracking ad spend by location (NY, Online, LA, SF, Park Slope Club, etc.)

ALTER TABLE ad_spend_data 
ADD COLUMN IF NOT EXISTS adset_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS adset_name VARCHAR(500),
ADD COLUMN IF NOT EXISTS location VARCHAR(100);

-- Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_location ON ad_spend_data(location);
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_adset_id ON ad_spend_data(adset_id);

-- Update unique constraint to include adset_id for adset-level data
-- Note: This will allow multiple rows per campaign/date if different ad sets exist
-- We'll need to handle this in the sync logic
ALTER TABLE ad_spend_data 
DROP CONSTRAINT IF EXISTS ad_spend_data_platform_campaign_id_date_key;

-- Create new unique constraint that includes adset_id
-- If adset_id is null (campaign-level data), use campaign_id
-- If adset_id is not null (adset-level data), use adset_id
CREATE UNIQUE INDEX IF NOT EXISTS ad_spend_data_platform_campaign_adset_date_unique 
ON ad_spend_data(platform, COALESCE(adset_id, campaign_id), date);

COMMENT ON COLUMN ad_spend_data.adset_id IS 'Ad set ID from Meta API (for adset-level insights)';
COMMENT ON COLUMN ad_spend_data.adset_name IS 'Ad set name from Meta API (contains location information)';
COMMENT ON COLUMN ad_spend_data.location IS 'Parsed location from ad set/campaign name (NY, Online, LA, SF, Park Slope Club, UES, etc.)';

