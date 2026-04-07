const express = require('express');
const router = express.Router();

const { getLocationPool: getPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Get school dashboard data
router.get('/dashboard', asyncHandler(async (req, res) => {
  logger.info('📊 School dashboard endpoint hit');
  try {
    const pool = getPool(req);
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      throw new Error('Database pool not available');
    }
    
    logger.info('✅ Database pool available');
    
    // Detect location from hostname
    const hostname = req.get('host') || req.hostname || '';
    let detectedLocation = null;
    if (hostname.includes('eastside')) {
      detectedLocation = 'Eastside';
    } else if (hostname.includes('westside')) {
      detectedLocation = 'Westside';
    }
    
    // Get location filter from query params (NYC, LA, SF, Hamptons, 'Eastside', 'Westside', dormant, or all)
    // If no explicit filter is provided and we're on a location-specific subdomain, default to that location
    const queryLocation = req.query.location;
    const locationFilter = queryLocation || (detectedLocation && !queryLocation ? detectedLocation : 'all');
    const validLocations = ['NYC', 'LA', 'SF', 'Hamptons', 'Eastside', 'Westside', 'dormant'];
    
    // Handle dormant filter separately
    const showDormantOnly = locationFilter === 'dormant';
    
    // Build label filter based on location
    // Include all possible school labels
    // For dormant schools, include ALL labels (don't filter by location)
    let schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 'School - Eastside', 'School - Westside'];
    if (locationFilter !== 'all' && !showDormantOnly && validLocations.includes(locationFilter)) {
      // User explicitly selected a location, filter to that location
      schoolLabels = [`School - ${locationFilter}`];
    }
    // If showDormantOnly, schoolLabels already includes all locations (no filtering)
    // If locationFilter is 'all', we keep all labels (show all schools)
    
    logger.info({ hostname, detectedLocation, queryLocation, locationFilter, schoolLabels }, '📍 Schools dashboard location context');
    
    // Determine if we should use school-name-based grouping (Eastside/Westside) or paying_client_id grouping (main production)
    const useSchoolNameGrouping = detectedLocation === 'Eastside' || detectedLocation === 'Westside';
    logger.info({ useSchoolNameGrouping, detectedLocation }, '📊 Schools dashboard grouping strategy');
    
    // Query to get schools with their jobs, revenue, costs, and invoices
    // For Eastside/Westside: Group by school name (extracted from service name)
    // For main production: Group by paying client (school)
    const query = useSchoolNameGrouping ? `
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.status AS service_status,
          s.labels AS service_labels,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.dft_charge_type,
          s.created_at,
          s.updated_at,
          -- Extract term from service name (e.g., "Fall 2025", "Spring 2024")
          CASE 
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}' 
            THEN (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+\\d{4}', 'i'))[1] || ' ' || (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+(\\d{4})', 'i'))[2]
            ELSE NULL
          END AS term_season,
          -- Get school label from service (handle both text arrays and object arrays)
          COALESCE(
            (SELECT label->>'name'
             FROM jsonb_array_elements(s.labels) AS label 
             WHERE label->>'name' LIKE 'School - %' 
             LIMIT 1),
            (SELECT label::text
             FROM jsonb_array_elements_text(s.labels) AS label 
             WHERE label LIKE 'School - %' 
             LIMIT 1)
          ) AS school_label,
          -- Get paying client for this service (from appointments) - this is the school
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = s.service_id
           LIMIT 1) AS paying_client_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      -- Extract school name from service name and identify school type
      -- Group by school name (extracted from service name) to handle both:
      -- Type 1: School pays directly (paying_client_id = school's client_id)
      -- Type 2: Parents pay (group by school name from service)
      school_groups AS (
        SELECT DISTINCT
          -- Extract school name from service name (everything before " // ")
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          -- Get the primary paying client ID (if school pays directly, this is the school's client_id)
          -- For parent-paid schools, this will be NULL or vary by appointment
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = ss.service_id
             AND a.is_deleted IS NOT TRUE
           LIMIT 1) AS primary_paying_client_id,
          -- Check if this school pays directly (paying_client_id matches a client with school name)
          EXISTS (
            SELECT 1 
            FROM clients c
            WHERE c.client_id::text = (
              SELECT DISTINCT ar.paying_client_id::text
              FROM appointments a
              JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              WHERE a.service_id = ss.service_id
                AND a.is_deleted IS NOT TRUE
              LIMIT 1
            )
            AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || SPLIT_PART(ss.service_name, ' // ', 1) || '%'
          ) AS school_pays_directly,
          ss.school_label
        FROM school_services ss
      ),
      -- Get school clients - one entry per unique school name
      -- Use ROW_NUMBER to prefer schools that pay directly (have real client_id) over synthetic ones
      school_clients_ranked AS (
        SELECT 
          sg.school_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.id::integer FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE NULL
          END AS id,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              sg.primary_paying_client_id
            ELSE 
              'SCHOOL_' || MD5(sg.school_name)::text
          END AS client_id,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 1)::text
            ELSE
              sg.school_name::text
          END AS first_name,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 2)::text
            ELSE
              ''::text
          END AS last_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.email::text FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE
              NULL::text
          END AS email,
          sg.school_label::text,
          -- Rank: prefer schools that pay directly (rank 1) over synthetic ones (rank 2)
          ROW_NUMBER() OVER (
            PARTITION BY sg.school_name 
            ORDER BY CASE WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN 1 ELSE 2 END,
                     sg.primary_paying_client_id NULLS LAST
          ) AS rn
        FROM school_groups sg
      ),
      school_clients AS (
        SELECT 
          school_name,
          id,
          client_id,
          first_name,
          last_name,
          email,
          school_label
        FROM school_clients_ranked
        WHERE rn = 1
      ),
      -- Get student enrollment per service
      service_students AS (
        SELECT
          a.service_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'student_id', ar.recipient_id,
              'student_name', COALESCE(
                NULLIF(TRIM(ar.recipient_name), ''),
                c.first_name || ' ' || c.last_name,
                'Unknown'
              ),
              'client_id', ar.paying_client_id
            )
          ) AS students
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON c.client_id = ar.recipient_id::text
        WHERE a.service_id IN (SELECT service_id FROM school_services)
          AND ar.status <> 'missed'
        GROUP BY a.service_id
      ),
      -- Filter school services first
      filtered_school_services AS (
        SELECT s.service_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      -- Calculate student premium per appointment
      appointment_premium AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COUNT(*) * COALESCE(s.sr_premium, 0) * a.units AS premium_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, s.sr_premium, a.units
      ),
      -- Calculate tutor cost per appointment (avoid cartesian product with students)
      appointment_tutor_cost AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ac.pay_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ), 0) AS base_tutor_cost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, a.units, a.charge_type, s.dft_charge_type
      ),
      -- Service metadata (for is_finished check)
      service_metadata AS (
        SELECT DISTINCT
          s.service_id,
          s.labels,
          -- Check if service is finished (has "Job Finished" label or no recent appointments)
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.labels) AS label
              WHERE label->>'name' ILIKE '%Job Finished%'
            ) OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
              WHERE label ILIKE '%Job Finished%'
            ) THEN true
            WHEN NOT EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.service_id = s.service_id
                AND a2.start > NOW() - INTERVAL '30 days'
                AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
            ) THEN true
            ELSE false
          END AS is_finished
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
      ),
      -- Calculate tutor costs per service (separate from revenue to avoid cartesian product)
      service_tutor_costs AS (
        SELECT
          atc.service_id,
          COALESCE(SUM(atc.base_tutor_cost), 0) + COALESCE(SUM(ap.premium_pay), 0) AS total_tutor_cost
        FROM appointment_tutor_cost atc
        LEFT JOIN appointment_premium ap ON ap.appointment_id = atc.appointment_id
        GROUP BY atc.service_id
      ),
      -- Calculate revenue and tutor costs per service
      service_financials AS (
        SELECT
          s.service_id,
          -- Revenue from appointments (use service default charge type)
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ar.charge_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 0) AS total_revenue,
          -- Tutor costs from separate CTE (avoids cartesian product with students)
          COALESCE(stc.total_tutor_cost, 0) AS total_tutor_cost,
          -- Enrollment count (unique students)
          COUNT(DISTINCT ar.recipient_id) AS enrollment_count,
          -- Number of lessons
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          -- Tutor names (from separate aggregation to avoid duplicates)
          (SELECT STRING_AGG(DISTINCT ac2.contractor_name, ', ')
           FROM appointment_contractors ac2
           JOIN appointments a2 ON ac2.appointment_id = a2.appointment_id
           WHERE a2.service_id = s.service_id
             AND a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
          ) AS tutor_names
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointments a ON a.service_id = s.service_id
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        LEFT JOIN service_tutor_costs stc ON stc.service_id = s.service_id
        GROUP BY s.service_id, stc.total_tutor_cost
      ),
      -- Get invoices per school client (only for schools that pay directly)
      school_invoices AS (
        SELECT
          i.client_id::text,
          COUNT(*) FILTER (WHERE i.status = 'paid') AS paid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'paid') AS paid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid') AS unpaid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid') AS unpaid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_amount,
          MAX(CASE 
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
            ELSE NULL
          END) AS max_days_outstanding_unpaid,
          -- Get invoice details with reminder counts
          json_agg(
            json_build_object(
              'id', i.id,
              'display_id', i.display_id,
              'date_sent', i.date_sent,
              'gross', i.gross,
              'status', i.status,
              'url', i.url,
              'days_outstanding', CASE 
                WHEN i.status = 'unpaid' THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
                ELSE NULL
              END,
              'reminder_count', COALESCE(ir.reminder_count, 0),
              'last_reminder_sent_at', ir.last_reminder_sent_at
            ) ORDER BY i.date_sent DESC
          ) FILTER (WHERE i.id IS NOT NULL) AS invoices
        FROM invoices i
        LEFT JOIN (
          SELECT 
            invoice_id,
            COUNT(*) as reminder_count,
            MAX(reminder_sent_at) as last_reminder_sent_at
          FROM invoice_reminders
          GROUP BY invoice_id
        ) ir ON ir.invoice_id = i.id
        WHERE i.client_id::text IN (
          SELECT DISTINCT client_id::text 
          FROM school_clients 
          WHERE client_id NOT LIKE 'SCHOOL_%'
        )
        -- Exclude cancelled, voided, and refunded invoices to match Invoice Fulfillment page
        AND LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
        GROUP BY i.client_id
      ),
      -- Aggregate jobs per school name (not paying_client_id)
      -- This groups all services/jobs for the same school together
      school_jobs AS (
        SELECT
          -- Group by school name extracted from service name
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          jsonb_agg(
            jsonb_build_object(
              'service_id', ss.service_id,
              'service_name', ss.service_name,
              'service_status', ss.service_status,
              'charge_type', ss.dft_charge_type,
              'term_season', ss.term_season,
              'created_at', ss.created_at,
              'updated_at', ss.updated_at,
              'is_finished', COALESCE(sm.is_finished, false),
              'enrollment_count', COALESCE(sf.enrollment_count, 0),
              'student_count', COALESCE(st.student_count, 0),
              'students', COALESCE(st.students, '[]'::jsonb),
              'lesson_count', COALESCE(sf.lesson_count, 0),
              'tutor_names', sf.tutor_names,
              'tutor_rate', ss.dft_contractor_rate,
              'school_rate', ss.dft_charge_rate,
              'revenue', COALESCE(sf.total_revenue, 0),
              'tutor_cost', COALESCE(sf.total_tutor_cost, 0),
              'margin', COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0),
              'margin_percent', CASE 
                WHEN COALESCE(sf.total_revenue, 0) > 0 
                THEN ROUND(((COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0)) / sf.total_revenue) * 100, 2)
                ELSE 0
              END
            ) ORDER BY ss.service_id
          ) AS jobs,
          -- Calculate school-level totals (aggregate across all services for this school)
          COALESCE(SUM(sf.total_revenue), 0) AS total_revenue,
          COALESCE(SUM(sf.total_tutor_cost), 0) AS total_tutor_cost,
          COALESCE(SUM(sf.enrollment_count), 0) AS total_enrollment,
          COALESCE(SUM(st.student_count), 0) AS total_students,
          COALESCE(SUM(sf.lesson_count), 0) AS total_lessons
        FROM school_services ss
        LEFT JOIN service_financials sf ON sf.service_id = ss.service_id
        LEFT JOIN service_metadata sm ON sm.service_id = ss.service_id
        LEFT JOIN service_students st ON st.service_id = ss.service_id
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1)
      )
      SELECT
        sc.id,
        sc.client_id,
        sc.school_name,
        sc.first_name,
        sc.last_name,
        sc.email,
        sc.school_label,
        -- Get jobs from aggregated CTE - match by school name
        COALESCE(sj.jobs, '[]'::jsonb) AS jobs,
        -- School-level totals from aggregated CTE (P&L data)
        -- Revenue = all payments from parents (for parent-paid schools) or school (for direct-pay schools)
        COALESCE(sj.total_revenue, 0) AS total_revenue,
        -- Tutor Cost = all tutor payments for lessons at this school
        COALESCE(sj.total_tutor_cost, 0) AS total_tutor_cost,
        -- Margin = Revenue - Tutor Cost (Profit & Loss)
        COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0) AS total_margin,
        CASE 
          WHEN COALESCE(sj.total_revenue, 0) > 0 
          THEN ROUND(((COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0)) / sj.total_revenue) * 100, 2)
          ELSE 0
        END AS total_margin_percent,
        COALESCE(sj.total_enrollment, 0) AS total_enrollment,
        COALESCE(sj.total_students, 0) AS total_students,
        COALESCE(sj.total_lessons, 0) AS total_lessons,
        -- Check if school is active (has non-finished jobs)
        EXISTS (
          SELECT 1 
          FROM school_services ss2
          JOIN service_metadata sm2 ON ss2.service_id = sm2.service_id
          WHERE SPLIT_PART(ss2.service_name, ' // ', 1) = sc.school_name
            AND COALESCE(sm2.is_finished, false) = false
        ) AS is_active,
        -- Invoice data (only for schools that pay directly)
        COALESCE(si.paid_count, 0) AS paid_invoices_count,
        COALESCE(si.paid_amount, 0) AS paid_invoices_amount,
        COALESCE(si.unpaid_count, 0) AS unpaid_invoices_count,
        COALESCE(si.unpaid_amount, 0) AS unpaid_invoices_amount,
        COALESCE(si.late_count, 0) AS late_invoices_count,
        COALESCE(si.late_amount, 0) AS late_invoices_amount,
        COALESCE(si.max_days_outstanding_unpaid, 0) AS max_days_outstanding_unpaid,
        si.invoices AS invoice_details
      FROM school_clients sc
      LEFT JOIN school_jobs sj ON sj.school_name = sc.school_name
      LEFT JOIN school_invoices si ON si.client_id = sc.client_id::text 
        AND sc.client_id NOT LIKE 'SCHOOL_%'
      ORDER BY sc.first_name, sc.last_name
    ` : `
      -- MAIN PRODUCTION QUERY - Group by school name (extracted from service name)
      -- This handles both parent-paid and school-paid scenarios
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.status AS service_status,
          s.labels AS service_labels,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.dft_charge_type,
          s.created_at,
          s.updated_at,
          -- Extract term from service name (e.g., "Fall 2025", "Spring 2024")
          CASE 
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}' 
            THEN (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+\\d{4}', 'i'))[1] || ' ' || (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+(\\d{4})', 'i'))[2]
            ELSE NULL
          END AS term_season,
          -- Get school label from service (handle both text arrays and object arrays)
          COALESCE(
            (SELECT label->>'name'
             FROM jsonb_array_elements(s.labels) AS label 
             WHERE label->>'name' LIKE 'School - %' 
             LIMIT 1),
            (SELECT label::text
             FROM jsonb_array_elements_text(s.labels) AS label 
             WHERE label LIKE 'School - %' 
             LIMIT 1)
          ) AS school_label,
          -- Get paying client for this service (from appointments)
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = s.service_id
           LIMIT 1) AS paying_client_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      -- Extract school name from service name and identify school type
      -- Group by school name (extracted from service name) to handle both:
      -- Type 1: School pays directly (paying_client_id = school's client_id)
      -- Type 2: Parents pay (group by school name from service)
      school_groups AS (
        SELECT DISTINCT
          -- Extract school name from service name (everything before " // ")
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          -- Get the primary paying client ID (if school pays directly, this is the school's client_id)
          -- For parent-paid schools, this will be NULL or vary by appointment
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = ss.service_id
             AND a.is_deleted IS NOT TRUE
           LIMIT 1) AS primary_paying_client_id,
          -- Check if this school pays directly (paying_client_id matches a client with school name)
          EXISTS (
            SELECT 1 
        FROM clients c
            WHERE c.client_id::text = (
              SELECT DISTINCT ar.paying_client_id::text
              FROM appointments a
              JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              WHERE a.service_id = ss.service_id
                AND a.is_deleted IS NOT TRUE
              LIMIT 1
            )
            AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || SPLIT_PART(ss.service_name, ' // ', 1) || '%'
          ) AS school_pays_directly,
          ss.school_label
        FROM school_services ss
      ),
      -- Get school clients - one entry per unique school name
      -- Use ROW_NUMBER to prefer schools that pay directly (have real client_id) over synthetic ones
      school_clients_ranked AS (
        SELECT 
          sg.school_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.id::integer FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE NULL
          END AS id,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              sg.primary_paying_client_id
            ELSE 
              'SCHOOL_' || MD5(sg.school_name)::text
          END AS client_id,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 1)::text
            ELSE
              sg.school_name::text
          END AS first_name,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 2)::text
            ELSE
              ''::text
          END AS last_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.email::text FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE
              NULL::text
          END AS email,
          sg.school_label::text,
          -- Rank: prefer schools that pay directly (rank 1) over synthetic ones (rank 2)
          ROW_NUMBER() OVER (
            PARTITION BY sg.school_name 
            ORDER BY CASE WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN 1 ELSE 2 END,
                     sg.primary_paying_client_id NULLS LAST
          ) AS rn
        FROM school_groups sg
      ),
      school_clients AS (
        SELECT 
          school_name,
          id,
          client_id,
          first_name,
          last_name,
          email,
          school_label
        FROM school_clients_ranked
        WHERE rn = 1
      ),
      -- Get student enrollment per service
      service_students AS (
        SELECT
          a.service_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'student_id', ar.recipient_id,
              'student_name', COALESCE(
                NULLIF(TRIM(ar.recipient_name), ''),
                c.first_name || ' ' || c.last_name,
                'Unknown'
              ),
              'client_id', ar.paying_client_id
            )
          ) AS students
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON c.client_id = ar.recipient_id::text
        WHERE a.service_id IN (SELECT service_id FROM school_services)
          AND ar.status <> 'missed'
        GROUP BY a.service_id
      ),
      -- Filter school services first
      filtered_school_services AS (
        SELECT s.service_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      -- Calculate student premium per appointment
      appointment_premium AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COUNT(*) * COALESCE(s.sr_premium, 0) * a.units AS premium_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, s.sr_premium, a.units
      ),
      -- Calculate tutor cost per appointment (avoid cartesian product with students)
      appointment_tutor_cost AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ac.pay_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ), 0) AS base_tutor_cost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, a.units, a.charge_type, s.dft_charge_type
      ),
      -- Service metadata (for is_finished check)
      service_metadata AS (
        SELECT DISTINCT
          s.service_id,
          s.labels,
          -- Check if service is finished (has "Job Finished" label or no recent appointments)
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.labels) AS label
              WHERE label->>'name' ILIKE '%Job Finished%'
            ) OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
              WHERE label ILIKE '%Job Finished%'
            ) THEN true
            WHEN NOT EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.service_id = s.service_id
                AND a2.start > NOW() - INTERVAL '30 days'
                AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
            ) THEN true
            ELSE false
          END AS is_finished
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
      ),
      -- Calculate tutor costs per service (separate from revenue to avoid cartesian product)
      service_tutor_costs AS (
        SELECT
          atc.service_id,
          COALESCE(SUM(atc.base_tutor_cost), 0) + COALESCE(SUM(ap.premium_pay), 0) AS total_tutor_cost
        FROM appointment_tutor_cost atc
        LEFT JOIN appointment_premium ap ON ap.appointment_id = atc.appointment_id
        GROUP BY atc.service_id
      ),
      -- Calculate revenue and tutor costs per service
      service_financials AS (
        SELECT
          s.service_id,
          -- Revenue from appointments (use service default charge type)
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ar.charge_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 0) AS total_revenue,
          -- Tutor costs from separate CTE (avoids cartesian product with students)
          COALESCE(stc.total_tutor_cost, 0) AS total_tutor_cost,
          -- Enrollment count (unique students)
          COUNT(DISTINCT ar.recipient_id) AS enrollment_count,
          -- Number of lessons
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          -- Tutor names (from separate aggregation to avoid duplicates)
          (SELECT STRING_AGG(DISTINCT ac2.contractor_name, ', ')
           FROM appointment_contractors ac2
           JOIN appointments a2 ON ac2.appointment_id = a2.appointment_id
           WHERE a2.service_id = s.service_id
             AND a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
          ) AS tutor_names
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointments a ON a.service_id = s.service_id
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        LEFT JOIN service_tutor_costs stc ON stc.service_id = s.service_id
        GROUP BY s.service_id, stc.total_tutor_cost
      ),
      -- Get invoices per school client
      school_invoices AS (
        SELECT
          i.client_id::text,
          COUNT(*) FILTER (WHERE i.status = 'paid') AS paid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'paid') AS paid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid') AS unpaid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid') AS unpaid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_amount,
          MAX(CASE 
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
            ELSE NULL
          END) AS max_days_outstanding_unpaid,
          -- Get invoice details with reminder counts
          json_agg(
            json_build_object(
              'id', i.id,
              'display_id', i.display_id,
              'date_sent', i.date_sent,
              'gross', i.gross,
              'status', i.status,
              'url', i.url,
              'days_outstanding', CASE 
                WHEN i.status = 'unpaid' THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
                ELSE NULL
              END,
              'reminder_count', COALESCE(ir.reminder_count, 0),
              'last_reminder_sent_at', ir.last_reminder_sent_at
            ) ORDER BY i.date_sent DESC
          ) FILTER (WHERE i.id IS NOT NULL) AS invoices
        FROM invoices i
        LEFT JOIN (
          SELECT 
            invoice_id,
            COUNT(*) as reminder_count,
            MAX(reminder_sent_at) as last_reminder_sent_at
          FROM invoice_reminders
          GROUP BY invoice_id
        ) ir ON ir.invoice_id = i.id
        JOIN school_clients sc ON sc.client_id::text = i.client_id::text
        -- Exclude cancelled, voided, and refunded invoices to match Invoice Fulfillment page
        WHERE LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
        GROUP BY i.client_id
      ),
      -- Aggregate jobs per school name (not paying_client_id)
      -- This groups all services/jobs for the same school together
      school_jobs AS (
        SELECT
          -- Group by school name extracted from service name
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          jsonb_agg(
            jsonb_build_object(
              'service_id', ss.service_id,
              'service_name', ss.service_name,
              'service_status', ss.service_status,
              'charge_type', ss.dft_charge_type,
              'term_season', ss.term_season,
              'created_at', ss.created_at,
              'updated_at', ss.updated_at,
              'is_finished', COALESCE(sm.is_finished, false),
              'enrollment_count', COALESCE(sf.enrollment_count, 0),
              'student_count', COALESCE(st.student_count, 0),
              'students', COALESCE(st.students, '[]'::jsonb),
              'lesson_count', COALESCE(sf.lesson_count, 0),
              'tutor_names', sf.tutor_names,
              'tutor_rate', ss.dft_contractor_rate,
              'school_rate', ss.dft_charge_rate,
              'revenue', COALESCE(sf.total_revenue, 0),
              'tutor_cost', COALESCE(sf.total_tutor_cost, 0),
              'margin', COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0),
              'margin_percent', CASE 
                WHEN COALESCE(sf.total_revenue, 0) > 0 
                THEN ROUND(((COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0)) / sf.total_revenue) * 100, 2)
                ELSE 0
              END
            ) ORDER BY ss.service_id
          ) AS jobs,
          -- Calculate school-level totals (aggregate across all services for this school)
          COALESCE(SUM(sf.total_revenue), 0) AS total_revenue,
          COALESCE(SUM(sf.total_tutor_cost), 0) AS total_tutor_cost,
          COALESCE(SUM(sf.enrollment_count), 0) AS total_enrollment,
          COALESCE(SUM(st.student_count), 0) AS total_students,
          COALESCE(SUM(sf.lesson_count), 0) AS total_lessons
        FROM school_services ss
        LEFT JOIN service_financials sf ON sf.service_id = ss.service_id
        LEFT JOIN service_metadata sm ON sm.service_id = ss.service_id
        LEFT JOIN service_students st ON st.service_id = ss.service_id
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1)
      )
      SELECT
        sc.id,
        sc.client_id,
        sc.school_name,
        sc.first_name,
        sc.last_name,
        sc.email,
        sc.school_label,
        -- Get jobs from aggregated CTE - match by school name
        COALESCE(sj.jobs, '[]'::jsonb) AS jobs,
        -- School-level totals from aggregated CTE (P&L data)
        -- Revenue = all payments from parents (for parent-paid schools) or school (for direct-pay schools)
        COALESCE(sj.total_revenue, 0) AS total_revenue,
        -- Tutor Cost = all tutor payments for lessons at this school
        COALESCE(sj.total_tutor_cost, 0) AS total_tutor_cost,
        -- Margin = Revenue - Tutor Cost (Profit & Loss)
        COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0) AS total_margin,
        CASE 
          WHEN COALESCE(sj.total_revenue, 0) > 0 
          THEN ROUND(((COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0)) / sj.total_revenue) * 100, 2)
          ELSE 0
        END AS total_margin_percent,
        COALESCE(sj.total_enrollment, 0) AS total_enrollment,
        COALESCE(sj.total_students, 0) AS total_students,
        COALESCE(sj.total_lessons, 0) AS total_lessons,
        -- Check if school is active (has non-finished jobs)
        EXISTS (
          SELECT 1 
          FROM school_services ss2
          JOIN service_metadata sm2 ON ss2.service_id = sm2.service_id
          WHERE SPLIT_PART(ss2.service_name, ' // ', 1) = sc.school_name
            AND COALESCE(sm2.is_finished, false) = false
        ) AS is_active,
        -- Invoice data (only for schools that pay directly)
        COALESCE(si.paid_count, 0) AS paid_invoices_count,
        COALESCE(si.paid_amount, 0) AS paid_invoices_amount,
        COALESCE(si.unpaid_count, 0) AS unpaid_invoices_count,
        COALESCE(si.unpaid_amount, 0) AS unpaid_invoices_amount,
        COALESCE(si.late_count, 0) AS late_invoices_count,
        COALESCE(si.late_amount, 0) AS late_invoices_amount,
        COALESCE(si.max_days_outstanding_unpaid, 0) AS max_days_outstanding_unpaid,
        si.invoices AS invoice_details
      FROM school_clients sc
      LEFT JOIN school_jobs sj ON sj.school_name = sc.school_name
      LEFT JOIN school_invoices si ON si.client_id = sc.client_id::text
        AND sc.client_id NOT LIKE 'SCHOOL_%'
      ORDER BY sc.first_name, sc.last_name
    `;
    
    logger.info('Executing school dashboard query...');
    const startTime = Date.now();
    
    let result;
    try {
      result = await pool.query(query, [schoolLabels]);
    } catch (queryError) {
      logger.error({ data: queryError }, '❌ SQL Query Error:');
      logger.error({ data: queryError.code }, '❌ SQL Error Code:');
      logger.error({ data: queryError.message }, '❌ SQL Error Message:');
      logger.error({ data: queryError.detail }, '❌ SQL Error Detail:');
      logger.error({ data: queryError.hint }, '❌ SQL Error Hint:');
      throw queryError;
    }
    
    const queryTime = Date.now() - startTime;
    logger.info(`✅ School dashboard query completed in ${queryTime}ms, returned ${result.rows.length} rows`);
    
    // -------------------------------
    // Billing model inference helpers
    // -------------------------------
    // Normalized values:
    // - per_lesson (default)
    // - term_billing
    // - monthly_billing
    // - invoice_school_paid (school pays via invoices / GoCardless / check / etc)
    // - mixed (within a school, different students/jobs use different models)
    //
    // Key insight: for many schools (e.g. King Chomper), parents pay; the monthly/term
    // enrollments live under *parent* client_ids, not the school client_id. So we infer
    // monthly/term primarily by service_id + recipient/client matching (not school client_id).
    const enrollmentLookupByService = new Map(); // serviceId -> Map<key, 'monthly'|'term'>
    try {
      const serviceIds = Array.from(
        new Set(
          result.rows
            .flatMap((r) => (Array.isArray(r.jobs) ? r.jobs : []))
            .map((j) => (j && j.service_id !== undefined && j.service_id !== null ? String(j.service_id) : ''))
            .filter((sid) => /^\d+$/.test(sid))
            .map((sid) => parseInt(sid, 10))
        )
      );

      if (serviceIds.length > 0) {
        const enrollmentRows = await pool.query(
          `SELECT service_id, payment_type, recipient_id, client_id, status
           FROM subscription_enrollments
           WHERE service_id = ANY($1::integer[])
             AND status IN ('active', 'suspended', 'completed')`,
          [serviceIds]
        );

        for (const e of enrollmentRows.rows || []) {
          const sid = parseInt(String(e.service_id), 10);
          if (!Number.isInteger(sid)) continue;
          const pt = String(e.payment_type || '').toLowerCase(); // 'monthly' | 'term'
          if (pt !== 'monthly' && pt !== 'term') continue;

          let map = enrollmentLookupByService.get(sid);
          if (!map) {
            map = new Map();
            enrollmentLookupByService.set(sid, map);
          }

          // Match by recipient_id (preferred) and also by client_id fallback (older enrollments)
          if (e.recipient_id) map.set(`r:${e.recipient_id}`, pt);
          if (e.client_id) map.set(`c:${e.client_id}`, pt);
        }
      }
    } catch (e) {
      logger.warn({ data: e.message }, '⚠️ Could not precompute billing models for dashboard:');
    }

    // Process results
    const schools = result.rows.map(row => {
      const hasInvoiceDetails = Array.isArray(row.invoice_details) && row.invoice_details.length > 0;
      const inferredSchoolInvoiceModel = hasInvoiceDetails ? 'invoice_school_paid' : null;

      const school = {
        id: row.id,
        clientId: row.client_id,
        // Use school_name if available (extracted from service name), otherwise fall back to first_name + last_name
        name: row.school_name 
          ? row.school_name
          : (`${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed School'),
        email: row.email,
        schoolLabel: row.school_label,
        location: row.school_label ? row.school_label.replace('School - ', '') : 'Unknown',
        isActive: row.is_active,
        totalRevenue: parseFloat(row.total_revenue || 0),
        totalStudents: parseFloat(row.total_students || 0),
        totalTutorCost: parseFloat(row.total_tutor_cost || 0),
        totalMargin: parseFloat(row.total_margin || 0),
        totalMarginPercent: parseFloat(row.total_margin_percent || 0),
        totalEnrollment: parseInt(row.total_enrollment || 0),
        totalLessons: parseInt(row.total_lessons || 0),
        jobs: (row.jobs || []).map(job => {
          const serviceIdInt = /^\d+$/.test(String(job.service_id)) ? parseInt(String(job.service_id), 10) : null;
          const serviceEnrollmentMap = serviceIdInt ? enrollmentLookupByService.get(serviceIdInt) : null;

          // For invoice-school-paid models, treat the whole service as invoice-paid.
          if (inferredSchoolInvoiceModel === 'invoice_school_paid') {
            return ({
              serviceId: job.service_id,
              serviceName: job.service_name,
              serviceStatus: job.service_status,
              chargeType: job.charge_type,
              termSeason: job.term_season,
              createdAt: job.created_at,
              updatedAt: job.updated_at,
              isFinished: job.is_finished,
              enrollmentCount: parseInt(job.enrollment_count || 0),
              studentCount: parseInt(job.student_count || 0),
              students: job.students || [],
              lessonCount: parseInt(job.lesson_count || 0),
              tutorNames: job.tutor_names || null,
              tutorRate: parseFloat(job.tutor_rate || 0),
              schoolRate: parseFloat(job.school_rate || 0),
              revenue: parseFloat(job.revenue || 0),
              tutorCost: parseFloat(job.tutor_cost || 0),
              margin: parseFloat(job.margin || 0),
              marginPercent: parseFloat(job.margin_percent || 0),
              billingModel: 'invoice_school_paid'
            });
          }

          // Parent-paid / mixed models: infer by matching students to enrollments for this service.
          let hasMonthly = false;
          let hasTerm = false;
          let hasPerLesson = false;

          const students = Array.isArray(job.students) ? job.students : [];
          if (students.length > 0 && serviceEnrollmentMap) {
            for (const s of students) {
              const sid = s?.student_id;
              const cid = s?.client_id;
              const pt =
                (sid ? serviceEnrollmentMap.get(`r:${sid}`) : null) ||
                (cid ? serviceEnrollmentMap.get(`c:${cid}`) : null) ||
                null;
              if (pt === 'monthly') hasMonthly = true;
              else if (pt === 'term') hasTerm = true;
              else hasPerLesson = true;
            }
          } else if (serviceEnrollmentMap) {
            // If we don't have student list yet, but enrollments exist for service, treat as monthly/term present.
            // Per-lesson is unknown in this case.
            for (const pt of serviceEnrollmentMap.values()) {
              if (pt === 'monthly') hasMonthly = true;
              if (pt === 'term') hasTerm = true;
            }
          } else {
            hasPerLesson = true;
          }

          const models = [];
          if (hasMonthly) models.push('monthly_billing');
          if (hasTerm) models.push('term_billing');
          if (hasPerLesson) models.push('per_lesson');
          const billingModel = models.length === 1 ? models[0] : (models.length > 1 ? 'mixed' : 'per_lesson');

          return ({
          serviceId: job.service_id,
          serviceName: job.service_name,
          serviceStatus: job.service_status,
          chargeType: job.charge_type,
          termSeason: job.term_season,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          isFinished: job.is_finished,
          enrollmentCount: parseInt(job.enrollment_count || 0),
          studentCount: parseInt(job.student_count || 0),
          students: job.students || [],
          lessonCount: parseInt(job.lesson_count || 0),
          tutorNames: job.tutor_names || null,
          tutorRate: parseFloat(job.tutor_rate || 0),
          schoolRate: parseFloat(job.school_rate || 0),
          revenue: parseFloat(job.revenue || 0),
          tutorCost: parseFloat(job.tutor_cost || 0),
          margin: parseFloat(job.margin || 0),
          marginPercent: parseFloat(job.margin_percent || 0),
          billingModel
          });
        }),
        invoices: {
          paidCount: parseInt(row.paid_invoices_count || 0),
          paidAmount: parseFloat(row.paid_invoices_amount || 0),
          unpaidCount: parseInt(row.unpaid_invoices_count || 0),
          unpaidAmount: parseFloat(row.unpaid_invoices_amount || 0),
          lateCount: parseInt(row.late_invoices_count || 0),
          lateAmount: parseFloat(row.late_invoices_amount || 0),
          maxDaysOutstandingUnpaid: parseFloat(row.max_days_outstanding_unpaid || 0),
          details: row.invoice_details || []
        },
        // Health indicator
        healthStatus: determineHealthStatus(row)
      };

      // School-level billing model summary:
      // For invoice-school-paid, it's the whole school. Otherwise derive from the set of student payment types
      // across all jobs (avoid double-counting a student across multiple jobs).
      if (inferredSchoolInvoiceModel === 'invoice_school_paid') {
        school.billingModel = 'invoice_school_paid';
        school.billingModelBreakdown = { per_lesson: 0, monthly_billing: 0, term_billing: 0, invoice_school_paid: 1, mixed: 0 };
      } else {
        const monthlySet = new Set();
        const termSet = new Set();
        const perLessonSet = new Set();

        for (const j of school.jobs || []) {
          const sid = /^\d+$/.test(String(j.serviceId)) ? parseInt(String(j.serviceId), 10) : null;
          const serviceEnrollmentMap = sid ? enrollmentLookupByService.get(sid) : null;
          const students = Array.isArray(j.students) ? j.students : [];
          if (students.length === 0) continue;

          for (const s of students) {
            const studentId = s?.student_id;
            const clientId = s?.client_id;
            const key = studentId ? `r:${studentId}` : (clientId ? `c:${clientId}` : null);
            const pt =
              (serviceEnrollmentMap && studentId ? serviceEnrollmentMap.get(`r:${studentId}`) : null) ||
              (serviceEnrollmentMap && clientId ? serviceEnrollmentMap.get(`c:${clientId}`) : null) ||
              null;
            if (pt === 'monthly') monthlySet.add(key || `${j.serviceId}:${Math.random()}`);
            else if (pt === 'term') termSet.add(key || `${j.serviceId}:${Math.random()}`);
            else perLessonSet.add(key || `${j.serviceId}:${Math.random()}`);
          }
        }

        const hasMonthly = monthlySet.size > 0;
        const hasTerm = termSet.size > 0;
        const hasPerLesson = perLessonSet.size > 0;
        const modelCount = [hasMonthly, hasTerm, hasPerLesson].filter(Boolean).length;

        school.billingModel =
          modelCount === 1
            ? (hasMonthly ? 'monthly_billing' : hasTerm ? 'term_billing' : 'per_lesson')
            : (modelCount > 1 ? 'mixed' : 'per_lesson');
        school.billingModelBreakdown = {
          per_lesson: perLessonSet.size,
          monthly_billing: monthlySet.size,
          term_billing: termSet.size,
          invoice_school_paid: 0,
          mixed: modelCount > 1 ? 1 : 0
        };
      }
      
      return school;
    });
    
    // Separate active and inactive schools
    const activeSchools = schools.filter(s => s.isActive);
    const inactiveSchools = schools.filter(s => !s.isActive);
    
    // Calculate summary stats - health counts should only include active schools
    const summary = {
      totalSchools: schools.length,
      activeSchools: activeSchools.length,
      inactiveSchools: inactiveSchools.length,
      healthySchools: activeSchools.filter(s => s.healthStatus === 'healthy').length,
      needsAttentionSchools: activeSchools.filter(s => s.healthStatus === 'needs_attention').length,
      unhealthySchools: activeSchools.filter(s => s.healthStatus === 'unhealthy').length,
      totalRevenue: schools.reduce((sum, s) => sum + s.totalRevenue, 0),
      totalTutorCost: schools.reduce((sum, s) => sum + s.totalTutorCost, 0),
      totalMargin: schools.reduce((sum, s) => sum + s.totalMargin, 0),
      totalUnpaidInvoices: schools.reduce((sum, s) => sum + s.invoices.unpaidAmount, 0),
      totalLateInvoices: schools.reduce((sum, s) => sum + s.invoices.lateAmount, 0)
    };
    
    // Group schools by location
    const schoolsByLocation = {
      NYC: schools.filter(s => s.location === 'NYC'),
      LA: schools.filter(s => s.location === 'LA'),
      SF: schools.filter(s => s.location === 'SF'),
      Hamptons: schools.filter(s => s.location === 'Hamptons'),
      Eastside: schools.filter(s => s.location === 'Eastside'),
      Westside: schools.filter(s => s.location === 'Westside'),
      Unknown: schools.filter(s => s.location === 'Unknown'),
    };
    
    // Group active schools by location
    const activeSchoolsByLocation = {
      NYC: activeSchools.filter(s => s.location === 'NYC'),
      LA: activeSchools.filter(s => s.location === 'LA'),
      SF: activeSchools.filter(s => s.location === 'SF'),
      Hamptons: activeSchools.filter(s => s.location === 'Hamptons'),
      Eastside: activeSchools.filter(s => s.location === 'Eastside'),
      Westside: activeSchools.filter(s => s.location === 'Westside'),
      Unknown: activeSchools.filter(s => s.location === 'Unknown'),
    };

    // If filtering for dormant schools, return only inactive schools
    const schoolsToReturn = showDormantOnly ? inactiveSchools : schools;
    const activeSchoolsToReturn = showDormantOnly ? [] : activeSchools;
    const inactiveSchoolsToReturn = showDormantOnly ? inactiveSchools : [];
    
    res.json({
      schools: schoolsToReturn,
      activeSchools: activeSchoolsToReturn,
      inactiveSchools: inactiveSchoolsToReturn,
      schoolsByLocation,
      location: locationFilter,
      summary: {
        ...summary,
        totalStudents: schoolsToReturn.reduce((sum, s) => sum + s.totalStudents, 0),
        byLocation: {
          NYC: schoolsByLocation.NYC.length,
          LA: schoolsByLocation.LA.length,
          SF: schoolsByLocation.SF.length,
          Hamptons: schoolsByLocation.Hamptons.length,
          Eastside: schoolsByLocation['Eastside'].length,
          Westside: schoolsByLocation['Westside'].length,
        },
        byLocationActive: {
          NYC: activeSchoolsByLocation.NYC.length,
          LA: activeSchoolsByLocation.LA.length,
          SF: activeSchoolsByLocation.SF.length,
          Hamptons: activeSchoolsByLocation.Hamptons.length,
          Eastside: activeSchoolsByLocation['Eastside'].length,
          Westside: activeSchoolsByLocation['Westside'].length,
        }
      }
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school dashboard data:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to fetch school dashboard data', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// Helper function to determine health status
function determineHealthStatus(row) {
  const marginPercent = parseFloat(row.total_margin_percent || 0);
  const unpaidAmount = parseFloat(row.unpaid_invoices_amount || 0);
  const lateCount = parseInt(row.late_invoices_count || 0);
  const maxDaysOutstandingUnpaid = parseFloat(row.max_days_outstanding_unpaid || 0);
  const enrollment = parseInt(row.total_enrollment || 0);
  const totalRevenue = parseFloat(row.total_revenue || 0);
  const totalLessons = parseInt(row.total_lessons || 0);
  
  // Revenue tracking started in September 2025
  // Schools without revenue data before Sept 2025 shouldn't be penalized
  // If school has lessons but no revenue, it might be pre-Sept 2025 data
  const hasRecentActivity = totalLessons > 0; // Has lessons indicates activity
  const hasRevenueData = totalRevenue > 0; // Has revenue indicates tracked data
  
  // Unhealthy if:
  // - Has revenue data AND negative margin or very low margin (< 10%)
  // - Has late invoices (always a concern - invoices > 30 days old)
  // - Has unpaid invoices that are over 30 days old (regardless of amount)
  if (lateCount > 0 || maxDaysOutstandingUnpaid > 30) {
    return 'unhealthy';
  }
  
  // If we have revenue data, check margin
  if (hasRevenueData) {
    if (marginPercent < 10) {
      return 'unhealthy';
    }
  }
  
  // Unpaid invoices under 30 days old should NOT trigger needs_attention or unhealthy
  // Only unpaid invoices over 30 days old trigger unhealthy status
  const hasOldUnpaidInvoices = maxDaysOutstandingUnpaid > 30;
  
  // Healthy if:
  // - Has revenue data AND good margin (> 20%)
  // - OR has recent activity (lessons) but no revenue data yet (pre-Sept 2025 tracking)
  // - No late invoices (over 30 days old)
  // - No unpaid invoices over 30 days old
  // - Has enrollment
  if (hasRevenueData && marginPercent > 20 && lateCount === 0 && !hasOldUnpaidInvoices && enrollment > 0) {
    return 'healthy';
  }
  
  // If school has activity but no revenue data, don't mark as unhealthy
  // (could be pre-Sept 2025 data)
  if (hasRecentActivity && !hasRevenueData && lateCount === 0 && !hasOldUnpaidInvoices) {
    return 'healthy'; // Healthy if no revenue data but has activity and no old payment issues
  }
  
  // Needs attention if:
  // - Margin 10-20% (with revenue data) AND no old unpaid invoices
  // - Has activity but no revenue data (could be pre-Sept 2025 data)
  // Note: Unpaid invoices under 30 days old do NOT trigger needs_attention
  if (hasRevenueData && marginPercent >= 10 && marginPercent <= 20 && !hasOldUnpaidInvoices) {
    return 'needs_attention';
  }
  
  if (hasRecentActivity && !hasRevenueData && lateCount === 0 && !hasOldUnpaidInvoices) {
    return 'needs_attention'; // Needs attention if has activity but no revenue data
  }
  
  // Default to healthy if no major issues (unpaid invoices under 30 days are fine)
  if (!hasOldUnpaidInvoices && lateCount === 0) {
    return 'healthy';
  }
  
  return 'needs_attention';
}

// Get lesson details for a specific service/job
router.get('/service/:serviceId/lessons', asyncHandler(async (req, res) => {
  logger.info('📊 School dashboard lesson details endpoint hit');
  logger.info({ data: req.params }, '📊 Request params:');
  try {
    const pool = getPool(req);
    const { serviceId } = req.params;
    
    if (!serviceId) {
      return res.status(400).json({ error: 'serviceId parameter is required' });
    }
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      throw new Error('Database pool not available');
    }
    
    logger.info(`📊 Fetching lesson details for serviceId: ${serviceId} (type: ${typeof serviceId})`);
    
    // Validate and normalize serviceId (handle both string and integer)
    const serviceIdInt = parseInt(serviceId, 10);
    if (isNaN(serviceIdInt)) {
      return res.status(400).json({ 
        error: 'Invalid serviceId parameter', 
        details: `serviceId must be a valid number, got: ${serviceId}` 
      });
    }
    
    // First, verify the service exists and get its details
    const serviceCheckQuery = `
      SELECT 
        service_id, 
        name,
        dft_charge_rate,
        dft_contractor_rate,
        dft_charge_type,
        sr_premium
      FROM services 
      WHERE service_id = $1::integer 
      LIMIT 1
    `;
    const serviceCheck = await pool.query(serviceCheckQuery, [serviceIdInt]);
    
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Service not found', 
        details: `No service found with serviceId: ${serviceId}` 
      });
    }
    
    const serviceData = serviceCheck.rows[0];
    const serviceName = serviceData.name;
    logger.info(`✅ Service found: ${serviceName} (${serviceIdInt})`);
    
    // Query to get all lessons for a specific service with revenue and tutor cost breakdown
    const query = `
      WITH appointment_premium AS (
        SELECT
          a.appointment_id,
          COUNT(*) * COALESCE(s.sr_premium, 0) * a.units AS premium_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        WHERE a.service_id = $1::integer
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, s.sr_premium, a.units
      ),
      appointment_tutor_cost AS (
        SELECT
          a.appointment_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ac.pay_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ), 0) AS base_tutor_cost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.service_id = $1::integer
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.units, a.charge_type, s.dft_charge_type
      ),
      appointment_tutors AS (
        SELECT
          a.appointment_id,
          json_agg(
            json_build_object(
              'contractor_id', ac.contractor_id,
              'contractor_name', ac.contractor_name,
              'pay_rate', ac.pay_rate
            )
          ) FILTER (WHERE ac.contractor_id IS NOT NULL) AS tutors
        FROM appointments a
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.service_id = $1::integer
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id
      )
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.status,
        a.units,
        COALESCE(s.dft_charge_type, a.charge_type) AS charge_type,
        -- Revenue calculation (use service's default charge type)
        COALESCE(SUM(
          CASE
            WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ar.charge_rate * a.units
            WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ar.charge_rate
            WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ar.charge_rate
            WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ar.charge_rate * a.units
            ELSE ar.charge_rate * a.units
          END
        ), 0) AS lesson_revenue,
        -- Tutor cost calculation (from separate CTE to avoid duplication)
        COALESCE(atc.base_tutor_cost, 0) + COALESCE(ap.premium_pay, 0) AS lesson_tutor_cost,
        -- Student details with paying client for billing info
        json_agg(
          json_build_object(
            'student_id', ar.recipient_id,
            'student_name', ar.recipient_name,
            'charge_rate', ar.charge_rate,
            'status', ar.status,
            'paying_client_id', ar.paying_client_id
          )
        ) FILTER (WHERE ar.recipient_id IS NOT NULL) AS students,
        -- Tutor details (from separate CTE to avoid duplicates from cartesian product)
        -- Use scalar subquery to avoid GROUP BY issues with JSON type
        (SELECT tutors FROM appointment_tutors WHERE appointment_id = a.appointment_id) AS tutors,
        -- Service info
        s.name AS service_name,
        s.dft_charge_rate AS service_charge_rate,
        s.dft_contractor_rate AS service_contractor_rate,
        s.dft_charge_type AS service_charge_type,
        s.sr_premium AS student_premium
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
        AND ar.status <> 'missed'
      LEFT JOIN appointment_premium ap ON ap.appointment_id = a.appointment_id
      LEFT JOIN appointment_tutor_cost atc ON atc.appointment_id = a.appointment_id
      WHERE a.service_id = $1::integer
        AND a.status IN ('complete', 'cancelled-chargeable')
        AND a.is_deleted IS NOT TRUE
      GROUP BY 
        a.appointment_id, 
        a.start, 
        a.finish, 
        a.status, 
        a.units, 
        a.charge_type,
        s.name,
        s.dft_charge_rate,
        s.dft_contractor_rate,
        s.dft_charge_type,
        s.sr_premium,
        ap.premium_pay,
        atc.base_tutor_cost
      ORDER BY a.start DESC
    `;
    
    logger.info(`Executing lesson details query for service ${serviceIdInt}...`);
    let result;
    try {
      result = await pool.query(query, [serviceIdInt]);
    } catch (queryError) {
      logger.error({ data: queryError }, '❌ SQL Query Error:');
      logger.error({ data: queryError.code }, '❌ SQL Error Code:');
      logger.error({ data: queryError.message }, '❌ SQL Error Message:');
      logger.error({ data: queryError.detail }, '❌ SQL Error Detail:');
      logger.error({ data: queryError.hint }, '❌ SQL Error Hint:');
      throw queryError;
    }
    
    logger.info(`✅ Lesson details query completed, returned ${result.rows.length} lessons`);
    
    // Get service details from the first row (if lessons exist) or from the service check
    const firstLesson = result.rows[0];
    const serviceInfo = firstLesson ? {
      serviceName: firstLesson.service_name,
      serviceChargeRate: parseFloat(firstLesson.service_charge_rate || 0),
      serviceContractorRate: parseFloat(firstLesson.service_contractor_rate || 0),
      serviceChargeType: firstLesson.service_charge_type,
      studentPremium: parseFloat(firstLesson.student_premium || 0)
    } : {
      serviceName: serviceName,
      serviceChargeRate: parseFloat(serviceData.dft_charge_rate || 0),
      serviceContractorRate: parseFloat(serviceData.dft_contractor_rate || 0),
      serviceChargeType: serviceData.dft_charge_type || null,
      studentPremium: parseFloat(serviceData.sr_premium || 0)
    };
    
    res.json({
      serviceId: serviceIdInt,
      serviceName: serviceInfo.serviceName,
      serviceChargeRate: serviceInfo.serviceChargeRate,
      serviceContractorRate: serviceInfo.serviceContractorRate,
      serviceChargeType: serviceInfo.serviceChargeType,
      studentPremium: serviceInfo.studentPremium,
      lessons: result.rows.map(row => ({
        appointmentId: row.appointment_id,
        start: row.start,
        finish: row.finish,
        status: row.status,
        units: parseFloat(row.units || 0),
        chargeType: row.charge_type,
        revenue: parseFloat(row.lesson_revenue || 0),
        tutorCost: parseFloat(row.lesson_tutor_cost || 0),
        margin: parseFloat(row.lesson_revenue || 0) - parseFloat(row.lesson_tutor_cost || 0),
        students: row.students || [],
        tutors: row.tutors || [],
        serviceName: row.service_name,
        serviceChargeRate: parseFloat(row.service_charge_rate || 0),
        serviceContractorRate: parseFloat(row.service_contractor_rate || 0),
        serviceChargeType: row.service_charge_type,
        studentPremium: parseFloat(row.student_premium || 0)
      }))
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lesson details:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({ 
      error: 'Failed to fetch lesson details', 
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

// GET /api/schools/booking-forms - Get booking forms for school jobs
// IMPORTANT: This route must come BEFORE /:clientId to avoid route conflicts
router.get('/booking-forms', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) {
      return res.status(500).json({ error: 'Database connection not available' });
    }

    const client = await pool.connect();
    
    try {
      // School labels
      const schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons'];

      // Get booking types that have school labels
      const query = `
        SELECT DISTINCT
          bt.id,
          bt.name,
          bt.description,
          bt.lesson_type as "lessonType",
          bt.original_price as "originalPrice",
          bt.actual_price as "actualPrice",
          bt.service_id as "serviceId",
          s.labels
        FROM booking_types bt
        LEFT JOIN services s ON bt.service_id::text = s.service_id::text
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl(value)
            WHERE lbl.value ILIKE ANY($1::text[])
          )
          OR bt.lesson_type ILIKE '%school%'
        )
        ORDER BY bt.name
      `;

      const labelPatterns = schoolLabels.map(label => `%${label}%`);
      const { rows } = await client.query(query, [labelPatterns]);

      // Transform results
      const forms = rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        lessonType: row.lessonType,
        originalPrice: parseFloat(row.originalPrice || 0),
        actualPrice: parseFloat(row.actualPrice || 0),
        serviceId: row.serviceId,
        labels: row.labels ? (Array.isArray(row.labels) ? row.labels : JSON.parse(row.labels)) : [],
      }));

      res.json({ forms });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching schools booking forms:');
    res.status(500).json({ error: 'Failed to fetch schools booking forms' });
  }
}));

// Get single school details by clientId
router.get('/:clientId', asyncHandler(async (req, res) => {
  logger.info('📊 Single school endpoint hit');
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    
    if (!pool) {
      logger.error('❌ Database pool not available');
      throw new Error('Database pool not available');
    }
    
    // Use the same query logic as dashboard but filter by clientId
    // We'll reuse the dashboard query and filter results
    const hostname = req.get('host') || req.hostname || '';
    let detectedLocation = null;
    if (hostname.includes('eastside')) {
      detectedLocation = 'Eastside';
    } else if (hostname.includes('westside')) {
      detectedLocation = 'Westside';
    }
    
    const queryLocation = req.query.location;
    const locationFilter = queryLocation || (detectedLocation && !queryLocation ? detectedLocation : 'all');
    const validLocations = ['NYC', 'LA', 'SF', 'Hamptons', 'Eastside', 'Westside'];
    
    let schoolLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 'School - Eastside', 'School - Westside'];
    if (locationFilter !== 'all' && validLocations.includes(locationFilter)) {
      schoolLabels = [`School - ${locationFilter}`];
    }
    
    const useSchoolNameGrouping = detectedLocation === 'Eastside' || detectedLocation === 'Westside';
    
    // Reuse the dashboard query - it's the same structure
    const query = useSchoolNameGrouping ? `
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.status AS service_status,
          s.labels AS service_labels,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.dft_charge_type,
          s.created_at,
          s.updated_at,
          CASE 
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}' 
            THEN (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+\\d{4}', 'i'))[1] || ' ' || (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+(\\d{4})', 'i'))[2]
            ELSE NULL
          END AS term_season,
          COALESCE(
            (SELECT label->>'name'
             FROM jsonb_array_elements(s.labels) AS label 
             WHERE label->>'name' LIKE 'School - %' 
             LIMIT 1),
            (SELECT label::text
             FROM jsonb_array_elements_text(s.labels) AS label 
             WHERE label LIKE 'School - %' 
             LIMIT 1)
          ) AS school_label,
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = s.service_id
           LIMIT 1) AS paying_client_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      school_groups AS (
        SELECT DISTINCT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = ss.service_id
             AND a.is_deleted IS NOT TRUE
           LIMIT 1) AS primary_paying_client_id,
          EXISTS (
            SELECT 1 
            FROM clients c
            WHERE c.client_id::text = (
              SELECT DISTINCT ar.paying_client_id::text
              FROM appointments a
              JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              WHERE a.service_id = ss.service_id
                AND a.is_deleted IS NOT TRUE
              LIMIT 1
            )
            AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || SPLIT_PART(ss.service_name, ' // ', 1) || '%'
          ) AS school_pays_directly,
          ss.school_label
        FROM school_services ss
      ),
      school_clients AS (
        SELECT DISTINCT
          sg.school_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.id::integer FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE NULL
          END AS id,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              sg.primary_paying_client_id
            ELSE 
              'SCHOOL_' || MD5(sg.school_name)::text
          END AS client_id,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 1)::text
            ELSE
              sg.school_name::text
          END AS first_name,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 2)::text
            ELSE
              ''::text
          END AS last_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.email::text FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE
              NULL::text
          END AS email,
          sg.school_label::text
        FROM school_groups sg
      ),
      service_students AS (
        SELECT
          a.service_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'student_id', ar.recipient_id,
              'student_name', COALESCE(
                NULLIF(TRIM(ar.recipient_name), ''),
                c.first_name || ' ' || c.last_name,
                'Unknown'
              ),
              'client_id', ar.paying_client_id
            )
          ) AS students
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON c.client_id = ar.recipient_id::text
        WHERE a.service_id IN (SELECT service_id FROM school_services)
          AND ar.status <> 'missed'
        GROUP BY a.service_id
      ),
      filtered_school_services AS (
        SELECT s.service_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      appointment_premium AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COUNT(*) * COALESCE(s.sr_premium, 0) * a.units AS premium_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, s.sr_premium, a.units
      ),
      appointment_tutor_cost AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ac.pay_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ), 0) AS base_tutor_cost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, a.units, a.charge_type, s.dft_charge_type
      ),
      service_metadata AS (
        SELECT DISTINCT
          s.service_id,
          s.labels,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.labels) AS label
              WHERE label->>'name' ILIKE '%Job Finished%'
            ) OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
              WHERE label ILIKE '%Job Finished%'
            ) THEN true
            WHEN NOT EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.service_id = s.service_id
                AND a2.start > NOW() - INTERVAL '30 days'
                AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
            ) THEN true
            ELSE false
          END AS is_finished
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
      ),
      service_tutor_costs AS (
        SELECT
          atc.service_id,
          COALESCE(SUM(atc.base_tutor_cost), 0) + COALESCE(SUM(ap.premium_pay), 0) AS total_tutor_cost
        FROM appointment_tutor_cost atc
        LEFT JOIN appointment_premium ap ON ap.appointment_id = atc.appointment_id
        GROUP BY atc.service_id
      ),
      service_financials AS (
        SELECT
          s.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ar.charge_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 0) AS total_revenue,
          COALESCE(stc.total_tutor_cost, 0) AS total_tutor_cost,
          COUNT(DISTINCT ar.recipient_id) AS enrollment_count,
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          (SELECT STRING_AGG(DISTINCT ac2.contractor_name, ', ')
           FROM appointment_contractors ac2
           JOIN appointments a2 ON ac2.appointment_id = a2.appointment_id
           WHERE a2.service_id = s.service_id
             AND a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
          ) AS tutor_names
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointments a ON a.service_id = s.service_id
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        LEFT JOIN service_tutor_costs stc ON stc.service_id = s.service_id
        GROUP BY s.service_id, stc.total_tutor_cost
      ),
      school_invoices AS (
        SELECT
          i.client_id::text,
          COUNT(*) FILTER (WHERE i.status = 'paid') AS paid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'paid') AS paid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid') AS unpaid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid') AS unpaid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_amount,
          MAX(CASE 
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
            ELSE NULL
          END) AS max_days_outstanding_unpaid,
          json_agg(
            json_build_object(
              'id', i.id,
              'display_id', i.display_id,
              'date_sent', i.date_sent,
              'gross', i.gross,
              'status', i.status,
              'url', i.url,
              'days_outstanding', CASE 
                WHEN i.status = 'unpaid' THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
                ELSE NULL
              END,
              'reminder_count', COALESCE(ir.reminder_count, 0),
              'last_reminder_sent_at', ir.last_reminder_sent_at
            ) ORDER BY i.date_sent DESC
          ) FILTER (WHERE i.id IS NOT NULL) AS invoices
        FROM invoices i
        LEFT JOIN (
          SELECT 
            invoice_id,
            COUNT(*) as reminder_count,
            MAX(reminder_sent_at) as last_reminder_sent_at
          FROM invoice_reminders
          GROUP BY invoice_id
        ) ir ON ir.invoice_id = i.id
        WHERE i.client_id::text IN (
          SELECT DISTINCT client_id::text 
          FROM school_clients 
          WHERE client_id NOT LIKE 'SCHOOL_%'
        )
        -- Exclude cancelled, voided, and refunded invoices to match Invoice Fulfillment page
        AND LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
        GROUP BY i.client_id
      ),
      school_jobs AS (
        SELECT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          jsonb_agg(
            jsonb_build_object(
              'service_id', ss.service_id,
              'service_name', ss.service_name,
              'service_status', ss.service_status,
              'charge_type', ss.dft_charge_type,
              'term_season', ss.term_season,
              'created_at', ss.created_at,
              'updated_at', ss.updated_at,
              'is_finished', COALESCE(sm.is_finished, false),
              'enrollment_count', COALESCE(sf.enrollment_count, 0),
              'student_count', COALESCE(st.student_count, 0),
              'students', COALESCE(st.students, '[]'::jsonb),
              'lesson_count', COALESCE(sf.lesson_count, 0),
              'tutor_names', sf.tutor_names,
              'tutor_rate', ss.dft_contractor_rate,
              'school_rate', ss.dft_charge_rate,
              'revenue', COALESCE(sf.total_revenue, 0),
              'tutor_cost', COALESCE(sf.total_tutor_cost, 0),
              'margin', COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0),
              'margin_percent', CASE 
                WHEN COALESCE(sf.total_revenue, 0) > 0 
                THEN ROUND(((COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0)) / sf.total_revenue) * 100, 2)
                ELSE 0
              END
            ) ORDER BY ss.service_id
          ) AS jobs,
          COALESCE(SUM(sf.total_revenue), 0) AS total_revenue,
          COALESCE(SUM(sf.total_tutor_cost), 0) AS total_tutor_cost,
          COALESCE(SUM(sf.enrollment_count), 0) AS total_enrollment,
          COALESCE(SUM(st.student_count), 0) AS total_students,
          COALESCE(SUM(sf.lesson_count), 0) AS total_lessons
        FROM school_services ss
        LEFT JOIN service_financials sf ON sf.service_id = ss.service_id
        LEFT JOIN service_metadata sm ON sm.service_id = ss.service_id
        LEFT JOIN service_students st ON st.service_id = ss.service_id
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1)
      )
      SELECT
        sc.id,
        sc.client_id,
        sc.school_name,
        sc.first_name,
        sc.last_name,
        sc.email,
        sc.school_label,
        COALESCE(c.do_not_work_with, false) AS do_not_work_with,
        COALESCE(sj.jobs, '[]'::jsonb) AS jobs,
        COALESCE(sj.total_revenue, 0) AS total_revenue,
        COALESCE(sj.total_tutor_cost, 0) AS total_tutor_cost,
        COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0) AS total_margin,
        CASE 
          WHEN COALESCE(sj.total_revenue, 0) > 0 
          THEN ROUND(((COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0)) / sj.total_revenue) * 100, 2)
          ELSE 0
        END AS total_margin_percent,
        COALESCE(sj.total_enrollment, 0) AS total_enrollment,
        COALESCE(sj.total_students, 0) AS total_students,
        COALESCE(sj.total_lessons, 0) AS total_lessons,
        EXISTS (
          SELECT 1 
          FROM school_services ss2
          JOIN service_metadata sm2 ON ss2.service_id = sm2.service_id
          WHERE SPLIT_PART(ss2.service_name, ' // ', 1) = sc.school_name
            AND COALESCE(sm2.is_finished, false) = false
        ) AS is_active,
        COALESCE(si.paid_count, 0) AS paid_invoices_count,
        COALESCE(si.paid_amount, 0) AS paid_invoices_amount,
        COALESCE(si.unpaid_count, 0) AS unpaid_invoices_count,
        COALESCE(si.unpaid_amount, 0) AS unpaid_invoices_amount,
        COALESCE(si.late_count, 0) AS late_invoices_count,
        COALESCE(si.late_amount, 0) AS late_invoices_amount,
        COALESCE(si.max_days_outstanding_unpaid, 0) AS max_days_outstanding_unpaid,
        si.invoices AS invoice_details
      FROM school_clients sc
      LEFT JOIN clients c ON c.client_id::text = sc.client_id::text AND sc.client_id NOT LIKE 'SCHOOL_%'
      LEFT JOIN school_jobs sj ON sj.school_name = sc.school_name
      LEFT JOIN school_invoices si ON si.client_id = sc.client_id::text 
        AND sc.client_id NOT LIKE 'SCHOOL_%'
      WHERE sc.client_id = $2::text
      ORDER BY sc.first_name, sc.last_name
    ` : `
      -- Main production query (same as dashboard) - Group by school name
      WITH school_services AS (
        SELECT DISTINCT
          s.service_id,
          s.name AS service_name,
          s.status AS service_status,
          s.labels AS service_labels,
          s.dft_charge_rate,
          s.dft_contractor_rate,
          s.dft_charge_type,
          s.created_at,
          s.updated_at,
          CASE 
            WHEN s.name ~* '(fall|spring|summer|winter|autumn)\\s+\\d{4}' 
            THEN (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+\\d{4}', 'i'))[1] || ' ' || (regexp_match(s.name, '(fall|spring|summer|winter|autumn)\\s+(\\d{4})', 'i'))[2]
            ELSE NULL
          END AS term_season,
          COALESCE(
            (SELECT label->>'name'
             FROM jsonb_array_elements(s.labels) AS label 
             WHERE label->>'name' LIKE 'School - %' 
             LIMIT 1),
            (SELECT label::text
             FROM jsonb_array_elements_text(s.labels) AS label 
             WHERE label LIKE 'School - %' 
             LIMIT 1)
          ) AS school_label,
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = s.service_id
           LIMIT 1) AS paying_client_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      school_groups AS (
        SELECT DISTINCT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          (SELECT DISTINCT ar.paying_client_id::text
           FROM appointments a
           JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
           WHERE a.service_id = ss.service_id
             AND a.is_deleted IS NOT TRUE
           LIMIT 1) AS primary_paying_client_id,
          EXISTS (
            SELECT 1 
        FROM clients c
            WHERE c.client_id::text = (
              SELECT DISTINCT ar.paying_client_id::text
              FROM appointments a
              JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
              WHERE a.service_id = ss.service_id
                AND a.is_deleted IS NOT TRUE
              LIMIT 1
            )
            AND (c.first_name || ' ' || COALESCE(c.last_name, '')) ILIKE '%' || SPLIT_PART(ss.service_name, ' // ', 1) || '%'
          ) AS school_pays_directly,
          ss.school_label
        FROM school_services ss
      ),
      school_clients AS (
        SELECT DISTINCT
          sg.school_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.id::integer FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE NULL
          END AS id,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              sg.primary_paying_client_id
            ELSE 
              'SCHOOL_' || MD5(sg.school_name)::text
          END AS client_id,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 1)::text
            ELSE
              sg.school_name::text
          END AS first_name,
          CASE 
            WHEN sg.school_name LIKE '% - %' THEN
              SPLIT_PART(sg.school_name, ' - ', 2)::text
            ELSE
              ''::text
          END AS last_name,
          CASE 
            WHEN sg.school_pays_directly AND sg.primary_paying_client_id IS NOT NULL THEN
              (SELECT c.email::text FROM clients c WHERE c.client_id::text = sg.primary_paying_client_id LIMIT 1)
            ELSE
              NULL::text
          END AS email,
          sg.school_label::text
        FROM school_groups sg
      ),
      service_students AS (
        SELECT
          a.service_id,
          COUNT(DISTINCT ar.recipient_id) AS student_count,
          jsonb_agg(
            DISTINCT jsonb_build_object(
              'student_id', ar.recipient_id,
              'student_name', COALESCE(
                NULLIF(TRIM(ar.recipient_name), ''),
                c.first_name || ' ' || c.last_name,
                'Unknown'
              ),
              'client_id', ar.paying_client_id
            )
          ) AS students
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN clients c ON c.client_id = ar.recipient_id::text
        WHERE a.service_id IN (SELECT service_id FROM school_services)
          AND ar.status <> 'missed'
        GROUP BY a.service_id
      ),
      filtered_school_services AS (
        SELECT s.service_id
        FROM services s
        WHERE (
          EXISTS (
            SELECT 1 
            FROM jsonb_array_elements(s.labels) AS label 
            WHERE label->>'name' = ANY($1::text[])
          )
          OR EXISTS (
            SELECT 1 
            FROM jsonb_array_elements_text(s.labels) AS label 
            WHERE label = ANY($1::text[])
          )
        )
        AND s.is_deleted IS NOT TRUE
      ),
      appointment_premium AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COUNT(*) * COALESCE(s.sr_premium, 0) * a.units AS premium_pay
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, s.sr_premium, a.units
      ),
      appointment_tutor_cost AS (
        SELECT
          a.appointment_id,
          a.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ac.pay_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ac.pay_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ac.pay_rate * a.units
              ELSE ac.pay_rate * a.units
            END
          ), 0) AS base_tutor_cost
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        GROUP BY a.appointment_id, a.service_id, a.units, a.charge_type, s.dft_charge_type
      ),
      service_metadata AS (
        SELECT DISTINCT
          s.service_id,
          s.labels,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM jsonb_array_elements(s.labels) AS label
              WHERE label->>'name' ILIKE '%Job Finished%'
            ) OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(s.labels) AS label
              WHERE label ILIKE '%Job Finished%'
            ) THEN true
            WHEN NOT EXISTS (
              SELECT 1 FROM appointments a2
              WHERE a2.service_id = s.service_id
                AND a2.start > NOW() - INTERVAL '30 days'
                AND a2.status NOT IN ('cancelled', 'cancelled-no-charge')
            ) THEN true
            ELSE false
          END AS is_finished
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
      ),
      service_tutor_costs AS (
        SELECT
          atc.service_id,
          COALESCE(SUM(atc.base_tutor_cost), 0) + COALESCE(SUM(ap.premium_pay), 0) AS total_tutor_cost
        FROM appointment_tutor_cost atc
        LEFT JOIN appointment_premium ap ON ap.appointment_id = atc.appointment_id
        GROUP BY atc.service_id
      ),
      service_financials AS (
        SELECT
          s.service_id,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly' THEN ar.charge_rate * a.units
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'one-off-split' THEN ar.charge_rate
              WHEN COALESCE(s.dft_charge_type, a.charge_type) = 'hourly-split' THEN ar.charge_rate * a.units
              ELSE ar.charge_rate * a.units
            END
          ), 0) AS total_revenue,
          COALESCE(stc.total_tutor_cost, 0) AS total_tutor_cost,
          COUNT(DISTINCT ar.recipient_id) AS enrollment_count,
          COUNT(DISTINCT a.appointment_id) AS lesson_count,
          (SELECT STRING_AGG(DISTINCT ac2.contractor_name, ', ')
           FROM appointment_contractors ac2
           JOIN appointments a2 ON ac2.appointment_id = a2.appointment_id
           WHERE a2.service_id = s.service_id
             AND a2.status IN ('complete', 'cancelled-chargeable')
             AND a2.is_deleted IS NOT TRUE
          ) AS tutor_names
        FROM services s
        JOIN filtered_school_services fss ON fss.service_id = s.service_id
        LEFT JOIN appointments a ON a.service_id = s.service_id
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
        LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        LEFT JOIN service_tutor_costs stc ON stc.service_id = s.service_id
        GROUP BY s.service_id, stc.total_tutor_cost
      ),
      school_invoices AS (
        SELECT
          i.client_id::text,
          COUNT(*) FILTER (WHERE i.status = 'paid') AS paid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'paid') AS paid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid') AS unpaid_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid') AS unpaid_amount,
          COUNT(*) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_count,
          SUM(i.gross) FILTER (WHERE i.status = 'unpaid' AND i.date_sent < NOW() - INTERVAL '30 days') AS late_amount,
          MAX(CASE 
            WHEN i.status = 'unpaid' AND i.date_sent IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
            ELSE NULL
          END) AS max_days_outstanding_unpaid,
          json_agg(
            json_build_object(
              'id', i.id,
              'display_id', i.display_id,
              'date_sent', i.date_sent,
              'gross', i.gross,
              'status', i.status,
              'url', i.url,
              'days_outstanding', CASE 
                WHEN i.status = 'unpaid' THEN EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400
                ELSE NULL
              END,
              'reminder_count', COALESCE(ir.reminder_count, 0),
              'last_reminder_sent_at', ir.last_reminder_sent_at
            ) ORDER BY i.date_sent DESC
          ) FILTER (WHERE i.id IS NOT NULL) AS invoices
        FROM invoices i
        LEFT JOIN (
          SELECT 
            invoice_id,
            COUNT(*) as reminder_count,
            MAX(reminder_sent_at) as last_reminder_sent_at
          FROM invoice_reminders
          GROUP BY invoice_id
        ) ir ON ir.invoice_id = i.id
        JOIN school_clients sc ON sc.client_id::text = i.client_id::text
        -- Exclude cancelled, voided, and refunded invoices to match Invoice Fulfillment page
        WHERE LOWER(i.status) NOT IN ('cancelled', 'void', 'voided', 'refund', 'refunded')
        GROUP BY i.client_id
      ),
      school_jobs AS (
        SELECT
          SPLIT_PART(ss.service_name, ' // ', 1) AS school_name,
          jsonb_agg(
            jsonb_build_object(
              'service_id', ss.service_id,
              'service_name', ss.service_name,
              'service_status', ss.service_status,
              'charge_type', ss.dft_charge_type,
              'term_season', ss.term_season,
              'created_at', ss.created_at,
              'updated_at', ss.updated_at,
              'is_finished', COALESCE(sm.is_finished, false),
              'enrollment_count', COALESCE(sf.enrollment_count, 0),
              'student_count', COALESCE(st.student_count, 0),
              'students', COALESCE(st.students, '[]'::jsonb),
              'lesson_count', COALESCE(sf.lesson_count, 0),
              'tutor_names', sf.tutor_names,
              'tutor_rate', ss.dft_contractor_rate,
              'school_rate', ss.dft_charge_rate,
              'revenue', COALESCE(sf.total_revenue, 0),
              'tutor_cost', COALESCE(sf.total_tutor_cost, 0),
              'margin', COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0),
              'margin_percent', CASE 
                WHEN COALESCE(sf.total_revenue, 0) > 0 
                THEN ROUND(((COALESCE(sf.total_revenue, 0) - COALESCE(sf.total_tutor_cost, 0)) / sf.total_revenue) * 100, 2)
                ELSE 0
              END
            ) ORDER BY ss.service_id
          ) AS jobs,
          COALESCE(SUM(sf.total_revenue), 0) AS total_revenue,
          COALESCE(SUM(sf.total_tutor_cost), 0) AS total_tutor_cost,
          COALESCE(SUM(sf.enrollment_count), 0) AS total_enrollment,
          COALESCE(SUM(st.student_count), 0) AS total_students,
          COALESCE(SUM(sf.lesson_count), 0) AS total_lessons
        FROM school_services ss
        LEFT JOIN service_financials sf ON sf.service_id = ss.service_id
        LEFT JOIN service_metadata sm ON sm.service_id = ss.service_id
        LEFT JOIN service_students st ON st.service_id = ss.service_id
        GROUP BY SPLIT_PART(ss.service_name, ' // ', 1)
      )
      SELECT
        sc.id,
        sc.client_id,
        sc.school_name,
        sc.first_name,
        sc.last_name,
        sc.email,
        sc.school_label,
        COALESCE(c.do_not_work_with, false) AS do_not_work_with,
        COALESCE(sj.jobs, '[]'::jsonb) AS jobs,
        COALESCE(sj.total_revenue, 0) AS total_revenue,
        COALESCE(sj.total_tutor_cost, 0) AS total_tutor_cost,
        COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0) AS total_margin,
        CASE 
          WHEN COALESCE(sj.total_revenue, 0) > 0 
          THEN ROUND(((COALESCE(sj.total_revenue, 0) - COALESCE(sj.total_tutor_cost, 0)) / sj.total_revenue) * 100, 2)
          ELSE 0
        END AS total_margin_percent,
        COALESCE(sj.total_enrollment, 0) AS total_enrollment,
        COALESCE(sj.total_students, 0) AS total_students,
        COALESCE(sj.total_lessons, 0) AS total_lessons,
        EXISTS (
          SELECT 1 
          FROM school_services ss2
          JOIN service_metadata sm2 ON ss2.service_id = sm2.service_id
          WHERE SPLIT_PART(ss2.service_name, ' // ', 1) = sc.school_name
            AND COALESCE(sm2.is_finished, false) = false
        ) AS is_active,
        COALESCE(si.paid_count, 0) AS paid_invoices_count,
        COALESCE(si.paid_amount, 0) AS paid_invoices_amount,
        COALESCE(si.unpaid_count, 0) AS unpaid_invoices_count,
        COALESCE(si.unpaid_amount, 0) AS unpaid_invoices_amount,
        COALESCE(si.late_count, 0) AS late_invoices_count,
        COALESCE(si.late_amount, 0) AS late_invoices_amount,
        COALESCE(si.max_days_outstanding_unpaid, 0) AS max_days_outstanding_unpaid,
        si.invoices AS invoice_details
      FROM school_clients sc
      LEFT JOIN clients c ON c.client_id::text = sc.client_id::text AND sc.client_id NOT LIKE 'SCHOOL_%'
      LEFT JOIN school_jobs sj ON sj.school_name = sc.school_name
      LEFT JOIN school_invoices si ON si.client_id = sc.client_id::text
        AND sc.client_id NOT LIKE 'SCHOOL_%'
      WHERE sc.client_id = $2::text
      ORDER BY sc.first_name, sc.last_name
    `;
    
    logger.info(`Executing single school query for clientId: ${clientId}...`);
    let result;
    try {
      result = await pool.query(query, [schoolLabels, clientId]);
    } catch (queryError) {
      logger.error({ data: queryError }, '❌ SQL Query Error:');
      logger.error({ data: queryError.code }, '❌ SQL Error Code:');
      logger.error({ data: queryError.message }, '❌ SQL Error Message:');
      logger.error({ data: queryError.detail }, '❌ SQL Error Detail:');
      logger.error({ data: queryError.hint }, '❌ SQL Error Hint:');
      logger.error({ data: queryError.position }, '❌ SQL Error Position:');
      logger.error({ data: query.substring(0, 500) }, '❌ SQL Query (first 500 chars):');
      res.status(500).json({ 
        error: 'SQL Query Error', 
        message: queryError.message,
        detail: queryError.detail,
        code: queryError.code,
        hint: queryError.hint
      });
      return;
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'School not found', 
        details: `No school found with clientId: ${clientId}` 
      });
    }
    
    const row = result.rows[0];

    // -------------------------------
    // Billing model inference
    // -------------------------------
    // Normalized values:
    // - per_lesson (default)
    // - term_billing
    // - monthly_billing
    // - invoice_school_paid (school is payer; invoiced via TutorCruncher/GoCardless/check/etc)
    // - mixed
    //
    // Key insight: for parent-paid schools, monthly/term enrollments are attached to the *parent*
    // client_id, not the school client_id. So we infer monthly/term by service_id and matching
    // recipient/client to enrollment rows for that service.
    const hasInvoiceDetails = Array.isArray(row.invoice_details) && row.invoice_details.length > 0;
    const inferredSchoolBillingModel = hasInvoiceDetails ? 'invoice_school_paid' : null;

    const tcClientIdInt = /^\d+$/.test(String(row.client_id)) ? parseInt(String(row.client_id), 10) : null;
    const serviceIds = Array.isArray(row.jobs)
      ? row.jobs
          .map((j) => (j && j.service_id !== undefined && j.service_id !== null ? parseInt(String(j.service_id), 10) : null))
          .filter((n) => Number.isInteger(n))
      : [];
    const enrollmentLookupByService = new Map(); // serviceId -> Map<key, 'monthly'|'term'>
    if (serviceIds.length > 0) {
      try {
        const enrollmentRows = await pool.query(
          `SELECT service_id, payment_type, recipient_id, client_id, status
           FROM subscription_enrollments
           WHERE service_id = ANY($1::integer[])
             AND status IN ('active', 'suspended', 'completed')`,
          [serviceIds]
        );

        for (const e of enrollmentRows.rows || []) {
          const sid = parseInt(String(e.service_id), 10);
          if (!Number.isInteger(sid)) continue;
          const pt = String(e.payment_type || '').toLowerCase();
          if (pt !== 'monthly' && pt !== 'term') continue;
          let map = enrollmentLookupByService.get(sid);
          if (!map) {
            map = new Map();
            enrollmentLookupByService.set(sid, map);
          }
          if (e.recipient_id) map.set(`r:${e.recipient_id}`, pt);
          if (e.client_id) map.set(`c:${e.client_id}`, pt);
        }
      } catch (e) {
        logger.warn({ data: e.message }, '⚠️ Could not infer billing model from subscription_enrollments:');
      }
    }

    const school = {
      id: row.id,
      clientId: row.client_id,
      // Use school_name if available (extracted from service name), otherwise fall back to first_name + last_name
      name: row.school_name 
        ? row.school_name
        : (`${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed School'),
      email: row.email,
      schoolLabel: row.school_label,
      location: row.school_label ? row.school_label.replace('School - ', '') : 'Unknown',
      isActive: row.is_active,
      doNotWorkWith: row.do_not_work_with || false,
      totalRevenue: parseFloat(row.total_revenue || 0),
      totalStudents: parseFloat(row.total_students || 0),
      totalTutorCost: parseFloat(row.total_tutor_cost || 0),
      totalMargin: parseFloat(row.total_margin || 0),
      totalMarginPercent: parseFloat(row.total_margin_percent || 0),
      totalEnrollment: parseInt(row.total_enrollment || 0),
      totalLessons: parseInt(row.total_lessons || 0),
      billingModel: inferredSchoolBillingModel || 'per_lesson',
      billingModelBreakdown: null,
      jobs: (row.jobs || []).map(job => ({
        serviceId: job.service_id,
        serviceName: job.service_name,
        serviceStatus: job.service_status,
        chargeType: job.charge_type,
        termSeason: job.term_season,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        isFinished: job.is_finished,
        enrollmentCount: parseInt(job.enrollment_count || 0),
        studentCount: parseInt(job.student_count || 0),
        students: job.students || [],
        lessonCount: parseInt(job.lesson_count || 0),
        tutorNames: job.tutor_names || null,
        tutorRate: parseFloat(job.tutor_rate || 0),
        schoolRate: parseFloat(job.school_rate || 0),
        revenue: parseFloat(job.revenue || 0),
        tutorCost: parseFloat(job.tutor_cost || 0),
        margin: parseFloat(job.margin || 0),
        marginPercent: parseFloat(job.margin_percent || 0),
        billingModel: (() => {
          const sid = /^\d+$/.test(String(job.service_id)) ? parseInt(String(job.service_id), 10) : null;
          if (!sid) return inferredSchoolBillingModel || 'per_lesson';
          if (inferredSchoolBillingModel === 'invoice_school_paid') return 'invoice_school_paid';

          const map = enrollmentLookupByService.get(sid);
          const students = Array.isArray(job.students) ? job.students : [];
          let hasMonthly = false;
          let hasTerm = false;
          let hasPerLesson = false;

          if (students.length > 0 && map) {
            for (const s of students) {
              const pt =
                (s?.student_id ? map.get(`r:${s.student_id}`) : null) ||
                (s?.client_id ? map.get(`c:${s.client_id}`) : null) ||
                null;
              if (pt === 'monthly') hasMonthly = true;
              else if (pt === 'term') hasTerm = true;
              else hasPerLesson = true;
            }
          } else if (map) {
            for (const pt of map.values()) {
              if (pt === 'monthly') hasMonthly = true;
              if (pt === 'term') hasTerm = true;
            }
          } else {
            hasPerLesson = true;
          }

          const modelCount = [hasMonthly, hasTerm, hasPerLesson].filter(Boolean).length;
          if (modelCount === 1) return hasMonthly ? 'monthly_billing' : hasTerm ? 'term_billing' : 'per_lesson';
          if (modelCount > 1) return 'mixed';
          return 'per_lesson';
        })()
      })),
        invoices: {
          paidCount: parseInt(row.paid_invoices_count || 0),
          paidAmount: parseFloat(row.paid_invoices_amount || 0),
          unpaidCount: parseInt(row.unpaid_invoices_count || 0),
          unpaidAmount: parseFloat(row.unpaid_invoices_amount || 0),
          lateCount: parseInt(row.late_invoices_count || 0),
          lateAmount: parseFloat(row.late_invoices_amount || 0),
          maxDaysOutstandingUnpaid: parseFloat(row.max_days_outstanding_unpaid || 0),
          details: row.invoice_details || []
        },
      healthStatus: determineHealthStatus(row)
    };

    // School-level breakdown (unique recipients across jobs)
    if (inferredSchoolBillingModel === 'invoice_school_paid') {
      school.billingModel = 'invoice_school_paid';
      school.billingModelBreakdown = { per_lesson: 0, monthly_billing: 0, term_billing: 0, invoice_school_paid: 1, mixed: 0 };
    } else {
      const monthlySet = new Set();
      const termSet = new Set();
      const perLessonSet = new Set();
      for (const j of school.jobs || []) {
        const sid = /^\d+$/.test(String(j.serviceId)) ? parseInt(String(j.serviceId), 10) : null;
        const map = sid ? enrollmentLookupByService.get(sid) : null;
        for (const s of (j.students || [])) {
          const key = s?.student_id ? `r:${s.student_id}` : (s?.client_id ? `c:${s.client_id}` : null);
          const pt =
            (map && s?.student_id ? map.get(`r:${s.student_id}`) : null) ||
            (map && s?.client_id ? map.get(`c:${s.client_id}`) : null) ||
            null;
          if (pt === 'monthly') monthlySet.add(key || `${j.serviceId}:${Math.random()}`);
          else if (pt === 'term') termSet.add(key || `${j.serviceId}:${Math.random()}`);
          else perLessonSet.add(key || `${j.serviceId}:${Math.random()}`);
        }
      }
      const hasMonthly = monthlySet.size > 0;
      const hasTerm = termSet.size > 0;
      const hasPerLesson = perLessonSet.size > 0;
      const modelCount = [hasMonthly, hasTerm, hasPerLesson].filter(Boolean).length;

      school.billingModel =
        modelCount === 1
          ? (hasMonthly ? 'monthly_billing' : hasTerm ? 'term_billing' : 'per_lesson')
          : (modelCount > 1 ? 'mixed' : 'per_lesson');
      school.billingModelBreakdown = {
        per_lesson: perLessonSet.size,
        monthly_billing: monthlySet.size,
        term_billing: termSet.size,
        invoice_school_paid: 0,
        mixed: modelCount > 1 ? 1 : 0
      };
    }
    
    res.json(school);
    
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school details:');
    logger.error({ data: error.stack }, 'Error stack:');
    
    // Log detailed SQL error information if available
    if (error.code) {
      logger.error({ data: error.code }, 'SQL Error Code:');
      logger.error({ error: error.message }, 'SQL Error Message:');
      logger.error({ data: error.detail }, 'SQL Error Detail:');
      logger.error({ data: error.hint }, 'SQL Error Hint:');
      logger.error({ data: error.position }, 'SQL Error Position:');
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch school details', 
      details: error.message,
      code: error.code,
      hint: error.hint,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}));

/**
 * PUT /api/schools/:clientId/do-not-work-with
 * Update do_not_work_with status for a school
 */
router.put('/:clientId/do-not-work-with', asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    const { clientId } = req.params;
    const { doNotWorkWith } = req.body;

    if (typeof doNotWorkWith !== 'boolean') {
      return res.status(400).json({ error: 'doNotWorkWith must be a boolean value' });
    }

    // Check if client exists and is not a synthetic SCHOOL_* client
    if (clientId.startsWith('SCHOOL_')) {
      return res.status(400).json({ 
        error: 'Cannot update do_not_work_with for synthetic school clients. This school is grouped by name, not client_id.' 
      });
    }

    // Update the do_not_work_with field
    const result = await pool.query(
      `UPDATE clients 
       SET do_not_work_with = $1, updated_at = NOW() 
       WHERE client_id = $2 
       RETURNING id, client_id, do_not_work_with`,
      [doNotWorkWith, clientId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Client not found', 
        details: `No client found with clientId: ${clientId}` 
      });
    }

    res.json({ 
      success: true, 
      clientId: result.rows[0].client_id,
      doNotWorkWith: result.rows[0].do_not_work_with 
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating do_not_work_with status:');
    res.status(500).json({ 
      error: 'Failed to update do_not_work_with status', 
      details: error.message 
    });
  }
}));

module.exports = router;

