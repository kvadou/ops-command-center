-- =============================================================================
-- OPS COMMAND CENTER - DEMO SEED DATA
-- =============================================================================
-- Safe to re-run: uses ON CONFLICT DO NOTHING or explicit ID ranges (100+)
-- Target: ops-command-center.onrender.com (PostgreSQL)
-- Run with: psql $DATABASE_URL -f seed-demo.sql
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ADMINISTRATORS (5 users for /admin/users)
-- =============================================================================
INSERT INTO administrators (id, first_name, last_name, email, role, status, last_login)
VALUES
  (100, 'Demo', 'User', 'demo@acmeops.com', 'super_admin', 'active', NOW() - INTERVAL '1 hour'),
  (101, 'Sarah', 'Mitchell', 'sarah.mitchell@acmeops.com', 'admin', 'active', NOW() - INTERVAL '3 hours'),
  (102, 'James', 'Thornton', 'james.thornton@acmeops.com', 'manager', 'active', NOW() - INTERVAL '1 day'),
  (103, 'Priya', 'Desai', 'priya.desai@acmeops.com', 'manager', 'active', NOW() - INTERVAL '2 days'),
  (104, 'Mike', 'Rawlings', 'mike.rawlings@acmeops.com', 'viewer', 'active', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- Also seed into users table for auth
INSERT INTO users (id, first_name, last_name, email, password, role)
VALUES
  (100, 'Demo', 'User', 'demo@acmeops.com', '$2b$10$demohashedpasswordplaceholder000000000000000000000', 'super_admin'),
  (101, 'Sarah', 'Mitchell', 'sarah.mitchell@acmeops.com', '$2b$10$demohashedpasswordplaceholder000000000000000000000', 'admin'),
  (102, 'James', 'Thornton', 'james.thornton@acmeops.com', '$2b$10$demohashedpasswordplaceholder000000000000000000000', 'manager'),
  (103, 'Priya', 'Desai', 'priya.desai@acmeops.com', '$2b$10$demohashedpasswordplaceholder000000000000000000000', 'manager'),
  (104, 'Mike', 'Rawlings', 'mike.rawlings@acmeops.com', '$2b$10$demohashedpasswordplaceholder000000000000000000000', 'viewer')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2. CLIENTS (40 more across pipeline stages and markets)
-- =============================================================================
-- Pipeline stages: 1=New Lead, 2=Trial Scheduled, 3=Trial Completed, 4=Waiting to Pair,
--   5=Paired-Scheduling, 6=First Paid Lesson, 7=Active Client, 8=Club Interest, 9=Club Enrolled

INSERT INTO clients (id, client_id, first_name, last_name, email, mobile, status, market, pipeline_stage_id, pipeline_stage_name, town, state, created_at, updated_at)
VALUES
  -- New Leads (stage 1) - 6 clients
  (100, 1001, 'Jordan', 'Park', 'jordan.park@email.com', '512-555-0101', 'prospect', 'austin', 1, 'New Lead', 'Austin', 'TX', NOW() - INTERVAL '2 days', NOW()),
  (101, 1002, 'Maya', 'Gutierrez', 'maya.gutierrez@email.com', '615-555-0102', 'prospect', 'nashville', 1, 'New Lead', 'Nashville', 'TN', NOW() - INTERVAL '1 day', NOW()),
  (102, 1003, 'Ethan', 'Brooks', 'ethan.brooks@email.com', '214-555-0103', 'prospect', 'dallas', 1, 'New Lead', 'Dallas', 'TX', NOW() - INTERVAL '3 days', NOW()),
  (103, 1004, 'Lily', 'Chen', 'lily.chen@email.com', '512-555-0104', 'prospect', 'austin', 1, 'New Lead', 'Cedar Park', 'TX', NOW() - INTERVAL '4 hours', NOW()),
  (104, 1005, 'Omar', 'Hassan', 'omar.hassan@email.com', '615-555-0105', 'prospect', 'online', 1, 'New Lead', 'Remote', NULL, NOW() - INTERVAL '6 hours', NOW()),
  (105, 1006, 'Ava', 'Williams', 'ava.williams@email.com', '214-555-0106', 'prospect', 'dallas', 1, 'New Lead', 'Plano', 'TX', NOW() - INTERVAL '12 hours', NOW()),

  -- Trial Scheduled (stage 2) - 5 clients
  (106, 1007, 'Noah', 'Johnson', 'noah.johnson@email.com', '512-555-0107', 'prospect', 'austin', 2, 'Trial Scheduled', 'Round Rock', 'TX', NOW() - INTERVAL '5 days', NOW()),
  (107, 1008, 'Sophia', 'Martinez', 'sophia.martinez@email.com', '615-555-0108', 'prospect', 'nashville', 2, 'Trial Scheduled', 'Franklin', 'TN', NOW() - INTERVAL '4 days', NOW()),
  (108, 1009, 'Liam', 'Davis', 'liam.davis@email.com', '214-555-0109', 'prospect', 'dallas', 2, 'Trial Scheduled', 'Frisco', 'TX', NOW() - INTERVAL '3 days', NOW()),
  (109, 1010, 'Chloe', 'Anderson', 'chloe.anderson@email.com', '512-555-0110', 'prospect', 'online', 2, 'Trial Scheduled', 'Remote', NULL, NOW() - INTERVAL '6 days', NOW()),
  (110, 1011, 'Aiden', 'Taylor', 'aiden.taylor@email.com', '615-555-0111', 'prospect', 'nashville', 2, 'Trial Scheduled', 'Brentwood', 'TN', NOW() - INTERVAL '2 days', NOW()),

  -- Trial Completed (stage 3) - 5 clients
  (111, 1012, 'Isabella', 'Thomas', 'isabella.thomas@email.com', '512-555-0112', 'prospect', 'austin', 3, 'Trial Completed', 'Austin', 'TX', NOW() - INTERVAL '7 days', NOW()),
  (112, 1013, 'Jackson', 'White', 'jackson.white@email.com', '615-555-0113', 'prospect', 'nashville', 3, 'Trial Completed', 'Nashville', 'TN', NOW() - INTERVAL '8 days', NOW()),
  (113, 1014, 'Mia', 'Harris', 'mia.harris@email.com', '214-555-0114', 'prospect', 'dallas', 3, 'Trial Completed', 'McKinney', 'TX', NOW() - INTERVAL '6 days', NOW()),
  (114, 1015, 'Lucas', 'Clark', 'lucas.clark@email.com', '512-555-0115', 'prospect', 'online', 3, 'Trial Completed', 'Remote', NULL, NOW() - INTERVAL '9 days', NOW()),
  (115, 1016, 'Harper', 'Lewis', 'harper.lewis@email.com', '214-555-0116', 'prospect', 'dallas', 3, 'Trial Completed', 'Allen', 'TX', NOW() - INTERVAL '5 days', NOW()),

  -- Waiting to Pair (stage 4) - 5 clients
  (116, 1017, 'Benjamin', 'Walker', 'benjamin.walker@email.com', '512-555-0117', 'prospect', 'austin', 4, 'Waiting to Pair', 'Lakeway', 'TX', NOW() - INTERVAL '10 days', NOW()),
  (117, 1018, 'Ella', 'Young', 'ella.young@email.com', '615-555-0118', 'prospect', 'nashville', 4, 'Waiting to Pair', 'Hendersonville', 'TN', NOW() - INTERVAL '12 days', NOW()),
  (118, 1019, 'William', 'Allen', 'william.allen@email.com', '214-555-0119', 'prospect', 'dallas', 4, 'Waiting to Pair', 'Richardson', 'TX', NOW() - INTERVAL '9 days', NOW()),
  (119, 1020, 'Charlotte', 'King', 'charlotte.king@email.com', '512-555-0120', 'prospect', 'austin', 4, 'Waiting to Pair', 'Bee Cave', 'TX', NOW() - INTERVAL '11 days', NOW()),
  (120, 1021, 'Henry', 'Scott', 'henry.scott@email.com', '615-555-0121', 'prospect', 'online', 4, 'Waiting to Pair', 'Remote', NULL, NOW() - INTERVAL '8 days', NOW()),

  -- Paired-Scheduling (stage 5) - 4 clients
  (121, 1022, 'Amelia', 'Green', 'amelia.green@email.com', '512-555-0122', 'prospect', 'austin', 5, 'Paired-Scheduling', 'Georgetown', 'TX', NOW() - INTERVAL '14 days', NOW()),
  (122, 1023, 'Daniel', 'Baker', 'daniel.baker@email.com', '615-555-0123', 'prospect', 'nashville', 5, 'Paired-Scheduling', 'Mt. Juliet', 'TN', NOW() - INTERVAL '13 days', NOW()),
  (123, 1024, 'Grace', 'Nelson', 'grace.nelson@email.com', '214-555-0124', 'prospect', 'dallas', 5, 'Paired-Scheduling', 'Carrollton', 'TX', NOW() - INTERVAL '15 days', NOW()),
  (124, 1025, 'Sebastian', 'Carter', 'sebastian.carter@email.com', '512-555-0125', 'prospect', 'online', 5, 'Paired-Scheduling', 'Remote', NULL, NOW() - INTERVAL '12 days', NOW()),

  -- First Paid Lesson (stage 6) - 5 clients
  (125, 1026, 'Zoe', 'Mitchell', 'zoe.mitchell@email.com', '512-555-0126', 'active', 'austin', 6, 'First Paid Lesson', 'Dripping Springs', 'TX', NOW() - INTERVAL '18 days', NOW()),
  (126, 1027, 'Jack', 'Perez', 'jack.perez@email.com', '615-555-0127', 'active', 'nashville', 6, 'First Paid Lesson', 'Murfreesboro', 'TN', NOW() - INTERVAL '16 days', NOW()),
  (127, 1028, 'Penelope', 'Roberts', 'penelope.roberts@email.com', '214-555-0128', 'active', 'dallas', 6, 'First Paid Lesson', 'Garland', 'TX', NOW() - INTERVAL '20 days', NOW()),
  (128, 1029, 'Owen', 'Turner', 'owen.turner@email.com', '512-555-0129', 'active', 'austin', 6, 'First Paid Lesson', 'Pflugerville', 'TX', NOW() - INTERVAL '17 days', NOW()),
  (129, 1030, 'Layla', 'Phillips', 'layla.phillips@email.com', '615-555-0130', 'active', 'online', 6, 'First Paid Lesson', 'Remote', NULL, NOW() - INTERVAL '19 days', NOW()),

  -- Active Client (stage 7) - 6 clients
  (130, 1031, 'Alexander', 'Campbell', 'alexander.campbell@email.com', '512-555-0131', 'active', 'austin', 7, 'Active Client', 'Austin', 'TX', NOW() - INTERVAL '45 days', NOW()),
  (131, 1032, 'Riley', 'Evans', 'riley.evans@email.com', '615-555-0132', 'active', 'nashville', 7, 'Active Client', 'Nashville', 'TN', NOW() - INTERVAL '60 days', NOW()),
  (132, 1033, 'Mason', 'Stewart', 'mason.stewart@email.com', '214-555-0133', 'active', 'dallas', 7, 'Active Client', 'Irving', 'TX', NOW() - INTERVAL '90 days', NOW()),
  (133, 1034, 'Aria', 'Sanchez', 'aria.sanchez@email.com', '512-555-0134', 'active', 'online', 7, 'Active Client', 'Remote', NULL, NOW() - INTERVAL '75 days', NOW()),
  (134, 1035, 'Logan', 'Morris', 'logan.morris@email.com', '615-555-0135', 'active', 'nashville', 7, 'Active Client', 'Spring Hill', 'TN', NOW() - INTERVAL '50 days', NOW()),
  (135, 1036, 'Nora', 'Rogers', 'nora.rogers@email.com', '214-555-0136', 'active', 'dallas', 7, 'Active Client', 'Mesquite', 'TX', NOW() - INTERVAL '55 days', NOW()),

  -- Club Interest (stage 8) - 2 clients
  (136, 1037, 'Caleb', 'Reed', 'caleb.reed@email.com', '512-555-0137', 'prospect', 'austin', 8, 'Club Interest', 'Austin', 'TX', NOW() - INTERVAL '5 days', NOW()),
  (137, 1038, 'Hannah', 'Cook', 'hannah.cook@email.com', '615-555-0138', 'prospect', 'nashville', 8, 'Club Interest', 'Nashville', 'TN', NOW() - INTERVAL '7 days', NOW()),

  -- Club Enrolled (stage 9) - 2 clients
  (138, 1039, 'Eli', 'Morgan', 'eli.morgan@email.com', '512-555-0139', 'active', 'austin', 9, 'Club Enrolled', 'Austin', 'TX', NOW() - INTERVAL '20 days', NOW()),
  (139, 1040, 'Scarlett', 'Bell', 'scarlett.bell@email.com', '615-555-0140', 'active', 'nashville', 9, 'Club Enrolled', 'Nashville', 'TN', NOW() - INTERVAL '25 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 3. SCHOOL METADATA (10 schools for /schools)
-- =============================================================================
INSERT INTO school_metadata (id, school_name, school_type, payment_method, default_lesson_day, notes)
VALUES
  (100, 'Lincoln Elementary', 'regular', 'ACH', 'Tuesday', 'Long-standing partner, 3rd year running'),
  (101, 'Oakwood Academy', 'elective', 'Credit Card', 'Wednesday', 'Private school, premium program'),
  (102, 'Riverside Montessori', 'regular', 'Check', 'Thursday', 'Small classes, 12 students max'),
  (103, 'Cedar Hills Primary', 'regular', 'ACH', 'Monday', 'Two sessions per week during spring'),
  (104, 'Magnolia Prep', 'elective', 'Credit Card', 'Friday', 'After-school enrichment slot'),
  (105, 'Summit View Elementary', 'regular', 'Invoice', 'Tuesday', 'New partner, started Fall 2025'),
  (106, 'Bluebonnet Charter', 'regular', 'ACH', 'Wednesday', 'Charter school, flexible scheduling'),
  (107, 'Heritage Christian Academy', 'elective', 'Check', 'Thursday', 'Parent-paid model, strong enrollment'),
  (108, 'Westlake Elementary', 'regular', 'ACH', 'Monday', 'Flagship Austin school'),
  (109, 'Bellevue Middle School', 'regular', 'Invoice', 'Friday', 'Nashville flagship, 6th-8th grade program')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. SCHOOL CONTACTS (15 contacts for /schools)
-- =============================================================================
-- school_contacts.school_id is VARCHAR(255) referencing the school
INSERT INTO school_contacts (id, school_id, name, email, phone, role, is_primary)
VALUES
  (100, '100', 'Dr. Karen Walsh', 'kwalsh@lincoln-elem.edu', '512-555-2001', 'Principal', true),
  (101, '100', 'Tom Nguyen', 'tnguyen@lincoln-elem.edu', '512-555-2002', 'After-School Coordinator', false),
  (102, '101', 'Jennifer Blake', 'jblake@oakwoodacademy.org', '615-555-2003', 'Enrichment Director', true),
  (103, '102', 'Maria Santos', 'msantos@riverside-montessori.edu', '512-555-2004', 'Head of School', true),
  (104, '103', 'Robert Chen', 'rchen@cedarhills.edu', '214-555-2005', 'Principal', true),
  (105, '103', 'Linda Torres', 'ltorres@cedarhills.edu', '214-555-2006', 'PTA President', false),
  (106, '104', 'Amanda Foster', 'afoster@magnoliaprep.org', '615-555-2007', 'Dean of Students', true),
  (107, '105', 'Brian Park', 'bpark@summitview.edu', '512-555-2008', 'Vice Principal', true),
  (108, '106', 'Diane Rodriguez', 'drodriguez@bluebonnet.org', '214-555-2009', 'Program Coordinator', true),
  (109, '107', 'Pastor Michael Davis', 'mdavis@heritage-christian.org', '615-555-2010', 'School Administrator', true),
  (110, '107', 'Rachel Green', 'rgreen@heritage-christian.org', '615-555-2011', 'Parent Liaison', false),
  (111, '108', 'Christine Yee', 'cyee@westlake-elem.edu', '512-555-2012', 'Principal', true),
  (112, '108', 'Dave Matthews', 'dmatthews@westlake-elem.edu', '512-555-2013', 'Athletic Director', false),
  (113, '109', 'Angela Simmons', 'asimmons@bellevue-middle.edu', '615-555-2014', 'Principal', true),
  (114, '109', 'Keith Urban', 'kurban@bellevue-middle.edu', '615-555-2015', 'Activities Coordinator', false)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 5. SCHOOL TERM STATUS (tracking for /schools)
-- =============================================================================
INSERT INTO school_term_status (id, school_name, term, school_confirmed, tutor_assigned, contract_signed, job_created, roster_connected, contract_value, sessions_count, lesson_days, notes)
VALUES
  -- Spring 2026 (current term)
  (100, 'Lincoln Elementary', 'Spring 2026', true, true, true, true, true, 4200.00, 14, 'Tuesday', 'Running smoothly'),
  (101, 'Oakwood Academy', 'Spring 2026', true, true, true, true, true, 5600.00, 16, 'Wednesday', 'Premium program, 20 students'),
  (102, 'Riverside Montessori', 'Spring 2026', true, true, true, true, false, 2400.00, 12, 'Thursday', 'Roster pending from school'),
  (103, 'Cedar Hills Primary', 'Spring 2026', true, true, true, true, true, 3600.00, 14, 'Monday, Wednesday', 'Two days per week'),
  (104, 'Magnolia Prep', 'Spring 2026', true, true, false, false, false, 3200.00, 14, 'Friday', 'Contract out for signature'),
  (105, 'Summit View Elementary', 'Spring 2026', true, false, false, false, false, 2800.00, 12, 'Tuesday', 'Need to assign tutor'),
  (106, 'Bluebonnet Charter', 'Spring 2026', false, false, false, false, false, NULL, NULL, 'Wednesday', 'Awaiting school confirmation'),
  (107, 'Heritage Christian Academy', 'Spring 2026', true, true, true, true, true, 4800.00, 16, 'Thursday', 'Strong enrollment this term'),
  (108, 'Westlake Elementary', 'Spring 2026', true, true, true, true, true, 6000.00, 18, 'Monday', 'Flagship program'),
  (109, 'Bellevue Middle School', 'Spring 2026', true, true, true, true, true, 5200.00, 16, 'Friday', 'Nashville flagship'),
  -- Fall 2025 (previous term)
  (110, 'Lincoln Elementary', 'Fall 2025', true, true, true, true, true, 3800.00, 12, 'Tuesday', 'Completed successfully'),
  (111, 'Oakwood Academy', 'Fall 2025', true, true, true, true, true, 5200.00, 14, 'Wednesday', 'Great feedback from parents'),
  (112, 'Westlake Elementary', 'Fall 2025', true, true, true, true, true, 5600.00, 16, 'Monday', 'Record enrollment'),
  (113, 'Bellevue Middle School', 'Fall 2025', true, true, true, true, true, 4800.00, 14, 'Friday', 'Expanded to 8th grade')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. SCHOOL REVENUE BY TERM
-- =============================================================================
INSERT INTO school_revenue_by_term (id, school_client_id, school_name, term_season, term_start_date, term_end_date, total_revenue, total_tutor_cost, total_margin, margin_percentage, total_students, total_lessons, total_invoiced, total_collected, total_outstanding, invoice_count, paid_invoice_count, unpaid_invoice_count)
VALUES
  (100, 100, 'Lincoln Elementary', 'Fall 2025', '2025-08-18', '2025-12-19', 3800.00, 1900.00, 1900.00, 50.00, 18, 48, 3800.00, 3800.00, 0.00, 4, 4, 0),
  (101, 100, 'Lincoln Elementary', 'Spring 2026', '2026-01-12', '2026-05-22', 4200.00, 2100.00, 2100.00, 50.00, 22, 56, 4200.00, 2800.00, 1400.00, 4, 3, 1),
  (102, 101, 'Oakwood Academy', 'Fall 2025', '2025-08-25', '2025-12-12', 5200.00, 2340.00, 2860.00, 55.00, 20, 56, 5200.00, 5200.00, 0.00, 4, 4, 0),
  (103, 101, 'Oakwood Academy', 'Spring 2026', '2026-01-19', '2026-05-15', 5600.00, 2520.00, 3080.00, 55.00, 20, 64, 5600.00, 4200.00, 1400.00, 4, 3, 1),
  (104, 108, 'Westlake Elementary', 'Fall 2025', '2025-08-18', '2025-12-19', 5600.00, 2800.00, 2800.00, 50.00, 28, 64, 5600.00, 5600.00, 0.00, 4, 4, 0),
  (105, 108, 'Westlake Elementary', 'Spring 2026', '2026-01-12', '2026-05-22', 6000.00, 3000.00, 3000.00, 50.00, 30, 72, 6000.00, 4000.00, 2000.00, 4, 2, 2),
  (106, 109, 'Bellevue Middle School', 'Fall 2025', '2025-08-25', '2025-12-12', 4800.00, 2160.00, 2640.00, 55.00, 24, 56, 4800.00, 4800.00, 0.00, 4, 4, 0),
  (107, 109, 'Bellevue Middle School', 'Spring 2026', '2026-01-19', '2026-05-15', 5200.00, 2340.00, 2860.00, 55.00, 26, 64, 5200.00, 3900.00, 1300.00, 4, 3, 1),
  (108, 103, 'Cedar Hills Primary', 'Spring 2026', '2026-01-12', '2026-05-22', 3600.00, 1800.00, 1800.00, 50.00, 16, 56, 3600.00, 2400.00, 1200.00, 4, 2, 2),
  (109, 107, 'Heritage Christian Academy', 'Spring 2026', '2026-01-19', '2026-05-15', 4800.00, 2160.00, 2640.00, 55.00, 22, 64, 4800.00, 3600.00, 1200.00, 4, 3, 1)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 7. CLUB STUDENTS (for /clubs)
-- =============================================================================
-- Using recipient_ids in 1001+ range matching our new clients
INSERT INTO club_students (id, club_id, recipient_id, status, enrolled_at, last_attended, sessions_attended, membership_type)
VALUES
  (100, 1, 1039, 'active', NOW() - INTERVAL '20 days', NOW() - INTERVAL '2 days', 6, 'monthly'),
  (101, 1, 1037, 'trial', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', 1, 'drop-in'),
  (102, 1, 1031, 'active', NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days', 8, 'semester'),
  (103, 1, 1026, 'active', NOW() - INTERVAL '25 days', NOW() - INTERVAL '9 days', 5, 'monthly'),
  (104, 1, 1022, 'inactive', NOW() - INTERVAL '45 days', NOW() - INTERVAL '30 days', 4, 'monthly'),
  (105, 2, 1040, 'active', NOW() - INTERVAL '25 days', NOW() - INTERVAL '3 days', 7, 'monthly'),
  (106, 2, 1038, 'trial', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', 1, 'drop-in'),
  (107, 2, 1032, 'active', NOW() - INTERVAL '35 days', NOW() - INTERVAL '3 days', 9, 'semester'),
  (108, 2, 1027, 'active', NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days', 4, 'monthly'),
  (109, 2, 1035, 'active', NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days', 10, 'semester')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 8. AD SPEND DATA (60 rows for /marketing)
-- =============================================================================
-- Meta campaigns
INSERT INTO ad_spend_data (id, platform, account_id, campaign_id, campaign_name, utm_campaign, date, impressions, clicks, spend, ctr, cpc, conversions, conversion_rate)
SELECT
  100 + row_num,
  'meta',
  'act_demo_meta_001',
  'meta_camp_' || camp_id,
  campaign_name,
  utm_campaign,
  (CURRENT_DATE - (day_offset || ' days')::interval)::date,
  (RANDOM() * 8000 + 2000)::bigint,
  (RANDOM() * 200 + 30)::bigint,
  ROUND((RANDOM() * 80 + 20)::numeric, 2),
  ROUND((RANDOM() * 3 + 0.5)::numeric, 2),
  ROUND((RANDOM() * 1.5 + 0.3)::numeric, 2),
  (RANDOM() * 5 + 1)::integer,
  ROUND((RANDOM() * 4 + 1)::numeric, 2)
FROM (
  SELECT
    ROW_NUMBER() OVER () as row_num,
    camp_id, campaign_name, utm_campaign, day_offset
  FROM (
    VALUES ('001', 'Meta - Chess Brain Training', 'meta-chess-brain-training'),
           ('002', 'Meta - After School Chess Austin', 'meta-afterschool-chess-atx'),
           ('003', 'Meta - Chess for Kids Nashville', 'meta-chess-kids-nash')
  ) campaigns(camp_id, campaign_name, utm_campaign)
  CROSS JOIN generate_series(1, 10) AS day_offset
) sub
ON CONFLICT (id) DO NOTHING;

-- Google campaigns
INSERT INTO ad_spend_data (id, platform, account_id, campaign_id, campaign_name, utm_campaign, date, impressions, clicks, spend, ctr, cpc, conversions, conversion_rate)
SELECT
  200 + row_num,
  'google',
  'gads_demo_001',
  'gads_camp_' || camp_id,
  campaign_name,
  utm_campaign,
  (CURRENT_DATE - (day_offset || ' days')::interval)::date,
  (RANDOM() * 6000 + 1500)::bigint,
  (RANDOM() * 150 + 25)::bigint,
  ROUND((RANDOM() * 60 + 15)::numeric, 2),
  ROUND((RANDOM() * 4 + 1)::numeric, 2),
  ROUND((RANDOM() * 2 + 0.5)::numeric, 2),
  (RANDOM() * 4 + 1)::integer,
  ROUND((RANDOM() * 3 + 1)::numeric, 2)
FROM (
  SELECT
    ROW_NUMBER() OVER () as row_num,
    camp_id, campaign_name, utm_campaign, day_offset
  FROM (
    VALUES ('001', 'Google - Chess Tutoring Near Me', 'gads-chess-tutoring-near-me'),
           ('002', 'Google - Learn Chess Kids Dallas', 'gads-learn-chess-kids-dallas'),
           ('003', 'Google - Private Chess Lessons', 'gads-private-chess-lessons')
  ) campaigns(camp_id, campaign_name, utm_campaign)
  CROSS JOIN generate_series(1, 10) AS day_offset
) sub
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 9. DAILY ACTUALS (120 rows for /analytics and HQ Dashboard)
-- =============================================================================
INSERT INTO daily_actuals (id, date, revenue, market, lesson_type)
SELECT
  1000 + row_num,
  gen_date,
  ROUND((base_rev + (RANDOM() * variance))::numeric, 2),
  market,
  lesson_type
FROM (
  SELECT
    ROW_NUMBER() OVER () as row_num,
    gen_date, market, lesson_type, base_rev, variance
  FROM (
    SELECT d::date as gen_date, m.market, m.lesson_type, m.base_rev, m.variance
    FROM generate_series(CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '1 day', '1 day') d
    CROSS JOIN (
      VALUES
        ('austin', 'private', 600, 400),
        ('nashville', 'private', 450, 350),
        ('dallas', 'private', 500, 400),
        ('online', 'online', 300, 250)
    ) m(market, lesson_type, base_rev, variance)
  ) raw
  -- Sample ~120 rows by taking every 3rd day for each market
  WHERE EXTRACT(DOW FROM gen_date) NOT IN (0) -- skip Sundays
  ORDER BY gen_date, market
  LIMIT 120
) sub
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 10. DAILY PIPELINE (60 rows for HQ Dashboard)
-- =============================================================================
-- First create a forecast_run to reference
INSERT INTO forecast_runs (id, run_at, horizon_days, model_version, method)
VALUES (100, NOW() - INTERVAL '1 hour', 90, 'v2.1-demo', 'ensemble')
ON CONFLICT (id) DO NOTHING;

INSERT INTO daily_pipeline (id, date, expected_value, count_lessons, avg_probability, market, lesson_type, run_id)
SELECT
  1000 + row_num,
  gen_date,
  ROUND((base_val + (RANDOM() * variance))::numeric, 2),
  (RANDOM() * 8 + 2)::integer,
  ROUND((RANDOM() * 0.3 + 0.6)::numeric, 4),
  market,
  'private',
  100
FROM (
  SELECT
    ROW_NUMBER() OVER () as row_num,
    d::date as gen_date,
    m.market,
    m.base_val,
    m.variance
  FROM generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE - INTERVAL '1 day', '1 day') d
  CROSS JOIN (
    VALUES
      ('austin', 800, 500),
      ('nashville', 600, 400),
      ('dallas', 700, 450),
      ('online', 350, 250)
  ) m(market, base_val, variance)
  ORDER BY d, m.market
  LIMIT 60
) sub
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 11. COMPANY METRICS (10 key metrics for HQ Dashboard and /analytics)
-- =============================================================================
INSERT INTO company_metrics (id, metric_key, metric_value, description, source_breakdown, base_date, verified_at, verified_by)
VALUES
  (100, 'total_revenue', 2847500.00, 'All-time gross revenue across all eras', '{"mindbody": 1200000, "e4": 450000, "tutorcruncher": 1197500}', '2024-06-01', NOW(), 'system'),
  (101, 'monthly_revenue', 89400.00, 'Current month recurring revenue', '{"private": 52000, "online": 15400, "school": 18000, "club": 4000}', CURRENT_DATE, NOW(), 'system'),
  (102, 'active_clients', 187.00, 'Clients with active status', '{"austin": 68, "nashville": 52, "dallas": 45, "online": 22}', CURRENT_DATE, NOW(), 'system'),
  (103, 'total_tutors', 38.00, 'Active contractors on the platform', '{"austin": 14, "nashville": 10, "dallas": 9, "online": 5}', CURRENT_DATE, NOW(), 'system'),
  (104, 'avg_lesson_rate', 98.50, 'Average charge rate per lesson', NULL, CURRENT_DATE, NOW(), 'system'),
  (105, 'client_retention', 87.30, 'Client retention rate (rolling 6 months)', NULL, CURRENT_DATE, NOW(), 'system'),
  (106, 'monthly_lessons', 912.00, 'Lessons delivered this month', '{"private": 520, "online": 185, "school": 160, "club": 47}', CURRENT_DATE, NOW(), 'system'),
  (107, 'pipeline_value', 34200.00, 'Total pipeline expected monthly value', '{"new_lead": 8400, "trial": 6200, "paired": 12600, "first_lesson": 7000}', CURRENT_DATE, NOW(), 'system'),
  (108, 'total_lessons_delivered', 48320.00, 'All-time lessons delivered across all eras', '{"mindbody": 22000, "e4": 8500, "tutorcruncher": 17820}', '2024-06-01', NOW(), 'system'),
  (109, 'avg_client_lifetime', 8.40, 'Average client lifetime in months', NULL, CURRENT_DATE, NOW(), 'system')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 12. MARKETING CONTENT CALENDAR (15 entries for /marketing)
-- =============================================================================
-- First seed some blog drafts and instagram posts to reference
INSERT INTO marketing_blog_drafts (id, title, slug, status, content_markdown, seo_title, seo_description, target_audience, created_by)
VALUES
  (100, '5 Ways Chess Improves Math Skills', 'chess-improves-math-skills', 'published', '# 5 Ways Chess Improves Math Skills\n\nChess and mathematics share a deep connection...', '5 Ways Chess Improves Math Skills | Story Time Chess', 'Discover how chess lessons can boost your child math performance through pattern recognition, logical thinking, and problem solving.', 'parents', 'Sarah Mitchell'),
  (101, 'Choosing the Right Chess Program for Your Child', 'choosing-chess-program', 'pending_review', '# How to Choose the Right Chess Program\n\nWith so many options available...', 'How to Choose the Right Chess Program | Story Time Chess', 'A parent guide to evaluating chess programs: private lessons vs clubs vs online.', 'parents', 'Demo User'),
  (102, 'Chess Club vs Private Lessons: Which Is Best?', 'chess-club-vs-private-lessons', 'draft', '# Chess Club vs Private Lessons\n\nBoth formats offer unique benefits...', 'Chess Club vs Private Lessons | Story Time Chess', 'Compare chess clubs and private lessons to find the best fit for your child.', 'parents', 'Demo User'),
  (103, 'Summer Chess Camp Guide 2026', 'summer-chess-camp-2026', 'draft', '# Summer Chess Camp Guide\n\nKeep your kids learning this summer...', 'Summer Chess Camps 2026 | Story Time Chess', 'Explore summer chess camp options in Austin, Nashville, and Dallas.', 'parents', 'Sarah Mitchell'),
  (104, 'The Science of Chess and Brain Development', 'science-chess-brain-development', 'approved', '# The Science Behind Chess and Brain Development\n\nResearch shows...', 'Chess and Brain Development Research | Story Time Chess', 'What neuroscience tells us about how chess shapes young minds.', 'parents', 'Demo User')
ON CONFLICT (id) DO NOTHING;

INSERT INTO marketing_instagram_posts (id, post_type, status, caption, hashtags, scheduled_at, created_by)
VALUES
  (100, 'image', 'scheduled', 'Nothing beats the look on a kid''s face when they get their first checkmate! Tag a young chess player you know.', '["chess", "kidsactivities", "chesseducation", "checkmate", "storytimechess"]', NOW() + INTERVAL '2 days', 'Sarah Mitchell'),
  (101, 'carousel', 'draft', '3 chess openings every beginner should know. Save this for later!', '["chessopening", "learnchess", "chesstips", "chessforkids"]', NULL, 'Demo User'),
  (102, 'reel', 'pending_review', 'POV: Your kid just won their first tournament game', '["chesstournament", "proudparent", "chesschampion", "kidschess"]', NOW() + INTERVAL '5 days', 'Sarah Mitchell'),
  (103, 'image', 'approved', 'Our Austin chess club meets every Saturday! Spots filling up fast for the spring session.', '["austinchess", "chessclub", "weekendactivities", "austinkids"]', NOW() + INTERVAL '3 days', 'Demo User'),
  (104, 'carousel', 'scheduled', 'Why every school should have a chess program. Swipe to see the research.', '["chessinschools", "education", "criticalthinking", "schoolenrichment"]', NOW() + INTERVAL '7 days', 'Sarah Mitchell')
ON CONFLICT (id) DO NOTHING;

-- Content calendar entries linking to blog drafts and instagram posts
INSERT INTO marketing_content_calendar (id, content_type, content_id, scheduled_date, time_slot, status, notes, created_by)
VALUES
  (100, 'blog', 100, CURRENT_DATE - INTERVAL '3 days', '09:00', 'published', 'Published to Webflow', 'Sarah Mitchell'),
  (101, 'instagram', 100, CURRENT_DATE + INTERVAL '2 days', '12:00', 'scheduled', 'Checkmate celebration post', 'Sarah Mitchell'),
  (102, 'blog', 101, CURRENT_DATE + INTERVAL '4 days', '09:00', 'scheduled', 'Needs final review', 'Demo User'),
  (103, 'instagram', 102, CURRENT_DATE + INTERVAL '5 days', '17:00', 'scheduled', 'Tournament reel', 'Sarah Mitchell'),
  (104, 'instagram', 103, CURRENT_DATE + INTERVAL '3 days', '11:00', 'scheduled', 'Austin club promo', 'Demo User'),
  (105, 'blog', 104, CURRENT_DATE + INTERVAL '7 days', '09:00', 'scheduled', 'Brain science article', 'Demo User'),
  (106, 'instagram', 104, CURRENT_DATE + INTERVAL '7 days', '14:00', 'scheduled', 'School chess carousel', 'Sarah Mitchell'),
  (107, 'email', 100, CURRENT_DATE + INTERVAL '1 day', '10:00', 'scheduled', 'Weekly newsletter - chess tips', 'Sarah Mitchell'),
  (108, 'blog', 102, CURRENT_DATE + INTERVAL '10 days', '09:00', 'scheduled', 'Club vs Private comparison', 'Demo User'),
  (109, 'email', 101, CURRENT_DATE + INTERVAL '5 days', '10:00', 'scheduled', 'Trial lesson follow-up sequence', 'Priya Desai'),
  (110, 'instagram', 101, CURRENT_DATE + INTERVAL '9 days', '16:00', 'scheduled', 'Chess openings carousel', 'Demo User'),
  (111, 'blog', 103, CURRENT_DATE + INTERVAL '14 days', '09:00', 'scheduled', 'Summer camp guide', 'Sarah Mitchell'),
  (112, 'email', 102, CURRENT_DATE + INTERVAL '8 days', '10:00', 'scheduled', 'School partnership outreach', 'James Thornton'),
  (113, 'campaign', 100, CURRENT_DATE + INTERVAL '1 day', NULL, 'scheduled', 'Meta retargeting refresh', 'Demo User'),
  (114, 'campaign', 101, CURRENT_DATE + INTERVAL '6 days', NULL, 'scheduled', 'Google search campaign update', 'Demo User')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 13. TUTOR LABELS (for /tutors)
-- =============================================================================
-- Existing contractors: contractor_ids need to match what's in the DB
-- Assuming contractor_ids from the existing 8 tutors (check actual IDs)
-- Using ON CONFLICT on contractor_id (UNIQUE)
INSERT INTO tutor_labels (id, contractor_id, labels, updated_at)
VALUES
  (100, 5001, 'Home - Austin, School - Austin, 1099', NOW()),
  (101, 5002, 'Home - Nashville, Online, 1099', NOW()),
  (102, 5003, 'Home - Dallas, School - Dallas, 1099', NOW()),
  (103, 5004, 'Home - Austin, Online, Club - Austin, 1099', NOW()),
  (104, 5005, 'Home - Nashville, School - Nashville, 1099', NOW()),
  (105, 5006, 'Online, Home - Dallas, 1099', NOW()),
  (106, 5007, 'Club - Austin, Home - Austin, 1099', NOW()),
  (107, 5008, 'School - Nashville, Club - Nashville, 1099', NOW())
ON CONFLICT (contractor_id) DO NOTHING;

-- =============================================================================
-- 14. TUTOR NOTES (for /tutors)
-- =============================================================================
INSERT INTO tutor_notes (id, contractor_id, note, created_by, created_at)
VALUES
  (100, 5001, 'Excellent with beginners. Parents consistently rate him 5 stars. Wants to take on more school programs.', 'Sarah Mitchell', NOW() - INTERVAL '14 days'),
  (101, 5001, 'Completed advanced training module. Ready for tournament prep students.', 'Demo User', NOW() - INTERVAL '7 days'),
  (102, 5002, 'Great communicator. Handles online lessons seamlessly. Requested schedule change for March.', 'Demo User', NOW() - INTERVAL '10 days'),
  (103, 5003, 'Strong chess background (USCF 1800+). Best fit for competitive students.', 'James Thornton', NOW() - INTERVAL '21 days'),
  (104, 5003, 'Took on Cedar Hills Primary this semester. Feedback from school is very positive.', 'Sarah Mitchell', NOW() - INTERVAL '5 days'),
  (105, 5004, 'Versatile tutor - handles home, online, and club sessions equally well.', 'Demo User', NOW() - INTERVAL '30 days'),
  (106, 5004, 'Running Austin Saturday club. Attendance has grown 40% since she took over.', 'Sarah Mitchell', NOW() - INTERVAL '3 days'),
  (107, 5005, 'Nashville market lead. Mentors new tutors during onboarding.', 'Demo User', NOW() - INTERVAL '45 days'),
  (108, 5006, 'Prefers online-only schedule. Currently at capacity (12 students).', 'Priya Desai', NOW() - INTERVAL '8 days'),
  (109, 5007, 'Club specialist. Helped design the new club curriculum materials.', 'Demo User', NOW() - INTERVAL '15 days'),
  (110, 5008, 'Nashville school program coordinator. Manages relationships with 3 schools.', 'James Thornton', NOW() - INTERVAL '12 days')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 15. EVENT LEADS (10 leads for events/marketing)
-- =============================================================================
INSERT INTO event_leads (id, first_name, last_name, email, phone, event_name, event_id, program_interest, format_preference, student_names, notes, followed_up, followed_up_at, follow_up_notes)
VALUES
  (100, 'Rebecca', 'Tran', 'rebecca.tran@email.com', '512-555-3001', 'Chess in the Park - Zilker', 'EVT-2026-001', true, true, 'Max Tran, Lily Tran', 'Interested in sibling discount', true, NOW() - INTERVAL '2 days', 'Sent trial lesson info. Booked for next Saturday.'),
  (101, 'David', 'Okonkwo', 'david.okonkwo@email.com', '512-555-3002', 'Chess in the Park - Zilker', 'EVT-2026-001', true, false, 'Ava Okonkwo', 'Prefers online format', true, NOW() - INTERVAL '1 day', 'Scheduled online trial for Tuesday.'),
  (102, 'Jennifer', 'Liu', 'jennifer.liu@email.com', '615-555-3003', 'School Demo Day - Nashville', 'EVT-2026-002', true, true, 'Ryan Liu', 'Asked about tournament preparation', false, NULL, NULL),
  (103, 'Carlos', 'Mendez', 'carlos.mendez@email.com', '615-555-3004', 'School Demo Day - Nashville', 'EVT-2026-002', true, true, 'Sofia Mendez, Diego Mendez', 'Two kids, different skill levels', false, NULL, NULL),
  (104, 'Amy', 'Patel', 'amy.patel@email.com', '214-555-3005', 'Dallas Community Fair', 'EVT-2026-003', true, true, 'Arjun Patel', 'Already knows basic rules', true, NOW() - INTERVAL '3 days', 'Paired with James O. Trial completed, converting.'),
  (105, 'Mark', 'Johansson', 'mark.johansson@email.com', '512-555-3006', 'Chess in the Park - Zilker', 'EVT-2026-001', false, false, 'Elsa Johansson', 'Just exploring options', false, NULL, NULL),
  (106, 'Priscilla', 'Washington', 'priscilla.w@email.com', '615-555-3007', 'School Demo Day - Nashville', 'EVT-2026-002', true, true, 'Marcus Washington', 'Very enthusiastic, kid loved the demo', true, NOW() - INTERVAL '1 day', 'Booked trial at Heritage Christian.'),
  (107, 'Steven', 'Nakamura', 'steven.nak@email.com', '214-555-3008', 'Dallas Community Fair', 'EVT-2026-003', true, false, 'Hana Nakamura', 'Interested in online lessons', false, NULL, NULL),
  (108, 'Laura', 'Fischer', 'laura.fischer@email.com', '512-555-3009', 'Austin Parent Expo', 'EVT-2026-004', true, true, 'Ben Fischer, Sam Fischer', 'Looking for after-school program', true, NOW() - INTERVAL '4 days', 'Sent school program info. Following up next week.'),
  (109, 'Terrence', 'Brown', 'terrence.brown@email.com', '615-555-3010', 'Nashville Spring Festival', 'EVT-2026-005', true, true, 'Jayden Brown', 'Wants to start ASAP', true, NOW() - INTERVAL '12 hours', 'Hot lead. Trial scheduled for tomorrow.')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 16. MORE APPOINTMENTS (30 more for /tutors and calendar)
-- =============================================================================
-- Appointments use appointment_id (integer), service_id, start, finish, status
INSERT INTO appointments (appointment_id, start, finish, units, topic, location, status, charge_type, service_id, created_at, updated_at)
VALUES
  -- Recent completed lessons
  (10001, NOW() - INTERVAL '1 day' + TIME '14:00', NOW() - INTERVAL '1 day' + TIME '15:00', '1.00', 'Opening principles', '123 Oak Lane, Austin, TX', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10002, NOW() - INTERVAL '1 day' + TIME '15:30', NOW() - INTERVAL '1 day' + TIME '16:30', '1.00', 'Tactics training', '456 Elm St, Nashville, TN', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10003, NOW() - INTERVAL '1 day' + TIME '16:00', NOW() - INTERVAL '1 day' + TIME '17:00', '1.00', 'Endgame basics', 'Online', 'complete', 'hourly', 1002, NOW(), NOW()),
  (10004, NOW() - INTERVAL '2 days' + TIME '14:00', NOW() - INTERVAL '2 days' + TIME '15:00', '1.00', 'Board setup & piece movement', '789 Pine Ave, Dallas, TX', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10005, NOW() - INTERVAL '2 days' + TIME '10:00', NOW() - INTERVAL '2 days' + TIME '11:00', '1.00', 'Check and checkmate patterns', '321 Maple Dr, Austin, TX', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10006, NOW() - INTERVAL '3 days' + TIME '15:00', NOW() - INTERVAL '3 days' + TIME '16:00', '1.00', 'Pawn structures', 'Online', 'complete', 'hourly', 1002, NOW(), NOW()),
  (10007, NOW() - INTERVAL '3 days' + TIME '14:00', NOW() - INTERVAL '3 days' + TIME '15:00', '1.00', 'Knight forks', '654 Cedar Blvd, Nashville, TN', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10008, NOW() - INTERVAL '4 days' + TIME '16:00', NOW() - INTERVAL '4 days' + TIME '17:00', '1.00', 'Rook endgames', '987 Birch Ct, Dallas, TX', 'complete', 'hourly', 1001, NOW(), NOW()),
  (10009, NOW() - INTERVAL '4 days' + TIME '13:00', NOW() - INTERVAL '4 days' + TIME '14:00', '1.00', 'Opening: Italian Game', 'Online', 'complete', 'hourly', 1002, NOW(), NOW()),
  (10010, NOW() - INTERVAL '5 days' + TIME '15:00', NOW() - INTERVAL '5 days' + TIME '16:00', '1.00', 'Piece coordination', '111 Walnut St, Austin, TX', 'complete', 'hourly', 1001, NOW(), NOW()),

  -- Upcoming scheduled lessons
  (10011, NOW() + INTERVAL '1 day' + TIME '14:00', NOW() + INTERVAL '1 day' + TIME '15:00', '1.00', 'Bishop pair strategy', '123 Oak Lane, Austin, TX', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10012, NOW() + INTERVAL '1 day' + TIME '16:00', NOW() + INTERVAL '1 day' + TIME '17:00', '1.00', 'Queen placement', '456 Elm St, Nashville, TN', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10013, NOW() + INTERVAL '1 day' + TIME '10:00', NOW() + INTERVAL '1 day' + TIME '11:00', '1.00', 'Online tactics drill', 'Online', 'planned', 'hourly', 1002, NOW(), NOW()),
  (10014, NOW() + INTERVAL '2 days' + TIME '14:00', NOW() + INTERVAL '2 days' + TIME '15:00', '1.00', 'Sicilian Defense intro', '789 Pine Ave, Dallas, TX', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10015, NOW() + INTERVAL '2 days' + TIME '15:30', NOW() + INTERVAL '2 days' + TIME '16:30', '1.00', 'Discovered attacks', '321 Maple Dr, Austin, TX', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10016, NOW() + INTERVAL '3 days' + TIME '14:00', NOW() + INTERVAL '3 days' + TIME '15:00', '1.00', 'King safety', 'Online', 'planned', 'hourly', 1002, NOW(), NOW()),
  (10017, NOW() + INTERVAL '3 days' + TIME '16:00', NOW() + INTERVAL '3 days' + TIME '17:00', '1.00', 'Pawn promotion', '654 Cedar Blvd, Nashville, TN', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10018, NOW() + INTERVAL '4 days' + TIME '14:00', NOW() + INTERVAL '4 days' + TIME '15:00', '1.00', 'Castling strategy', '987 Birch Ct, Dallas, TX', 'planned', 'hourly', 1001, NOW(), NOW()),
  (10019, NOW() + INTERVAL '4 days' + TIME '10:00', NOW() + INTERVAL '4 days' + TIME '11:00', '1.00', 'Pin and skewer', 'Online', 'planned', 'hourly', 1002, NOW(), NOW()),
  (10020, NOW() + INTERVAL '5 days' + TIME '15:00', NOW() + INTERVAL '5 days' + TIME '16:00', '1.00', 'Middlegame planning', '111 Walnut St, Austin, TX', 'planned', 'hourly', 1001, NOW(), NOW()),

  -- Trial lessons
  (10021, NOW() + INTERVAL '1 day' + TIME '11:00', NOW() + INTERVAL '1 day' + TIME '11:30', '0.50', 'Trial lesson', '200 Pecan St, Austin, TX', 'planned', 'hourly', 1004, NOW(), NOW()),
  (10022, NOW() + INTERVAL '2 days' + TIME '11:00', NOW() + INTERVAL '2 days' + TIME '11:30', '0.50', 'Trial lesson', '300 Hickory Ln, Nashville, TN', 'planned', 'hourly', 1004, NOW(), NOW()),
  (10023, NOW() + INTERVAL '3 days' + TIME '11:00', NOW() + INTERVAL '3 days' + TIME '11:30', '0.50', 'Trial lesson', 'Online', 'planned', 'hourly', 1004, NOW(), NOW()),
  (10024, NOW() - INTERVAL '2 days' + TIME '11:00', NOW() - INTERVAL '2 days' + TIME '11:30', '0.50', 'Trial lesson', '400 Cypress Dr, Dallas, TX', 'complete', 'hourly', 1004, NOW(), NOW()),
  (10025, NOW() - INTERVAL '3 days' + TIME '11:00', NOW() - INTERVAL '3 days' + TIME '11:30', '0.50', 'Trial lesson', '500 Spruce Way, Austin, TX', 'complete', 'hourly', 1004, NOW(), NOW()),

  -- Club sessions
  (10026, NOW() - INTERVAL '2 days' + TIME '16:00', NOW() - INTERVAL '2 days' + TIME '17:30', '1.50', 'Saturday chess club', 'Austin Community Center', 'complete', 'hourly', 1003, NOW(), NOW()),
  (10027, NOW() - INTERVAL '9 days' + TIME '16:00', NOW() - INTERVAL '9 days' + TIME '17:30', '1.50', 'Saturday chess club', 'Austin Community Center', 'complete', 'hourly', 1003, NOW(), NOW()),
  (10028, NOW() + INTERVAL '5 days' + TIME '16:00', NOW() + INTERVAL '5 days' + TIME '17:30', '1.50', 'Saturday chess club', 'Austin Community Center', 'planned', 'hourly', 1003, NOW(), NOW()),

  -- Group sessions
  (10029, NOW() - INTERVAL '1 day' + TIME '17:00', NOW() - INTERVAL '1 day' + TIME '18:00', '1.00', 'Beginner group', 'Nashville YMCA', 'complete', 'hourly', 1005, NOW(), NOW()),
  (10030, NOW() + INTERVAL '6 days' + TIME '17:00', NOW() + INTERVAL '6 days' + TIME '18:00', '1.00', 'Beginner group', 'Nashville YMCA', 'planned', 'hourly', 1005, NOW(), NOW())
ON CONFLICT (appointment_id) DO NOTHING;

-- Link appointments to contractors
INSERT INTO appointment_contractors (appointment_id, contractor_id, contractor_name, pay_rate)
VALUES
  (10001, 1, 'Marcus Rivera', 45.00),
  (10002, 2, 'Sarah Kim', 42.00),
  (10003, 6, 'Online Tutor', 35.00),
  (10004, 3, 'James Okafor', 45.00),
  (10005, 1, 'Marcus Rivera', 45.00),
  (10006, 6, 'Online Tutor', 35.00),
  (10007, 5, 'Alex Thompson', 42.00),
  (10008, 3, 'James Okafor', 45.00),
  (10009, 6, 'Online Tutor', 35.00),
  (10010, 4, 'Emily Patel', 45.00),
  (10011, 1, 'Marcus Rivera', 45.00),
  (10012, 2, 'Sarah Kim', 42.00),
  (10013, 6, 'Online Tutor', 35.00),
  (10014, 3, 'James Okafor', 45.00),
  (10015, 4, 'Emily Patel', 45.00),
  (10016, 6, 'Online Tutor', 35.00),
  (10017, 5, 'Alex Thompson', 42.00),
  (10018, 3, 'James Okafor', 45.00),
  (10019, 6, 'Online Tutor', 35.00),
  (10020, 1, 'Marcus Rivera', 45.00),
  (10021, 4, 'Emily Patel', 15.00),
  (10022, 2, 'Sarah Kim', 15.00),
  (10023, 6, 'Online Tutor', 15.00),
  (10024, 3, 'James Okafor', 15.00),
  (10025, 1, 'Marcus Rivera', 15.00),
  (10026, 7, 'Club Tutor Austin', 50.00),
  (10027, 7, 'Club Tutor Austin', 50.00),
  (10028, 7, 'Club Tutor Austin', 50.00),
  (10029, 8, 'Group Tutor Nashville', 55.00),
  (10030, 8, 'Group Tutor Nashville', 55.00)
ON CONFLICT (appointment_id, contractor_id) DO NOTHING;

-- =============================================================================
-- 17. MORE INVOICES (20 more for /accounting)
-- =============================================================================
INSERT INTO invoices (id, display_id, client_id, client_first_name, client_last_name, client_email, gross, net, tax, status, date_created)
VALUES
  -- Paid invoices
  (10001, 'INV-10001', 1031, 'Alexander', 'Campbell', 'alexander.campbell@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '30 days'),
  (10002, 'INV-10002', 1032, 'Riley', 'Evans', 'riley.evans@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '28 days'),
  (10003, 'INV-10003', 1033, 'Mason', 'Stewart', 'mason.stewart@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '25 days'),
  (10004, 'INV-10004', 1034, 'Aria', 'Sanchez', 'aria.sanchez@email.com', 59.00, 59.00, 0.00, 'paid', NOW() - INTERVAL '22 days'),
  (10005, 'INV-10005', 1031, 'Alexander', 'Campbell', 'alexander.campbell@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '16 days'),
  (10006, 'INV-10006', 1035, 'Logan', 'Morris', 'logan.morris@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '14 days'),
  (10007, 'INV-10007', 1036, 'Nora', 'Rogers', 'nora.rogers@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '12 days'),
  (10008, 'INV-10008', 1032, 'Riley', 'Evans', 'riley.evans@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '10 days'),
  (10009, 'INV-10009', 1034, 'Aria', 'Sanchez', 'aria.sanchez@email.com', 59.00, 59.00, 0.00, 'paid', NOW() - INTERVAL '8 days'),
  (10010, 'INV-10010', 1033, 'Mason', 'Stewart', 'mason.stewart@email.com', 119.00, 119.00, 0.00, 'paid', NOW() - INTERVAL '5 days'),

  -- Open/unpaid invoices
  (10011, 'INV-10011', 1026, 'Zoe', 'Mitchell', 'zoe.mitchell@email.com', 119.00, 119.00, 0.00, 'open', NOW() - INTERVAL '3 days'),
  (10012, 'INV-10012', 1027, 'Jack', 'Perez', 'jack.perez@email.com', 119.00, 119.00, 0.00, 'open', NOW() - INTERVAL '2 days'),
  (10013, 'INV-10013', 1028, 'Penelope', 'Roberts', 'penelope.roberts@email.com', 119.00, 119.00, 0.00, 'open', NOW() - INTERVAL '1 day'),
  (10014, 'INV-10014', 1030, 'Layla', 'Phillips', 'layla.phillips@email.com', 59.00, 59.00, 0.00, 'open', NOW() - INTERVAL '1 day'),
  (10015, 'INV-10015', 1029, 'Owen', 'Turner', 'owen.turner@email.com', 119.00, 119.00, 0.00, 'open', NOW()),

  -- Draft invoices
  (10016, 'INV-10016', 1031, 'Alexander', 'Campbell', 'alexander.campbell@email.com', 119.00, 119.00, 0.00, 'draft', NOW()),
  (10017, 'INV-10017', 1035, 'Logan', 'Morris', 'logan.morris@email.com', 119.00, 119.00, 0.00, 'draft', NOW()),

  -- Void invoices
  (10018, 'INV-10018', 1036, 'Nora', 'Rogers', 'nora.rogers@email.com', 119.00, 119.00, 0.00, 'void', NOW() - INTERVAL '20 days'),
  (10019, 'INV-10019', 1034, 'Aria', 'Sanchez', 'aria.sanchez@email.com', 59.00, 59.00, 0.00, 'void', NOW() - INTERVAL '15 days'),

  -- Club invoice
  (10020, 'INV-10020', 1039, 'Eli', 'Morgan', 'eli.morgan@email.com', 60.00, 60.00, 0.00, 'paid', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 18. SCORECARD METRICS (weekly KPI tracking)
-- =============================================================================
-- Seed metric definitions
INSERT INTO scorecard_metrics (id, metric_key, display_name, owner, category, goal_value, goal_direction, data_source, display_format, sort_order, is_active)
VALUES
  (100, 'weekly_revenue', 'Weekly Revenue', 'Finance', 'Revenue', 22000.00, 'above', 'auto', 'currency', 1, true),
  (101, 'weekly_lessons', 'Lessons Delivered', 'Operations', 'Operations', 230.00, 'above', 'auto', 'number', 2, true),
  (102, 'trial_conversion_rate', 'Trial Conversion Rate', 'Sales', 'Sales', 65.00, 'above', 'auto', 'percent', 3, true),
  (103, 'new_leads', 'New Leads', 'Marketing', 'Marketing', 25.00, 'above', 'auto', 'number', 4, true),
  (104, 'active_tutors', 'Active Tutors', 'Operations', 'Operations', 35.00, 'above', 'auto', 'number', 5, true),
  (105, 'client_churn', 'Client Churn', 'Success', 'Retention', 3.00, 'below', 'auto', 'percent', 6, true),
  (106, 'avg_tutor_utilization', 'Tutor Utilization', 'Operations', 'Operations', 75.00, 'above', 'auto', 'percent', 7, true),
  (107, 'school_contracts_active', 'Active School Contracts', 'Partnerships', 'Schools', 10.00, 'above', 'auto', 'number', 8, true)
ON CONFLICT (metric_key) DO NOTHING;

-- Seed snapshots for past 4 weeks
INSERT INTO scorecard_snapshots (id, metric_key, week_start, week_end, actual_value, goal_value, is_on_track, source)
VALUES
  -- Week 1 (4 weeks ago)
  (200, 'weekly_revenue', CURRENT_DATE - INTERVAL '28 days', CURRENT_DATE - INTERVAL '22 days', 20450.00, 22000.00, false, 'auto'),
  (201, 'weekly_lessons', CURRENT_DATE - INTERVAL '28 days', CURRENT_DATE - INTERVAL '22 days', 215, 230, false, 'auto'),
  (202, 'trial_conversion_rate', CURRENT_DATE - INTERVAL '28 days', CURRENT_DATE - INTERVAL '22 days', 62.00, 65.00, false, 'auto'),
  (203, 'new_leads', CURRENT_DATE - INTERVAL '28 days', CURRENT_DATE - INTERVAL '22 days', 22, 25, false, 'auto'),
  -- Week 2 (3 weeks ago)
  (204, 'weekly_revenue', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE - INTERVAL '15 days', 21800.00, 22000.00, false, 'auto'),
  (205, 'weekly_lessons', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE - INTERVAL '15 days', 228, 230, false, 'auto'),
  (206, 'trial_conversion_rate', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE - INTERVAL '15 days', 68.00, 65.00, true, 'auto'),
  (207, 'new_leads', CURRENT_DATE - INTERVAL '21 days', CURRENT_DATE - INTERVAL '15 days', 27, 25, true, 'auto'),
  -- Week 3 (2 weeks ago)
  (208, 'weekly_revenue', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '8 days', 23100.00, 22000.00, true, 'auto'),
  (209, 'weekly_lessons', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '8 days', 241, 230, true, 'auto'),
  (210, 'trial_conversion_rate', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '8 days', 71.00, 65.00, true, 'auto'),
  (211, 'new_leads', CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE - INTERVAL '8 days', 30, 25, true, 'auto'),
  -- Week 4 (last week)
  (212, 'weekly_revenue', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '1 day', 22650.00, 22000.00, true, 'auto'),
  (213, 'weekly_lessons', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '1 day', 235, 230, true, 'auto'),
  (214, 'trial_conversion_rate', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '1 day', 66.00, 65.00, true, 'auto'),
  (215, 'new_leads', CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE - INTERVAL '1 day', 28, 25, true, 'auto')
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- DONE
-- =============================================================================

COMMIT;

-- Verify counts
SELECT 'administrators' as tbl, COUNT(*) as cnt FROM administrators
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'clients (total)', COUNT(*) FROM clients
UNION ALL SELECT 'school_metadata', COUNT(*) FROM school_metadata
UNION ALL SELECT 'school_contacts', COUNT(*) FROM school_contacts
UNION ALL SELECT 'school_term_status', COUNT(*) FROM school_term_status
UNION ALL SELECT 'school_revenue_by_term', COUNT(*) FROM school_revenue_by_term
UNION ALL SELECT 'club_students', COUNT(*) FROM club_students
UNION ALL SELECT 'ad_spend_data', COUNT(*) FROM ad_spend_data
UNION ALL SELECT 'daily_actuals', COUNT(*) FROM daily_actuals
UNION ALL SELECT 'daily_pipeline', COUNT(*) FROM daily_pipeline
UNION ALL SELECT 'company_metrics', COUNT(*) FROM company_metrics
UNION ALL SELECT 'marketing_content_calendar', COUNT(*) FROM marketing_content_calendar
UNION ALL SELECT 'marketing_blog_drafts', COUNT(*) FROM marketing_blog_drafts
UNION ALL SELECT 'marketing_instagram_posts', COUNT(*) FROM marketing_instagram_posts
UNION ALL SELECT 'tutor_labels', COUNT(*) FROM tutor_labels
UNION ALL SELECT 'tutor_notes', COUNT(*) FROM tutor_notes
UNION ALL SELECT 'event_leads', COUNT(*) FROM event_leads
UNION ALL SELECT 'appointments (total)', COUNT(*) FROM appointments
UNION ALL SELECT 'appointment_contractors', COUNT(*) FROM appointment_contractors
UNION ALL SELECT 'invoices (total)', COUNT(*) FROM invoices
UNION ALL SELECT 'scorecard_metrics', COUNT(*) FROM scorecard_metrics
UNION ALL SELECT 'scorecard_snapshots', COUNT(*) FROM scorecard_snapshots
ORDER BY tbl;
