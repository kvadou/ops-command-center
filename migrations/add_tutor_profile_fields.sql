-- Add tutor profile fields for public profiles and Webflow sync
-- Run on ALL databases (main, staging, westside, eastside, local)

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_bio TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_headshot_url TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_teaching_style TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_years_experience INTEGER;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_title TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS webflow_item_id VARCHAR(255);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS profile_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_slug ON contractors(slug) WHERE slug IS NOT NULL;
