-- Pre-built Workflow Templates for Acme Operations Operations
-- Based on franchise documentation and operations manuals

-- 1. FRANCHISE ONBOARDING WORKFLOW
-- Based on "Franchise Training Weekly Timeline.pdf"
INSERT INTO task_workflow_templates (
  id,
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
  gen_random_uuid(),
  'Franchise Onboarding - Complete Program',
  'Complete 8-week franchise onboarding program covering brand understanding, operations training, marketing setup, and launch preparation.',
  'franchise_onboarding',
  '🎯',
  '[
    {"id": "week1-1", "name": "Review Brand Values and Mission", "description": "Study the Acme Operations brand, mission, and core values. Complete brand training materials.", "group": "Week 1: Brand Understanding", "position": 0, "priority": "high", "due_days_offset": 1, "tags": ["onboarding", "brand"]},
    {"id": "week1-2", "name": "Product Knowledge Training", "description": "Complete product training: Acme Operations game, curriculum, and teaching methodology.", "group": "Week 1: Brand Understanding", "position": 1, "priority": "high", "due_days_offset": 3, "dependencies": ["week1-1"], "tags": ["onboarding", "product"]},
    {"id": "week1-3", "name": "Review Parent and Educator Profiles", "description": "Study target customer profiles and understand their needs and motivations.", "group": "Week 1: Brand Understanding", "position": 2, "priority": "medium", "due_days_offset": 5, "tags": ["onboarding", "marketing"]},
    {"id": "week1-4", "name": "Complete Super Tutor Guide Review", "description": "Read and understand the Owner'\''s Guide to Super Tutors.", "group": "Week 1: Brand Understanding", "position": 3, "priority": "high", "due_days_offset": 7, "tags": ["onboarding", "tutors"]},
    
    {"id": "week2-1", "name": "Operations Manual Section 1: Introduction", "description": "Review Section 1 of the Operations Manual covering business introduction.", "group": "Week 2-3: Operations Training", "position": 0, "priority": "high", "due_days_offset": 8, "tags": ["onboarding", "operations"]},
    {"id": "week2-2", "name": "Operations Manual Section 2: Establishing Business", "description": "Complete Section 2 covering business establishment procedures.", "group": "Week 2-3: Operations Training", "position": 1, "priority": "high", "due_days_offset": 10, "dependencies": ["week2-1"], "tags": ["onboarding", "operations"]},
    {"id": "week2-3", "name": "Operations Manual Section 3: Personnel", "description": "Review Section 3 covering personnel management and tutor recruitment.", "group": "Week 2-3: Operations Training", "position": 2, "priority": "high", "due_days_offset": 12, "dependencies": ["week2-2"], "tags": ["onboarding", "operations", "hr"]},
    {"id": "week2-4", "name": "Set Up TutorCruncher Account", "description": "Configure TutorCruncher account for scheduling, billing, and client management.", "group": "Week 2-3: Operations Training", "position": 3, "priority": "high", "due_days_offset": 14, "tags": ["onboarding", "tech"]},
    
    {"id": "week3-1", "name": "Operations Manual Section 4: Marketing", "description": "Complete Section 4 covering marketing strategies and tactics.", "group": "Week 2-3: Operations Training", "position": 4, "priority": "high", "due_days_offset": 15, "tags": ["onboarding", "marketing"]},
    {"id": "week3-2", "name": "Operations Manual Section 5: Operating Procedures", "description": "Review Section 5 covering day-to-day operating procedures.", "group": "Week 2-3: Operations Training", "position": 5, "priority": "high", "due_days_offset": 17, "dependencies": ["week3-1"], "tags": ["onboarding", "operations"]},
    {"id": "week3-3", "name": "Shadow Existing Franchise Operations", "description": "Schedule and complete shadowing sessions with successful franchise.", "group": "Week 2-3: Operations Training", "position": 6, "priority": "medium", "due_days_offset": 21, "tags": ["onboarding", "training"]},
    
    {"id": "week4-1", "name": "Review Marketing Tool Overview", "description": "Study all available marketing tools and resources.", "group": "Week 4: Marketing Setup", "position": 0, "priority": "high", "due_days_offset": 22, "tags": ["onboarding", "marketing"]},
    {"id": "week4-2", "name": "Local Marketing Deep Dive", "description": "Complete local marketing strategy training and planning.", "group": "Week 4: Marketing Setup", "position": 1, "priority": "high", "due_days_offset": 24, "dependencies": ["week4-1"], "tags": ["onboarding", "marketing"]},
    {"id": "week4-3", "name": "Set Up Social Media Accounts", "description": "Create and configure Facebook, Instagram, and other social media accounts.", "group": "Week 4: Marketing Setup", "position": 2, "priority": "high", "due_days_offset": 26, "tags": ["onboarding", "marketing", "social"]},
    {"id": "week4-4", "name": "Create Initial Marketing Calendar", "description": "Plan first 90 days of marketing activities and campaigns.", "group": "Week 4: Marketing Setup", "position": 3, "priority": "medium", "due_days_offset": 28, "dependencies": ["week4-2", "week4-3"], "tags": ["onboarding", "marketing"]},
    
    {"id": "week5-1", "name": "Sales Funnel Training: Discovery", "description": "Complete training on discovery call best practices.", "group": "Week 5-8: Launch Preparation", "position": 0, "priority": "high", "due_days_offset": 29, "tags": ["onboarding", "sales"]},
    {"id": "week5-2", "name": "Sales Funnel Training: Demo", "description": "Complete training on delivering effective product demos.", "group": "Week 5-8: Launch Preparation", "position": 1, "priority": "high", "due_days_offset": 31, "dependencies": ["week5-1"], "tags": ["onboarding", "sales"]},
    {"id": "week5-3", "name": "Sales Funnel Training: Conversion", "description": "Learn conversion techniques and closing strategies.", "group": "Week 5-8: Launch Preparation", "position": 2, "priority": "high", "due_days_offset": 33, "dependencies": ["week5-2"], "tags": ["onboarding", "sales"]},
    {"id": "week5-4", "name": "Sales Funnel Training: Retention", "description": "Study client retention and upsell strategies.", "group": "Week 5-8: Launch Preparation", "position": 3, "priority": "medium", "due_days_offset": 35, "dependencies": ["week5-3"], "tags": ["onboarding", "sales"]},
    
    {"id": "week6-1", "name": "Recruit First Wave of Tutors", "description": "Post tutor job listings and begin interview process.", "group": "Week 5-8: Launch Preparation", "position": 4, "priority": "urgent", "due_days_offset": 36, "tags": ["onboarding", "hr", "tutors"]},
    {"id": "week6-2", "name": "Complete Tutor Onboarding for Initial Hires", "description": "Train and onboard first group of tutors.", "group": "Week 5-8: Launch Preparation", "position": 5, "priority": "urgent", "due_days_offset": 42, "dependencies": ["week6-1"], "tags": ["onboarding", "tutors"]},
    {"id": "week6-3", "name": "Secure Initial Venue Partnerships", "description": "Establish partnerships with schools, libraries, and community centers.", "group": "Week 5-8: Launch Preparation", "position": 6, "priority": "high", "due_days_offset": 42, "tags": ["onboarding", "partnerships"]},
    
    {"id": "week7-1", "name": "Plan Soft Launch Event", "description": "Design and plan soft launch event for friends and family.", "group": "Week 5-8: Launch Preparation", "position": 7, "priority": "high", "due_days_offset": 43, "tags": ["onboarding", "launch", "events"]},
    {"id": "week7-2", "name": "Execute Soft Launch Event", "description": "Conduct soft launch event and gather feedback.", "group": "Week 5-8: Launch Preparation", "position": 8, "priority": "urgent", "due_days_offset": 49, "dependencies": ["week7-1", "week6-2"], "tags": ["onboarding", "launch", "events"]},
    {"id": "week7-3", "name": "Refine Operations Based on Feedback", "description": "Implement improvements based on soft launch feedback.", "group": "Week 5-8: Launch Preparation", "position": 9, "priority": "high", "due_days_offset": 52, "dependencies": ["week7-2"], "tags": ["onboarding", "improvement"]},
    
    {"id": "week8-1", "name": "Plan Official Launch Campaign", "description": "Create comprehensive launch campaign with marketing materials.", "group": "Week 5-8: Launch Preparation", "position": 10, "priority": "urgent", "due_days_offset": 50, "tags": ["onboarding", "launch", "marketing"]},
    {"id": "week8-2", "name": "Launch Public Marketing Campaign", "description": "Execute official launch marketing across all channels.", "group": "Week 5-8: Launch Preparation", "position": 11, "priority": "urgent", "due_days_offset": 56, "dependencies": ["week8-1", "week7-3"], "tags": ["onboarding", "launch", "marketing"]},
    {"id": "week8-3", "name": "Official Launch Celebration", "description": "Host official launch event and celebrate!", "group": "Week 5-8: Launch Preparation", "position": 12, "priority": "urgent", "due_days_offset": 56, "dependencies": ["week8-2"], "tags": ["onboarding", "launch", "celebration"]}
  ]'::jsonb,
  'Franchise Onboarding - {{franchisee_name}}',
  '["Week 1: Brand Understanding", "Week 2-3: Operations Training", "Week 4: Marketing Setup", "Week 5-8: Launch Preparation"]'::jsonb,
  true,
  true,
  'system'
);

-- 2. EVENT SETUP WORKFLOW
-- Based on "How to prep and conduct a STC Event (street fair).pdf"
INSERT INTO task_workflow_templates (
  id,
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
  gen_random_uuid(),
  'Street Fair / Event Setup',
  'Complete checklist for preparing and conducting a Acme Operations event at street fairs, festivals, or community gatherings.',
  'event_setup',
  '🎪',
  '[
    {"id": "prep-1", "name": "Identify Target Event", "description": "Research and identify suitable street fair, festival, or community event.", "group": "Pre-Event Planning", "position": 0, "priority": "high", "due_days_offset": -30, "tags": ["event", "planning"]},
    {"id": "prep-2", "name": "Submit Vendor Application", "description": "Complete and submit vendor application with booth fee payment.", "group": "Pre-Event Planning", "position": 1, "priority": "high", "due_days_offset": -28, "dependencies": ["prep-1"], "tags": ["event", "admin"]},
    {"id": "prep-3", "name": "Confirm Booth Assignment", "description": "Receive and confirm booth location and setup time.", "group": "Pre-Event Planning", "position": 2, "priority": "high", "due_days_offset": -21, "dependencies": ["prep-2"], "tags": ["event", "logistics"]},
    {"id": "prep-4", "name": "Plan Event Marketing", "description": "Create social media posts and marketing materials for the event.", "group": "Pre-Event Planning", "position": 3, "priority": "medium", "due_days_offset": -14, "tags": ["event", "marketing"]},
    
    {"id": "materials-1", "name": "Order Printed Materials", "description": "Order brochures, business cards, sign-up sheets, and promotional items.", "group": "Materials Preparation", "position": 0, "priority": "high", "due_days_offset": -21, "tags": ["event", "materials"]},
    {"id": "materials-2", "name": "Prepare Demo Boards", "description": "Ensure 3-5 chess boards are complete with all pieces and storybooks.", "group": "Materials Preparation", "position": 1, "priority": "high", "due_days_offset": -7, "tags": ["event", "materials"]},
    {"id": "materials-3", "name": "Create Event Display", "description": "Design and build attractive booth display with banners and signage.", "group": "Materials Preparation", "position": 2, "priority": "medium", "due_days_offset": -7, "dependencies": ["materials-1"], "tags": ["event", "materials"]},
    {"id": "materials-4", "name": "Prepare Prize/Giveaway Items", "description": "Acquire small prizes, stickers, or promotional items for kids.", "group": "Materials Preparation", "position": 3, "priority": "low", "due_days_offset": -7, "tags": ["event", "materials"]},
    {"id": "materials-5", "name": "Pack Event Supply Kit", "description": "Assemble: table covers, chairs, tablet for sign-ups, charger, water, snacks.", "group": "Materials Preparation", "position": 4, "priority": "medium", "due_days_offset": -2, "dependencies": ["materials-2", "materials-3"], "tags": ["event", "logistics"]},
    
    {"id": "staff-1", "name": "Recruit Event Volunteers", "description": "Recruit 2-3 staff/tutors/volunteers to help at the event.", "group": "Staffing & Training", "position": 0, "priority": "high", "due_days_offset": -14, "tags": ["event", "staffing"]},
    {"id": "staff-2", "name": "Train Event Staff", "description": "Brief staff on demo process, talking points, and lead capture.", "group": "Staffing & Training", "position": 1, "priority": "high", "due_days_offset": -3, "dependencies": ["staff-1"], "tags": ["event", "training"]},
    {"id": "staff-3", "name": "Create Staff Schedule", "description": "Assign specific roles and shifts for event day.", "group": "Staffing & Training", "position": 2, "priority": "medium", "due_days_offset": -2, "dependencies": ["staff-2"], "tags": ["event", "logistics"]},
    
    {"id": "promo-1", "name": "Post Event Announcement on Social Media", "description": "Announce participation in event across all social channels.", "group": "Pre-Event Promotion", "position": 0, "priority": "medium", "due_days_offset": -7, "tags": ["event", "marketing", "social"]},
    {"id": "promo-2", "name": "Email Existing Clients About Event", "description": "Invite existing clients to stop by booth at the event.", "group": "Pre-Event Promotion", "position": 1, "priority": "low", "due_days_offset": -5, "tags": ["event", "marketing", "email"]},
    {"id": "promo-3", "name": "Create Event Day Special Offer", "description": "Design special discount or offer for event attendees.", "group": "Pre-Event Promotion", "position": 2, "priority": "medium", "due_days_offset": -7, "tags": ["event", "sales"]},
    
    {"id": "day-1", "name": "Arrive Early for Setup", "description": "Arrive 1-2 hours before event start for booth setup.", "group": "Event Day", "position": 0, "priority": "urgent", "due_days_offset": 0, "tags": ["event", "execution"]},
    {"id": "day-2", "name": "Set Up Booth and Displays", "description": "Set up table, displays, demo stations, and signage.", "group": "Event Day", "position": 1, "priority": "urgent", "due_days_offset": 0, "dependencies": ["day-1"], "tags": ["event", "execution"]},
    {"id": "day-3", "name": "Conduct Demos Throughout Day", "description": "Engage attendees with interactive demos and capture leads.", "group": "Event Day", "position": 2, "priority": "urgent", "due_days_offset": 0, "dependencies": ["day-2"], "tags": ["event", "execution", "sales"]},
    {"id": "day-4", "name": "Pack Up and Break Down", "description": "Pack all materials and break down booth at end of event.", "group": "Event Day", "position": 3, "priority": "high", "due_days_offset": 0, "dependencies": ["day-3"], "tags": ["event", "logistics"]},
    
    {"id": "follow-1", "name": "Enter All Leads into CRM", "description": "Input all contact information from sign-up sheets into system.", "group": "Post-Event Follow-Up", "position": 0, "priority": "urgent", "due_days_offset": 1, "tags": ["event", "admin", "leads"]},
    {"id": "follow-2", "name": "Send Thank You Email to Leads", "description": "Email all event attendees with thank you and special offer.", "group": "Post-Event Follow-Up", "position": 1, "priority": "high", "due_days_offset": 2, "dependencies": ["follow-1"], "tags": ["event", "marketing", "followup"]},
    {"id": "follow-3", "name": "Schedule Discovery Calls", "description": "Reach out to qualified leads to schedule discovery calls.", "group": "Post-Event Follow-Up", "position": 2, "priority": "high", "due_days_offset": 3, "dependencies": ["follow-2"], "tags": ["event", "sales", "followup"]},
    {"id": "follow-4", "name": "Post Event Recap on Social Media", "description": "Share photos and highlights from the event.", "group": "Post-Event Follow-Up", "position": 3, "priority": "medium", "due_days_offset": 2, "tags": ["event", "marketing", "social"]},
    {"id": "follow-5", "name": "Evaluate Event ROI", "description": "Calculate leads generated, conversions, and overall event success.", "group": "Post-Event Follow-Up", "position": 4, "priority": "medium", "due_days_offset": 14, "tags": ["event", "analysis"]}
  ]'::jsonb,
  'Event: {{event_name}}',
  '["Pre-Event Planning", "Materials Preparation", "Staffing & Training", "Pre-Event Promotion", "Event Day", "Post-Event Follow-Up"]'::jsonb,
  true,
  true,
  'system'
);

-- 3. SALES FUNNEL WORKFLOW
-- Based on "Sales Funnel Training.pdf"
INSERT INTO task_workflow_templates (
  id,
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
  gen_random_uuid(),
  'Sales Funnel: Discovery to Retention',
  'Complete sales funnel workflow from initial discovery call through conversion and retention.',
  'sales_funnel',
  '🎯',
  '[
    {"id": "disc-1", "name": "Review Lead Information", "description": "Review all available information about prospect: source, interests, children ages.", "group": "Discovery", "position": 0, "priority": "high", "due_days_offset": 0, "tags": ["sales", "discovery"]},
    {"id": "disc-2", "name": "Prepare Discovery Call Script", "description": "Review discovery call best practices and prepare personalized questions.", "group": "Discovery", "position": 1, "priority": "high", "due_days_offset": 0, "dependencies": ["disc-1"], "tags": ["sales", "discovery"]},
    {"id": "disc-3", "name": "Conduct Discovery Call", "description": "Connect with prospect to understand needs, challenges, and goals.", "group": "Discovery", "position": 2, "priority": "urgent", "due_days_offset": 1, "dependencies": ["disc-2"], "tags": ["sales", "discovery", "call"]},
    {"id": "disc-4", "name": "Document Call Notes", "description": "Record key insights, pain points, and next steps in CRM.", "group": "Discovery", "position": 3, "priority": "high", "due_days_offset": 1, "dependencies": ["disc-3"], "tags": ["sales", "admin"]},
    {"id": "disc-5", "name": "Determine Qualification", "description": "Assess if prospect is qualified: budget, need, timeline, authority.", "group": "Discovery", "position": 4, "priority": "high", "due_days_offset": 1, "dependencies": ["disc-4"], "tags": ["sales", "qualification"]},
    
    {"id": "demo-1", "name": "Schedule Demo Session", "description": "Book demo time that works for prospect (include child if possible).", "group": "Demo", "position": 0, "priority": "high", "due_days_offset": 2, "dependencies": ["disc-5"], "tags": ["sales", "demo"]},
    {"id": "demo-2", "name": "Send Demo Confirmation", "description": "Email demo details, what to expect, and preparation instructions.", "group": "Demo", "position": 1, "priority": "medium", "due_days_offset": 2, "dependencies": ["demo-1"], "tags": ["sales", "demo", "communication"]},
    {"id": "demo-3", "name": "Prepare Demo Materials", "description": "Gather game, storybook, and customize demo based on child'\''s interests.", "group": "Demo", "position": 2, "priority": "high", "due_days_offset": 3, "dependencies": ["demo-1"], "tags": ["sales", "demo", "prep"]},
    {"id": "demo-4", "name": "Conduct Product Demo", "description": "Deliver engaging demo showing how Acme Operations works.", "group": "Demo", "position": 3, "priority": "urgent", "due_days_offset": 5, "dependencies": ["demo-2", "demo-3"], "tags": ["sales", "demo", "execution"]},
    {"id": "demo-5", "name": "Capture Demo Feedback", "description": "Note child'\''s engagement, parent questions, and interest level.", "group": "Demo", "position": 4, "priority": "high", "due_days_offset": 5, "dependencies": ["demo-4"], "tags": ["sales", "feedback"]},
    
    {"id": "conv-1", "name": "Send Follow-Up Email", "description": "Thank prospect for their time and address any questions raised.", "group": "Conversion", "position": 0, "priority": "high", "due_days_offset": 6, "dependencies": ["demo-5"], "tags": ["sales", "followup"]},
    {"id": "conv-2", "name": "Present Package Options", "description": "Share detailed package information, pricing, and enrollment process.", "group": "Conversion", "position": 1, "priority": "high", "due_days_offset": 6, "dependencies": ["conv-1"], "tags": ["sales", "proposal"]},
    {"id": "conv-3", "name": "Address Objections", "description": "Handle any concerns about price, time commitment, or value.", "group": "Conversion", "position": 2, "priority": "high", "due_days_offset": 7, "dependencies": ["conv-2"], "tags": ["sales", "objections"]},
    {"id": "conv-4", "name": "Make The Ask", "description": "Ask for the sale: \"When would you like to get started?\"", "group": "Conversion", "position": 3, "priority": "urgent", "due_days_offset": 7, "dependencies": ["conv-3"], "tags": ["sales", "close"]},
    {"id": "conv-5", "name": "Process Enrollment", "description": "Complete enrollment paperwork, collect payment, schedule first lesson.", "group": "Conversion", "position": 4, "priority": "urgent", "due_days_offset": 8, "dependencies": ["conv-4"], "tags": ["sales", "onboarding"]},
    
    {"id": "ret-1", "name": "Send Welcome Package", "description": "Email welcome materials, tutor info, and what to expect.", "group": "Retention", "position": 0, "priority": "high", "due_days_offset": 9, "dependencies": ["conv-5"], "tags": ["retention", "onboarding"]},
    {"id": "ret-2", "name": "Check In After First Lesson", "description": "Follow up to ensure first lesson went well and address any concerns.", "group": "Retention", "position": 1, "priority": "high", "due_days_offset": 14, "tags": ["retention", "support"]},
    {"id": "ret-3", "name": "Monthly Progress Check-In", "description": "Schedule monthly check-in to discuss progress and satisfaction.", "group": "Retention", "position": 2, "priority": "medium", "due_days_offset": 35, "dependencies": ["ret-2"], "tags": ["retention", "support"]},
    {"id": "ret-4", "name": "Request Testimonial/Review", "description": "Ask satisfied client for testimonial or online review.", "group": "Retention", "position": 3, "priority": "medium", "due_days_offset": 60, "tags": ["retention", "testimonials"]},
    {"id": "ret-5", "name": "Explore Upsell Opportunities", "description": "Discuss additional services: more lessons, sibling enrollment, camps.", "group": "Retention", "position": 4, "priority": "low", "due_days_offset": 90, "tags": ["retention", "upsell"]}
  ]'::jsonb,
  null,
  '["Discovery", "Demo", "Conversion", "Retention"]'::jsonb,
  true,
  true,
  'system'
);

-- 4. MARKETING CAMPAIGN WORKFLOW
-- Based on "Marketing Tool Overview.pdf" and "Local Marketing Deep Dive.pdf"
INSERT INTO task_workflow_templates (
  id,
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
  gen_random_uuid(),
  'Marketing Campaign Launch',
  'Complete marketing campaign workflow from planning through execution and analytics tracking.',
  'marketing_campaign',
  '📢',
  '[
    {"id": "plan-1", "name": "Define Campaign Goals", "description": "Set specific, measurable goals: leads, conversions, awareness.", "group": "Campaign Planning", "position": 0, "priority": "high", "due_days_offset": 0, "tags": ["marketing", "planning"]},
    {"id": "plan-2", "name": "Identify Target Audience", "description": "Define target demographics, interests, and geographic area.", "group": "Campaign Planning", "position": 1, "priority": "high", "due_days_offset": 1, "dependencies": ["plan-1"], "tags": ["marketing", "planning"]},
    {"id": "plan-3", "name": "Set Campaign Budget", "description": "Allocate budget across channels: social ads, print, events.", "group": "Campaign Planning", "position": 2, "priority": "high", "due_days_offset": 2, "dependencies": ["plan-1"], "tags": ["marketing", "budget"]},
    {"id": "plan-4", "name": "Select Marketing Channels", "description": "Choose channels: Facebook/Instagram ads, local press, community boards.", "group": "Campaign Planning", "position": 3, "priority": "medium", "due_days_offset": 3, "dependencies": ["plan-2", "plan-3"], "tags": ["marketing", "channels"]},
    {"id": "plan-5", "name": "Create Campaign Timeline", "description": "Map out campaign duration, key dates, and milestones.", "group": "Campaign Planning", "position": 4, "priority": "medium", "due_days_offset": 4, "dependencies": ["plan-4"], "tags": ["marketing", "planning"]},
    
    {"id": "content-1", "name": "Develop Campaign Messaging", "description": "Create core messaging, value propositions, and call-to-action.", "group": "Content Creation", "position": 0, "priority": "high", "due_days_offset": 5, "tags": ["marketing", "content"]},
    {"id": "content-2", "name": "Design Social Media Graphics", "description": "Create eye-catching graphics for Facebook and Instagram.", "group": "Content Creation", "position": 1, "priority": "high", "due_days_offset": 7, "dependencies": ["content-1"], "tags": ["marketing", "design", "social"]},
    {"id": "content-3", "name": "Write Ad Copy", "description": "Craft compelling ad copy for each channel and format.", "group": "Content Creation", "position": 2, "priority": "high", "due_days_offset": 8, "dependencies": ["content-1"], "tags": ["marketing", "copywriting"]},
    {"id": "content-4", "name": "Create Landing Page", "description": "Build dedicated landing page for campaign with lead capture form.", "group": "Content Creation", "position": 3, "priority": "high", "due_days_offset": 9, "dependencies": ["content-2", "content-3"], "tags": ["marketing", "web"]},
    {"id": "content-5", "name": "Prepare Email Sequences", "description": "Write automated email follow-up sequences for leads.", "group": "Content Creation", "position": 4, "priority": "medium", "due_days_offset": 10, "tags": ["marketing", "email"]},
    
    {"id": "dist-1", "name": "Set Up Facebook Ad Campaign", "description": "Create and configure Facebook ad campaign with targeting.", "group": "Distribution Setup", "position": 0, "priority": "high", "due_days_offset": 11, "dependencies": ["content-4"], "tags": ["marketing", "facebook", "ads"]},
    {"id": "dist-2", "name": "Set Up Instagram Ad Campaign", "description": "Create and configure Instagram ad campaign.", "group": "Distribution Setup", "position": 1, "priority": "high", "due_days_offset": 11, "dependencies": ["content-4"], "tags": ["marketing", "instagram", "ads"]},
    {"id": "dist-3", "name": "Submit Local Press Releases", "description": "Send press releases to local newspapers, blogs, and media.", "group": "Distribution Setup", "position": 2, "priority": "medium", "due_days_offset": 12, "tags": ["marketing", "pr"]},
    {"id": "dist-4", "name": "Post to Community Boards", "description": "Share campaign on local Facebook groups, Nextdoor, community boards.", "group": "Distribution Setup", "position": 3, "priority": "medium", "due_days_offset": 13, "tags": ["marketing", "community"]},
    {"id": "dist-5", "name": "Distribute Print Materials", "description": "Place flyers at libraries, schools, coffee shops, family venues.", "group": "Distribution Setup", "position": 4, "priority": "low", "due_days_offset": 14, "tags": ["marketing", "print"]},
    
    {"id": "launch-1", "name": "Launch Campaign!", "description": "Activate all ads and begin campaign distribution.", "group": "Campaign Launch", "position": 0, "priority": "urgent", "due_days_offset": 14, "dependencies": ["dist-1", "dist-2"], "tags": ["marketing", "launch"]},
    {"id": "launch-2", "name": "Monitor Initial Performance", "description": "Track first 24-48 hours of campaign performance and engagement.", "group": "Campaign Launch", "position": 1, "priority": "high", "due_days_offset": 15, "dependencies": ["launch-1"], "tags": ["marketing", "analytics"]},
    {"id": "launch-3", "name": "Make Initial Optimizations", "description": "Adjust targeting, budget allocation, or creative based on early data.", "group": "Campaign Launch", "position": 2, "priority": "high", "due_days_offset": 17, "dependencies": ["launch-2"], "tags": ["marketing", "optimization"]},
    
    {"id": "track-1", "name": "Daily Performance Check", "description": "Review daily: impressions, clicks, cost-per-lead, conversions.", "group": "Analytics & Tracking", "position": 0, "priority": "high", "due_days_offset": 15, "tags": ["marketing", "analytics", "daily"]},
    {"id": "track-2", "name": "Weekly Performance Report", "description": "Compile weekly report with key metrics and insights.", "group": "Analytics & Tracking", "position": 1, "priority": "medium", "due_days_offset": 21, "tags": ["marketing", "analytics", "reporting"]},
    {"id": "track-3", "name": "Mid-Campaign Review", "description": "Comprehensive mid-campaign review and strategy adjustment.", "group": "Analytics & Tracking", "position": 2, "priority": "high", "due_days_offset": 28, "dependencies": ["track-2"], "tags": ["marketing", "analytics", "review"]},
    {"id": "track-4", "name": "Final Campaign Report", "description": "Complete final campaign analysis: ROI, lessons learned, recommendations.", "group": "Analytics & Tracking", "position": 3, "priority": "high", "due_days_offset": 60, "tags": ["marketing", "analytics", "reporting"]},
    {"id": "track-5", "name": "Archive Campaign Assets", "description": "Save all campaign materials, data, and learnings for future reference.", "group": "Analytics & Tracking", "position": 4, "priority": "low", "due_days_offset": 65, "dependencies": ["track-4"], "tags": ["marketing", "admin"]}
  ]'::jsonb,
  'Campaign: {{campaign_name}}',
  '["Campaign Planning", "Content Creation", "Distribution Setup", "Campaign Launch", "Analytics & Tracking"]'::jsonb,
  true,
  true,
  'system'
);

-- 5. NEW TUTOR ONBOARDING WORKFLOW
-- Based on "Owner'\''s Guide to Super Tutors.pdf"
INSERT INTO task_workflow_templates (
  id,
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
  gen_random_uuid(),
  'New Tutor Onboarding',
  'Complete onboarding workflow for new tutors from hiring through first independent lessons.',
  'tutor_onboarding',
  '👨‍🏫',
  '[
    {"id": "hire-1", "name": "Complete Background Check", "description": "Submit and process background check through approved vendor.", "group": "Hiring & Admin", "position": 0, "priority": "urgent", "due_days_offset": 0, "tags": ["tutor", "hr", "compliance"]},
    {"id": "hire-2", "name": "Sign Employment Paperwork", "description": "Complete W-9/W-4, direct deposit, and employment agreement.", "group": "Hiring & Admin", "position": 1, "priority": "urgent", "due_days_offset": 1, "tags": ["tutor", "hr", "admin"]},
    {"id": "hire-3", "name": "Set Up TutorCruncher Profile", "description": "Create tutor profile in scheduling system with availability.", "group": "Hiring & Admin", "position": 2, "priority": "high", "due_days_offset": 1, "dependencies": ["hire-2"], "tags": ["tutor", "tech"]},
    {"id": "hire-4", "name": "Send Welcome Email", "description": "Email welcome message with training schedule and resources.", "group": "Hiring & Admin", "position": 3, "priority": "high", "due_days_offset": 1, "dependencies": ["hire-3"], "tags": ["tutor", "communication"]},
    
    {"id": "train-1", "name": "Product Training Session", "description": "Complete training on Acme Operations game, pieces, and storylines.", "group": "Training", "position": 0, "priority": "urgent", "due_days_offset": 2, "tags": ["tutor", "training", "product"]},
    {"id": "train-2", "name": "Teaching Methodology Training", "description": "Learn Acme Operations teaching approach and best practices.", "group": "Training", "position": 1, "priority": "urgent", "due_days_offset": 3, "dependencies": ["train-1"], "tags": ["tutor", "training", "pedagogy"]},
    {"id": "train-3", "name": "Review Super Tutor Guide", "description": "Read Owner'\''s Guide to Super Tutors in full.", "group": "Training", "position": 2, "priority": "high", "due_days_offset": 4, "tags": ["tutor", "training"]},
    {"id": "train-4", "name": "Practice Demo Session", "description": "Conduct practice demo with feedback from experienced tutor.", "group": "Training", "position": 3, "priority": "high", "due_days_offset": 5, "dependencies": ["train-2"], "tags": ["tutor", "training", "practice"]},
    {"id": "train-5", "name": "Behavior Management Training", "description": "Learn techniques for managing different learning styles and behaviors.", "group": "Training", "position": 4, "priority": "high", "due_days_offset": 6, "tags": ["tutor", "training", "management"]},
    {"id": "train-6", "name": "Parent Communication Training", "description": "Best practices for communicating with parents and providing updates.", "group": "Training", "position": 5, "priority": "medium", "due_days_offset": 7, "tags": ["tutor", "training", "communication"]},
    
    {"id": "shadow-1", "name": "Shadow Experienced Tutor - Session 1", "description": "Observe first lesson with experienced tutor.", "group": "Shadowing", "position": 0, "priority": "urgent", "due_days_offset": 7, "dependencies": ["train-4"], "tags": ["tutor", "shadowing"]},
    {"id": "shadow-2", "name": "Shadow Experienced Tutor - Session 2", "description": "Observe second lesson, different age group.", "group": "Shadowing", "position": 1, "priority": "high", "due_days_offset": 8, "dependencies": ["shadow-1"], "tags": ["tutor", "shadowing"]},
    {"id": "shadow-3", "name": "Shadow Experienced Tutor - Session 3", "description": "Observe third lesson, take notes on techniques used.", "group": "Shadowing", "position": 2, "priority": "high", "due_days_offset": 9, "dependencies": ["shadow-2"], "tags": ["tutor", "shadowing"]},
    {"id": "shadow-4", "name": "Debriefing Session", "description": "Discuss observations and questions with experienced tutor.", "group": "Shadowing", "position": 3, "priority": "high", "due_days_offset": 10, "dependencies": ["shadow-3"], "tags": ["tutor", "feedback"]},
    
    {"id": "super-1", "name": "First Supervised Lesson", "description": "Teach first lesson with experienced tutor observing and supporting.", "group": "Supervised Practice", "position": 0, "priority": "urgent", "due_days_offset": 11, "dependencies": ["shadow-4"], "tags": ["tutor", "teaching", "supervised"]},
    {"id": "super-2", "name": "Receive Feedback on First Lesson", "description": "Get detailed feedback and coaching from supervising tutor.", "group": "Supervised Practice", "position": 1, "priority": "high", "due_days_offset": 11, "dependencies": ["super-1"], "tags": ["tutor", "feedback"]},
    {"id": "super-3", "name": "Second Supervised Lesson", "description": "Teach second lesson with observation, implementing feedback.", "group": "Supervised Practice", "position": 2, "priority": "high", "due_days_offset": 13, "dependencies": ["super-2"], "tags": ["tutor", "teaching", "supervised"]},
    {"id": "super-4", "name": "Third Supervised Lesson", "description": "Final supervised lesson before independent teaching.", "group": "Supervised Practice", "position": 3, "priority": "high", "due_days_offset": 15, "dependencies": ["super-3"], "tags": ["tutor", "teaching", "supervised"]},
    {"id": "super-5", "name": "Final Evaluation", "description": "Receive final evaluation and approval for independent teaching.", "group": "Supervised Practice", "position": 4, "priority": "urgent", "due_days_offset": 15, "dependencies": ["super-4"], "tags": ["tutor", "evaluation"]},
    
    {"id": "ind-1", "name": "First Independent Lesson", "description": "Teach first lesson independently!", "group": "Independent Teaching", "position": 0, "priority": "urgent", "due_days_offset": 17, "dependencies": ["super-5"], "tags": ["tutor", "teaching", "milestone"]},
    {"id": "ind-2", "name": "Check-In After First Solo", "description": "Debrief first independent lesson and address any concerns.", "group": "Independent Teaching", "position": 1, "priority": "high", "due_days_offset": 18, "dependencies": ["ind-1"], "tags": ["tutor", "support"]},
    {"id": "ind-3", "name": "30-Day Review", "description": "Conduct 30-day review: performance, parent feedback, tutor satisfaction.", "group": "Independent Teaching", "position": 2, "priority": "high", "due_days_offset": 35, "tags": ["tutor", "review"]},
    {"id": "ind-4", "name": "90-Day Performance Review", "description": "Comprehensive 90-day review and set development goals.", "group": "Independent Teaching", "position": 3, "priority": "medium", "due_days_offset": 95, "tags": ["tutor", "review", "development"]}
  ]'::jsonb,
  null,
  '["Hiring & Admin", "Training", "Shadowing", "Supervised Practice", "Independent Teaching"]'::jsonb,
  true,
  true,
  'system'
);

-- Add comment
COMMENT ON TABLE task_workflow_templates IS 'Pre-built workflow templates for common Acme Operations operations and franchise management';

