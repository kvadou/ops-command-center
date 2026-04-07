-- Subitems Migration
-- Adds support for nested tasks (parent-child relationships)

-- Add parent_item_id column to task_items
ALTER TABLE task_items 
ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES task_items(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_task_items_parent ON task_items(parent_item_id) WHERE parent_item_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN task_items.parent_item_id IS 'Parent task item ID for nested tasks (subitems)';
