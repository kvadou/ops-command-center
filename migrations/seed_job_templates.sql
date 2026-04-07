-- Seed Data for Job Builder Templates
-- This file contains example templates for each job category

-- ============================================
-- HOME TEMPLATES
-- ============================================

-- Home - 1:1 Session
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
  'Home - 1:1 Session',
  'Standard one-on-one home chess lesson',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Home",
    "colour": "Blue",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 75,
    "dft_contractor_rate": 45,
    "sr_premium": 10,
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false},
    "is_group": {"visible": true, "required": false},
    "student_name": {"visible": true, "required": true, "type": "autofill"},
    "client_notes": {"visible": true, "required": false},
    "teaching_notes": {"visible": true, "required": false},
    "duration": {"visible": true, "required": false, "default": "45-60 minutes"},
    "availability": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- Home - Sibling Session
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
  'Home - Sibling Session',
  'Home lesson for siblings',
  'Home',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Home",
    "colour": "Purple",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 90,
    "dft_contractor_rate": 50,
    "sr_premium": 10,
    "dft_max_srs": 2,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false},
    "is_sibling": {"visible": true, "required": false, "default": true},
    "client_notes": {"visible": true, "required": false},
    "teaching_notes": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- ============================================
-- SCHOOL TEMPLATES
-- ============================================

-- School - Fall Semester
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
  'School - Fall Semester',
  'Standard school chess program for fall semester',
  'School',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "School",
    "colour": "Green",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 50,
    "dft_contractor_rate": 35,
    "dft_max_srs": 15,
    "sr_premium": 0,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": true,
    "status": "pending"
  }'::jsonb,
  '{
    "school_name": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "semester": {"visible": true, "required": true, "default": "Fall 2025"},
    "section": {"visible": true, "required": true},
    "age_group": {"visible": true, "required": false},
    "num_students": {"visible": true, "required": false},
    "teaching_notes": {"visible": true, "required": false},
    "lesson_dates": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- School - Spring Semester
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
  'School - Spring Semester',
  'Standard school chess program for spring semester',
  'School',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "School",
    "colour": "Green",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 50,
    "dft_contractor_rate": 35,
    "dft_max_srs": 15,
    "sr_premium": 0,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": true,
    "status": "pending"
  }'::jsonb,
  '{
    "school_name": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "semester": {"visible": true, "required": true, "default": "Spring 2026"},
    "section": {"visible": true, "required": true},
    "age_group": {"visible": true, "required": false},
    "num_students": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- ============================================
-- CLUB TEMPLATES
-- ============================================

-- UES Club Session
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
  'UES Club Session',
  'Upper East Side club chess program',
  'Club',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Club",
    "colour": "Orange",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 40,
    "dft_contractor_rate": 30,
    "dft_max_srs": 12,
    "sr_premium": 0,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "class_name": {"visible": true, "required": true},
    "location": {"visible": true, "required": true, "default": "UES"},
    "day_of_week": {"visible": true, "required": true},
    "time": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "age_group": {"visible": true, "required": false},
    "num_students": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- Brooklyn Club Session
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
  'Brooklyn Club Session',
  'Brooklyn area club chess program',
  'Club',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Club",
    "colour": "Orange",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 40,
    "dft_contractor_rate": 30,
    "dft_max_srs": 12,
    "sr_premium": 0,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "class_name": {"visible": true, "required": true},
    "location": {"visible": true, "required": true, "default": "Brooklyn"},
    "day_of_week": {"visible": true, "required": true},
    "time": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- ============================================
-- ONLINE TEMPLATES
-- ============================================

-- Online - Trial Session
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
  'Online - Trial Session',
  'Online trial chess lesson',
  'Online',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Online",
    "colour": "Teal",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 65,
    "dft_contractor_rate": 30,
    "sr_premium": 0,
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false, "default": true},
    "student_name": {"visible": true, "required": true, "type": "autofill"},
    "timezone": {"visible": true, "required": true},
    "availability": {"visible": true, "required": true},
    "client_notes": {"visible": true, "required": false},
    "duration": {"visible": true, "required": false, "default": "45-60 minutes"}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- Online - Ongoing Session
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
  'Online - Ongoing Session',
  'Online ongoing chess lessons',
  'Online',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Online",
    "colour": "Teal",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 65,
    "dft_contractor_rate": 30,
    "sr_premium": 0,
    "dft_max_srs": 1,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "is_trial": {"visible": true, "required": false, "default": false},
    "student_name": {"visible": true, "required": true, "type": "autofill"},
    "timezone": {"visible": true, "required": true},
    "client_notes": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- ============================================
-- COMMUNITY TEMPLATES
-- ============================================

-- Community - Library Program
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
  'Community - Library Program',
  'Community library chess program',
  'Community',
  'production',
  '["admin", "staff"]'::jsonb,
  '{
    "job_type": "Community",
    "colour": "Yellow",
    "dft_charge_type": "hourly",
    "dft_charge_rate": 35,
    "dft_contractor_rate": 25,
    "dft_max_srs": 20,
    "sr_premium": 0,
    "dft_contractor_permissions": "add-edit-complete",
    "auto_invoice": false,
    "status": "pending"
  }'::jsonb,
  '{
    "location": {"visible": true, "required": true},
    "subject": {"visible": true, "required": true, "default": "Chess"},
    "semester": {"visible": true, "required": true},
    "section": {"visible": true, "required": true},
    "age_group": {"visible": true, "required": false}
  }'::jsonb,
  true,
  'system',
  'system'
);

-- Print summary
SELECT 
  category,
  COUNT(*) as template_count
FROM job_templates
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
ORDER BY category, name;

