const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const auth = global.auth || requireAuth;
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

const { getLocationPool } = require('../utils/pool');

// Default band colors (fallback if DB not yet seeded)
const DEFAULT_BANDS = [
  { module: 1, name: 'Green Band', color: '#34B256' },
  { module: 2, name: 'Yellow Band', color: '#FACC29' },
  { module: 3, name: 'Orange Band', color: '#F79A30' },
  { module: 4, name: 'Cyan Band', color: '#50C8DF' },
  { module: 5, name: 'Purple Band', color: '#6A469D' },
  { module: 6, name: 'Navy Band', color: '#2D2F8E' },
];

// Load bands from DB, falling back to defaults
async function loadBands(pool) {
  try {
    const result = await pool.query(
      'SELECT module_number, name, band_name, band_color FROM curriculum_modules ORDER BY sort_order'
    );
    if (result.rows.length > 0) {
      return result.rows.map(r => ({ module: r.module_number, displayName: r.name, name: r.band_name, color: r.band_color }));
    }
  } catch (e) {
    logger.warn({ err: e }, 'Failed to load bands from DB, using defaults');
  }
  return DEFAULT_BANDS;
}

function getBandFromList(bands, moduleNumber) {
  if (!moduleNumber || moduleNumber === 0) return null;
  return bands.find(b => b.module === moduleNumber) || null;
}

// GET /api/student-management — List students with band progress
router.get('/', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const { search, band, page = 1, limit = 25 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const offset = (pageNum - 1) * limitNum;
  const bandFilter = band !== undefined ? parseInt(band, 10) : null;

  const params = [];
  let paramIdx = 0;

  // Build WHERE conditions for search
  const searchConditions = [];
  if (search && search.trim()) {
    paramIdx++;
    params.push(`%${search.trim()}%`);
    searchConditions.push(`(r.first_name ILIKE $${paramIdx} OR r.last_name ILIKE $${paramIdx})`);
  }

  // Band filter condition (applied in HAVING or WHERE on CTE)
  let bandCondition = '';
  if (bandFilter !== null) {
    if (bandFilter === 0) {
      bandCondition = 'AND sb.highest_module IS NULL';
    } else {
      paramIdx++;
      params.push(bandFilter);
      bandCondition = `AND sb.highest_module = $${paramIdx}`;
    }
  }

  const searchWhere = searchConditions.length > 0 ? `AND ${searchConditions.join(' AND ')}` : '';

  // Paginated student query with CTEs
  const studentsSQL = `
    WITH student_bands AS (
      SELECT
        sp.recipient_id::text AS recipient_id,
        MAX(cm.module_number) AS highest_module,
        COUNT(DISTINCT sp.curriculum_lesson_id) AS total_lessons_completed,
        MAX(sp.completed_at) AS last_lesson_date
      FROM student_progress sp
      JOIN curriculum_lessons cl ON sp.curriculum_lesson_id = cl.id
      JOIN curriculum_modules cm ON cl.module_id = cm.id
      GROUP BY sp.recipient_id
    ),
    current_module_progress AS (
      SELECT
        sb.recipient_id,
        COUNT(DISTINCT sp.curriculum_lesson_id) AS lessons_in_module,
        (SELECT COUNT(*) FROM curriculum_lessons cl2
         JOIN curriculum_modules cm2 ON cl2.module_id = cm2.id
         WHERE cm2.module_number = sb.highest_module) AS total_in_module
      FROM student_bands sb
      JOIN student_progress sp ON sb.recipient_id = sp.recipient_id::text
      JOIN curriculum_lessons cl ON sp.curriculum_lesson_id = cl.id
      JOIN curriculum_modules cm ON cl.module_id = cm.id AND cm.module_number = sb.highest_module
      GROUP BY sb.recipient_id, sb.highest_module
    )
    SELECT
      r.recipient_id,
      r.first_name,
      r.last_name,
      r.paying_client_id AS paying_client_id,
      c.first_name AS client_first_name,
      c.last_name AS client_last_name,
      COALESCE(sb.highest_module, 0) AS highest_module,
      COALESCE(sb.total_lessons_completed, 0) AS total_lessons_completed,
      sb.last_lesson_date,
      COALESCE(cmp.lessons_in_module, 0) AS lessons_in_module,
      COALESCE(cmp.total_in_module, 0) AS total_in_module,
      COUNT(*) OVER() AS full_count
    FROM (SELECT DISTINCT recipient_id::text AS recipient_id FROM appointment_recipients) ar
    JOIN recipients r ON ar.recipient_id = r.recipient_id
    LEFT JOIN clients c ON r.paying_client_id::text = c.client_id
    LEFT JOIN student_bands sb ON r.recipient_id = sb.recipient_id
    LEFT JOIN current_module_progress cmp ON r.recipient_id = cmp.recipient_id
    WHERE 1=1
      ${searchWhere}
      ${bandCondition}
    ORDER BY r.last_name, r.first_name
    LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}
  `;
  params.push(limitNum, offset);

  // Metrics query
  const metricsSQL = `
    SELECT
      COUNT(DISTINCT ar.recipient_id) AS total_students,
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM student_progress sp2
          WHERE sp2.recipient_id = ar.recipient_id
            AND sp2.completed_at >= NOW() - INTERVAL '30 days'
        ) THEN ar.recipient_id
      END) AS active_students,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM student_progress sp3
          WHERE sp3.recipient_id = ar.recipient_id
        ) THEN ar.recipient_id
      END) AS no_progress
    FROM (SELECT DISTINCT recipient_id FROM appointment_recipients) ar
  `;

  // Band distribution query
  const distributionSQL = `
    WITH student_highest AS (
      SELECT
        sp.recipient_id,
        MAX(cm.module_number) AS highest_module
      FROM student_progress sp
      JOIN curriculum_lessons cl ON sp.curriculum_lesson_id = cl.id
      JOIN curriculum_modules cm ON cl.module_id = cm.id
      GROUP BY sp.recipient_id
    ),
    all_students AS (
      SELECT DISTINCT recipient_id FROM appointment_recipients
    )
    SELECT
      COALESCE(sh.highest_module, 0) AS module_number,
      COUNT(*) AS student_count
    FROM all_students a
    LEFT JOIN student_highest sh ON a.recipient_id = sh.recipient_id
    GROUP BY COALESCE(sh.highest_module, 0)
    ORDER BY module_number
  `;

  // Run all three queries + load bands in parallel
  const [studentsResult, metricsResult, distributionResult, bands] = await Promise.all([
    pool.query(studentsSQL, params),
    pool.query(metricsSQL),
    pool.query(distributionSQL),
    loadBands(pool),
  ]);

  const total = parseInt(studentsResult.rows[0]?.full_count || '0', 10);

  // Map students with band info
  const students = studentsResult.rows.map(row => {
    const band = getBandFromList(bands, parseInt(row.highest_module, 10));
    const lessonsInModule = parseInt(row.lessons_in_module, 10);
    const totalInModule = parseInt(row.total_in_module, 10);
    return {
      recipient_id: row.recipient_id,
      first_name: row.first_name,
      last_name: row.last_name,
      paying_client_id: row.paying_client_id,
      client_first_name: row.client_first_name,
      client_last_name: row.client_last_name,
      highest_module: parseInt(row.highest_module, 10),
      total_lessons_completed: parseInt(row.total_lessons_completed, 10),
      last_lesson_date: row.last_lesson_date,
      lessons_in_module: lessonsInModule,
      total_in_module: totalInModule,
      band: band,
      progress: totalInModule > 0 ? `${lessonsInModule}/${totalInModule}` : '0/0',
    };
  });

  // Map band distribution with names and colors
  const bandDistribution = distributionResult.rows.map(row => {
    const modNum = parseInt(row.module_number, 10);
    const band = bands.find(b => b.module === modNum);
    return {
      module_number: modNum,
      band_name: band ? band.name : 'No Band',
      band_color: band ? band.color : '#9CA3AF',
      student_count: parseInt(row.student_count, 10),
    };
  });

  const metrics = metricsResult.rows[0];

  res.json({
    students,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
    metrics: {
      totalStudents: parseInt(metrics.total_students, 10),
      activeStudents: parseInt(metrics.active_students, 10),
      noProgress: parseInt(metrics.no_progress, 10),
    },
    bandDistribution,
  });
}));

// GET /api/student-management/curriculum-config — Get all module/band configuration
router.get('/curriculum-config', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const result = await pool.query(
    'SELECT id, module_number, name, band_name, band_color, sort_order FROM curriculum_modules ORDER BY sort_order'
  );

  res.json(result.rows);
}));

// PUT /api/student-management/curriculum-config — Update all module/band configuration
router.put('/curriculum-config', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const { modules } = req.body;
  if (!Array.isArray(modules) || modules.length === 0) {
    return res.status(400).json({ error: 'modules array is required' });
  }

  // Validate each module entry
  for (const mod of modules) {
    if (!mod.id || !mod.name || !mod.band_name || !mod.band_color) {
      return res.status(400).json({ error: 'Each module must have id, name, band_name, and band_color' });
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(mod.band_color)) {
      return res.status(400).json({ error: `Invalid hex color: ${mod.band_color}` });
    }
  }

  // Update each module in a transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const mod of modules) {
      await client.query(
        'UPDATE curriculum_modules SET name = $1, band_name = $2, band_color = $3 WHERE id = $4',
        [mod.name, mod.band_name, mod.band_color, mod.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  logger.info({ moduleCount: modules.length }, 'Curriculum config updated');
  res.json({ success: true });
}));

// GET /api/student-management/:id/progress — Full progress for one student
router.get('/:id/progress', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  if (!pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }

  const recipientId = parseInt(req.params.id, 10);
  if (isNaN(recipientId)) {
    return res.status(400).json({ error: 'Invalid student ID' });
  }

  const modulesSQL = `
    SELECT
      cm.id AS module_id,
      cm.module_number,
      cm.name AS module_name,
      cm.band_name,
      cm.band_color,
      json_agg(
        json_build_object(
          'lesson_id', cl.id,
          'lesson_number', cl.lesson_number,
          'name', cl.name,
          'topic', cl.topic,
          'completed', sp.id IS NOT NULL,
          'completed_at', sp.completed_at,
          'tutor_name', sp.tutor_name,
          'appointment_id', sp.appointment_id
        ) ORDER BY cl.lesson_number
      ) AS lessons
    FROM curriculum_modules cm
    JOIN curriculum_lessons cl ON cm.id = cl.module_id
    LEFT JOIN student_progress sp ON cl.id = sp.curriculum_lesson_id AND sp.recipient_id = $1
    GROUP BY cm.id, cm.module_number, cm.name, cm.band_name, cm.band_color
    ORDER BY cm.sort_order
  `;

  const result = await pool.query(modulesSQL, [recipientId]);

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No curriculum modules found' });
  }

  let totalCompleted = 0;
  let totalLessons = 0;
  let highestCompletedModule = 0;

  const modules = result.rows.map(row => {
    const lessons = row.lessons || [];
    const completedCount = lessons.filter(l => l.completed).length;
    const totalCount = lessons.length;

    totalCompleted += completedCount;
    totalLessons += totalCount;

    if (completedCount > 0 && row.module_number > highestCompletedModule) {
      highestCompletedModule = row.module_number;
    }

    return {
      module_id: row.module_id,
      module_number: row.module_number,
      module_name: row.module_name,
      band_name: row.band_name,
      band_color: row.band_color,
      lessons,
      completedCount,
      totalCount,
      percentage: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    };
  });

  // Build currentBand from highest module with completed lessons
  const bands = await loadBands(pool);
  let currentBand = null;
  if (highestCompletedModule > 0) {
    const bandModule = modules.find(m => m.module_number === highestCompletedModule);
    const bandInfo = getBandFromList(bands, highestCompletedModule);
    if (bandModule && bandInfo) {
      currentBand = {
        module: highestCompletedModule,
        name: bandInfo.name,
        color: bandInfo.color,
        progress: bandModule.completedCount,
        total: bandModule.totalCount,
        percentage: bandModule.percentage,
      };
    }
  }

  res.json({
    currentBand,
    totalCompleted,
    totalLessons,
    overallPercentage: totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0,
    modules,
  });
}));

module.exports = router;
