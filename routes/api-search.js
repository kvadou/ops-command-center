const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/error-handler');
const { getLocationPool } = require('../utils/pool');
const requireAuth = require('../middleware/auth');

const auth = global.auth || requireAuth;

// GET /api/search?q=query
// Global search across tutors, clients, students, jobs
router.get('/', auth, asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.json({ results: [] });
  }

  const pool = getLocationPool(req);
  const query = `%${q.trim().toLowerCase()}%`;

  const [tutors, clients, students, jobs] = await Promise.all([
    pool.query(`
      SELECT contractor_id as id, first_name, last_name, 'tutor' as type
      FROM contractors
      WHERE LOWER(first_name || ' ' || last_name) LIKE $1
        OR LOWER(COALESCE(email, '')) LIKE $1
      ORDER BY first_name, last_name
      LIMIT 5
    `, [query]).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT client_id as id, first_name, last_name, 'client' as type
      FROM clients
      WHERE LOWER(first_name || ' ' || last_name) LIKE $1
        OR LOWER(COALESCE(email, '')) LIKE $1
      ORDER BY first_name, last_name
      LIMIT 5
    `, [query]).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT id, first_name, last_name, 'student' as type
      FROM students
      WHERE LOWER(first_name || ' ' || last_name) LIKE $1
      ORDER BY first_name, last_name
      LIMIT 5
    `, [query]).catch(() => ({ rows: [] })),

    pool.query(`
      SELECT id, description as name, 'job' as type
      FROM jobs
      WHERE LOWER(COALESCE(description, '')) LIKE $1
        OR CAST(id AS TEXT) LIKE $1
      ORDER BY id DESC
      LIMIT 5
    `, [query]).catch(() => ({ rows: [] })),
  ]);

  const results = [
    ...tutors.rows.map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, type: 'tutor', url: `/tutors/${r.id}` })),
    ...clients.rows.map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, type: 'client', url: `/clients/${r.id}` })),
    ...students.rows.map(r => ({ id: r.id, name: `${r.first_name} ${r.last_name}`, type: 'student', url: `/students/${r.id}` })),
    ...jobs.rows.map(r => ({ id: r.id, name: r.name || `Job #${r.id}`, type: 'job', url: `/jobs/${r.id}` })),
  ];

  res.json({ results });
}));

module.exports = router;
