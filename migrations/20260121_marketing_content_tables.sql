-- Marketing Content Tables
-- Blog drafts with approval workflow and Instagram post management

-- Blog drafts with approval workflow
CREATE TABLE IF NOT EXISTS marketing_blog_drafts (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(255),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'rejected', 'archived')),
  content_markdown TEXT,
  content_html TEXT,
  seo_title VARCHAR(255),
  seo_description TEXT,
  keywords JSONB DEFAULT '[]',
  target_audience VARCHAR(255),
  ai_prompt TEXT,
  webflow_compatible_html TEXT,
  created_by VARCHAR(255),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Instagram posts (all types)
CREATE TABLE IF NOT EXISTS marketing_instagram_posts (
  id SERIAL PRIMARY KEY,
  post_type VARCHAR(20) NOT NULL CHECK (post_type IN ('image', 'carousel', 'reel', 'story')),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'archived')),
  caption TEXT,
  hashtags JSONB DEFAULT '[]',
  media_urls JSONB DEFAULT '[]',
  media_files JSONB DEFAULT '[]',
  scheduled_at TIMESTAMP,
  published_at TIMESTAMP,
  instagram_post_id VARCHAR(255),
  instagram_permalink TEXT,
  ai_generated_caption TEXT,
  ai_generated_hashtags JSONB DEFAULT '[]',
  created_by VARCHAR(255),
  approved_by VARCHAR(255),
  approved_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content calendar for scheduling all content types
CREATE TABLE IF NOT EXISTS marketing_content_calendar (
  id SERIAL PRIMARY KEY,
  content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('blog', 'instagram', 'campaign', 'email')),
  content_id INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  time_slot TIME,
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'cancelled')),
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Extend campaign drafts for full creation
ALTER TABLE marketing_campaign_drafts ADD COLUMN IF NOT EXISTS targeting_config JSONB DEFAULT '{}';
ALTER TABLE marketing_campaign_drafts ADD COLUMN IF NOT EXISTS creative_assets JSONB DEFAULT '[]';
ALTER TABLE marketing_campaign_drafts ADD COLUMN IF NOT EXISTS budget_config JSONB DEFAULT '{}';
ALTER TABLE marketing_campaign_drafts ADD COLUMN IF NOT EXISTS objective VARCHAR(100);

-- Indexes for blog drafts
CREATE INDEX IF NOT EXISTS idx_marketing_blog_drafts_status ON marketing_blog_drafts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_blog_drafts_slug ON marketing_blog_drafts(slug);
CREATE INDEX IF NOT EXISTS idx_marketing_blog_drafts_created_at ON marketing_blog_drafts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_blog_drafts_updated_at ON marketing_blog_drafts(updated_at DESC);

-- Indexes for Instagram posts
CREATE INDEX IF NOT EXISTS idx_marketing_instagram_posts_status ON marketing_instagram_posts(status);
CREATE INDEX IF NOT EXISTS idx_marketing_instagram_posts_post_type ON marketing_instagram_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_marketing_instagram_posts_scheduled_at ON marketing_instagram_posts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_marketing_instagram_posts_created_at ON marketing_instagram_posts(created_at DESC);

-- Indexes for content calendar
CREATE INDEX IF NOT EXISTS idx_marketing_content_calendar_date ON marketing_content_calendar(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_marketing_content_calendar_type ON marketing_content_calendar(content_type);
CREATE INDEX IF NOT EXISTS idx_marketing_content_calendar_status ON marketing_content_calendar(status);
