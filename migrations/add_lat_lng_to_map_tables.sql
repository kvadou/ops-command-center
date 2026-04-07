-- Migration: Add latitude and longitude columns for map caching
-- This migration adds lat/lng columns to recipients and affiliates tables
-- to cache geocoded addresses and avoid re-geocoding on every page load

-- Add latitude and longitude to recipients table
ALTER TABLE recipients 
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 7);

-- Add latitude and longitude to affiliates table
ALTER TABLE affiliates 
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 7);

-- Create indexes for faster geocoding lookups
CREATE INDEX IF NOT EXISTS idx_recipients_lat_lng ON recipients(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliates_lat_lng ON affiliates(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comments
COMMENT ON COLUMN recipients.latitude IS 'Cached latitude from geocoding address';
COMMENT ON COLUMN recipients.longitude IS 'Cached longitude from geocoding address';
COMMENT ON COLUMN affiliates.latitude IS 'Cached latitude from geocoding address';
COMMENT ON COLUMN affiliates.longitude IS 'Cached longitude from geocoding address';

