-- Migration: Create user_guides table for CMS-style user guide management
-- This migration creates a table to store user guides with categories, content, and metadata

CREATE TABLE IF NOT EXISTS user_guides (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL, -- URL-friendly identifier
    category VARCHAR(100) NOT NULL, -- e.g., "Getting Started", "Booking Forms", "Analytics", etc.
    content TEXT NOT NULL, -- Markdown or HTML content
    excerpt TEXT, -- Short description for listings
    order_index INTEGER DEFAULT 0, -- For custom ordering within category
    is_published BOOLEAN DEFAULT TRUE, -- Draft vs published
    is_featured BOOLEAN DEFAULT FALSE, -- Featured guides shown prominently
    tags TEXT[], -- Array of tags for filtering
    author_id INTEGER, -- Reference to users table (optional)
    author_name VARCHAR(255), -- Store author name for display
    view_count INTEGER DEFAULT 0, -- Track popularity
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_guides_category ON user_guides(category);
CREATE INDEX IF NOT EXISTS idx_user_guides_slug ON user_guides(slug);
CREATE INDEX IF NOT EXISTS idx_user_guides_published ON user_guides(is_published);
CREATE INDEX IF NOT EXISTS idx_user_guides_featured ON user_guides(is_featured);
CREATE INDEX IF NOT EXISTS idx_user_guides_order ON user_guides(category, order_index);
CREATE INDEX IF NOT EXISTS idx_user_guides_tags ON user_guides USING GIN(tags);

-- Add comments to document the table purpose
COMMENT ON TABLE user_guides IS 'CMS table for storing user guides and help documentation';
COMMENT ON COLUMN user_guides.slug IS 'URL-friendly identifier (e.g., "getting-started-with-booking-forms")';
COMMENT ON COLUMN user_guides.category IS 'Category for organizing guides (e.g., Getting Started, Booking Forms, Analytics)';
COMMENT ON COLUMN user_guides.content IS 'Main content of the guide (supports Markdown)';
COMMENT ON COLUMN user_guides.order_index IS 'Custom ordering within category (lower numbers appear first)';

