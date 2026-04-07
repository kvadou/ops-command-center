-- Pre-built Workflow Templates for Acme Operations Operations
-- Fixed version with proper escaping

-- 1. FRANCHISE ONBOARDING WORKFLOW
INSERT INTO task_workflow_templates (
  name,
  description,
  category,
  icon,
  template_data,
  default_board_name,
  default_groups,
  is_system_template,
  is_active,
  created_by
) VALUES (
  'Franchise Onboarding - Complete Program',
  'Complete 8-week franchise onboarding program covering brand understanding, operations training, marketing setup, and launch preparation.',
  'franchise_onboarding',
  '🎯',
  '[
    {"id": "week1-1", "name": "Review Brand Values and Mission", "description": "Study the Acme Operations brand, mission, and core values.", "group": "Week 1: Brand Understanding", "position": 0, "priority": "high", "due_days_offset": 1, "tags": ["onboarding", "brand"]},
    {"id": "week1-2", "name": "Product Knowledge Training", "description": "Complete product training: Acme Operations game, curriculum, and teaching methodology.", "group": "Week 1: Brand Understanding", "position": 1, "priority": "high", "due_days_offset": 3, "tags": ["onboarding", "product"]},
    {"id": "week1-3", "name": "Review Parent and Educator Profiles", "description": "Study target customer profiles and understand their needs.", "group": "Week 1: Brand Understanding", "position": 2, "priority": "medium", "due_days_offset": 5, "tags": ["onboarding", "marketing"]},
    {"id": "week2-1", "name": "Operations Manual Section 1-2", "description": "Review Introduction and Establishing Business sections.", "group": "Week 2-3: Operations Training", "position": 0, "priority": "high", "due_days_offset": 8, "tags": ["onboarding", "operations"]},
    {"id": "week2-2", "name": "Operations Manual Section 3: Personnel", "description": "Review personnel management and tutor recruitment.", "group": "Week 2-3: Operations Training", "position": 1, "priority": "high", "due_days_offset": 12, "tags": ["onboarding", "hr"]},
    {"id": "week2-3", "name": "Set Up TutorCruncher Account", "description": "Configure scheduling, billing, and client management.", "group": "Week 2-3: Operations Training", "position": 2, "priority": "high", "due_days_offset": 14, "tags": ["onboarding", "tech"]},
    {"id": "week4-1", "name": "Review Marketing Tools", "description": "Study all available marketing tools and resources.", "group": "Week 4: Marketing Setup", "position": 0, "priority": "high", "due_days_offset": 22, "tags": ["onboarding", "marketing"]},
    {"id": "week4-2", "name": "Set Up Social Media Accounts", "description": "Create and configure Facebook, Instagram accounts.", "group": "Week 4: Marketing Setup", "position": 1, "priority": "high", "due_days_offset": 26, "tags": ["onboarding", "social"]},
    {"id": "week5-1", "name": "Sales Funnel Training", "description": "Complete training on discovery, demo, conversion, retention.", "group": "Week 5-8: Launch Preparation", "position": 0, "priority": "high", "due_days_offset": 29, "tags": ["onboarding", "sales"]},
    {"id": "week6-1", "name": "Recruit First Tutors", "description": "Post job listings and begin interview process.", "group": "Week 5-8: Launch Preparation", "position": 1, "priority": "urgent", "due_days_offset": 36, "tags": ["onboarding", "tutors"]},
    {"id": "week7-1", "name": "Plan and Execute Soft Launch", "description": "Design and run soft launch event.", "group": "Week 5-8: Launch Preparation", "position": 2, "priority": "urgent", "due_days_offset": 49, "tags": ["onboarding", "launch"]},
    {"id": "week8-1", "name": "Official Launch Campaign", "description": "Execute official launch across all channels.", "group": "Week 5-8: Launch Preparation", "position": 3, "priority": "urgent", "due_days_offset": 56, "tags": ["onboarding", "launch"]}
  ]'::jsonb,
  'Franchise Onboarding',
  '["Week 1: Brand Understanding", "Week 2-3: Operations Training", "Week 4: Marketing Setup", "Week 5-8: Launch Preparation"]'::jsonb,
  true,
  true,
  'system'
) ON CONFLICT DO NOTHING;

-- 2. EVENT SETUP WORKFLOW
INSERT INTO task_workflow_templates (
  name,
  description,
  category,
  icon,
  template_data,
  default_board_name,
  default_groups,
  is_system_template,
  is_active,
  created_by
) VALUES (
  'Street Fair / Event Setup',
  'Complete checklist for preparing and conducting a Acme Operations event.',
  'event_setup',
  '🎪',
  '[
    {"id": "prep-1", "name": "Identify Target Event", "description": "Research and select suitable event.", "group": "Pre-Event Planning", "position": 0, "priority": "high", "due_days_offset": -30, "tags": ["event", "planning"]},
    {"id": "prep-2", "name": "Submit Vendor Application", "description": "Complete application with booth fee payment.", "group": "Pre-Event Planning", "position": 1, "priority": "high", "due_days_offset": -28, "tags": ["event", "admin"]},
    {"id": "materials-1", "name": "Order Printed Materials", "description": "Order brochures, business cards, sign-up sheets.", "group": "Materials Preparation", "position": 0, "priority": "high", "due_days_offset": -21, "tags": ["event", "materials"]},
    {"id": "materials-2", "name": "Prepare Demo Boards", "description": "Ensure chess boards complete with pieces.", "group": "Materials Preparation", "position": 1, "priority": "high", "due_days_offset": -7, "tags": ["event", "materials"]},
    {"id": "staff-1", "name": "Recruit Event Volunteers", "description": "Recruit 2-3 staff to help at event.", "group": "Staffing & Training", "position": 0, "priority": "high", "due_days_offset": -14, "tags": ["event", "staffing"]},
    {"id": "promo-1", "name": "Post Event on Social Media", "description": "Announce participation across social channels.", "group": "Pre-Event Promotion", "position": 0, "priority": "medium", "due_days_offset": -7, "tags": ["event", "marketing"]},
    {"id": "day-1", "name": "Arrive Early for Setup", "description": "Arrive 1-2 hours before event start.", "group": "Event Day", "position": 0, "priority": "urgent", "due_days_offset": 0, "tags": ["event", "execution"]},
    {"id": "day-2", "name": "Conduct Demos Throughout Day", "description": "Engage attendees and capture leads.", "group": "Event Day", "position": 1, "priority": "urgent", "due_days_offset": 0, "tags": ["event", "sales"]},
    {"id": "follow-1", "name": "Enter All Leads into CRM", "description": "Input all contact info from sign-up sheets.", "group": "Post-Event Follow-Up", "position": 0, "priority": "urgent", "due_days_offset": 1, "tags": ["event", "leads"]},
    {"id": "follow-2", "name": "Send Thank You Email to Leads", "description": "Email attendees with thank you and offer.", "group": "Post-Event Follow-Up", "position": 1, "priority": "high", "due_days_offset": 2, "tags": ["event", "followup"]}
  ]'::jsonb,
  'Event Setup',
  '["Pre-Event Planning", "Materials Preparation", "Staffing & Training", "Pre-Event Promotion", "Event Day", "Post-Event Follow-Up"]'::jsonb,
  true,
  true,
  'system'
) ON CONFLICT DO NOTHING;

-- 3. SALES FUNNEL WORKFLOW
INSERT INTO task_workflow_templates (
  name,
  description,
  category,
  icon,
  template_data,
  default_board_name,
  default_groups,
  is_system_template,
  is_active,
  created_by
) VALUES (
  'Sales Funnel: Discovery to Retention',
  'Complete sales funnel from discovery call through conversion and retention.',
  'sales_funnel',
  '💼',
  '[
    {"id": "disc-1", "name": "Review Lead Information", "description": "Review all info about prospect.", "group": "Discovery", "position": 0, "priority": "high", "due_days_offset": 0, "tags": ["sales", "discovery"]},
    {"id": "disc-2", "name": "Conduct Discovery Call", "description": "Connect with prospect to understand needs.", "group": "Discovery", "position": 1, "priority": "urgent", "due_days_offset": 1, "tags": ["sales", "call"]},
    {"id": "disc-3", "name": "Document Call Notes", "description": "Record key insights in CRM.", "group": "Discovery", "position": 2, "priority": "high", "due_days_offset": 1, "tags": ["sales", "admin"]},
    {"id": "demo-1", "name": "Schedule Demo Session", "description": "Book demo time with prospect.", "group": "Demo", "position": 0, "priority": "high", "due_days_offset": 2, "tags": ["sales", "demo"]},
    {"id": "demo-2", "name": "Conduct Product Demo", "description": "Deliver engaging product demo.", "group": "Demo", "position": 1, "priority": "urgent", "due_days_offset": 5, "tags": ["sales", "demo"]},
    {"id": "conv-1", "name": "Send Follow-Up Email", "description": "Thank prospect and address questions.", "group": "Conversion", "position": 0, "priority": "high", "due_days_offset": 6, "tags": ["sales", "followup"]},
    {"id": "conv-2", "name": "Present Package Options", "description": "Share pricing and enrollment process.", "group": "Conversion", "position": 1, "priority": "high", "due_days_offset": 6, "tags": ["sales", "proposal"]},
    {"id": "conv-3", "name": "Process Enrollment", "description": "Complete paperwork, collect payment.", "group": "Conversion", "position": 2, "priority": "urgent", "due_days_offset": 8, "tags": ["sales", "onboarding"]},
    {"id": "ret-1", "name": "Send Welcome Package", "description": "Email welcome materials and tutor info.", "group": "Retention", "position": 0, "priority": "high", "due_days_offset": 9, "tags": ["retention", "onboarding"]},
    {"id": "ret-2", "name": "Check In After First Lesson", "description": "Follow up to ensure lesson went well.", "group": "Retention", "position": 1, "priority": "high", "due_days_offset": 14, "tags": ["retention", "support"]}
  ]'::jsonb,
  NULL,
  '["Discovery", "Demo", "Conversion", "Retention"]'::jsonb,
  true,
  true,
  'system'
) ON CONFLICT DO NOTHING;

-- 4. MARKETING CAMPAIGN WORKFLOW
INSERT INTO task_workflow_templates (
  name,
  description,
  category,
  icon,
  template_data,
  default_board_name,
  default_groups,
  is_system_template,
  is_active,
  created_by
) VALUES (
  'Marketing Campaign Launch',
  'Complete marketing campaign from planning through execution and analytics.',
  'marketing_campaign',
  '📢',
  '[
    {"id": "plan-1", "name": "Define Campaign Goals", "description": "Set specific, measurable goals.", "group": "Campaign Planning", "position": 0, "priority": "high", "due_days_offset": 0, "tags": ["marketing", "planning"]},
    {"id": "plan-2", "name": "Identify Target Audience", "description": "Define demographics and geographic area.", "group": "Campaign Planning", "position": 1, "priority": "high", "due_days_offset": 1, "tags": ["marketing", "planning"]},
    {"id": "plan-3", "name": "Set Campaign Budget", "description": "Allocate budget across channels.", "group": "Campaign Planning", "position": 2, "priority": "high", "due_days_offset": 2, "tags": ["marketing", "budget"]},
    {"id": "content-1", "name": "Develop Campaign Messaging", "description": "Create core messaging and CTA.", "group": "Content Creation", "position": 0, "priority": "high", "due_days_offset": 5, "tags": ["marketing", "content"]},
    {"id": "content-2", "name": "Design Social Media Graphics", "description": "Create graphics for Facebook/Instagram.", "group": "Content Creation", "position": 1, "priority": "high", "due_days_offset": 7, "tags": ["marketing", "design"]},
    {"id": "content-3", "name": "Create Landing Page", "description": "Build dedicated landing page.", "group": "Content Creation", "position": 2, "priority": "high", "due_days_offset": 9, "tags": ["marketing", "web"]},
    {"id": "dist-1", "name": "Set Up Facebook Ad Campaign", "description": "Create and configure FB ads.", "group": "Distribution Setup", "position": 0, "priority": "high", "due_days_offset": 11, "tags": ["marketing", "ads"]},
    {"id": "dist-2", "name": "Set Up Instagram Ad Campaign", "description": "Create and configure IG ads.", "group": "Distribution Setup", "position": 1, "priority": "high", "due_days_offset": 11, "tags": ["marketing", "ads"]},
    {"id": "launch-1", "name": "Launch Campaign!", "description": "Activate all ads and begin distribution.", "group": "Campaign Launch", "position": 0, "priority": "urgent", "due_days_offset": 14, "tags": ["marketing", "launch"]},
    {"id": "track-1", "name": "Daily Performance Check", "description": "Review impressions, clicks, conversions.", "group": "Analytics & Tracking", "position": 0, "priority": "high", "due_days_offset": 15, "tags": ["marketing", "analytics"]},
    {"id": "track-2", "name": "Final Campaign Report", "description": "Complete final analysis: ROI and learnings.", "group": "Analytics & Tracking", "position": 1, "priority": "high", "due_days_offset": 45, "tags": ["marketing", "reporting"]}
  ]'::jsonb,
  'Marketing Campaign',
  '["Campaign Planning", "Content Creation", "Distribution Setup", "Campaign Launch", "Analytics & Tracking"]'::jsonb,
  true,
  true,
  'system'
) ON CONFLICT DO NOTHING;

-- 5. NEW TUTOR ONBOARDING WORKFLOW
INSERT INTO task_workflow_templates (
  name,
  description,
  category,
  icon,
  template_data,
  default_board_name,
  default_groups,
  is_system_template,
  is_active,
  created_by
) VALUES (
  'New Tutor Onboarding',
  'Complete onboarding workflow for new tutors from hiring through independent lessons.',
  'tutor_onboarding',
  '👨‍🏫',
  '[
    {"id": "hire-1", "name": "Complete Background Check", "description": "Submit and process background check.", "group": "Hiring & Admin", "position": 0, "priority": "urgent", "due_days_offset": 0, "tags": ["tutor", "compliance"]},
    {"id": "hire-2", "name": "Sign Employment Paperwork", "description": "Complete W-9, direct deposit, agreement.", "group": "Hiring & Admin", "position": 1, "priority": "urgent", "due_days_offset": 1, "tags": ["tutor", "admin"]},
    {"id": "hire-3", "name": "Set Up TutorCruncher Profile", "description": "Create profile with availability.", "group": "Hiring & Admin", "position": 2, "priority": "high", "due_days_offset": 1, "tags": ["tutor", "tech"]},
    {"id": "train-1", "name": "Product Training Session", "description": "Training on game, pieces, and storylines.", "group": "Training", "position": 0, "priority": "urgent", "due_days_offset": 2, "tags": ["tutor", "product"]},
    {"id": "train-2", "name": "Teaching Methodology Training", "description": "Learn teaching approach and best practices.", "group": "Training", "position": 1, "priority": "urgent", "due_days_offset": 3, "tags": ["tutor", "pedagogy"]},
    {"id": "train-3", "name": "Practice Demo Session", "description": "Conduct practice demo with feedback.", "group": "Training", "position": 2, "priority": "high", "due_days_offset": 5, "tags": ["tutor", "practice"]},
    {"id": "shadow-1", "name": "Shadow Experienced Tutor - Session 1", "description": "Observe first lesson with mentor.", "group": "Shadowing", "position": 0, "priority": "urgent", "due_days_offset": 7, "tags": ["tutor", "shadowing"]},
    {"id": "shadow-2", "name": "Shadow Experienced Tutor - Session 2", "description": "Observe second lesson, different age group.", "group": "Shadowing", "position": 1, "priority": "high", "due_days_offset": 8, "tags": ["tutor", "shadowing"]},
    {"id": "super-1", "name": "First Supervised Lesson", "description": "Teach first lesson with observation.", "group": "Supervised Practice", "position": 0, "priority": "urgent", "due_days_offset": 11, "tags": ["tutor", "teaching"]},
    {"id": "super-2", "name": "Final Evaluation", "description": "Receive approval for independent teaching.", "group": "Supervised Practice", "position": 1, "priority": "urgent", "due_days_offset": 15, "tags": ["tutor", "evaluation"]},
    {"id": "ind-1", "name": "First Independent Lesson", "description": "Teach first lesson independently!", "group": "Independent Teaching", "position": 0, "priority": "urgent", "due_days_offset": 17, "tags": ["tutor", "milestone"]},
    {"id": "ind-2", "name": "30-Day Review", "description": "Conduct 30-day performance review.", "group": "Independent Teaching", "position": 1, "priority": "high", "due_days_offset": 35, "tags": ["tutor", "review"]}
  ]'::jsonb,
  NULL,
  '["Hiring & Admin", "Training", "Shadowing", "Supervised Practice", "Independent Teaching"]'::jsonb,
  true,
  true,
  'system'
) ON CONFLICT DO NOTHING;

