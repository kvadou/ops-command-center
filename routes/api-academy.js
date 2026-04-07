const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { asyncHandler } = require('../middleware/error-handler');
const AcademyCoachService = require('../services/academy-coach-service');
const AcademyEmailService = require('../services/academy-email-service');
const cache = require('../utils/cache');
const { logger } = require('../utils/logger');

// Database connection - handle local development vs production
const isLocal = process.env.DATABASE_URL?.includes('localhost') ||
                process.env.DATABASE_URL?.includes('127.0.0.1');

const needsSSL = !isLocal && process.env.DATABASE_URL &&
  (process.env.DATABASE_URL.includes('rds.amazonaws.com') ||
   process.env.DATABASE_URL.includes('cluster-') ||
   /postgres:\/\/[a-z]{10,}:[^@]+@/.test(process.env.DATABASE_URL));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

// Initialize services
const coachService = new AcademyCoachService(pool);
const emailService = new AcademyEmailService(pool);

/**
 * Helper to get franchise_id from request
 * Uses company name or hostname to determine franchise
 */
async function getFranchiseId(req) {
  const hostname = req.get('host') || req.hostname || '';
  const subdomain = hostname.split('.')[0].toLowerCase();

  // Check for franchise-specific environment
  if (process.env.FRANCHISE_ID && process.env.FRANCHISE_ID !== 'main') {
    return process.env.FRANCHISE_ID;
  }

  // Check subdomain
  if (['eastside', 'westside', 'windermere'].includes(subdomain)) {
    return subdomain;
  }

  // Default to main
  return 'main';
}

/**
 * Check if request is from main branch (franchisor)
 */
async function isMainBranch(req) {
  const franchiseId = await getFranchiseId(req);
  return franchiseId === 'main' ||
         req.get('host')?.includes('localhost') ||
         req.get('host')?.includes('acme-ops-main');
}

// ============================================
// PROGRAMS
// ============================================

/**
 * GET /api/academy/programs
 * List all active programs
 */
router.get('/programs', asyncHandler(async (req, res) => {
  const cacheKey = 'academy:programs';

  const programs = await cache.getOrSet(cacheKey, async () => {
    const result = await pool.query(`
      SELECT id, slug, title, description, total_points, is_active, created_at
      FROM academy_programs
      WHERE is_active = true
      ORDER BY created_at ASC
    `);
    return result.rows;
  }, 300); // 5 minutes

  res.json(programs);
}));

/**
 * GET /api/academy/programs/:slugOrId
 * Get a specific program with its phases
 */
router.get('/programs/:slugOrId', asyncHandler(async (req, res) => {
  const { slugOrId } = req.params;

  // Try to find by slug or id
  const programResult = await pool.query(`
    SELECT id, slug, title, description, total_points, is_active, created_at
    FROM academy_programs
    WHERE slug = $1 OR id::text = $1
  `, [slugOrId]);

  if (programResult.rows.length === 0) {
    return res.status(404).json({ error: 'Program not found' });
  }

  const program = programResult.rows[0];

  // Get phases for this program
  const phasesResult = await pool.query(`
    SELECT id, program_id, phase_number, title, description, duration_days,
           unlock_requirements, badge_on_complete, points_on_complete, display_order
    FROM academy_phases
    WHERE program_id = $1
    ORDER BY phase_number ASC
  `, [program.id]);

  program.phases = phasesResult.rows;

  res.json(program);
}));

// ============================================
// PHASES
// ============================================

/**
 * GET /api/academy/phases/:id
 * Get a phase with its modules
 */
router.get('/phases/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const phaseResult = await pool.query(`
    SELECT p.*, prog.title as program_title, prog.slug as program_slug
    FROM academy_phases p
    JOIN academy_programs prog ON p.program_id = prog.id
    WHERE p.id = $1
  `, [id]);

  if (phaseResult.rows.length === 0) {
    return res.status(404).json({ error: 'Phase not found' });
  }

  const phase = phaseResult.rows[0];

  // Get modules for this phase
  const modulesResult = await pool.query(`
    SELECT id, phase_id, slug, title, description, content_type, content,
           video_url, video_provider, attachments, points_value, is_required,
           is_gate, display_order
    FROM academy_modules
    WHERE phase_id = $1
    ORDER BY display_order ASC, id ASC
  `, [id]);

  phase.modules = modulesResult.rows;

  res.json(phase);
}));

// ============================================
// MODULES
// ============================================

/**
 * GET /api/academy/modules/:id
 * Get a module with its content and checklist items (if applicable)
 */
router.get('/modules/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const moduleResult = await pool.query(`
    SELECT m.*, p.title as phase_title, p.phase_number,
           prog.title as program_title, prog.slug as program_slug
    FROM academy_modules m
    JOIN academy_phases p ON m.phase_id = p.id
    JOIN academy_programs prog ON p.program_id = prog.id
    WHERE m.id = $1
  `, [id]);

  if (moduleResult.rows.length === 0) {
    return res.status(404).json({ error: 'Module not found' });
  }

  const module = moduleResult.rows[0];

  // If it's a checklist module, get the checklist items
  if (module.content_type === 'checklist') {
    const checklistResult = await pool.query(`
      SELECT id, module_id, title, description, help_text, help_link,
             due_day, points_value, is_required, display_order
      FROM academy_checklist_items
      WHERE module_id = $1
      ORDER BY display_order ASC, id ASC
    `, [id]);

    module.checklist_items = checklistResult.rows;
  }

  res.json(module);
}));

// ============================================
// PROGRESS
// ============================================

/**
 * GET /api/academy/progress
 * Get current franchisee's progress
 */
router.get('/progress', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  // Get or create progress record for the 90-day launch program
  const programResult = await pool.query(`
    SELECT id FROM academy_programs WHERE slug = '90-day-launch' LIMIT 1
  `);

  if (programResult.rows.length === 0) {
    return res.status(404).json({ error: 'Program not found' });
  }

  const programId = programResult.rows[0].id;

  // Get franchisee progress
  let progressResult = await pool.query(`
    SELECT fp.*,
           (SELECT COUNT(*) FROM academy_module_progress mp
            JOIN academy_modules m ON mp.module_id = m.id
            JOIN academy_phases p ON m.phase_id = p.id
            WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') as modules_completed,
           (SELECT COUNT(*) FROM academy_earned_badges eb WHERE eb.franchisee_progress_id = fp.id) as badges_earned
    FROM academy_franchisee_progress fp
    WHERE fp.franchise_id = $1 AND fp.program_id = $2
  `, [franchiseId, programId]);

  if (progressResult.rows.length === 0) {
    // Create initial progress record
    const insertResult = await pool.query(`
      INSERT INTO academy_franchisee_progress (franchise_id, program_id, status, current_phase)
      VALUES ($1, $2, 'not_started', 1)
      RETURNING *
    `, [franchiseId, programId]);

    progressResult = { rows: insertResult.rows };
  }

  const progress = progressResult.rows[0];

  // Calculate completion percentage
  const totalModulesResult = await pool.query(`
    SELECT COUNT(*) as total
    FROM academy_modules m
    JOIN academy_phases p ON m.phase_id = p.id
    WHERE p.program_id = $1
  `, [programId]);

  const completedModulesResult = await pool.query(`
    SELECT COUNT(*) as completed
    FROM academy_module_progress mp
    WHERE mp.franchisee_progress_id = $1 AND mp.status = 'completed'
  `, [progress.id]);

  const totalModules = parseInt(totalModulesResult.rows[0]?.total || 0);
  const completedModules = parseInt(completedModulesResult.rows[0]?.completed || 0);
  progress.completion_percentage = totalModules > 0
    ? Math.round((completedModules / totalModules) * 100)
    : 0;

  // Get phase progress
  const phaseProgressResult = await pool.query(`
    SELECT
      p.id as phase_id,
      p.phase_number,
      COUNT(m.id) as total_modules,
      COUNT(mp.id) FILTER (WHERE mp.status = 'completed') as completed_modules
    FROM academy_phases p
    LEFT JOIN academy_modules m ON m.phase_id = p.id
    LEFT JOIN academy_module_progress mp ON mp.module_id = m.id AND mp.franchisee_progress_id = $1
    WHERE p.program_id = $2
    GROUP BY p.id, p.phase_number
    ORDER BY p.phase_number
  `, [progress.id, programId]);

  progress.phase_progress = {};
  for (const row of phaseProgressResult.rows) {
    const pct = row.total_modules > 0
      ? Math.round((row.completed_modules / row.total_modules) * 100)
      : 0;
    progress.phase_progress[row.phase_id] = {
      completion_percentage: pct,
      status: pct === 100 ? 'completed' : (row.completed_modules > 0 ? 'in_progress' : 'not_started'),
    };
  }

  // Get recent badges
  const badgesResult = await pool.query(`
    SELECT b.id, b.badge_key, b.title, b.icon, b.color_scheme, eb.earned_at
    FROM academy_earned_badges eb
    JOIN academy_badges b ON eb.badge_id = b.id
    WHERE eb.franchisee_progress_id = $1
    ORDER BY eb.earned_at DESC
    LIMIT 5
  `, [progress.id]);

  progress.recent_badges = badgesResult.rows;

  // Calculate current day in program
  if (progress.start_date) {
    const startDate = new Date(progress.start_date);
    const today = new Date();
    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    progress.current_day = Math.min(diffDays + 1, 90);
  } else {
    progress.current_day = 0;
  }

  // Get module progress for all modules
  const moduleProgressResult = await pool.query(`
    SELECT mp.*, m.title as module_title, m.content_type
    FROM academy_module_progress mp
    JOIN academy_modules m ON mp.module_id = m.id
    WHERE mp.franchisee_progress_id = $1
  `, [progress.id]);
  progress.module_progress = moduleProgressResult.rows;

  // Get checklist progress for all items
  const checklistProgressResult = await pool.query(`
    SELECT cp.*, ci.title as item_title, ci.module_id
    FROM academy_checklist_progress cp
    JOIN academy_checklist_items ci ON cp.checklist_item_id = ci.id
    WHERE cp.franchisee_progress_id = $1
  `, [progress.id]);
  progress.checklist_progress = checklistProgressResult.rows;

  res.json(progress);
}));

/**
 * PUT /api/academy/progress
 * Update franchisee's progress (start journey, update notes, etc.)
 */
router.put('/progress', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { status, start_date, notes } = req.body;

  // Get the program
  const programResult = await pool.query(`
    SELECT id FROM academy_programs WHERE slug = '90-day-launch' LIMIT 1
  `);

  if (programResult.rows.length === 0) {
    return res.status(404).json({ error: 'Program not found' });
  }

  const programId = programResult.rows[0].id;

  // Update progress
  const updates = [];
  const values = [];
  let idx = 1;

  if (status) {
    updates.push(`status = $${idx++}`);
    values.push(status);
  }
  if (start_date) {
    updates.push(`start_date = $${idx++}`);
    values.push(start_date);

    // Calculate target completion date (90 days from start)
    const targetDate = new Date(start_date);
    targetDate.setDate(targetDate.getDate() + 90);
    updates.push(`target_completion_date = $${idx++}`);
    values.push(targetDate.toISOString().split('T')[0]);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${idx++}`);
    values.push(notes);
  }

  updates.push(`updated_at = NOW()`);
  updates.push(`last_activity_at = NOW()`);

  values.push(franchiseId, programId);

  const result = await pool.query(`
    UPDATE academy_franchisee_progress
    SET ${updates.join(', ')}
    WHERE franchise_id = $${idx++} AND program_id = $${idx}
    RETURNING *
  `, values);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Progress record not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/modules/:id/start
 * Mark a module as started
 */
router.post('/modules/:id/start', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { id: moduleId } = req.params;

  // Get franchisee progress id
  const progressResult = await pool.query(`
    SELECT fp.id
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  if (progressResult.rows.length === 0) {
    return res.status(404).json({ error: 'Progress record not found' });
  }

  const progressId = progressResult.rows[0].id;

  // Create or update module progress
  const result = await pool.query(`
    INSERT INTO academy_module_progress (franchisee_progress_id, module_id, status, started_at)
    VALUES ($1, $2, 'in_progress', NOW())
    ON CONFLICT (franchisee_progress_id, module_id)
    DO UPDATE SET
      status = CASE WHEN academy_module_progress.status = 'not_started' THEN 'in_progress' ELSE academy_module_progress.status END,
      started_at = COALESCE(academy_module_progress.started_at, NOW()),
      updated_at = NOW()
    RETURNING *
  `, [progressId, moduleId]);

  // Update last activity
  await pool.query(`
    UPDATE academy_franchisee_progress
    SET last_activity_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [progressId]);

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/modules/:id/complete
 * Mark a module as completed
 */
router.post('/modules/:id/complete', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { id: moduleId } = req.params;
  const user = req.user || {};

  // Get franchisee progress id and module points
  const dataResult = await pool.query(`
    SELECT fp.id as progress_id, m.points_value
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    CROSS JOIN academy_modules m
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch' AND m.id = $2
  `, [franchiseId, moduleId]);

  if (dataResult.rows.length === 0) {
    return res.status(404).json({ error: 'Progress record or module not found' });
  }

  const { progress_id: progressId, points_value: pointsValue } = dataResult.rows[0];

  // Update module progress
  const result = await pool.query(`
    INSERT INTO academy_module_progress
      (franchisee_progress_id, module_id, status, started_at, completed_at, points_earned, completed_by_name, completed_by_email)
    VALUES ($1, $2, 'completed', NOW(), NOW(), $3, $4, $5)
    ON CONFLICT (franchisee_progress_id, module_id)
    DO UPDATE SET
      status = 'completed',
      completed_at = NOW(),
      points_earned = $3,
      completed_by_name = $4,
      completed_by_email = $5,
      updated_at = NOW()
    RETURNING *
  `, [progressId, moduleId, pointsValue || 0, user.name || user.first_name, user.email]);

  // Update total points and last activity
  await pool.query(`
    UPDATE academy_franchisee_progress
    SET total_points = total_points + $1,
        last_activity_at = NOW(),
        updated_at = NOW()
    WHERE id = $2
  `, [pointsValue || 0, progressId]);

  // Log points
  if (pointsValue > 0) {
    await pool.query(`
      INSERT INTO academy_points_log (franchisee_progress_id, points, reason, source_type, source_id)
      VALUES ($1, $2, 'Completed module', 'module', $3)
    `, [progressId, pointsValue, moduleId]);
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/checklist/:id/toggle
 * Toggle a checklist item completion
 */
router.post('/checklist/:id/toggle', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { id: itemId } = req.params;
  const user = req.user || {};

  // Get franchisee progress id and item info
  const dataResult = await pool.query(`
    SELECT fp.id as progress_id, ci.points_value
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    CROSS JOIN academy_checklist_items ci
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch' AND ci.id = $2
  `, [franchiseId, itemId]);

  if (dataResult.rows.length === 0) {
    return res.status(404).json({ error: 'Progress record or checklist item not found' });
  }

  const { progress_id: progressId, points_value: pointsValue } = dataResult.rows[0];

  // Check current status
  const currentResult = await pool.query(`
    SELECT is_completed FROM academy_checklist_progress
    WHERE franchisee_progress_id = $1 AND checklist_item_id = $2
  `, [progressId, itemId]);

  const wasCompleted = currentResult.rows[0]?.is_completed || false;
  const isNowCompleted = !wasCompleted;

  // Update checklist progress
  const result = await pool.query(`
    INSERT INTO academy_checklist_progress
      (franchisee_progress_id, checklist_item_id, is_completed, completed_at, points_earned, completed_by_name, completed_by_email)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (franchisee_progress_id, checklist_item_id)
    DO UPDATE SET
      is_completed = $3,
      completed_at = $4,
      points_earned = $5,
      completed_by_name = $6,
      completed_by_email = $7,
      updated_at = NOW()
    RETURNING *
  `, [
    progressId,
    itemId,
    isNowCompleted,
    isNowCompleted ? new Date() : null,
    isNowCompleted ? (pointsValue || 0) : 0,
    isNowCompleted ? (user.name || user.first_name) : null,
    isNowCompleted ? user.email : null,
  ]);

  // Update total points
  const pointsDelta = isNowCompleted ? (pointsValue || 0) : -(pointsValue || 0);
  if (pointsDelta !== 0) {
    await pool.query(`
      UPDATE academy_franchisee_progress
      SET total_points = GREATEST(0, total_points + $1),
          last_activity_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [pointsDelta, progressId]);

    // Log points
    await pool.query(`
      INSERT INTO academy_points_log (franchisee_progress_id, points, reason, source_type, source_id)
      VALUES ($1, $2, $3, 'checklist', $4)
    `, [progressId, pointsDelta, isNowCompleted ? 'Completed checklist item' : 'Unchecked checklist item', itemId]);
  }

  res.json(result.rows[0]);
}));

// ============================================
// RESOURCES
// ============================================

/**
 * GET /api/academy/resources
 * List all published resource documents
 */
router.get('/resources', asyncHandler(async (req, res) => {
  const { category, search, limit = 50, offset = 0 } = req.query;

  let query = `
    SELECT id, title, slug, category, file_url, is_published, created_at, updated_at
    FROM academy_documents
    WHERE is_published = true
  `;
  const values = [];
  let idx = 1;

  if (category) {
    query += ` AND category = $${idx++}`;
    values.push(category);
  }

  if (search) {
    query += ` AND (title ILIKE $${idx} OR content ILIKE $${idx})`;
    values.push(`%${search}%`);
    idx++;
  }

  query += ` ORDER BY category, title`;
  query += ` LIMIT $${idx++} OFFSET $${idx}`;
  values.push(parseInt(limit), parseInt(offset));

  const result = await pool.query(query, values);

  res.json(result.rows);
}));

/**
 * GET /api/academy/resources/:id
 * Get a specific resource document
 */
router.get('/resources/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    SELECT id, title, slug, category, content, content_rich, file_url,
           is_published, created_at, updated_at
    FROM academy_documents
    WHERE (id::text = $1 OR slug = $1) AND is_published = true
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Resource not found' });
  }

  res.json(result.rows[0]);
}));

// ============================================
// BADGES
// ============================================

/**
 * GET /api/academy/badges
 * Get all badges with earned status for current franchisee
 */
router.get('/badges', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  // Get franchisee progress id
  const progressResult = await pool.query(`
    SELECT fp.id
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  const progressId = progressResult.rows[0]?.id;

  // Get all badges with earned status
  const result = await pool.query(`
    SELECT b.*,
           eb.earned_at,
           eb.points_awarded,
           CASE WHEN eb.id IS NOT NULL THEN true ELSE false END as is_earned
    FROM academy_badges b
    LEFT JOIN academy_earned_badges eb ON b.id = eb.badge_id
      AND eb.franchisee_progress_id = $1
    WHERE b.is_active = true
    ORDER BY b.display_order ASC, b.id ASC
  `, [progressId || 0]);

  res.json(result.rows);
}));

/**
 * GET /api/academy/points
 * Get points history for current franchisee
 */
router.get('/points', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { limit = 50, offset = 0 } = req.query;

  const result = await pool.query(`
    SELECT pl.*
    FROM academy_points_log pl
    JOIN academy_franchisee_progress fp ON pl.franchisee_progress_id = fp.id
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
    ORDER BY pl.created_at DESC
    LIMIT $2 OFFSET $3
  `, [franchiseId, parseInt(limit), parseInt(offset)]);

  res.json(result.rows);
}));

/**
 * GET /api/academy/streak
 * Get current streak info for franchisee
 */
router.get('/streak', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  const result = await pool.query(`
    SELECT fp.current_streak_days, fp.longest_streak_days, fp.last_activity_at
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  if (result.rows.length === 0) {
    return res.json({ current_streak_days: 0, longest_streak_days: 0, last_activity_at: null });
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/activity
 * Log daily activity to update streak
 */
router.post('/activity', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  // Get current progress
  const progressResult = await pool.query(`
    SELECT fp.id, fp.current_streak_days, fp.longest_streak_days, fp.last_activity_at, fp.total_points
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  if (progressResult.rows.length === 0) {
    return res.status(404).json({ error: 'No progress record found' });
  }

  const progress = progressResult.rows[0];
  const now = new Date();
  const lastActivity = progress.last_activity_at ? new Date(progress.last_activity_at) : null;

  // Check if activity was already logged today
  const today = now.toISOString().split('T')[0];
  const lastActivityDay = lastActivity ? lastActivity.toISOString().split('T')[0] : null;

  if (lastActivityDay === today) {
    // Already logged today, return current streak
    return res.json({
      current_streak_days: progress.current_streak_days,
      longest_streak_days: progress.longest_streak_days,
      already_logged: true,
      points_awarded: 0
    });
  }

  // Calculate new streak
  let newStreak = 1;
  let streakBonus = 5; // Daily login bonus

  if (lastActivity) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (lastActivityDay === yesterdayStr) {
      // Consecutive day - continue streak
      newStreak = progress.current_streak_days + 1;
    }
    // Otherwise, streak resets to 1
  }

  // Check for milestone bonuses
  if (newStreak === 7) {
    streakBonus += 25; // 7-day streak bonus
  } else if (newStreak === 30) {
    streakBonus += 100; // 30-day streak bonus
  }

  const newLongest = Math.max(newStreak, progress.longest_streak_days);

  // Update progress
  await pool.query(`
    UPDATE academy_franchisee_progress
    SET current_streak_days = $1,
        longest_streak_days = $2,
        last_activity_at = NOW(),
        total_points = total_points + $3
    WHERE id = $4
  `, [newStreak, newLongest, streakBonus, progress.id]);

  // Log points
  await pool.query(`
    INSERT INTO academy_points_log (franchisee_progress_id, points, reason, source_type)
    VALUES ($1, $2, $3, 'streak')
  `, [progress.id, streakBonus, newStreak === 7 ? '7-day streak bonus!' : newStreak === 30 ? '30-day streak bonus!' : 'Daily activity']);

  // Check for streak badges (pass franchiseId for email notifications)
  await checkAndAwardBadges(progress.id, 'streak', newStreak, franchiseId);

  res.json({
    current_streak_days: newStreak,
    longest_streak_days: newLongest,
    already_logged: false,
    points_awarded: streakBonus
  });
}));

/**
 * POST /api/academy/check-badges
 * Check and award any earned badges for current franchisee
 */
router.post('/check-badges', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  // Get current progress with stats
  const progressResult = await pool.query(`
    SELECT fp.id, fp.total_points, fp.current_streak_days,
           fp.status, fp.current_phase
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  if (progressResult.rows.length === 0) {
    return res.json({ badges_awarded: [] });
  }

  const progress = progressResult.rows[0];

  // Check various badge conditions
  const badgesAwarded = [];

  // Check points badges (pass franchiseId for email notifications)
  const pointsBadges = await checkAndAwardBadges(progress.id, 'points', progress.total_points, franchiseId);
  badgesAwarded.push(...pointsBadges);

  // Check streak badges (pass franchiseId for email notifications)
  const streakBadges = await checkAndAwardBadges(progress.id, 'streak', progress.current_streak_days, franchiseId);
  badgesAwarded.push(...streakBadges);

  // Check phase completion badges
  const phaseResult = await pool.query(`
    SELECT COUNT(*) as completed_phases
    FROM academy_phases p
    WHERE p.phase_number <= $1
      AND EXISTS (
        SELECT 1 FROM academy_module_progress mp
        JOIN academy_modules m ON mp.module_id = m.id
        WHERE m.phase_id = p.id
          AND mp.franchisee_progress_id = $2
          AND mp.status = 'completed'
        GROUP BY m.phase_id
        HAVING COUNT(*) = (SELECT COUNT(*) FROM academy_modules WHERE phase_id = p.id)
      )
  `, [progress.current_phase, progress.id]);

  const completedPhases = parseInt(phaseResult.rows[0]?.completed_phases || 0);
  for (let phase = 1; phase <= completedPhases; phase++) {
    const phaseBadges = await checkAndAwardBadges(progress.id, 'phase', phase, franchiseId);
    badgesAwarded.push(...phaseBadges);

    // Send phase completed email for newly completed phases
    if (phaseBadges.length > 0) {
      emailService.sendPhaseCompletedEmail(franchiseId, phase, {
        total_points: progress.total_points,
        current_streak_days: progress.current_streak_days,
        completion_percentage: Math.round((completedPhases / 3) * 100),
      }).catch(err => logger.error({ err }, 'Failed to send phase email'));

      // Check if all phases are complete (program completion)
      if (phase === 3 && completedPhases === 3) {
        emailService.sendProgramCompletedEmail(franchiseId, {
          total_points: progress.total_points,
          badges_earned: badgesAwarded.length,
          longest_streak_days: progress.longest_streak_days || progress.current_streak_days,
        }).catch(err => logger.error({ err }, 'Failed to send program completion email'));
      }
    }
  }

  res.json({ badges_awarded: badgesAwarded });
}));

/**
 * Helper function to check and award badges
 * @param {number} progressId - The franchisee progress ID
 * @param {string} unlockType - The type of unlock ('points', 'streak', 'phase')
 * @param {number} value - The current value to check against threshold
 * @param {string} franchiseId - The franchise ID for email notifications (optional)
 */
async function checkAndAwardBadges(progressId, unlockType, value, franchiseId = null) {
  const awarded = [];

  // Get unearned badges of this type
  const badgesResult = await pool.query(`
    SELECT b.*
    FROM academy_badges b
    WHERE b.unlock_type = $1
      AND b.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM academy_earned_badges eb
        WHERE eb.badge_id = b.id AND eb.franchisee_progress_id = $2
      )
  `, [unlockType, progressId]);

  for (const badge of badgesResult.rows) {
    let earned = false;
    let condition = badge.unlock_condition;

    if (typeof condition === 'string') {
      try {
        condition = JSON.parse(condition);
      } catch (e) {
        condition = { value: parseInt(condition) || 0 };
      }
    }

    const threshold = condition?.value || 0;

    switch (unlockType) {
      case 'points':
        earned = value >= threshold;
        break;
      case 'streak':
        earned = value >= threshold;
        break;
      case 'phase':
        earned = value >= threshold;
        break;
      default:
        earned = false;
    }

    if (earned) {
      // Award the badge
      await pool.query(`
        INSERT INTO academy_earned_badges (franchisee_progress_id, badge_id, points_awarded)
        VALUES ($1, $2, $3)
        ON CONFLICT (franchisee_progress_id, badge_id) DO NOTHING
      `, [progressId, badge.id, badge.points_reward || 0]);

      // Add bonus points if any
      if (badge.points_reward > 0) {
        await pool.query(`
          UPDATE academy_franchisee_progress
          SET total_points = total_points + $1
          WHERE id = $2
        `, [badge.points_reward, progressId]);

        await pool.query(`
          INSERT INTO academy_points_log (franchisee_progress_id, points, reason, source_type, source_id)
          VALUES ($1, $2, $3, 'badge', $4)
        `, [progressId, badge.points_reward, `Earned badge: ${badge.title}`, badge.id]);
      }

      awarded.push({
        id: badge.id,
        badge_key: badge.badge_key,
        title: badge.title,
        description: badge.description,
        icon: badge.icon,
        points_reward: badge.points_reward
      });

      // Send email notification (async, don't wait)
      if (franchiseId) {
        emailService.sendBadgeEarnedEmail(franchiseId, badge).catch(err => {
          logger.error({ err }, 'Failed to send badge email');
        });
      }
    }
  }

  return awarded;
}

// ============================================
// AI COACH
// ============================================

/**
 * GET /api/academy/coach/conversations
 * List conversations for current franchisee
 */
router.get('/coach/conversations', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  const result = await pool.query(`
    SELECT id, franchise_id, user_id, title, created_at, updated_at
    FROM academy_conversations
    WHERE franchise_id = $1
    ORDER BY updated_at DESC
    LIMIT 20
  `, [franchiseId]);

  res.json(result.rows);
}));

/**
 * POST /api/academy/coach/conversations
 * Create a new conversation
 */
router.post('/coach/conversations', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { title } = req.body;
  const user = req.user || {};

  const result = await pool.query(`
    INSERT INTO academy_conversations (franchise_id, user_id, title)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [franchiseId, user.id, title || 'New Conversation']);

  res.json(result.rows[0]);
}));

/**
 * GET /api/academy/coach/conversations/:id
 * Get conversation with messages
 */
router.get('/coach/conversations/:id', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { id } = req.params;

  const convResult = await pool.query(`
    SELECT * FROM academy_conversations
    WHERE id = $1 AND franchise_id = $2
  `, [id, franchiseId]);

  if (convResult.rows.length === 0) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  const conversation = convResult.rows[0];

  const messagesResult = await pool.query(`
    SELECT * FROM academy_messages
    WHERE conversation_id = $1
    ORDER BY created_at ASC
  `, [id]);

  conversation.messages = messagesResult.rows;

  res.json(conversation);
}));

/**
 * POST /api/academy/coach/chat
 * Send a message and get AI response from Earl the Squirrel coach
 * Creates conversation if needed and persists messages to database
 */
router.post('/coach/chat', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  let { conversation_id, message } = req.body;
  const user = req.user || {};

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Create conversation if not provided
    if (!conversation_id) {
      // Generate title from first message (truncate to 50 chars)
      const title = message.length > 50 ? message.substring(0, 47) + '...' : message;

      const convResult = await pool.query(`
        INSERT INTO academy_conversations (franchise_id, user_id, title)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [franchiseId, user.id, title]);

      conversation_id = convResult.rows[0].id;
    }

    // Save user message to database
    await pool.query(`
      INSERT INTO academy_messages (conversation_id, role, content)
      VALUES ($1, 'user', $2)
    `, [conversation_id, message]);

    // Get AI response
    const result = await coachService.chat({
      franchiseId,
      conversationId: conversation_id,
      userMessage: message,
      userId: user.id,
    });

    // Save assistant response to database if successful
    if (result.success && result.response) {
      await pool.query(`
        INSERT INTO academy_messages (conversation_id, role, content, metadata)
        VALUES ($1, 'assistant', $2, $3)
      `, [conversation_id, result.response, JSON.stringify({
        citations: result.citations || [],
        ...result.metadata
      })]);

      // Update conversation updated_at timestamp
      await pool.query(`
        UPDATE academy_conversations SET updated_at = NOW() WHERE id = $1
      `, [conversation_id]);
    }

    // Include conversation_id in response
    res.json({
      ...result,
      conversation_id
    });
  } catch (error) {
    logger.error({ err: error }, 'Coach chat error');

    // Handle specific error types
    if (error.message?.includes('budget')) {
      return res.status(429).json({
        error: 'Coach is temporarily unavailable',
        message: 'The AI coach has reached its weekly usage limit. Please try again next week or contact support.',
      });
    }

    if (error.message?.includes('API key')) {
      return res.status(503).json({
        error: 'Coach not configured',
        message: 'The AI coach is not currently configured. Please contact support.',
      });
    }

    throw error;
  }
}));

/**
 * GET /api/academy/coach/suggestions
 * Get suggested questions based on current progress
 */
router.get('/coach/suggestions', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);

  try {
    const suggestions = await coachService.getSuggestedQuestions(franchiseId);
    res.json(suggestions);
  } catch (error) {
    logger.error({ err: error }, 'Error getting coach suggestions');
    // Return default suggestions on error
    res.json([
      "What should I focus on first as a new franchisee?",
      "How do I schedule my first demo class?",
      "What marketing materials are available?",
    ]);
  }
}));

/**
 * GET /api/academy/coach/usage
 * Get AI coach usage stats (admin only)
 */
router.get('/coach/usage', asyncHandler(async (req, res) => {
  const isMain = await isMainBranch(req);
  if (!isMain) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const stats = await coachService.getUsageStats();
    res.json(stats);
  } catch (error) {
    logger.error({ err: error }, 'Error getting coach usage');
    res.json({
      totalCostCents: 0,
      weeklyBudgetCents: 5000,
      budgetRemaining: 5000,
      isWithinBudget: true,
    });
  }
}));

// ============================================
// ADMIN ENDPOINTS (Main Branch Only)
// ============================================

/**
 * Middleware to check if user is from main branch
 */
const requireMainBranch = asyncHandler(async (req, res, next) => {
  const franchiseId = await getFranchiseId(req);
  // Allow main branch, localhost, and production domain
  const isMain = franchiseId === 'main' ||
    req.hostname?.includes('localhost') ||
    req.hostname === 'join.acmeops.com' ||
    req.hostname?.includes('acme-ops-main');

  if (!isMain) {
    return res.status(403).json({ error: 'Admin access requires main branch' });
  }
  next();
});

/**
 * GET /api/academy/admin/stats
 * Get admin dashboard statistics
 */
router.get('/admin/stats', requireMainBranch, asyncHandler(async (req, res) => {
  // Get franchisee stats
  const franchiseeStats = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'not_started') as active_franchisees,
      COUNT(*) as total_franchisees,
      AVG(CASE WHEN status != 'not_started' THEN
        (SELECT COUNT(*)::float FROM academy_module_progress mp
         WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') /
        NULLIF((SELECT COUNT(*)::float FROM academy_modules m
         JOIN academy_phases p ON m.phase_id = p.id
         WHERE p.program_id = fp.program_id), 0) * 100
      ELSE NULL END) as avg_completion
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE prog.slug = '90-day-launch'
  `);

  // Get content stats
  const contentStats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM academy_documents WHERE is_published = true) as total_documents,
      (SELECT COUNT(*) FROM academy_modules) as total_modules,
      (SELECT COUNT(*) FROM academy_checklist_items) as total_checklist_items
  `);

  // Get coach usage this week
  const coachStats = await pool.query(`
    SELECT
      COUNT(DISTINCT conversation_id) as conversations_this_week,
      COUNT(*) as messages_this_week,
      COALESCE(SUM(
        CASE WHEN metadata->>'cost' IS NOT NULL
             THEN (metadata->>'cost')::numeric
             ELSE 0.01
        END
      ), 0) as weekly_spend
    FROM academy_messages
    WHERE role = 'assistant'
      AND created_at >= date_trunc('week', NOW())
  `);

  // Get total coach stats
  const totalCoachStats = await pool.query(`
    SELECT
      COUNT(DISTINCT id) as total_conversations
    FROM academy_conversations
  `);

  res.json({
    active_franchisees: parseInt(franchiseeStats.rows[0].active_franchisees) || 0,
    total_franchisees: parseInt(franchiseeStats.rows[0].total_franchisees) || 0,
    avg_completion: Math.round(parseFloat(franchiseeStats.rows[0].avg_completion) || 0),
    total_documents: parseInt(contentStats.rows[0].total_documents) || 0,
    total_modules: parseInt(contentStats.rows[0].total_modules) || 0,
    total_checklist_items: parseInt(contentStats.rows[0].total_checklist_items) || 0,
    coach_messages_this_week: parseInt(coachStats.rows[0].messages_this_week) || 0,
    coach_usage: {
      total_conversations: parseInt(totalCoachStats.rows[0].total_conversations) || 0,
      total_messages: parseInt(coachStats.rows[0].messages_this_week) || 0,
      weekly_spend: parseFloat(coachStats.rows[0].weekly_spend) || 0,
      budget_remaining: Math.max(0, 50 - parseFloat(coachStats.rows[0].weekly_spend || 0))
    }
  });
}));

/**
 * GET /api/academy/admin/franchisees
 * Get all franchisees with progress
 */
router.get('/admin/franchisees', requireMainBranch, asyncHandler(async (req, res) => {
  const { status, limit = 50 } = req.query;

  let query = `
    SELECT
      fp.franchise_id,
      fp.status,
      fp.current_phase,
      fp.start_date,
      fp.total_points,
      fp.current_streak_days,
      fp.last_activity_at,
      CASE
        WHEN fp.start_date IS NOT NULL
        THEN LEAST(90, EXTRACT(DAY FROM NOW() - fp.start_date)::int + 1)
        ELSE 0
      END as current_day,
      ROUND(
        (SELECT COUNT(*)::numeric FROM academy_module_progress mp
         WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') /
        NULLIF((SELECT COUNT(*)::numeric FROM academy_modules m
         JOIN academy_phases p ON m.phase_id = p.id
         WHERE p.program_id = fp.program_id), 0) * 100
      ) as completion_percentage
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE prog.slug = '90-day-launch'
  `;

  const values = [];
  if (status && status !== 'all') {
    values.push(status);
    query += ` AND fp.status = $${values.length}`;
  }

  query += ` ORDER BY fp.last_activity_at DESC NULLS LAST, fp.franchise_id`;
  values.push(parseInt(limit));
  query += ` LIMIT $${values.length}`;

  const result = await pool.query(query, values);
  res.json(result.rows);
}));

/**
 * GET /api/academy/admin/franchisees/:franchiseId
 * Get detailed progress for a specific franchisee
 */
router.get('/admin/franchisees/:franchiseId', requireMainBranch, asyncHandler(async (req, res) => {
  const { franchiseId } = req.params;

  // Get basic progress
  const progressResult = await pool.query(`
    SELECT
      fp.*,
      CASE
        WHEN fp.start_date IS NOT NULL
        THEN LEAST(90, EXTRACT(DAY FROM NOW() - fp.start_date)::int + 1)
        ELSE 0
      END as current_day,
      ROUND(
        (SELECT COUNT(*)::numeric FROM academy_module_progress mp
         WHERE mp.franchisee_progress_id = fp.id AND mp.status = 'completed') /
        NULLIF((SELECT COUNT(*)::numeric FROM academy_modules m
         JOIN academy_phases p ON m.phase_id = p.id
         WHERE p.program_id = fp.program_id), 0) * 100
      ) as completion_percentage
    FROM academy_franchisee_progress fp
    JOIN academy_programs prog ON fp.program_id = prog.id
    WHERE fp.franchise_id = $1 AND prog.slug = '90-day-launch'
  `, [franchiseId]);

  if (progressResult.rows.length === 0) {
    return res.status(404).json({ error: 'Franchisee not found' });
  }

  const result = {
    franchise_id: franchiseId,
    progress: progressResult.rows[0]
  };

  // Get module progress
  const moduleProgress = await pool.query(`
    SELECT mp.*, m.title as module_title, m.content_type, p.phase_number
    FROM academy_module_progress mp
    JOIN academy_modules m ON mp.module_id = m.id
    JOIN academy_phases p ON m.phase_id = p.id
    WHERE mp.franchisee_progress_id = $1
    ORDER BY p.phase_number, m.display_order
  `, [progressResult.rows[0].id]);

  result.module_progress = moduleProgress.rows;

  // Get earned badges
  const badges = await pool.query(`
    SELECT b.badge_key, b.title, eb.earned_at
    FROM academy_earned_badges eb
    JOIN academy_badges b ON eb.badge_id = b.id
    WHERE eb.franchisee_progress_id = $1
    ORDER BY eb.earned_at DESC
  `, [progressResult.rows[0].id]);

  result.earned_badges = badges.rows;

  res.json(result);
}));

/**
 * GET /api/academy/admin/recent-activity
 * Get recent activity across all franchisees
 */
router.get('/admin/recent-activity', requireMainBranch, asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const result = await pool.query(`
    (
      SELECT
        'module_completed' as type,
        fp.franchise_id,
        'Completed module: ' || m.title as description,
        mp.completed_at as created_at
      FROM academy_module_progress mp
      JOIN academy_franchisee_progress fp ON mp.franchisee_progress_id = fp.id
      JOIN academy_modules m ON mp.module_id = m.id
      WHERE mp.status = 'completed' AND mp.completed_at IS NOT NULL
      ORDER BY mp.completed_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'badge_earned' as type,
        fp.franchise_id,
        'Earned badge: ' || b.title as description,
        eb.earned_at as created_at
      FROM academy_earned_badges eb
      JOIN academy_franchisee_progress fp ON eb.franchisee_progress_id = fp.id
      JOIN academy_badges b ON eb.badge_id = b.id
      ORDER BY eb.earned_at DESC
      LIMIT 10
    )
    UNION ALL
    (
      SELECT
        'coach_message' as type,
        c.franchise_id,
        'Asked coach: ' || LEFT(m.content, 50) || '...' as description,
        m.created_at
      FROM academy_messages m
      JOIN academy_conversations c ON m.conversation_id = c.id
      WHERE m.role = 'user'
      ORDER BY m.created_at DESC
      LIMIT 10
    )
    ORDER BY created_at DESC
    LIMIT $1
  `, [parseInt(limit)]);

  res.json(result.rows);
}));

/**
 * GET /api/academy/admin/documents
 * Get all documents (including unpublished)
 */
router.get('/admin/documents', requireMainBranch, asyncHandler(async (req, res) => {
  const { category, search, include_unpublished, limit = 100 } = req.query;

  let query = `
    SELECT id, title, slug, category, is_published, created_at, updated_at
    FROM academy_documents
    WHERE 1=1
  `;
  const values = [];
  let idx = 1;

  if (include_unpublished !== 'true') {
    query += ` AND is_published = true`;
  }

  if (category && category !== 'all') {
    query += ` AND category = $${idx++}`;
    values.push(category);
  }

  if (search) {
    query += ` AND (title ILIKE $${idx} OR content ILIKE $${idx})`;
    values.push(`%${search}%`);
    idx++;
  }

  query += ` ORDER BY category, title`;
  query += ` LIMIT $${idx}`;
  values.push(parseInt(limit));

  const result = await pool.query(query, values);
  res.json(result.rows);
}));

/**
 * POST /api/academy/admin/documents
 * Create a new document
 */
router.post('/admin/documents', requireMainBranch, asyncHandler(async (req, res) => {
  const { title, slug, category, content, is_published } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  const finalSlug = slug || title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').substring(0, 100);

  const result = await pool.query(`
    INSERT INTO academy_documents (title, slug, category, content, is_published)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [title, finalSlug, category || 'general', content || '', is_published !== false]);

  res.status(201).json(result.rows[0]);
}));

/**
 * GET /api/academy/admin/documents/:id
 * Get a single document by ID (with full content)
 */
router.get('/admin/documents/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(`
    SELECT id, title, slug, category, content, is_published, created_at, updated_at
    FROM academy_documents
    WHERE id = $1
  `, [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * PUT /api/academy/admin/documents/:id
 * Update a document
 */
router.put('/admin/documents/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, slug, category, content, is_published } = req.body;

  const result = await pool.query(`
    UPDATE academy_documents
    SET title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        category = COALESCE($3, category),
        content = COALESCE($4, content),
        is_published = COALESCE($5, is_published),
        updated_at = NOW()
    WHERE id = $6
    RETURNING *
  `, [title, slug, category, content, is_published, id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * DELETE /api/academy/admin/documents/:id
 * Delete a document
 */
router.delete('/admin/documents/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Delete chunks first
  await pool.query('DELETE FROM academy_document_chunks WHERE document_id = $1', [id]);

  // Delete document
  const result = await pool.query('DELETE FROM academy_documents WHERE id = $1 RETURNING id', [id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }

  res.json({ success: true });
}));

// ============================================
// CURRICULUM EDITOR ENDPOINTS
// ============================================

/**
 * GET /api/academy/admin/tree
 * Get full content tree (programs, phases, modules, resources)
 */
router.get('/admin/tree', requireMainBranch, asyncHandler(async (req, res) => {
  // Get program with phases and modules
  const programResult = await pool.query(`
    SELECT id, slug, title, description
    FROM academy_programs
    WHERE is_active = true
    ORDER BY created_at ASC
    LIMIT 1
  `);

  const program = programResult.rows[0] || null;
  let phases = [];

  if (program) {
    const phasesResult = await pool.query(`
      SELECT p.id, p.phase_number, p.title, p.description, p.duration_days, p.display_order,
             json_agg(
               json_build_object(
                 'id', m.id,
                 'title', m.title,
                 'content_type', m.content_type,
                 'is_required', m.is_required,
                 'display_order', m.display_order
               ) ORDER BY m.display_order ASC, m.id ASC
             ) FILTER (WHERE m.id IS NOT NULL) as modules
      FROM academy_phases p
      LEFT JOIN academy_modules m ON m.phase_id = p.id
      WHERE p.program_id = $1
      GROUP BY p.id
      ORDER BY p.phase_number ASC
    `, [program.id]);

    phases = phasesResult.rows.map(p => ({
      ...p,
      modules: p.modules || []
    }));
  }

  // Get resources grouped by category
  const resourcesResult = await pool.query(`
    SELECT category, json_agg(
      json_build_object(
        'id', id,
        'title', title,
        'slug', slug,
        'is_published', is_published
      ) ORDER BY title ASC
    ) as documents
    FROM academy_documents
    GROUP BY category
    ORDER BY category ASC
  `);

  const resources = resourcesResult.rows.reduce((acc, row) => {
    acc[row.category] = row.documents;
    return acc;
  }, {});

  res.json({
    program,
    phases,
    resources
  });
}));

/**
 * PUT /api/academy/admin/phases/:id
 * Update a phase
 */
router.put('/admin/phases/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, duration_days, display_order } = req.body;

  const result = await pool.query(`
    UPDATE academy_phases
    SET title = COALESCE($2, title),
        description = COALESCE($3, description),
        duration_days = COALESCE($4, duration_days),
        display_order = COALESCE($5, display_order)
    WHERE id = $1
    RETURNING *
  `, [id, title, description, duration_days, display_order]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Phase not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/admin/phases
 * Create a new phase
 */
router.post('/admin/phases', requireMainBranch, asyncHandler(async (req, res) => {
  const { program_id, title, description, duration_days } = req.body;

  // Get next phase number
  const maxResult = await pool.query(`
    SELECT COALESCE(MAX(phase_number), 0) + 1 as next_number,
           COALESCE(MAX(display_order), 0) + 1 as next_order
    FROM academy_phases WHERE program_id = $1
  `, [program_id]);

  const { next_number, next_order } = maxResult.rows[0];

  const result = await pool.query(`
    INSERT INTO academy_phases (program_id, phase_number, title, description, duration_days, display_order)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [program_id, next_number, title, description, duration_days || 30, next_order]);

  res.status(201).json(result.rows[0]);
}));

/**
 * DELETE /api/academy/admin/phases/:id
 * Delete a phase (must have no modules)
 */
router.delete('/admin/phases/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check for modules
  const modulesCheck = await pool.query(
    'SELECT COUNT(*) as count FROM academy_modules WHERE phase_id = $1',
    [id]
  );

  if (parseInt(modulesCheck.rows[0].count) > 0) {
    return res.status(400).json({ error: 'Cannot delete phase with modules. Remove modules first.' });
  }

  await pool.query('DELETE FROM academy_phases WHERE id = $1', [id]);
  res.json({ success: true });
}));

/**
 * PUT /api/academy/admin/modules/:id
 * Update a module (including content_blocks)
 */
router.put('/admin/modules/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, description, content_type, content_blocks, video_url, video_provider,
          points_value, is_required, is_gate, display_order } = req.body;

  const result = await pool.query(`
    UPDATE academy_modules
    SET title = COALESCE($2, title),
        description = COALESCE($3, description),
        content_type = COALESCE($4, content_type),
        content_blocks = COALESCE($5, content_blocks),
        video_url = COALESCE($6, video_url),
        video_provider = COALESCE($7, video_provider),
        points_value = COALESCE($8, points_value),
        is_required = COALESCE($9, is_required),
        is_gate = COALESCE($10, is_gate),
        display_order = COALESCE($11, display_order),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, title, description, content_type, JSON.stringify(content_blocks),
      video_url, video_provider, points_value, is_required, is_gate, display_order]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Module not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * POST /api/academy/admin/modules
 * Create a new module
 */
router.post('/admin/modules', requireMainBranch, asyncHandler(async (req, res) => {
  const { phase_id, title, description, content_type, content_blocks,
          points_value, is_required } = req.body;

  // Generate slug from title
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Get next display order
  const maxResult = await pool.query(`
    SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
    FROM academy_modules WHERE phase_id = $1
  `, [phase_id]);

  const { next_order } = maxResult.rows[0];

  const result = await pool.query(`
    INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content_blocks,
                                 points_value, is_required, display_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [phase_id, slug, title, description, content_type || 'document',
      JSON.stringify(content_blocks || []), points_value || 10, is_required || false, next_order]);

  res.status(201).json(result.rows[0]);
}));

/**
 * DELETE /api/academy/admin/modules/:id
 * Delete a module
 */
router.delete('/admin/modules/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Also deletes checklist items via CASCADE
  await pool.query('DELETE FROM academy_modules WHERE id = $1', [id]);
  res.json({ success: true });
}));

/**
 * POST /api/academy/admin/modules/:id/duplicate
 * Duplicate a module
 */
router.post('/admin/modules/:id/duplicate', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Get original module
  const original = await pool.query('SELECT * FROM academy_modules WHERE id = $1', [id]);
  if (original.rows.length === 0) {
    return res.status(404).json({ error: 'Module not found' });
  }

  const mod = original.rows[0];

  // Get next display order
  const maxResult = await pool.query(`
    SELECT COALESCE(MAX(display_order), 0) + 1 as next_order
    FROM academy_modules WHERE phase_id = $1
  `, [mod.phase_id]);

  const result = await pool.query(`
    INSERT INTO academy_modules (phase_id, slug, title, description, content_type, content, content_blocks,
                                 video_url, video_provider, attachments, points_value, is_required, is_gate, display_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [mod.phase_id, mod.slug + '-copy-' + Date.now(), mod.title + ' (Copy)', mod.description, mod.content_type,
      mod.content, mod.content_blocks, mod.video_url, mod.video_provider, mod.attachments,
      mod.points_value, mod.is_required, mod.is_gate, maxResult.rows[0].next_order]);

  res.status(201).json(result.rows[0]);
}));

/**
 * PUT /api/academy/admin/reorder
 * Batch reorder phases, modules, or resources
 */
router.put('/admin/reorder', requireMainBranch, asyncHandler(async (req, res) => {
  const { type, parent_id, order } = req.body;

  if (!type || !Array.isArray(order)) {
    return res.status(400).json({ error: 'Invalid request. Need type and order array.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const displayOrder = i + 1;

      switch (type) {
        case 'phases':
          await client.query(
            'UPDATE academy_phases SET display_order = $1, phase_number = $1 WHERE id = $2',
            [displayOrder, id]
          );
          break;
        case 'modules':
          await client.query(
            'UPDATE academy_modules SET display_order = $1, phase_id = COALESCE($3, phase_id) WHERE id = $2',
            [displayOrder, id, parent_id]
          );
          break;
        case 'resources':
          // Resources don't have display_order, but we can update category if moving
          if (parent_id) {
            await client.query(
              'UPDATE academy_documents SET category = $2 WHERE id = $1',
              [id, parent_id]
            );
          }
          break;
        default:
          throw new Error('Invalid type: ' + type);
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * POST /api/academy/admin/upload
 * Upload a file and return URL
 */
router.post('/admin/upload', requireMainBranch, asyncHandler(async (req, res) => {
  const multer = require('multer');
  const { cloudinary } = global;

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  }).single('file');

  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const isImage = req.file.mimetype.startsWith('image/');
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'acme-ops/academy', resource_type: isImage ? 'image' : 'raw', use_filename: true, unique_filename: true },
          (error, result) => error ? reject(error) : resolve(result)
        );
        stream.end(req.file.buffer);
      });

      res.json({
        url: result.secure_url,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    } catch (uploadErr) {
      logger.error({ err: uploadErr }, 'Academy Cloudinary upload error:');
      res.status(500).json({ error: 'Upload failed', details: uploadErr.message });
    }
  });
}));

// ============================================
// QUIZ ENDPOINTS
// ============================================

/**
 * POST /api/academy/quiz/submit
 * Submit quiz answers (franchisee)
 */
router.post('/quiz/submit', asyncHandler(async (req, res) => {
  const { module_id, block_id, answers } = req.body;
  const franchiseId = await getFranchiseId(req);

  // Get the module to find the quiz block
  const moduleResult = await pool.query(
    'SELECT content_blocks FROM academy_modules WHERE id = $1',
    [module_id]
  );

  if (moduleResult.rows.length === 0) {
    return res.status(404).json({ error: 'Module not found' });
  }

  const blocks = moduleResult.rows[0].content_blocks || [];
  const quizBlock = blocks.find(b => b.id === block_id && b.type === 'quiz');

  if (!quizBlock) {
    return res.status(404).json({ error: 'Quiz not found' });
  }

  // Grade the quiz
  const questions = quizBlock.questions || [];
  let score = 0;
  const results = questions.map((q, idx) => {
    const userAnswer = answers[idx];
    const isCorrect = userAnswer === q.correct;
    if (isCorrect) score++;
    return {
      question: q.text,
      userAnswer,
      correctAnswer: q.correct,
      isCorrect,
      explanation: q.explanation
    };
  });

  const maxScore = questions.length;
  const passingScore = quizBlock.passing_score || 80;
  const passed = maxScore > 0 && (score / maxScore) * 100 >= passingScore;

  // Save attempt
  await pool.query(`
    INSERT INTO academy_quiz_attempts (franchise_id, module_id, block_id, answers, score, max_score, passed)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [franchiseId, module_id, block_id, JSON.stringify(answers), score, maxScore, passed]);

  res.json({
    score,
    maxScore,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    passed,
    results
  });
}));

/**
 * GET /api/academy/admin/quiz-results
 * Get all quiz attempts (admin)
 */
router.get('/admin/quiz-results', requireMainBranch, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT qa.*, m.title as module_title
    FROM academy_quiz_attempts qa
    JOIN academy_modules m ON qa.module_id = m.id
    ORDER BY qa.attempted_at DESC
    LIMIT 100
  `);

  res.json(result.rows);
}));

// ============================================
// BADGE ADMIN ENDPOINTS
// ============================================

/**
 * GET /api/academy/admin/badges
 * Get all badges (admin view)
 */
router.get('/admin/badges', requireMainBranch, asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT b.*,
           COUNT(eb.id) as times_earned
    FROM academy_badges b
    LEFT JOIN academy_earned_badges eb ON b.id = eb.badge_id
    GROUP BY b.id
    ORDER BY COALESCE(b.display_order, 999), b.created_at
  `);
  res.json(result.rows);
}));

/**
 * POST /api/academy/admin/badges
 * Create a new badge
 */
router.post('/admin/badges', requireMainBranch, asyncHandler(async (req, res) => {
  const {
    badge_key,
    title,
    description,
    icon,
    image_url,
    color_scheme,
    unlock_type,
    unlock_condition,
    points_reward,
    is_active,
    display_order
  } = req.body;

  if (!badge_key || !title) {
    return res.status(400).json({ error: 'badge_key and title are required' });
  }

  const result = await pool.query(`
    INSERT INTO academy_badges (
      badge_key, title, description, icon, image_url, color_scheme,
      unlock_type, unlock_condition, points_reward, is_active, display_order
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *
  `, [
    badge_key,
    title,
    description || '',
    icon || 'trophy',
    image_url || null,
    color_scheme || { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    unlock_type || 'manual',
    unlock_condition || {},
    points_reward || 0,
    is_active !== false,
    display_order || null
  ]);

  res.status(201).json(result.rows[0]);
}));

/**
 * PUT /api/academy/admin/badges/:id
 * Update a badge
 */
router.put('/admin/badges/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    badge_key,
    title,
    description,
    icon,
    image_url,
    color_scheme,
    unlock_type,
    unlock_condition,
    points_reward,
    is_active,
    display_order
  } = req.body;

  const result = await pool.query(`
    UPDATE academy_badges SET
      badge_key = COALESCE($1, badge_key),
      title = COALESCE($2, title),
      description = COALESCE($3, description),
      icon = COALESCE($4, icon),
      image_url = $5,
      color_scheme = COALESCE($6, color_scheme),
      unlock_type = COALESCE($7, unlock_type),
      unlock_condition = COALESCE($8, unlock_condition),
      points_reward = COALESCE($9, points_reward),
      is_active = COALESCE($10, is_active),
      display_order = $11
    WHERE id = $12
    RETURNING *
  `, [
    badge_key,
    title,
    description,
    icon,
    image_url,
    color_scheme,
    unlock_type,
    unlock_condition,
    points_reward,
    is_active,
    display_order,
    id
  ]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Badge not found' });
  }

  res.json(result.rows[0]);
}));

/**
 * DELETE /api/academy/admin/badges/:id
 * Delete a badge
 */
router.delete('/admin/badges/:id', requireMainBranch, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if badge has been earned
  const earnedCheck = await pool.query(
    'SELECT COUNT(*) as count FROM academy_earned_badges WHERE badge_id = $1',
    [id]
  );

  if (parseInt(earnedCheck.rows[0].count) > 0) {
    // Soft delete - just deactivate
    await pool.query('UPDATE academy_badges SET is_active = false WHERE id = $1', [id]);
    return res.json({ message: 'Badge has been earned by users, deactivated instead of deleted' });
  }

  await pool.query('DELETE FROM academy_badges WHERE id = $1', [id]);
  res.json({ message: 'Badge deleted' });
}));

/**
 * POST /api/academy/admin/badges/reorder
 * Reorder badges
 */
router.post('/admin/badges/reorder', requireMainBranch, asyncHandler(async (req, res) => {
  const { order } = req.body;

  if (!Array.isArray(order)) {
    return res.status(400).json({ error: 'order must be an array of badge IDs' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 0; i < order.length; i++) {
      await client.query(
        'UPDATE academy_badges SET display_order = $1 WHERE id = $2',
        [i + 1, order[i]]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

/**
 * GET /api/academy/admin/badges/stats
 * Get badge statistics
 */
router.get('/admin/badges/stats', requireMainBranch, asyncHandler(async (req, res) => {
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM academy_badges WHERE is_active = true) as total_badges,
      (SELECT COUNT(*) FROM academy_earned_badges) as total_earned,
      (SELECT COUNT(DISTINCT franchisee_progress_id) FROM academy_earned_badges) as franchisees_with_badges
  `);

  const topBadges = await pool.query(`
    SELECT b.id, b.title, b.icon, COUNT(eb.id) as times_earned
    FROM academy_badges b
    LEFT JOIN academy_earned_badges eb ON b.id = eb.badge_id
    WHERE b.is_active = true
    GROUP BY b.id
    ORDER BY times_earned DESC
    LIMIT 5
  `);

  const recentEarned = await pool.query(`
    SELECT b.title, b.icon, fp.franchise_id, eb.earned_at
    FROM academy_earned_badges eb
    JOIN academy_badges b ON eb.badge_id = b.id
    JOIN academy_franchisee_progress fp ON eb.franchisee_progress_id = fp.id
    ORDER BY eb.earned_at DESC
    LIMIT 10
  `);

  res.json({
    ...stats.rows[0],
    top_badges: topBadges.rows,
    recent_earned: recentEarned.rows
  });
}));

// ============================================
// EMBEDDED CHECKLIST PROGRESS
// ============================================

/**
 * GET /api/academy/modules/:moduleId/embedded-checklist-progress
 * Get all embedded checklist progress for a module
 */
router.get('/modules/:moduleId/embedded-checklist-progress', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { moduleId } = req.params;

  const result = await pool.query(`
    SELECT block_id, item_index, is_completed, completed_at, completed_by_name
    FROM academy_embedded_checklist_progress
    WHERE franchise_id = $1 AND module_id = $2
  `, [franchiseId, moduleId]);

  // Convert to a lookup format: { "blockId_itemIndex": { is_completed, ... } }
  const progress = {};
  result.rows.forEach(row => {
    const key = `${row.block_id}_${row.item_index}`;
    progress[key] = {
      is_completed: row.is_completed,
      completed_at: row.completed_at,
      completed_by_name: row.completed_by_name
    };
  });

  res.json(progress);
}));

/**
 * POST /api/academy/modules/:moduleId/embedded-checklist/toggle
 * Toggle an embedded checklist item completion
 */
router.post('/modules/:moduleId/embedded-checklist/toggle', asyncHandler(async (req, res) => {
  const franchiseId = await getFranchiseId(req);
  const { moduleId } = req.params;
  const { blockId, itemIndex } = req.body;
  const user = req.user || {};

  if (blockId === undefined || itemIndex === undefined) {
    return res.status(400).json({ error: 'blockId and itemIndex are required' });
  }

  // Check current status
  const currentResult = await pool.query(`
    SELECT is_completed FROM academy_embedded_checklist_progress
    WHERE franchise_id = $1 AND module_id = $2 AND block_id = $3 AND item_index = $4
  `, [franchiseId, moduleId, blockId, itemIndex]);

  const wasCompleted = currentResult.rows[0]?.is_completed || false;
  const isNowCompleted = !wasCompleted;

  // Upsert progress
  const result = await pool.query(`
    INSERT INTO academy_embedded_checklist_progress
      (franchise_id, module_id, block_id, item_index, is_completed, completed_at, completed_by_name, completed_by_email)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (franchise_id, module_id, block_id, item_index)
    DO UPDATE SET
      is_completed = $5,
      completed_at = $6,
      completed_by_name = $7,
      completed_by_email = $8,
      updated_at = NOW()
    RETURNING *
  `, [
    franchiseId,
    moduleId,
    blockId,
    itemIndex,
    isNowCompleted,
    isNowCompleted ? new Date() : null,
    isNowCompleted ? (user.name || user.first_name || 'Unknown') : null,
    isNowCompleted ? user.email : null,
  ]);

  res.json({
    key: `${blockId}_${itemIndex}`,
    is_completed: isNowCompleted,
    completed_at: result.rows[0].completed_at,
    completed_by_name: result.rows[0].completed_by_name
  });
}));

/**
 * GET /api/academy/admin/embedded-checklist-progress/:moduleId
 * Admin view: Get all franchisees' embedded checklist progress for a module
 */
router.get('/admin/embedded-checklist-progress/:moduleId', asyncHandler(async (req, res) => {
  const isMain = await isMainBranch(req);
  if (!isMain) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { moduleId } = req.params;

  const result = await pool.query(`
    SELECT
      ecp.franchise_id,
      ecp.block_id,
      ecp.item_index,
      ecp.is_completed,
      ecp.completed_at,
      ecp.completed_by_name
    FROM academy_embedded_checklist_progress ecp
    WHERE ecp.module_id = $1
    ORDER BY ecp.franchise_id, ecp.block_id, ecp.item_index
  `, [moduleId]);

  // Group by franchise
  const byFranchise = {};
  result.rows.forEach(row => {
    if (!byFranchise[row.franchise_id]) {
      byFranchise[row.franchise_id] = {
        franchise_id: row.franchise_id,
        items: [],
        completed_count: 0
      };
    }
    byFranchise[row.franchise_id].items.push({
      block_id: row.block_id,
      item_index: row.item_index,
      is_completed: row.is_completed,
      completed_at: row.completed_at,
      completed_by_name: row.completed_by_name
    });
    if (row.is_completed) {
      byFranchise[row.franchise_id].completed_count++;
    }
  });

  res.json(Object.values(byFranchise));
}));

module.exports = router;
