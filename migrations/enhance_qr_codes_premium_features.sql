-- Premium QR Code Features Enhancement Migration
-- Adds enterprise-level features matching QR Code Generator PRO capabilities

-- =====================================================
-- 1. QR CODE FOLDERS / ORGANIZATION
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  parent_folder_id UUID REFERENCES qr_code_folders(id) ON DELETE SET NULL,
  color VARCHAR(7) DEFAULT '#6A469D',
  icon VARCHAR(50) DEFAULT 'folder',
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add folder reference to qr_codes
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES qr_code_folders(id) ON DELETE SET NULL;

-- =====================================================
-- 2. DYNAMIC QR CODE ENHANCEMENTS
-- =====================================================
-- Add fields for dynamic QR codes that can be updated without regenerating
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN DEFAULT true;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS redirect_type VARCHAR(20) DEFAULT 'permanent'; -- 'permanent', 'temporary', 'scheduled'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS scheduled_url TEXT; -- URL to switch to on schedule
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS schedule_start_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS schedule_end_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS fallback_url TEXT; -- URL if scheduled period ends

-- =====================================================
-- 3. ADVANCED CUSTOMIZATION
-- =====================================================
-- Logo/Image overlay
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_image_url TEXT;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_size_percent INTEGER DEFAULT 25; -- 10-40%
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_padding INTEGER DEFAULT 5;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_background_color VARCHAR(7);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS logo_border_radius INTEGER DEFAULT 0;

-- QR Code shape/style enhancements
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS dot_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS corner_square_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dot', 'extra-rounded'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS corner_dot_style VARCHAR(50) DEFAULT 'square'; -- 'square', 'dot'

-- Gradient support
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS use_gradient BOOLEAN DEFAULT false;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_start_color VARCHAR(7);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_end_color VARCHAR(7);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS gradient_direction VARCHAR(20) DEFAULT 'diagonal'; -- 'horizontal', 'vertical', 'diagonal', 'radial'

-- Frame/Label enhancements  
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_style VARCHAR(50) DEFAULT 'none'; -- 'none', 'banner-bottom', 'banner-top', 'box', 'balloon'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_color VARCHAR(7) DEFAULT '#000000';
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_text VARCHAR(100);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_text_color VARCHAR(7) DEFAULT '#FFFFFF';
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS frame_font VARCHAR(50) DEFAULT 'Arial';

-- Error correction level
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS error_correction VARCHAR(1) DEFAULT 'M'; -- 'L', 'M', 'Q', 'H'

-- =====================================================
-- 4. PRE-DESIGNED TEMPLATES
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- 'business', 'marketing', 'events', 'social', 'restaurant', etc.
  thumbnail_url TEXT,
  
  -- Design settings (stored as template)
  foreground_color VARCHAR(7) DEFAULT '#000000',
  background_color VARCHAR(7) DEFAULT '#FFFFFF',
  dot_style VARCHAR(50) DEFAULT 'square',
  corner_square_style VARCHAR(50) DEFAULT 'square',
  corner_dot_style VARCHAR(50) DEFAULT 'square',
  use_gradient BOOLEAN DEFAULT false,
  gradient_start_color VARCHAR(7),
  gradient_end_color VARCHAR(7),
  gradient_direction VARCHAR(20),
  frame_style VARCHAR(50) DEFAULT 'none',
  frame_color VARCHAR(7),
  frame_text VARCHAR(100),
  frame_text_color VARCHAR(7),
  logo_image_url TEXT,
  error_correction VARCHAR(1) DEFAULT 'M',
  
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link templates to QR codes
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES qr_code_templates(id) ON DELETE SET NULL;

-- =====================================================
-- 5. STICKERS / DECORATIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100), -- 'icons', 'frames', 'decorations', 'call-to-action'
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  position VARCHAR(20) DEFAULT 'center', -- 'center', 'top', 'bottom', 'overlay'
  is_premium BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link stickers to QR codes
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS sticker_id UUID REFERENCES qr_code_stickers(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS sticker_position VARCHAR(20);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS sticker_size_percent INTEGER DEFAULT 30;

-- =====================================================
-- 6. ADVANCED ANALYTICS ENHANCEMENTS
-- =====================================================
-- Add geo-location tracking to scans
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS country_code VARCHAR(2);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS region VARCHAR(100);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS timezone VARCHAR(50);

-- Add more device/browser details
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS device_brand VARCHAR(100);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS device_model VARCHAR(100);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS os_version VARCHAR(50);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS browser_version VARCHAR(50);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS screen_resolution VARCHAR(20);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS language VARCHAR(10);

-- UTM parameter enhancements
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255);
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255);

-- Scan context
ALTER TABLE qr_code_scans ADD COLUMN IF NOT EXISTS scan_context VARCHAR(50); -- 'direct', 'social', 'email', 'print', etc.

-- =====================================================
-- 7. NOTIFICATION SETTINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  
  -- Notification triggers
  notify_on_scan BOOLEAN DEFAULT false,
  notify_on_milestone BOOLEAN DEFAULT true,
  milestone_thresholds INTEGER[] DEFAULT '{10, 50, 100, 500, 1000}',
  
  -- Email notifications
  email_enabled BOOLEAN DEFAULT false,
  email_addresses TEXT[], -- Array of emails to notify
  email_frequency VARCHAR(20) DEFAULT 'instant', -- 'instant', 'daily', 'weekly'
  last_email_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Daily digest settings
  daily_digest_enabled BOOLEAN DEFAULT false,
  daily_digest_time TIME DEFAULT '09:00:00',
  daily_digest_timezone VARCHAR(50) DEFAULT 'America/New_York',
  
  -- Webhook notifications
  webhook_enabled BOOLEAN DEFAULT false,
  webhook_url TEXT,
  webhook_secret VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add notification reference to qr_codes for quick access
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT false;

-- =====================================================
-- 8. BULK OPERATIONS TRACKING
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_bulk_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'export', 'import'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  
  -- Job configuration
  config JSONB,
  
  -- Results
  result_file_url TEXT,
  error_log TEXT,
  
  -- Metadata
  created_by VARCHAR(255),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Track which QR codes belong to which bulk job
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS bulk_job_id UUID REFERENCES qr_code_bulk_jobs(id) ON DELETE SET NULL;

-- =====================================================
-- 9. TAGS FOR BETTER ORGANIZATION
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(7) DEFAULT '#6A469D',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qr_code_tag_assignments (
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES qr_code_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (qr_code_id, tag_id)
);

-- =====================================================
-- 10. QR CODE VERSIONS / HISTORY
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  
  -- Snapshot of QR code at this version
  destination_url TEXT,
  qr_code_image_url TEXT,
  design_config JSONB, -- Full design settings snapshot
  
  -- Change tracking
  change_reason VARCHAR(255),
  changed_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add version tracking to main table
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS current_version INTEGER DEFAULT 1;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS version_history_enabled BOOLEAN DEFAULT true;

-- =====================================================
-- 11. A/B TESTING SUPPORT
-- =====================================================
CREATE TABLE IF NOT EXISTS qr_code_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  
  -- Test configuration
  primary_qr_code_id UUID REFERENCES qr_codes(id) ON DELETE CASCADE,
  variant_qr_code_id UUID REFERENCES qr_codes(id) ON DELETE SET NULL,
  traffic_split INTEGER DEFAULT 50, -- Percentage going to variant (0-100)
  
  -- Goals
  goal_type VARCHAR(50) DEFAULT 'scans', -- 'scans', 'unique_scans', 'conversions'
  goal_target INTEGER,
  
  -- Results
  primary_scans INTEGER DEFAULT 0,
  variant_scans INTEGER DEFAULT 0,
  winner VARCHAR(20), -- 'primary', 'variant', 'tie', null
  statistical_significance DECIMAL(5, 2),
  
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Link A/B tests to QR codes
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS ab_test_id UUID REFERENCES qr_code_ab_tests(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS ab_test_variant VARCHAR(20); -- 'primary', 'variant'

-- =====================================================
-- 12. PASSWORD PROTECTION
-- =====================================================
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS is_password_protected BOOLEAN DEFAULT false;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS password_hint VARCHAR(255);

-- =====================================================
-- 13. EXPIRATION SETTINGS
-- =====================================================
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS expiration_action VARCHAR(20) DEFAULT 'deactivate'; -- 'deactivate', 'redirect_fallback', 'show_message'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS expiration_message TEXT;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS max_scans INTEGER; -- Limit total scans
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS max_unique_scans INTEGER; -- Limit unique scans

-- =====================================================
-- 14. SCAN SCHEDULING / TIME RESTRICTIONS
-- =====================================================
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS scan_schedule_enabled BOOLEAN DEFAULT false;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS scan_schedule JSONB; -- { "monday": ["09:00-17:00"], "tuesday": ["09:00-17:00"], ... }
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS scan_schedule_timezone VARCHAR(50) DEFAULT 'America/New_York';
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS outside_schedule_action VARCHAR(20) DEFAULT 'show_message'; -- 'show_message', 'redirect_fallback', 'block'
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS outside_schedule_message TEXT;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_qr_codes_folder_id ON qr_codes(folder_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_template_id ON qr_codes(template_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_is_dynamic ON qr_codes(is_dynamic);
CREATE INDEX IF NOT EXISTS idx_qr_codes_expires_at ON qr_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_qr_codes_ab_test_id ON qr_codes(ab_test_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_scans_country ON qr_code_scans(country);
CREATE INDEX IF NOT EXISTS idx_qr_code_scans_city ON qr_code_scans(city);
CREATE INDEX IF NOT EXISTS idx_qr_code_folders_parent ON qr_code_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_notifications_qr_code_id ON qr_code_notifications(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_versions_qr_code_id ON qr_code_versions(qr_code_id);

-- =====================================================
-- INSERT DEFAULT TEMPLATES
-- =====================================================
INSERT INTO qr_code_templates (name, description, category, foreground_color, background_color, dot_style, frame_style, is_premium, sort_order)
VALUES 
  ('Classic Black', 'Simple black and white QR code', 'basic', '#000000', '#FFFFFF', 'square', 'none', false, 1),
  ('Story Time Purple', 'Acme Operations branded QR code', 'branded', '#6A469D', '#FFFFFF', 'rounded', 'none', false, 2),
  ('Ocean Blue', 'Fresh blue QR code', 'basic', '#50C8DF', '#FFFFFF', 'dots', 'none', false, 3),
  ('Forest Green', 'Natural green QR code', 'basic', '#34B256', '#FFFFFF', 'rounded', 'none', false, 4),
  ('Sunset Orange', 'Warm orange QR code', 'basic', '#F79A30', '#FFFFFF', 'square', 'none', false, 5),
  ('Berry Pink', 'Vibrant pink QR code', 'basic', '#DA2E72', '#FFFFFF', 'dots', 'none', false, 6),
  ('Navy Professional', 'Professional navy QR code', 'business', '#2D2F8E', '#E8FBFF', 'square', 'banner-bottom', false, 7),
  ('Scan Me Banner', 'QR code with Scan Me banner', 'call-to-action', '#000000', '#FFFFFF', 'square', 'banner-bottom', false, 8)
ON CONFLICT DO NOTHING;

-- =====================================================
-- INSERT DEFAULT STICKERS
-- =====================================================
INSERT INTO qr_code_stickers (name, category, image_url, position, is_premium, sort_order)
VALUES
  ('Scan Me Icon', 'call-to-action', '/assets/qr-stickers/scan-me.png', 'center', false, 1),
  ('Arrow Down', 'call-to-action', '/assets/qr-stickers/arrow-down.png', 'bottom', false, 2),
  ('Phone Icon', 'icons', '/assets/qr-stickers/phone.png', 'center', false, 3),
  ('Website Icon', 'icons', '/assets/qr-stickers/website.png', 'center', false, 4),
  ('Menu Icon', 'icons', '/assets/qr-stickers/menu.png', 'center', false, 5),
  ('Event Icon', 'icons', '/assets/qr-stickers/event.png', 'center', false, 6)
ON CONFLICT DO NOTHING;

-- =====================================================
-- INSERT DEFAULT TAGS
-- =====================================================
INSERT INTO qr_code_tags (name, color)
VALUES
  ('Marketing', '#DA2E72'),
  ('Events', '#F79A30'),
  ('Booking Forms', '#6A469D'),
  ('Social Media', '#50C8DF'),
  ('Print Materials', '#34B256'),
  ('Website', '#2D2F8E'),
  ('Email', '#FACC29')
ON CONFLICT (name) DO NOTHING;
