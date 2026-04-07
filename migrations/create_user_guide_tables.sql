-- Migration: Create user guide tables
-- This migration creates tables for storing user guide collections, articles, and sections
-- with support for rich text content, videos, and drag-and-drop ordering

BEGIN;

-- Table: guide_collections
-- Top-level collections/categories (e.g., "Dashboard", "People", "Activity")
CREATE TABLE IF NOT EXISTS guide_collections (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100), -- Icon name for display
    order_index INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_collections_order ON guide_collections(order_index);
CREATE INDEX IF NOT EXISTS idx_guide_collections_published ON guide_collections(is_published);

-- Table: guide_articles
-- Articles within collections (e.g., "Dashboard Overview", "Customizing Your Dashboard")
CREATE TABLE IF NOT EXISTS guide_articles (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER NOT NULL REFERENCES guide_collections(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    slug VARCHAR(255) NOT NULL, -- URL-friendly identifier
    order_index INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(collection_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_guide_articles_collection ON guide_articles(collection_id);
CREATE INDEX IF NOT EXISTS idx_guide_articles_order ON guide_articles(collection_id, order_index);
CREATE INDEX IF NOT EXISTS idx_guide_articles_slug ON guide_articles(slug);
CREATE INDEX IF NOT EXISTS idx_guide_articles_published ON guide_articles(is_published);

-- Table: guide_sections
-- Individual content sections within articles (supports rich text, videos, images)
CREATE TABLE IF NOT EXISTS guide_sections (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES guide_articles(id) ON DELETE CASCADE,
    section_type VARCHAR(50) NOT NULL DEFAULT 'text', -- 'text', 'video', 'image', 'code'
    title VARCHAR(255),
    content TEXT, -- Rich text content (HTML from react-quill)
    video_url TEXT, -- Loom or other video embed URL
    video_provider VARCHAR(50), -- 'loom', 'youtube', 'vimeo', etc.
    image_url TEXT,
    code_content TEXT, -- For code blocks
    code_language VARCHAR(50), -- 'javascript', 'python', etc.
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guide_sections_article ON guide_sections(article_id);
CREATE INDEX IF NOT EXISTS idx_guide_sections_order ON guide_sections(article_id, order_index);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_guide_collections_updated_at BEFORE UPDATE ON guide_collections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guide_articles_updated_at BEFORE UPDATE ON guide_articles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guide_sections_updated_at BEFORE UPDATE ON guide_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed some initial collections based on TutorCruncher structure
INSERT INTO guide_collections (title, description, icon, order_index) VALUES
    ('Dashboard', 'Learn how to navigate and customise different parts of your Acme Operations dashboard here.', 'Squares2X2Icon', 1),
    ('People', 'Learn about managing users here.', 'UsersIcon', 2),
    ('Activity', 'Learn about managing Jobs, scheduling Lessons, creating Subscriptions and much more here.', 'AcademicCapIcon', 3),
    ('Communications', 'Learn about managing your outbound communications here.', 'EnvelopeIcon', 4),
    ('Accounting', 'Learn about managing payments, balances, invoices and credit requests.', 'CurrencyDollarIcon', 5),
    ('Analytics', 'Learn about Acme Operations analytics suite here.', 'ChartBarIcon', 6),
    ('System', 'Learn about adjusting your settings and preferences to suit your business needs here.', 'Cog6ToothIcon', 7)
ON CONFLICT DO NOTHING;

COMMIT;

