-- Migration: Make Section field optional for School and Community job templates
-- This updates the field_config JSONB to set section.required = false
-- Date: 2025-12-11

-- Update School templates
UPDATE job_templates
SET field_config = jsonb_set(
  field_config,
  '{section,required}',
  'false'::jsonb,
  true
)
WHERE category = 'School'
  AND field_config->'section' IS NOT NULL
  AND (field_config->'section'->>'required')::boolean = true;

-- Update Community templates
UPDATE job_templates
SET field_config = jsonb_set(
  field_config,
  '{section,required}',
  'false'::jsonb,
  true
)
WHERE category = 'Community'
  AND field_config->'section' IS NOT NULL
  AND (field_config->'section'->>'required')::boolean = true;

-- Verify the changes
SELECT 
  id,
  name,
  category,
  field_config->'section' as section_config
FROM job_templates
WHERE category IN ('School', 'Community')
  AND field_config->'section' IS NOT NULL
ORDER BY category, name;








