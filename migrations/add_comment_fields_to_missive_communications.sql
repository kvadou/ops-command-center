-- Migration: Add comment fields to missive_communications table
-- This allows storing back office comments from Missive

ALTER TABLE missive_communications 
ADD COLUMN IF NOT EXISTS comment_text TEXT,
ADD COLUMN IF NOT EXISTS comment_author VARCHAR(255);

-- Add index for comment queries
CREATE INDEX IF NOT EXISTS idx_missive_communications_comment_author ON missive_communications(comment_author);
CREATE INDEX IF NOT EXISTS idx_missive_communications_comment_text ON missive_communications USING gin(to_tsvector('english', comment_text)) WHERE comment_text IS NOT NULL;

COMMENT ON COLUMN missive_communications.comment_text IS 'Full comment text for back office communications';
COMMENT ON COLUMN missive_communications.comment_author IS 'Comment author name/email for back office communications';

