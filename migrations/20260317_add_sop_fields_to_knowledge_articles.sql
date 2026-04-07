-- Add SOP-specific fields to knowledge_articles
-- article_type: 'article' (default) or 'sop'
-- sop_audience: array of ['franchisee', 'o&o', 'staff', 'all']

ALTER TABLE knowledge_articles
  ADD COLUMN IF NOT EXISTS article_type VARCHAR(20) DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS sop_version VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sop_owner VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sop_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sop_audience TEXT[] DEFAULT '{}';

-- Index for filtering SOPs
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_type ON knowledge_articles(article_type);
