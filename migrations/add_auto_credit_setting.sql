-- Migration: Add auto_credit_requests_enabled setting
-- This setting controls whether credit requests are automatically generated
-- when client balance is low (mirrors TutorCruncher's auto-credit-request feature)

-- Insert default setting for auto credit requests (disabled by default for safety)
INSERT INTO app_settings (setting_key, setting_value, description)
VALUES (
    'auto_credit_requests_enabled',
    '{"enabled": false}'::jsonb,
    'Toggle to enable/disable automatic credit request generation when client balance is low. When enabled, the system will automatically create draft credit requests for clients with insufficient prepaid credit to cover upcoming lessons.'
)
ON CONFLICT (setting_key) DO NOTHING;
