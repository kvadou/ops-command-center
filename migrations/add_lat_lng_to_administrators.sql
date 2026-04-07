-- Migration: Add latitude and longitude columns to administrators table
-- This migration adds lat/lng columns to administrators table for map caching

-- Add latitude and longitude to administrators table
ALTER TABLE administrators 
  ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 7);

-- Create indexes for faster geocoding lookups
CREATE INDEX IF NOT EXISTS idx_administrators_lat_lng ON administrators(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Add comments
COMMENT ON COLUMN administrators.latitude IS 'Cached latitude from geocoding address';
COMMENT ON COLUMN administrators.longitude IS 'Cached longitude from geocoding address';

