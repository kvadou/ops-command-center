-- Migration: Add content_blocks column and quiz_attempts table for Curriculum Editor
-- Run: psql $DATABASE_URL -f migrations/add_curriculum_editor_tables.sql

-- Add content_blocks column to academy_modules
ALTER TABLE academy_modules
ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]';

-- Migrate existing content to content_blocks format (only if content exists and content_blocks is empty)
UPDATE academy_modules
SET content_blocks = CASE
  WHEN content IS NOT NULL AND content::text != '{}' AND content::text != 'null' AND content::text != ''
  THEN jsonb_build_array(jsonb_build_object(
    'id', 'block_' || id::text || '_migrated',
    'type', 'text',
    'title', '',
    'content', COALESCE(content->>'html', content::text)
  ))
  ELSE '[]'::jsonb
END
WHERE (content_blocks IS NULL OR content_blocks = '[]'::jsonb)
  AND content IS NOT NULL
  AND content::text NOT IN ('{}', 'null', '');

-- Create quiz attempts table
CREATE TABLE IF NOT EXISTS academy_quiz_attempts (
  id SERIAL PRIMARY KEY,
  franchise_id VARCHAR(50) NOT NULL,
  module_id INT REFERENCES academy_modules(id) ON DELETE CASCADE,
  block_id VARCHAR(100) NOT NULL,
  answers JSONB NOT NULL DEFAULT '[]',
  score INT NOT NULL DEFAULT 0,
  max_score INT NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  attempted_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_franchise ON academy_quiz_attempts(franchise_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_module ON academy_quiz_attempts(module_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_block ON academy_quiz_attempts(block_id);

-- Verify migration
DO $$
BEGIN
  RAISE NOTICE 'Migration complete. content_blocks column added to academy_modules, academy_quiz_attempts table created.';
END $$;
