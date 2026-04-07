-- Migration: Add club booking landing page columns
-- Date: 2026-02-25
-- Idempotent: Safe to run multiple times

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS hero_image_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS logistics_info TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS tc_package_url TEXT;

-- Seed Park Slope club content
UPDATE clubs SET
  description = 'Join our Park Slope chess club where kids ages 4-12 learn chess through storytelling! Our experienced tutors make every class fun and engaging, whether your child is a complete beginner or already knows the basics.',
  logistics_info = 'Located in Park Slope, Brooklyn. Street parking available. Near the F/G trains at 7th Ave station.',
  cancellation_policy = 'Cancellations must be made at least 24 hours before class time for a full refund. Late cancellations and no-shows are non-refundable.',
  tc_package_url = 'https://account.acmeops.com/accounting/packages/198/'
WHERE slug = 'park-slope';

-- Create Single Class booking type (only if it doesn't exist)
INSERT INTO booking_types (name, description, lesson_type, original_price, actual_price, label_name, is_trial, category)
SELECT
  'Clubs - Park Slope Single Class',
  'Single chess club class at our Park Slope location.',
  'Club - Private',
  60.00,
  60.00,
  'Club - Park Slope',
  false,
  'club'
WHERE NOT EXISTS (
  SELECT 1 FROM booking_types WHERE name = 'Clubs - Park Slope Single Class'
);
