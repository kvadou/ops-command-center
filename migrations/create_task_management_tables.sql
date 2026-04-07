-- Task Management System Migration
-- Creates tables for Monday.com-style task management

-- Task boards (like Monday.com boards)
CREATE TABLE IF NOT EXISTS task_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  board_type VARCHAR(50) DEFAULT 'kanban', -- 'kanban', 'list', 'timeline', 'calendar'
  branch_id VARCHAR(50), -- 'main', 'westside', 'eastside', or NULL for HQ
  owner_id VARCHAR(255), -- User ID or email
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Task groups (like Monday.com groups - containers for items)
CREATE TABLE IF NOT EXISTS task_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position INTEGER DEFAULT 0, -- For ordering groups
  color VARCHAR(50), -- Group color
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Task items (like Monday.com items)
CREATE TABLE IF NOT EXISTS task_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES task_groups(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'todo', -- 'todo', 'in_progress', 'done', 'blocked', 'cancelled'
  priority VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  due_date TIMESTAMP,
  start_date TIMESTAMP,
  assignee_id VARCHAR(255), -- User ID or email
  creator_id VARCHAR(255) NOT NULL, -- User ID or email
  position INTEGER DEFAULT 0, -- For ordering items within group
  tags JSONB DEFAULT '[]'::jsonb,
  custom_fields JSONB DEFAULT '{}'::jsonb, -- Flexible custom fields
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL
);

-- Task comments
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES task_comments(id) ON DELETE CASCADE, -- For threaded replies
  author_id VARCHAR(255) NOT NULL, -- User ID or email
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Comment reactions
CREATE TABLE IF NOT EXISTS task_comment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- User ID or email
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(comment_id, user_id, emoji) -- One reaction per user per emoji per comment
);

-- Task updates/activity log (like Monday.com updates)
CREATE TABLE IF NOT EXISTS task_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  author_id VARCHAR(255) NOT NULL, -- User ID or email
  update_type VARCHAR(50) NOT NULL, -- 'status_change', 'assignee_change', 'comment', 'field_update', etc.
  old_value TEXT,
  new_value TEXT,
  field_name VARCHAR(100), -- Which field was updated
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task subscribers (users watching/following a task)
CREATE TABLE IF NOT EXISTS task_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL, -- User ID or email
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_id, user_id)
);

-- Task dependencies (item A depends on item B)
CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  depends_on_item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_id, depends_on_item_id),
  CHECK (item_id != depends_on_item_id) -- Prevent self-dependency
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_boards_branch ON task_boards(branch_id);
CREATE INDEX IF NOT EXISTS idx_task_boards_owner ON task_boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_boards_deleted ON task_boards(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_groups_board ON task_groups(board_id);
CREATE INDEX IF NOT EXISTS idx_task_groups_position ON task_groups(board_id, position);
CREATE INDEX IF NOT EXISTS idx_task_groups_deleted ON task_groups(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_items_board ON task_items(board_id);
CREATE INDEX IF NOT EXISTS idx_task_items_group ON task_items(group_id);
CREATE INDEX IF NOT EXISTS idx_task_items_status ON task_items(status);
CREATE INDEX IF NOT EXISTS idx_task_items_assignee ON task_items(assignee_id);
CREATE INDEX IF NOT EXISTS idx_task_items_due_date ON task_items(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_items_position ON task_items(group_id, position);
CREATE INDEX IF NOT EXISTS idx_task_items_deleted ON task_items(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_item ON task_comments(item_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent ON task_comments(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_deleted ON task_comments(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_comment ON task_comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_user ON task_comment_reactions(user_id);

CREATE INDEX IF NOT EXISTS idx_task_updates_item ON task_updates(item_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_author ON task_updates(author_id);
CREATE INDEX IF NOT EXISTS idx_task_updates_type ON task_updates(update_type);
CREATE INDEX IF NOT EXISTS idx_task_updates_created ON task_updates(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_subscribers_item ON task_subscribers(item_id);
CREATE INDEX IF NOT EXISTS idx_task_subscribers_user ON task_subscribers(user_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_item ON task_dependencies(item_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON task_dependencies(depends_on_item_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_task_boards_updated_at
  BEFORE UPDATE ON task_boards
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

CREATE TRIGGER update_task_groups_updated_at
  BEFORE UPDATE ON task_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

CREATE TRIGGER update_task_items_updated_at
  BEFORE UPDATE ON task_items
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

CREATE TRIGGER update_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

-- Trigger to set completed_at when status changes to 'done'
CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'done' AND OLD.status = 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_task_items_completed_at
  BEFORE UPDATE ON task_items
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();

-- Trigger to create update log entry when task is modified
CREATE OR REPLACE FUNCTION log_task_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Log status changes
  IF NEW.status != OLD.status THEN
    INSERT INTO task_updates (item_id, author_id, update_type, old_value, new_value, field_name)
    VALUES (NEW.id, NEW.creator_id, 'status_change', OLD.status, NEW.status, 'status');
  END IF;
  
  -- Log assignee changes
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO task_updates (item_id, author_id, update_type, old_value, new_value, field_name)
    VALUES (NEW.id, NEW.creator_id, 'assignee_change', OLD.assignee_id, NEW.assignee_id, 'assignee_id');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER log_task_items_updates
  AFTER UPDATE ON task_items
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id)
  EXECUTE FUNCTION log_task_update();

-- Add comments for documentation
COMMENT ON TABLE task_boards IS 'Task boards (like Monday.com boards)';
COMMENT ON TABLE task_groups IS 'Task groups (containers for items within a board)';
COMMENT ON TABLE task_items IS 'Individual task items';
COMMENT ON TABLE task_comments IS 'Comments on task items';
COMMENT ON TABLE task_updates IS 'Activity log for task changes';
COMMENT ON TABLE task_subscribers IS 'Users watching/following tasks';
COMMENT ON TABLE task_dependencies IS 'Task dependencies (item A depends on item B)';

