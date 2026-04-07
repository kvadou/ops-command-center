-- Migration: Add Embedded Checklist Progress Table
-- Tracks completion of checklist items embedded in document content blocks
-- Unlike academy_checklist_items (for checklist-type modules), this tracks
-- checklists that are embedded inside document-type modules as content blocks.

CREATE TABLE IF NOT EXISTS academy_embedded_checklist_progress (
  id SERIAL PRIMARY KEY,
  franchise_id VARCHAR(50) NOT NULL,
  module_id INT NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  block_id VARCHAR(100) NOT NULL,  -- The content block ID containing the checklist
  item_index INT NOT NULL,          -- Index of the item within the checklist
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by_name VARCHAR(255),
  completed_by_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(franchise_id, module_id, block_id, item_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_embedded_checklist_progress_franchise_id
  ON academy_embedded_checklist_progress(franchise_id);
CREATE INDEX IF NOT EXISTS idx_embedded_checklist_progress_module_id
  ON academy_embedded_checklist_progress(module_id);
CREATE INDEX IF NOT EXISTS idx_embedded_checklist_progress_lookup
  ON academy_embedded_checklist_progress(franchise_id, module_id);

COMMENT ON TABLE academy_embedded_checklist_progress IS 'Tracks completion of checklist items embedded in document module content blocks';
