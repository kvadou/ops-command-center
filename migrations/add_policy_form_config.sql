-- Migration: Add form configuration fields to policy_sections
-- Run on: local, staging, production, westside, eastside

-- Add new columns for form display configuration
ALTER TABLE policy_sections ADD COLUMN IF NOT EXISTS show_on_form BOOLEAN DEFAULT false;
ALTER TABLE policy_sections ADD COLUMN IF NOT EXISTS checkbox_group VARCHAR(50);
ALTER TABLE policy_sections ADD COLUMN IF NOT EXISTS checkbox_label VARCHAR(255);
ALTER TABLE policy_sections ADD COLUMN IF NOT EXISTS link_text VARCHAR(255);

-- Set default values for existing policies
UPDATE policy_sections SET
  show_on_form = true,
  checkbox_group = 'cancel',
  checkbox_label = 'I agree to the Cancellation Policy',
  link_text = 'Read Cancellation Policy'
WHERE slug = 'cancel';

UPDATE policy_sections SET
  show_on_form = true,
  checkbox_group = 'service',
  checkbox_label = 'I agree to the Service Agreement',
  link_text = 'Read Club Service Agreement'
WHERE slug = 'club';

UPDATE policy_sections SET
  show_on_form = true,
  checkbox_group = 'service',
  checkbox_label = 'I agree to the Service Agreement',
  link_text = 'Read In-Home Service Agreement'
WHERE slug = 'inhome';

UPDATE policy_sections SET
  show_on_form = false,
  checkbox_group = NULL,
  checkbox_label = NULL,
  link_text = 'Read Photo Release'
WHERE slug = 'photo';

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_policy_sections_show_on_form ON policy_sections(show_on_form);
CREATE INDEX IF NOT EXISTS idx_policy_sections_checkbox_group ON policy_sections(checkbox_group);
