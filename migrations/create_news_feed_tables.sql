-- News Feed System Migration
-- Creates tables for posts, comments, reactions, and related functionality

-- News feed posts table
CREATE TABLE IF NOT EXISTS news_feed_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id VARCHAR(255) NOT NULL, -- Can be user ID (integer) or email (string) for flexibility
  branch_id VARCHAR(50), -- 'main', 'westside', 'eastside', or NULL for HQ
  content TEXT NOT NULL,
  post_type VARCHAR(20) DEFAULT 'text', -- 'text', 'image', 'link', 'announcement'
  media_urls JSONB DEFAULT '[]'::jsonb,
  visibility_level VARCHAR(20) DEFAULT 'internal', -- 'internal', 'tutors', 'public'
  target_branches JSONB DEFAULT '[]'::jsonb, -- For branch-specific posts
  hashtags JSONB DEFAULT '[]'::jsonb,
  mentions JSONB DEFAULT '[]'::jsonb, -- Array of user IDs or emails
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- News feed comments table
CREATE TABLE IF NOT EXISTS news_feed_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES news_feed_posts(id) ON DELETE CASCADE,
  author_id VARCHAR(255) NOT NULL, -- Can be user ID (integer) or email (string) for flexibility
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- News feed reactions table
CREATE TABLE IF NOT EXISTS news_feed_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES news_feed_posts(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- Can be user ID (integer) or email (string) for flexibility
  reaction_type VARCHAR(20) DEFAULT 'like', -- 'like', 'love', 'celebrate', 'insight', etc.
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_author ON news_feed_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_branch ON news_feed_posts(branch_id);
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_visibility ON news_feed_posts(visibility_level);
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_created ON news_feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_deleted ON news_feed_posts(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_news_feed_comments_post ON news_feed_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_news_feed_comments_author ON news_feed_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_news_feed_comments_deleted ON news_feed_comments(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_news_feed_reactions_post ON news_feed_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_news_feed_reactions_user ON news_feed_reactions(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_news_feed_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_news_feed_posts_updated_at
  BEFORE UPDATE ON news_feed_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_news_feed_updated_at();

CREATE TRIGGER update_news_feed_comments_updated_at
  BEFORE UPDATE ON news_feed_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_news_feed_updated_at();

-- Add comments for documentation
COMMENT ON TABLE news_feed_posts IS 'Main posts in the company news feed';
COMMENT ON COLUMN news_feed_posts.visibility_level IS 'internal: operations team only, tutors: visible to tutors, public: everyone';
COMMENT ON COLUMN news_feed_posts.branch_id IS 'Branch identifier (main, westside, eastside) or NULL for HQ posts';
COMMENT ON TABLE news_feed_comments IS 'Comments on news feed posts';
COMMENT ON TABLE news_feed_reactions IS 'Reactions (likes, etc.) on news feed posts';

