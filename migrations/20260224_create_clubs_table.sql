-- Migration: Create clubs registry table
-- Date: 2026-02-24
-- Idempotent: Safe to run multiple times (IF NOT EXISTS, ON CONFLICT DO NOTHING)

CREATE TABLE IF NOT EXISTS clubs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  location VARCHAR(200),
  service_labels JSONB NOT NULL DEFAULT '[]',
  support_labels JSONB NOT NULL DEFAULT '[]',
  venue_name VARCHAR(200),
  venue_address TEXT,
  capacity INTEGER,
  default_pricing JSONB DEFAULT '{}',
  schedule JSONB DEFAULT '[]',
  contact_email VARCHAR(200),
  contact_phone VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  booking_form_url VARCHAR(500),
  band_distribution JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clubs_slug ON clubs(slug);
CREATE INDEX IF NOT EXISTS idx_clubs_status ON clubs(status);

-- Seed Park Slope and UES
INSERT INTO clubs (name, slug, location, service_labels, support_labels, venue_name, default_pricing, schedule, status)
VALUES
  (
    'Park Slope',
    'park-slope',
    'Brooklyn, NY',
    '["Club - Park Slope"]'::jsonb,
    '["Club - Park Slope Support"]'::jsonb,
    'Park Slope Community Center',
    '{"dropIn": 60, "trial": 15}'::jsonb,
    '[{"day": "Saturday", "time": "10:00", "duration": 60}]'::jsonb,
    'active'
  ),
  (
    'Upper East Side',
    'ues',
    'Manhattan, NY',
    '["Club - UES"]'::jsonb,
    '["Club - UES Support"]'::jsonb,
    NULL,
    '{"dropIn": 60, "trial": 15}'::jsonb,
    '[]'::jsonb,
    'active'
  )
ON CONFLICT (slug) DO NOTHING;
