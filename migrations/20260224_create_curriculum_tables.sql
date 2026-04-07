-- Migration: Create curriculum tables for chess curriculum tracking
-- Date: 2026-02-24
-- Idempotent: Safe to run multiple times (IF NOT EXISTS, ON CONFLICT DO NOTHING)

-- ============================================================
-- Table 1: curriculum_modules (6 chess bands)
-- ============================================================
CREATE TABLE IF NOT EXISTS curriculum_modules (
  id SERIAL PRIMARY KEY,
  module_number INTEGER NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  band_name VARCHAR(50) NOT NULL,
  band_color VARCHAR(7) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed 6 modules with STC brand colors
INSERT INTO curriculum_modules (module_number, name, band_name, band_color, sort_order)
VALUES
  (1, 'Module 1', 'Green Band',  '#34B256', 1),
  (2, 'Module 2', 'Yellow Band', '#FACC29', 2),
  (3, 'Module 3', 'Orange Band', '#F79A30', 3),
  (4, 'Module 4', 'Cyan Band',   '#50C8DF', 4),
  (5, 'Module 5', 'Purple Band', '#6A469D', 5),
  (6, 'Module 6', 'Navy Band',   '#2D2F8E', 6)
ON CONFLICT (module_number) DO NOTHING;

-- ============================================================
-- Table 2: curriculum_lessons (linked to existing templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS curriculum_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES curriculum_modules(id),
  lesson_number INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  template_name VARCHAR(200),
  topic VARCHAR(200),
  description TEXT,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module_id, lesson_number)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_module_id ON curriculum_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_lessons_template_name ON curriculum_lessons(template_name);

-- Seed lessons by parsing existing templates table
-- Pattern 1: Standard format "Chess Module N: Lesson N - Topic"
INSERT INTO curriculum_lessons (module_id, lesson_number, name, template_name, topic, sort_order)
SELECT
  cm.id as module_id,
  CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) as lesson_number,
  t.template_name as name,
  t.template_name,
  TRIM(SUBSTRING(t.template_name FROM 'Lesson \d+ - (.+)$')) as topic,
  (cm.module_number - 1) * 100 + CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) as sort_order
FROM templates t
JOIN curriculum_modules cm ON CAST(SUBSTRING(t.template_name FROM 'Module (\d+)') AS INTEGER) = cm.module_number
WHERE t.template_name ~ '^Chess Module \d+: Lesson \d+'
ON CONFLICT (module_id, lesson_number) DO NOTHING;

-- Pattern 2: Module 3 missing colon "Chess Module 3 Lesson N - Topic"
INSERT INTO curriculum_lessons (module_id, lesson_number, name, template_name, topic, sort_order)
SELECT
  cm.id as module_id,
  CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) as lesson_number,
  t.template_name as name,
  t.template_name,
  TRIM(SUBSTRING(t.template_name FROM 'Lesson \d+ - (.+)$')) as topic,
  (cm.module_number - 1) * 100 + CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) as sort_order
FROM templates t
JOIN curriculum_modules cm ON cm.module_number = 3
WHERE t.template_name ~ '^Chess Module 3 Lesson \d+'
  AND t.template_name NOT LIKE 'Chess Module 3:%'
ON CONFLICT (module_id, lesson_number) DO NOTHING;

-- Pattern 3: Module 1b (fast path) mapped to Module 1 as lessons 11-20
INSERT INTO curriculum_lessons (module_id, lesson_number, name, template_name, topic, sort_order)
SELECT
  cm.id as module_id,
  CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) + 10 as lesson_number,
  t.template_name as name,
  t.template_name,
  TRIM(SUBSTRING(t.template_name FROM 'Lesson \d+ - (.+)$')) as topic,
  (cm.module_number - 1) * 100 + CAST(SUBSTRING(t.template_name FROM 'Lesson (\d+)') AS INTEGER) + 10 as sort_order
FROM templates t
JOIN curriculum_modules cm ON cm.module_number = 1
WHERE t.template_name ~ '^Chess Module 1b: Lesson \d+'
ON CONFLICT (module_id, lesson_number) DO NOTHING;

-- ============================================================
-- Table 3: student_progress (materialized progress tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS student_progress (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL,
  curriculum_lesson_id INTEGER NOT NULL REFERENCES curriculum_lessons(id),
  completed_at TIMESTAMPTZ NOT NULL,
  appointment_id VARCHAR,
  client_report_id INTEGER,
  tutor_name VARCHAR(200),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recipient_id, curriculum_lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_recipient_id ON student_progress(recipient_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_curriculum_lesson_id ON student_progress(curriculum_lesson_id);
