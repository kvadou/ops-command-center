const express = require('express');
const router = express.Router();
const { columnExists } = require('../utils/schema-cache');

// Import auth middleware
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// GET /api/entity-details/tutors/:id - Get tutor details
router.get('/tutors/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const tutorId = parseInt(req.params.id);
    
    if (isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid tutor ID' });
    }

    // Check if local_image_url column exists (cached)
    const hasLocalImageUrl = await columnExists(pool, 'contractors', 'local_image_url');
    
    // Build query with conditional column
    const localImageUrlSelect = hasLocalImageUrl ? 'local_image_url,' : '';

    // Get tutor basic info
    const tutorQuery = `
      SELECT 
        contractor_id,
        first_name,
        last_name,
        email,
        mobile,
        phone,
        street,
        town,
        state,
        country,
        postcode,
        timezone,
        title,
        photo,
        status,
        default_rate,
        qualifications,
        skills,
        institutions,
        received_notifications,
        review_rating,
        CASE 
          WHEN review_duration IS NOT NULL 
          THEN EXTRACT(EPOCH FROM review_duration) / 3600
          ELSE NULL
        END as review_duration_hours,
        calendar_colour,
        labels,
        extra_attrs,
        work_done_details,
        ${localImageUrlSelect}
        date_created,
        created_at,
        updated_at,
        slug,
        profile_bio,
        profile_headshot_url,
        profile_teaching_style,
        profile_years_experience,
        profile_title,
        profile_visible,
        profile_synced_at,
        webflow_item_id,
        profile_languages,
        profile_previous_experience,
        profile_availability_notes,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relation
      FROM contractors
      WHERE contractor_id = $1
    `;

    const { rows: tutors } = await pool.query(tutorQuery, [tutorId]);
    
    if (tutors.length === 0) {
      return res.status(404).json({ error: 'Tutor not found' });
    }

    const tutor = tutors[0];
    
    // Ensure local_image_url is set (null if column doesn't exist)
    if (!hasLocalImageUrl) {
      tutor.local_image_url = null;
    }

    // Enrich labels with colors from the labels table
    if (tutor.labels && Array.isArray(tutor.labels)) {
      try {
        // Extract label IDs and names from the labels array
        const labelIds = [];
        const labelNames = [];
        
        tutor.labels.forEach(label => {
          if (typeof label === 'object') {
            if (label.id) {
              labelIds.push(label.id);
            }
            if (label.name) {
              labelNames.push(label.name);
            } else if (label.machine_name) {
              labelNames.push(label.machine_name);
            }
          } else if (typeof label === 'string') {
            labelNames.push(label);
          }
        });

        // Fetch label colors from the labels table
        if (labelIds.length > 0 || labelNames.length > 0) {
          const conditions = [];
          const queryParams = [];
          
          if (labelIds.length > 0) {
            conditions.push(`id = ANY($${queryParams.length + 1}::integer[])`);
            queryParams.push(labelIds);
          }
          
          if (labelNames.length > 0) {
            conditions.push(`LOWER(name) = ANY($${queryParams.length + 1}::text[])`);
            queryParams.push(labelNames.map(n => n.toLowerCase()));
          }
          
          const labelsQuery = `
            SELECT id, name, color
            FROM labels
            WHERE active = true AND (${conditions.join(' OR ')})
          `;
          
          const { rows: labelColors } = await pool.query(labelsQuery, queryParams);
          
          // Create a map of label ID/name to color
          const colorMap = new Map();
          labelColors.forEach(l => {
            colorMap.set(l.id, l.color);
            colorMap.set(l.name.toLowerCase(), l.color);
          });
          
          // Enrich the labels array with colors
          tutor.labels = tutor.labels.map(label => {
            if (typeof label === 'object') {
              const labelId = label.id;
              const labelName = label.name || label.machine_name;
              let color = null;
              
              // Try to find color by ID first, then by name
              if (labelId && colorMap.has(labelId)) {
                color = colorMap.get(labelId);
              } else if (labelName) {
                const nameKey = labelName.toLowerCase();
                if (colorMap.has(nameKey)) {
                  color = colorMap.get(nameKey);
                }
              }
              
              return {
                ...label,
                color: color || '#d3d3d3' // Default gray if no color found
              };
            } else {
              // String label
              const color = colorMap.get(label.toLowerCase());
              return {
                name: label,
                color: color || '#d3d3d3'
              };
            }
          });
        }
      } catch (err) {
        logger.info({ data: err.message }, 'Error enriching labels with colors:');
        // Continue without colors if there's an error
      }
    }

    // --- PARALLEL QUERIES: Run all independent related-data queries at once ---
    // Previously: 6 sequential queries (lessons, services, paymentOrders, adhocCharges, notes, reviews)
    // Now: all 6 run in parallel via Promise.all for ~3-5x speedup
    const [
      lessonsResult,
      servicesResult,
      paymentOrdersResult,
      adhocChargesResult,
      tutorNotesResult,
      reviewsResult
    ] = await Promise.all([
      // 1. Related lessons
      pool.query(`
        SELECT DISTINCT
          a.appointment_id,
          a.start,
          a.finish,
          a.units,
          a.topic,
          a.status,
          a.charge_type,
          s.service_id,
          s.name as service_name,
          s.labels as service_labels
        FROM appointments a
        JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE ac.contractor_id = $1
        ORDER BY a.start DESC
        LIMIT 100
      `, [tutorId]),

      // 2. Related services/jobs
      pool.query(`
        SELECT DISTINCT
          s.service_id,
          s.name,
          s.status,
          s.labels
        FROM services s
        JOIN appointment_contractors ac ON EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.service_id = s.service_id
          AND a.appointment_id = ac.appointment_id
        )
        WHERE ac.contractor_id = $1
        ORDER BY s.name
        LIMIT 50
      `, [tutorId]),

      // 3. Payment orders (with charge count)
      pool.query(`
        SELECT
          po.id,
          po.display_id,
          po.date_sent,
          po.date_paid,
          po.amount,
          po.status,
          po.url,
          COUNT(poc.charge_index) as charge_count
        FROM payment_orders po
        LEFT JOIN payment_order_charges poc ON po.id = poc.payment_order_id
        WHERE po.payee_id = $1
        GROUP BY po.id, po.display_id, po.date_sent, po.date_paid, po.amount, po.status, po.url
        ORDER BY po.date_sent DESC
        LIMIT 100
      `, [tutorId]),

      // 4. Adhoc charges (wrapped in catch -- table may not exist)
      pool.query(`
        SELECT
          id,
          category_name,
          description,
          net_gross,
          date_occurred,
          appointment_id,
          service_id,
          client_id
        FROM adhoc_charges
        WHERE contractor_id = $1
        ORDER BY date_occurred DESC
        LIMIT 50
      `, [tutorId]).catch(err => {
        logger.info('Adhoc charges table not available');
        return { rows: [] };
      }),

      // 5. Tutor notes (wrapped in catch -- table may not exist)
      pool.query(`
        SELECT
          id,
          contractor_id,
          note,
          created_by,
          created_at,
          updated_at
        FROM tutor_notes
        WHERE contractor_id = $1
        ORDER BY created_at DESC
      `, [tutorId]).catch(err => {
        logger.info('Tutor notes table not available');
        return { rows: [] };
      }),

      // 6. Reviews (wrapped in catch -- table may not exist)
      pool.query(`
        SELECT
          review_id,
          client_id,
          client_name,
          contractor_id,
          contractor_name,
          extra_attrs_value,
          star_rating_value,
          date_created
        FROM reviews
        WHERE contractor_id = $1
        ORDER BY date_created DESC
        LIMIT 50
      `, [tutorId]).catch(err => {
        logger.info('Reviews table not available');
        return { rows: [] };
      })
    ]);

    const lessons = lessonsResult.rows;
    const services = servicesResult.rows;
    const paymentOrders = paymentOrdersResult.rows;
    const adhocCharges = adhocChargesResult.rows;
    const tutorNotes = tutorNotesResult.rows;
    const reviews = reviewsResult.rows;

    // Payment order charges depend on paymentOrders result, so run after
    let paymentOrderCharges = [];
    const paymentOrderIds = paymentOrders.map(po => po.id);
    if (paymentOrderIds.length > 0) {
      const { rows: charges } = await pool.query(`
        SELECT
          poc.payment_order_id,
          poc.charge_index,
          poc.adhoc_charge_id,
          poc.appointment_id,
          poc.date,
          poc.amount,
          poc.rate,
          poc.sales_code,
          poc.tax_amount,
          poc.units,
          poc.payer,
          a.start as appointment_start,
          a.finish as appointment_finish,
          s.name as service_name
        FROM payment_order_charges poc
        LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
        LEFT JOIN services s ON a.service_id = s.service_id
        WHERE poc.payment_order_id = ANY($1)
        ORDER BY poc.payment_order_id, poc.charge_index
      `, [paymentOrderIds]);
      paymentOrderCharges = charges;
    }

    res.json({
      tutor,
      relatedLessons: lessons,
      relatedServices: services,
      paymentOrders: paymentOrders,
      paymentOrderCharges: paymentOrderCharges,
      adhocCharges: adhocCharges,
      tutorNotes: tutorNotes,
      reviews: reviews,
      tutorCruncherUrl: `https://account.acmeops.com/contractors/${tutorId}/`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor details:');
    res.status(500).json({ error: 'Failed to fetch tutor details' });
  }
}));

// GET /api/entity-details/clients/:id - Get client details
router.get('/clients/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const clientId = req.params.id; // Can be string or number
    
    // Get client basic info
    const clientQuery = `
      SELECT 
        client_id,
        title,
        first_name,
        last_name,
        email,
        mobile,
        phone,
        street,
        town,
        state,
        country,
        postcode,
        latitude,
        longitude,
        status,
        is_taxable,
        charge_via_branch,
        invoices_count,
        payment_pending,
        auto_charge,
        associated_admin_id,
        calendar_colour,
        invoice_balance,
        available_balance,
        pipeline_stage_id,
        pipeline_stage_name,
        labels,
        photo,
        timezone,
        received_notifications,
        paid_recipients,
        extra_attrs,
        associated_agent_id,
        associated_agent_name,
        tc_created_at,
        created_at,
        updated_at
      FROM clients
      WHERE client_id::text = $1
    `;

    const { rows: clients } = await pool.query(clientQuery, [String(clientId)]);
    
    if (clients.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clients[0];

    // --- STUDENTS: Fetch from both tables, then batch-resolve missing client names ---
    // Two sequential queries needed (second excludes results from first), but the N+1
    // loop for paying_client_name is replaced with a single batch query.
    const { rows: recipientStudents } = await pool.query(`
      SELECT
        recipient_id,
        COALESCE(first_name || ' ' || last_name, first_name, last_name, 'Unknown Student') as recipient_name,
        paying_client_id,
        NULL as paying_client_name
      FROM recipients
      WHERE paying_client_id::text = $1
      ORDER BY recipient_name
    `, [String(clientId)]);

    const { rows: appointmentStudents } = await pool.query(`
      SELECT DISTINCT
        ar.recipient_id,
        ar.recipient_name,
        ar.paying_client_id,
        ar.paying_client_name
      FROM appointment_recipients ar
      JOIN appointments a ON ar.appointment_id = a.appointment_id
      WHERE ar.paying_client_id::text = $1
        AND ar.recipient_id::text NOT IN (
          SELECT recipient_id::text FROM recipients WHERE paying_client_id::text = $1
        )
      ORDER BY ar.recipient_name
    `, [String(clientId)]);

    let students = [...recipientStudents, ...appointmentStudents];

    // Batch-resolve missing paying_client_name instead of N+1 loop
    // Collect unique client IDs that need name resolution
    const missingNameClientIds = [...new Set(
      students
        .filter(s => !s.paying_client_name && s.paying_client_id)
        .map(s => String(s.paying_client_id))
    )];
    if (missingNameClientIds.length > 0) {
      const { rows: clientNames } = await pool.query(`
        SELECT client_id::text as cid, first_name || ' ' || last_name as client_name
        FROM clients
        WHERE client_id::text = ANY($1)
      `, [missingNameClientIds]);
      const nameMap = new Map(clientNames.map(c => [c.cid, c.client_name]));
      for (const s of students) {
        if (!s.paying_client_name && s.paying_client_id) {
          s.paying_client_name = nameMap.get(String(s.paying_client_id)) || null;
        }
      }
    }

    students = students
      .sort((a, b) => (a.recipient_name || '').localeCompare(b.recipient_name || ''))
      .slice(0, 100);

    // --- PARALLEL QUERIES: Run all independent related-data queries at once ---
    // Previously: 10 sequential queries for lessons, jobs, invoices, proforma, notes,
    // adhoc charges, credit requests, balance updates, tasks, activity feed.
    // Now: all 10 run in parallel via Promise.all for ~3-5x speedup.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const clientIdStr = String(clientId);
    const clientIdInt = parseInt(clientId);

    const [
      lessonsResult,
      jobsResult,
      invoicesResult,
      proformaResult,
      clientNotesResult,
      adhocChargesResult,
      creditRequestsResult,
      balanceUpdatesResult,
      relatedTasksResult,
      activityFeedResult
    ] = await Promise.all([
      // 1. Related lessons
      pool.query(`
        SELECT DISTINCT
          a.appointment_id,
          a.start,
          a.finish,
          a.status,
          s.service_id,
          s.name as service_name
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE ar.paying_client_id::text = $1
        ORDER BY a.start DESC
        LIMIT 100
      `, [clientIdStr]),

      // 2. Related jobs/services (wrapped in catch -- complex join may fail)
      pool.query(`
        SELECT DISTINCT
          s.service_id,
          s.name,
          s.status,
          s.created_at as date_created,
          s.labels,
          COUNT(DISTINCT a.appointment_id) as lesson_count,
          COUNT(DISTINCT ac.contractor_id) as tutor_count
        FROM services s
        LEFT JOIN appointments a ON a.service_id = s.service_id
        LEFT JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
        LEFT JOIN service_recipients sr ON s.service_id::text = sr.service_id::text
        WHERE ar.paying_client_id::text = $1
           OR sr.paying_client_id::text = $1
        GROUP BY s.service_id, s.name, s.status, s.created_at, s.labels
        ORDER BY s.created_at DESC
        LIMIT 100
      `, [clientIdStr]).catch(err => {
        logger.info({ data: err.message }, 'Error fetching jobs for client:');
        return { rows: [] };
      }),

      // 3. Invoices
      pool.query(`
        SELECT
          id, display_id, date_sent, gross, net, tax, status, url
        FROM invoices
        WHERE client_id::text = $1
        ORDER BY date_sent DESC
        LIMIT 50
      `, [clientIdStr]),

      // 4. Proforma invoices (table may not exist)
      pool.query(`
        SELECT
          id, display_id, date_sent, gross, net, tax, status, url
        FROM proforma_invoices
        WHERE client_id::text = $1
        ORDER BY date_sent DESC
        LIMIT 50
      `, [clientIdStr]).catch(err => {
        logger.info('Proforma invoices table not available');
        return { rows: [] };
      }),

      // 5. Client notes (table may not exist)
      pool.query(`
        SELECT
          id, client_id, note, created_by, created_at, updated_at
        FROM client_notes
        WHERE client_id = $1
        ORDER BY created_at DESC
      `, [clientIdInt]).catch(err => {
        logger.info('Client notes table not available');
        return { rows: [] };
      }),

      // 6. Adhoc charges (table may not exist)
      pool.query(`
        SELECT
          id, category_name, description, net_gross, date_occurred,
          appointment_id, service_id, contractor_id,
          contractor_first_name, contractor_last_name
        FROM adhoc_charges
        WHERE client_id = $1
        ORDER BY date_occurred DESC
        LIMIT 50
      `, [clientIdInt]).catch(err => {
        logger.info('Adhoc charges table not available');
        return { rows: [] };
      }),

      // 7. Credit requests (table may not exist)
      pool.query(`
        SELECT
          id, display_id, date_created, gross, net, tax, status, url
        FROM credit_requests
        WHERE client_id::text = $1
        ORDER BY date_created DESC
        LIMIT 50
      `, [clientIdStr]).catch(err => {
        logger.info({ data: err.message }, 'Credit requests table not available or error:');
        return { rows: [] };
      }),

      // 8. Balance updates (table may not exist)
      pool.query(`
        SELECT
          id, date_created, update_type, method,
          creator_name, creator_role, amount, description
        FROM balance_updates
        WHERE client_id::text = $1
        ORDER BY date_created DESC
        LIMIT 100
      `, [clientIdStr]).catch(err => {
        logger.info({ data: err.message }, 'Balance updates table not available or error:');
        return { rows: [] };
      }),

      // 9. Related tasks
      pool.query(`
        SELECT
          ti.id, ti.name, ti.description, ti.status, ti.priority,
          ti.due_date, ti.start_date, ti.created_at, ti.updated_at,
          ti.board_id, ti.group_id,
          b.name as board_name,
          tg.name as group_name,
          u1.email as assignee_email,
          u1.first_name as assignee_first_name,
          u1.last_name as assignee_last_name
        FROM task_items ti
        LEFT JOIN task_boards b ON ti.board_id = b.id
        LEFT JOIN task_groups tg ON ti.group_id = tg.id
        LEFT JOIN users u1 ON ti.assignee_id = u1.id::text OR ti.assignee_id = u1.email
        WHERE ti.custom_fields::jsonb->>'client_id' = $1
           OR ti.custom_fields::jsonb->>'clientId' = $1
        ORDER BY ti.created_at DESC
        LIMIT 50
      `, [clientIdStr]).catch(err => {
        logger.info({ data: err.message }, 'Error fetching tasks for client:');
        return { rows: [] };
      }),

      // 10. Activity feed (last 30 days)
      pool.query(`
        WITH appointment_activities AS (
          SELECT
            a.appointment_id::text AS id,
            'appointment' AS activity_type,
            a.start AS activity_date,
            'Lesson' AS title,
            COALESCE(s.name, 'Unknown Service') AS description,
            a.status AS status,
            json_build_object(
              'appointment_id', a.appointment_id,
              'service_id', a.service_id,
              'service_name', s.name
            ) AS metadata
          FROM appointments a
          LEFT JOIN services s ON s.service_id::text = a.service_id::text
          JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
          WHERE ar.paying_client_id::text = $1
            AND a.start >= $2
        ),
        invoice_activities AS (
          SELECT
            i.id::text AS id,
            'invoice' AS activity_type,
            i.date_sent AS activity_date,
            'Invoice ' || COALESCE(i.display_id, 'INV-' || i.id::text) AS title,
            COALESCE(i.client_first_name || ' ' || i.client_last_name, 'Unknown Client') AS description,
            i.status AS status,
            json_build_object(
              'invoice_id', i.id,
              'display_id', i.display_id,
              'status', i.status,
              'gross', i.gross
            ) AS metadata
          FROM invoices i
          WHERE i.client_id::text = $1
            AND i.date_sent >= $2
        ),
        adhoc_charge_activities AS (
          SELECT
            ac.id::text AS id,
            'adhoc_charge' AS activity_type,
            ac.date_occurred AS activity_date,
            'Ad Hoc Charge' AS title,
            ac.description,
            'active' AS status,
            json_build_object(
              'charge_id', ac.id,
              'category', ac.category_name,
              'amount', ac.net_gross
            ) AS metadata
          FROM adhoc_charges ac
          WHERE ac.client_id::text = $1
            AND ac.date_occurred >= $2
        ),
        all_activities AS (
          SELECT * FROM appointment_activities
          UNION ALL
          SELECT * FROM invoice_activities
          UNION ALL
          SELECT * FROM adhoc_charge_activities
        )
        SELECT * FROM all_activities
        ORDER BY activity_date DESC
        LIMIT 50
      `, [clientIdStr, thirtyDaysAgo]).catch(err => {
        logger.info({ data: err.message }, 'Error fetching activity feed for client:');
        return { rows: [] };
      })
    ]);

    res.json({
      client,
      relatedStudents: students,
      relatedLessons: lessonsResult.rows,
      relatedJobs: jobsResult.rows,
      relatedTasks: relatedTasksResult.rows,
      relatedInvoices: invoicesResult.rows,
      proformaInvoices: proformaResult.rows,
      clientNotes: clientNotesResult.rows,
      adhocCharges: adhocChargesResult.rows,
      creditRequests: creditRequestsResult.rows,
      balanceUpdates: balanceUpdatesResult.rows,
      activityFeed: activityFeedResult.rows,
      tutorCruncherUrl: `https://account.acmeops.com/clients/${clientId}/`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching client details:');
    res.status(500).json({ error: 'Failed to fetch client details' });
  }
}));

// GET /api/entity-details/students/:id - Get student (recipient) details
router.get('/students/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const recipientId = parseInt(req.params.id);
    
    if (isNaN(recipientId)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    // Get student info - check both recipients table and appointment_recipients table
    // First try recipients table (for locally created students)
    const recipientsQuery = `
      SELECT 
        recipient_id,
        COALESCE(first_name || ' ' || last_name, first_name, last_name, 'Unknown Student') as recipient_name,
        paying_client_id,
        NULL as paying_client_name
      FROM recipients
      WHERE recipient_id::text = $1
      LIMIT 1
    `;

    let { rows: students } = await pool.query(recipientsQuery, [String(recipientId)]);
    
    // If not found in recipients table, check appointment_recipients (for students added via appointments)
    if (students.length === 0) {
      const appointmentRecipientsQuery = `
        SELECT DISTINCT
          ar.recipient_id,
          ar.recipient_name,
          ar.paying_client_id,
          ar.paying_client_name
        FROM appointment_recipients ar
        WHERE ar.recipient_id::text = $1
        LIMIT 1
      `;
      students = (await pool.query(appointmentRecipientsQuery, [String(recipientId)])).rows;
    }
    
    if (students.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = students[0];
    
    // If paying_client_name is null, fetch it from clients table
    if (!student.paying_client_name && student.paying_client_id) {
      const clientNameQuery = `
        SELECT first_name || ' ' || last_name as client_name
        FROM clients
        WHERE client_id::text = $1
        LIMIT 1
      `;
      const { rows: clientRows } = await pool.query(clientNameQuery, [String(student.paying_client_id)]);
      if (clientRows.length > 0) {
        student.paying_client_name = clientRows[0].client_name;
      }
    }

    // Get related clients
    const clientsQuery = `
      SELECT DISTINCT
        c.client_id,
        c.first_name,
        c.last_name,
        c.email,
        c.status
      FROM clients c
      WHERE c.client_id::text = $1
    `;

    const { rows: clients } = await pool.query(clientsQuery, [String(student.paying_client_id)]);

    // Get related lessons with tutor information
    const lessonsQuery = `
      SELECT DISTINCT
        a.appointment_id,
        a.start,
        a.finish,
        a.status,
        a.topic,
        a.location,
        ar.status as attendance_status,
        s.service_id,
        s.name as service_name,
        ac.contractor_id as tutor_id,
        CONCAT(c.first_name, ' ', c.last_name) as tutor_name
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      JOIN services s ON a.service_id = s.service_id
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      LEFT JOIN contractors c ON ac.contractor_id = c.contractor_id
      WHERE ar.recipient_id = $1
      ORDER BY a.start DESC
      LIMIT 100
    `;

    const { rows: lessons } = await pool.query(lessonsQuery, [recipientId]);

    res.json({
      student,
      relatedClients: clients,
      relatedLessons: lessons,
      tutorCruncherUrl: `https://account.acmeops.com/recipients/${recipientId}/`
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching student details:');
    res.status(500).json({ error: 'Failed to fetch student details' });
  }
}));

// GET /api/entity-details/jobs/:id - Get job (service) details
router.get('/jobs/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    
    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Get service/job basic info
    const serviceQuery = `
      SELECT 
        service_id,
        name,
        dft_charge_type,
        dft_charge_rate,
        dft_contractor_rate,
        status,
        labels,
        sr_premium,
        remote_last_updated,
        created_at,
        updated_at
      FROM services
      WHERE service_id = $1
    `;

    const { rows: services } = await pool.query(serviceQuery, [serviceId]);
    
    if (services.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const service = services[0];

    // Get full service details from TutorCruncher for description, location, etc.
    let serviceDetails = null;
    let jobDescription = null;
    let location = null;
    let documents = [];
    let notes = [];
    
    // Skip TutorCruncher API call for local-only services (negative IDs)
    const isLocalOnly = parseInt(serviceId) < 0;
    if (!isLocalOnly) {
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          const response = await tutorCruncherAPI.get(`services/${serviceId}/`);
          serviceDetails = response.data;
          
          // Extract job description (usually in extra_attrs or description field)
          jobDescription = serviceDetails.description || serviceDetails.extra_attrs?.description || null;
          
          // Extract location
          if (serviceDetails.location) {
            location = typeof serviceDetails.location === 'string' 
              ? JSON.parse(serviceDetails.location) 
              : serviceDetails.location;
          }
          
          // Get documents (if available in service object or separate endpoint)
          if (serviceDetails.documents && Array.isArray(serviceDetails.documents)) {
            documents = serviceDetails.documents;
          }
          
          // Get notes (if available in service object or separate endpoint)
          if (serviceDetails.notes && Array.isArray(serviceDetails.notes)) {
            notes = serviceDetails.notes;
          }
        }
      } catch (error) {
        // Only log if it's not a 404 (which is expected for local-only services)
        if (error.response?.status !== 404) {
          logger.error({ error: error.message }, 'Error fetching service details from TutorCruncher:');
        }
        // Continue with database data if TutorCruncher fails
      }
    }

    // Get all lessons for this service
    const lessonsQuery = `
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.units,
        a.topic,
        a.status,
        a.charge_type,
        a.location
      FROM appointments a
      WHERE a.service_id = $1
      ORDER BY a.start DESC
    `;

    const { rows: lessons } = await pool.query(lessonsQuery, [serviceId]);

    // Get related tutors with pay rates
    const tutorsQuery = `
      SELECT DISTINCT
        c.contractor_id,
        c.first_name,
        c.last_name,
        c.email,
        c.status,
        c.default_rate,
        MAX(ac.pay_rate) as pay_rate
      FROM contractors c
      JOIN appointment_contractors ac ON c.contractor_id = ac.contractor_id
      WHERE ac.appointment_id IN (
        SELECT appointment_id FROM appointments WHERE service_id = $1
      )
      GROUP BY c.contractor_id, c.first_name, c.last_name, c.email, c.status, c.default_rate
      ORDER BY c.last_name, c.first_name
    `;

    const { rows: tutors } = await pool.query(tutorsQuery, [serviceId]);

    // Get related students - from both appointments and service_recipients (for local-only jobs)
    const studentsQuery = `
      SELECT DISTINCT
        recipient_id,
        recipient_name,
        paying_client_id,
        paying_client_name,
        MAX(charge_rate) as charge_rate
      FROM (
        SELECT DISTINCT
          ar.recipient_id,
          ar.recipient_name,
          ar.paying_client_id,
          ar.paying_client_name,
          ar.charge_rate
        FROM appointment_recipients ar
        WHERE ar.appointment_id IN (
          SELECT appointment_id FROM appointments WHERE service_id = $1
        )
        UNION
        SELECT DISTINCT
          sr.recipient_id,
          sr.recipient_name,
          sr.paying_client_id,
          sr.paying_client_name,
          sr.charge_rate
        FROM service_recipients sr
        WHERE sr.service_id::text = $1::text
      ) combined
      GROUP BY recipient_id, recipient_name, paying_client_id, paying_client_name
      ORDER BY recipient_name
    `;

    const { rows: students } = await pool.query(studentsQuery, [serviceId]);

    // Get ad hoc charges for this service
    let adhocCharges = [];
    try {
      const adhocQuery = `
        SELECT 
          id,
          description,
          date_occurred,
          client_cost,
          category_name,
          net_gross,
          pay_contractor,
          currency
        FROM adhoc_charges
        WHERE service_id = $1
        ORDER BY date_occurred DESC
      `;
      const { rows: adhocRows } = await pool.query(adhocQuery, [serviceId]);
      adhocCharges = adhocRows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching adhoc charges:');
    }

    // Get tasks for this service (if tasks table exists)
    let tasks = [];
    try {
      const tasksQuery = `
        SELECT 
          id,
          description,
          due_date,
          status,
          assigned_to,
          created_at
        FROM tasks
        WHERE service_id = $1
        ORDER BY due_date ASC, created_at DESC
      `;
      const { rows: taskRows } = await pool.query(tasksQuery, [serviceId]);
      tasks = taskRows;
    } catch (error) {
      // Tasks table might not exist yet
      logger.info('Tasks table may not exist yet');
    }

    // Get activity feed (from webhooks/logs - simplified for now)
    const activity = [];
    // Add basic activity entries
    if (service.updated_at) {
      activity.push({
        description: 'Job updated',
        created_at: service.updated_at,
        user_name: 'System'
      });
    }
    if (service.created_at) {
      activity.push({
        description: 'Job created',
        created_at: service.created_at,
        user_name: 'System'
      });
    }

    // Get job applications (CJAs - Contractor Job Applications) from TutorCruncher API
    // Skip TutorCruncher API call for local-only services (negative IDs)
    let applications = [];
    if (!isLocalOnly) {
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          const response = await tutorCruncherAPI.get(`services/${serviceId}/`);
          const serviceData = response.data;
          // CJAs (Contractor Job Applications) are typically in the service object
          if (serviceData.cjas && Array.isArray(serviceData.cjas)) {
            applications = serviceData.cjas.map(cja => ({
              contractor_id: typeof cja.contractor === 'object' ? cja.contractor.id : cja.contractor,
              contractor_name: cja.contractor_name || (typeof cja.contractor === 'object' ? cja.contractor.name : 'Unknown'),
              status: cja.status || 'pending',
              application_text: cja.application_text || cja.text || '',
              date_applied: cja.date_applied || cja.created_at || cja.date_created
            }));
          }
          // Also check for applications in a separate query if available
          try {
            const appsResponse = await tutorCruncherAPI.get(`services/${serviceId}/applications/`);
            if (appsResponse.data && appsResponse.data.results) {
              const apiApps = appsResponse.data.results.map(app => ({
                contractor_id: typeof app.contractor === 'object' ? app.contractor.id : app.contractor,
                contractor_name: app.contractor_name || (typeof app.contractor === 'object' ? app.contractor.name : 'Unknown'),
                status: app.status || 'pending',
                application_text: app.application_text || app.text || '',
                date_applied: app.date_applied || app.created_at || app.date_created
              }));
              // Merge with existing applications, avoiding duplicates
              const existingIds = new Set(applications.map(a => a.contractor_id));
              applications = [...applications, ...apiApps.filter(a => !existingIds.has(a.contractor_id))];
            }
          } catch (appsError) {
            // Applications endpoint might not exist, that's okay
            // Only log if it's not a 404
            if (appsError.response?.status !== 404) {
              logger.info('Applications endpoint not available');
            }
          }
        }
      } catch (error) {
        // Only log if it's not a 404 (which is expected for local-only services)
        if (error.response?.status !== 404) {
          logger.error({ error: error.message }, 'Error fetching job applications:');
        }
      }
    }

    // Get skill sets (from service object - typically in labels or extra_attrs)
    const skillSets = [];
    if (service.labels && Array.isArray(service.labels)) {
      // Skill sets might be in labels or we might need to query separately
      // For now, we'll use labels as a proxy
    }

    // Get reviews for this service
    let reviews = [];
    try {
      const reviewsQuery = `
        SELECT 
          review_id,
          client_id,
          client_name,
          contractor_id,
          contractor_name,
          star_rating_value,
          extra_attrs_value,
          date_created
        FROM reviews
        WHERE service_id = $1
        ORDER BY date_created DESC
      `;
      const { rows: reviewRows } = await pool.query(reviewsQuery, [serviceId]);
      reviews = reviewRows;
    } catch (error) {
      // Reviews table might use different structure
      logger.info('Reviews query may need adjustment');
    }

    // Get communications (emails related to this service)
    let communications = [];
    try {
      // Get emails from client_reports that are related to lessons in this service
      const commsQuery = `
        SELECT DISTINCT
          cr.id,
          cr.appointment_id,
          cr.client_email as to,
          cr.email_subject as subject,
          cr.status,
          cr.date_sent as send_time,
          cr.sent_at,
          a.start as appointment_start
        FROM client_reports cr
        JOIN appointments a ON cr.appointment_id = a.appointment_id
        WHERE a.service_id = $1
        ORDER BY cr.date_sent DESC, cr.sent_at DESC
        LIMIT 100
      `;
      const { rows: commRows } = await pool.query(commsQuery, [serviceId]);
      communications = commRows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching communications:');
    }

    // Calculate lesson statistics
    const lessonStats = {
      total: lessons.length,
      completed: lessons.filter(l => l.status === 'complete' || l.status === 'cancelled-chargeable').length,
      planned: lessons.filter(l => l.status === 'planned' || l.status === 'awaiting confirmation').length,
      cancelled: lessons.filter(l => l.status === 'cancelled').length,
      awaiting_confirmation: lessons.filter(l => l.status === 'awaiting confirmation').length
    };

    // Calculate total value (sum of charge rates * units for completed lessons)
    let totalValue = 0;
    let totalInvoiced = 0;
    try {
      const valueQuery = `
        SELECT 
          SUM(ar.charge_rate * a.units) as total_value,
          SUM(CASE WHEN a.status IN ('complete', 'cancelled-chargeable') THEN ar.charge_rate * a.units ELSE 0 END) as invoiced_value
        FROM appointments a
        JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
        WHERE a.service_id = $1
          AND ar.status <> 'missed'
      `;
      const { rows: valueRows } = await pool.query(valueQuery, [serviceId]);
      if (valueRows[0]) {
        totalValue = parseFloat(valueRows[0].total_value || 0);
        totalInvoiced = parseFloat(valueRows[0].invoiced_value || 0);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error calculating totals:');
    }

    res.json({
      service: {
        ...service,
        description: jobDescription,
        location: location,
        documents: documents,
        notes: notes
      },
      lessons,
      relatedTutors: tutors,
      relatedStudents: students,
      tutorCruncherUrl: `https://account.acmeops.com/cal/service/${serviceId}/`,
      adhocCharges,
      tasks,
      activity,
      applications,
      skillSets,
      reviews,
      communications,
      lessonStats,
      totalValue,
      totalInvoiced
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching job details:');
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
}));

// GET /api/entity-details/communications/:id - Get email content for a communication
router.get('/communications/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const commId = parseInt(req.params.id);
    
    if (isNaN(commId)) {
      return res.status(400).json({ error: 'Invalid communication ID' });
    }

    // Try to get email content from client_reports
    const commQuery = `
      SELECT 
        id,
        client_email as to,
        email_subject as subject,
        status,
        date_sent as send_time,
        sent_at,
        url,
        tutor_feedback,
        template_name
      FROM client_reports
      WHERE id = $1
    `;

    const { rows } = await pool.query(commQuery, [commId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Communication not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching communication details:');
    res.status(500).json({ error: 'Failed to fetch communication details' });
  }
}));

// GET /api/entity-details/lessons/:id - Get lesson (appointment) details
router.get('/lessons/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    
    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Get appointment/lesson basic info
    const appointmentQuery = `
      SELECT 
        a.appointment_id,
        a.start,
        a.finish,
        a.units,
        a.topic,
        a.location,
        a.status,
        a.charge_type,
        a.service_id,
        a.cancelled_by,
        a.cancellation_reason,
        a.cancellation_note,
        a.cancelled_at,
        s.name as service_name,
        s.labels as service_labels,
        s.status as service_status
      FROM appointments a
      JOIN services s ON a.service_id = s.service_id
      WHERE a.appointment_id = $1
    `;

    const { rows: appointments } = await pool.query(appointmentQuery, [appointmentId]);
    
    if (appointments.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const appointment = appointments[0];

    // Get related tutors
    const tutorsQuery = `
      SELECT 
        c.contractor_id,
        c.first_name,
        c.last_name,
        c.email,
        c.status,
        ac.pay_rate
      FROM appointment_contractors ac
      JOIN contractors c ON ac.contractor_id = c.contractor_id
      WHERE ac.appointment_id = $1
    `;

    const { rows: tutors } = await pool.query(tutorsQuery, [appointmentId]);

    // Get related students
    const studentsQuery = `
      SELECT 
        ar.recipient_id,
        ar.recipient_name,
        ar.paying_client_id,
        ar.paying_client_name,
        ar.charge_rate,
        ar.status as attendance_status
      FROM appointment_recipients ar
      WHERE ar.appointment_id = $1
    `;

    const { rows: students } = await pool.query(studentsQuery, [appointmentId]);

    // Get lesson reports (client reports)
    let reports = [];
    try {
      const reportsQuery = `
        SELECT 
          id,
          appointment_id,
          client_email,
          student_name,
          status,
          date_sent,
          sent_at,
          email_subject
        FROM client_reports
        WHERE appointment_id = $1
        ORDER BY date_sent DESC, sent_at DESC
      `;
      const { rows: reportRows } = await pool.query(reportsQuery, [appointmentId]);
      reports = reportRows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching reports:');
      // Continue without reports if table doesn't exist
    }

    // Get notes
    let notes = [];
    try {
      const notesQuery = `
        SELECT 
          id,
          appointment_id,
          note,
          created_at,
          created_by
        FROM lesson_notes
        WHERE appointment_id = $1
        ORDER BY created_at DESC
      `;
      const { rows: noteRows } = await pool.query(notesQuery, [appointmentId]);
      notes = noteRows;
    } catch (error) {
      // Table might not exist yet, that's okay
      logger.info('lesson_notes table may not exist yet');
    }

    // Get activity (simplified - could be enhanced with a proper activity log table)
    const activity = [];
    // For now, we'll create basic activity entries from the appointment data
    if (appointment.status) {
      activity.push({
        description: `Lesson status: ${appointment.status}`,
        created_at: appointment.updated_at || appointment.start
      });
    }

    // Get communications (emails related to this lesson)
    let communications = [];
    try {
      const commsQuery = `
        SELECT 
          id,
          appointment_id,
          client_email as to,
          email_subject as subject,
          status,
          date_sent as send_time,
          sent_at
        FROM client_reports
        WHERE appointment_id = $1
        ORDER BY date_sent DESC, sent_at DESC
      `;
      const { rows: commRows } = await pool.query(commsQuery, [appointmentId]);
      communications = commRows;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching communications:');
    }

    // Get accounting data (credit requests, invoices, payment orders)
    let accounting = {
      credit_requests: [],
      invoices: [],
      payment_orders: []
    };

    try {
      // Get invoices related to this lesson (via invoice_items)
      const invoicesQuery = `
        SELECT DISTINCT
          i.id,
          i.display_id,
          i.invoice_number,
          i.date_sent,
          i.date_created,
          i.gross,
          i.net,
          i.tax,
          i.status,
          i.client_id,
          i.client_first_name,
          i.client_last_name,
          i.client_email
        FROM invoices i
        INNER JOIN invoice_items ii ON i.id = ii.invoice_id
        WHERE ii.appointment_id::text = $1
        ORDER BY i.date_created DESC
      `;
      const { rows: invoiceRows } = await pool.query(invoicesQuery, [appointmentId.toString()]);
      accounting.invoices = invoiceRows;

      // Get payment orders related to this lesson (via payment_order_items or payment_order_charges)
      // Handle both text and bigint appointment_id types
      const paymentOrdersQuery = `
        SELECT DISTINCT
          po.id,
          po.display_id,
          po.payment_order_number,
          po.date_sent,
          po.date_created,
          po.date_paid,
          po.amount,
          po.total_to_pay_tutor,
          po.status,
          po.payee_id,
          po.payee_first,
          po.payee_last,
          po.payee_email
        FROM payment_orders po
        LEFT JOIN payment_order_items poi ON po.id = poi.payment_order_id
        LEFT JOIN payment_order_charges poc ON po.id = poc.payment_order_id
        WHERE (
          poi.appointment_id::text = $1::text 
          OR poc.appointment_id::text = $1::text
          OR poi.appointment_id = $1::bigint
          OR poc.appointment_id = $1::bigint
        )
        ORDER BY po.date_created DESC
      `;
      const { rows: paymentOrderRows } = await pool.query(paymentOrdersQuery, [appointmentId.toString()]);
      accounting.payment_orders = paymentOrderRows;

      // Get credit requests related to this lesson (if they exist)
      // Credit requests might reference invoices, which reference this lesson
      const creditRequestsQuery = `
        SELECT DISTINCT
          cr.id,
          cr.credit_request_number,
          cr.date_created,
          cr.amount,
          cr.status,
          cr.reason
        FROM credit_requests cr
        INNER JOIN credit_request_items cri ON cr.id = cri.credit_request_id
        INNER JOIN invoices i ON cri.invoice_id = i.id
        INNER JOIN invoice_items ii ON i.id = ii.invoice_id
        WHERE ii.appointment_id::text = $1
        ORDER BY cr.date_created DESC
      `;
      try {
        const { rows: creditRequestRows } = await pool.query(creditRequestsQuery, [appointmentId.toString()]);
        accounting.credit_requests = creditRequestRows;
      } catch (err) {
        // Credit requests table might not exist, that's okay
        logger.info({ data: err.message }, 'Credit requests query failed (table may not exist):');
      }
    } catch (error) {
      logger.error({ err: error }, 'Error fetching accounting data for lesson:');
      // Return empty arrays if there's an error
      accounting = {
        credit_requests: [],
        invoices: [],
        payment_orders: []
      };
    }

    res.json({
      appointment,
      relatedTutors: tutors,
      relatedStudents: students,
      tutorCruncherUrl: `https://account.acmeops.com/cal/appointments/${appointmentId}/`,
      reports,
      notes,
      activity,
      communications,
      accounting
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching lesson details:');
    res.status(500).json({ error: 'Failed to fetch lesson details' });
  }
}));

// GET /api/entity-details/clients/:id/cancellations
router.get('/clients/:id/cancellations', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const clientId = req.params.id;

  const { rows } = await pool.query(`
    WITH client_apts AS (
      SELECT DISTINCT a.appointment_id, a.start, a.finish, a.status, a.topic,
        a.cancelled_by, a.cancellation_reason, a.cancellation_note, a.cancelled_at,
        a.service_id,
        s.name AS service_name,
        CONCAT(c.first_name, ' ', c.last_name) AS tutor_name,
        c.contractor_id AS tutor_id
      FROM appointments a
      JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
      LEFT JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
      LEFT JOIN contractors c ON c.contractor_id = ac.contractor_id
      LEFT JOIN services s ON s.service_id = a.service_id
      WHERE ar.paying_client_id = $1
    )
    SELECT *,
      (SELECT COUNT(*) FROM client_apts WHERE status = 'cancelled') AS total_cancelled,
      (SELECT COUNT(*) FROM client_apts WHERE status IN ('complete', 'cancelled-chargeable')) AS total_completed,
      (SELECT COUNT(*) FROM client_apts) AS total_lessons
    FROM client_apts
    WHERE status IN ('cancelled', 'cancelled-chargeable')
    ORDER BY start DESC
    LIMIT 50
  `, [clientId]);

  const totalCancelled = rows.length > 0 ? parseInt(rows[0].total_cancelled) : 0;
  const totalCompleted = rows.length > 0 ? parseInt(rows[0].total_completed) : 0;
  const totalLessons = rows.length > 0 ? parseInt(rows[0].total_lessons) : 0;

  res.json({
    cancellations: rows.map(r => ({
      appointment_id: r.appointment_id,
      start: r.start,
      finish: r.finish,
      status: r.status,
      topic: r.topic,
      cancelled_by: r.cancelled_by,
      cancellation_reason: r.cancellation_reason,
      cancellation_note: r.cancellation_note,
      cancelled_at: r.cancelled_at,
      service_name: r.service_name,
      tutor_name: r.tutor_name,
      tutor_id: r.tutor_id,
    })),
    summary: {
      totalCancelled,
      totalCompleted,
      totalLessons,
      cancellationRate: totalLessons > 0 ? Math.round((totalCancelled / totalLessons) * 1000) / 10 : 0,
    }
  });
}));

// GET /api/entity-details/tutors/:id/cancellations
router.get('/tutors/:id/cancellations', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const tutorId = parseInt(req.params.id);

  const { rows } = await pool.query(`
    WITH tutor_apts AS (
      SELECT DISTINCT a.appointment_id, a.start, a.finish, a.status, a.topic,
        a.cancelled_by, a.cancellation_reason, a.cancellation_note, a.cancelled_at,
        a.service_id,
        s.name AS service_name,
        STRING_AGG(DISTINCT ar.paying_client_name, ', ') AS client_name,
        STRING_AGG(DISTINCT ar.paying_client_id::TEXT, ',') AS client_ids
      FROM appointments a
      JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
      LEFT JOIN appointment_recipients ar ON ar.appointment_id = a.appointment_id
      LEFT JOIN services s ON s.service_id = a.service_id
      WHERE ac.contractor_id = $1
      GROUP BY a.appointment_id, a.start, a.finish, a.status, a.topic,
        a.cancelled_by, a.cancellation_reason, a.cancellation_note, a.cancelled_at,
        a.service_id, s.name
    )
    SELECT *,
      (SELECT COUNT(*) FROM tutor_apts WHERE status = 'cancelled') AS total_cancelled,
      (SELECT COUNT(*) FROM tutor_apts WHERE status IN ('complete', 'cancelled-chargeable')) AS total_completed,
      (SELECT COUNT(*) FROM tutor_apts) AS total_lessons
    FROM tutor_apts
    WHERE status IN ('cancelled', 'cancelled-chargeable')
    ORDER BY start DESC
    LIMIT 50
  `, [tutorId]);

  const totalCancelled = rows.length > 0 ? parseInt(rows[0].total_cancelled) : 0;
  const totalCompleted = rows.length > 0 ? parseInt(rows[0].total_completed) : 0;
  const totalLessons = rows.length > 0 ? parseInt(rows[0].total_lessons) : 0;

  res.json({
    cancellations: rows.map(r => ({
      appointment_id: r.appointment_id,
      start: r.start,
      finish: r.finish,
      status: r.status,
      topic: r.topic,
      cancelled_by: r.cancelled_by,
      cancellation_reason: r.cancellation_reason,
      cancellation_note: r.cancellation_note,
      cancelled_at: r.cancelled_at,
      service_name: r.service_name,
      client_name: r.client_name,
      client_ids: r.client_ids,
    })),
    summary: {
      totalCancelled,
      totalCompleted,
      totalLessons,
      cancellationRate: totalLessons > 0 ? Math.round((totalCancelled / totalLessons) * 1000) / 10 : 0,
    }
  });
}));

module.exports = router;

