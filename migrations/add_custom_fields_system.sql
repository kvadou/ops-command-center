-- Custom Fields System Migration
-- Adds support for custom fields/columns on task boards (like Monday.com columns)

-- Custom field definitions (one per board)
CREATE TABLE IF NOT EXISTS task_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES task_boards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- 'text', 'number', 'date', 'status', 'people', 'tags', 'checkbox', 'rating', 'link', 'file', 'formula', 'relation'
  field_subtype VARCHAR(50), -- For text: 'short', 'long', 'rich'; For number: 'integer', 'decimal', 'currency'; For date: 'date', 'datetime'
  position INTEGER DEFAULT 0, -- Column position in views
  is_required BOOLEAN DEFAULT FALSE,
  default_value TEXT, -- Default value for the field
  field_config JSONB DEFAULT '{}'::jsonb, -- Type-specific configuration
  -- For status fields: {"options": [{"label": "Done", "color": "#00c875"}, ...]}
  -- For people fields: {"multiple": true}
  -- For tags fields: {"options": ["tag1", "tag2", ...]}
  -- For rating fields: {"max": 5}
  -- For formula fields: {"formula": "SUM(field1, field2)"}
  -- For relation fields: {"related_board_id": "uuid", "relation_type": "one_to_many"}
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL,
  UNIQUE(board_id, name, deleted_at) -- Unique name per board (when not deleted)
);

-- Field values for each task item
CREATE TABLE IF NOT EXISTS task_item_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES task_custom_fields(id) ON DELETE CASCADE,
  text_value TEXT, -- For text fields
  number_value NUMERIC, -- For number fields
  date_value TIMESTAMP, -- For date/datetime fields
  boolean_value BOOLEAN, -- For checkbox fields
  json_value JSONB, -- For complex fields (status, people, tags, relations, etc.)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(item_id, field_id) -- One value per field per item
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_task_custom_fields_board ON task_custom_fields(board_id);
CREATE INDEX IF NOT EXISTS idx_task_custom_fields_position ON task_custom_fields(board_id, position) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_custom_fields_type ON task_custom_fields(field_type);
CREATE INDEX IF NOT EXISTS idx_task_custom_fields_deleted ON task_custom_fields(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_task_item_field_values_item ON task_item_field_values(item_id);
CREATE INDEX IF NOT EXISTS idx_task_item_field_values_field ON task_item_field_values(field_id);
CREATE INDEX IF NOT EXISTS idx_task_item_field_values_text ON task_item_field_values(text_value) WHERE text_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_item_field_values_number ON task_item_field_values(number_value) WHERE number_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_item_field_values_date ON task_item_field_values(date_value) WHERE date_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_task_item_field_values_boolean ON task_item_field_values(boolean_value) WHERE boolean_value IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_task_custom_fields_updated_at
  BEFORE UPDATE ON task_custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

CREATE TRIGGER update_task_item_field_values_updated_at
  BEFORE UPDATE ON task_item_field_values
  FOR EACH ROW
  EXECUTE FUNCTION update_task_updated_at();

-- Comments for documentation
COMMENT ON TABLE task_custom_fields IS 'Custom field definitions for task boards (like Monday.com columns)';
COMMENT ON TABLE task_item_field_values IS 'Values for custom fields on task items';
COMMENT ON COLUMN task_custom_fields.field_type IS 'Type of field: text, number, date, status, people, tags, checkbox, rating, link, file, formula, relation';
COMMENT ON COLUMN task_custom_fields.field_config IS 'Type-specific configuration (options, colors, formulas, etc.)';
