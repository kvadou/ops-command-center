#!/usr/bin/env node
/**
 * Scheduled Job: Invoice Escalation Checker
 * Sends branded escalation emails for unpaid invoices at 30/45/60 day thresholds.
 * Config is stored in app_settings (setting_key = 'invoice_escalation_config').
 * Prevents duplicates via invoice_escalation_log UNIQUE(invoice_id, threshold_days).
 *
 * Heroku Scheduler Configuration:
 * - Frequency: Daily at 14:00 UTC (9 AM EST / 10 AM EDT) — runs after digest job
 * - Command: node jobs/invoice-escalation-job.js production
 */

require('dotenv').config();
const { getPool } = require('../database-connections');
const { logger } = require('../utils/logger');

// Urgency colors per threshold tier
const URGENCY_COLORS = {
  30: { bg: '#EFF6FF', border: '#3B82F6', text: '#1E40AF', label: 'Notice' },
  45: { bg: '#FFFBEB', border: '#F59E0B', text: '#92400E', label: 'Warning' },
  60: { bg: '#FEF2F2', border: '#EF4444', text: '#991B1B', label: 'Final Notice' },
};

function getUrgencyColor(days) {
  if (days >= 60) return URGENCY_COLORS[60];
  if (days >= 45) return URGENCY_COLORS[45];
  return URGENCY_COLORS[30];
}

function interpolateTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

function formatAmount(amt) {
  return amt ? `$${parseFloat(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function buildEscalationHtml(threshold, templateVars) {
  const urgency = getUrgencyColor(threshold.days);
  const body = interpolateTemplate(threshold.body, templateVars);

  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; max-width: 700px; margin: 0 auto; background: #f9fafb;">
      <div style="background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 24px 32px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">Invoice Escalation — ${urgency.label}</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">${threshold.label}</p>
      </div>

      <div style="background: white; padding: 24px 32px; border: 1px solid #e5e7eb; border-top: 0;">
        <!-- Urgency callout -->
        <div style="background: ${urgency.bg}; border-left: 4px solid ${urgency.border}; padding: 16px 20px; border-radius: 0 6px 6px 0; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 14px; color: ${urgency.text}; line-height: 1.6;">
            ${body}
          </p>
        </div>

        <!-- Summary table -->
        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Invoice</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">School</th>
              <th style="padding: 10px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Amount</th>
              <th style="padding: 10px 12px; text-align: right; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Days Overdue</th>
              <th style="padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Sent Date</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">#${templateVars.display_id}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${templateVars.school_name}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${templateVars.amount}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; color: ${urgency.text}; font-weight: 600;">${templateVars.days_overdue}</td>
              <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb;">${templateVars.date_sent}</td>
            </tr>
          </tbody>
        </table>

        <p style="font-size: 12px; color: #9ca3af; margin-top: 24px; text-align: center;">
          <a href="https://join.acmeops.com/school-partners/invoice-fulfillment" style="color: #6A469D;">View Invoice Fulfillment</a>
          &nbsp;&middot;&nbsp;
          <a href="https://join.acmeops.com/settings?tab=InvoiceCollections" style="color: #6A469D;">Escalation Settings</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

async function invoiceEscalationJob(environment) {
  const pool = getPool(environment);

  logger.info({ msg: 'Starting invoice escalation job', environment });

  try {
    // 1) Read config from app_settings
    const configResult = await pool.query(
      `SELECT setting_value FROM app_settings WHERE setting_key = 'invoice_escalation_config'`
    );

    if (configResult.rows.length === 0) {
      logger.info({ msg: 'No invoice_escalation_config found in app_settings, skipping' });
      return { skipped: true, reason: 'No config found' };
    }

    const config = configResult.rows[0].setting_value;

    // 2) Check if enabled, has enabled thresholds, has recipients
    if (!config.enabled) {
      logger.info({ msg: 'Invoice escalation is disabled, skipping' });
      return { skipped: true, reason: 'Escalation disabled' };
    }

    const enabledThresholds = (config.thresholds || []).filter(t => t.enabled);
    if (enabledThresholds.length === 0) {
      logger.info({ msg: 'No enabled thresholds, skipping' });
      return { skipped: true, reason: 'No enabled thresholds' };
    }

    const recipients = config.recipients || [];
    if (recipients.length === 0) {
      logger.info({ msg: 'No recipients configured, skipping' });
      return { skipped: true, reason: 'No recipients' };
    }

    // Sort thresholds ascending so we process lowest first
    enabledThresholds.sort((a, b) => a.days - b.days);
    const minThreshold = enabledThresholds[0].days;

    // 3) Find unpaid invoices where days_outstanding >= minimum threshold
    //    days_outstanding = days since sent - 30 (payment terms)
    const invoiceResult = await pool.query(`
      SELECT
        i.id,
        i.display_id,
        i.gross AS amount,
        i.date_sent,
        i.client_id,
        c.first_name || ' ' || COALESCE(c.last_name, '') AS school_name,
        FLOOR(EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400 - 30) AS days_outstanding
      FROM invoices i
      LEFT JOIN clients c ON i.client_id::text = c.client_id::text
      WHERE i.status IN ('unpaid', 'open')
        AND i.date_sent IS NOT NULL
        AND EXTRACT(EPOCH FROM (NOW() - i.date_sent)) / 86400 - 30 >= $1
      ORDER BY days_outstanding DESC
    `, [minThreshold]);

    const invoices = invoiceResult.rows;

    logger.info({
      msg: 'Found qualifying unpaid invoices',
      count: invoices.length,
      minThreshold,
      enabledThresholds: enabledThresholds.map(t => t.days),
    });

    if (invoices.length === 0) {
      logger.info({ msg: 'No invoices past threshold, nothing to escalate' });
      return { success: true, escalationsSent: 0 };
    }

    // 4) Check invoice_escalation_log for already-sent escalations
    const invoiceIds = invoices.map(inv => inv.id);
    const existingResult = await pool.query(`
      SELECT invoice_id, threshold_days
      FROM invoice_escalation_log
      WHERE invoice_id = ANY($1)
    `, [invoiceIds]);

    const alreadySent = new Set(
      existingResult.rows.map(r => `${r.invoice_id}:${r.threshold_days}`)
    );

    // 5) For each qualifying invoice x threshold, send email and record
    const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
    const emailSender = getEmailSender();
    if (!emailSender) {
      logger.error('Brevo email sender not available — BREVO_API_KEY not configured. Skipping escalation emails.');
      return;
    }

    let escalationsSent = 0;
    let escalationsSkipped = 0;

    for (const invoice of invoices) {
      const daysOutstanding = parseInt(invoice.days_outstanding, 10);

      for (const threshold of enabledThresholds) {
        // Only send if invoice meets this threshold
        if (daysOutstanding < threshold.days) continue;

        const key = `${invoice.id}:${threshold.days}`;
        if (alreadySent.has(key)) {
          escalationsSkipped++;
          continue;
        }

        const templateVars = {
          display_id: invoice.display_id || String(invoice.id),
          school_name: invoice.school_name || 'Unknown School',
          amount: formatAmount(invoice.amount),
          days_overdue: String(daysOutstanding),
          date_sent: formatDate(invoice.date_sent),
        };

        const subject = interpolateTemplate(threshold.subject, templateVars);
        const html = buildEscalationHtml(threshold, templateVars);

        try {
          await emailSender.sendEmail({
            to: recipients.join(', '),
            subject,
            html,
            from: 'noreply@chessat3.com',
            tags: ['invoice-escalation'],
          });

          // 6) Record in invoice_escalation_log (UNIQUE prevents dupes)
          await pool.query(`
            INSERT INTO invoice_escalation_log (invoice_id, threshold_days, recipients)
            VALUES ($1, $2, $3)
            ON CONFLICT (invoice_id, threshold_days) DO NOTHING
          `, [invoice.id, threshold.days, recipients]);

          // Record in invoice_activity_log (timeline)
          await pool.query(`
            INSERT INTO invoice_activity_log (invoice_id, client_id, activity_type, description, source, created_by)
            VALUES ($1, $2, 'escalation_email', $3, 'automated', 'system')
          `, [
            invoice.id,
            invoice.client_id,
            `${threshold.label} escalation email sent to ${recipients.join(', ')} (${daysOutstanding} days overdue)`,
          ]);

          escalationsSent++;

          logger.info({
            msg: 'Escalation email sent',
            invoiceId: invoice.id,
            displayId: invoice.display_id,
            thresholdDays: threshold.days,
            daysOutstanding,
            recipients,
          });
        } catch (emailErr) {
          logger.error({
            msg: 'Failed to send escalation email',
            invoiceId: invoice.id,
            thresholdDays: threshold.days,
            error: emailErr.message,
          });
          // Continue processing other invoices — don't let one failure stop the batch
        }
      }
    }

    logger.info({
      msg: 'Invoice escalation job completed',
      environment,
      totalInvoices: invoices.length,
      escalationsSent,
      escalationsSkipped,
    });

    return {
      success: true,
      totalInvoices: invoices.length,
      escalationsSent,
      escalationsSkipped,
    };
  } catch (error) {
    logger.error({
      msg: 'Invoice escalation job failed',
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

invoiceEscalationJob(environment)
  .then((result) => {
    logger.info({ data: JSON.stringify(result, null, 2) }, 'Invoice escalation job completed:');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ err: error }, 'Invoice escalation job failed:');
    process.exit(1);
  });
