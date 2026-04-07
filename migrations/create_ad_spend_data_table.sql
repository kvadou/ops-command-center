-- Create ad_spend_data table to store ad performance data from Meta and Google Ads APIs
-- This table stores daily aggregated ad metrics matched by UTM campaign parameters

CREATE TABLE IF NOT EXISTS ad_spend_data (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(50) NOT NULL, -- 'meta' or 'google'
  account_id VARCHAR(255), -- Meta Ad Account ID or Google Ads Customer ID
  campaign_id VARCHAR(255), -- Campaign ID from the platform
  campaign_name VARCHAR(500), -- Campaign name
  utm_campaign VARCHAR(500), -- UTM campaign name (for matching with submissions)
  date DATE NOT NULL, -- Date of the metrics
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  spend DECIMAL(10, 2) DEFAULT 0, -- Amount spent in USD
  ctr DECIMAL(5, 2) DEFAULT 0, -- Click-through rate percentage
  cpc DECIMAL(10, 2) DEFAULT 0, -- Cost per click
  conversions INTEGER DEFAULT 0, -- Number of conversions (if available)
  conversion_rate DECIMAL(5, 2) DEFAULT 0, -- Conversion rate percentage
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint: one record per platform/campaign/date
  UNIQUE(platform, campaign_id, date)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_platform ON ad_spend_data(platform);
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_date ON ad_spend_data(date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_utm_campaign ON ad_spend_data(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_campaign_id ON ad_spend_data(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_date_range ON ad_spend_data(date DESC);

-- Index for matching campaigns with submissions
CREATE INDEX IF NOT EXISTS idx_ad_spend_data_platform_utm ON ad_spend_data(platform, utm_campaign);

COMMENT ON TABLE ad_spend_data IS 'Stores daily aggregated ad performance metrics from Meta and Google Ads APIs';
COMMENT ON COLUMN ad_spend_data.platform IS 'Advertising platform: meta or google';
COMMENT ON COLUMN ad_spend_data.utm_campaign IS 'UTM campaign name used to match with booking form submissions';
COMMENT ON COLUMN ad_spend_data.spend IS 'Amount spent in USD for the day';
COMMENT ON COLUMN ad_spend_data.ctr IS 'Click-through rate as percentage (clicks/impressions * 100)';
COMMENT ON COLUMN ad_spend_data.cpc IS 'Cost per click (spend/clicks)';

