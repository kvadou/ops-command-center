-- Migration: Add app_settings table for application-wide settings
-- This table stores toggleable settings like lesson report sending

CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default setting for lesson reports (enabled by default)
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'lesson_reports_enabled',
    '{"enabled": true}'::jsonb,
    'Toggle to enable/disable automatic lesson report sending. When disabled, reports will still be created but not automatically sent.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(setting_key);
