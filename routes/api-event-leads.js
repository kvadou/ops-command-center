const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { pool } = global;
const router = express.Router();

// POST /api/event-leads - Create a new event lead (local storage only, no TutorCruncher)
router.post('/', asyncHandler(async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      studentFirstName,
      studentLastName,
      students, // New: array of {firstName, lastName} for multiple students
      program,
      format,
      notes,
      eventName,
      eventId
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !phone) {
      return res.status(400).json({
        error: 'First name, last name, email, and phone are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Please provide a valid email address'
      });
    }

    logger.info(`📝 Storing event lead: ${firstName} ${lastName} (${email}) for event: ${eventName}`);

    // Build student names string for storage
    // Support both old format (studentFirstName/studentLastName) and new format (students array)
    let studentNames = '';
    if (students && Array.isArray(students) && students.length > 0) {
      studentNames = students
        .filter(s => s.firstName?.trim() || s.lastName?.trim())
        .map(s => `${s.firstName?.trim() || ''} ${s.lastName?.trim() || ''}`.trim())
        .join(', ');
    } else if (studentFirstName || studentLastName) {
      studentNames = `${studentFirstName?.trim() || ''} ${studentLastName?.trim() || ''}`.trim();
    }

    // Store event lead in local database
    const result = await pool.query(`
      INSERT INTO event_leads (
        first_name, last_name, email, phone,
        program_interest, format_preference, event_name, event_id, notes,
        student_names,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
      RETURNING id
    `, [
      firstName,
      lastName,
      email,
      phone,
      program || null,
      format || null,
      eventName || 'Unknown Event',
      eventId || null,
      notes || '',
      studentNames || null
    ]);

    const leadId = result.rows[0].id;
    logger.info(`✅ Stored event lead #${leadId} in local database`);

    res.status(201).json({
      success: true,
      leadId: leadId,
      message: 'Event lead captured successfully'
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error storing event lead:');

    res.status(500).json({
      error: 'Failed to save your information. Please try again.',
      message: error.message
    });
  }
}));

// GET /api/event-leads - Get all event leads (for admin purposes)
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, eventName } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        el.*,
        c.status as client_status,
        c.calendar_colour,
        c.labels
      FROM event_leads el
      LEFT JOIN clients c ON el.client_id = c.client_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (eventName) {
      paramCount++;
      query += ` AND el.event_name ILIKE $${paramCount}`;
      params.push(`%${eventName}%`);
    }

    query += ` ORDER BY el.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM event_leads el WHERE 1=1';
    const countParams = [];
    let countParamCount = 0;

    if (eventName) {
      countParamCount++;
      countQuery += ` AND el.event_name ILIKE $${countParamCount}`;
      countParams.push(`%${eventName}%`);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      leads: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    logger.error({ err: error }, '❌ Error fetching event leads:');
    res.status(500).json({
      error: 'Failed to fetch event leads',
      message: error.message
    });
  }
}));

// GET /api/event-leads/events-summary - distinct events with counts
// Includes both: event forms created (from booking_types) AND events with leads
router.get('/events-summary', asyncHandler(async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH lead_stats AS (
        -- Get lead statistics grouped by event
        SELECT
          COALESCE(event_name, 'Unknown Event') AS event_name,
          COALESCE(event_id, '') AS event_id,
          COUNT(*) AS total,
          SUM(CASE WHEN followed_up THEN 1 ELSE 0 END) AS followed_up_count,
          MIN(created_at) AS first_submission,
          MAX(created_at) AS last_submission
        FROM event_leads
        GROUP BY event_name, event_id
      ),
      combined AS (
        -- Event forms from booking_types (may have 0 leads)
        SELECT
          COALESCE(bt.event_name, bt.name) AS event_name,
          bt.id::text AS event_id,
          COALESCE(ls.total, 0)::int AS total,
          COALESCE(ls.followed_up_count, 0)::int AS followed_up_count,
          COALESCE(ls.first_submission, bt.created_at) AS first_submission,
          ls.last_submission,
          bt.created_at AS form_created_at,
          true AS has_form
        FROM booking_types bt
        LEFT JOIN lead_stats ls ON ls.event_name = COALESCE(bt.event_name, bt.name)
        WHERE bt.is_event_lead_capture = true

        UNION

        -- Leads that may not have a matching booking_type form
        SELECT
          ls.event_name,
          ls.event_id,
          ls.total::int,
          ls.followed_up_count::int,
          ls.first_submission,
          ls.last_submission,
          ls.first_submission AS form_created_at,
          false AS has_form
        FROM lead_stats ls
        WHERE NOT EXISTS (
          SELECT 1 FROM booking_types bt
          WHERE bt.is_event_lead_capture = true
            AND COALESCE(bt.event_name, bt.name) = ls.event_name
        )
      )
      SELECT DISTINCT ON (event_name)
        event_name,
        event_id,
        total,
        followed_up_count,
        first_submission,
        last_submission,
        has_form
      FROM combined
      ORDER BY event_name, last_submission DESC NULLS LAST
    `);

    // Re-sort by most recent activity
    rows.sort((a, b) => {
      const dateA = a.last_submission || a.first_submission;
      const dateB = b.last_submission || b.first_submission;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateB) - new Date(dateA);
    });

    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching events summary:');
    res.status(500).json({ error: 'Failed to fetch events summary' });
  }
}));

// GET /api/event-leads/by-event?eventId=...&eventName=...
router.get('/by-event', asyncHandler(async (req, res) => {
  try {
    const { eventId, eventName } = req.query;
    const clauses = [];
    const params = [];
    let idx = 1;
    if (eventId) { clauses.push(`event_id = $${idx++}`); params.push(eventId); }
    if (eventName) { clauses.push(`event_name ILIKE $${idx++}`); params.push(`%${eventName}%`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`
      SELECT id, client_id, first_name, last_name, email, phone, notes,
             student_names, program_interest, format_preference, event_name, event_id,
             followed_up, followed_up_at, follow_up_notes, created_at
      FROM event_leads
      ${where}
      ORDER BY created_at DESC
    `, params);
    res.json(rows);
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching event leads by event:');
    res.status(500).json({ error: 'Failed to fetch event leads' });
  }
}));

// PUT /api/event-leads/:leadId/followup - mark followed up and optional notes
// Supports both id (new) and client_id (legacy) for lookups
router.put('/:leadId/followup', asyncHandler(async (req, res) => {
  try {
    const { leadId } = req.params;
    const { followed_up = true, follow_up_notes = '' } = req.body || {};

    // Try to find by id first, then by client_id for backwards compatibility
    const { rows } = await pool.query(`
      UPDATE event_leads
      SET followed_up = $2,
          followed_up_at = CASE WHEN $2 = TRUE THEN NOW() ELSE followed_up_at END,
          follow_up_notes = $3,
          updated_at = NOW()
      WHERE id = $1 OR client_id = $1::int
      RETURNING *
    `, [leadId, !!followed_up, follow_up_notes]);

    if (!rows.length) return res.status(404).json({ error: 'Lead not found' });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err: err }, '❌ Error updating follow-up:');
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
}));

// DELETE /api/event-leads/form/:id - Delete an event lead form (booking_type)
router.delete('/form/:id', asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // First verify it's an event lead capture form
    const checkResult = await pool.query(
      'SELECT id, name, event_name FROM booking_types WHERE id = $1 AND is_event_lead_capture = true',
      [id]
    );

    if (!checkResult.rows.length) {
      return res.status(404).json({ error: 'Event form not found' });
    }

    const form = checkResult.rows[0];

    // Delete the booking_type
    await pool.query('DELETE FROM booking_types WHERE id = $1', [id]);

    logger.info(`✅ Deleted event form: ${form.event_name || form.name} (id: ${id})`);

    res.json({
      success: true,
      message: `Event form "${form.event_name || form.name}" deleted successfully`,
      deletedId: id
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error deleting event form:');
    res.status(500).json({ error: 'Failed to delete event form' });
  }
}));

// DELETE /api/event-leads/legacy - Delete legacy event leads by event name
// Used for events that only have leads but no form (has_form = false)
router.delete('/legacy', asyncHandler(async (req, res) => {
  try {
    const { event_name } = req.body;

    if (!event_name) {
      return res.status(400).json({ error: 'event_name is required' });
    }

    // Count leads before deletion for logging
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM event_leads WHERE event_name = $1',
      [event_name]
    );
    const leadCount = parseInt(countResult.rows[0].count, 10);

    if (leadCount === 0) {
      return res.status(404).json({ error: 'No leads found for this event' });
    }

    // Delete all leads for this event
    await pool.query('DELETE FROM event_leads WHERE event_name = $1', [event_name]);

    logger.info(`✅ Deleted ${leadCount} legacy event leads for: ${event_name}`);

    res.json({
      success: true,
      message: `Deleted ${leadCount} lead(s) for event "${event_name}"`,
      deletedCount: leadCount
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error deleting legacy event leads:');
    res.status(500).json({ error: 'Failed to delete legacy event leads' });
  }
}));

// DELETE /api/event-leads/:leadId - Delete an individual event lead
router.delete('/:leadId', asyncHandler(async (req, res) => {
  const { leadId } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM event_leads WHERE id = $1 RETURNING id, first_name, last_name, event_name',
      [leadId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    const deleted = result.rows[0];
    logger.info({ leadId, name: `${deleted.first_name} ${deleted.last_name}`, event: deleted.event_name }, 'Deleted individual event lead');
    res.json({ success: true, deleted });
  } catch (err) {
    logger.error({ err }, 'Error deleting event lead');
    res.status(500).json({ error: 'Failed to delete event lead' });
  }
}));

module.exports = router;
