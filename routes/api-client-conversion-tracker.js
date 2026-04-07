const express = require('express');
const router = express.Router();
const { pool } = global;
const { asyncHandler } = require('../middleware/error-handler');
const ClientConversionService = require('../services/client-conversion-service');
const { createOrUpdateClient } = require('../utils/clientManager');
const { tableExists, columnsExist, getAllColumns } = require('../utils/schema-cache');
const { getOrSet, generateKey, clearCacheByPrefix } = require('../utils/cache');
const { logger } = require('../utils/logger');
const LeadScoringService = require('../services/lead-scoring-service');
const TutorMatchingService = require('../services/tutor-matching-service');

const tutorCruncherAPI = global.tutorCruncherAPI;

// Helper: mark a prospect's score as stale after any data change
async function markScoreStale(clientId, triggerEvent) {
  try {
    const scoringService = new LeadScoringService(pool);
    await scoringService.markStale(clientId, triggerEvent);
  } catch (err) {
    // Non-blocking: don't fail the request if scoring fails
    logger.warn({ clientId, triggerEvent, error: err.message }, 'Failed to mark score stale');
  }
}

// Safety check for pool
if (!pool) {
  logger.error('❌ ERROR: Database pool is not initialized!');
  throw new Error('Database pool is not initialized. Check server.js initialization.');
}

const COUNTRY_MAP = {
  'United States': 184,
  'USA': 184,
  'United States of America': 184,
  'Canada': 29,
  'United Kingdom': 183,
  'UK': 183,
};

// Auth middleware - inline implementation to avoid dependency issues
const auth = (req, res, next) => {
  const tokenFromHeader = req.header("Authorization")?.split(" ")[1];
  const tokenFromCookie = req.cookies?.token;
  const token = tokenFromHeader || tokenFromCookie;

  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || global.JWT_SECRET;
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded.user || decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

// Invalidate CCT list cache on any write operation (POST/PUT/PATCH/DELETE)
router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Only clear cache on successful responses (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        clearCacheByPrefix('cct:list').catch(() => {});
      }
      return originalJson(body);
    };
  }
  next();
});

// Get all clients with their conversion status and pipeline stage
router.get('/', auth, asyncHandler(async (req, res) => {
  try {
    // Cache the CCT list for 30 seconds to reduce DB load on frequent polling
    const cacheKey = generateKey('cct:list', {});
    const rows = await getOrSet(cacheKey, async () => {

    // First check if the required tables exist (cached after first call)
    const [hasClientsTable, hasPipelineStagesTable, hasBookingSubmissionsTable] = await Promise.all([
      tableExists(pool, 'clients'),
      tableExists(pool, 'pipeline_stages'),
      tableExists(pool, 'booking_submissions')
    ]);

    // Check which columns exist in the clients table (cached after first call)
    const availableColumns = await columnsExist(pool, 'clients', [
      'status', 'prospect_status', 'pipeline_stage_id', 'labels', 'market', 'lead_type',
      'date_registration_complete', 'assigned_tutor_id', 'assigned_tutor_name',
      'date_tutor_client_paired', 'date_tutor_client_paired_scheduled',
      'date_trial_first_lesson', 'trial_follow_up_completed',
      'first_paid_lesson_scheduled', 'first_paid_lesson_completed',
      'manual_intake', 'intake_notes', 'intake_source', 'intake_created_by',
      'follow_up_due_at', 'has_class_pack', 'club_class_name'
    ]);

    // Check which columns we have
    const hasStatusColumn = availableColumns.includes('status');
    const hasProspectStatusColumn = availableColumns.includes('prospect_status');
    const hasPipelineColumn = availableColumns.includes('pipeline_stage_id');
    const hasLabelsColumn = availableColumns.includes('labels');
    const hasMarketColumn = availableColumns.includes('market');
    const hasLeadTypeColumn = availableColumns.includes('lead_type');
    const hasDateRegComplete = availableColumns.includes('date_registration_complete');
    const hasAssignedTutorId = availableColumns.includes('assigned_tutor_id');
    const hasAssignedTutorName = availableColumns.includes('assigned_tutor_name');
    const hasDateTutorPaired = availableColumns.includes('date_tutor_client_paired');
    const hasDateTutorPairedScheduled = availableColumns.includes('date_tutor_client_paired_scheduled');
    const hasDateTrialFirstLesson = availableColumns.includes('date_trial_first_lesson');
    const hasTrialFollowUp = availableColumns.includes('trial_follow_up_completed');
    const hasFirstPaidScheduled = availableColumns.includes('first_paid_lesson_scheduled');
    const hasFirstPaidCompleted = availableColumns.includes('first_paid_lesson_completed');
    const hasManualIntake = availableColumns.includes('manual_intake');
    const hasIntakeNotes = availableColumns.includes('intake_notes');
    const hasIntakeSource = availableColumns.includes('intake_source');
    const hasIntakeCreatedBy = availableColumns.includes('intake_created_by');
    const hasFollowUpDueAt = availableColumns.includes('follow_up_due_at');
    const hasClassPack = availableColumns.includes('has_class_pack');
    const hasClubClassName = availableColumns.includes('club_class_name');

    // Check if proforma_invoices and events tables exist (cached)
    const [hasProformaTable, hasEventsTable] = await Promise.all([
      tableExists(pool, 'proforma_invoices'),
      tableExists(pool, 'client_conversion_events')
    ]);

    // Build client spend subquery (total paid invoices only - excludes credit requests/proforma)
    // Credit requests (PFI-*) just load money into account balance, not actual service spend
    // Note: Some PFI records were incorrectly synced into invoices table, so we exclude them
    const clientSpendSubquery = `
      SELECT
        CAST(client_id AS VARCHAR) AS client_id,
        SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS client_spend
      FROM invoices
      WHERE client_id IS NOT NULL
        AND display_id NOT LIKE 'PFI-%'
      GROUP BY client_id
    `;

    // Get the most recent note for each client (for inline notes column)
    const latestNoteSubquery = `
      SELECT DISTINCT ON (client_id)
        client_id,
        note as latest_note
      FROM client_notes
      ORDER BY client_id, created_at DESC
    `;

    // Subquery to get the most recent date when status changed to 'prospect' from 'live' or 'dormant'
    const prospectReentrySubquery = hasEventsTable ? `
      SELECT DISTINCT ON (client_id)
        client_id,
        created_at as date_became_prospect
      FROM client_conversion_events
      WHERE to_status = 'prospect' 
        AND (from_status = 'live' OR from_status = 'dormant')
      ORDER BY client_id, created_at DESC
    ` : `SELECT NULL::INTEGER as client_id, NULL::TIMESTAMPTZ as date_became_prospect WHERE FALSE`;
    
    // Subquery to get the most recent date when client entered their current pipeline stage
    // This gets the latest event where the client moved TO their current stage
    const stageEntrySubquery = hasEventsTable && hasPipelineColumn ? `
      SELECT DISTINCT ON (client_id, to_stage_id)
        client_id,
        to_stage_id,
        created_at as date_entered_stage
      FROM client_conversion_events
      WHERE to_stage_id IS NOT NULL
      ORDER BY client_id, to_stage_id, created_at DESC
    ` : `SELECT NULL::INTEGER as client_id, NULL::INTEGER as to_stage_id, NULL::TIMESTAMPTZ as date_entered_stage WHERE FALSE`;
    
    // Build query with conditional column selection
    const selectFields = [
      'c.id',
      'c.client_id',
      'c.first_name',
      'c.last_name',
      'c.email',
      'c.mobile',
      'c.phone',
      hasStatusColumn ? 'c.status as client_status' : "NULL as client_status",
      hasProspectStatusColumn ? 'c.prospect_status' : "'Need To Contact' as prospect_status",
      'c.created_at as client_created_at',
      'c.updated_at as client_updated_at',
      hasLabelsColumn ? 'c.labels' : 'NULL as labels',
      hasMarketColumn ? 'c.market' : 'NULL as market',
      hasLeadTypeColumn ? 'c.lead_type' : 'NULL as lead_type',
      hasDateRegComplete 
        ? 'COALESCE(c.date_registration_complete, c.created_at::date) as date_registration_complete' 
        : 'c.created_at::date as date_registration_complete',
      hasEventsTable 
        ? `COALESCE(
            pre.date_became_prospect::date,
            ${hasDateRegComplete ? 'c.date_registration_complete' : 'NULL'},
            c.created_at::date
          ) as date_entered_pipeline`
        : `COALESCE(
            ${hasDateRegComplete ? 'c.date_registration_complete' : 'NULL'},
            c.created_at::date
          ) as date_entered_pipeline`,
      hasAssignedTutorId ? 'c.assigned_tutor_id' : 'NULL as assigned_tutor_id',
      hasAssignedTutorName ? 'c.assigned_tutor_name' : 'NULL as assigned_tutor_name',
      hasDateTutorPaired ? 'c.date_tutor_client_paired' : 'NULL as date_tutor_client_paired',
      hasDateTutorPairedScheduled ? 'c.date_tutor_client_paired_scheduled' : 'NULL as date_tutor_client_paired_scheduled',
      hasDateTrialFirstLesson ? 'c.date_trial_first_lesson' : 'NULL as date_trial_first_lesson',
      hasTrialFollowUp ? 'c.trial_follow_up_completed' : 'NULL as trial_follow_up_completed',
      hasFirstPaidScheduled ? 'c.first_paid_lesson_scheduled' : 'NULL as first_paid_lesson_scheduled',
      hasFirstPaidCompleted ? 'c.first_paid_lesson_completed' : 'NULL as first_paid_lesson_completed',
      hasManualIntake ? 'c.manual_intake' : 'false as manual_intake',
      hasIntakeNotes ? 'c.intake_notes' : 'NULL as intake_notes',
      hasIntakeSource ? 'c.intake_source' : 'NULL as intake_source',
      hasIntakeCreatedBy ? 'c.intake_created_by' : 'NULL as intake_created_by',
      hasFollowUpDueAt ? 'c.follow_up_due_at' : 'NULL as client_follow_up_due_at',
      hasClassPack ? 'c.has_class_pack' : 'false as has_class_pack',
      hasClubClassName ? 'COALESCE(NULLIF(c.club_class_name, \'\'), bs.booking_type) as club_class_name' : 'bs.booking_type as club_class_name',
      'c.lead_score',
      'c.lead_score_tier',
      'c.lead_score_reasoning',
      'c.lead_score_components',
      'c.lead_score_stale',
      'c.lead_score_updated_at',
      'bs.id as submission_id',
      'bs.booking_type',
      'bs.payment_status',
      'bs.status as submission_status',
      'bs.created_at as submission_created_at',
      'bs.actual_price',
      'bs.original_price',
      'bs.heard_about',
      'bs.utm',
      'bs.landing_url',
      'bs.referrer',
      hasPipelineColumn ? 'c.pipeline_stage_id' : 'NULL as pipeline_stage_id',
      hasPipelineColumn ? 'ps.name as pipeline_stage' : 'NULL as pipeline_stage',
      hasPipelineColumn ? 'ps.pipeline as pipeline_name' : 'NULL as pipeline_name',
      hasPipelineColumn ? 'ps.order_index as stage_order' : 'NULL as stage_order',
      hasPipelineColumn ? 'ps.active as stage_active' : 'NULL as stage_active',
      hasEventsTable && hasPipelineColumn 
        ? `COALESCE(
            se.date_entered_stage,
            ${hasDateRegComplete ? 'c.date_registration_complete' : 'NULL'},
            c.created_at
          ) as date_entered_current_stage`
        : `COALESCE(
            ${hasDateRegComplete ? 'c.date_registration_complete' : 'NULL'},
            c.created_at
          ) as date_entered_current_stage`,
      'COALESCE(cs.client_spend, 0) as client_spend',
      'ln.latest_note'
    ].filter(Boolean).join(',\n          ');

    // Build JOIN clause conditionally
    const pipelineJoin = hasPipelineColumn
      ? 'LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id'
      : '';

    const clientSpendJoin = `LEFT JOIN (${clientSpendSubquery}) cs ON c.client_id = cs.client_id`;
    const latestNoteJoin = `LEFT JOIN (${latestNoteSubquery}) ln ON c.id = ln.client_id`;
    const prospectReentryJoin = hasEventsTable
      ? `LEFT JOIN (${prospectReentrySubquery}) pre ON c.id = pre.client_id`
      : '';
    const stageEntryJoin = hasEventsTable && hasPipelineColumn
      ? `LEFT JOIN (${stageEntrySubquery}) se ON c.id = se.client_id AND c.pipeline_stage_id = se.to_stage_id`
      : '';
    
    // Check if archived_at column exists for the WHERE clause (cached)
    const hasArchivedColumn = (await columnsExist(pool, 'clients', ['archived_at'])).length > 0;
    
    // Build WHERE clause conditionally (only if status column exists)
    // Exclude archived clients AND Lost prospects from prospects view
    let whereClause = '';
    const whereConditions = [];
    
    if (hasArchivedColumn && hasStatusColumn) {
      whereConditions.push("c.status = 'prospect'");
      whereConditions.push("c.archived_at IS NULL");
    } else if (hasArchivedColumn) {
      whereConditions.push("c.archived_at IS NULL");
    } else if (hasStatusColumn) {
      whereConditions.push("c.status = 'prospect'");
    }
    
    // Exclude Lost and Won prospects (they should only appear in their respective tabs)
    if (hasProspectStatusColumn) {
      whereConditions.push("(c.prospect_status IS NULL OR (c.prospect_status != 'Lost' AND c.prospect_status != 'Won'))");
    }

    // Exclude school clients - they don't belong in the sales pipeline
    // School clients have labels like "School - LA", "School - NYC", etc.
    if (hasLabelsColumn) {
      whereConditions.push(`NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(c.labels) AS label
        WHERE label->>'name' LIKE 'School -%'
      )`);
    }

    if (whereConditions.length > 0) {
      whereClause = `WHERE ${whereConditions.join(' AND ')}`;
    }
    
    // Build the full query
    // Use DISTINCT ON to ensure one row per client (most recent booking submission)
    // This prevents duplicates when clients have multiple booking submissions
    let query = `
        SELECT DISTINCT ON (c.id)
        ${selectFields}
        FROM clients c
        LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text
      ${pipelineJoin}
      ${clientSpendJoin}
      ${latestNoteJoin}
      ${prospectReentryJoin}
      ${stageEntryJoin}
    `;
    
    // Add WHERE clause if needed
    if (whereClause) {
      query += ` ${whereClause}`;
    }
    
    query += `
        ORDER BY c.id, bs.created_at DESC NULLS LAST, c.created_at DESC
        LIMIT 1000
      `;
    
    const { rows } = await pool.query(query);

    // Get actual count of unique clients (not affected by LIMIT)
    let countQuery = `
      SELECT COUNT(DISTINCT c.id) as total
      FROM clients c
      ${whereClause ? ` ${whereClause}` : ''}
    `;
    const { rows: countRows } = await pool.query(countQuery);
    const totalCount = parseInt(countRows[0]?.total || 0);

    return rows;
    }, 30); // 30 second TTL

    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, '❌ Error fetching client conversion data:');
    logger.error({ err: err }, '📊 Error details:');
    res.status(500).json({
      error: 'Failed to fetch client conversion data',
      details: err.message,
      hint: 'Database migration may not have been run'
    });
  }
}));

// Create a manual prospect and TutorCruncher client
router.post('/manual', auth, asyncHandler(async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    phone,
    mobile,
    market,
    lead_type,
    pipeline_stage_id,
    timezone,
    calendar_colour,
    address = {},
    labels = [],
    extra_attrs = {},
    received_notifications = [],
    intake_notes,
    intake_source,
    follow_up_due_at,
  } = req.body || {};

  const errors = [];
  if (!first_name || !first_name.trim()) errors.push('First name is required');
  if (!last_name || !last_name.trim()) errors.push('Last name is required');
  if (!email || !email.trim()) errors.push('Email is required');
  if (!phone || !phone.trim()) errors.push('Phone number is required');

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone.trim();
  const primaryMobile = mobile && mobile.trim() ? mobile.trim() : normalizedPhone;
  const normalizedTimezone = timezone || 'America/New_York';
  const calendarColour = calendar_colour || '#6a469d';

  const countryName = address.country || 'United States';
  const countryId = COUNTRY_MAP[countryName] || COUNTRY_MAP['United States'];

  const cleanedExtraAttrs = Object.entries(extra_attrs || {}).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (intake_notes && !cleanedExtraAttrs.client_notes) {
    cleanedExtraAttrs.client_notes = intake_notes;
  }

  const clientPayload = {
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: normalizedEmail,
    phone: normalizedPhone,
    mobile: primaryMobile,
    street: address.street || null,
    town: address.town || address.city || null,
    state: address.state || null,
    country: countryId,
    postcode: address.postcode || address.zip || null,
    timezone: normalizedTimezone,
    status: 'prospect',
    send_emails: true,
    calendar_colour: calendarColour,
    auto_charge: 0,
    extra_attrs: cleanedExtraAttrs,
  };

  const createdBy = req.user?.email || req.user?.name || 'Manual Intake';

  const clientResult = await createOrUpdateClient(clientPayload, normalizedEmail);
  const tcClientId = clientResult.clientId;

  let fullClient = clientResult.client;
  if ((!fullClient || !fullClient.email) && tutorCruncherAPI) {
    try {
      const tcResponse = await tutorCruncherAPI.get(`/clients/${tcClientId}/`);
      fullClient = tcResponse.data;
    } catch (error) {
      logger.warn({ data: error.response?.data || error.message }, '⚠️ Unable to fetch full client record ${tcClientId}:');
    }
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    let stageId = pipeline_stage_id || null;
    if (!stageId) {
      try {
        const { rows: stageRows } = await dbClient.query(`
          SELECT id FROM pipeline_stages
          WHERE active = true
          ORDER BY order_index ASC
          LIMIT 1
        `);
        stageId = stageRows[0]?.id || null;
      } catch (stageError) {
        if (stageError.code === '42P01') {
          logger.warn('⚠️ pipeline_stages table missing; proceeding without stage assignment');
          stageId = null;
        } else {
          throw stageError;
        }
      }
    }

    let followUpTimestamp = null;
    let followUpDate = null;
    if (follow_up_due_at) {
      const parsedDate = new Date(follow_up_due_at);
      if (!Number.isNaN(parsedDate.valueOf())) {
        followUpTimestamp = parsedDate.toISOString();
        followUpDate = parsedDate.toISOString().split('T')[0];
      }
    }

    const labelsJson = Array.isArray(labels) ? JSON.stringify(labels) : JSON.stringify([]);
    const notificationsJson = Array.isArray(received_notifications)
      ? JSON.stringify(received_notifications)
      : JSON.stringify([]);

    const clientColumnSet = await getAllColumns(dbClient, 'clients');

    const columnOrder = [];
    const columnValues = [];

    const pushColumnValue = (column, value) => {
      if (!clientColumnSet.has(column)) return;
      columnOrder.push(column);
      columnValues.push(value);
    };

    pushColumnValue('client_id', String(tcClientId));
    pushColumnValue('first_name', first_name.trim());
    pushColumnValue('last_name', last_name.trim());
    pushColumnValue('email', normalizedEmail);
    pushColumnValue('mobile', primaryMobile || null);
    pushColumnValue('phone', normalizedPhone || null);
    pushColumnValue('street', address.street || null);
    pushColumnValue('town', address.town || address.city || null);
    pushColumnValue('state', address.state || null);
    pushColumnValue('country', address.country || null);
    pushColumnValue('postcode', address.postcode || address.zip || null);
    if (clientColumnSet.has('status')) {
      pushColumnValue('status', 'prospect');
    }
    if (clientColumnSet.has('prospect_status')) {
      pushColumnValue('prospect_status', 'Need To Contact');
    }
    pushColumnValue('market', market || null);
    pushColumnValue('lead_type', lead_type || 'New Lead');
    pushColumnValue('pipeline_stage_id', stageId || null);
    pushColumnValue('timezone', normalizedTimezone || null);
    pushColumnValue('photo', fullClient?.photo || null);
    pushColumnValue('calendar_colour', calendarColour || null);
    pushColumnValue('labels', labelsJson);
    pushColumnValue('extra_attrs', JSON.stringify(cleanedExtraAttrs || {}));
    pushColumnValue('received_notifications', notificationsJson);
    pushColumnValue('manual_intake', true);
    pushColumnValue('intake_source', intake_source || null);
    pushColumnValue('intake_notes', intake_notes || null);
    pushColumnValue('intake_created_by', createdBy || null);
    pushColumnValue('follow_up_due_at', followUpTimestamp);

    let localClientId = null;

    let existingClientRow = null;
    if (clientColumnSet.has('client_id')) {
      const existingClient = await dbClient.query(
        'SELECT id FROM clients WHERE client_id = $1 LIMIT 1',
        [String(tcClientId)]
      );
      existingClientRow = existingClient.rows[0] || null;
    }

    if (existingClientRow) {
      localClientId = existingClientRow.id;
      const assignments = [];
      const values = [];

      columnOrder.forEach((column, index) => {
        if (column === 'client_id') return;
        assignments.push(`${column} = $${values.length + 1}`);
        values.push(columnValues[index]);
      });

      if (clientColumnSet.has('updated_at')) {
        assignments.push(`updated_at = NOW()`);
      }

      if (clientColumnSet.has('manual_intake') && !assignments.some((assignment) => assignment.startsWith('manual_intake'))) {
        assignments.push('manual_intake = true');
      }

      if (assignments.length > 0) {
        await dbClient.query(
          `
            UPDATE clients
            SET ${assignments.join(', ')}
            WHERE id = $${values.length + 1}
          `,
          [...values, localClientId]
        );
      }
    } else {
      const insertColumns = [...columnOrder];
      const insertPlaceholders = insertColumns.map((_, idx) => `$${idx + 1}`);
      const insertValues = [...columnValues];

      if (clientColumnSet.has('created_at')) {
        insertColumns.push('created_at');
        insertPlaceholders.push('NOW()');
      }
      if (clientColumnSet.has('updated_at')) {
        insertColumns.push('updated_at');
        insertPlaceholders.push('NOW()');
      }

      const insertQuery = `
        INSERT INTO clients (${insertColumns.join(', ')})
        VALUES (${insertPlaceholders.join(', ')})
        RETURNING id
      `;

      const insertResult = await dbClient.query(insertQuery, insertValues);
      localClientId = insertResult.rows[0]?.id;
    }

    try {
      const trackingColumnSet = await getAllColumns(dbClient, 'client_conversion_tracking');

      let existingTrackingRow = null;
      if (trackingColumnSet.has('client_id')) {
        const existingTracking = await dbClient.query(
          'SELECT client_id FROM client_conversion_tracking WHERE client_id = $1 LIMIT 1',
          [localClientId]
        );
        existingTrackingRow = existingTracking.rows[0] || null;
      }

      const trackingColumns = [];
      const trackingValues = [];

      const pushTrackingColumn = (column, value) => {
        if (!trackingColumnSet.has(column)) return;
        trackingColumns.push(column);
        trackingValues.push(value);
      };

      pushTrackingColumn('client_id', localClientId);
      pushTrackingColumn('lead_type', lead_type || 'New Lead');
      pushTrackingColumn('market', market || null);
      pushTrackingColumn('conversion_status', 'prospect');
      pushTrackingColumn('manual_entry', true);
      pushTrackingColumn('follow_up_due_at', followUpDate || null);
      pushTrackingColumn('created_by', createdBy || null);
      pushTrackingColumn('updated_by', createdBy || null);

      if (existingTrackingRow) {
        const assignments = [];
        const values = [];

        trackingColumns.forEach((column, index) => {
          if (column === 'client_id' || column === 'created_by') return;
          assignments.push(`${column} = $${values.length + 1}`);
          values.push(trackingValues[index]);
        });

        if (trackingColumnSet.has('updated_at')) {
          assignments.push('updated_at = NOW()');
        }
        if (trackingColumnSet.has('manual_entry') && !assignments.some((item) => item.startsWith('manual_entry'))) {
          assignments.push('manual_entry = true');
        }

        if (assignments.length > 0) {
          await dbClient.query(
            `
              UPDATE client_conversion_tracking
              SET ${assignments.join(', ')}
              WHERE client_id = $${values.length + 1}
            `,
            [...values, localClientId]
          );
        }
      } else {
        const insertCols = [...trackingColumns];
        const insertPlaceholders = insertCols.map((_, idx) => `$${idx + 1}`);
        const insertVals = [...trackingValues];

        if (trackingColumnSet.has('created_at')) {
          insertCols.push('created_at');
          insertPlaceholders.push('NOW()');
        }
        if (trackingColumnSet.has('updated_at')) {
          insertCols.push('updated_at');
          insertPlaceholders.push('NOW()');
        }

        const insertTrackingQuery = `
          INSERT INTO client_conversion_tracking (${insertCols.join(', ')})
          VALUES (${insertPlaceholders.join(', ')})
        `;

        await dbClient.query(insertTrackingQuery, insertVals);
      }
    } catch (trackingError) {
      if (trackingError.code === '42P01') {
        logger.warn('⚠️ client_conversion_tracking table missing; skipping conversion tracking insert');
      } else {
        throw trackingError;
      }
    }

    await dbClient.query('COMMIT');

    await markScoreStale(localClientId, 'prospect_created');
    res.status(201).json({
      success: true,
      clientId: localClientId,
      tcClientId,
      message: 'Prospect created successfully',
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    logger.error({ error: error.response?.data || error.message }, '❌ Manual intake failed:');
    res.status(500).json({
      error: 'Failed to create prospect',
      details: error.message,
    });
  } finally {
    dbClient.release();
  }
}));

// Get pipeline stages for dropdown/filtering
router.get('/pipeline-stages', auth, asyncHandler(async (req, res) => {
  try {
    // Use location-specific pool if available, otherwise fall back to global pool
    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      logger.error('No database pool available for pipeline stages');
      return res.json([]);
    }
    const service = new ClientConversionService(dbPool);
    const stages = await service.getPipelineStages();
    res.json(stages);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching pipeline stages:');
    // Return empty array instead of crashing
    res.json([]);
  }
}));

// GET /pipeline-stages/verify-required - Verify that all required pipeline stages exist
router.get('/pipeline-stages/verify-required', auth, asyncHandler(async (req, res) => {
  try {
    const requiredStages = [
      'New Lead',
      'Home or Online',
      'Waiting to Pair',
      'Trial Bucket',
      'Won',
      'Lost'
    ];
    
    // Check if pipeline_stages table exists (cached)
    const pipelineStagesExists = await tableExists(pool, 'pipeline_stages');

    if (!pipelineStagesExists) {
      return res.json({
        exists: false,
        error: 'pipeline_stages table does not exist',
        requiredStages,
        foundStages: [],
        missingStages: requiredStages
      });
    }
    
    // Get all pipeline stages
    const { rows: allStages } = await pool.query(`
      SELECT id, name, pipeline, order_index, active
      FROM pipeline_stages
      ORDER BY name
    `);
    
    // Check which required stages exist (case-insensitive)
    const foundStages = [];
    const missingStages = [];
    const stageMap = {};
    
    allStages.forEach(stage => {
      const lowerName = stage.name.toLowerCase();
      stageMap[lowerName] = stage;
    });
    
    requiredStages.forEach(requiredStage => {
      const lowerName = requiredStage.toLowerCase();
      if (stageMap[lowerName]) {
        foundStages.push({
          required: requiredStage,
          found: stageMap[lowerName]
        });
      } else {
        missingStages.push(requiredStage);
      }
    });
    
    res.json({
      exists: true,
      requiredStages,
      foundStages,
      missingStages,
      allStages: allStages.map(s => ({
        id: s.id,
        name: s.name,
        pipeline: s.pipeline,
        orderIndex: s.order_index,
        active: s.active
      })),
      message: missingStages.length === 0 
        ? 'All required pipeline stages exist'
        : `Missing ${missingStages.length} required pipeline stage(s). Please create them in TutorCruncher and run syncPipelineStages() to sync them.`
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error verifying pipeline stages:');
    res.status(500).json({ error: 'Failed to verify pipeline stages', details: error.message });
  }
}));

// Update client pipeline stage
router.put('/:clientId/pipeline-stage', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { pipelineStageId } = req.body;
    
    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const service = new ClientConversionService(dbPool);
    const client = await service.updatePipelineStage(clientId, pipelineStageId);
    
    res.json(client);
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating pipeline stage:');
    res.status(500).json({ error: error.message });
  }
}));

// Delete prospect from local tracker (does not remove TutorCruncher record)
router.delete('/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const rawId = req.params.clientId;
    const numericId = Number(rawId);

    if (!rawId || Number.isNaN(numericId)) {
      return res.status(400).json({ error: 'Invalid client identifier' });
    }

    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }

    const service = new ClientConversionService(dbPool);
    const deletedClient = await service.deleteProspect(numericId);

    res.json({
      success: true,
      client: deletedClient,
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error deleting prospect:');
    res.status(500).json({ error: error.message });
  }
}));

// Add note to client
router.post('/:clientId/notes', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { note, created_by, sync_to_tutorcruncher = true } = req.body;
    
    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get user name from JWT token
    const userName = req.user?.first_name && req.user?.last_name 
      ? `${req.user.first_name} ${req.user.last_name}`
      : req.user?.email || req.user?.name || req.user?.username || created_by || 'Unknown User';
    
    const service = new ClientConversionService(dbPool);
    const noteRecord = await service.addNote(clientId, note, userName);
    
    // Sync to TutorCruncher if enabled
    if (sync_to_tutorcruncher && tutorCruncherAPI) {
      try {
        // Get TutorCruncher client ID
        const { rows: clientData } = await dbPool.query(`
          SELECT client_id FROM clients WHERE id = $1
        `, [clientId]);
        
        if (clientData.length > 0 && clientData[0].client_id) {
          const tcClientId = clientData[0].client_id;
          
          // Create note in TutorCruncher
          // TutorCruncher expects 'client' field (not entity_type/entity_id)
          await tutorCruncherAPI.post('/notes/', {
            text: note,
            client: parseInt(tcClientId, 10)
          });

          logger.info('✅ Synced note to TutorCruncher for client ${tcClientId}');
        }
      } catch (tcError) {
        // Log error but don't fail the request - local note is still saved
        logger.error({ error: tcError.message }, '⚠️ Failed to sync note to TutorCruncher:');
        if (tcError.response) {
          logger.error({ status: tcError.response.status, data: tcError.response.data }, '⚠️ TutorCruncher error response');
        }
      }
    }

    await markScoreStale(clientId, 'note_added');
    res.json(noteRecord);
  } catch (error) {
    logger.error({ error: error.message }, 'Error adding note:');
    res.status(500).json({ error: error.message });
  }
}));

// Get client notes (local + TutorCruncher)
router.get('/:clientId/notes', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { include_tutorcruncher = true } = req.query;
    
    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const service = new ClientConversionService(dbPool);
    const localNotes = await service.getNotes(clientId);
    
    // Format local notes
    const formattedLocalNotes = localNotes.map(note => ({
      id: `local_${note.id}`,
      text: note.note_text || note.note || '',
      created_by: note.created_by || 'Unknown',
      created_at: note.created_at,
      updated_at: note.updated_at,
      source: 'local',
      local_id: note.id
    }));
    
    let tutorCruncherNotes = [];
    
    // Fetch TutorCruncher notes if requested
    if (include_tutorcruncher && tutorCruncherAPI) {
      try {
        // Get TutorCruncher client ID
        const { rows: clientData } = await dbPool.query(`
          SELECT client_id FROM clients WHERE id = $1
        `, [clientId]);
        
        if (clientData.length > 0 && clientData[0].client_id) {
          const tcClientId = clientData[0].client_id;
          
          // Fetch notes from TutorCruncher
          // Note: TutorCruncher API may not filter correctly, so we filter client-side
          const tcResponse = await tutorCruncherAPI.get('/notes/', {
            params: {
              client: tcClientId
            }
          });
          
          const tcNotes = tcResponse.data.results || tcResponse.data || [];
          
          logger.info('📝 Fetched ${tcNotes.length} notes from TutorCruncher for client ${tcClientId}');
          
          // Filter notes to ensure they belong to this specific client
          // Notes can be associated with clients via entity_id, client field, or entity object
          const filteredTcNotes = tcNotes.filter(note => {
            // Check various ways a note might be associated with a client
            const noteClientId = note.entity_id || 
                                note.client || 
                                note.client_id ||
                                (typeof note.client === 'object' ? note.client.id : null) ||
                                (typeof note.entity === 'object' ? note.entity.id : null);
            
            // Also check if entity_type is 'client' and entity_id matches
            const isClientNote = note.entity_type === 'client' && 
                                (note.entity_id === tcClientId || noteClientId === tcClientId);
            
            // Convert to strings for comparison to handle number/string mismatches
            const matches = String(noteClientId) === String(tcClientId) || isClientNote;
            
            if (!matches && tcNotes.length > 0) {
              // Log when we filter out a note for debugging
              logger.info('🔍 Filtered out note ${note.id}: client=${noteClientId}, entity_type=${note.entity_type}, entity_id=${note.entity_id}');
            }
            
            return matches;
          });
          
          logger.info('✅ Filtered to ${filteredTcNotes.length} notes for client ${tcClientId}');
          
          tutorCruncherNotes = filteredTcNotes.map(note => ({
            id: `tc_${note.id}`,
            text: note.text || note.note_text || '',
            created_by: note.created_by?.name || note.created_by || 'Unknown',
            created_at: note.created_at || note.created,
            updated_at: note.updated_at || note.updated,
            source: 'tutorcruncher',
            tc_id: note.id
          }));
        }
      } catch (tcError) {
        logger.error({ error: tcError.message }, '⚠️ Failed to fetch TutorCruncher notes:');
        // Continue without TutorCruncher notes
      }
    }
    
    // Merge and sort all notes by created_at (newest first)
    const allNotes = [...formattedLocalNotes, ...tutorCruncherNotes].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });
    
    res.json(allNotes);
  } catch (error) {
    logger.error({ error: error.message }, 'Error fetching notes:');
    res.status(500).json({ error: error.message });
  }
}));

// Update client status (prospect -> live -> dormant)
router.put('/:clientId/status', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status } = req.body;
    
    // Basic validation
    if (!status || !['prospect', 'live', 'dormant'].includes(status)) {
      return res.status(400).json({ error: 'Status must be prospect, live, or dormant' });
    }
    
    const dbPool = req.locationPool || pool;
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    const service = new ClientConversionService(dbPool);
    const client = await service.updateStatus(clientId, status);
    
    res.json(client);
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating status:');
    res.status(500).json({ error: error.message });
  }
}));

// Get conversion funnel statistics
router.get('/stats/funnel', auth, asyncHandler(async (req, res) => {
  // Check if required tables exist (cached)
  const [hasPipelineStages, hasClients] = await Promise.all([
    tableExists(pool, 'pipeline_stages'),
    tableExists(pool, 'clients')
  ]);

  if (!hasPipelineStages || !hasClients) {
    logger.info('Warning: Required tables missing for funnel stats - returning empty array');
    return res.json([]);
  }
  
  const { rows } = await pool.query(`
    SELECT 
      ps.name as stage_name,
      ps.pipeline,
      COUNT(c.id) as client_count,
      AVG(EXTRACT(EPOCH FROM (c.updated_at - c.created_at))/86400) as avg_days_in_stage
    FROM pipeline_stages ps
    LEFT JOIN clients c ON c.pipeline_stage_id = ps.id AND c.status = 'prospect'
    WHERE ps.active = true
    GROUP BY ps.id, ps.name, ps.pipeline, ps.order_index
    ORDER BY ps.pipeline, ps.order_index
  `);
  
  res.json(rows);
}));

// Get conversion rates by source
router.get('/stats/sources', auth, asyncHandler(async (req, res) => {
  try {
    // Check if required tables exist (cached)
    const [hasBookingSubmissions, hasClientsTable2] = await Promise.all([
      tableExists(pool, 'booking_submissions'),
      tableExists(pool, 'clients')
    ]);

    if (!hasBookingSubmissions || !hasClientsTable2) {
      logger.info('Warning: Required tables missing for source stats - returning empty array');
      return res.json([]);
    }
    
    const { rows } = await pool.query(`
      SELECT 
        bs.heard_about as source,
        COUNT(*) as total_submissions,
        COUNT(CASE WHEN c.status = 'live' THEN 1 END) as converted_clients,
        ROUND(
          COUNT(CASE WHEN c.status = 'live' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 
          2
        ) as conversion_rate
      FROM booking_submissions bs
      LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
      WHERE bs.heard_about IS NOT NULL
      AND (c.status = 'prospect' OR c.status IS NULL)
      GROUP BY bs.heard_about
      ORDER BY total_submissions DESC
    `);
    
    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, 'Error fetching source stats:');
    // Return empty array instead of error
    res.json([]);
  }
}));

// Update lead type for a client
router.put('/:id/lead-type', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { lead_type } = req.body;

    logger.info('Updating lead type for client ${id} to: ${lead_type}');

    // Get client details before update
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];

    // Check if archived_at column exists (cached)
    const hasArchivedColumn = (await columnsExist(pool, 'clients', ['archived_at'])).length > 0;

    // Handle Dead Lead workflow
    if (lead_type === 'Dead Lead') {
      // Archive the client
      const updateQuery = hasArchivedColumn
        ? 'UPDATE clients SET lead_type = $1, archived_at = NOW(), status = $2, updated_at = NOW() WHERE id = $3 RETURNING *'
        : 'UPDATE clients SET lead_type = $1, status = $2, updated_at = NOW() WHERE id = $3 RETURNING *';
      
      const result = await pool.query(updateQuery, [lead_type, 'archived', id]);

      // Add to Klaviyo resurrection flow (if email exists)
      if (client.email && process.env.KLAVIYO_API_KEY) {
        try {
          // Get or create Klaviyo profile
          const axios = require('axios');
          const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
          const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
          
          // Check if profile exists
          const profileResponse = await axios.get(
            `${KLAVIYO_API_BASE}/profiles/`,
            {
              params: {
                'filter': `equals(email,"${client.email}")`
              },
              headers: {
                'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                'revision': '2024-10-15',
                'Content-Type': 'application/json'
              }
            }
          );

          const profileId = profileResponse.data?.data?.[0]?.id;
          
          if (profileId) {
            // Trigger event to add to resurrection flow
            // Note: This assumes a resurrection flow exists in Klaviyo that triggers on this event
            await axios.post(
              `${KLAVIYO_API_BASE}/events/`,
              {
                data: {
                  type: 'event',
                  attributes: {
                    metric: {
                      data: {
                        type: 'metric',
                        attributes: {
                          name: 'Dead Lead'
                        }
                      }
                    },
                    profile: {
                      data: {
                        type: 'profile',
                        id: profileId
                      }
                    },
                    properties: {
                      lead_type: 'Dead Lead',
                      archived_at: new Date().toISOString()
                    }
                  }
                }
              },
              {
                headers: {
                  'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                  'revision': '2024-10-15',
                  'Content-Type': 'application/json'
                }
              }
            );
            logger.info('✅ Added client ${client.email} to Klaviyo resurrection flow');
          } else {
            logger.warn('⚠️ Klaviyo profile not found for ${client.email}, skipping flow addition');
          }
        } catch (klaviyoError) {
          logger.error({ error: klaviyoError.message }, 'Error adding client to Klaviyo resurrection flow:');
          // Don't fail the request if Klaviyo fails
        }
      }

      logger.info('✅ Successfully updated lead type to Dead Lead and archived client ${id}');
      await markScoreStale(id, 'lead_type_change');
      return res.json({ success: true, client: result.rows[0], archived: true });
    }

    // For non-Dead Lead updates, just update the lead_type
    const result = await pool.query(
      'UPDATE clients SET lead_type = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [lead_type, id]
    );

    logger.info('✅ Successfully updated lead type for client ${id}');
    await markScoreStale(id, 'lead_type_change');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating lead type:');
    res.status(500).json({ error: 'Failed to update lead type' });
  }
}));

// Update market for a client
router.put('/:id/market', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { market } = req.body;

    logger.info('Updating market for client ${id} to: ${market}');

    // Check if market column exists (cached)
    const marketColumnExists = (await columnsExist(pool, 'clients', ['market'])).length > 0;

    if (!marketColumnExists) {
      return res.status(400).json({ error: 'Market column does not exist in clients table' });
    }

    // Get client details before update
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Update the market
    const result = await pool.query(
      'UPDATE clients SET market = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [market || null, id]
    );

    logger.info('✅ Successfully updated market for client ${id}');
    await markScoreStale(id, 'market_change');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating market:');
    res.status(500).json({ error: 'Failed to update market' });
  }
}));

// Update assigned tutor for a client
router.put('/:id/assigned-tutor', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_tutor_id, assigned_tutor_name } = req.body;

    logger.info('Updating assigned tutor for client ${id} to: ${assigned_tutor_name} (ID: ${assigned_tutor_id})');

    // Get current client data to check for previous tutor
    const clientResult = await pool.query(
      `SELECT id, assigned_tutor_id, assigned_tutor_name, date_tutor_client_paired_scheduled 
       FROM clients 
       WHERE id = $1`,
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientResult.rows[0];
    const previousTutorId = client.assigned_tutor_id;
    const previousTutorName = client.assigned_tutor_name;

    // Update the assigned tutor in the clients table
    const result = await pool.query(
      'UPDATE clients SET assigned_tutor_id = $1, assigned_tutor_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [assigned_tutor_id, assigned_tutor_name, id]
    );

    // Track tutor pairing in client_tutor_history
    try {
      // Check if client_tutor_history table exists (cached)
      const tutorHistoryExists = await tableExists(pool, 'client_tutor_history');

      if (tutorHistoryExists) {
        // If there was a previous tutor and it's different from the new one, mark previous pairing as unpaired
        if (previousTutorId && assigned_tutor_id && previousTutorId.toString() !== assigned_tutor_id.toString()) {
          await pool.query(
            `UPDATE client_tutor_history
             SET unpaired_at = NOW(), updated_at = NOW()
             WHERE client_id = $1 
               AND tutor_id = $2 
               AND unpaired_at IS NULL`,
            [id, previousTutorId]
          );
          logger.info('✅ Marked previous tutor pairing as unpaired for client ${id}');
        }

        // If a new tutor is assigned, create a new pairing record
        if (assigned_tutor_id && assigned_tutor_name) {
          // Check if this tutor pairing already exists (to avoid duplicates)
          const existingPairing = await pool.query(
            `SELECT id FROM client_tutor_history
             WHERE client_id = $1 
               AND tutor_id = $2 
               AND unpaired_at IS NULL
             LIMIT 1`,
            [id, assigned_tutor_id]
          );

          // Create new pairing record if it doesn't exist
          if (existingPairing.rows.length === 0) {
            const pairedAt = client.date_tutor_client_paired_scheduled || new Date();
            await pool.query(
              `INSERT INTO client_tutor_history (client_id, tutor_id, tutor_name, paired_at)
               VALUES ($1, $2, $3, $4)`,
              [id, assigned_tutor_id, assigned_tutor_name, pairedAt]
            );
            logger.info('✅ Created new tutor pairing record for client ${id}');
          }
        } else if (!assigned_tutor_id && previousTutorId) {
          // If tutor is being cleared, mark current pairing as unpaired
          await pool.query(
            `UPDATE client_tutor_history
             SET unpaired_at = NOW(), updated_at = NOW()
             WHERE client_id = $1 
               AND tutor_id = $2 
               AND unpaired_at IS NULL`,
            [id, previousTutorId]
          );
          logger.info('✅ Marked tutor pairing as unpaired (tutor cleared) for client ${id}');
        }
      }
    } catch (historyError) {
      logger.error({ err: historyError }, 'Error tracking tutor pairing history:');
      // Don't fail the request if history tracking fails
    }

    logger.info('✅ Successfully updated assigned tutor for client ${id}');
    await markScoreStale(id, 'tutor_assigned');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating assigned tutor:');
    res.status(500).json({ error: 'Failed to update assigned tutor' });
  }
}));

// Update date offered to tutors for a client
router.put('/:id/date-offered-to-tutors', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { date_tutor_client_paired } = req.body;

    logger.info('Updating date offered to tutors for client ${id} to: ${date_tutor_client_paired}');

    // Update the date_tutor_client_paired in the clients table
    const result = await pool.query(
      'UPDATE clients SET date_tutor_client_paired = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [date_tutor_client_paired || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Trigger status automation: if date is filled, move to "Waiting to Pair"
    let updatedClient = result.rows[0];
    if (date_tutor_client_paired) {
      try {
        const ClientConversionService = require('../services/client-conversion-service');
        const service = new ClientConversionService(pool);
        const newStatus = await service.checkProspectStatusAutomation(id);
        if (newStatus) {
          await service.updateProspectStatus(
            id,
            newStatus,
            req.user?.email || req.user?.username || 'system',
            'date_offered_to_tutors',
            'Date Offered to Tutors field was filled'
          );
          logger.info('✅ Automatically updated prospect status to ${newStatus} for client ${id}');
          // Refetch client to get updated prospect_status
          const updatedResult = await pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [id]
          );
          if (updatedResult.rows.length > 0) {
            updatedClient = updatedResult.rows[0];
          }
        }
      } catch (autoError) {
        logger.error({ error: autoError.message }, 'Error applying status automation:');
        // Don't fail the request if automation fails
      }
    }

    logger.info('✅ Successfully updated date offered to tutors for client ${id}');
    await markScoreStale(id, 'offered_to_tutors');
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating date offered to tutors:');
    res.status(500).json({ error: 'Failed to update date offered to tutors' });
  }
}));

// Update date tutor and client paired scheduled for a client
router.put('/:id/date-tutor-client-paired-scheduled', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { date_tutor_client_paired_scheduled } = req.body;

    logger.info('Updating date tutor and client paired scheduled for client ${id} to: ${date_tutor_client_paired_scheduled}');

    // Update the date_tutor_client_paired_scheduled in the clients table
    const result = await pool.query(
      'UPDATE clients SET date_tutor_client_paired_scheduled = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [date_tutor_client_paired_scheduled || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Trigger status automation: if date is filled, move to "Waiting for Trial"
    let updatedClient = result.rows[0];
    if (date_tutor_client_paired_scheduled) {
      try {
        const ClientConversionService = require('../services/client-conversion-service');
        const service = new ClientConversionService(pool);
        const newStatus = await service.checkProspectStatusAutomation(id);
        if (newStatus) {
          await service.updateProspectStatus(
            id,
            newStatus,
            req.user?.email || req.user?.username || 'system',
            'date_tutor_client_paired_scheduled',
            'Date Tutor and Client Paired was set'
          );
          logger.info('✅ Automatically updated prospect status to ${newStatus} for client ${id}');
          // Refetch client to get updated prospect_status
          const updatedResult = await pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [id]
          );
          if (updatedResult.rows.length > 0) {
            updatedClient = updatedResult.rows[0];
          }
        }
      } catch (autoError) {
        logger.error({ error: autoError.message }, 'Error applying status automation:');
        // Don't fail the request if automation fails
      }
    }

    logger.info('✅ Successfully updated date tutor and client paired scheduled for client ${id}');
    await markScoreStale(id, 'pairing_scheduled');
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating date tutor and client paired scheduled:');
    res.status(500).json({ error: 'Failed to update date tutor and client paired scheduled' });
  }
}));

// Update date of trial / first lesson for a client
router.put('/:id/date-trial-first-lesson', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { date_trial_first_lesson } = req.body;

    logger.info('Updating date of trial / first lesson for client ${id} to: ${date_trial_first_lesson}');

    // Update the date_trial_first_lesson in the clients table
    const result = await pool.query(
      'UPDATE clients SET date_trial_first_lesson = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [date_trial_first_lesson || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Trigger status automation: if date is filled, move to "Waiting for Trial"
    let updatedClient = result.rows[0];
    if (date_trial_first_lesson) {
      try {
        const ClientConversionService = require('../services/client-conversion-service');
        const service = new ClientConversionService(pool);
        const newStatus = await service.checkProspectStatusAutomation(id);
        if (newStatus) {
          await service.updateProspectStatus(
            id,
            newStatus,
            req.user?.email || req.user?.username || 'system',
            'trial_date_set',
            'Trial / First Lesson date was set'
          );
          logger.info('✅ Automatically updated prospect status to ${newStatus} for client ${id}');
          // Refetch client to get updated prospect_status
          const updatedResult = await pool.query(
            'SELECT * FROM clients WHERE id = $1',
            [id]
          );
          if (updatedResult.rows.length > 0) {
            updatedClient = updatedResult.rows[0];
          }
        }
      } catch (autoError) {
        logger.error({ error: autoError.message }, 'Error applying status automation:');
        // Don't fail the request if automation fails
      }
    }

    logger.info('✅ Successfully updated date of trial / first lesson for client ${id}');
    await markScoreStale(id, 'trial_date_set');
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating date of trial / first lesson:');
    res.status(500).json({ error: 'Failed to update date of trial / first lesson' });
  }
}));

// Update prospect status for a client
router.put('/:id/prospect-status', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { prospect_status, change_reason } = req.body;

    if (!prospect_status) {
      return res.status(400).json({ error: 'prospect_status is required' });
    }

    const validStatuses = [
      'Need To Contact',
      'Waiting for Response',
      'Building',
      'Waiting to Pair',
      'Waiting for Trial',
      'Trial Follow-Up',
      'Won',
      'Lost'
    ];

    if (!validStatuses.includes(prospect_status)) {
      return res.status(400).json({
        error: `Invalid prospect_status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Validate that "Won" status requires first_paid_lesson_completed = true (unless force override)
    const { force } = req.body;
    if (prospect_status === 'Won' && !force) {
      const clientCheck = await pool.query(
        'SELECT first_paid_lesson_completed, first_name, last_name FROM clients WHERE id = $1',
        [id]
      );

      if (clientCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }

      const client = clientCheck.rows[0];
      if (!client.first_paid_lesson_completed) {
        const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'This client';
        return res.status(400).json({
          error: `Cannot mark as Won: ${clientName} has not completed their first paid lesson. A prospect can only be marked as Won after their first paid lesson is completed.`,
          canForce: true // Signal to frontend that admin can force this
        });
      }
    }

    // If forcing, also set first_paid_lesson_completed to true for data consistency
    if (prospect_status === 'Won' && force) {
      await pool.query(
        'UPDATE clients SET first_paid_lesson_completed = true, updated_at = NOW() WHERE id = $1',
        [id]
      );
      logger.info('⚠️ Force marking client ${id} as Won - also set first_paid_lesson_completed = true');
    }

    logger.info('Updating prospect status for client ${id} to: ${prospect_status}');

    const ClientConversionService = require('../services/client-conversion-service');
    const service = new ClientConversionService(pool);
    
    const updatedClient = await service.updateProspectStatus(
      id,
      prospect_status,
      req.user?.email || req.user?.username || 'system',
      'manual',
      change_reason || 'Manual status update'
    );

    logger.info('✅ Successfully updated prospect status for client ${id}');
    await markScoreStale(id, 'status_change');
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating prospect status:');
    res.status(500).json({ error: error.message || 'Failed to update prospect status' });
  }
}));

// Revive Lost prospect back to pipeline
router.post('/:id/revive', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { prospect_status } = req.body;

    // Check if client exists and is Lost
    const clientCheck = await pool.query(
      'SELECT id, prospect_status FROM clients WHERE id = $1',
      [id]
    );

    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const currentStatus = clientCheck.rows[0].prospect_status;
    if (currentStatus !== 'Lost') {
      return res.status(400).json({ 
        error: `Client is not in Lost status. Current status: ${currentStatus}` 
      });
    }

    // Default to "Need To Contact" if no status provided
    const newStatus = prospect_status || 'Need To Contact';

    const validStatuses = [
      'Need To Contact',
      'Waiting for Response',
      'Building',
      'Waiting to Pair',
      'Waiting for Trial',
      'Trial Follow-Up'
    ];

    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ 
        error: `Invalid prospect_status for revival. Must be one of: ${validStatuses.join(', ')}` 
      });
    }

    logger.info('Reviving Lost prospect ${id} to status: ${newStatus}');

    const ClientConversionService = require('../services/client-conversion-service');
    const service = new ClientConversionService(pool);
    
    // Update prospect status
    const updatedClient = await service.updateProspectStatus(
      id,
      newStatus,
      req.user?.email || req.user?.username || 'system',
      'manual_revive',
      'Lost prospect revived back to pipeline'
    );

    // Also clear archived_at and update status back to 'prospect' if they were archived
    // Check if archived_at and status columns exist (cached)
    const reviveColumns = await columnsExist(pool, 'clients', ['archived_at', 'status']);
    const hasArchivedAt = reviveColumns.includes('archived_at');
    const hasStatus = reviveColumns.includes('status');
    
    // Build update query to clear archived_at and set status back to 'prospect'
    let additionalUpdateQuery = '';
    const additionalParams = [];
    let paramIndex = 1;
    
    if (hasArchivedAt && hasStatus) {
      additionalUpdateQuery = `
        UPDATE clients 
        SET archived_at = NULL, status = 'prospect', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      additionalParams.push(id);
    } else if (hasArchivedAt) {
      additionalUpdateQuery = `
        UPDATE clients 
        SET archived_at = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      additionalParams.push(id);
    } else if (hasStatus) {
      additionalUpdateQuery = `
        UPDATE clients 
        SET status = 'prospect', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      additionalParams.push(id);
    }
    
    if (additionalUpdateQuery) {
      const { rows: finalClient } = await pool.query(additionalUpdateQuery, additionalParams);
      if (finalClient.length > 0) {
        logger.info('✅ Cleared archived_at and updated status for revived prospect ${id}');
      }
    }

    logger.info('✅ Successfully revived prospect ${id} to ${newStatus}');
    res.json({ success: true, client: updatedClient });
  } catch (error) {
    logger.error({ error: error.message }, 'Error reviving prospect:');
    res.status(500).json({ error: error.message || 'Failed to revive prospect' });
  }
}));

// Update registration complete date for a client
router.put('/:id/date-registration-complete', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { date } = req.body;

    logger.info('Updating date_registration_complete for client ${id} to: ${date}');

    // Check if date_registration_complete column exists (cached)
    const dateRegColExists = (await columnsExist(pool, 'clients', ['date_registration_complete'])).length > 0;

    if (!dateRegColExists) {
      return res.status(400).json({ error: 'date_registration_complete column does not exist in clients table' });
    }

    // Get client details before update
    const clientResult = await pool.query(
      'SELECT * FROM clients WHERE id = $1',
      [id]
    );

    if (clientResult.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Update the date
    const result = await pool.query(
      'UPDATE clients SET date_registration_complete = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [date || null, id]
    );

    logger.info('✅ Successfully updated date_registration_complete for client ${id}');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating date_registration_complete:');
    res.status(500).json({ error: 'Failed to update date_registration_complete' });
  }
}));

// Toggle trial follow-up completed for a client
router.put('/:id/toggle-trial-follow-up', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { trial_follow_up_completed } = req.body;

    logger.info('Toggling trial follow-up completed for client ${id} to: ${trial_follow_up_completed}');

    const result = await pool.query(
      'UPDATE clients SET trial_follow_up_completed = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [trial_follow_up_completed, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info('✅ Successfully toggled trial follow-up completed for client ${id}');
    await markScoreStale(id, 'trial_follow_up');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling trial follow-up completed:');
    res.status(500).json({ error: 'Failed to toggle trial follow-up completed' });
  }
}));

// Toggle first paid lesson scheduled for a client
router.put('/:id/toggle-first-paid-scheduled', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { first_paid_lesson_scheduled } = req.body;

    logger.info('Toggling first paid lesson scheduled for client ${id} to: ${first_paid_lesson_scheduled}');

    const result = await pool.query(
      'UPDATE clients SET first_paid_lesson_scheduled = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [first_paid_lesson_scheduled, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info('✅ Successfully toggled first paid lesson scheduled for client ${id}');
    await markScoreStale(id, 'paid_scheduled');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling first paid lesson scheduled:');
    res.status(500).json({ error: 'Failed to toggle first paid lesson scheduled' });
  }
}));

// Toggle first paid lesson completed for a client
router.put('/:id/toggle-first-paid-completed', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { first_paid_lesson_completed } = req.body;

    logger.info('Toggling first paid lesson completed for client ${id} to: ${first_paid_lesson_completed}');

    const result = await pool.query(
      'UPDATE clients SET first_paid_lesson_completed = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [first_paid_lesson_completed, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info('✅ Successfully toggled first paid lesson completed for client ${id}');
    await markScoreStale(id, 'paid_completed');
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling first paid lesson completed:');
    res.status(500).json({ error: 'Failed to toggle first paid lesson completed' });
  }
}));

// Toggle class pack for a club client
router.put('/:id/toggle-class-pack', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { has_class_pack } = req.body;

    logger.info(`Toggling class pack for client ${id} to: ${has_class_pack}`);

    const result = await pool.query(
      'UPDATE clients SET has_class_pack = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [has_class_pack, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info(`Successfully toggled class pack for client ${id}`);
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error toggling class pack:');
    res.status(500).json({ error: 'Failed to toggle class pack' });
  }
}));

// Update club class name for a client
router.put('/:id/club-class-name', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { club_class_name } = req.body;

    logger.info(`Updating club class name for client ${id} to: ${club_class_name}`);

    const result = await pool.query(
      'UPDATE clients SET club_class_name = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [club_class_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    logger.info(`Successfully updated club class name for client ${id}`);
    res.json({ success: true, client: result.rows[0] });
  } catch (error) {
    logger.error({ error: error.message }, 'Error updating club class name:');
    res.status(500).json({ error: 'Failed to update club class name' });
  }
}));

// Get archived clients (Won, Lost, Dead Lead)
router.get('/archive', auth, asyncHandler(async (req, res) => {
  try {
    // Check columns and table existence in parallel (both are independent cached lookups)
    let availableColumns;
    let hasProformaTable;
    try {
      [availableColumns, hasProformaTable] = await Promise.all([
        columnsExist(pool, 'clients', [
          'status', 'prospect_status', 'pipeline_stage_id', 'labels', 'market', 'lead_type',
          'date_registration_complete', 'assigned_tutor_id', 'assigned_tutor_name',
          'date_tutor_client_paired', 'archived_at', 'client_spend'
        ]),
        tableExists(pool, 'proforma_invoices')
      ]);
    } catch (err) {
      logger.error({ error: err.message }, 'Error checking columns/tables:');
      return res.status(500).json({
        error: 'Failed to check database columns',
        details: err.message
      });
    }

    const hasStatusColumn = availableColumns.includes('status');
    const hasProspectStatusColumn = availableColumns.includes('prospect_status');
    const hasPipelineColumn = availableColumns.includes('pipeline_stage_id');
    const hasLabelsColumn = availableColumns.includes('labels');
    const hasMarketColumn = availableColumns.includes('market');
    const hasLeadTypeColumn = availableColumns.includes('lead_type');
    const hasDateRegComplete = availableColumns.includes('date_registration_complete');
    const hasAssignedTutorId = availableColumns.includes('assigned_tutor_id');
    const hasAssignedTutorName = availableColumns.includes('assigned_tutor_name');
    const hasDateTutorPaired = availableColumns.includes('date_tutor_client_paired');
    const hasArchivedAt = availableColumns.includes('archived_at');
    
    // Build client spend subquery (total paid invoices only - excludes credit requests/proforma)
    // Credit requests (PFI-*) just load money into account balance, not actual service spend
    // Note: Some PFI records were incorrectly synced into invoices table, so we exclude them
    const clientSpendSubquery = `
      SELECT
        CAST(client_id AS VARCHAR) AS client_id,
        SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS client_spend
      FROM invoices
      WHERE client_id IS NOT NULL
        AND display_id NOT LIKE 'PFI-%'
      GROUP BY client_id
    `;

    // Get the most recent note for each client (for inline notes column)
    const latestNoteSubquery = `
      SELECT DISTINCT ON (client_id)
        client_id,
        note as latest_note
      FROM client_notes
      ORDER BY client_id, created_at DESC
    `;

    // Build query with conditional column selection
    const selectFields = [
      'c.id',
      'c.client_id',
      'c.first_name',
      'c.last_name',
      'c.email',
      hasStatusColumn ? 'c.status as client_status' : "NULL as client_status",
      hasProspectStatusColumn ? 'c.prospect_status' : "NULL as prospect_status",
      hasLabelsColumn ? 'c.labels' : 'NULL as labels',
      hasMarketColumn ? 'c.market' : 'NULL as market',
      hasLeadTypeColumn ? 'c.lead_type' : 'NULL as lead_type',
      hasDateRegComplete
        ? 'COALESCE(c.date_registration_complete, c.created_at::date) as date_registration_complete'
        : 'c.created_at::date as date_registration_complete',
      hasAssignedTutorId ? 'c.assigned_tutor_id' : 'NULL as assigned_tutor_id',
      hasAssignedTutorName ? 'c.assigned_tutor_name' : 'NULL as assigned_tutor_name',
      hasDateTutorPaired ? 'c.date_tutor_client_paired' : 'NULL as date_tutor_client_paired',
      hasArchivedAt ? 'c.archived_at' : 'NULL as archived_at',
      hasPipelineColumn ? 'c.pipeline_stage_id' : 'NULL as pipeline_stage_id',
      hasPipelineColumn ? 'ps.name as pipeline_stage' : 'NULL as pipeline_stage',
      'COALESCE(cs.client_spend, 0) as client_spend',
      'ln.latest_note',
      'an.automation_trigger',
      'an.automation_date'
    ].filter(Boolean).join(',\n          ');

    // Build JOIN clause conditionally
    const pipelineJoin = hasPipelineColumn
      ? 'LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id'
      : '';

    const bookingSubmissionsJoin = 'LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text';
    const clientSpendJoin = `LEFT JOIN (${clientSpendSubquery}) cs ON c.client_id = cs.client_id`;
    const latestNoteJoin = `LEFT JOIN (${latestNoteSubquery}) ln ON c.id = ln.client_id`;

    // Join to get automation_trigger from cct_notifications (most recent notification for each client)
    const automationTriggerJoin = `
      LEFT JOIN (
        SELECT DISTINCT ON (client_id)
          client_id,
          automation_trigger,
          created_at as automation_date
        FROM cct_notifications
        WHERE type IN ('auto_won', 'auto_lost_14_day', 'auto_lost_30_day_building', 'auto_lost_30_day_trial', 'manual_lost')
        ORDER BY client_id, created_at DESC
      ) an ON c.id = an.client_id
    `;

    // Build WHERE clause - get archived clients AND Lost/Won prospects
    // Include ONLY clients with prospect_status = 'Lost' or 'Won'
    // This ensures revived prospects (prospect_status changed from Lost/Won) are excluded
    let whereClause = '';
    try {
      const conditions = [];
      
      // Primary condition: prospect_status must be 'Lost' or 'Won'
      // This is the most reliable indicator - if prospect_status is not Lost/Won, they shouldn't be in archive
      if (hasProspectStatusColumn) {
        conditions.push("c.prospect_status IN ('Lost', 'Won')");
      } else {
        // Fallback: if prospect_status column doesn't exist, use archived_at or status
        // But this should rarely happen
        if (hasArchivedAt) {
          conditions.push("c.archived_at IS NOT NULL");
        }
        if (hasStatusColumn) {
          conditions.push("c.status = 'archived'");
        }
      }
      
      // Add pipeline stage = 'Won' or 'Lost' condition as additional filter (AND, not OR)
      // Only include if prospect_status also matches
      if (hasPipelineColumn && hasProspectStatusColumn) {
        try {
          const wonLostStages = await pool.query(
            `SELECT id FROM pipeline_stages WHERE LOWER(name) IN ('won', 'lost')`
          );
          if (wonLostStages.rows.length > 0) {
            const stageIds = wonLostStages.rows.map(r => r.id);
            // This is already covered by prospect_status filter, but keeping for completeness
            // We'll use it as an additional AND condition if needed
          }
        } catch (err) {
          logger.error({ error: err.message }, '❌ Error fetching pipeline stages:');
          // Continue without pipeline stage condition
        }
      }
      
      // Exclude school clients - they don't belong in the sales pipeline or archive
      if (hasLabelsColumn) {
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(c.labels) AS label
          WHERE label->>'name' LIKE 'School -%'
        )`);
      }

      if (conditions.length > 0) {
        // First condition (prospect_status) uses OR, but school exclusion must be AND
        const mainCondition = conditions.slice(0, -1).join(' OR ');
        const schoolExclusion = conditions[conditions.length - 1];
        if (hasLabelsColumn && conditions.length > 1) {
          whereClause = `WHERE (${mainCondition}) AND ${schoolExclusion}`;
        } else {
          whereClause = `WHERE ${conditions.join(' OR ')}`;
        }
      } else {
        // No way to determine archived clients - return empty result
        logger.info('⚠️ No archive mechanism available (no archived_at, status, prospect_status, or pipeline_stage columns)');
        return res.json([]);
      }
    } catch (err) {
      logger.error({ error: err.message }, '❌ Error building WHERE clause:');
      return res.status(500).json({
        error: 'Failed to build archive query',
        details: err.message
      });
    }
    
    // Build the full query
    let query = `
        SELECT
        ${selectFields}
        FROM clients c
      ${bookingSubmissionsJoin}
      ${pipelineJoin}
      ${clientSpendJoin}
      ${latestNoteJoin}
      ${automationTriggerJoin}
    `;
    
    // Add WHERE clause if needed
    if (whereClause) {
      query += ` ${whereClause}`;
    }
    
    // Check if updated_at column exists (cached)
    const hasUpdatedAt = (await columnsExist(pool, 'clients', ['updated_at'])).length > 0;
    
    // Build ORDER BY clause conditionally
    let orderByClause = '';
    if (hasArchivedAt && hasUpdatedAt) {
      orderByClause = 'ORDER BY c.archived_at DESC NULLS LAST, c.updated_at DESC';
    } else if (hasArchivedAt) {
      orderByClause = 'ORDER BY c.archived_at DESC NULLS LAST';
    } else if (hasUpdatedAt) {
      orderByClause = 'ORDER BY c.updated_at DESC';
    } else {
      // Fallback to id if neither column exists
      orderByClause = 'ORDER BY c.id DESC';
    }
    
    query += `
        ${orderByClause}
        LIMIT 1000
      `;

    let rows;
    try {
      const result = await pool.query(query);
      rows = result.rows;
    } catch (queryErr) {
      logger.error({ error: queryErr.message }, '❌ Error executing archive query:');
      return res.status(500).json({
        error: 'Failed to execute archive query',
        details: queryErr.message,
        hint: 'Check if all required columns exist in the database'
      });
    }

    res.json(rows);
  } catch (err) {
    logger.error({ error: err.message }, '❌ Error fetching archived client conversion data:');
    logger.error({ err: err }, '📊 Error details:');
    logger.error({ error: err.stack }, '📊 Error stack:');
    res.status(500).json({ 
      error: 'Failed to fetch archived client conversion data',
      details: err.message
    });
  }
}));

// Search for clients in TutorCruncher
router.get('/search-clients', auth, asyncHandler(async (req, res) => {
  try {
    const { search } = req.query;
    const raw = (search || '').trim();

    if (raw.length < 2) {
      return res.json({ clients: [] });
    }

    // Search TutorCruncher clients (recipients with role_type = 'Client')
    let params = {};
    const parts = raw.split(/\s+/);
    
    if (parts.length > 1) {
      params = {
        user__first_name: parts[0],
        user__last_name: parts.slice(1).join(' ')
      };
    } else {
      // Search by first name, last name, or email
      params = {
        user__first_name__icontains: raw
      };
    }

    try {
      const { data } = await tutorCruncherAPI.get('/recipients/', { params });
      
      // Filter for clients (role_type = 'Client') and map to our format
      const clients = (data.results || [])
        .filter(r => r.role_type === 'Client')
        .map(r => ({
          id: r.id,
          client_id: r.id.toString(),
          firstName: r.first_name,
          lastName: r.last_name,
          email: r.email,
          phone: r.phone || r.mobile,
          address: r.address
        }));

      // Also search by email if it looks like an email
      if (raw.includes('@')) {
        const emailParams = {
          user__email__icontains: raw
        };
        const emailData = await tutorCruncherAPI.get('/recipients/', { params: emailParams });
        const emailClients = (emailData.results || [])
          .filter(r => r.role_type === 'Client')
          .map(r => ({
            id: r.id,
            client_id: r.id.toString(),
            firstName: r.first_name,
            lastName: r.last_name,
            email: r.email,
            phone: r.phone || r.mobile,
            address: r.address
          }));
        
        // Merge and deduplicate by id
        const allClients = [...clients, ...emailClients];
        const uniqueClients = Array.from(
          new Map(allClients.map(c => [c.id, c])).values()
        );
        
        return res.json({ clients: uniqueClients });
      }

      res.json({ clients });
    } catch (err) {
      logger.error({ err: err }, 'TutorCruncher client lookup failed:');
      res.status(502).json({ clients: [], error: 'Failed to search TutorCruncher clients' });
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Error searching clients:');
    res.status(500).json({ error: 'Failed to search clients' });
  }
}));

// GET /previous-pairings - Get previous tutor pairings for all clients
router.get('/previous-pairings', auth, asyncHandler(async (req, res) => {
  try {
    logger.info('🔍 Fetching previous tutor pairings...');
    
    // Check if client_tutor_history table exists (cached)
    const tutorHistoryTableExists = await tableExists(pool, 'client_tutor_history');

    if (!tutorHistoryTableExists) {
      return res.json({
        error: 'client_tutor_history table does not exist',
        data: []
      });
    }

    // Get all previous pairings with client information
    const { rows } = await pool.query(`
      SELECT 
        cth.id,
        cth.client_id,
        cth.tutor_id,
        cth.tutor_name,
        cth.paired_at,
        cth.unpaired_at,
        cth.reason,
        cth.created_at,
        cth.updated_at,
        c.first_name,
        c.last_name,
        c.email,
        c.client_id as tc_client_id,
        c.assigned_tutor_id as current_tutor_id,
        c.assigned_tutor_name as current_tutor_name
      FROM client_tutor_history cth
      JOIN clients c ON cth.client_id = c.id
      ORDER BY cth.paired_at DESC
      LIMIT 1000
    `);
    
    logger.info('✅ Found ${rows.length} previous tutor pairings');
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching previous pairings:');
    res.status(500).json({ 
      error: 'Failed to fetch previous pairings',
      details: error.message 
    });
  }
}));

// GET /previous-pairings/:clientId - Get previous tutor pairings for a specific client
router.get('/previous-pairings/:clientId', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    
    logger.info('🔍 Fetching previous tutor pairings for client ${clientId}...');
    
    // Check if client_tutor_history table exists (cached)
    const tutorHistoryExists2 = await tableExists(pool, 'client_tutor_history');

    if (!tutorHistoryExists2) {
      return res.json({
        error: 'client_tutor_history table does not exist',
        data: []
      });
    }

    // Get previous pairings for this client
    const { rows } = await pool.query(`
      SELECT 
        cth.id,
        cth.client_id,
        cth.tutor_id,
        cth.tutor_name,
        cth.paired_at,
        cth.unpaired_at,
        cth.reason,
        cth.created_at,
        cth.updated_at
      FROM client_tutor_history cth
      WHERE cth.client_id = $1
      ORDER BY cth.paired_at DESC
    `, [clientId]);
    
    logger.info('✅ Found ${rows.length} previous tutor pairings for client ${clientId}');
    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching previous pairings for client ${clientId}:');
    res.status(500).json({ 
      error: 'Failed to fetch previous pairings',
      details: error.message 
    });
  }
}));

// POST /previous-pairings - Create a new tutor pairing record
router.post('/previous-pairings', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId, tutorId, tutorName, pairedAt, reason } = req.body;
    
    if (!clientId || !tutorName || !pairedAt) {
      return res.status(400).json({ 
        error: 'Missing required fields: clientId, tutorName, pairedAt' 
      });
    }
    
    logger.info('📝 Creating tutor pairing record for client ${clientId}...');
    
    // Check if client_tutor_history table exists (cached)
    const tutorHistoryExists3 = await tableExists(pool, 'client_tutor_history');

    if (!tutorHistoryExists3) {
      return res.status(500).json({
        error: 'client_tutor_history table does not exist'
      });
    }

    // Insert new pairing record
    const { rows } = await pool.query(`
      INSERT INTO client_tutor_history (client_id, tutor_id, tutor_name, paired_at, reason)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [clientId, tutorId || null, tutorName, pairedAt, reason || null]);
    
    logger.info('✅ Created tutor pairing record: ${rows[0].id}');
    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, '❌ Error creating tutor pairing record:');
    res.status(500).json({ 
      error: 'Failed to create tutor pairing record',
      details: error.message 
    });
  }
}));

// PUT /previous-pairings/:id - Update a tutor pairing record (e.g., mark as unpaired)
router.put('/previous-pairings/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { unpairedAt, reason } = req.body;
    
    logger.info('📝 Updating tutor pairing record ${id}...');
    
    // Check if client_tutor_history table exists (cached)
    const tutorHistoryExists4 = await tableExists(pool, 'client_tutor_history');

    if (!tutorHistoryExists4) {
      return res.status(500).json({
        error: 'client_tutor_history table does not exist'
      });
    }

    // Update pairing record
    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;
    
    if (unpairedAt !== undefined) {
      updateFields.push(`unpaired_at = $${paramCount}`);
      updateValues.push(unpairedAt);
      paramCount++;
    }
    
    if (reason !== undefined) {
      updateFields.push(`reason = $${paramCount}`);
      updateValues.push(reason);
      paramCount++;
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ 
        error: 'No fields to update' 
      });
    }
    
    updateValues.push(id);
    
    const { rows } = await pool.query(`
      UPDATE client_tutor_history
      SET ${updateFields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `, updateValues);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        error: 'Tutor pairing record not found' 
      });
    }
    
    logger.info('✅ Updated tutor pairing record: ${id}');
    res.json(rows[0]);
  } catch (error) {
    logger.error({ err: error }, '❌ Error updating tutor pairing record:');
    res.status(500).json({ 
      error: 'Failed to update tutor pairing record',
      details: error.message 
    });
  }
}));

// GET /analytics/conversions-by-lead-type - Get conversion analytics by lead type
router.get('/analytics/conversions-by-lead-type', auth, asyncHandler(async (req, res) => {
  try {
    const { period = 'monthly', startDate, endDate } = req.query;

    // Check if required columns exist (cached)
    const leadTypeColumns = await columnsExist(pool, 'clients', [
      'lead_type', 'date_trial_first_lesson', 'first_paid_lesson_completed', 'pipeline_stage_id', 'archived_at'
    ]);

    const hasLeadType = leadTypeColumns.includes('lead_type');
    const hasDateTrial = leadTypeColumns.includes('date_trial_first_lesson');
    const hasFirstPaidCompleted = leadTypeColumns.includes('first_paid_lesson_completed');
    const hasPipelineStage = leadTypeColumns.includes('pipeline_stage_id');
    const hasArchivedAt = leadTypeColumns.includes('archived_at');

    if (!hasLeadType) {
      return res.json({
        error: 'Lead type column not found',
        data: { weekly: [], monthly: [], annual: [] }
      });
    }
    
    // Get Won stage ID
    let wonStageId = null;
    if (hasPipelineStage) {
      const wonStageResult = await pool.query(
        `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'won' LIMIT 1`
      );
      wonStageId = wonStageResult.rows[0]?.id;
    }
    
    // Build date range filter
    let dateFilter = '';
    const queryParams = [];
    let paramCount = 0;
    
    if (startDate && endDate) {
      paramCount++;
      dateFilter = `AND c.date_trial_first_lesson >= $${paramCount} AND c.date_trial_first_lesson <= $${paramCount + 1}`;
      queryParams.push(startDate, endDate);
      paramCount++;
    }
    
    // Build query based on period
    let timeGrouping = '';
    let timeLabel = '';
    
    if (period === 'weekly') {
      timeGrouping = `DATE_TRUNC('week', c.date_trial_first_lesson)`;
      timeLabel = `DATE_TRUNC('week', c.date_trial_first_lesson) AS period_start`;
    } else if (period === 'annual') {
      timeGrouping = `DATE_TRUNC('year', c.date_trial_first_lesson)`;
      timeLabel = `DATE_TRUNC('year', c.date_trial_first_lesson) AS period_start`;
    } else {
      // monthly (default)
      timeGrouping = `DATE_TRUNC('month', c.date_trial_first_lesson)`;
      timeLabel = `DATE_TRUNC('month', c.date_trial_first_lesson) AS period_start`;
    }
    
    // Build conversion filter conditions
    let conversionFilter = '';
    if (hasFirstPaidCompleted) {
      conversionFilter = 'AND c.first_paid_lesson_completed = true';
    } else if (wonStageId) {
      paramCount++;
      conversionFilter = `AND c.pipeline_stage_id = $${paramCount}`;
      queryParams.push(wonStageId);
    }
    
    // Query to get conversions by lead type
    const conversionsQuery = `
      WITH trials AS (
        SELECT 
          c.lead_type,
          ${timeLabel},
          COUNT(*) AS trial_count
        FROM clients c
        WHERE c.lead_type IS NOT NULL 
          AND c.date_trial_first_lesson IS NOT NULL
          ${dateFilter}
          ${hasArchivedAt ? 'AND (c.archived_at IS NULL OR c.archived_at IS NOT NULL)' : ''}
        GROUP BY c.lead_type, ${timeGrouping}
      ),
      conversions AS (
        SELECT 
          c.lead_type,
          ${timeLabel},
          COUNT(*) AS conversion_count
        FROM clients c
        WHERE c.lead_type IS NOT NULL
          AND c.date_trial_first_lesson IS NOT NULL
          ${conversionFilter}
          ${dateFilter}
          ${hasArchivedAt ? 'AND (c.archived_at IS NULL OR c.archived_at IS NOT NULL)' : ''}
        GROUP BY c.lead_type, ${timeGrouping}
      )
      SELECT 
        COALESCE(t.lead_type, c.lead_type) AS lead_type,
        COALESCE(t.period_start, c.period_start) AS period_start,
        COALESCE(t.trial_count, 0) AS trials,
        COALESCE(c.conversion_count, 0) AS conversions,
        CASE 
          WHEN COALESCE(t.trial_count, 0) > 0 
          THEN ROUND((COALESCE(c.conversion_count, 0)::DECIMAL / t.trial_count::DECIMAL) * 100, 2)
          ELSE 0
        END AS conversion_rate
      FROM trials t
      FULL OUTER JOIN conversions c ON t.lead_type = c.lead_type AND t.period_start = c.period_start
      ORDER BY period_start DESC, lead_type
    `;
    
    const { rows } = await pool.query(conversionsQuery, queryParams);
    
    // Group by period
    const grouped = {};
    rows.forEach(row => {
      const periodKey = row.period_start ? new Date(row.period_start).toISOString() : 'unknown';
      if (!grouped[periodKey]) {
        grouped[periodKey] = {
          period: periodKey,
          leadTypes: []
        };
      }
      grouped[periodKey].leadTypes.push({
        leadType: row.lead_type,
        trials: parseInt(row.trials) || 0,
        conversions: parseInt(row.conversions) || 0,
        conversionRate: parseFloat(row.conversion_rate) || 0
      });
    });
    
    const result = Object.values(grouped).map(group => ({
      period: group.period,
      leadTypes: group.leadTypes,
      totalTrials: group.leadTypes.reduce((sum, lt) => sum + lt.trials, 0),
      totalConversions: group.leadTypes.reduce((sum, lt) => sum + lt.conversions, 0),
      overallConversionRate: group.leadTypes.reduce((sum, lt) => sum + lt.trials, 0) > 0
        ? (group.leadTypes.reduce((sum, lt) => sum + lt.conversions, 0) / group.leadTypes.reduce((sum, lt) => sum + lt.trials, 0)) * 100
        : 0
    }));

    res.json({ data: result, period });
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching conversions by lead type:');
    res.status(500).json({ 
      error: 'Failed to fetch conversions by lead type',
      details: error.message 
    });
  }
}));

// GET /analytics/conversions-by-market - Get conversion analytics by market
router.get('/analytics/conversions-by-market', auth, asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Check if required columns exist (cached)
    const marketColumns = await columnsExist(pool, 'clients', [
      'market', 'lead_type', 'date_trial_first_lesson', 'first_paid_lesson_completed',
      'pipeline_stage_id', 'archived_at', 'labels'
    ]);

    const hasMarket = marketColumns.includes('market');
    const hasLeadType = marketColumns.includes('lead_type');
    const hasDateTrial = marketColumns.includes('date_trial_first_lesson');
    const hasFirstPaidCompleted = marketColumns.includes('first_paid_lesson_completed');
    const hasPipelineStage = marketColumns.includes('pipeline_stage_id');
    const hasArchivedAt = marketColumns.includes('archived_at');
    const hasLabels = marketColumns.includes('labels');
    
    if (!hasMarket && !hasLabels) {
      return res.json({ 
        error: 'Market column not found',
        data: []
      });
    }
    
    // Get Won stage ID
    let wonStageId = null;
    if (hasPipelineStage) {
      const wonStageResult = await pool.query(
        `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'won' LIMIT 1`
      );
      wonStageId = wonStageResult.rows[0]?.id;
    }
    
    // Build date range filter
    let dateFilter = '';
    const queryParams = [];
    let paramCount = 0;
    
    if (startDate && endDate) {
      paramCount++;
      dateFilter = `AND c.date_trial_first_lesson >= $${paramCount} AND c.date_trial_first_lesson <= $${paramCount + 1}`;
      queryParams.push(startDate, endDate);
      paramCount++;
    }
    
    // Build conversion filter conditions
    let conversionFilter = '';
    if (hasFirstPaidCompleted) {
      conversionFilter = 'AND c.first_paid_lesson_completed = true';
    } else if (wonStageId) {
      paramCount++;
      conversionFilter = `AND c.pipeline_stage_id = $${paramCount}`;
      queryParams.push(wonStageId);
    }
    
    // Extract market from market column or labels
    const marketExpression = hasMarket
      ? `COALESCE(c.market, 'Other')`
      : `CASE
          WHEN c.labels @> '"NYC"'::jsonb OR c.labels @> '"New York"'::jsonb THEN 'NYC'
          WHEN c.labels @> '"LA"'::jsonb OR c.labels @> '"Los Angeles"'::jsonb THEN 'Los Angeles'
          WHEN c.labels @> '"SF"'::jsonb OR c.labels @> '"San Francisco"'::jsonb THEN 'San Francisco'
          WHEN c.labels @> '"Online"'::jsonb THEN 'Online'
          WHEN c.labels @> '"Hamptons"'::jsonb THEN 'Hamptons'
          ELSE 'Other'
        END`;
    
    // Build lead_type expression (handle missing column)
    const leadTypeSelect = hasLeadType 
      ? 'c.lead_type'
      : "'Unknown'::text";
    const leadTypeGroupBy = hasLeadType 
      ? 'c.lead_type'
      : "'Unknown'::text";
    
    // Query to get conversions by market
    const conversionsQuery = `
      WITH trials_by_market AS (
        SELECT 
          ${marketExpression} AS market,
          ${leadTypeSelect} AS lead_type,
          COUNT(*) AS trial_count
        FROM clients c
        WHERE ${marketExpression} IS NOT NULL
          AND c.date_trial_first_lesson IS NOT NULL
          ${dateFilter}
          ${hasArchivedAt ? 'AND (c.archived_at IS NULL OR c.archived_at IS NOT NULL)' : ''}
        GROUP BY ${marketExpression}, ${leadTypeGroupBy}
      ),
      conversions_by_market AS (
        SELECT 
          ${marketExpression} AS market,
          ${leadTypeSelect} AS lead_type,
          COUNT(*) AS conversion_count
        FROM clients c
        WHERE ${marketExpression} IS NOT NULL
          AND c.date_trial_first_lesson IS NOT NULL
          ${conversionFilter}
          ${dateFilter}
          ${hasArchivedAt ? 'AND (c.archived_at IS NULL OR c.archived_at IS NOT NULL)' : ''}
        GROUP BY ${marketExpression}, ${leadTypeGroupBy}
      )
      SELECT 
        COALESCE(t.market, c.market) AS market,
        COALESCE(t.lead_type, c.lead_type, 'Unknown') AS lead_type,
        COALESCE(t.trial_count, 0) AS trials,
        COALESCE(c.conversion_count, 0) AS conversions,
        CASE 
          WHEN COALESCE(t.trial_count, 0) > 0 
          THEN ROUND((COALESCE(c.conversion_count, 0)::DECIMAL / t.trial_count::DECIMAL) * 100, 2)
          ELSE 0
        END AS conversion_rate
      FROM trials_by_market t
      FULL OUTER JOIN conversions_by_market c ON t.market = c.market AND COALESCE(t.lead_type, 'Unknown') = COALESCE(c.lead_type, 'Unknown')
      ORDER BY market, lead_type
    `;
    
    const { rows } = await pool.query(conversionsQuery, queryParams);
    
    // Group by market
    const grouped = {};
    rows.forEach(row => {
      const market = row.market || 'Other';
      if (!grouped[market]) {
        grouped[market] = {
          market,
          leadTypes: [],
          totalTrials: 0,
          totalConversions: 0
        };
      }
      grouped[market].leadTypes.push({
        leadType: row.lead_type || 'Unknown',
        trials: parseInt(row.trials) || 0,
        conversions: parseInt(row.conversions) || 0,
        conversionRate: parseFloat(row.conversion_rate) || 0
      });
      grouped[market].totalTrials += parseInt(row.trials) || 0;
      grouped[market].totalConversions += parseInt(row.conversions) || 0;
    });
    
    // Calculate overall conversion rate for each market
    const result = Object.values(grouped).map(marketData => ({
      market: marketData.market,
      leadTypes: marketData.leadTypes,
      totalTrials: marketData.totalTrials,
      totalConversions: marketData.totalConversions,
      overallConversionRate: marketData.totalTrials > 0
        ? (marketData.totalConversions / marketData.totalTrials) * 100
        : 0
    }));

    res.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching conversions by market:');
    res.status(500).json({ 
      error: 'Failed to fetch conversions by market',
      details: error.message 
    });
  }
}));

// Mark prospect as Won - converts to live client and moves to archive
router.put('/:id/mark-won', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    logger.info('🎯 Marking prospect ${id} as Won...');
    
    // Get client data to find TutorCruncher client ID and current status
    const { rows: clientData } = await dbPool.query(`
      SELECT id, client_id, status, pipeline_stage_id
      FROM clients 
      WHERE id = $1
    `, [id]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const client = clientData[0];
    const tcClientId = client.client_id;
    
    if (!tcClientId) {
      return res.status(400).json({ error: 'Client does not have a TutorCruncher ID' });
    }
    
    // Find Won pipeline stage
    const { rows: wonStage } = await dbPool.query(`
      SELECT id FROM pipeline_stages 
      WHERE name = 'Won' AND active = true 
      LIMIT 1
    `);
    
    if (wonStage.length === 0) {
      return res.status(400).json({ error: 'Won pipeline stage not found. Please create it in TutorCruncher and sync.' });
    }
    
    const wonStageId = wonStage[0].id;
    
    // Update TutorCruncher status from prospect to live
    if (tutorCruncherAPI) {
      try {
        await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, {
          status: 'live'
        });
        logger.info('✅ Updated TutorCruncher client ${tcClientId} status to live');
      } catch (tcError) {
        logger.error({ error: tcError.message }, '⚠️ Failed to update TutorCruncher status:');
        // Continue with local update even if TutorCruncher update fails
      }
    }
    
    // Check if archived_at column exists (cached)
    const hasArchivedAt = (await columnsExist(dbPool, 'clients', ['archived_at'])).length > 0;

    // Update local database: status to live, pipeline_stage_id to Won, set archived_at
    const updateQuery = hasArchivedAt
      ? `UPDATE clients 
         SET status = 'live', 
             pipeline_stage_id = $1, 
             archived_at = NOW(), 
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`
      : `UPDATE clients 
         SET status = 'live', 
             pipeline_stage_id = $1, 
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`;
    
    const { rows: updatedClient } = await dbPool.query(updateQuery, [wonStageId, id]);
    
    logger.info('✅ Successfully marked prospect ${id} as Won');
    
    res.json({ 
      success: true, 
      client: updatedClient[0], 
      message: 'Prospect marked as Won and moved to archive'
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error marking prospect as Won:');
    res.status(500).json({ 
      error: 'Failed to mark prospect as Won',
      details: error.message 
    });
  }
}));

// Mark prospect as Lost - converts to dormant and moves to archive
router.put('/:id/mark-lost', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    logger.info('🎯 Marking prospect ${id} as Lost...');

    // Get client data to find TutorCruncher client ID and current status
    const { rows: clientData } = await dbPool.query(`
      SELECT id, client_id, status, pipeline_stage_id, prospect_status
      FROM clients
      WHERE id = $1
    `, [id]);

    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const client = clientData[0];
    const tcClientId = client.client_id;

    if (!tcClientId) {
      return res.status(400).json({ error: 'Client does not have a TutorCruncher ID' });
    }

    // Find Lost pipeline stage (optional - don't fail if it doesn't exist)
    const { rows: lostStage } = await dbPool.query(`
      SELECT id FROM pipeline_stages
      WHERE name = 'Lost' AND active = true
      LIMIT 1
    `);

    const lostStageId = lostStage.length > 0 ? lostStage[0].id : null;

    if (lostStage.length === 0) {
      logger.warn('⚠️ Lost pipeline stage not found. Continuing without pipeline stage update.');
    }

    // Update TutorCruncher status from prospect to dormant
    let tcSyncStatus = 'skipped';
    let tcSyncError = null;
    if (tutorCruncherAPI) {
      try {
        await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, {
          status: 'dormant'
        });
        tcSyncStatus = 'success';
        logger.info('✅ Updated TutorCruncher client ${tcClientId} status to dormant');
      } catch (tcError) {
        tcSyncStatus = 'failed';
        tcSyncError = tcError.message;
        logger.error({ error: tcError.message }, '⚠️ Failed to update TutorCruncher status:');
        // Continue with local update even if TutorCruncher update fails
      }
    }
    
    // Check if archived_at and prospect_status columns exist (cached)
    const lostColumns = await columnsExist(dbPool, 'clients', ['archived_at', 'prospect_status']);
    const hasArchivedAt = lostColumns.includes('archived_at');
    const hasProspectStatus = lostColumns.includes('prospect_status');
    
    // Update local database: status to dormant, prospect_status to Lost, pipeline_stage_id to Lost (if found), set archived_at
    let updateQuery;
    let updateParams;
    
    if (hasArchivedAt && hasProspectStatus) {
      if (lostStageId) {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               prospect_status = 'Lost',
               pipeline_stage_id = $1, 
               archived_at = NOW(), 
               updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`;
        updateParams = [lostStageId, id];
      } else {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               prospect_status = 'Lost',
               archived_at = NOW(), 
               updated_at = NOW() 
           WHERE id = $1 
           RETURNING *`;
        updateParams = [id];
      }
    } else if (hasProspectStatus) {
      if (lostStageId) {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               prospect_status = 'Lost',
               pipeline_stage_id = $1, 
               updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`;
        updateParams = [lostStageId, id];
      } else {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               prospect_status = 'Lost',
               updated_at = NOW() 
           WHERE id = $1 
           RETURNING *`;
        updateParams = [id];
      }
    } else if (hasArchivedAt) {
      if (lostStageId) {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               pipeline_stage_id = $1, 
               archived_at = NOW(), 
               updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`;
        updateParams = [lostStageId, id];
      } else {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               archived_at = NOW(), 
               updated_at = NOW() 
           WHERE id = $1 
           RETURNING *`;
        updateParams = [id];
      }
    } else {
      if (lostStageId) {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               pipeline_stage_id = $1, 
               updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`;
        updateParams = [lostStageId, id];
      } else {
        updateQuery = `UPDATE clients 
           SET status = 'dormant', 
               updated_at = NOW() 
           WHERE id = $1 
           RETURNING *`;
        updateParams = [id];
      }
    }
    
    const { rows: updatedClient } = await dbPool.query(updateQuery, updateParams);

    // Write audit trail to client_conversion_events
    try {
      const changedBy = req.user?.name || req.user?.email || 'unknown';
      await dbPool.query(`
        INSERT INTO client_conversion_events (
          client_id, from_status, to_status,
          from_prospect_status, to_prospect_status,
          from_stage_id, to_stage_id,
          changed_by, change_reason, automation_trigger,
          tc_sync_status, tc_sync_error, created_at
        ) VALUES ($1, $2, 'dormant', $3, 'Lost', $4, $5, $6, 'Manual mark as Lost', 'manual', $7, $8, NOW())
      `, [
        id,
        client.status,
        client.prospect_status,
        client.pipeline_stage_id,
        lostStageId,
        changedBy,
        tcSyncStatus,
        tcSyncError
      ]);
    } catch (auditError) {
      logger.error({ error: auditError.message }, 'Failed to write mark-lost audit event');
    }

    logger.info('✅ Successfully marked prospect ${id} as Lost');

    res.json({
      success: true,
      client: updatedClient[0],
      message: 'Prospect marked as Lost and moved to archive',
      tcSyncStatus
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error marking prospect as Lost:');
    res.status(500).json({ 
      error: 'Failed to mark prospect as Lost',
      details: error.message 
    });
  }
}));

// Get status change history for a client
router.get('/:id/status-history', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const dbPool = req.locationPool || pool;

  const { rows } = await dbPool.query(`
    SELECT
      id,
      from_status,
      to_status,
      from_prospect_status,
      to_prospect_status,
      from_stage_id,
      to_stage_id,
      changed_by,
      change_reason,
      automation_trigger,
      tc_sync_status,
      tc_sync_error,
      created_at
    FROM client_conversion_events
    WHERE client_id = $1
    ORDER BY created_at DESC
  `, [id]);

  res.json({ history: rows });
}));

// Get TutorCruncher client notes
router.get('/:clientId/tutorcruncher-notes', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get TutorCruncher client ID from local database
    const { rows: clientData } = await dbPool.query(`
      SELECT client_id FROM clients WHERE id = $1
    `, [clientId]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const tcClientId = clientData[0].client_id;
    
    if (!tcClientId) {
      return res.json({ notes: [], message: 'Client does not have a TutorCruncher ID' });
    }
    
    if (!tutorCruncherAPI) {
      return res.status(500).json({ error: 'TutorCruncher API not available' });
    }
    
    try {
      // Fetch notes from TutorCruncher API
      // TutorCruncher notes endpoint: GET /api/notes/?client=<client_id>
      const response = await tutorCruncherAPI.get('/notes/', {
        params: {
          client: tcClientId
        }
      });
      
      const notes = response.data.results || response.data || [];
      
      // Format notes for frontend
      const formattedNotes = notes.map(note => ({
        id: note.id,
        text: note.text || note.note_text || '',
        created_by: note.created_by?.name || note.created_by || 'Unknown',
        created_at: note.created_at || note.created,
        updated_at: note.updated_at || note.updated,
        entity_type: note.entity_type || 'client',
        entity_id: note.entity_id || tcClientId
      }));
      
      res.json({ notes: formattedNotes });
    } catch (tcError) {
      logger.error({ error: tcError.message }, 'Error fetching TutorCruncher notes:');
      // Return empty array if API fails rather than error
      res.json({ notes: [], error: tcError.message });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher notes:');
    res.status(500).json({ 
      error: 'Failed to fetch TutorCruncher notes',
      details: error.message 
    });
  }
}));

// Sync note to TutorCruncher (create or update)
router.post('/:clientId/tutorcruncher-notes', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { note_text, note_id } = req.body; // note_id is optional for updates
    const dbPool = req.locationPool || pool;
    
    if (!note_text) {
      return res.status(400).json({ error: 'Note text is required' });
    }
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get TutorCruncher client ID from local database
    const { rows: clientData } = await dbPool.query(`
      SELECT client_id FROM clients WHERE id = $1
    `, [clientId]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const tcClientId = clientData[0].client_id;
    
    if (!tcClientId) {
      return res.status(400).json({ error: 'Client does not have a TutorCruncher ID' });
    }
    
    if (!tutorCruncherAPI) {
      return res.status(500).json({ error: 'TutorCruncher API not available' });
    }
    
    try {
      let noteResponse;
      
      if (note_id) {
        // Update existing note
        noteResponse = await tutorCruncherAPI.patch(`/notes/${note_id}/`, {
          text: note_text
        });
      } else {
        // Create new note
        noteResponse = await tutorCruncherAPI.post('/notes/', {
          text: note_text,
          entity_type: 'client',
          entity_id: tcClientId
        });
      }
      
      const note = noteResponse.data;
      
      res.json({ 
        success: true,
        note: {
          id: note.id,
          text: note.text || note_text,
          created_by: note.created_by?.name || 'Unknown',
          created_at: note.created_at || note.created,
          updated_at: note.updated_at || note.updated
        }
      });
    } catch (tcError) {
      logger.error({ error: tcError.message }, 'Error syncing note to TutorCruncher:');
      res.status(500).json({ 
        error: 'Failed to sync note to TutorCruncher',
        details: tcError.response?.data || tcError.message 
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error syncing note to TutorCruncher:');
    res.status(500).json({ 
      error: 'Failed to sync note to TutorCruncher',
      details: error.message 
    });
  }
}));

// Delete TutorCruncher note
router.delete('/:clientId/tutorcruncher-notes/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId, noteId } = req.params;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get TutorCruncher client ID from local database
    const { rows: clientData } = await dbPool.query(`
      SELECT client_id FROM clients WHERE id = $1
    `, [clientId]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const tcClientId = clientData[0].client_id;
    
    if (!tcClientId) {
      return res.status(400).json({ error: 'Client does not have a TutorCruncher ID' });
    }
    
    if (!tutorCruncherAPI) {
      return res.status(500).json({ error: 'TutorCruncher API not available' });
    }
    
    try {
      // Delete note from TutorCruncher
      await tutorCruncherAPI.delete(`/notes/${noteId}/`);
      
      res.json({ 
        success: true,
        message: 'Note deleted successfully from TutorCruncher'
      });
    } catch (tcError) {
      logger.error({ error: tcError.message }, 'Error deleting note from TutorCruncher:');
      res.status(500).json({ 
        error: 'Failed to delete note from TutorCruncher',
        details: tcError.response?.data || tcError.message 
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error deleting TutorCruncher note:');
    res.status(500).json({ 
      error: 'Failed to delete note',
      details: error.message 
    });
  }
}));

// Get Missive communications for a client
router.get('/:clientId/missive-communications', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get client email from local database
    const { rows: clientData } = await dbPool.query(`
      SELECT email, first_name, last_name FROM clients WHERE id = $1
    `, [clientId]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const clientEmail = clientData[0].email;
    
    if (!clientEmail) {
      return res.json({ communications: [], message: 'Client does not have an email address' });
    }
    
    // Check if Missive API is configured
    const MISSIVE_API_KEY = process.env.MISSIVE_API_KEY;
    const MISSIVE_API_BASE = process.env.MISSIVE_API_BASE || 'https://public.missiveapp.com/v1';
    
    if (!MISSIVE_API_KEY) {
      return res.json({ 
        communications: [], 
        message: 'Missive API not configured',
        error: 'Please set MISSIVE_API_KEY and MISSIVE_API_BASE environment variables'
      });
    }
    
    // Sanitize Missive token
    const CLEAN_MISSIVE_TOKEN = MISSIVE_API_KEY
      .replace(/[\r\n]+/g, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();
    
    if (!CLEAN_MISSIVE_TOKEN) {
      return res.json({ 
        communications: [], 
        message: 'Missive API key is empty',
        error: 'Please check your MISSIVE_API_KEY environment variable'
      });
    }
    
    const communications = [];
    
    try {
      const axios = require('axios');
      const missiveAPI = axios.create({
        baseURL: MISSIVE_API_BASE,
        headers: {
          'Authorization': `Bearer ${CLEAN_MISSIVE_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });
      
      // Fetch Missive communications from our database (stored via webhooks)
      // Search by: client_email match, client_id match, from_address match, to_addresses array,
      // or client email mentioned in message_preview/message_subject (for internal booking notifications)

      const { rows: missiveComms } = await dbPool.query(`
        SELECT
          id,
          missive_conversation_id,
          missive_message_id,
          rule_type,
          conversation_subject as subject,
          message_subject,
          message_preview as preview,
          from_name,
          from_address as "from",
          to_addresses as participants,
          message_type,
          message_delivered_at as delivered_at,
          message_created_at as created_at,
          message_updated_at as updated_at,
          email_message_id,
          comment_text,
          comment_author,
          webhook_data
        FROM missive_communications
        WHERE LOWER(client_email) = LOWER($1)
           OR client_id = $2
           OR LOWER(from_address) = LOWER($1)
           OR LOWER($1) = ANY(SELECT LOWER(unnest(to_addresses)))
           OR message_preview ILIKE '%' || $1 || '%'
           OR message_subject ILIKE '%' || $1 || '%'
        ORDER BY COALESCE(message_created_at, created_at) DESC
        LIMIT 100
      `, [clientEmail, clientId]);
      
      logger.info('✅ Found ${missiveComms.length} Missive communications from webhook data for client ${clientId} (${clientEmail})');
      
      // Convert database rows to conversation format
      const conversations = missiveComms.map(comm => {
        // Extract full email body from webhook_data if available
        let fullBody = null;
        if (comm.webhook_data) {
          const webhookData = typeof comm.webhook_data === 'string'
            ? JSON.parse(comm.webhook_data)
            : comm.webhook_data;

          // Try to get the message body from various possible locations
          const message = webhookData.message ||
                         webhookData.messages?.[0] ||
                         webhookData.latest_message;
          if (message) {
            // Prefer plain text body, fall back to HTML
            fullBody = message.body || message.text_body || message.html_body || message.preview;
          }
          // For comments, use the comment body
          const comment = webhookData.comment || webhookData.latest_comment;
          if (comment && !fullBody) {
            fullBody = comment.body || comment.text;
          }
        }

        return {
          id: comm.missive_conversation_id,
          conversation_id: comm.missive_conversation_id,
          message_id: comm.missive_message_id,
          type: comm.message_type || (comm.rule_type === 'new_comment' ? 'comment' : 'email'),
          rule_type: comm.rule_type, // incoming_email, new_comment, etc.
          subject: comm.subject || comm.message_subject || (comm.rule_type === 'new_comment' ? 'Comment' : 'Email'),
          title: comm.subject || comm.message_subject || (comm.rule_type === 'new_comment' ? 'Comment' : 'Email'),
          preview: comm.comment_text || comm.preview, // Use comment_text for comments, preview for emails
          body: comm.comment_text || fullBody || comm.preview, // Full body for expansion
          comment_text: comm.comment_text, // Full comment text
          comment_author: comm.comment_author, // Comment author
          participants: comm.participants || [],
          from: comm.from,
          from_name: comm.comment_author || comm.from_name, // Use comment_author for comments
          created_at: comm.created_at,
          updated_at: comm.updated_at || comm.created_at,
          delivered_at: comm.delivered_at,
          status: 'delivered', // Assume delivered if we have it
          message_count: 1, // Each row is one message
          source: 'missive_webhook'
        };
      });
      
      // Format conversations for frontend
      for (const conv of conversations) {
        const participants = conv.participants || [];
        const participantEmails = participants.map(p => {
          return typeof p === 'string' ? p : (p.email || p.address || p);
        });
        
        communications.push({
          id: conv.id || conv.conversation_id,
          type: 'conversation',
          rule_type: conv.rule_type, // incoming_email, outgoing_email, new_comment
          subject: conv.subject || conv.title || 'Conversation',
          title: conv.subject || conv.title || 'Conversation',
          participants: participantEmails,
          from: conv.from, // sender email address
          from_name: conv.from_name, // sender name
          created_at: conv.created_at || conv.created,
          updated_at: conv.updated_at || conv.updated || conv.last_activity,
          delivered_at: conv.delivered_at, // message delivery timestamp
          status: conv.status || conv.state || 'open',
          message_count: conv.message_count || conv.messages_count || 0,
          preview: conv.preview || conv.last_message_preview || null,
          body: conv.body || null, // Full body content for expansion
          unread_count: conv.unread_count || 0,
          tags: conv.tags || [],
          source: 'missive'
        });
      }
      
      logger.info('✅ Fetched ${communications.length} Missive communications for client ${clientId} (${clientEmail})');
      
      // Sort by updated_at (most recent first)
      communications.sort((a, b) => {
        const dateA = a.updated_at ? new Date(a.updated_at) : new Date(0);
        const dateB = b.updated_at ? new Date(b.updated_at) : new Date(0);
        return dateB - dateA;
      });
      
      res.json({ communications });
    } catch (missiveError) {
      logger.error({ error: missiveError.message }, 'Error fetching Missive communications:');
      logger.error({ error: missiveError.response?.data || missiveError.response?.status }, 'Missive API error details:');
      
      // Return empty array with error message
      res.json({ 
        communications: [], 
        error: missiveError.message,
        details: missiveError.response?.data || 'Unknown error',
        message: 'Failed to fetch communications from Missive API'
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Missive communications:');
    res.status(500).json({ 
      error: 'Failed to fetch Missive communications',
      details: error.message 
    });
  }
}));

// Fetch full message body from Missive API for a specific conversation
// Uses the /messages/:id endpoint which returns full body (unlike /conversations/:id/messages which only returns preview)
router.get('/missive/conversation/:conversationId/body', auth, asyncHandler(async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId } = req.query; // Optional: specific message ID

    const MISSIVE_API_KEY = process.env.MISSIVE_API_KEY;
    const MISSIVE_API_BASE = process.env.MISSIVE_API_BASE || 'https://public.missiveapp.com/v1';

    if (!MISSIVE_API_KEY) {
      return res.status(500).json({ error: 'Missive API not configured' });
    }

    const axios = require('axios');
    const missiveApi = axios.create({
      baseURL: MISSIVE_API_BASE,
      headers: {
        'Authorization': `Bearer ${MISSIVE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Step 1: Get message IDs from conversation (this endpoint only returns preview, not full body)
    const listResponse = await missiveApi.get(`/conversations/${conversationId}/messages`, {
      params: { limit: 10 }
    });

    const messageList = listResponse.data.messages || [];

    if (messageList.length === 0) {
      return res.json({ body: null, message: 'No messages found' });
    }

    // Step 2: Fetch full body using GET /messages/:id endpoint for each message
    // This endpoint returns the complete body HTML, unlike the list endpoint
    const fetchFullMessage = async (msgId) => {
      try {
        const msgResponse = await missiveApi.get(`/messages/${msgId}`);
        return msgResponse.data.messages || msgResponse.data;
      } catch (err) {
        logger.warn({ data: err.message }, 'Failed to fetch full body for message ${msgId}:');
        // Return the preview data if full fetch fails
        const preview = messageList.find(m => m.id === msgId);
        return preview || null;
      }
    };

    // Find the target message ID
    let targetMessageId = messageId;
    if (!targetMessageId) {
      targetMessageId = messageList[0].id; // Most recent message
    }

    // Fetch full body for the target message
    const fullMessage = await fetchFullMessage(targetMessageId);

    // Extract body from full message response
    const body = fullMessage?.body ||
                 fullMessage?.body_html ||
                 fullMessage?.body_plain ||
                 messageList.find(m => m.id === targetMessageId)?.preview ||
                 null;

    logger.info('📧 Fetched Missive message body for conversation ${conversationId}: ${body ? body.length + \' chars\' : \'no body\'}');

    // Fetch full bodies for all messages in parallel (for thread view)
    const allMessagesWithBodies = await Promise.all(
      messageList.map(async (m) => {
        const full = await fetchFullMessage(m.id);
        return {
          id: m.id,
          body: full?.body || full?.body_html || full?.body_plain || m.preview,
          subject: m.subject || full?.subject,
          from: m.from_field || full?.from_field,
          to: m.to_fields || full?.to_fields,
          deliveredAt: m.delivered_at || full?.delivered_at,
          createdAt: m.created_at || full?.created_at
        };
      })
    );

    res.json({
      body,
      messageId: targetMessageId,
      subject: fullMessage?.subject || messageList.find(m => m.id === targetMessageId)?.subject,
      from: fullMessage?.from_field || messageList.find(m => m.id === targetMessageId)?.from_field,
      deliveredAt: fullMessage?.delivered_at || messageList.find(m => m.id === targetMessageId)?.delivered_at,
      allMessages: allMessagesWithBodies
    });
  } catch (error) {
    logger.error({ error: error.response?.data || error.message }, 'Error fetching Missive message body:');
    res.status(500).json({
      error: 'Failed to fetch message body',
      details: error.response?.data || error.message
    });
  }
}));

// Initiate Missive outreach for a prospect
router.post('/:clientId/missive-outreach', auth, asyncHandler(async (req, res) => {
  try {
    const { clientId } = req.params;
    const { template_name, workflow_name } = req.body;
    const dbPool = req.locationPool || pool;
    
    if (!dbPool) {
      return res.status(500).json({ error: 'Database pool not available' });
    }
    
    // Get client data
    const { rows: clientData } = await dbPool.query(`
      SELECT client_id, email, first_name, last_name FROM clients WHERE id = $1
    `, [clientId]);
    
    if (clientData.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const client = clientData[0];
    
    if (!client.email) {
      return res.status(400).json({ error: 'Client does not have an email address' });
    }
    
    // Check if Missive API is configured
    const MISSIVE_API_KEY = process.env.MISSIVE_API_KEY;
    const MISSIVE_API_BASE = process.env.MISSIVE_API_BASE || 'https://public.missiveapp.com/v1';
    
    if (!MISSIVE_API_KEY) {
      return res.status(500).json({ 
        error: 'Missive API not configured',
        message: 'Please set MISSIVE_API_KEY and MISSIVE_API_BASE environment variables'
      });
    }
    
    // Sanitize Missive token (remove newlines, quotes, extra spaces)
    const CLEAN_MISSIVE_TOKEN = MISSIVE_API_KEY
      .replace(/[\r\n]+/g, "")
      .replace(/^['"]|['"]$/g, "")
      .trim();
    
    if (!CLEAN_MISSIVE_TOKEN) {
      return res.status(500).json({ 
        error: 'Missive API key is empty after sanitization',
        message: 'Please check your MISSIVE_API_KEY environment variable'
      });
    }
    
    try {
      const axios = require('axios');
      const missiveAPI = axios.create({
        baseURL: MISSIVE_API_BASE,
        headers: {
          'Authorization': `Bearer ${CLEAN_MISSIVE_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });
      
      const clientName = `${client.first_name || ''} ${client.last_name || ''}`.trim() || 'Prospect';
      
      // Test authentication first with a simple API call
      // Missive API might use different endpoints - try to find the right one
      let authTestResponse = null;
      let authError = null;
      
      // Try multiple authentication test endpoints
      const authTestEndpoints = ['/me', '/user', '/workspace', '/account', '/team'];
      
      for (const endpoint of authTestEndpoints) {
        try {
          authTestResponse = await missiveAPI.get(endpoint);
          logger.info('✅ Missive API authentication successful via ${endpoint}');
          break;
        } catch (err) {
          authError = err;
          // If it's not a 404, it might be an auth error
          if (err.response?.status !== 404) {
            logger.info({ status: err.response?.status, detail: err.response?.data || err.message, endpoint }, 'Auth test failed');
            break;
          }
        }
      }
      
      // If all endpoints failed and we got a 401, return authentication error
      if (!authTestResponse && authError?.response?.status === 401) {
        const errorDetails = authError.response?.data || authError.message;
        const responseData = typeof errorDetails === 'object' ? JSON.stringify(errorDetails, null, 2) : errorDetails;
        
        logger.error({ status: 401, error: responseData, url: authError.config?.url, baseURL: MISSIVE_API_BASE, hasToken: !!CLEAN_MISSIVE_TOKEN, tokenLength: CLEAN_MISSIVE_TOKEN.length }, '❌ Missive API authentication failed (401 Unauthorized)');
        
        // Return detailed error information
        return res.status(401).json({
          success: false,
          error: 'Missive API authentication failed',
          message: 'Invalid API token. The token provided is not valid or has been revoked.',
          details: responseData,
          troubleshooting: [
            '1. Verify your API token in Missive: Settings > API',
            '2. Generate a new API token if the current one is invalid',
            '3. Check that the token has not expired or been revoked',
            '4. Ensure there are no extra spaces, quotes, or newlines in the token',
            '5. Verify the token is copied correctly (no leading/trailing whitespace)',
            '6. Check that MISSIVE_API_BASE is correct (default: https://api.missiveapp.com/v1)',
            '7. Verify your Missive account has API access enabled',
            '8. Check Heroku logs for more details: heroku logs --app acme-ops-main --num=50'
          ],
          debug_info: {
            baseURL: MISSIVE_API_BASE,
            tokenLength: CLEAN_MISSIVE_TOKEN.length,
            testedEndpoints: authTestEndpoints
          },
          client: {
            name: clientName,
            email: client.email,
            client_id: client.client_id
          }
        });
      }
      
      // If we got a different error, log it but continue (might be endpoint-specific)
      if (!authTestResponse && authError && authError.response?.status !== 404) {
        logger.warn({ status: authError.response?.status, error: authError.response?.data || authError.message }, '⚠️ Missive API authentication test had issues - will attempt to create conversation anyway');
      }
      
      // Try to find or create a contact in Missive
      let contactResponse;
      try {
        // Missive API might use different endpoints - try multiple approaches
        // Option 1: Search contacts by email
        let searchResponse;
        try {
          searchResponse = await missiveAPI.get('/contacts', {
            params: {
              email: client.email
            }
          });
        } catch (searchError) {
          // Option 2: Try searching in a different way
          try {
            searchResponse = await missiveAPI.get(`/contacts?email=${encodeURIComponent(client.email)}`);
          } catch (searchError2) {
            logger.info('⚠️ Contact search not available, skipping contact creation');
            searchResponse = null;
          }
        }
        
        if (searchResponse?.data) {
          const contacts = searchResponse.data.contacts || searchResponse.data.data || searchResponse.data || [];
          if (Array.isArray(contacts) && contacts.length > 0) {
            contactResponse = contacts[0];
            logger.info('✅ Found existing Missive contact');
          } else {
            // Create new contact
            try {
              const createResponse = await missiveAPI.post('/contacts', {
                email: client.email,
                first_name: client.first_name,
                last_name: client.last_name,
                name: clientName
              });
              contactResponse = createResponse.data;
              logger.info('✅ Created new Missive contact');
            } catch (createError) {
              logger.error({ error: createError.response?.data || createError.message }, '⚠️ Failed to create contact:');
              // Continue without contact
            }
          }
        }
      } catch (contactError) {
        logger.error({ error: contactError.response?.data || contactError.message }, '⚠️ Error with Missive contact:');
        // Continue without contact if contact API fails
      }
      
      // Try different conversation creation methods
      let conversationResponse;
      let conversationCreated = false;
      
      // Method 1: Try creating a conversation with participants
      try {
        conversationResponse = await missiveAPI.post('/conversations', {
          participants: [client.email],
          subject: `Outreach: ${clientName}`,
          body: workflow_name ? `Starting ${workflow_name} workflow for ${clientName}` : `Outreach initiated for ${clientName}`,
          tags: ['prospect-outreach', 'client-conversion-tracker']
        });
        conversationCreated = true;
        logger.info('✅ Created Missive conversation via /conversations');
      } catch (convError1) {
        // Method 2: Try creating a draft message
        try {
          conversationResponse = await missiveAPI.post('/drafts', {
            to: [client.email],
            subject: `Outreach: ${clientName}`,
            body: workflow_name ? `Starting ${workflow_name} workflow for ${clientName}` : `Outreach initiated for ${clientName}`
          });
          conversationCreated = true;
          logger.info('✅ Created Missive draft via /drafts');
        } catch (draftError) {
          // Method 3: Try creating a message directly
          try {
            conversationResponse = await missiveAPI.post('/messages', {
              to: client.email,
              subject: `Outreach: ${clientName}`,
              body: workflow_name ? `Starting ${workflow_name} workflow for ${clientName}` : `Outreach initiated for ${clientName}`
            });
            conversationCreated = true;
            logger.info('✅ Created Missive message via /messages');
          } catch (messageError) {
            // All methods failed - return error with details
            const allErrors = {
              conversation: convError1.response?.data || convError1.message,
              draft: draftError.response?.data || draftError.message,
              message: messageError.response?.data || messageError.message
            };
            
            logger.error({ err: allErrors }, '❌ All Missive API methods failed:');
            
            return res.status(500).json({
              success: false,
              error: 'Failed to create Missive conversation',
              message: 'Unable to create conversation using available Missive API endpoints',
              details: allErrors,
              troubleshooting: [
                '1. Verify your Missive API token has the necessary permissions',
                '2. Check Missive API documentation for the correct endpoint structure',
                '3. Ensure your Missive account has API access enabled',
                '4. Check Heroku logs for detailed error messages',
                `5. Manual action: Start outreach for ${clientName} (${client.email}) in Missive`
              ],
              client: {
                name: clientName,
                email: client.email,
                client_id: client.client_id
              }
            });
          }
        }
      }
      
      res.json({
        success: true,
        message: `Outreach initiated for ${clientName}`,
        conversation: conversationResponse.data,
        client: {
          name: clientName,
          email: client.email,
          client_id: client.client_id
        }
      });
    } catch (error) {
      logger.error({ err: error }, 'Error initiating Missive outreach:');
      res.status(500).json({ 
        error: 'Failed to initiate Missive outreach',
        details: error.response?.data || error.message,
        message: 'Please check Missive API configuration'
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error initiating Missive outreach:');
    res.status(500).json({ 
      error: 'Failed to initiate Missive outreach',
      details: error.message 
    });
  }
}));

// Get all bundle purchases
router.get('/bundles', auth, asyncHandler(async (req, res) => {
  try {
    // Check table and column existence in parallel (both are independent cached lookups)
    const [bundleTableExists, marketColumns] = await Promise.all([
      tableExists(pool, 'client_bundle_purchases'),
      columnsExist(pool, 'clients', ['market'])
    ]);

    if (!bundleTableExists) {
      return res.json([]);
    }

    const hasMarketColumn = marketColumns.length > 0;

    // Fetch bundles with client information
    const bundlesQuery = `
      SELECT
        bp.id,
        bp.client_id,
        bp.bundle_name,
        bp.purchase_date,
        bp.bundle_total,
        bp.discount_percentage,
        bp.credit_total,
        bp.source,
        bp.continued_after_bundle,
        bp.created_at,
        bp.updated_at,
        c.first_name,
        c.last_name,
        c.email,
        ${hasMarketColumn ? 'c.market' : 'NULL as market'},
        c.client_id as tutorcruncher_client_id
      FROM client_bundle_purchases bp
      LEFT JOIN clients c ON c.id = bp.client_id
      ORDER BY bp.purchase_date DESC, bp.created_at DESC
    `;

    const result = await pool.query(bundlesQuery);
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching bundles:');
    res.status(500).json({ 
      error: 'Failed to fetch bundles',
      details: error.message 
    });
  }
}));

// Get user's column width preferences for client conversion tracker
router.get('/preferences/column-widths', auth, asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;

    // Check if preferences column exists in users table (cached)
    const prefsColumnExists = (await columnsExist(pool, 'users', ['preferences'])).length > 0;

    if (!prefsColumnExists) {
      // Preferences column doesn't exist, return empty column widths
      return res.json({
        success: true,
        columnWidths: {}
      });
    }

    // Get user preferences from database
    const { rows } = await pool.query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse preferences (handle both JSONB and string formats)
    let preferences = {};
    if (rows[0].preferences) {
      if (typeof rows[0].preferences === 'string') {
        preferences = JSON.parse(rows[0].preferences);
      } else {
        preferences = rows[0].preferences;
      }
    }

    const columnWidths = preferences.clientConversionTracker?.columnWidths || {};
    const version = preferences.clientConversionTracker?.columnWidthsVersion || 1;

    res.json({
      success: true,
      columnWidths,
      version
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching column width preferences:');
    res.status(500).json({
      error: 'Failed to fetch column width preferences',
      details: error.message
    });
  }
}));

// Save user's column width preferences for client conversion tracker
router.put('/preferences/column-widths', auth, asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const { columnWidths, version } = req.body;

    if (!columnWidths || typeof columnWidths !== 'object') {
      return res.status(400).json({ error: 'columnWidths is required and must be an object' });
    }

    // Check if preferences column exists in users table (cached)
    const prefsColumnExists2 = (await columnsExist(pool, 'users', ['preferences'])).length > 0;

    if (!prefsColumnExists2) {
      // Preferences column doesn't exist, return success but don't save
      return res.json({
        success: true,
        message: 'Column widths saved successfully (preferences column not available in this environment)'
      });
    }

    // Get current preferences
    const { rows } = await pool.query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse current preferences (handle both JSONB and string formats)
    let currentPreferences = {};
    if (rows[0].preferences) {
      if (typeof rows[0].preferences === 'string') {
        currentPreferences = JSON.parse(rows[0].preferences);
      } else {
        currentPreferences = rows[0].preferences;
      }
    }
    
    // Update client conversion tracker column widths
    const updatedPreferences = {
      ...currentPreferences,
      clientConversionTracker: {
        ...currentPreferences.clientConversionTracker,
        columnWidths,
        columnWidthsVersion: version || 1
      }
    };

    // Save to database (PostgreSQL JSONB handles this automatically)
    await pool.query(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedPreferences), userId]
    );

    res.json({
      success: true,
      message: 'Column widths saved successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error saving column width preferences:');
    res.status(500).json({
      error: 'Failed to save column width preferences',
      details: error.message
    });
  }
}));

// POST /api/client-conversion-tracker/bundles/create
// Create a bundle (proforma invoice) for a client
router.post('/bundles/create', auth, asyncHandler(async (req, res) => {
  try {
    const {
      clientId,
      bundleName,
      numberOfLessons,
      lessonRate,
      discountPercentage,
      paymentMethod = 'auto_charge' // 'auto_charge', 'cash', 'send_request'
    } = req.body;

    // Validate required fields
    if (!clientId || !bundleName || !numberOfLessons || !lessonRate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['clientId', 'bundleName', 'numberOfLessons', 'lessonRate']
      });
    }

    const numLessons = parseFloat(numberOfLessons);
    const rate = parseFloat(lessonRate);
    const discount = parseFloat(discountPercentage || 0);

    if (isNaN(numLessons) || isNaN(rate) || isNaN(discount)) {
      return res.status(400).json({
        error: 'Invalid numeric values',
        details: 'numberOfLessons, lessonRate, and discountPercentage must be valid numbers'
      });
    }

    // Calculate bundle total (before discount)
    const subtotal = numLessons * rate;
    // Calculate discount amount
    const discountAmount = subtotal * (discount / 100);
    // Calculate bundle total (after discount)
    const bundleTotal = subtotal - discountAmount;
    // Credit total is the full subtotal (lessons * rate) - this is what gets added to their account
    const creditTotal = subtotal;

    logger.info('📦 Creating bundle for client ${clientId}:');
    logger.info('   Bundle Name: ${bundleName}');
    logger.info('   Lessons: ${numLessons} @ $${rate} = $${subtotal}');
    logger.info('   Discount: ${discount}% = $${discountAmount.toFixed(2)}');
    logger.info('   Bundle Total: $${bundleTotal.toFixed(2)}');
    logger.info('   Credit Total: $${creditTotal.toFixed(2)}');

    // Create proforma invoice (credit request) in TutorCruncher
    // Always send payment email for auto_charge and send_request - ensures client can pay
    // even if they don't have a card on file (auto_charge will also try card if available)
    const creditRequestPayload = {
      amount: Number(bundleTotal.toFixed(2)),
      client: parseInt(clientId),
      send_pfi: paymentMethod !== 'cash',
      description: bundleName
    };

    logger.info({ data: JSON.stringify(creditRequestPayload, null, 2) }, '📋 Creating proforma invoice:');
    logger.info('💳 Payment method: ${paymentMethod}');
    
    const creditResponse = await tutorCruncherAPI.post('/proforma-invoices/', creditRequestPayload);
    const creditRequestId = creditResponse.data.id;

    logger.info('✅ Created proforma invoice ID: ${creditRequestId}');

    // Explicitly send payment request email for non-cash methods
    // send_pfi only sets status to Unpaid - doesn't actually trigger the email
    if (paymentMethod !== 'cash') {
      try {
        await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/send_reminder/`);
        logger.info('📧 Payment request email sent to client for proforma invoice ${creditRequestId}');
      } catch (emailErr) {
        logger.error({ error: emailErr.response?.data || emailErr.message }, '⚠️ Failed to send payment request email for ${creditRequestId}:');
      }
    }

    const paymentAmount = Number(bundleTotal.toFixed(2));
    let paymentStatus = 'pending';
    let paymentMessage = '';

    // Handle payment based on selected method
    if (paymentMethod === 'cash') {
      // Mark as paid immediately without charging card (for manual payments)
      logger.info('💵 Marking proforma invoice ${creditRequestId} as paid (cash/manual): $${paymentAmount}');
      
      await tutorCruncherAPI.post(`/proforma-invoices/${creditRequestId}/take_payment/`, {
        amount: paymentAmount,
        method: 'cash',
        send_receipt: false
      });

      paymentStatus = 'paid';
      paymentMessage = `Bundle created and credit added immediately. Payment marked as manual/cash - no card charge.`;
      logger.info('✅ Marked proforma invoice ${creditRequestId} as paid (cash)');
      
    } else if (paymentMethod === 'send_request') {
      paymentStatus = 'pending';
      paymentMessage = `Bundle created. Payment request email sent to client. Credit will be added after client completes payment.`;

    } else {
      // Auto Charge (default) - TC will also try to charge card on file after deferral period
      logger.info('💳 Proforma invoice ${creditRequestId} created for $${paymentAmount} (auto_charge)');

      paymentStatus = 'pending_auto_charge';
      paymentMessage = `Bundle created. Payment request email sent to client. Auto Charge will also attempt to process from card on file after deferral period.`;
    }

    // If there's a discount, add bonus credit as a separate proforma invoice
    // This matches the Ada Walker example where bonus credit is added separately
    let bonusCreditRequestId = null;
    if (discountAmount > 0) {
      try {
        logger.info('🎁 Adding bonus credit: $${discountAmount.toFixed(2)}');
        
        const bonusCreditPayload = {
          amount: Number(discountAmount.toFixed(2)),
          client: parseInt(clientId),
          send_pfi: false,
          description: `Bonus credit for ${bundleName}`
        };

        const bonusCreditResponse = await tutorCruncherAPI.post('/proforma-invoices/', bonusCreditPayload);
        bonusCreditRequestId = bonusCreditResponse.data.id;
        
        logger.info('✅ Created bonus credit proforma invoice ID: ${bonusCreditRequestId}');

        // Bonus credit is always marked as paid immediately (it's free credit)
        // Only mark as paid if main payment was cash/manual, otherwise let auto-charge handle timing
        if (paymentMethod === 'cash') {
          await tutorCruncherAPI.post(`/proforma-invoices/${bonusCreditRequestId}/take_payment/`, {
            amount: Number(discountAmount.toFixed(2)),
            method: 'cash',
            send_receipt: false
          });
          logger.info('✅ Added bonus credit of $${discountAmount.toFixed(2)} to client account (paid)');
        } else {
          // For auto_charge and send_request, bonus credit will be processed with main payment
          // But we can mark it as paid immediately since it's bonus credit
          await tutorCruncherAPI.post(`/proforma-invoices/${bonusCreditRequestId}/take_payment/`, {
            amount: Number(discountAmount.toFixed(2)),
            method: 'cash',
            send_receipt: false
          });
          logger.info('✅ Added bonus credit of $${discountAmount.toFixed(2)} to client account (bonus)');
        }
      } catch (bonusError) {
        logger.error({ error: bonusError.response?.data || bonusError.message }, '⚠️ Failed to add bonus credit:');
        // Don't fail the whole operation if bonus credit fails - main bundle is already created
      }
    }

    // Get client info for database record
    const clientResponse = await tutorCruncherAPI.get(`/clients/${clientId}/`);
    const client = clientResponse.data;
    
    // Determine market from client labels
    const getMarketFromLabels = (labels) => {
      if (!labels || !Array.isArray(labels)) return 'Other';
      for (const label of labels) {
        const labelName = typeof label === 'string' ? label : (label && label.name ? label.name : '');
        if (labelName && labelName.startsWith('Home -')) {
          if (labelName.includes('NYC')) return 'NYC';
          if (labelName.includes('LA')) return 'LA';
          if (labelName.includes('SF')) return 'SF';
          if (labelName.includes('Hamptons')) return 'Hamptons';
          return 'Other';
        }
        if (labelName === 'Online') return 'Online';
        if (labelName && labelName.startsWith('School -')) {
          if (labelName.includes('NYC')) return 'NYC';
          if (labelName.includes('LA')) return 'LA';
          if (labelName.includes('SF')) return 'SF';
          if (labelName.includes('Hamptons')) return 'Hamptons';
          return 'Other';
        }
        if (labelName && labelName.startsWith('Club -')) {
          return 'NYC';
        }
      }
      return 'Other';
    };

    const market = getMarketFromLabels(client.labels);

    // Look up local database client ID from TutorCruncher client ID
    const tcClientId = parseInt(clientId);
    const { rows: localClientRows } = await pool.query(`
      SELECT id, first_name, last_name, email 
      FROM clients 
      WHERE client_id = $1 
      LIMIT 1
    `, [tcClientId]);

    if (localClientRows.length === 0) {
      logger.error('❌ Local client not found for TutorCruncher client ID ${tcClientId}');
      return res.status(404).json({
        error: 'Local client not found',
        message: `No local client record found for TutorCruncher client ID ${tcClientId}. Please ensure the client exists in the system.`
      });
    }

    const localClientId = localClientRows[0].id;
    const localClientFirstName = localClientRows.length > 0 ? localClientRows[0].first_name : (client.first_name || '');
    const localClientLastName = localClientRows.length > 0 ? localClientRows[0].last_name : (client.last_name || '');
    const localClientEmail = localClientRows.length > 0 ? localClientRows[0].email : (client.email || '');

    // Store bundle purchase in database
    const bundleRecord = {
      client_id: localClientId,
      first_name: localClientFirstName,
      last_name: localClientLastName,
      email: localClientEmail,
      bundle_name: bundleName,
      number_of_lessons: numLessons,
      lesson_rate: rate,
      discount_percentage: discount,
      bundle_total: bundleTotal.toFixed(2),
      credit_total: creditTotal.toFixed(2),
      purchase_date: new Date().toISOString().split('T')[0],
      market: market,
      source: 'manual',
      proforma_invoice_id: creditRequestId.toString()
    };

    // Check if columns exist before inserting (cached)
    const bundleColumnSet = await getAllColumns(pool, 'client_bundle_purchases');
    const columnNames = [...bundleColumnSet];
    
    // Build dynamic INSERT query based on available columns
    const insertColumns = ['client_id', 'bundle_name', 'bundle_total', 'credit_total', 'purchase_date', 'discount_percentage', 'source'];
    const insertValues = [
      bundleRecord.client_id,
      bundleRecord.bundle_name,
      bundleRecord.bundle_total,
      bundleRecord.credit_total,
      bundleRecord.purchase_date,
      bundleRecord.discount_percentage,
      bundleRecord.source
    ];

    // Dynamically add optional columns if they exist in the table
    const optionalColumns = {
      market: bundleRecord.market,
      first_name: bundleRecord.first_name,
      last_name: bundleRecord.last_name,
      email: bundleRecord.email,
      number_of_lessons: bundleRecord.number_of_lessons,
      lesson_rate: bundleRecord.lesson_rate,
      proforma_invoice_id: bundleRecord.proforma_invoice_id
    };

    for (const [col, val] of Object.entries(optionalColumns)) {
      if (columnNames.includes(col)) {
        insertColumns.push(col);
        insertValues.push(val);
      }
    }

    const placeholders = insertColumns.map((_, idx) => `$${idx + 1}`).join(', ');

    // Insert into client_bundle_purchases table
    await pool.query(`
      INSERT INTO client_bundle_purchases (
        ${insertColumns.join(', ')}
      ) VALUES (
        ${placeholders}
      )
    `, insertValues);

    logger.info('✅ Bundle purchase saved to database');

    res.json({
      success: true,
      bundle: bundleRecord,
      proformaInvoiceId: creditRequestId,
      bonusCreditRequestId: bonusCreditRequestId,
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      message: paymentMessage || `Bundle created successfully. ${creditTotal.toFixed(2)} credits will be added to client account.`
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error creating bundle:');
    logger.error({ error: error.response?.data || error.message }, 'Error details:');
    
    res.status(500).json({
      error: 'Failed to create bundle',
      message: error.response?.data?.error || error.message || 'Unknown error',
      details: error.response?.data
    });
  }
}));

// GET /analytics/weekly-stats - Get weekly conversion statistics
router.get('/analytics/weekly-stats', auth, asyncHandler(async (req, res) => {
  try {
    // Check if required columns exist (cached)
    const weeklyStatsColumns = await columnsExist(pool, 'clients', [
      'date_tutor_client_paired', 'date_trial_first_lesson', 'archived_at'
    ]);

    const hasDatePaired = weeklyStatsColumns.includes('date_tutor_client_paired');
    const hasDateTrial = weeklyStatsColumns.includes('date_trial_first_lesson');
    const hasArchivedAt = weeklyStatsColumns.includes('archived_at');
    
    if (!hasDatePaired && !hasDateTrial) {
      return res.json({ 
        error: 'Required date columns not found',
        data: []
      });
    }
    
    // Helper function to get week start (Sunday)
    const getWeekStartSQL = (dateColumn) => {
      return `DATE_TRUNC('week', ${dateColumn} + INTERVAL '1 day') - INTERVAL '1 day'`;
    };
    
    // Query for weekly paired clients
    let pairedQuery = '';
    if (hasDatePaired) {
      pairedQuery = `
        SELECT 
          ${getWeekStartSQL('date_tutor_client_paired')} AS week_start,
          COUNT(*) AS paired_count
        FROM clients
        WHERE date_tutor_client_paired IS NOT NULL
          ${hasArchivedAt ? 'AND (archived_at IS NULL OR archived_at IS NOT NULL)' : ''}
        GROUP BY ${getWeekStartSQL('date_tutor_client_paired')}
      `;
    }
    
    // Query for weekly first lessons/trials
    let trialsQuery = '';
    if (hasDateTrial) {
      trialsQuery = `
        SELECT 
          ${getWeekStartSQL('date_trial_first_lesson')} AS week_start,
          COUNT(*) AS trials_count
        FROM clients
        WHERE date_trial_first_lesson IS NOT NULL
          ${hasArchivedAt ? 'AND (archived_at IS NULL OR archived_at IS NOT NULL)' : ''}
        GROUP BY ${getWeekStartSQL('date_trial_first_lesson')}
      `;
    }
    
    // Combine queries
    let combinedQuery = '';
    if (hasDatePaired && hasDateTrial) {
      combinedQuery = `
        WITH paired_weeks AS (${pairedQuery}),
        trial_weeks AS (${trialsQuery})
        SELECT 
          COALESCE(p.week_start, t.week_start) AS week_start,
          COALESCE(p.week_start, t.week_start) + INTERVAL '6 days' AS week_end,
          COALESCE(p.paired_count, 0) AS paired,
          COALESCE(t.trials_count, 0) AS first_lessons_trials
        FROM paired_weeks p
        FULL OUTER JOIN trial_weeks t ON p.week_start = t.week_start
        ORDER BY COALESCE(p.week_start, t.week_start) DESC
        LIMIT 52
      `;
    } else if (hasDatePaired) {
      combinedQuery = `
        SELECT 
          week_start,
          week_start + INTERVAL '6 days' AS week_end,
          paired_count AS paired,
          0 AS first_lessons_trials
        FROM (${pairedQuery}) AS p
        ORDER BY week_start DESC
        LIMIT 52
      `;
    } else if (hasDateTrial) {
      combinedQuery = `
        SELECT 
          week_start,
          week_start + INTERVAL '6 days' AS week_end,
          0 AS paired,
          trials_count AS first_lessons_trials
        FROM (${trialsQuery}) AS t
        ORDER BY week_start DESC
        LIMIT 52
      `;
    } else {
      return res.json({ data: [] });
    }
    
    const { rows } = await pool.query(combinedQuery);
    
    // Format results
    const result = rows.map(row => ({
      week_start: row.week_start ? new Date(row.week_start).toISOString().split('T')[0] : null,
      week_end: row.week_end ? new Date(row.week_end).toISOString().split('T')[0] : null,
      paired: parseInt(row.paired) || 0,
      first_lessons_trials: parseInt(row.first_lessons_trials) || 0,
      paired_yoy: null, // Will be calculated on frontend
      trials_yoy: null  // Will be calculated on frontend
    }));

    res.json({ data: result });
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching weekly stats:');
    res.status(500).json({ 
      error: 'Failed to fetch weekly stats',
      details: error.message 
    });
  }
}));

// GET /analytics/cohort-retention - Get cohort retention analysis data
// Tracks leads from booking forms and their paid invoice activity over time
router.get('/analytics/cohort-retention', auth, asyncHandler(async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      period = 'monthly', // 'monthly' or 'weekly'
      bookingType = 'all',
      leadType = 'all',
      market = 'all',
      leadSource = 'all' // heard_about field: Meta, Google, Friend, etc.
    } = req.query;

    // Validate period
    if (!['monthly', 'weekly'].includes(period)) {
      return res.status(400).json({ error: 'Period must be "monthly" or "weekly"' });
    }

    // Set default date range (12 months ago to today)
    const today = new Date();
    const defaultStartDate = new Date(today);
    defaultStartDate.setMonth(defaultStartDate.getMonth() - 12);

    const queryStartDate = startDate || defaultStartDate.toISOString().split('T')[0];
    const queryEndDate = endDate || today.toISOString().split('T')[0];

    // Build filter conditions for booking_submissions
    const filterConditions = [];
    const filterParams = [queryStartDate, queryEndDate];
    let paramIndex = 3;

    if (bookingType !== 'all') {
      filterConditions.push(`bs.booking_type ILIKE $${paramIndex}`);
      filterParams.push(`%${bookingType}%`);
      paramIndex++;
    }
    if (leadType !== 'all') {
      filterConditions.push(`c.lead_type = $${paramIndex}`);
      filterParams.push(leadType);
      paramIndex++;
    }
    if (market !== 'all') {
      filterConditions.push(`c.market = $${paramIndex}`);
      filterParams.push(market);
      paramIndex++;
    }
    if (leadSource !== 'all') {
      filterConditions.push(`LOWER(COALESCE(bs.heard_about, '')) = LOWER($${paramIndex})`);
      filterParams.push(leadSource);
      paramIndex++;
    }

    const filterClause = filterConditions.length > 0
      ? 'AND ' + filterConditions.join(' AND ')
      : '';

    // Period-specific SQL
    const periodTrunc = period === 'weekly' ? 'week' : 'month';
    const periodInterval = period === 'weekly' ? 604800 : 2592000; // seconds

    // Main cohort retention query
    const query = `
      WITH cohort_base AS (
        -- Get all paid booking submissions with client links
        SELECT DISTINCT ON (bs.tc_client_id)
          bs.id AS submission_id,
          DATE_TRUNC('${periodTrunc}', bs.created_at AT TIME ZONE 'America/New_York') AS cohort_period,
          bs.tc_client_id,
          bs.booking_type,
          c.lead_type,
          c.market,
          bs.created_at AS acquisition_date
        FROM booking_submissions bs
        LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
        WHERE bs.created_at >= $1::date
          AND bs.created_at < ($2::date + INTERVAL '1 day')
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
          ${filterClause}
        ORDER BY bs.tc_client_id, bs.created_at ASC
      ),
      invoice_activity AS (
        -- Get paid invoice activity by period for each client
        SELECT
          i.client_id,
          DATE_TRUNC('${periodTrunc}', i.date_sent AT TIME ZONE 'America/New_York') AS activity_period,
          SUM(i.gross) AS revenue
        FROM invoices i
        WHERE i.status = 'paid'
          AND i.display_id NOT LIKE 'PFI-%'
          AND i.date_sent IS NOT NULL
        GROUP BY i.client_id, DATE_TRUNC('${periodTrunc}', i.date_sent AT TIME ZONE 'America/New_York')
      ),
      cohort_retention AS (
        -- Calculate periods since acquisition for each activity
        SELECT
          cb.cohort_period,
          cb.tc_client_id,
          cb.booking_type,
          cb.lead_type,
          cb.market,
          ia.activity_period,
          ia.revenue,
          ROUND(EXTRACT(EPOCH FROM (ia.activity_period - cb.cohort_period)) / ${periodInterval}) AS periods_since_acquisition
        FROM cohort_base cb
        LEFT JOIN invoice_activity ia ON cb.tc_client_id::text = ia.client_id::text
          AND ia.activity_period >= cb.cohort_period
      ),
      cohort_counts AS (
        -- Count acquired clients per cohort (those we can track with tc_client_id)
        SELECT
          cohort_period,
          COUNT(DISTINCT tc_client_id) AS acquired_trackable
        FROM cohort_base
        GROUP BY cohort_period
      ),
      all_registrations AS (
        -- Count paid/verified registrations per cohort (filtered)
        SELECT
          DATE_TRUNC('${periodTrunc}', bs.created_at AT TIME ZONE 'America/New_York') AS cohort_period,
          COUNT(*) AS acquired_total
        FROM booking_submissions bs
        LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
        WHERE bs.created_at >= $1::date
          AND bs.created_at < ($2::date + INTERVAL '1 day')
          AND bs.payment_status IN ('paid', 'verified')
          ${filterClause}
        GROUP BY DATE_TRUNC('${periodTrunc}', bs.created_at AT TIME ZONE 'America/New_York')
      ),
      retention_data AS (
        -- Get retention data for each cohort/period combination
        SELECT
          cohort_period,
          periods_since_acquisition AS period_offset,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          COALESCE(SUM(revenue), 0) AS total_revenue
        FROM cohort_retention
        WHERE periods_since_acquisition IS NOT NULL
          AND periods_since_acquisition >= 0
          AND periods_since_acquisition <= 12
        GROUP BY cohort_period, periods_since_acquisition
      )
      SELECT
        TO_CHAR(COALESCE(ar.cohort_period, cc.cohort_period), ${period === 'weekly' ? "'IYYY-\"W\"IW'" : "'YYYY-MM'"}) AS cohort_label,
        COALESCE(ar.cohort_period, cc.cohort_period) AS cohort_period,
        COALESCE(ar.acquired_total, 0) AS acquired,
        COALESCE(cc.acquired_trackable, 0) AS acquired_trackable,
        rd.period_offset,
        COALESCE(rd.active_clients, 0) AS active_clients,
        COALESCE(rd.total_revenue, 0) AS total_revenue
      FROM all_registrations ar
      FULL OUTER JOIN cohort_counts cc ON ar.cohort_period = cc.cohort_period
      LEFT JOIN retention_data rd ON COALESCE(ar.cohort_period, cc.cohort_period) = rd.cohort_period
      ORDER BY COALESCE(ar.cohort_period, cc.cohort_period) DESC, rd.period_offset ASC
    `;

    const { rows } = await pool.query(query, filterParams);

    // Process rows into cohort structure
    const cohortsMap = new Map();
    rows.forEach(row => {
      const cohortKey = row.cohort_label;
      if (!cohortsMap.has(cohortKey)) {
        cohortsMap.set(cohortKey, {
          cohort_period: cohortKey,
          cohort_date: row.cohort_period,
          acquired: parseInt(row.acquired) || 0,           // Total registrations
          acquired_trackable: parseInt(row.acquired_trackable) || 0, // Those with tc_client_id
          retention: []
        });
      }

      if (row.period_offset !== null) {
        const cohort = cohortsMap.get(cohortKey);
        // Use acquired_trackable for percentage calculations since we can only track those
        cohort.retention.push({
          period: parseInt(row.period_offset),
          active: parseInt(row.active_clients) || 0,
          revenue: parseFloat(row.total_revenue) || 0,
          pct: cohort.acquired_trackable > 0
            ? parseFloat(((parseInt(row.active_clients) / cohort.acquired_trackable) * 100).toFixed(1))
            : 0
        });
      }
    });

    // Sort retention periods within each cohort
    const cohorts = Array.from(cohortsMap.values()).map(cohort => {
      cohort.retention.sort((a, b) => a.period - b.period);
      return cohort;
    });

    // Calculate summary stats
    const totalAcquired = cohorts.reduce((sum, c) => sum + c.acquired, 0);

    // Count converted (had activity in period 0 or later)
    const totalConverted = cohorts.reduce((sum, c) => {
      const m0 = c.retention.find(r => r.period === 0);
      return sum + (m0 ? m0.active : 0);
    }, 0);

    // Calculate avg retention at M3/W12
    const referenceOffset = period === 'weekly' ? 12 : 3;
    const cohortsWithReference = cohorts.filter(c =>
      c.retention.some(r => r.period === referenceOffset)
    );
    const avgRetention = cohortsWithReference.length > 0
      ? parseFloat((
          cohortsWithReference.reduce((sum, c) => {
            const ref = c.retention.find(r => r.period === referenceOffset);
            return sum + (ref ? ref.pct : 0);
          }, 0) / cohortsWithReference.length
        ).toFixed(1))
      : 0;

    // Fetch available filter options
    const filterOptionsQuery = `
      SELECT DISTINCT
        bs.booking_type,
        c.lead_type,
        c.market,
        bs.heard_about
      FROM booking_submissions bs
      LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
      WHERE bs.payment_status IN ('paid', 'verified')
        AND bs.tc_client_id IS NOT NULL
    `;
    const filterOptionsResult = await pool.query(filterOptionsQuery);

    const bookingTypes = [...new Set(filterOptionsResult.rows.map(r => r.booking_type).filter(Boolean))].sort();
    const leadTypes = [...new Set(filterOptionsResult.rows.map(r => r.lead_type).filter(Boolean))].sort();
    const markets = [...new Set(filterOptionsResult.rows.map(r => r.market).filter(Boolean))].sort();
    const leadSources = [...new Set(filterOptionsResult.rows.map(r => r.heard_about).filter(Boolean))].sort();

    res.json({
      summary: {
        total_acquired: totalAcquired,
        total_converted: totalConverted,
        overall_conversion_rate: totalAcquired > 0
          ? parseFloat(((totalConverted / totalAcquired) * 100).toFixed(1))
          : 0,
        avg_retention_reference: avgRetention,
        reference_label: period === 'weekly' ? 'W12' : 'M3'
      },
      cohorts,
      filters: {
        bookingTypes,
        leadTypes,
        markets,
        leadSources
      },
      params: {
        startDate: queryStartDate,
        endDate: queryEndDate,
        period,
        bookingType,
        leadType,
        market,
        leadSource
      }
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching cohort retention data:');
    res.status(500).json({
      error: 'Failed to fetch cohort retention data',
      details: error.message
    });
  }
}));

// GET /analytics/cohort-retention/clients - Get individual clients for a specific cohort/period cell
router.get('/analytics/cohort-retention/clients', auth, asyncHandler(async (req, res) => {
  try {
    const {
      cohortPeriod, // e.g., "2025-09" or "2025-W36"
      periodOffset = 0, // Which retention period (0 = acquisition month)
      period = 'monthly',
      bookingType = 'all',
      leadType = 'all',
      market = 'all',
      leadSource = 'all' // heard_about field
    } = req.query;

    if (!cohortPeriod) {
      return res.status(400).json({ error: 'cohortPeriod is required' });
    }

    // Parse cohort period to get date range
    let cohortStartDate, cohortEndDate;
    if (period === 'weekly') {
      // Parse "2025-W36" format
      const match = cohortPeriod.match(/(\d{4})-W(\d{1,2})/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid weekly cohort period format. Use YYYY-WNN' });
      }
      const [, year, week] = match;
      // Calculate the start of the ISO week
      const jan4 = new Date(parseInt(year), 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      const isoWeek1Start = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
      cohortStartDate = new Date(isoWeek1Start.getTime() + (parseInt(week) - 1) * 7 * 86400000);
      cohortEndDate = new Date(cohortStartDate.getTime() + 7 * 86400000);
    } else {
      // Parse "2025-09" format
      const match = cohortPeriod.match(/(\d{4})-(\d{2})/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid monthly cohort period format. Use YYYY-MM' });
      }
      const [, year, month] = match;
      cohortStartDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      cohortEndDate = new Date(parseInt(year), parseInt(month), 1);
    }

    // Build filter conditions
    const filterConditions = [];
    const filterParams = [
      cohortStartDate.toISOString().split('T')[0],
      cohortEndDate.toISOString().split('T')[0],
      parseInt(periodOffset)
    ];
    let paramIndex = 4;

    if (bookingType !== 'all') {
      filterConditions.push(`bs.booking_type ILIKE $${paramIndex}`);
      filterParams.push(`%${bookingType}%`);
      paramIndex++;
    }
    if (leadType !== 'all') {
      filterConditions.push(`c.lead_type = $${paramIndex}`);
      filterParams.push(leadType);
      paramIndex++;
    }
    if (market !== 'all') {
      filterConditions.push(`c.market = $${paramIndex}`);
      filterParams.push(market);
      paramIndex++;
    }
    if (leadSource !== 'all') {
      filterConditions.push(`LOWER(COALESCE(bs.heard_about, '')) = LOWER($${paramIndex})`);
      filterParams.push(leadSource);
      paramIndex++;
    }

    const filterClause = filterConditions.length > 0
      ? 'AND ' + filterConditions.join(' AND ')
      : '';

    const periodTrunc = period === 'weekly' ? 'week' : 'month';
    const periodInterval = period === 'weekly' ? 604800 : 2592000;

    logger.info({ cohortPeriod, periodOffset, period, leadSource, cohortStartDate: cohortStartDate.toISOString().split('T')[0], cohortEndDate: cohortEndDate.toISOString().split('T')[0] }, '[Cohort Clients] Query params');

    const query = `
      WITH cohort_base AS (
        SELECT DISTINCT ON (bs.tc_client_id)
          bs.id AS submission_id,
          DATE_TRUNC('${periodTrunc}', bs.created_at AT TIME ZONE 'America/New_York') AS cohort_period,
          bs.tc_client_id,
          bs.booking_type,
          bs.created_at AS acquisition_date,
          c.first_name,
          c.last_name,
          c.email,
          c.lead_type,
          c.market,
          c.labels,
          bs.utm
        FROM booking_submissions bs
        LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
        WHERE bs.created_at >= $1::date
          AND bs.created_at < $2::date
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
          ${filterClause}
        ORDER BY bs.tc_client_id, bs.created_at ASC
      ),
      client_invoice_totals AS (
        SELECT
          i.client_id,
          COUNT(*) AS total_invoices,
          SUM(i.gross) AS total_revenue,
          MIN(i.date_sent) AS first_payment_date,
          MAX(i.date_sent) AS last_payment_date
        FROM invoices i
        WHERE i.status = 'paid'
          AND i.display_id NOT LIKE 'PFI-%'
        GROUP BY i.client_id
      ),
      period_activity AS (
        SELECT
          i.client_id,
          SUM(i.gross) AS period_revenue
        FROM invoices i
        JOIN cohort_base cb ON cb.tc_client_id::text = i.client_id::text
        WHERE i.status = 'paid'
          AND i.display_id NOT LIKE 'PFI-%'
          AND ROUND(EXTRACT(EPOCH FROM (
            DATE_TRUNC('${periodTrunc}', i.date_sent AT TIME ZONE 'America/New_York') - cb.cohort_period
          )) / ${periodInterval}) = $3
        GROUP BY i.client_id
      )
      SELECT
        cb.submission_id,
        cb.tc_client_id,
        cb.acquisition_date,
        cb.first_name || ' ' || cb.last_name AS parent_name,
        cb.email AS parent_email,
        cb.booking_type,
        cb.lead_type,
        cb.market,
        cb.labels,
        cb.utm,
        COALESCE(cit.total_revenue, 0) AS total_revenue,
        COALESCE(cit.total_invoices, 0) AS invoice_count,
        cit.first_payment_date,
        cit.last_payment_date,
        COALESCE(pa.period_revenue, 0) AS period_revenue
      FROM cohort_base cb
      LEFT JOIN client_invoice_totals cit ON cb.tc_client_id::text = cit.client_id::text
      LEFT JOIN period_activity pa ON cb.tc_client_id::text = pa.client_id::text
      WHERE ($3 = 0 OR pa.client_id IS NOT NULL)
      ORDER BY cb.acquisition_date DESC
    `;

    const { rows } = await pool.query(query, filterParams);

    // Parse labels and utm data
    const clients = rows.map(row => {
      let label = null;
      try {
        let labels = row.labels;
        if (typeof labels === 'string') {
          labels = JSON.parse(labels);
        }
        if (labels && Array.isArray(labels) && labels.length > 0) {
          label = labels[0]?.name || null;
        }
      } catch (e) {
        // Ignore parse errors
      }

      let utmCampaign = null;
      if (row.utm) {
        try {
          const utm = typeof row.utm === 'string' ? JSON.parse(row.utm) : row.utm;
          utmCampaign = utm?.utm_campaign || null;
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        submission_id: row.submission_id,
        tc_client_id: row.tc_client_id,
        acquisition_date: row.acquisition_date,
        parent_name: row.parent_name,
        parent_email: row.parent_email,
        booking_type: row.booking_type,
        label,
        lead_type: row.lead_type,
        market: row.market,
        utm_campaign: utmCampaign,
        total_revenue: parseFloat(row.total_revenue) || 0,
        invoice_count: parseInt(row.invoice_count) || 0,
        first_payment_date: row.first_payment_date,
        last_payment_date: row.last_payment_date,
        period_revenue: parseFloat(row.period_revenue) || 0
      };
    });

    res.json({
      cohortPeriod,
      periodOffset: parseInt(periodOffset),
      period,
      clientCount: clients.length,
      clients
    });
  } catch (error) {
    logger.error({ error: error.message }, '❌ Error fetching cohort clients:');
    logger.error({ error: error.stack }, 'Stack:');
    res.status(500).json({
      error: 'Failed to fetch cohort clients',
      details: error.message
    });
  }
}));

// GET /analytics/cohort-retention/acquired - Get all registrations for a specific cohort period
router.get('/analytics/cohort-retention/acquired', auth, asyncHandler(async (req, res) => {
  try {
    const {
      cohortPeriod, // e.g., "2025-09" or "2025-W36"
      period = 'monthly',
      search = '',
      sortBy = 'created_at',
      sortOrder = 'desc',
      bookingType = 'all',
      leadType = 'all',
      market = 'all',
      leadSource = 'all' // heard_about field
    } = req.query;

    if (!cohortPeriod) {
      return res.status(400).json({ error: 'cohortPeriod is required' });
    }

    // Parse cohort period to get date range
    let cohortStartDate, cohortEndDate;
    if (period === 'weekly') {
      // Parse "2025-W36" format
      const match = cohortPeriod.match(/(\d{4})-W(\d{1,2})/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid weekly cohort period format. Use YYYY-WNN' });
      }
      const [, year, week] = match;
      const jan4 = new Date(parseInt(year), 0, 4);
      const dayOfWeek = jan4.getDay() || 7;
      const isoWeek1Start = new Date(jan4.getTime() - (dayOfWeek - 1) * 86400000);
      cohortStartDate = new Date(isoWeek1Start.getTime() + (parseInt(week) - 1) * 7 * 86400000);
      cohortEndDate = new Date(cohortStartDate.getTime() + 7 * 86400000);
    } else {
      // Parse "2025-09" format
      const match = cohortPeriod.match(/(\d{4})-(\d{2})/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid monthly cohort period format. Use YYYY-MM' });
      }
      const [, year, month] = match;
      cohortStartDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      cohortEndDate = new Date(parseInt(year), parseInt(month), 1);
    }

    // Valid sort columns
    const validSortColumns = {
      'created_at': 'bs.created_at',
      'booking_type': 'bs.booking_type',
      'parent_name': "COALESCE(bs.parent_first, '') || ' ' || COALESCE(bs.parent_last, '')",
      'actual_price': 'bs.actual_price',
      'lead_type': 'c.lead_type',
      'market': 'c.market'
    };

    const sortColumn = validSortColumns[sortBy] || 'bs.created_at';
    const sortDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

    // Build search and filter conditions
    const filterConditions = [];
    const params = [
      cohortStartDate.toISOString().split('T')[0],
      cohortEndDate.toISOString().split('T')[0]
    ];
    let paramIndex = 3;

    if (search && search.trim()) {
      filterConditions.push(`(
        bs.parent_first ILIKE $${paramIndex}
        OR bs.parent_last ILIKE $${paramIndex}
        OR bs.parent_email ILIKE $${paramIndex}
        OR bs.booking_type ILIKE $${paramIndex}
        OR c.lead_type ILIKE $${paramIndex}
        OR c.market ILIKE $${paramIndex}
        OR bs.heard_about ILIKE $${paramIndex}
      )`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }
    if (bookingType !== 'all') {
      filterConditions.push(`bs.booking_type ILIKE $${paramIndex}`);
      params.push(`%${bookingType}%`);
      paramIndex++;
    }
    if (leadType !== 'all') {
      filterConditions.push(`c.lead_type = $${paramIndex}`);
      params.push(leadType);
      paramIndex++;
    }
    if (market !== 'all') {
      filterConditions.push(`c.market = $${paramIndex}`);
      params.push(market);
      paramIndex++;
    }
    if (leadSource !== 'all') {
      filterConditions.push(`LOWER(COALESCE(bs.heard_about, '')) = LOWER($${paramIndex})`);
      params.push(leadSource);
      paramIndex++;
    }

    const filterClause = filterConditions.length > 0
      ? 'AND ' + filterConditions.join(' AND ')
      : '';

    logger.info({ cohortPeriod, period, leadSource, cohortStartDate: cohortStartDate.toISOString().split('T')[0], cohortEndDate: cohortEndDate.toISOString().split('T')[0], sortColumn, sortDir }, '[Acquired] Query params');

    const query = `
      SELECT
        bs.id AS submission_id,
        bs.created_at,
        bs.booking_type,
        bs.parent_first,
        bs.parent_last,
        bs.parent_email,
        bs.parent_phone,
        bs.actual_price,
        bs.original_price,
        bs.payment_status,
        bs.tc_client_id,
        bs.tc_service_id,
        bs.utm,
        bs.label_name,
        c.lead_type,
        c.market,
        c.labels AS client_labels,
        CASE WHEN bs.tc_client_id IS NOT NULL THEN true ELSE false END AS has_tc_link
      FROM booking_submissions bs
      LEFT JOIN clients c ON c.client_id = bs.tc_client_id::text
      WHERE bs.created_at >= $1::date
        AND bs.created_at < $2::date
        AND bs.payment_status IN ('paid', 'verified')
        ${filterClause}
      ORDER BY ${sortColumn} ${sortDir}
    `;

    logger.info('[Acquired] Executing query...');
    const { rows } = await pool.query(query, params);
    logger.info({ rows: rows.length }, '[Acquired] Query returned');

    // Process and format results
    const registrations = rows.map(row => {
      let utmData = null;
      if (row.utm) {
        try {
          utmData = typeof row.utm === 'string' ? JSON.parse(row.utm) : row.utm;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Get label - prefer booking_submissions.label_name, fallback to client's labels
      let label = row.label_name || null;
      if (!label && row.client_labels) {
        try {
          const labels = typeof row.client_labels === 'string' ? JSON.parse(row.client_labels) : row.client_labels;
          if (Array.isArray(labels) && labels.length > 0) {
            label = labels[0]?.name || null;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        submission_id: row.submission_id,
        created_at: row.created_at,
        booking_type: row.booking_type,
        label,
        parent_name: `${row.parent_first || ''} ${row.parent_last || ''}`.trim(),
        parent_email: row.parent_email,
        parent_phone: row.parent_phone,
        actual_price: parseFloat(row.actual_price) || 0,
        original_price: parseFloat(row.original_price) || 0,
        payment_status: row.payment_status,
        tc_client_id: row.tc_client_id,
        tc_service_id: row.tc_service_id,
        has_tc_link: row.has_tc_link,
        lead_type: row.lead_type,
        market: row.market,
        utm_source: utmData?.utm_source || null,
        utm_medium: utmData?.utm_medium || null,
        utm_campaign: utmData?.utm_campaign || null
      };
    });

    // Calculate summary stats by booking type
    const bookingTypeSummary = {};
    registrations.forEach(reg => {
      const type = reg.booking_type || 'Unknown';
      if (!bookingTypeSummary[type]) {
        bookingTypeSummary[type] = { count: 0, revenue: 0 };
      }
      bookingTypeSummary[type].count++;
      bookingTypeSummary[type].revenue += reg.actual_price;
    });

    const summary = {
      total_count: registrations.length,
      total_revenue: registrations.reduce((sum, r) => sum + r.actual_price, 0),
      with_tc_link: registrations.filter(r => r.has_tc_link).length,
      without_tc_link: registrations.filter(r => !r.has_tc_link).length,
      by_booking_type: Object.entries(bookingTypeSummary).map(([type, data]) => ({
        booking_type: type,
        count: data.count,
        revenue: data.revenue
      })).sort((a, b) => b.count - a.count)
    };

    res.json({
      cohortPeriod,
      period,
      summary,
      registrations
    });
  } catch (error) {
    logger.error({ error: error.message }, '❌ Error fetching cohort acquired registrations:');
    logger.error({ error: error.stack }, 'Stack:');
    res.status(500).json({
      error: 'Failed to fetch cohort acquired registrations',
      details: error.message
    });
  }
}));

// ============================================================================
// MISSIVE SYNC ENDPOINTS
// ============================================================================

// Sync recent messages from Missive API (captures outgoing emails)
router.post('/missive/sync', auth, asyncHandler(async (req, res) => {
  try {
    const missiveSyncService = require('../services/missive-sync-service');

    if (!missiveSyncService.isConfigured()) {
      return res.status(400).json({
        error: 'Missive API not configured',
        message: 'MISSIVE_API_KEY environment variable is not set'
      });
    }

    const { conversationLimit = 50, messageLimit = 10, verbose = false } = req.body;

    logger.info('📧 Starting Missive sync (requested by ${req.user?.email || \'unknown\'})...');

    const stats = await missiveSyncService.syncRecentMessages({
      conversationLimit: Math.min(conversationLimit, 50),
      messageLimit: Math.min(messageLimit, 10),
      verbose
    });

    res.json({
      success: true,
      message: 'Missive sync completed',
      stats
    });
  } catch (error) {
    logger.error({ error: error.message }, '❌ Error syncing Missive:');
    res.status(500).json({
      error: 'Failed to sync Missive',
      details: error.message
    });
  }
}));

// Get Missive sync status and stats
router.get('/missive/stats', auth, asyncHandler(async (req, res) => {
  try {
    const dbPool = req.locationPool || pool;

    const { rows: stats } = await dbPool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN rule_type = 'incoming_email' THEN 1 END) as incoming,
        COUNT(CASE WHEN rule_type = 'outgoing_email' THEN 1 END) as outgoing,
        COUNT(CASE WHEN rule_type = 'new_comment' THEN 1 END) as comments,
        COUNT(CASE WHEN sync_source = 'webhook' THEN 1 END) as from_webhook,
        COUNT(CASE WHEN sync_source = 'api_poll' THEN 1 END) as from_api,
        COUNT(CASE WHEN client_email IS NOT NULL THEN 1 END) as with_client_email,
        MIN(message_delivered_at) as oldest_message,
        MAX(message_delivered_at) as newest_message
      FROM missive_communications
    `);

    res.json({
      stats: stats[0],
      configured: !!process.env.MISSIVE_API_KEY
    });
  } catch (error) {
    logger.error({ error: error.message }, '❌ Error fetching Missive stats:');
    res.status(500).json({
      error: 'Failed to fetch Missive stats',
      details: error.message
    });
  }
}));

// ==========================================
// Lead Scoring Endpoints
// ==========================================

// Get lead score details for a prospect
router.get('/:id/lead-score', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(`
    SELECT lead_score, lead_score_tier, lead_score_reasoning,
           lead_score_components, lead_score_updated_at, lead_score_stale
    FROM clients WHERE id = $1
  `, [id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Prospect not found' });
  }
  res.json(rows[0]);
}));

// Get score history for a prospect
router.get('/:id/lead-score/history', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(`
    SELECT score, tier, components, reasoning, trigger_event, scored_at
    FROM lead_score_history
    WHERE client_id = $1
    ORDER BY scored_at DESC
    LIMIT 20
  `, [id]);
  res.json(rows);
}));

// Manually trigger re-score for a single prospect
router.post('/:id/lead-score/rescore', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const { rows } = await pool.query(`
    SELECT c.id, c.client_id, c.first_name, c.last_name, c.email, c.mobile, c.phone,
           c.market, c.lead_type, c.labels, c.status, c.prospect_status,
           c.date_registration_complete,
           c.date_tutor_client_paired, c.date_tutor_client_paired_scheduled,
           c.date_trial_first_lesson, c.trial_follow_up_completed,
           c.first_paid_lesson_scheduled, c.first_paid_lesson_completed,
           c.manual_intake, c.intake_notes, c.intake_source, c.follow_up_due_at,
           c.assigned_tutor_id, c.assigned_tutor_name, c.created_at,
           c.lead_score, c.lead_score_updated_at, c.pipeline_stage_id,
           bs.heard_about, bs.utm, bs.landing_url, bs.referrer, bs.booking_type,
           bs.actual_price, bs.original_price, bs.created_at as submission_created_at,
           ps.name as pipeline_stage, ps.order_index as stage_order
    FROM clients c
    LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text
    LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
    WHERE c.id = $1 AND c.status = 'prospect'
  `, [id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Prospect not found' });
  }

  const scoringService = new LeadScoringService(pool);
  const result = await scoringService.scoreProspect(rows[0], 'manual_rescore');
  res.json(result);
}));

// ─── Tutor Matching ───────────────────────────────────────────────

router.get('/:id/recommended-tutors', auth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit, 10) || 5;

  const matchingService = new TutorMatchingService(pool);
  const recommendations = await matchingService.getRecommendations(parseInt(id, 10), limit);

  res.json({ recommendations });
}));

module.exports = router;
