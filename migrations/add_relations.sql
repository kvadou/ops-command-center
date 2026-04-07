-- Relations Migration
-- Adds support for linking tasks to other items and external resources

-- Item relations table
CREATE TABLE IF NOT EXISTS task_item_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  related_item_id UUID REFERENCES task_items(id) ON DELETE CASCADE, -- Link to another task item
  related_board_id UUID REFERENCES task_boards(id) ON DELETE CASCADE, -- Link to a board
  relation_type VARCHAR(50) DEFAULT 'link', -- 'link', 'blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by'
  external_url TEXT, -- For external links
  external_title TEXT, -- Title for external links
  created_by VARCHAR(255) NOT NULL, -- User ID or email
  created_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_item_relations_item ON task_item_relations(item_id);
CREATE INDEX IF NOT EXISTS idx_task_item_relations_related_item ON task_item_relations(related_item_id);
CREATE INDEX IF NOT EXISTS idx_task_item_relations_type ON task_item_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_task_item_relations_deleted ON task_item_relations(deleted_at) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE task_item_relations IS 'Relations between task items (links, blocks, duplicates, etc.)';
COMMENT ON COLUMN task_item_relations.relation_type IS 'Type of relation: link, blocks, blocked_by, relates_to, duplicates, duplicated_by';
