-- Migration: Create Knowledge Hub tables for franchisee onboarding and knowledge sharing
-- This migration creates tables for collections, articles, comments, questions, drafts, and attachments

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: knowledge_collections
-- Top-level categories for organizing knowledge content
CREATE TABLE IF NOT EXISTS knowledge_collections (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100), -- Icon name for UI display
    display_order INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT true,
    created_by INTEGER, -- User ID who created this collection
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: knowledge_articles
-- Individual articles with rich content
CREATE TABLE IF NOT EXISTS knowledge_articles (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER REFERENCES knowledge_collections(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    summary TEXT, -- Short summary for cards/previews
    content JSONB NOT NULL, -- TipTap JSON content
    tags TEXT[], -- Array of tags for categorization
    video_url TEXT, -- YouTube or Loom video URL
    video_provider VARCHAR(50), -- 'youtube', 'loom', etc.
    is_published BOOLEAN DEFAULT false,
    publish_date TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_by INTEGER, -- User ID who created this article
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_edited_by INTEGER, -- User ID who last edited
    last_edited_at TIMESTAMP WITH TIME ZONE
);

-- Table: knowledge_article_sections
-- Subsections within articles for table of contents
CREATE TABLE IF NOT EXISTS knowledge_article_sections (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content JSONB, -- TipTap JSON content for this section
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: knowledge_attachments
-- File attachments (PDFs, images, brand assets)
CREATE TABLE IF NOT EXISTS knowledge_attachments (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES knowledge_collections(id) ON DELETE CASCADE, -- Can attach to collection too
    file_name VARCHAR(500) NOT NULL,
    file_path TEXT NOT NULL, -- S3 path or local path
    file_type VARCHAR(100), -- 'pdf', 'image', 'document', etc.
    file_size BIGINT, -- Size in bytes
    mime_type VARCHAR(255),
    description TEXT,
    display_order INTEGER DEFAULT 0,
    uploaded_by INTEGER, -- User ID who uploaded
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (article_id IS NOT NULL OR collection_id IS NOT NULL) -- Must attach to either article or collection
);

-- Table: knowledge_comments
-- Public comments on articles (visible to all users)
CREATE TABLE IF NOT EXISTS knowledge_comments (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES knowledge_comments(id) ON DELETE CASCADE, -- For threaded comments
    user_id INTEGER NOT NULL, -- User who posted comment
    user_name VARCHAR(255), -- Cached user name for display
    user_email VARCHAR(255), -- Cached user email
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT false,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: knowledge_questions
-- Private questions to franchisor (not visible to other franchisees)
CREATE TABLE IF NOT EXISTS knowledge_questions (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE SET NULL, -- Optional: question about specific article
    user_id INTEGER NOT NULL, -- Franchisee who asked
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    subject VARCHAR(500) NOT NULL,
    question TEXT NOT NULL,
    answer TEXT, -- Franchisor's response
    answered_by INTEGER, -- User ID who answered
    answered_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'open', -- 'open', 'answered', 'closed'
    priority VARCHAR(50) DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: knowledge_drafts
-- Franchisee-proposed articles awaiting approval
CREATE TABLE IF NOT EXISTS knowledge_drafts (
    id SERIAL PRIMARY KEY,
    collection_id INTEGER REFERENCES knowledge_collections(id) ON DELETE CASCADE,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE SET NULL, -- If editing existing article
    title VARCHAR(500) NOT NULL,
    summary TEXT,
    content JSONB NOT NULL, -- TipTap JSON content
    tags TEXT[],
    video_url TEXT,
    video_provider VARCHAR(50),
    proposed_by INTEGER NOT NULL, -- Franchisee user ID
    proposed_by_name VARCHAR(255),
    proposed_by_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'needs_revision'
    review_notes TEXT, -- Franchisor's feedback
    reviewed_by INTEGER, -- Franchisor user ID who reviewed
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table: knowledge_search_index
-- Full-text search index (fallback if Elasticsearch unavailable)
CREATE TABLE IF NOT EXISTS knowledge_search_index (
    id SERIAL PRIMARY KEY,
    article_id INTEGER REFERENCES knowledge_articles(id) ON DELETE CASCADE,
    collection_id INTEGER REFERENCES knowledge_collections(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT, -- Plain text extracted from TipTap JSON
    tags TEXT,
    search_vector tsvector, -- PostgreSQL full-text search vector
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (article_id IS NOT NULL OR collection_id IS NOT NULL)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_slug ON knowledge_collections(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_published ON knowledge_collections(is_published);
CREATE INDEX IF NOT EXISTS idx_knowledge_collections_display_order ON knowledge_collections(display_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_collection ON knowledge_articles(collection_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_slug ON knowledge_articles(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_published ON knowledge_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags ON knowledge_articles USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_display_order ON knowledge_articles(display_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_created_at ON knowledge_articles(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_sections_article ON knowledge_article_sections(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_sections_display_order ON knowledge_article_sections(display_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_attachments_article ON knowledge_attachments(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_attachments_collection ON knowledge_attachments(collection_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_attachments_display_order ON knowledge_attachments(display_order);

CREATE INDEX IF NOT EXISTS idx_knowledge_comments_article ON knowledge_comments(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_comments_parent ON knowledge_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_comments_created_at ON knowledge_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_questions_article ON knowledge_questions(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_questions_status ON knowledge_questions(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_questions_priority ON knowledge_questions(priority);
CREATE INDEX IF NOT EXISTS idx_knowledge_questions_created_at ON knowledge_questions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_knowledge_drafts_collection ON knowledge_drafts(collection_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_drafts_article ON knowledge_drafts(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_drafts_status ON knowledge_drafts(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_drafts_proposed_by ON knowledge_drafts(proposed_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_search_article ON knowledge_search_index(article_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_search_collection ON knowledge_search_index(collection_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_search_vector ON knowledge_search_index USING GIN(search_vector);

-- Comments on tables
COMMENT ON TABLE knowledge_collections IS 'Top-level categories for organizing knowledge content';
COMMENT ON TABLE knowledge_articles IS 'Individual articles with TipTap JSON content';
COMMENT ON TABLE knowledge_article_sections IS 'Article subsections for table of contents';
COMMENT ON TABLE knowledge_attachments IS 'File attachments (PDFs, images, brand assets)';
COMMENT ON TABLE knowledge_comments IS 'Public comments on articles (visible to all)';
COMMENT ON TABLE knowledge_questions IS 'Private questions to franchisor';
COMMENT ON TABLE knowledge_drafts IS 'Franchisee-proposed articles awaiting approval';
COMMENT ON TABLE knowledge_search_index IS 'Full-text search index fallback';

