-- Migration: Add UTM Parameter Tracking to Klaviyo Campaigns
-- This migration adds UTM parameter columns to track campaign attribution

-- Add UTM parameter columns to klaviyo_campaigns table
ALTER TABLE klaviyo_campaigns 
ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255),
ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255),
ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255),
ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255),
ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255),
ADD COLUMN IF NOT EXISTS utm_id VARCHAR(255);

-- Create indexes for UTM parameters to enable fast lookups
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_utm_campaign ON klaviyo_campaigns(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_utm_source ON klaviyo_campaigns(utm_source);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_utm_medium ON klaviyo_campaigns(utm_medium);

-- Add comment
COMMENT ON COLUMN klaviyo_campaigns.utm_source IS 'UTM source parameter for campaign attribution';
COMMENT ON COLUMN klaviyo_campaigns.utm_medium IS 'UTM medium parameter (e.g., email, sms)';
COMMENT ON COLUMN klaviyo_campaigns.utm_campaign IS 'UTM campaign name - used to match with booking submissions';

