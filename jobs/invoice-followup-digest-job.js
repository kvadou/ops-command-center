#!/usr/bin/env node
/**
 * Scheduled Job: Invoice Follow-Up Daily Digest
 * Sends a daily email with incomplete follow-ups due today or overdue.
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 13:00 UTC (8 AM EST / 9 AM EDT)
 * - Command: node jobs/invoice-followup-digest-job.js production
 *
 * Recipient: configurable via INVOICE_FOLLOWUP_DIGEST_RECIPIENT env var
 * Default: alyssa.dalut@chessat3.com
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

const DEFAULT_RECIPIENT = 'alyssa.dalut@chessat3.com';

async function invoiceFollowupDigestJob(environment) {
  // Feature flag check
  if (process.env.INVOICE_FOLLOWUP_DIGEST_DISABLED === 'true') {
    logger.info({ msg: 'Invoice follow-up digest skipped - disabled via env', environment });
    return { skipped: true, reason: 'INVOICE_FOLLOWUP_DIGEST_DISABLED is set to true' };
  }

  const pool = getPool(environment);

  logger.info({ msg: 'Starting invoice follow-up digest job', environment });

  // Load digest config from DB (falls back to env var / default)
  let digestRecipient = process.env.INVOICE_FOLLOWUP_DIGEST_RECIPIENT || DEFAULT_RECIPIENT;
  try {
    const configResult = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'invoice_escalation_config'"
    );
    if (configResult.rows.length > 0) {
      const config = configResult.rows[0].setting_value;
      if (config.digestEnabled === false) {
        logger.info({ msg: 'Digest disabled via DB config' });
        return { skipped: true, reason: 'Disabled in invoice_escalation_config' };
      }
      if (config.digestRecipients?.length > 0) {
        digestRecipient = config.digestRecipients.join(', ');
      }
    }
  } catch (err) {
    logger.warn({ msg: 'Could not load digest config from DB, using env var', error: err.message });
  }

  try {
    // Query incomplete follow-ups due today or overdue
    const result = await pool.query(`
      SELECT
        a.id,
        a.invoice_id,
        a.description,
        a.activity_type,
        a.follow_up_date,
        a.created_by,
        a.created_at,
        i.display_id,
        i.gross AS amount,
        i.status AS invoice_status,
        c.first_name || ' ' || COALESCE(c.last_name, '') AS school_name
      FROM invoice_activity_log a
      LEFT JOIN invoices i ON a.invoice_id = i.id
      LEFT JOIN clients c ON a.client_id::text = c.client_id::text
      WHERE a.follow_up_date IS NOT NULL
        AND a.follow_up_date <= CURRENT_DATE
        AND (a.follow_up_completed = FALSE OR a.follow_up_completed IS NULL)
      ORDER BY a.follow_up_date ASC
    `);

    const followUps = result.rows;

    logger.info({
      msg: 'Fetched follow-ups for digest',
      environment,
      followUpCount: followUps.length,
    });

    if (followUps.length === 0) {
      logger.info({ msg: 'No follow-ups due, skipping digest', environment });
      return { success: true, followUpCount: 0, message: 'No follow-ups to digest' };
    }

    // Build HTML email
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const overdue = followUps.filter(fu => new Date(fu.follow_up_date) < new Date(new Date().toDateString()));
    const dueToday = followUps.filter(fu => {
      const fuDate = new Date(fu.follow_up_date);
      const todayDate = new Date(new Date().toDateString());
      return fuDate.getTime() === todayDate.getTime();
    });

    const formatAmount = (amt) => amt ? `$${parseFloat(amt).toFixed(2)}` : '—';
    const formatDateStr = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

    const buildRows = (items) => items.map(fu => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${fu.school_name || 'Unknown'}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">#${fu.display_id || fu.invoice_id}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatAmount(fu.amount)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${formatDateStr(fu.follow_up_date)}</td>
        <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${fu.description || '—'}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 700px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Invoice Follow-Up Digest</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">${today}</p>
        </div>

        <div style="background: white; padding: 24px 32px; border: 1px solid #e5e7eb; border-top: 0;">
          <p style="font-size: 14px; color: #6b7280; margin-top: 0;">
            You have <strong style="color: #DC2626;">${followUps.length} follow-up${followUps.length !== 1 ? 's' : ''}</strong> requiring attention.
          </p>

          ${overdue.length > 0 ? `
            <h2 style="font-size: 16px; color: #DC2626; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #fecaca;">
              Overdue (${overdue.length})
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #fef2f2;">
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">School</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Invoice</th>
                  <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Amount</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Follow-Up Date</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Last Activity</th>
                </tr>
              </thead>
              <tbody>${buildRows(overdue)}</tbody>
            </table>
          ` : ''}

          ${dueToday.length > 0 ? `
            <h2 style="font-size: 16px; color: #D97706; margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #fde68a;">
              Due Today (${dueToday.length})
            </h2>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: #fffbeb;">
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">School</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Invoice</th>
                  <th style="padding: 8px 12px; text-align: right; font-weight: 600;">Amount</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Follow-Up Date</th>
                  <th style="padding: 8px 12px; text-align: left; font-weight: 600;">Last Activity</th>
                </tr>
              </thead>
              <tbody>${buildRows(dueToday)}</tbody>
            </table>
          ` : ''}

          <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; text-align: center;">
            Manage follow-ups in <a href="https://join.acmeops.com/school-partners/invoice-fulfillment" style="color: #6A469D;">OpsHub Invoice Fulfillment</a>
          </p>
        </div>
      </body>
      </html>
    `;

    const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
    const emailSender = getEmailSender();
    if (!emailSender) {
      logger.error('Brevo email sender not available — BREVO_API_KEY not configured. Skipping digest email.');
      return { success: false, error: 'Email service unavailable' };
    }

    const recipient = digestRecipient;

    await emailSender.sendEmail({
      to: recipient,
      subject: `Invoice Follow-Up Digest — ${followUps.length} action${followUps.length !== 1 ? 's' : ''} needed`,
      html,
      from: 'noreply@chessat3.com',
      tags: ['invoice-followup-digest'],
    });

    logger.info({
      msg: 'Invoice follow-up digest sent',
      environment,
      recipient,
      followUpCount: followUps.length,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
    });

    return {
      success: true,
      followUpCount: followUps.length,
      overdueCount: overdue.length,
      dueTodayCount: dueToday.length,
      recipient,
    };
  } catch (error) {
    logger.error({
      msg: 'Invoice follow-up digest job failed',
      environment,
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// Main execution
const environment = process.argv[2] || process.env.NODE_ENV || 'local';

if (!['local', 'staging', 'production', 'westside', 'eastside'].includes(environment)) {
  logger.error('Invalid environment. Must be: local, staging, production, westside, eastside');
  process.exit(1);
}

invoiceFollowupDigestJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Invoice follow-up digest completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Invoice follow-up digest failed:');
    process.exit(1);
  });
