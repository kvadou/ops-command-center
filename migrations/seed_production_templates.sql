-- Production Templates Seed File
-- This file contains all templates from the old system, matching exact configurations
-- Run this to populate templates in production

-- ============================================
-- PRIVATE HOME TEMPLATES - NYC
-- ============================================

-- Private Home 1:1 - NYC
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home 1:1 - NYC',
  'Private one-on-one home chess lesson in NYC',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - 1:1",
    "job_type": "New York",
    "subject": "Chess",
    "lesson_type": "Private 1:1",
    "lesson_dates": "Weekly Ongoing",
    "colour": "mediumorchid",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 119,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": false, "required": false},
    "is_group": {"visible": false, "required": false},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Private 1:1"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Group - NYC
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Group - NYC',
  'Private home group chess lesson in NYC',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Last Name 1/ Last Name 2/ etc - Chess - Home - 1:(# of kids)",
    "job_type": "New York",
    "subject": "Chess",
    "lesson_type": "Group 1:",
    "lesson_dates": "Weekly Ongoing",
    "colour": "Gold",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 84,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 10,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_group": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Group 1:"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Siblings 60 minutes - NYC
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Siblings 60 minutes - NYC',
  'Private home sibling lesson (60 min) in NYC',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - Sibling Split",
    "job_type": "New York",
    "subject": "Chess",
    "lesson_type": "Sib Split",
    "lesson_dates": "Weekly Ongoing",
    "colour": "mediumorchid",
    "dft_charge_type": "hourly-split",
    "dft_charge_rate": 140,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Sib Split"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Siblings 90 minutes - NYC
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Siblings 90 minutes - NYC',
  'Private home sibling lesson (90 min) in NYC',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - Sibling Split",
    "job_type": "New York",
    "subject": "Chess",
    "lesson_type": "Sib Split 90",
    "lesson_dates": "Weekly Ongoing",
    "colour": "mediumorchid",
    "dft_charge_type": "hourly-split",
    "dft_charge_rate": 119,
    "dft_contractor_rate": 40,
    "duration": "90",
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "90"},
    "lesson_type": {"visible": true, "required": false, "default": "Sib Split 90"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- ============================================
-- PRIVATE HOME TEMPLATES - LA
-- ============================================

-- Private Home 1:1 - LA
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home 1:1 - LA',
  'Private one-on-one home chess lesson in LA',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - 1:1",
    "job_type": "LA",
    "subject": "Chess",
    "lesson_type": "Private 1:1",
    "lesson_dates": "Weekly Ongoing",
    "colour": "Gold",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 119,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": false, "required": false},
    "is_group": {"visible": false, "required": false},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Private 1:1"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Group - LA
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Group - LA',
  'Private home group chess lesson in LA',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Last Name 1/ Last Name 2/ etc - Chess - Home - 1:(# of kids)",
    "job_type": "LA",
    "subject": "Chess",
    "lesson_type": "Group 1:",
    "lesson_dates": "Weekly Ongoing",
    "colour": "Gold",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 84,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 10,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_group": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Group 1:"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Siblings 60 minutes - LA
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Siblings 60 minutes - LA',
  'Private home sibling lesson (60 min) in LA',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - Sibling Split",
    "job_type": "LA",
    "subject": "Chess",
    "lesson_type": "Sib Split",
    "lesson_dates": "Weekly Ongoing",
    "colour": "Gold",
    "dft_charge_type": "hourly-split",
    "dft_charge_rate": 140,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Sib Split"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Home Siblings 90 minutes - LA
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Home Siblings 90 minutes - LA',
  'Private home sibling lesson (90 min) in LA',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Home - Sibling Split",
    "job_type": "LA",
    "subject": "Chess",
    "lesson_type": "Sib Split 90",
    "lesson_dates": "Weekly Ongoing",
    "colour": "Gold",
    "dft_charge_type": "hourly-split",
    "dft_charge_rate": 119,
    "dft_contractor_rate": 40,
    "duration": "90",
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "90"},
    "lesson_type": {"visible": true, "required": false, "default": "Sib Split 90"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- ============================================
-- PRIVATE ONLINE TEMPLATES
-- ============================================

-- Private Online 1:1
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Online 1:1',
  'Private one-on-one online chess lesson',
  'Online',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Online - 1:1",
    "job_type": "Online",
    "subject": "Chess",
    "lesson_type": "Private 1:1",
    "lesson_dates": "Weekly Ongoing",
    "colour": "LightGreen",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 59,
    "dft_contractor_rate": 30,
    "duration": "45-60",
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": false, "required": false},
    "is_group": {"visible": false, "required": false},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Private 1:1"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Online Group
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Online Group',
  'Private online group chess lesson',
  'Online',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Last Name 1/ Last Name 2 / etc - Chess - Online - 1:(# of kids)",
    "job_type": "Online",
    "subject": "Chess",
    "lesson_type": "Group 1:",
    "lesson_dates": "Weekly Ongoing",
    "colour": "LightGreen",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 40,
    "dft_contractor_rate": 40,
    "duration": "45-60",
    "dft_max_srs": 10,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_group": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Group 1:"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Private Online Siblings
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Private Online Siblings',
  'Private online sibling chess lesson',
  'Online',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Online - Sibling Split",
    "job_type": "Online",
    "subject": "Chess",
    "lesson_type": "Sib Split",
    "lesson_dates": "Weekly Ongoing",
    "colour": "LightGreen",
    "dft_charge_type": "hourly-split",
    "dft_charge_rate": 40,
    "dft_contractor_rate": 30,
    "duration": "45-60",
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "duration": {"visible": true, "required": false, "default": "45-60"},
    "lesson_type": {"visible": true, "required": false, "default": "Sib Split"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- ============================================
-- CLUB TEMPLATES
-- ============================================

-- Club - Park Slope
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Club - Park Slope',
  'Chess club session at Park Slope',
  'Club',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Class Level (Module) // Day Time // Park Slope",
    "job_type": "Club",
    "subject": "Chess",
    "lesson_type": "60 minute, 45 minute",
    "colour": "DodgerBlue",
    "dft_charge_type": "one-off",
    "dft_charge_rate": 0,
    "dft_contractor_rate": 40,
    "dft_max_srs": 12,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "class_name": {"visible": true, "required": true},
    "location": {"visible": true, "required": true, "default": "Park Slope"},
    "day_of_week": {"visible": true, "required": true},
    "time": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "age_group": {"visible": true, "required": false},
    "lesson_type": {"visible": true, "required": false, "default": "60 minute, 45 minute"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Club - UES
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Club - UES',
  'Chess club session at Upper East Side',
  'Club',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Class Level (Module) // Day Time // UES",
    "job_type": "Club",
    "subject": "Chess",
    "lesson_type": "60 minute, 45 minute",
    "colour": "DodgerBlue",
    "dft_charge_type": "one-off",
    "dft_charge_rate": 0,
    "dft_contractor_rate": 40,
    "dft_max_srs": 12,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "class_name": {"visible": true, "required": true},
    "location": {"visible": true, "required": true, "default": "UES"},
    "day_of_week": {"visible": true, "required": true},
    "time": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "age_group": {"visible": true, "required": false},
    "lesson_type": {"visible": true, "required": false, "default": "60 minute, 45 minute"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- ============================================
-- SCHOOL TEMPLATES
-- ============================================

-- School
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'School',
  'School chess program',
  'School',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "School Name // Subject // Season Year // Day of Class Time of Class",
    "job_type": "School",
    "subject": "Chess",
    "lesson_type": "60 minute, 45 minute",
    "colour": "Orange",
    "dft_charge_type": "one-off",
    "dft_charge_rate": 0,
    "dft_contractor_rate": 40,
    "dft_max_srs": 15,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": true,
    "status": "in_progress"
  }'::jsonb,
  '{
    "school_name": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "semester": {"visible": true, "required": true},
    "section": {"visible": true, "required": true},
    "age_group": {"visible": true, "required": false},
    "day_of_week": {"visible": true, "required": false},
    "time": {"visible": true, "required": false},
    "lesson_type": {"visible": true, "required": false, "default": "60 minute, 45 minute"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- ============================================
-- HAMPTONS TEMPLATES
-- ============================================

-- Hamptons
INSERT INTO job_templates (
  name, 
  description, 
  category, 
  environment,
  visible_to_roles,
  template_config,
  field_config,
  brick_enabled,
  created_by,
  updated_by
) VALUES (
  'Hamptons',
  'Private home chess lesson in Hamptons',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_name_template": "Client First Name_Client Last Name - Chess - Hamptons - 1:1",
    "job_type": "New York",
    "subject": "Chess",
    "lesson_type": "Private 1:1",
    "lesson_dates": "Weekly Ongoing",
    "colour": "blanchedalmond",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 150,
    "dft_contractor_rate": 40,
    "duration": "60",
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "in_progress"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": false, "required": false},
    "is_group": {"visible": false, "required": false},
    "duration": {"visible": true, "required": false, "default": "60"},
    "lesson_type": {"visible": true, "required": false, "default": "Private 1:1"}
  }'::jsonb,
  true,
  'system',
  'system'
) ON CONFLICT (name, environment) DO NOTHING;

-- Print summary
SELECT 
  category,
  COUNT(*) as template_count
FROM job_templates
WHERE environment = 'production'
GROUP BY category
ORDER BY category;

-- Verify templates created
SELECT 
  id,
  name,
  category,
  environment,
  brick_enabled,
  created_at
FROM job_templates
WHERE environment = 'production'
ORDER BY category, name;

