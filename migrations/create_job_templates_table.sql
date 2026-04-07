-- Create job_templates table for storing TutorCruncher job templates
-- This table stores all template configurations, toggles, and defaults

CREATE TABLE IF NOT EXISTS job_templates (
  id SERIAL PRIMARY KEY,
  
  -- Template identification
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- 'Home', 'Club', 'School', 'Community', 'Online'
  
  -- Environment scoping
  environment VARCHAR(50) NOT NULL DEFAULT 'production', -- 'production', 'westside', 'eastside'
  
  -- Status flags
  is_active BOOLEAN DEFAULT true,
  is_archived BOOLEAN DEFAULT false,
  
  -- RBAC visibility
  visible_to_roles JSONB DEFAULT '["admin", "staff"]'::jsonb,
  
  -- Template configuration (all TutorCruncher service fields)
  template_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "job_type": "Home|Club|School|Community|Online",
  --   "title_format": "...",
  --   "colour": "...",
  --   "dft_charge_type": "hourly|flat",
  --   "dft_charge_rate": null|number,
  --   "dft_contractor_rate": null|number,
  --   "sr_premium": null|number,
  --   "dft_max_srs": null|number,
  --   "dft_contractor_permissions": "...",
  --   "auto_invoice": false,
  --   "require_rcr": false,
  --   "require_con_job": false,
  --   "status": "pending|in-progress|complete",
  --   "extra_attrs": {},
  --   "labels": [],
  --   "custom_fields": {}
  -- }
  
  -- Field visibility and requirements
  field_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "subject": {"visible": true, "required": true, "default": ""},
  --   "is_trial": {"visible": true, "required": false, "default": false},
  --   "location": {"visible": true, "required": true, "type": "input|dropdown|autofill"},
  --   "is_sibling": {"visible": true, "required": false},
  --   "is_group": {"visible": true, "required": false},
  --   "student_name_type": {"visible": true, "options": ["autofill_student", "autofill_client", "manual"]},
  --   "tutor_name": {"visible": true, "required": false, "type": "autofill"},
  --   "semester": {"visible": true, "required": false},
  --   "day_time": {"visible": true, "required": true},
  --   "duration": {"visible": true, "required": false},
  --   "age_group": {"visible": true, "required": false},
  --   "client_notes": {"visible": true, "required": false},
  --   "teaching_notes": {"visible": true, "required": false}
  -- }
  
  -- Brick configuration reference
  brick_enabled BOOLEAN DEFAULT true,
  
  -- Version history
  version INTEGER DEFAULT 1,
  version_history JSONB DEFAULT '[]'::jsonb,
  -- Structure: [{"version": 1, "updated_at": "...", "updated_by": "...", "changes": "..."}]
  
  -- Metadata
  created_by VARCHAR(255),
  updated_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  UNIQUE(name, environment)
);

-- Create index for faster lookups
CREATE INDEX idx_job_templates_environment ON job_templates(environment);
CREATE INDEX idx_job_templates_category ON job_templates(category);
CREATE INDEX idx_job_templates_active ON job_templates(is_active, is_archived);

-- Comments
COMMENT ON TABLE job_templates IS 'Stores TutorCruncher job creation templates with versioning and RBAC';
COMMENT ON COLUMN job_templates.template_config IS 'JSON configuration mapping to TutorCruncher service fields';
COMMENT ON COLUMN job_templates.field_config IS 'JSON configuration for form field visibility and requirements';
COMMENT ON COLUMN job_templates.version_history IS 'JSON array tracking all template versions and changes';

