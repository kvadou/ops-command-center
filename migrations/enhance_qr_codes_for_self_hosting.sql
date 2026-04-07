-- Enhance QR Codes Table for Self-Hosted QR Code Management System
-- This migration adds columns needed for internal QR code generation and tracking

-- Add short_code for redirect tracking (e.g., /qr/abc123)
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS short_code VARCHAR(10) UNIQUE;

-- Add tracking URL (the full URL users will scan, e.g., https://join.acmeops.com/qr/abc123)
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS tracking_url TEXT;

-- Add linked entity support for booking forms, services, events, etc.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS linked_entity_type VARCHAR(50); -- 'booking_form', 'service', 'event', 'marketing', etc.
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS linked_entity_id VARCHAR(255);

-- Add auto_generated flag for QR codes created automatically with booking forms
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

-- Add source to distinguish internal vs external (synced from QR Code Generator PRO)
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'internal';

-- Add additional design fields for advanced customization
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS pattern_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dots', 'rounded', 'classy', 'classy-rounded', 'extra-rounded'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS corner_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dot', 'extra-rounded'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS corner_dot_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dot'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_type VARCHAR(20); -- 'linear', 'radial', null for solid color
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_color1 VARCHAR(7);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_color2 VARCHAR(7);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_rotation INTEGER DEFAULT 0;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_url TEXT; -- Custom uploaded logo URL
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_size DECIMAL(3,2) DEFAULT 0.4; -- Logo size relative to QR code (0.1 to 0.5)
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_margin INTEGER DEFAULT 5;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_style VARCHAR(50) DEFAULT 'none'; -- 'none', 'bottom', 'top', 'full'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_text_color VARCHAR(7) DEFAULT '#000000';

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_qr_codes_short_code ON qr_codes(short_code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_linked_entity ON qr_codes(linked_entity_type, linked_entity_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_source ON qr_codes(source);
CREATE INDEX IF NOT EXISTS idx_qr_codes_auto_generated ON qr_codes(auto_generated);

-- Update existing records to have source = 'external' if they have a remote_id
UPDATE qr_codes SET source = 'external' WHERE remote_id IS NOT NULL AND source IS NULL;
UPDATE qr_codes SET source = 'internal' WHERE remote_id IS NULL AND source IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN qr_codes.short_code IS 'Unique short code for tracking URL (e.g., abc123 for /qr/abc123)';
COMMENT ON COLUMN qr_codes.tracking_url IS 'Full tracking URL that users scan';
COMMENT ON COLUMN qr_codes.linked_entity_type IS 'Type of entity this QR code is linked to: booking_form, service, event, marketing';
COMMENT ON COLUMN qr_codes.linked_entity_id IS 'ID of the linked entity (service_id, form_id, etc.)';
COMMENT ON COLUMN qr_codes.auto_generated IS 'Whether this QR code was auto-generated with a booking form';
COMMENT ON COLUMN qr_codes.source IS 'Source of QR code: internal (our system) or external (QR Code Generator PRO sync)';
COMMENT ON COLUMN qr_codes.pattern_style IS 'QR code data pattern style: square, dots, rounded, classy, classy-rounded, extra-rounded';
COMMENT ON COLUMN qr_codes.corner_style IS 'Corner square style: square, dot, extra-rounded';
COMMENT ON COLUMN qr_codes.logo_url IS 'Custom logo URL to overlay on QR code center';
