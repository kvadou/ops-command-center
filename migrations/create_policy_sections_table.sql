-- Migration: Create policy_sections table
-- Run on: local, staging, production, westside, eastside
-- Date: 2026-01-28

-- Create the policy_sections table if it doesn't exist
CREATE TABLE IF NOT EXISTS policy_sections (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    content_html TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    show_on_form BOOLEAN DEFAULT false,
    checkbox_group VARCHAR(50),
    checkbox_label VARCHAR(255),
    link_text VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_policy_sections_slug ON policy_sections(slug);
CREATE INDEX IF NOT EXISTS idx_policy_sections_sort_order ON policy_sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_policy_sections_show_on_form ON policy_sections(show_on_form);
CREATE INDEX IF NOT EXISTS idx_policy_sections_checkbox_group ON policy_sections(checkbox_group);

-- Add comments
COMMENT ON TABLE policy_sections IS 'Stores policy documents and their form configuration';
COMMENT ON COLUMN policy_sections.slug IS 'URL-friendly identifier for the policy';
COMMENT ON COLUMN policy_sections.label IS 'Display name for the policy';
COMMENT ON COLUMN policy_sections.content_html IS 'HTML content of the policy';
COMMENT ON COLUMN policy_sections.show_on_form IS 'Whether to show this policy on booking forms';
COMMENT ON COLUMN policy_sections.checkbox_group IS 'Group identifier for form checkbox (e.g., cancel, service)';
COMMENT ON COLUMN policy_sections.checkbox_label IS 'Label text for the checkbox';
COMMENT ON COLUMN policy_sections.link_text IS 'Text for the "read more" link';
