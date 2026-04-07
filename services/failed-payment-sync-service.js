/**
 * Failed Payment Sync Service
 * Detects unpaid Home/Online invoices, upserts into failed_payment_cases,
 * and auto-resolves cases where all invoices have been paid.
 */

const { logger } = require('../utils/logger');

/**
 * Sync failed payments: detect unpaid invoices, upsert cases, auto-resolve paid ones.
 * @param {import('pg').Pool} pool
 * @returns {{ created: number, updated: number, resolved: number, total_outstanding: number }}
 */
async function syncFailedPayments(pool) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Step 1: Aggregate unpaid Home/Online invoices per client
    const unpaidQuery = `
      WITH unpaid_invoices AS (
        SELECT
          i.id AS invoice_id,
          i.client_id::text AS client_id,
          i.still_to_pay,
          i.date_sent,
          ii.service_id
        FROM invoices i
        JOIN invoice_items ii ON ii.invoice_id = i.id
        JOIN services s ON s.service_id = ii.service_id
        WHERE i.status = 'unpaid'
          AND i.still_to_pay > 0
          AND (
            s.labels::text LIKE '%"Home %'
            OR s.labels @> '"Online"'::jsonb
          )
          AND s.labels::text NOT LIKE '%"School%'
          AND s.labels::text NOT LIKE '%"Club %'
      ),
      client_agg AS (
        SELECT
          u.client_id,
          SUM(u.still_to_pay) AS total_outstanding,
          COUNT(DISTINCT u.invoice_id) AS invoice_count,
          MIN(u.date_sent) AS oldest_invoice_date
        FROM unpaid_invoices u
        GROUP BY u.client_id
      )
      SELECT
        ca.client_id,
        ca.total_outstanding,
        ca.invoice_count,
        ca.oldest_invoice_date,
        c.first_name || ' ' || c.last_name AS client_name,
        c.email AS client_email
      FROM client_agg ca
      LEFT JOIN clients c ON c.client_id = ca.client_id
    `;

    const { rows: unpaidClients } = await client.query(unpaidQuery);

    // Build a Set of client_ids that currently have unpaid invoices
    const unpaidClientIds = new Set(unpaidClients.map(r => r.client_id));

    // Step 2: Get tutor name for each client from most recent invoice item
    const tutorQuery = `
      WITH ranked AS (
        SELECT
          i.client_id::text AS client_id,
          ii.tutor_name,
          ROW_NUMBER() OVER (PARTITION BY i.client_id ORDER BY i.date_sent DESC, i.id DESC) AS rn
        FROM invoices i
        JOIN invoice_items ii ON ii.invoice_id = i.id
        JOIN services s ON s.service_id = ii.service_id
        WHERE i.status = 'unpaid'
          AND i.still_to_pay > 0
          AND ii.tutor_name IS NOT NULL
          AND (
            s.labels::text LIKE '%"Home %'
            OR s.labels @> '"Online"'::jsonb
          )
          AND s.labels::text NOT LIKE '%"School%'
          AND s.labels::text NOT LIKE '%"Club %'
      )
      SELECT client_id, tutor_name
      FROM ranked
      WHERE rn = 1
    `;

    const { rows: tutorRows } = await client.query(tutorQuery);
    const tutorMap = new Map(tutorRows.map(r => [r.client_id, r.tutor_name]));

    // Step 3: Fetch existing open cases
    const { rows: existingCases } = await client.query(
      `SELECT id, client_id FROM failed_payment_cases WHERE status = 'open'`
    );
    const existingMap = new Map(existingCases.map(r => [r.client_id, r.id]));

    let created = 0;
    let updated = 0;
    let totalOutstanding = 0;

    // Step 4: Upsert cases
    for (const row of unpaidClients) {
      totalOutstanding += parseFloat(row.total_outstanding);
      const tutorName = tutorMap.get(row.client_id) || null;

      if (existingMap.has(row.client_id)) {
        // Update existing open case
        await client.query(
          `UPDATE failed_payment_cases
           SET total_outstanding = $1, invoice_count = $2, oldest_invoice_date = $3,
               tutor_name = $4, client_name = $5, client_email = $6, updated_at = NOW()
           WHERE id = $7`,
          [row.total_outstanding, row.invoice_count, row.oldest_invoice_date,
           tutorName, row.client_name, row.client_email, existingMap.get(row.client_id)]
        );
        updated++;
      } else {
        // Insert new case + auto_detected activity
        const { rows: inserted } = await client.query(
          `INSERT INTO failed_payment_cases
             (client_id, client_name, client_email, status, total_outstanding, invoice_count,
              oldest_invoice_date, tutor_name, opened_at)
           VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, NOW())
           RETURNING id`,
          [row.client_id, row.client_name, row.client_email,
           row.total_outstanding, row.invoice_count, row.oldest_invoice_date, tutorName]
        );

        await client.query(
          `INSERT INTO ar_activity (case_id, client_id, activity_type, description, created_by)
           VALUES ($1, $2, 'auto_detected', $3, 'system')`,
          [inserted[0].id, row.client_id,
           `Auto-detected: ${row.invoice_count} unpaid invoice(s) totaling $${parseFloat(row.total_outstanding).toFixed(2)}`]
        );
        created++;
      }
    }

    // Step 5: Auto-resolve open cases with no remaining unpaid invoices
    const casesToResolve = existingCases.filter(c => !unpaidClientIds.has(c.client_id));
    let resolved = 0;

    for (const c of casesToResolve) {
      await client.query(
        `UPDATE failed_payment_cases
         SET status = 'resolved', resolved_at = NOW(),
             resolution_notes = 'Auto-resolved: no remaining unpaid invoices'
         WHERE id = $1`,
        [c.id]
      );

      await client.query(
        `INSERT INTO ar_activity (case_id, client_id, activity_type, description, created_by)
         VALUES ($1, $2, 'auto_resolved', 'Auto-resolved: no remaining unpaid invoices', 'system')`,
        [c.id, c.client_id]
      );
      resolved++;
    }

    await client.query('COMMIT');

    const result = { created, updated, resolved, total_outstanding: totalOutstanding };

    logger.info({
      event: 'failed_payment_sync_complete',
      ...result
    }, `Failed payment sync: ${created} created, ${updated} updated, ${resolved} resolved`);

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({
      event: 'failed_payment_sync_error',
      error: err.message,
      stack: err.stack
    }, 'Failed payment sync error');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { syncFailedPayments };
