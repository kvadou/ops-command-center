/**
 * Scorecard Service
 * EOS Scorecard — weekly KPI tracking with auto-computed and manual metrics.
 * Idempotent snapshots via UPSERT. Safe to re-run.
 */
const { logger } = require('../utils/logger');
const { getPool } = require('../database-connections');

class ScorecardService {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Config CRUD ───────────────────────────────────────────────

  async getMetrics() {
    const { rows } = await this.pool.query(`
      SELECT * FROM scorecard_metrics
      WHERE is_active = TRUE
      ORDER BY sort_order, display_name
    `);
    return rows;
  }

  async upsertMetric(data) {
    const {
      metric_key, display_name, owner, category, goal_value,
      goal_direction, data_source, computation_key, display_format, sort_order
    } = data;

    const { rows } = await this.pool.query(`
      INSERT INTO scorecard_metrics (
        metric_key, display_name, owner, category, goal_value,
        goal_direction, data_source, computation_key, display_format, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (metric_key) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        owner = EXCLUDED.owner,
        category = EXCLUDED.category,
        goal_value = EXCLUDED.goal_value,
        goal_direction = EXCLUDED.goal_direction,
        data_source = EXCLUDED.data_source,
        computation_key = EXCLUDED.computation_key,
        display_format = EXCLUDED.display_format,
        sort_order = EXCLUDED.sort_order,
        updated_at = NOW()
      RETURNING *
    `, [metric_key, display_name, owner, category, goal_value,
        goal_direction, data_source, computation_key, display_format, sort_order]);

    return rows[0];
  }

  async deleteMetric(metricKey) {
    const { rows } = await this.pool.query(`
      UPDATE scorecard_metrics
      SET is_active = FALSE, updated_at = NOW()
      WHERE metric_key = $1
      RETURNING *
    `, [metricKey]);
    return rows[0];
  }

  // ─── Snapshot CRUD ─────────────────────────────────────────────

  async getSnapshots(weekCount = 13) {
    const metrics = await this.getMetrics();

    // Get trailing N weeks of snapshot data
    const { rows: snapshots } = await this.pool.query(`
      SELECT
        ss.metric_key,
        ss.week_start::text AS week_start,
        ss.actual_value,
        ss.goal_value,
        ss.is_on_track
      FROM scorecard_snapshots ss
      JOIN scorecard_metrics sm ON sm.metric_key = ss.metric_key AND sm.is_active = TRUE
      WHERE ss.week_start >= (CURRENT_DATE - ($1 * 7) * INTERVAL '1 day')
      ORDER BY ss.week_start DESC
    `, [weekCount]);

    // Build unique sorted weeks list
    const weeksSet = new Set();
    for (const s of snapshots) {
      weeksSet.add(s.week_start);
    }
    const weeks = Array.from(weeksSet).sort();

    // Build data map: { metric_key: { week_start: { actual_value, goal_value, is_on_track } } }
    const data = {};
    for (const s of snapshots) {
      if (!data[s.metric_key]) data[s.metric_key] = {};
      data[s.metric_key][s.week_start] = {
        actual_value: s.actual_value,
        goal_value: s.goal_value,
        is_on_track: s.is_on_track
      };
    }

    return { metrics, weeks, data };
  }

  async saveSnapshot(metricKey, weekStart, weekEnd, actualValue, goalValue) {
    // Look up goal_direction for is_on_track computation
    const { rows: metricRows } = await this.pool.query(`
      SELECT goal_direction FROM scorecard_metrics WHERE metric_key = $1
    `, [metricKey]);

    const goalDirection = metricRows[0]?.goal_direction || 'above';
    const isOnTrack = this._computeOnTrack(actualValue, goalValue, goalDirection);

    const { rows } = await this.pool.query(`
      INSERT INTO scorecard_snapshots (metric_key, week_start, week_end, actual_value, goal_value, is_on_track, source)
      VALUES ($1, $2, $3, $4, $5, $6, 'auto')
      ON CONFLICT (metric_key, week_start) DO UPDATE SET
        week_end = EXCLUDED.week_end,
        actual_value = EXCLUDED.actual_value,
        goal_value = EXCLUDED.goal_value,
        is_on_track = EXCLUDED.is_on_track,
        source = EXCLUDED.source,
        updated_at = NOW()
      RETURNING *
    `, [metricKey, weekStart, weekEnd, actualValue, goalValue, isOnTrack]);

    return rows[0];
  }

  async saveManualValue(metricKey, weekStart, value) {
    // Compute weekEnd = weekStart + 6 days
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    // Fetch goal from scorecard_metrics
    const { rows: metricRows } = await this.pool.query(`
      SELECT goal_value, goal_direction FROM scorecard_metrics WHERE metric_key = $1
    `, [metricKey]);

    const goalValue = metricRows[0]?.goal_value ?? null;
    const goalDirection = metricRows[0]?.goal_direction || 'above';
    const isOnTrack = this._computeOnTrack(value, goalValue, goalDirection);

    const { rows } = await this.pool.query(`
      INSERT INTO scorecard_snapshots (metric_key, week_start, week_end, actual_value, goal_value, is_on_track, source)
      VALUES ($1, $2, $3, $4, $5, $6, 'manual')
      ON CONFLICT (metric_key, week_start) DO UPDATE SET
        week_end = EXCLUDED.week_end,
        actual_value = EXCLUDED.actual_value,
        goal_value = EXCLUDED.goal_value,
        is_on_track = EXCLUDED.is_on_track,
        source = 'manual',
        updated_at = NOW()
      RETURNING *
    `, [metricKey, weekStart, weekEndStr, value, goalValue, isOnTrack]);

    return rows[0];
  }

  // ─── Auto-compute Functions ────────────────────────────────────

  async computeWeeklyRevenue(start, end) {
    const { rows } = await this.pool.query(`
      WITH appointment_base AS (
        SELECT DISTINCT a.appointment_id, COALESCE(a.units, 1) AS units, a.charge_type
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
      )
      SELECT COALESCE(SUM(
        CASE
          WHEN ab.charge_type = 'hourly' THEN COALESCE(ar.charge_rate, 0) * ab.units
          ELSE COALESCE(ar.charge_rate, 0)
        END
      ), 0) AS total
      FROM appointment_base ab
      JOIN appointment_recipients ar ON ar.appointment_id = ab.appointment_id
      WHERE ar.status IS NULL OR ar.status <> 'missed'
    `, [start, end]);

    return parseFloat(rows[0].total);
  }

  async computeWeeklyLessons(start, end) {
    const { rows } = await this.pool.query(`
      WITH appointment_base AS (
        SELECT DISTINCT a.appointment_id
        FROM appointments a
        JOIN services s ON a.service_id = s.service_id
        WHERE DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
          AND a.status IN ('complete', 'cancelled-chargeable')
          AND a.is_deleted IS NOT TRUE
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(s.labels, '[]'::jsonb)) AS lbl
            WHERE lbl ILIKE '%Non teaching%' OR lbl ILIKE '%Support%'
          )
      )
      SELECT COUNT(*) AS cnt FROM appointment_base
    `, [start, end]);

    return parseInt(rows[0].cnt, 10);
  }

  async computeWeeklyGGHS(start, end) {
    const ggshQuery = `
      SELECT COUNT(*) AS cnt FROM appointments
      WHERE status = 'complete'
        AND DATE(start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
    `;

    // Main pool
    const { rows: mainRows } = await this.pool.query(ggshQuery, [start, end]);
    let total = parseInt(mainRows[0].cnt, 10);

    // Franchise pools — fail gracefully
    const franchiseEnvs = ['westside', 'eastside'];
    const franchiseResults = await Promise.all(
      franchiseEnvs.map(async (env) => {
        try {
          const pool = getPool(env);
          const { rows } = await pool.query(ggshQuery, [start, end]);
          return parseInt(rows[0].cnt, 10);
        } catch (err) {
          logger.warn({ env, error: err.message }, `GGHS: failed to query ${env} pool, using 0`);
          return 0;
        }
      })
    );

    for (const count of franchiseResults) {
      total += count;
    }

    return total;
  }

  async computeTrialsBooked(start, end) {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS cnt FROM clients
      WHERE date_trial_first_lesson BETWEEN $1 AND $2
    `, [start, end]);

    return parseInt(rows[0].cnt, 10);
  }

  async computeConversions(start, end) {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS cnt FROM clients
      WHERE first_paid_lesson_completed BETWEEN $1 AND $2
    `, [start, end]);

    return parseInt(rows[0].cnt, 10);
  }

  async computeProspectPipeline() {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS cnt FROM clients
      WHERE prospect_status IN ('prospect', 'trial_scheduled', 'trial_completed', 'building')
        AND (status IS NULL OR status NOT IN ('dormant', 'archived'))
    `);

    return parseInt(rows[0].cnt, 10);
  }

  async computeBookingSubmissions(start, end) {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*) AS cnt FROM booking_submissions
      WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')
    `, [start, end]);

    return parseInt(rows[0].cnt, 10);
  }

  async computeReportCompletion(start, end) {
    // lesson_reports may not exist — only query main pool, handle missing table
    try {
      const { rows } = await this.pool.query(`
        WITH completed AS (
          SELECT COUNT(*) AS total FROM appointments
          WHERE status = 'complete'
            AND DATE(start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
            AND is_deleted IS NOT TRUE
        ),
        reported AS (
          SELECT COUNT(DISTINCT lr.appointment_id) AS total
          FROM lesson_reports lr
          JOIN appointments a ON lr.appointment_id = a.appointment_id
          WHERE a.status = 'complete'
            AND DATE(a.start AT TIME ZONE 'America/New_York') BETWEEN $1 AND $2
            AND a.is_deleted IS NOT TRUE
        )
        SELECT CASE WHEN c.total > 0 THEN ROUND((r.total::numeric / c.total) * 100, 1) ELSE 0 END AS pct
        FROM completed c, reported r
      `, [start, end]);

      return parseFloat(rows[0].pct);
    } catch (err) {
      if (err.code === '42P01') { // undefined_table
        logger.warn('lesson_reports table does not exist — returning 0 for report completion');
        return 0;
      }
      throw err;
    }
  }

  // ─── Orchestrators ─────────────────────────────────────────────

  async computeAllMetrics(weekStart, weekEnd) {
    const metrics = await this.getMetrics();
    const autoMetrics = metrics.filter(m => m.data_source === 'auto' && m.computation_key);

    const computeMap = {
      weekly_revenue: (s, e) => this.computeWeeklyRevenue(s, e),
      weekly_lessons: (s, e) => this.computeWeeklyLessons(s, e),
      weekly_gghs: (s, e) => this.computeWeeklyGGHS(s, e),
      trials_booked: (s, e) => this.computeTrialsBooked(s, e),
      conversions: (s, e) => this.computeConversions(s, e),
      prospect_pipeline: () => this.computeProspectPipeline(),
      booking_submissions: (s, e) => this.computeBookingSubmissions(s, e),
      report_completion_pct: (s, e) => this.computeReportCompletion(s, e),
    };

    const results = {};

    await Promise.all(
      autoMetrics.map(async (metric) => {
        const fn = computeMap[metric.computation_key];
        if (!fn) {
          logger.warn({ computation_key: metric.computation_key, metric_key: metric.metric_key },
            'No compute function for computation_key');
          results[metric.metric_key] = null;
          return;
        }
        try {
          results[metric.metric_key] = await fn(weekStart, weekEnd);
        } catch (err) {
          logger.warn({ metric_key: metric.metric_key, error: err.message },
            'Failed to compute metric — setting to null');
          results[metric.metric_key] = null;
        }
      })
    );

    return results;
  }

  async snapshotWeek(weekStart, weekEnd) {
    const computed = await this.computeAllMetrics(weekStart, weekEnd);
    const metrics = await this.getMetrics();

    const metricMap = {};
    for (const m of metrics) {
      metricMap[m.metric_key] = m;
    }

    const results = [];

    await Promise.all(
      Object.entries(computed)
        .filter(([, value]) => value !== null)
        .map(async ([metricKey, value]) => {
          const metric = metricMap[metricKey];
          if (!metric) return;

          const snapshot = await this.saveSnapshot(
            metricKey, weekStart, weekEnd, value, metric.goal_value
          );

          results.push({
            metric_key: metricKey,
            display_name: metric.display_name,
            owner: metric.owner,
            category: metric.category,
            actual_value: value,
            goal_value: metric.goal_value,
            is_on_track: snapshot.is_on_track,
            display_format: metric.display_format
          });
        })
    );

    return results;
  }

  // ─── Helpers ───────────────────────────────────────────────────

  _computeOnTrack(actual, goal, direction) {
    if (actual == null || goal == null) return null;
    if (direction === 'below') return actual <= goal;
    return actual >= goal; // 'above' is default
  }
}

module.exports = ScorecardService;
