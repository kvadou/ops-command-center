-- News Feed System Enhancement Migration
-- Adds rich content, moderation, polls, events, and threaded comments support
-- Run this migration on all environments: local, staging, production, westside, eastside

-- ============================================
-- PHASE 1: Enhance news_feed_posts table
-- ============================================

-- Add rich content columns
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS content_json JSONB;

-- Add post feature flags
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS is_announcement BOOLEAN DEFAULT FALSE;

-- Add moderation columns
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS requires_moderation BOOLEAN DEFAULT FALSE;
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'approved';
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS moderated_by VARCHAR(255);
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP;
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS moderation_notes TEXT;

-- Add poll support
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS poll_data JSONB;
-- poll_data structure: {
--   "question": "What day works best?",
--   "options": ["Monday", "Tuesday", "Wednesday"],
--   "multiple_choice": false,
--   "ends_at": "2025-12-31T23:59:59Z"
-- }

-- Add event support
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS event_data JSONB;
-- event_data structure: {
--   "title": "Team Meeting",
--   "description": "Monthly all-hands",
--   "start_date": "2025-12-15T10:00:00Z",
--   "end_date": "2025-12-15T11:00:00Z",
--   "location": "Zoom",
--   "link": "https://zoom.us/..."
-- }

-- Add link preview data
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS link_preview JSONB;
-- link_preview structure: {
--   "url": "https://example.com",
--   "title": "Page Title",
--   "description": "Page description",
--   "image": "https://example.com/og-image.jpg",
--   "site_name": "Example"
-- }

-- Add location tagging
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS location_tag VARCHAR(255);

-- Expand visibility_level to support new audience types
-- Values: 'hq_only', 'franchisees', 'franchise_specific', 'tutors', 'parents', 'public', 'internal' (legacy)
COMMENT ON COLUMN news_feed_posts.visibility_level IS 'Audience visibility: hq_only, franchisees, franchise_specific, tutors, parents, public, internal';

-- Add author type for different posting sources
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS author_type VARCHAR(50) DEFAULT 'staff';
-- Values: 'hq_admin', 'franchisee', 'tutor', 'parent', 'staff', 'system'

-- Add engagement metrics cache (for performance)
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS reaction_count_cache INTEGER DEFAULT 0;
ALTER TABLE news_feed_posts ADD COLUMN IF NOT EXISTS comment_count_cache INTEGER DEFAULT 0;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_pinned ON news_feed_posts(is_pinned) WHERE is_pinned = TRUE;
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_announcement ON news_feed_posts(is_announcement) WHERE is_announcement = TRUE;
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_moderation ON news_feed_posts(moderation_status);
CREATE INDEX IF NOT EXISTS idx_news_feed_posts_author_type ON news_feed_posts(author_type);

-- ============================================
-- PHASE 2: Create comment replies table (threaded comments)
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_comment_replies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_comment_id UUID NOT NULL REFERENCES news_feed_comments(id) ON DELETE CASCADE,
    author_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    content_html TEXT,
    mentions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_comment_replies_parent ON news_feed_comment_replies(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_author ON news_feed_comment_replies(author_id);
CREATE INDEX IF NOT EXISTS idx_comment_replies_deleted ON news_feed_comment_replies(deleted_at) WHERE deleted_at IS NULL;

-- Add trigger for updated_at
CREATE TRIGGER update_comment_replies_updated_at
    BEFORE UPDATE ON news_feed_comment_replies
    FOR EACH ROW
    EXECUTE FUNCTION update_news_feed_updated_at();

-- ============================================
-- PHASE 3: Create comment reactions table
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES news_feed_comments(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    reaction_type VARCHAR(20) DEFAULT 'like',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON news_feed_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_user ON news_feed_comment_reactions(user_id);

-- ============================================
-- PHASE 4: Create poll votes table
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES news_feed_posts(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    option_index INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(post_id, user_id, option_index)
);

CREATE INDEX IF NOT EXISTS idx_poll_votes_post ON news_feed_poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON news_feed_poll_votes(user_id);

-- ============================================
-- PHASE 5: Create post reports table
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES news_feed_posts(id) ON DELETE CASCADE,
    comment_id UUID REFERENCES news_feed_comments(id) ON DELETE CASCADE,
    reporter_id VARCHAR(255) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    details TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Either post_id or comment_id must be set
    CONSTRAINT report_target_check CHECK (
        (post_id IS NOT NULL AND comment_id IS NULL) OR 
        (post_id IS NULL AND comment_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_reports_post ON news_feed_reports(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_comment ON news_feed_reports(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_status ON news_feed_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON news_feed_reports(reporter_id);

COMMENT ON TABLE news_feed_reports IS 'User reports for posts and comments requiring moderation review';

-- ============================================
-- PHASE 6: Create moderation log table
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_moderation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES news_feed_posts(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES news_feed_comments(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    actor_id VARCHAR(255) NOT NULL,
    reason TEXT,
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_log_post ON news_feed_moderation_log(post_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_actor ON news_feed_moderation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_moderation_log_action ON news_feed_moderation_log(action);
CREATE INDEX IF NOT EXISTS idx_moderation_log_created ON news_feed_moderation_log(created_at DESC);

COMMENT ON TABLE news_feed_moderation_log IS 'Audit trail for all moderation actions taken on posts and comments';

-- ============================================
-- PHASE 7: Add rich content to comments
-- ============================================

ALTER TABLE news_feed_comments ADD COLUMN IF NOT EXISTS content_html TEXT;
ALTER TABLE news_feed_comments ADD COLUMN IF NOT EXISTS reaction_count_cache INTEGER DEFAULT 0;
ALTER TABLE news_feed_comments ADD COLUMN IF NOT EXISTS reply_count_cache INTEGER DEFAULT 0;

-- ============================================
-- PHASE 8: Create user shadow ban table
-- ============================================

CREATE TABLE IF NOT EXISTS news_feed_shadow_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL UNIQUE,
    banned_by VARCHAR(255) NOT NULL,
    reason TEXT,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shadow_bans_user ON news_feed_shadow_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_shadow_bans_expires ON news_feed_shadow_bans(expires_at) WHERE expires_at IS NOT NULL;

COMMENT ON TABLE news_feed_shadow_bans IS 'Shadow-banned users can still post but their content is only visible to themselves';

-- ============================================
-- Documentation
-- ============================================

COMMENT ON TABLE news_feed_posts IS 'Main posts in the company news feed with rich content, polls, events, and moderation support';
COMMENT ON COLUMN news_feed_posts.content_html IS 'Rendered HTML output from Tiptap editor';
COMMENT ON COLUMN news_feed_posts.content_json IS 'Tiptap JSON document for editing';
COMMENT ON COLUMN news_feed_posts.moderation_status IS 'Status: pending, approved, rejected';
COMMENT ON COLUMN news_feed_posts.poll_data IS 'Poll configuration and options as JSONB';
COMMENT ON COLUMN news_feed_posts.event_data IS 'Event details (title, date, location) as JSONB';
COMMENT ON TABLE news_feed_comment_replies IS 'Threaded replies to comments (one level deep)';
COMMENT ON TABLE news_feed_poll_votes IS 'User votes on post polls';

