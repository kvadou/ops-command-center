/**
 * Failed Checkout Service
 * Detects appointments where tutors haven't checked out, tracks escalation emails,
 * and monitors resolution. Replaces Stephanie's manual FCO spreadsheet workflow.
 */

const { logger } = require('../utils/logger');
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const Bottleneck = require('bottleneck');

class FailedCheckoutService {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Detection ───────────────────────────────────────────────────────

  /**
   * Detect new failed checkouts: appointments past detection_hours that aren't checked out.
   * Upserts into failed_checkout_log (UNIQUE constraint prevents duplicates).
   */
  async detectFailedCheckouts() {
    const config = await this.getConfig();
    if (!config || !config.enabled) {
      logger.info({ msg: 'Failed checkout detection disabled' });
      return { detected: 0 };
    }

    const detectionHours = config.detection_hours || 24;

    const { rows } = await this.pool.query(`
      INSERT INTO failed_checkout_log (appointment_id, contractor_id, service_id, lesson_date, hours_late)
      SELECT
        a.appointment_id,
        ac.contractor_id,
        a.service_id,
        a.start AS lesson_date,
        ROUND(EXTRACT(EPOCH FROM (NOW() - a.start)) / 3600, 2) AS hours_late
      FROM appointments a
      JOIN appointment_contractors ac ON ac.appointment_id = a.appointment_id
      WHERE a.start < NOW() - INTERVAL '1 hour' * $1
        AND a.start > NOW() - INTERVAL '7 days'
        AND a.status NOT IN ('complete', 'cancelled-chargeable', 'cancelled')
        AND (a.is_deleted = false OR a.is_deleted IS NULL)
      ON CONFLICT (appointment_id, contractor_id) DO UPDATE
        SET hours_late = EXCLUDED.hours_late
      RETURNING id
    `, [detectionHours]);

    logger.info({ msg: 'Failed checkout detection complete', detected: rows.length, detectionHours });
    return { detected: rows.length };
  }

  // ─── Resolution Tracking ─────────────────────────────────────────────

  /**
   * Check pending/sent items and mark resolved if appointment status changed in TC sync.
   */
  async checkResolutions() {
    const { rows } = await this.pool.query(`
      UPDATE failed_checkout_log fcl
      SET
        resolved_at = NOW(),
        resolution_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - fcl.detected_at)) / 3600, 2),
        status = 'resolved'
      FROM appointments a
      WHERE fcl.appointment_id = a.appointment_id
        AND fcl.status IN ('pending', 'soft_sent', 'hard_sent')
        AND a.status IN ('complete', 'cancelled-chargeable', 'cancelled')
      RETURNING fcl.id, fcl.appointment_id, fcl.contractor_id
    `);

    logger.info({ msg: 'Resolution check complete', resolved: rows.length });
    return { resolved: rows.length };
  }

  // ─── Ghost Appointment Cleanup ───────────────────────────────────────

  /**
   * Check TC API for appointments in pending/sent status.
   * If TC returns 404, mark appointment as deleted and auto-resolve the log entry.
   * @param {object} tcClient - Axios instance configured for TutorCruncher API
   */
  async cleanupDeletedAppointments(tcClient) {
    // Get all active failed checkout appointment IDs
    const { rows: activeEntries } = await this.pool.query(`
      SELECT DISTINCT appointment_id
      FROM failed_checkout_log
      WHERE status IN ('pending', 'soft_sent', 'hard_sent')
    `);

    if (activeEntries.length === 0) {
      logger.info({ msg: 'Ghost cleanup: no active entries to check' });
      return { checked: 0, deleted: 0 };
    }

    const appointmentIds = activeEntries.map(r => r.appointment_id);
    logger.info({ msg: 'Ghost cleanup: starting', total: appointmentIds.length });

    // Rate limit: 1 req/sec with concurrency 1
    const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1000 });

    let deletedCount = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < appointmentIds.length; i += BATCH_SIZE) {
      const batch = appointmentIds.slice(i, i + BATCH_SIZE);

      const results = await Promise.all(
        batch.map(apptId =>
          limiter.schedule(async () => {
            try {
              await tcClient.get(`/appointments/${apptId}/`);
              return { apptId, exists: true };
            } catch (err) {
              if (err.response && (err.response.status === 404 || err.response.status === 403)) {
                return { apptId, exists: false };
              }
              // Other errors (network, 500, etc.) — skip, don't mark as deleted
              logger.warn({ msg: 'Ghost cleanup: TC API error', apptId, status: err.response?.status, error: err.message });
              return { apptId, exists: true }; // assume exists on error
            }
          })
        )
      );

      const deletedIds = results.filter(r => !r.exists).map(r => r.apptId);

      if (deletedIds.length > 0) {
        // Mark appointments as deleted
        await this.pool.query(`
          UPDATE appointments SET is_deleted = true
          WHERE appointment_id = ANY($1::int[])
        `, [deletedIds]);

        // Auto-resolve failed_checkout_log entries
        await this.pool.query(`
          UPDATE failed_checkout_log
          SET
            resolved_at = NOW(),
            resolution_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - detected_at)) / 3600, 2),
            status = 'resolved',
            notes = 'Appointment deleted in TutorCruncher'
          WHERE appointment_id = ANY($1::int[])
            AND status IN ('pending', 'soft_sent', 'hard_sent')
        `, [deletedIds]);

        deletedCount += deletedIds.length;
        logger.info({ msg: 'Ghost cleanup: batch resolved', batch: i / BATCH_SIZE + 1, deleted: deletedIds.length });
      }
    }

    logger.info({ msg: 'Ghost cleanup complete', checked: appointmentIds.length, deleted: deletedCount });
    return { checked: appointmentIds.length, deleted: deletedCount };
  }

  // ─── Queries ─────────────────────────────────────────────────────────

  /**
   * Get failed checkouts with filters for the main table view.
   */
  async getFailedCheckouts({ status, startDate, endDate, tutorId, limit = 200, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`fcl.status = $${paramIdx++}`);
      params.push(status);
    }
    if (startDate) {
      conditions.push(`fcl.lesson_date >= $${paramIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`fcl.lesson_date <= $${paramIdx++}`);
      params.push(endDate);
    }
    if (tutorId) {
      conditions.push(`fcl.contractor_id = $${paramIdx++}`);
      params.push(parseInt(tutorId, 10));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await this.pool.query(`
      SELECT
        fcl.*,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name,
        c.email AS tutor_email,
        s.name AS service_name,
        (
          SELECT string_agg(DISTINCT ar.recipient_name, ', ')
          FROM appointment_recipients ar
          WHERE ar.appointment_id = fcl.appointment_id
        ) AS student_names,
        (
          SELECT string_agg(DISTINCT ar.paying_client_name, ', ')
          FROM appointment_recipients ar
          WHERE ar.appointment_id = fcl.appointment_id
        ) AS client_names
      FROM failed_checkout_log fcl
      LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
      LEFT JOIN services s ON s.service_id = fcl.service_id
      ${where}
      ORDER BY fcl.lesson_date DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, [...params, limit, offset]);

    return rows;
  }

  /**
   * Aggregated tutor-level summary for the summary table.
   */
  async getFailedCheckoutSummary({ startDate, endDate } = {}) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (startDate) {
      conditions.push(`fcl.lesson_date >= $${paramIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`fcl.lesson_date <= $${paramIdx++}`);
      params.push(endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await this.pool.query(`
      SELECT
        fcl.contractor_id,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name,
        c.email AS tutor_email,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE fcl.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE fcl.status = 'soft_sent') AS soft_sent_count,
        COUNT(*) FILTER (WHERE fcl.status = 'hard_sent') AS hard_sent_count,
        COUNT(*) FILTER (WHERE fcl.status = 'resolved') AS resolved_count,
        ROUND(AVG(fcl.resolution_hours) FILTER (WHERE fcl.resolved_at IS NOT NULL), 1) AS avg_resolution_hours,
        MAX(fcl.lesson_date) AS latest_lesson_date
      FROM failed_checkout_log fcl
      LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
      ${where}
      GROUP BY fcl.contractor_id, c.first_name, c.last_name, c.email
      ORDER BY pending_count DESC, total_count DESC
    `, params);

    return rows;
  }

  /**
   * Tally view: periods as columns, tutors with failed checkout counts per period.
   * Replaces Stephanie's spreadsheet.
   */
  async getTallyData({ startDate, endDate, periodType = 'biweekly' } = {}) {
    const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate || new Date().toISOString();

    const intervalDays = periodType === 'weekly' ? 7 : 14;

    const { rows } = await this.pool.query(`
      WITH periods AS (
        SELECT
          generate_series(
            date_trunc('week', $1::timestamptz),
            $2::timestamptz,
            ($3 || ' days')::interval
          ) AS period_start
      ),
      period_ranges AS (
        SELECT
          period_start,
          period_start + ($3 || ' days')::interval AS period_end,
          to_char(period_start, 'MM/DD') || ' - ' || to_char(period_start + ($3 || ' days')::interval - interval '1 day', 'MM/DD') AS period_label
        FROM periods
      )
      SELECT
        fcl.contractor_id,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name,
        pr.period_label,
        pr.period_start,
        COUNT(*) AS failed_count,
        COUNT(*) FILTER (WHERE fcl.status = 'resolved') AS resolved_count,
        COUNT(*) FILTER (WHERE fcl.status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE fcl.status = 'soft_sent') AS soft_sent_count,
        COUNT(*) FILTER (WHERE fcl.status = 'hard_sent') AS hard_sent_count
      FROM failed_checkout_log fcl
      JOIN period_ranges pr ON fcl.lesson_date >= pr.period_start AND fcl.lesson_date < pr.period_end
      LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
      GROUP BY fcl.contractor_id, c.first_name, c.last_name, pr.period_label, pr.period_start
      ORDER BY pr.period_start, c.last_name, c.first_name
    `, [start, end, intervalDays]);

    return rows;
  }

  /**
   * Individual tutor's full failed checkout history.
   */
  async getFailedCheckoutsByTutor(contractorId, { startDate, endDate } = {}) {
    const conditions = ['fcl.contractor_id = $1'];
    const params = [parseInt(contractorId, 10)];
    let paramIdx = 2;

    if (startDate) {
      conditions.push(`fcl.lesson_date >= $${paramIdx++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`fcl.lesson_date <= $${paramIdx++}`);
      params.push(endDate);
    }

    const { rows } = await this.pool.query(`
      SELECT
        fcl.*,
        s.name AS service_name,
        (
          SELECT string_agg(DISTINCT ar.recipient_name, ', ')
          FROM appointment_recipients ar
          WHERE ar.appointment_id = fcl.appointment_id
        ) AS student_names
      FROM failed_checkout_log fcl
      LEFT JOIN services s ON s.service_id = fcl.service_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY fcl.lesson_date DESC
    `, params);

    return rows;
  }

  // ─── Emails ──────────────────────────────────────────────────────────

  /**
   * Send soft reminder email to tutor for a specific failed checkout.
   */
  async sendSoftEmail(logId) {
    return this._sendReminderEmail(logId, 'soft');
  }

  /**
   * Send hard reminder email to tutor for a specific failed checkout.
   */
  async sendHardEmail(logId) {
    return this._sendReminderEmail(logId, 'hard');
  }

  /**
   * Send batch emails for multiple failed checkout IDs.
   */
  async sendBatchEmails(logIds, emailType) {
    const results = [];
    for (const logId of logIds) {
      try {
        const result = await this._sendReminderEmail(logId, emailType);
        results.push({ logId, success: true, ...result });
      } catch (err) {
        logger.error({ msg: 'Batch email failed', logId, error: err.message });
        results.push({ logId, success: false, error: err.message });
      }
    }
    return results;
  }

  async _sendReminderEmail(logId, type) {
    // Fetch the log entry with tutor details
    const { rows } = await this.pool.query(`
      SELECT
        fcl.*,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name,
        c.email AS tutor_email
      FROM failed_checkout_log fcl
      LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
      WHERE fcl.id = $1
    `, [logId]);

    if (rows.length === 0) {
      throw new Error(`Failed checkout log entry ${logId} not found`);
    }

    const entry = rows[0];

    if (!entry.tutor_email) {
      throw new Error(`No email found for tutor (contractor_id: ${entry.contractor_id})`);
    }

    const config = await this.getConfig();
    const subject = type === 'soft'
      ? (config.soft_email_subject || 'Urgent Reminder: Update Your Schedule in TutorCruncher')
      : (config.hard_email_subject || 'Immediate Action Required – Unresolved Lessons in TutorCruncher');

    const html = this._buildEmailHtml(entry, type);

    const brevo = getBrevoEmailSender();
    if (!brevo) {
      throw new Error('Brevo email sender not available (BREVO_API_KEY missing)');
    }

    const result = await brevo.sendEmail({
      to: entry.tutor_email,
      subject,
      html,
      from: 'support@acmeops.com',
    });

    if (result.success) {
      const statusField = type === 'soft' ? 'soft_email_sent_at' : 'hard_email_sent_at';
      const newStatus = type === 'soft' ? 'soft_sent' : 'hard_sent';

      await this.pool.query(`
        UPDATE failed_checkout_log
        SET ${statusField} = NOW(), status = $1
        WHERE id = $2
      `, [newStatus, logId]);

      logger.info({
        msg: `${type} reminder email sent`,
        logId,
        contractorId: entry.contractor_id,
        tutorEmail: entry.tutor_email,
      });
    }

    return result;
  }

  _buildEmailHtml(entry, type) {
    const tutorName = `${entry.tutor_first_name || ''} ${entry.tutor_last_name || ''}`.trim() || 'Tutor';
    const lessonDate = new Date(entry.lesson_date).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const hoursLate = Math.round(entry.hours_late || 0);

    const isSoft = type === 'soft';
    const headerBg = isSoft
      ? 'linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%)'
      : 'linear-gradient(135deg, #991B1B 0%, #DC2626 100%)';
    const urgencyBg = isSoft ? '#EFF6FF' : '#FEF2F2';
    const urgencyBorder = isSoft ? '#3B82F6' : '#EF4444';
    const urgencyText = isSoft ? '#1E40AF' : '#991B1B';
    const headerLabel = isSoft ? 'Reminder' : 'Urgent Action Required';

    const bodyText = isSoft
      ? `Hi ${tutorName},<br><br>We noticed you have a lesson on <strong>${lessonDate}</strong> that hasn't been checked out yet in TutorCruncher. It's now been <strong>${hoursLate} hours</strong> since the lesson time.<br><br>Please log into TutorCruncher and complete the checkout for this lesson as soon as possible. Timely checkouts ensure clients are billed correctly and avoid confusion about charges.<br><br>If the lesson was cancelled or didn't happen, please update the appointment status accordingly.`
      : `Hi ${tutorName},<br><br>This is an urgent follow-up regarding your lesson on <strong>${lessonDate}</strong> — it has been <strong>${hoursLate} hours</strong> without a checkout in TutorCruncher.<br><br>Delayed checkouts cause billing delays for clients, which can lead to confusion about charges and a poor client experience. <strong>Please complete this checkout immediately.</strong><br><br>If there is an issue preventing you from checking out, please reply to this email or contact your coordinator right away.`;

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 600px; margin: 0 auto; background: #f9fafb;">
        <div style="background: ${headerBg}; padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Failed Checkout — ${headerLabel}</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">Acme Operations Operations</p>
        </div>
        <div style="background: white; padding: 24px 32px; border: 1px solid #e5e7eb; border-top: 0;">
          <div style="background: ${urgencyBg}; border-left: 4px solid ${urgencyBorder}; padding: 16px 20px; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 14px; color: ${urgencyText}; line-height: 1.6;">
              ${bodyText}
            </p>
          </div>
          <p style="font-size: 13px; color: #6b7280; line-height: 1.5;">
            Thank you for your prompt attention to this.<br>
            — Acme Operations Operations Team
          </p>
        </div>
        <div style="padding: 16px 32px; text-align: center;">
          <p style="font-size: 11px; color: #9ca3af; margin: 0;">
            This is an automated message from Acme Operations OpsHub.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // ─── Manual Resolution ───────────────────────────────────────────────

  async resolveManually(logId, notes) {
    const { rows } = await this.pool.query(`
      UPDATE failed_checkout_log
      SET
        resolved_at = NOW(),
        resolution_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - detected_at)) / 3600, 2),
        status = 'resolved',
        notes = $1
      WHERE id = $2
      RETURNING *
    `, [notes || null, logId]);

    if (rows.length === 0) {
      throw new Error(`Failed checkout log entry ${logId} not found`);
    }

    logger.info({ msg: 'Failed checkout manually resolved', logId, notes });
    return rows[0];
  }

  // ─── Config ──────────────────────────────────────────────────────────

  async getConfig() {
    const { rows } = await this.pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'failed_checkout_config'`
    );
    return rows.length > 0 ? rows[0].setting_value : null;
  }

  async updateConfig(newConfig) {
    const { rows } = await this.pool.query(`
      UPDATE app_settings
      SET setting_value = $1, updated_at = NOW()
      WHERE setting_key = 'failed_checkout_config'
      RETURNING setting_value
    `, [JSON.stringify(newConfig)]);

    if (rows.length === 0) {
      throw new Error('failed_checkout_config not found in app_settings');
    }

    logger.info({ msg: 'Failed checkout config updated', config: newConfig });
    return rows[0].setting_value;
  }

  // ─── Stats for Summary Cards ─────────────────────────────────────────

  async getStats() {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('pending', 'soft_sent', 'hard_sent')) AS total_pending,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at >= NOW() - INTERVAL '30 days') AS resolved_last_30d,
        ROUND(AVG(resolution_hours) FILTER (WHERE resolved_at IS NOT NULL AND resolved_at >= NOW() - INTERVAL '90 days'), 1) AS avg_resolution_hours,
        COUNT(DISTINCT contractor_id) FILTER (
          WHERE status IN ('pending', 'soft_sent', 'hard_sent')
          AND contractor_id IN (
            SELECT contractor_id FROM failed_checkout_log
            WHERE detected_at >= NOW() - INTERVAL '90 days'
            GROUP BY contractor_id
            HAVING COUNT(*) >= 3
          )
        ) AS repeat_offenders
      FROM failed_checkout_log
    `);

    return rows[0];
  }

  /**
   * Get detail rows behind each KPI card.
   * type: 'pending' | 'resolved' | 'repeat_offenders'
   */
  async getStatsDetail(type) {
    if (type === 'pending') {
      const { rows } = await this.pool.query(`
        SELECT
          fcl.id, fcl.appointment_id, fcl.contractor_id, fcl.lesson_date, fcl.hours_late, fcl.status,
          c.first_name AS tutor_first_name, c.last_name AS tutor_last_name,
          s.name AS service_name,
          (SELECT string_agg(DISTINCT ar.recipient_name, ', ') FROM appointment_recipients ar WHERE ar.appointment_id = fcl.appointment_id) AS student_names
        FROM failed_checkout_log fcl
        LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
        LEFT JOIN services s ON s.service_id = fcl.service_id
        WHERE fcl.status IN ('pending', 'soft_sent', 'hard_sent')
        ORDER BY fcl.lesson_date DESC
        LIMIT 500
      `);
      return rows;
    }

    if (type === 'resolved') {
      const { rows } = await this.pool.query(`
        SELECT
          fcl.id, fcl.appointment_id, fcl.contractor_id, fcl.lesson_date, fcl.hours_late,
          fcl.status, fcl.resolved_at, fcl.resolution_hours,
          c.first_name AS tutor_first_name, c.last_name AS tutor_last_name,
          s.name AS service_name,
          (SELECT string_agg(DISTINCT ar.recipient_name, ', ') FROM appointment_recipients ar WHERE ar.appointment_id = fcl.appointment_id) AS student_names
        FROM failed_checkout_log fcl
        LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
        LEFT JOIN services s ON s.service_id = fcl.service_id
        WHERE fcl.status = 'resolved' AND fcl.resolved_at >= NOW() - INTERVAL '30 days'
        ORDER BY fcl.resolved_at DESC
        LIMIT 500
      `);
      return rows;
    }

    if (type === 'repeat_offenders') {
      const { rows } = await this.pool.query(`
        SELECT
          fcl.contractor_id,
          c.first_name AS tutor_first_name,
          c.last_name AS tutor_last_name,
          COUNT(*) AS total_offenses,
          COUNT(*) FILTER (WHERE fcl.status IN ('pending', 'soft_sent', 'hard_sent')) AS active_count,
          COUNT(*) FILTER (WHERE fcl.status = 'resolved') AS resolved_count,
          MAX(fcl.lesson_date) AS latest_offense,
          MIN(fcl.lesson_date) AS earliest_offense
        FROM failed_checkout_log fcl
        LEFT JOIN contractors c ON c.contractor_id = fcl.contractor_id
        WHERE fcl.detected_at >= NOW() - INTERVAL '90 days'
        GROUP BY fcl.contractor_id, c.first_name, c.last_name
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
      `);
      return rows;
    }

    return [];
  }
}

module.exports = FailedCheckoutService;
