-- Create brick_configurations table for storing Brick layout and formatting
-- Each template can have a unique Brick configuration

CREATE TABLE IF NOT EXISTS brick_configurations (
  id SERIAL PRIMARY KEY,
  
  -- Link to template
  template_id INTEGER NOT NULL,
  
  -- Brick structure
  brick_layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Structure: [
  --   {"type": "variable", "key": "client_first_name", "label": "Client First Name", "format": "text"},
  --   {"type": "variable", "key": "address", "label": "Address", "format": "text"},
  --   {"type": "label", "text": "Home - NYC - Chess", "bold": false},
  --   {"type": "variable", "key": "is_trial", "label": "TRIAL", "format": "conditional_text", "show_if_true": true, "style": "bold_caps"},
  --   {"type": "variable", "key": "duration", "label": "Duration", "format": "text", "prefix": "Duration: "},
  --   {"type": "section", "title": "Availability", "content": "availability_variable"},
  --   {"type": "custom", "key": "custom_field_1", "label": "Custom Field", "default": ""}
  -- ]
  
  -- Formatting options
  formatting_options JSONB DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "line_spacing": 1,
  --   "section_spacing": 2,
  --   "bold_headers": true,
  --   "caps_trial": true
  -- }
  
  -- Variable mappings
  variable_mappings JSONB DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "client_first_name": {"source": "tutorcruncher", "path": "client.first_name", "fallback": ""},
  --   "address": {"source": "tutorcruncher", "path": "client.address", "fallback": ""},
  --   "subject": {"source": "form", "field": "subject"},
  --   "is_trial": {"source": "form", "field": "is_trial", "type": "boolean"},
  --   "custom_field_1": {"source": "custom", "default": "Custom value"}
  -- }
  
  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Foreign key constraint
  CONSTRAINT fk_template
    FOREIGN KEY (template_id)
    REFERENCES job_templates(id)
    ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX idx_brick_configurations_template ON brick_configurations(template_id);

-- Comments
COMMENT ON TABLE brick_configurations IS 'Stores Brick layout configuration for each job template';
COMMENT ON COLUMN brick_configurations.brick_layout IS 'Ordered array of Brick elements with formatting metadata';
COMMENT ON COLUMN brick_configurations.variable_mappings IS 'Maps Brick variables to data sources (TutorCruncher, form, custom)';

