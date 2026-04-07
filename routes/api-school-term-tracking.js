/**
 * School Term Tracking API
 *
 * Endpoints for managing school metadata and per-term renewal workflow.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth: auth } = require('../middleware/auth');
const { cloudinary } = global;

// Configure multer for memory storage (upload to Cloudinary, not disk)
const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, JPG, PNG, GIF, DOC, DOCX'), false);
    }
  }
});

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Helper to get current term (e.g., "Spring 2026")
function getCurrentTerm() {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();

  if (month >= 0 && month <= 4) {
    return `Spring ${year}`;
  } else if (month >= 5 && month <= 7) {
    return `Summer ${year}`;
  } else if (month >= 8 && month <= 11) {
    return `Fall ${year}`;
  }
  return `Winter ${year + 1}`;
}

// ============================================
// SCHOOL METADATA ENDPOINTS (Persistent Info)
// ============================================

/**
 * GET /api/school-term-tracking/metadata/:schoolName
 * Get school metadata by name
 */
router.get('/metadata/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;

    const result = await pool.query(
      `SELECT * FROM school_metadata WHERE school_name = $1`,
      [decodeURIComponent(schoolName)]
    );

    if (result.rows.length === 0) {
      // Return empty metadata object if not found (school exists but no metadata yet)
      return res.json({
        school_name: decodeURIComponent(schoolName),
        school_type: 'regular',
        payment_method: null,
        default_lesson_day: null,
        notes: null
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school metadata:');
    res.status(500).json({ error: 'Failed to fetch school metadata', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/metadata/:schoolName
 * Create or update school metadata
 */
router.put('/metadata/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const { school_type, payment_method, default_lesson_day, notes } = req.body;

    const result = await pool.query(
      `INSERT INTO school_metadata (school_name, school_type, payment_method, default_lesson_day, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (school_name)
       DO UPDATE SET
         school_type = COALESCE($2, school_metadata.school_type),
         payment_method = COALESCE($3, school_metadata.payment_method),
         default_lesson_day = COALESCE($4, school_metadata.default_lesson_day),
         notes = COALESCE($5, school_metadata.notes),
         updated_at = NOW()
       RETURNING *`,
      [decodeURIComponent(schoolName), school_type, payment_method, default_lesson_day, notes]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating school metadata:');
    res.status(500).json({ error: 'Failed to update school metadata', details: error.message });
  }
}));

// ============================================
// TERM STATUS ENDPOINTS (Per-Term Workflow)
// ============================================

/**
 * GET /api/school-term-tracking/term-status/:schoolName
 * Get term status for a school (defaults to current term)
 */
router.get('/term-status/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const term = req.query.term || getCurrentTerm();

    const result = await pool.query(
      `SELECT * FROM school_term_status WHERE school_name = $1 AND term = $2`,
      [decodeURIComponent(schoolName), term]
    );

    if (result.rows.length === 0) {
      // Return empty status object if not found (can be auto-populated)
      return res.json({
        school_name: decodeURIComponent(schoolName),
        term,
        school_confirmed: false,
        tutor_assigned: false,
        contract_signed: false,
        job_created: false,
        roster_connected: false,
        contract_value: null,
        sessions_count: null,
        lesson_days: null,
        notes: null
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching term status:');
    res.status(500).json({ error: 'Failed to fetch term status', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/term-status/:schoolName
 * Create or update term status for a school
 */
router.put('/term-status/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const {
      term = getCurrentTerm(),
      school_confirmed,
      tutor_assigned,
      contract_signed,
      job_created,
      roster_connected,
      contract_value,
      sessions_count,
      lesson_days,
      notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO school_term_status (
         school_name, term, school_confirmed, tutor_assigned, contract_signed,
         job_created, roster_connected, contract_value, sessions_count, lesson_days, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (school_name, term)
       DO UPDATE SET
         school_confirmed = COALESCE($3, school_term_status.school_confirmed),
         tutor_assigned = COALESCE($4, school_term_status.tutor_assigned),
         contract_signed = COALESCE($5, school_term_status.contract_signed),
         job_created = COALESCE($6, school_term_status.job_created),
         roster_connected = COALESCE($7, school_term_status.roster_connected),
         contract_value = COALESCE($8, school_term_status.contract_value),
         sessions_count = COALESCE($9, school_term_status.sessions_count),
         lesson_days = COALESCE($10, school_term_status.lesson_days),
         notes = COALESCE($11, school_term_status.notes),
         updated_at = NOW()
       RETURNING *`,
      [
        decodeURIComponent(schoolName), term, school_confirmed, tutor_assigned,
        contract_signed, job_created, roster_connected, contract_value,
        sessions_count, lesson_days, notes
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating term status:');
    res.status(500).json({ error: 'Failed to update term status', details: error.message });
  }
}));

/**
 * PATCH /api/school-term-tracking/term-status/:schoolName/checkbox
 * Quick update for a single checkbox (for UI toggle)
 */
router.patch('/term-status/:schoolName/checkbox', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const { term = getCurrentTerm(), field, value } = req.body;

    // Validate field name to prevent SQL injection
    const allowedFields = ['school_confirmed', 'tutor_assigned', 'contract_signed', 'job_created', 'roster_connected'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field name' });
    }

    // First, ensure record exists
    await pool.query(
      `INSERT INTO school_term_status (school_name, term)
       VALUES ($1, $2)
       ON CONFLICT (school_name, term) DO NOTHING`,
      [decodeURIComponent(schoolName), term]
    );

    // Then update the specific field
    const result = await pool.query(
      `UPDATE school_term_status
       SET ${field} = $1, updated_at = NOW()
       WHERE school_name = $2 AND term = $3
       RETURNING *`,
      [value, decodeURIComponent(schoolName), term]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating checkbox:');
    res.status(500).json({ error: 'Failed to update checkbox', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/term-status-bulk
 * Get term status for multiple schools (for list view)
 */
router.get('/term-status-bulk', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const term = req.query.term || getCurrentTerm();

    const result = await pool.query(
      `SELECT * FROM school_term_status WHERE term = $1`,
      [term]
    );

    // Return as a map for easy lookup
    const statusMap = {};
    result.rows.forEach(row => {
      statusMap[row.school_name] = row;
    });

    res.json({
      term,
      statuses: statusMap
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching bulk term status:');
    res.status(500).json({ error: 'Failed to fetch bulk term status', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/metadata-bulk
 * Get metadata for multiple schools (for list view)
 */
router.get('/metadata-bulk', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);

    const result = await pool.query(`SELECT * FROM school_metadata`);

    // Return as a map for easy lookup
    const metadataMap = {};
    result.rows.forEach(row => {
      metadataMap[row.school_name] = row;
    });

    res.json({ metadata: metadataMap });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching bulk metadata:');
    res.status(500).json({ error: 'Failed to fetch bulk metadata', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/available-terms
 * Get list of available terms (for term selector)
 */
router.get('/available-terms', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);

    const result = await pool.query(
      `SELECT DISTINCT term FROM school_term_status ORDER BY term DESC`
    );

    const terms = result.rows.map(r => r.term);

    // Always include current term even if no data
    const currentTerm = getCurrentTerm();
    if (!terms.includes(currentTerm)) {
      terms.unshift(currentTerm);
    }

    res.json({
      currentTerm,
      availableTerms: terms
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching available terms:');
    res.status(500).json({ error: 'Failed to fetch available terms', details: error.message });
  }
}));

// ============================================
// SCHOOL NOTES ENDPOINTS
// ============================================

/**
 * GET /api/school-term-tracking/notes/:schoolName
 * Get notes for a school
 */
router.get('/notes/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;

    const result = await pool.query(
      `SELECT id, content, author, created_at as "createdAt"
       FROM school_notes
       WHERE school_name = $1
       ORDER BY created_at DESC`,
      [decodeURIComponent(schoolName)]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school notes:');
    res.status(500).json({ error: 'Failed to fetch notes', details: error.message });
  }
}));

/**
 * POST /api/school-term-tracking/notes/:schoolName
 * Add a note to a school
 */
router.post('/notes/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const { content } = req.body;

    // Get author from authenticated user
    const author = req.user?.name || req.user?.email || 'Unknown';

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const result = await pool.query(
      `INSERT INTO school_notes (school_name, content, author)
       VALUES ($1, $2, $3)
       RETURNING id, content, author, created_at as "createdAt"`,
      [decodeURIComponent(schoolName), content.trim(), author]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding school note:');
    res.status(500).json({ error: 'Failed to add note', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/notes/:noteId
 * Update a note
 */
router.put('/notes/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { noteId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const result = await pool.query(
      `UPDATE school_notes
       SET content = $1
       WHERE id = $2
       RETURNING id, content, author, created_at as "createdAt"`,
      [content.trim(), noteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating school note:');
    res.status(500).json({ error: 'Failed to update note', details: error.message });
  }
}));

/**
 * DELETE /api/school-term-tracking/notes/:noteId
 * Delete a note
 */
router.delete('/notes/:noteId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { noteId } = req.params;

    const result = await pool.query(
      `DELETE FROM school_notes WHERE id = $1 RETURNING id`,
      [noteId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    res.json({ success: true, id: noteId });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school note:');
    res.status(500).json({ error: 'Failed to delete note', details: error.message });
  }
}));

// ============================================
// SCHOOL CONTACTS ENDPOINTS
// ============================================

/**
 * GET /api/school-term-tracking/contacts/:schoolId
 * Get all contacts for a school (by client_id)
 */
router.get('/contacts/:schoolId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolId } = req.params;

    const result = await pool.query(
      `SELECT id, school_id as "schoolId", name, email, phone, role, is_primary as "isPrimary", created_at as "createdAt"
       FROM school_contacts
       WHERE school_id = $1
       ORDER BY is_primary DESC, name ASC`,
      [schoolId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school contacts:');
    res.status(500).json({ error: 'Failed to fetch contacts', details: error.message });
  }
}));

/**
 * POST /api/school-term-tracking/contacts/:schoolId
 * Create a new contact for a school
 */
router.post('/contacts/:schoolId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolId } = req.params;
    const { name, email, phone, role, isPrimary } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const result = await pool.query(
      `INSERT INTO school_contacts (school_id, name, email, phone, role, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, school_id as "schoolId", name, email, phone, role, is_primary as "isPrimary", created_at as "createdAt"`,
      [schoolId, name.trim(), email.trim(), phone?.trim() || null, role?.trim() || null, isPrimary || false]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error creating school contact:');
    res.status(500).json({ error: 'Failed to create contact', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/contacts/:contactId
 * Update a contact
 */
router.put('/contacts/:contactId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { contactId } = req.params;
    const { name, email, phone, role, isPrimary } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const result = await pool.query(
      `UPDATE school_contacts
       SET name = $1, email = $2, phone = $3, role = $4, is_primary = $5, updated_at = NOW()
       WHERE id = $6
       RETURNING id, school_id as "schoolId", name, email, phone, role, is_primary as "isPrimary", created_at as "createdAt"`,
      [name.trim(), email.trim(), phone?.trim() || null, role?.trim() || null, isPrimary || false, contactId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating school contact:');
    res.status(500).json({ error: 'Failed to update contact', details: error.message });
  }
}));

/**
 * DELETE /api/school-term-tracking/contacts/:contactId
 * Delete a contact
 */
router.delete('/contacts/:contactId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { contactId } = req.params;

    const result = await pool.query(
      `DELETE FROM school_contacts WHERE id = $1 RETURNING id`,
      [contactId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ success: true, id: contactId });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school contact:');
    res.status(500).json({ error: 'Failed to delete contact', details: error.message });
  }
}));

// ============================================
// SCHOOL REQUIREMENTS ENDPOINTS
// ============================================

/**
 * GET /api/school-term-tracking/requirement-types
 * Get all available requirement types
 */
router.get('/requirement-types', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const result = await pool.query(
      `SELECT id, code, name, description, category, display_order as "displayOrder"
       FROM requirement_types
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching requirement types:');
    res.status(500).json({ error: 'Failed to fetch requirement types', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/requirements/:schoolName
 * Get requirements for a specific school
 */
router.get('/requirements/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;

    const result = await pool.query(
      `SELECT
         sr.id, sr.school_name as "schoolName", sr.requirement_code as "requirementCode",
         sr.is_required as "isRequired", sr.notes, sr.created_by as "createdBy",
         sr.created_at as "createdAt", sr.updated_at as "updatedAt",
         rt.name as "requirementName", rt.description as "requirementDescription",
         rt.category, rt.display_order as "displayOrder"
       FROM school_requirements sr
       JOIN requirement_types rt ON sr.requirement_code = rt.code
       WHERE sr.school_name = $1
       ORDER BY rt.display_order ASC, rt.name ASC`,
      [schoolName]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school requirements:');
    res.status(500).json({ error: 'Failed to fetch requirements', details: error.message });
  }
}));

/**
 * POST /api/school-term-tracking/requirements/:schoolName
 * Add a requirement to a school
 */
router.post('/requirements/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const { requirementCode, isRequired = true, notes } = req.body;
    const createdBy = req.user?.email || 'system';

    if (!requirementCode) {
      return res.status(400).json({ error: 'requirementCode is required' });
    }

    const result = await pool.query(
      `INSERT INTO school_requirements (school_name, requirement_code, is_required, notes, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (school_name, requirement_code)
       DO UPDATE SET is_required = $3, notes = $4, updated_at = NOW()
       RETURNING id, school_name as "schoolName", requirement_code as "requirementCode",
                 is_required as "isRequired", notes, created_by as "createdBy", created_at as "createdAt"`,
      [schoolName, requirementCode, isRequired, notes || null, createdBy]
    );

    // Fetch the full requirement with type info
    const fullResult = await pool.query(
      `SELECT
         sr.id, sr.school_name as "schoolName", sr.requirement_code as "requirementCode",
         sr.is_required as "isRequired", sr.notes, sr.created_by as "createdBy",
         sr.created_at as "createdAt", sr.updated_at as "updatedAt",
         rt.name as "requirementName", rt.description as "requirementDescription",
         rt.category, rt.display_order as "displayOrder"
       FROM school_requirements sr
       JOIN requirement_types rt ON sr.requirement_code = rt.code
       WHERE sr.id = $1`,
      [result.rows[0].id]
    );

    res.json(fullResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error adding school requirement:');
    res.status(500).json({ error: 'Failed to add requirement', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/requirements/:requirementId
 * Update a school requirement
 */
router.put('/requirements/:requirementId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { requirementId } = req.params;
    const { isRequired, notes } = req.body;

    const result = await pool.query(
      `UPDATE school_requirements
       SET is_required = COALESCE($1, is_required), notes = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, school_name as "schoolName", requirement_code as "requirementCode",
                 is_required as "isRequired", notes, created_by as "createdBy", created_at as "createdAt"`,
      [isRequired, notes || null, requirementId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requirement not found' });
    }

    // Fetch the full requirement with type info
    const fullResult = await pool.query(
      `SELECT
         sr.id, sr.school_name as "schoolName", sr.requirement_code as "requirementCode",
         sr.is_required as "isRequired", sr.notes, sr.created_by as "createdBy",
         sr.created_at as "createdAt", sr.updated_at as "updatedAt",
         rt.name as "requirementName", rt.description as "requirementDescription",
         rt.category, rt.display_order as "displayOrder"
       FROM school_requirements sr
       JOIN requirement_types rt ON sr.requirement_code = rt.code
       WHERE sr.id = $1`,
      [result.rows[0].id]
    );

    res.json(fullResult.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating school requirement:');
    res.status(500).json({ error: 'Failed to update requirement', details: error.message });
  }
}));

/**
 * DELETE /api/school-term-tracking/requirements/:requirementId
 * Remove a requirement from a school
 */
router.delete('/requirements/:requirementId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { requirementId } = req.params;

    const result = await pool.query(
      `DELETE FROM school_requirements WHERE id = $1 RETURNING id`,
      [requirementId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Requirement not found' });
    }

    res.json({ success: true, id: requirementId });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school requirement:');
    res.status(500).json({ error: 'Failed to delete requirement', details: error.message });
  }
}));

/**
 * POST /api/school-term-tracking/requirements/:schoolName/bulk
 * Add multiple requirements to a school at once
 */
router.post('/requirements/:schoolName/bulk', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;
    const { requirementCodes } = req.body;
    const createdBy = req.user?.email || 'system';

    if (!Array.isArray(requirementCodes) || requirementCodes.length === 0) {
      return res.status(400).json({ error: 'requirementCodes array is required' });
    }

    // Insert all requirements
    for (const code of requirementCodes) {
      await pool.query(
        `INSERT INTO school_requirements (school_name, requirement_code, is_required, created_by)
         VALUES ($1, $2, true, $3)
         ON CONFLICT (school_name, requirement_code) DO NOTHING`,
        [schoolName, code, createdBy]
      );
    }

    // Fetch all requirements for the school
    const result = await pool.query(
      `SELECT
         sr.id, sr.school_name as "schoolName", sr.requirement_code as "requirementCode",
         sr.is_required as "isRequired", sr.notes, sr.created_by as "createdBy",
         sr.created_at as "createdAt", sr.updated_at as "updatedAt",
         rt.name as "requirementName", rt.description as "requirementDescription",
         rt.category, rt.display_order as "displayOrder"
       FROM school_requirements sr
       JOIN requirement_types rt ON sr.requirement_code = rt.code
       WHERE sr.school_name = $1
       ORDER BY rt.display_order ASC, rt.name ASC`,
      [schoolName]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error bulk adding school requirements:');
    res.status(500).json({ error: 'Failed to add requirements', details: error.message });
  }
}));

// ============================================
// TUTOR CERTIFICATION ENDPOINTS
// ============================================

/**
 * GET /api/school-term-tracking/certifications/tutor/:tutorId
 * Get all certifications for a specific tutor
 */
router.get('/certifications/tutor/:tutorId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { tutorId } = req.params;

    const result = await pool.query(
      `SELECT
         tc.id, tc.tutor_id as "tutorId", tc.tutor_name as "tutorName", tc.tutor_email as "tutorEmail",
         tc.requirement_code as "requirementCode", tc.school_name as "schoolName",
         tc.file_name as "fileName", tc.file_path as "filePath", tc.file_size as "fileSize",
         tc.file_type as "fileType", tc.status, tc.issue_date as "issueDate",
         tc.expiration_date as "expirationDate", tc.certificate_number as "certificateNumber",
         tc.issuing_authority as "issuingAuthority", tc.notes,
         tc.reviewed_by as "reviewedBy", tc.reviewed_at as "reviewedAt",
         tc.uploaded_by as "uploadedBy", tc.created_at as "createdAt",
         rt.name as "requirementName", rt.category
       FROM tutor_certifications tc
       JOIN requirement_types rt ON tc.requirement_code = rt.code
       WHERE tc.tutor_id = $1
       ORDER BY rt.display_order ASC, tc.created_at DESC`,
      [tutorId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching tutor certifications:');
    res.status(500).json({ error: 'Failed to fetch certifications', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/certifications/school/:schoolName
 * Get all certifications for tutors at a specific school
 */
router.get('/certifications/school/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;

    const result = await pool.query(
      `SELECT
         tc.id, tc.tutor_id as "tutorId", tc.tutor_name as "tutorName", tc.tutor_email as "tutorEmail",
         tc.requirement_code as "requirementCode", tc.school_name as "schoolName",
         tc.file_name as "fileName", tc.file_path as "filePath", tc.file_size as "fileSize",
         tc.file_type as "fileType", tc.status, tc.issue_date as "issueDate",
         tc.expiration_date as "expirationDate", tc.certificate_number as "certificateNumber",
         tc.issuing_authority as "issuingAuthority", tc.notes,
         tc.reviewed_by as "reviewedBy", tc.reviewed_at as "reviewedAt",
         tc.uploaded_by as "uploadedBy", tc.created_at as "createdAt",
         rt.name as "requirementName", rt.category
       FROM tutor_certifications tc
       JOIN requirement_types rt ON tc.requirement_code = rt.code
       WHERE tc.school_name = $1 OR tc.school_name IS NULL
       ORDER BY tc.tutor_name ASC, rt.display_order ASC`,
      [schoolName]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school certifications:');
    res.status(500).json({ error: 'Failed to fetch certifications', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/certifications/compliance/:schoolName
 * Get compliance status for all tutors at a school
 */
router.get('/certifications/compliance/:schoolName', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { schoolName } = req.params;

    // Get school requirements
    const reqResult = await pool.query(
      `SELECT requirement_code FROM school_requirements WHERE school_name = $1`,
      [schoolName]
    );
    const requiredCodes = reqResult.rows.map(r => r.requirement_code);

    if (requiredCodes.length === 0) {
      return res.json({ tutors: [], requirements: [] });
    }

    // Get all certifications for this school (including universal ones)
    const certResult = await pool.query(
      `SELECT
         tc.tutor_id as "tutorId", tc.tutor_name as "tutorName", tc.tutor_email as "tutorEmail",
         tc.requirement_code as "requirementCode", tc.status,
         tc.expiration_date as "expirationDate", tc.id as "certificationId"
       FROM tutor_certifications tc
       WHERE (tc.school_name = $1 OR tc.school_name IS NULL)
         AND tc.requirement_code = ANY($2)
       ORDER BY tc.tutor_name ASC`,
      [schoolName, requiredCodes]
    );

    // Group by tutor
    const tutorMap = {};
    for (const cert of certResult.rows) {
      if (!tutorMap[cert.tutorId]) {
        tutorMap[cert.tutorId] = {
          tutorId: cert.tutorId,
          tutorName: cert.tutorName,
          tutorEmail: cert.tutorEmail,
          certifications: {}
        };
      }
      tutorMap[cert.tutorId].certifications[cert.requirementCode] = {
        status: cert.status,
        expirationDate: cert.expirationDate,
        certificationId: cert.certificationId,
        isExpired: cert.expirationDate && new Date(cert.expirationDate) < new Date()
      };
    }

    // Calculate compliance for each tutor
    const tutors = Object.values(tutorMap).map(tutor => {
      const completedCount = requiredCodes.filter(code => {
        const cert = tutor.certifications[code];
        return cert && cert.status === 'approved' && !cert.isExpired;
      }).length;

      return {
        ...tutor,
        completedCount,
        totalRequired: requiredCodes.length,
        isCompliant: completedCount === requiredCodes.length
      };
    });

    res.json({
      tutors,
      requirements: requiredCodes
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching compliance:');
    res.status(500).json({ error: 'Failed to fetch compliance', details: error.message });
  }
}));

/**
 * POST /api/school-term-tracking/certifications
 * Upload a new certification
 */
router.post('/certifications', auth, certUpload.single('file'), asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);

    const {
      tutorId,
      tutorName,
      tutorEmail,
      requirementCode,
      schoolName,
      issueDate,
      expirationDate,
      certificateNumber,
      issuingAuthority,
      notes
    } = req.body;

    if (!tutorId || !requirementCode) {
      return res.status(400).json({ error: 'tutorId and requirementCode are required' });
    }

    const uploadedBy = req.user?.email || 'system';

    // Upload to Cloudinary if file provided
    let fileUrl = null;
    if (req.file) {
      const isImage = req.file.mimetype.startsWith('image/');
      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'acme-ops/certifications', resource_type: isImage ? 'image' : 'raw', use_filename: true, unique_filename: true },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      fileUrl = uploadResult.secure_url;
    }

    const result = await pool.query(
      `INSERT INTO tutor_certifications (
        tutor_id, tutor_name, tutor_email, requirement_code, school_name,
        file_name, file_path, file_size, file_type,
        status, issue_date, expiration_date, certificate_number, issuing_authority,
        notes, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (tutor_id, requirement_code, COALESCE(school_name, ''))
      DO UPDATE SET
        file_name = EXCLUDED.file_name,
        file_path = EXCLUDED.file_path,
        file_size = EXCLUDED.file_size,
        file_type = EXCLUDED.file_type,
        issue_date = EXCLUDED.issue_date,
        expiration_date = EXCLUDED.expiration_date,
        certificate_number = EXCLUDED.certificate_number,
        issuing_authority = EXCLUDED.issuing_authority,
        notes = EXCLUDED.notes,
        status = 'pending',
        reviewed_by = NULL,
        reviewed_at = NULL,
        updated_at = NOW()
      RETURNING *`,
      [
        tutorId,
        tutorName || null,
        tutorEmail || null,
        requirementCode,
        schoolName || null,
        req.file?.originalname || null,
        fileUrl,
        req.file?.size || null,
        req.file?.mimetype || null,
        'pending',
        issueDate || null,
        expirationDate || null,
        certificateNumber || null,
        issuingAuthority || null,
        notes || null,
        uploadedBy
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error uploading certification:');
    res.status(500).json({ error: 'Failed to upload certification', details: error.message });
  }
}));

/**
 * PUT /api/school-term-tracking/certifications/:id
 * Update a certification (status, notes, etc.)
 */
router.put('/certifications/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { id } = req.params;
    const { status, notes, issueDate, expirationDate, certificateNumber, issuingAuthority } = req.body;
    const reviewedBy = req.user?.email || 'system';

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (status !== undefined) {
      paramCount++;
      updates.push(`status = $${paramCount}`);
      values.push(status);

      // If approving or rejecting, set reviewed info
      if (status === 'approved' || status === 'rejected') {
        paramCount++;
        updates.push(`reviewed_by = $${paramCount}`);
        values.push(reviewedBy);
        paramCount++;
        updates.push(`reviewed_at = $${paramCount}`);
        values.push(new Date());
      }
    }
    if (notes !== undefined) {
      paramCount++;
      updates.push(`notes = $${paramCount}`);
      values.push(notes);
    }
    if (issueDate !== undefined) {
      paramCount++;
      updates.push(`issue_date = $${paramCount}`);
      values.push(issueDate || null);
    }
    if (expirationDate !== undefined) {
      paramCount++;
      updates.push(`expiration_date = $${paramCount}`);
      values.push(expirationDate || null);
    }
    if (certificateNumber !== undefined) {
      paramCount++;
      updates.push(`certificate_number = $${paramCount}`);
      values.push(certificateNumber || null);
    }
    if (issuingAuthority !== undefined) {
      paramCount++;
      updates.push(`issuing_authority = $${paramCount}`);
      values.push(issuingAuthority || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    paramCount++;
    values.push(id);

    const result = await pool.query(
      `UPDATE tutor_certifications
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error({ err: error }, 'Error updating certification:');
    res.status(500).json({ error: 'Failed to update certification', details: error.message });
  }
}));

/**
 * DELETE /api/school-term-tracking/certifications/:id
 * Delete a certification
 */
router.delete('/certifications/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { id } = req.params;

    // Get file path before deleting
    const certResult = await pool.query(
      'SELECT file_path FROM tutor_certifications WHERE id = $1',
      [id]
    );

    if (certResult.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    // Delete from database
    await pool.query('DELETE FROM tutor_certifications WHERE id = $1', [id]);

    // Delete from Cloudinary
    const filePath = certResult.rows[0].file_path;
    if (filePath?.includes('cloudinary.com')) {
      const match = filePath.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
      if (match) {
        const isImage = filePath.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        await cloudinary.uploader.destroy(match[1], { resource_type: isImage ? 'image' : 'raw' })
          .catch(e => logger.warn({ data: e.message }, 'Cloudinary delete failed:'));
      }
    }

    res.json({ success: true, id });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting certification:');
    res.status(500).json({ error: 'Failed to delete certification', details: error.message });
  }
}));

/**
 * GET /api/school-term-tracking/certifications/:id/download
 * Download a certification file
 */
router.get('/certifications/:id/download', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { id } = req.params;

    const result = await pool.query(
      'SELECT file_name, file_path FROM tutor_certifications WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Certification not found' });
    }

    const cert = result.rows[0];
    if (!cert.file_path) {
      return res.status(404).json({ error: 'No file attached to this certification' });
    }

    // file_path is a Cloudinary URL — redirect to it
    if (cert.file_path?.startsWith('http')) {
      return res.redirect(cert.file_path);
    }
    // Legacy: local file path
    return res.status(404).json({ error: 'File stored on local disk and no longer available. Please re-upload.' });
  } catch (error) {
    logger.error({ err: error }, 'Error downloading certification:');
    res.status(500).json({ error: 'Failed to download certification', details: error.message });
  }
}));

module.exports = router;
