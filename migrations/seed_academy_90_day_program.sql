-- Migration: Seed 90-Day Launch Program
-- Seeds the initial program, phases, modules, and badges for Franchise Academy

-- First, ensure the program doesn't already exist
INSERT INTO academy_programs (slug, title, description, total_points, is_active)
SELECT '90-day-launch',
       '90-Day Launch Program',
       'Your comprehensive guide to launching a successful Acme Operations franchise. Complete this program to master operations, marketing, and growth strategies.',
       1500,
       true
WHERE NOT EXISTS (SELECT 1 FROM academy_programs WHERE slug = '90-day-launch');

-- Get the program ID
DO $$
DECLARE
  program_id_var INT;
  phase1_id INT;
  phase2_id INT;
  phase3_id INT;
  module_id INT;
BEGIN
  SELECT id INTO program_id_var FROM academy_programs WHERE slug = '90-day-launch';

  IF program_id_var IS NULL THEN
    RAISE NOTICE 'Program not found, skipping seed';
    RETURN;
  END IF;

  -- ============================================
  -- PHASE 1: Foundation & Setup (Days 1-30)
  -- ============================================
  INSERT INTO academy_phases (program_id, phase_number, title, description, duration_days, badge_on_complete, points_on_complete, display_order)
  VALUES (program_id_var, 1, 'Foundation & Setup', 'Build your operational foundation. Complete essential setup tasks, learn the STC system, and prepare for your first students.', 30, 'foundation-master', 100, 1)
  ON CONFLICT (program_id, phase_number) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description
  RETURNING id INTO phase1_id;

  -- Phase 1 Modules
  -- Module 1.1: Welcome & Orientation
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, is_gate, display_order)
  VALUES (phase1_id, 'welcome-orientation', 'Welcome & Orientation', 'Get oriented with the Acme Operations franchise system and meet your support team.', 'video',
    '{"videoId": "placeholder", "duration": "15:00", "description": "Welcome to the STC family! In this video, you''ll learn about our mission, values, and what makes Acme Operations unique."}',
    10, true, true, 1)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  -- Module 1.2: Business Setup Checklist
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, points_value, is_required, display_order)
  VALUES (phase1_id, 'business-setup', 'Business Setup Checklist', 'Complete all essential business setup tasks including legal, banking, and insurance requirements.', 'checklist', 25, true, 2)
  ON CONFLICT (phase_id, slug) DO NOTHING
  RETURNING id INTO module_id;

  -- Add checklist items if module was created
  IF module_id IS NOT NULL THEN
    INSERT INTO academy_checklist_items (module_id, title, description, help_text, due_day, points_value, is_required, display_order) VALUES
    (module_id, 'Register your business entity', 'Set up your LLC or corporation for your franchise territory', 'Contact your accountant or use a service like LegalZoom', 7, 5, true, 1),
    (module_id, 'Open a business bank account', 'Separate your franchise finances from personal accounts', 'Most banks offer free business checking for new businesses', 10, 5, true, 2),
    (module_id, 'Obtain business insurance', 'Get liability insurance for your chess education business', 'We recommend at least $1M in general liability coverage', 14, 5, true, 3),
    (module_id, 'Set up accounting system', 'Choose and configure your bookkeeping software', 'QuickBooks Online is recommended for easy integration', 14, 5, true, 4),
    (module_id, 'Complete TutorCruncher onboarding', 'Set up your account in our scheduling and billing system', 'Your franchise coordinator will guide you through this', 21, 5, true, 5)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Module 1.3: Platform Training
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase1_id, 'platform-training', 'Platform Training', 'Master the TutorCruncher platform for scheduling, billing, and client management.', 'video',
    '{"videoId": "placeholder", "duration": "30:00", "description": "Learn how to use TutorCruncher to manage your clients, schedule lessons, and process payments."}',
    15, true, 3)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  -- Module 1.4: Teaching Methods Overview
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase1_id, 'teaching-methods', 'Teaching Methods Overview', 'Learn the Acme Operations teaching methodology and curriculum structure.', 'document',
    '{"sections": [{"title": "The Story-Based Approach", "content": "How we use storytelling to teach chess..."}, {"title": "Age-Appropriate Teaching", "content": "Adapting your approach for different age groups..."}]}',
    15, true, 4)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  -- Module 1.5: First Demo Preparation
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, points_value, is_required, display_order)
  VALUES (phase1_id, 'demo-preparation', 'First Demo Preparation', 'Prepare to deliver your first demonstration lesson to potential clients.', 'checklist', 20, true, 5)
  ON CONFLICT (phase_id, slug) DO NOTHING
  RETURNING id INTO module_id;

  IF module_id IS NOT NULL THEN
    INSERT INTO academy_checklist_items (module_id, title, description, due_day, points_value, is_required, display_order) VALUES
    (module_id, 'Watch demo lesson videos', 'Review recordings of successful demo lessons', 25, 4, true, 1),
    (module_id, 'Practice demo script', 'Rehearse your demo presentation at least 3 times', 27, 4, true, 2),
    (module_id, 'Prepare demo materials', 'Gather chess boards, story cards, and handouts', 28, 4, true, 3),
    (module_id, 'Schedule practice demo', 'Do a practice demo with family or friends', 29, 4, true, 4),
    (module_id, 'Complete demo readiness quiz', 'Pass the demo readiness assessment', 30, 4, true, 5)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- PHASE 2: Market Activation (Days 31-60)
  -- ============================================
  INSERT INTO academy_phases (program_id, phase_number, title, description, duration_days, badge_on_complete, points_on_complete, display_order, unlock_requirements)
  VALUES (program_id_var, 2, 'Market Activation', 'Launch your marketing efforts and acquire your first clients. Build your local presence and start generating leads.', 30, 'market-activator', 100, 2, '{"previous_phase_complete": true}')
  ON CONFLICT (program_id, phase_number) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description
  RETURNING id INTO phase2_id;

  -- Phase 2 Modules
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase2_id, 'marketing-fundamentals', 'Marketing Fundamentals', 'Learn the core marketing strategies that work for chess education businesses.', 'video',
    '{"videoId": "placeholder", "duration": "25:00", "description": "Discover proven marketing tactics for reaching families and schools in your territory."}',
    15, true, 1)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, points_value, is_required, display_order)
  VALUES (phase2_id, 'marketing-launch', 'Marketing Launch Checklist', 'Execute your launch marketing campaign to generate initial awareness.', 'checklist', 25, true, 2)
  ON CONFLICT (phase_id, slug) DO NOTHING
  RETURNING id INTO module_id;

  IF module_id IS NOT NULL THEN
    INSERT INTO academy_checklist_items (module_id, title, description, due_day, points_value, is_required, display_order) VALUES
    (module_id, 'Set up Google Business Profile', 'Create and optimize your local business listing', 35, 5, true, 1),
    (module_id, 'Launch Facebook page', 'Create your franchise Facebook business page', 37, 5, true, 2),
    (module_id, 'Create Instagram account', 'Set up Instagram for local marketing', 37, 5, true, 3),
    (module_id, 'Send launch announcement', 'Email your personal network about your new business', 40, 5, true, 4),
    (module_id, 'Connect with local schools', 'Reach out to 5+ schools about chess programs', 45, 5, true, 5)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase2_id, 'lead-conversion', 'Lead Conversion Training', 'Master the art of converting inquiries into enrolled students.', 'video',
    '{"videoId": "placeholder", "duration": "20:00", "description": "Learn our proven sales process for converting leads into happy, long-term clients."}',
    15, true, 3)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, points_value, is_required, display_order)
  VALUES (phase2_id, 'first-clients', 'First Clients Milestone', 'Track your progress toward enrolling your first paying clients.', 'checklist', 30, true, 4)
  ON CONFLICT (phase_id, slug) DO NOTHING
  RETURNING id INTO module_id;

  IF module_id IS NOT NULL THEN
    INSERT INTO academy_checklist_items (module_id, title, description, due_day, points_value, is_required, display_order) VALUES
    (module_id, 'Complete first trial lesson', 'Deliver your first trial lesson to a potential client', 50, 10, true, 1),
    (module_id, 'Enroll first paying student', 'Convert your first trial into an ongoing student', 55, 10, true, 2),
    (module_id, 'Get first positive review', 'Receive a 5-star review from a satisfied family', 60, 10, true, 3)
    ON CONFLICT DO NOTHING;
  END IF;

  -- ============================================
  -- PHASE 3: Growth & Optimization (Days 61-90)
  -- ============================================
  INSERT INTO academy_phases (program_id, phase_number, title, description, duration_days, badge_on_complete, points_on_complete, display_order, unlock_requirements)
  VALUES (program_id_var, 3, 'Growth & Optimization', 'Scale your operations and optimize for sustainable growth. Build systems for long-term success.', 30, 'growth-champion', 100, 3, '{"previous_phase_complete": true}')
  ON CONFLICT (program_id, phase_number) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description
  RETURNING id INTO phase3_id;

  -- Phase 3 Modules
  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase3_id, 'scaling-operations', 'Scaling Your Operations', 'Learn how to grow your business while maintaining quality.', 'video',
    '{"videoId": "placeholder", "duration": "25:00", "description": "Strategies for scaling from a handful of students to a thriving chess education business."}',
    15, true, 1)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase3_id, 'tutor-recruitment', 'Tutor Recruitment & Training', 'Build your team of qualified chess instructors.', 'document',
    '{"sections": [{"title": "Finding Great Tutors", "content": "Where to source qualified instructors..."}, {"title": "Training Process", "content": "How to train tutors in the STC method..."}]}',
    15, true, 2)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, points_value, is_required, display_order)
  VALUES (phase3_id, 'growth-milestones', 'Growth Milestones', 'Track your progress toward sustainable business operations.', 'checklist', 30, true, 3)
  ON CONFLICT (phase_id, slug) DO NOTHING
  RETURNING id INTO module_id;

  IF module_id IS NOT NULL THEN
    INSERT INTO academy_checklist_items (module_id, title, description, due_day, points_value, is_required, display_order) VALUES
    (module_id, 'Reach 10+ active students', 'Build your roster to at least 10 regular students', 75, 10, true, 1),
    (module_id, 'Establish school partnership', 'Secure an ongoing contract with at least one school', 80, 10, true, 2),
    (module_id, 'Recruit first tutor', 'Hire and train your first assistant instructor', 85, 10, true, 3),
    (module_id, 'Complete 90-day business review', 'Review your first 90 days with your franchise coordinator', 90, 10, true, 4)
    ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase3_id, 'financial-management', 'Financial Management', 'Master the financial aspects of running your franchise.', 'video',
    '{"videoId": "placeholder", "duration": "20:00", "description": "Understand your P&L, manage cash flow, and plan for profitability."}',
    15, true, 4)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, points_value, is_required, display_order)
  VALUES (phase3_id, 'long-term-planning', 'Long-Term Planning', 'Create your roadmap for year one and beyond.', 'document',
    '{"sections": [{"title": "Setting Annual Goals", "content": "How to set realistic growth targets..."}, {"title": "Building Recurring Revenue", "content": "Strategies for sustainable income..."}]}',
    15, true, 5)
  ON CONFLICT (phase_id, slug) DO NOTHING;

  RAISE NOTICE 'Successfully seeded 90-Day Launch Program with % phases', 3;
END $$;

-- ============================================
-- SEED BADGES
-- ============================================

-- Phase completion badges
INSERT INTO academy_badges (badge_key, title, description, icon, color_scheme, unlock_type, unlock_condition, points_reward, display_order)
VALUES
  ('foundation-master', 'Foundation Master', 'Completed Phase 1: Foundation & Setup', 'AcademicCapIcon',
   '{"bg": "bg-amber-100", "text": "text-amber-800", "border": "border-amber-300"}',
   'phase_completion', '{"phase_number": 1}', 25, 1),
  ('market-activator', 'Market Activator', 'Completed Phase 2: Market Activation', 'RocketLaunchIcon',
   '{"bg": "bg-blue-100", "text": "text-blue-800", "border": "border-blue-300"}',
   'phase_completion', '{"phase_number": 2}', 25, 2),
  ('growth-champion', 'Growth Champion', 'Completed Phase 3: Growth & Optimization', 'TrophyIcon',
   '{"bg": "bg-green-100", "text": "text-green-800", "border": "border-green-300"}',
   'phase_completion', '{"phase_number": 3}', 50, 3)
ON CONFLICT (badge_key) DO NOTHING;

-- Streak badges
INSERT INTO academy_badges (badge_key, title, description, icon, color_scheme, unlock_type, unlock_condition, points_reward, display_order)
VALUES
  ('streak-3', '3-Day Streak', 'Logged activity 3 days in a row', 'FireIcon',
   '{"bg": "bg-orange-100", "text": "text-orange-800", "border": "border-orange-300"}',
   'streak', '{"days": 3}', 10, 10),
  ('streak-7', 'Week Warrior', 'Logged activity 7 days in a row', 'FireIcon',
   '{"bg": "bg-orange-100", "text": "text-orange-800", "border": "border-orange-300"}',
   'streak', '{"days": 7}', 25, 11),
  ('streak-30', 'Monthly Master', 'Logged activity 30 days in a row', 'FireIcon',
   '{"bg": "bg-red-100", "text": "text-red-800", "border": "border-red-300"}',
   'streak', '{"days": 30}', 100, 12)
ON CONFLICT (badge_key) DO NOTHING;

-- Points milestones
INSERT INTO academy_badges (badge_key, title, description, icon, color_scheme, unlock_type, unlock_condition, points_reward, display_order)
VALUES
  ('points-100', 'Century Club', 'Earned your first 100 points', 'SparklesIcon',
   '{"bg": "bg-purple-100", "text": "text-purple-800", "border": "border-purple-300"}',
   'points', '{"points": 100}', 10, 20),
  ('points-500', 'High Scorer', 'Earned 500 points', 'SparklesIcon',
   '{"bg": "bg-purple-100", "text": "text-purple-800", "border": "border-purple-300"}',
   'points', '{"points": 500}', 25, 21),
  ('points-1000', 'Point Prodigy', 'Earned 1000 points', 'SparklesIcon',
   '{"bg": "bg-yellow-100", "text": "text-yellow-800", "border": "border-yellow-300"}',
   'points', '{"points": 1000}', 50, 22)
ON CONFLICT (badge_key) DO NOTHING;

-- Special achievement badges
INSERT INTO academy_badges (badge_key, title, description, icon, color_scheme, unlock_type, unlock_condition, points_reward, display_order)
VALUES
  ('first-demo', 'Demo Day Hero', 'Completed your first demonstration lesson', 'PresentationChartBarIcon',
   '{"bg": "bg-cyan-100", "text": "text-cyan-800", "border": "border-cyan-300"}',
   'special', '{"condition": "first_demo_complete"}', 25, 30),
  ('first-enrollment', 'First Enrollment', 'Enrolled your first paying student', 'UserPlusIcon',
   '{"bg": "bg-emerald-100", "text": "text-emerald-800", "border": "border-emerald-300"}',
   'special', '{"condition": "first_student_enrolled"}', 50, 31),
  ('coach-conversationalist', 'Curious Mind', 'Asked 10 questions to the AI Coach', 'ChatBubbleLeftRightIcon',
   '{"bg": "bg-indigo-100", "text": "text-indigo-800", "border": "border-indigo-300"}',
   'special', '{"condition": "10_coach_questions"}', 15, 32),
  ('speed-runner', 'Speed Runner', 'Completed Phase 1 in under 21 days', 'BoltIcon',
   '{"bg": "bg-pink-100", "text": "text-pink-800", "border": "border-pink-300"}',
   'special', '{"condition": "phase_1_under_21_days"}', 50, 33),
  ('journey-complete', 'Journey Complete', 'Finished the entire 90-Day Launch Program', 'FlagIcon',
   '{"bg": "bg-gradient-to-r from-amber-100 to-yellow-100", "text": "text-amber-800", "border": "border-amber-400"}',
   'special', '{"condition": "program_complete"}', 100, 40)
ON CONFLICT (badge_key) DO NOTHING;

-- Verify seed completed
DO $$
DECLARE
  program_count INT;
  phase_count INT;
  module_count INT;
  badge_count INT;
BEGIN
  SELECT COUNT(*) INTO program_count FROM academy_programs;
  SELECT COUNT(*) INTO phase_count FROM academy_phases;
  SELECT COUNT(*) INTO module_count FROM academy_modules;
  SELECT COUNT(*) INTO badge_count FROM academy_badges;

  RAISE NOTICE 'Academy seed complete: % programs, % phases, % modules, % badges',
    program_count, phase_count, module_count, badge_count;
END $$;
