-- QR Codes Management System Migration
-- Creates tables for storing and tracking QR codes from QR Code Generator API

-- Main QR codes table
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remote_id VARCHAR(255) UNIQUE, -- ID from QR Code Generator API for synced codes
  name VARCHAR(255) NOT NULL,
  description TEXT,
  destination_url TEXT NOT NULL,
  qr_code_image_url TEXT, -- URL to the generated QR code image (stored in Cloudinary or S3)
  qr_code_svg TEXT, -- Raw SVG data for the QR code
  
  -- Design parameters
  frame_name VARCHAR(50) DEFAULT 'no-frame', -- 'no-frame', 'bottom-frame', 'bottom-tooltip', 'top-header'
  frame_color VARCHAR(7) DEFAULT '#000000',
  frame_text VARCHAR(100),
  frame_icon_name VARCHAR(50),
  foreground_color VARCHAR(7) DEFAULT '#000000',
  background_color VARCHAR(7) DEFAULT '#FFFFFF',
  marker_left_inner_color VARCHAR(7) DEFAULT '#000000',
  marker_left_outer_color VARCHAR(7) DEFAULT '#000000',
  marker_right_inner_color VARCHAR(7) DEFAULT '#000000',
  marker_right_outer_color VARCHAR(7) DEFAULT '#000000',
  marker_bottom_inner_color VARCHAR(7) DEFAULT '#000000',
  marker_bottom_outer_color VARCHAR(7) DEFAULT '#000000',
  marker_left_template VARCHAR(20) DEFAULT 'version1',
  marker_right_template VARCHAR(20) DEFAULT 'version1',
  marker_bottom_template VARCHAR(20) DEFAULT 'version1',
  qr_code_logo VARCHAR(50) DEFAULT 'no-logo', -- 'no-logo', 'scan-me-square', 'scan-me'
  
  -- Tracking & Analytics
  short_url VARCHAR(255), -- Short URL if using a URL shortener for tracking
  total_scans INTEGER DEFAULT 0,
  unique_scans INTEGER DEFAULT 0,
  last_scanned_at TIMESTAMP,
  
  -- Categorization
  category VARCHAR(100), -- e.g., 'marketing', 'events', 'products', 'internal'
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- QR Code scan events table (for analytics)
CREATE TABLE IF NOT EXISTS qr_code_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP DEFAULT NOW(),
  
  -- Device/Browser info
  user_agent TEXT,
  device_type VARCHAR(50), -- 'mobile', 'tablet', 'desktop'
  browser VARCHAR(100),
  os VARCHAR(100),
  
  -- Location info (if available)
  ip_address VARCHAR(45),
  country VARCHAR(100),
  city VARCHAR(100),
  region VARCHAR(100),
  
  -- Session info
  session_id VARCHAR(255),
  is_unique_scan BOOLEAN DEFAULT true,
  
  -- Referrer tracking
  referrer TEXT,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_name ON qr_codes(name);
CREATE INDEX IF NOT EXISTS idx_qr_codes_category ON qr_codes(category);
CREATE INDEX IF NOT EXISTS idx_qr_codes_is_active ON qr_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_qr_codes_created ON qr_codes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_codes_deleted ON qr_codes(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qr_code_scans_qr_code ON qr_code_scans(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_qr_code_scans_scanned_at ON qr_code_scans(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_code_scans_device ON qr_code_scans(device_type);
CREATE INDEX IF NOT EXISTS idx_qr_code_scans_country ON qr_code_scans(country);

-- Comments for documentation
COMMENT ON TABLE qr_codes IS 'Stores QR code configurations and metadata from QR Code Generator API';
COMMENT ON TABLE qr_code_scans IS 'Tracks individual scan events for QR code analytics';
COMMENT ON COLUMN qr_codes.frame_name IS 'Frame style: no-frame, bottom-frame, bottom-tooltip, top-header';
COMMENT ON COLUMN qr_codes.marker_left_template IS 'Marker design version (version1-version16)';
COMMENT ON COLUMN qr_codes.qr_code_logo IS 'Logo in center: no-logo, scan-me-square, scan-me';
