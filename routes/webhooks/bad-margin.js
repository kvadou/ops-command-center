const express = require('express');
const router = express.Router();
const { logger } = require('../../utils/logger');

const { getInstance: getEmailSender } = require('../../utils/brevo-email-sender');
const {
  pool,
  tutorCruncherAPI
} = global;

// Define BAD_MARGIN_THRESHOLD with validation
const BAD_MARGIN_THRESHOLD = (() => {
  const v = Number(process.env.BAD_MARGIN_THRESHOLD ?? 0.2); // 20% default
  if (Number.isNaN(v) || v < 0 || v > 1) {
    logger.warn('BAD_MARGIN_THRESHOLD invalid; falling back to 0.2');
    return 0.2;
  }
  return v;
})();

router.post('/', async (req, res) => {
  // Verify webhook secret
  const webhookSecret = process.env.BAD_MARGIN_WEBHOOK_SECRET;
  if (webhookSecret) {
    if (req.query.secret !== webhookSecret && req.headers['x-webhook-secret'] !== webhookSecret) {
      logger.warn({ ip: req.ip }, 'Bad margin webhook rejected: invalid or missing secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else {
    logger.warn('BAD_MARGIN_WEBHOOK_SECRET not configured — webhook requests are unverified');
  }

  try {
    const {
      events
    } = req.body;
    if (!events || !Array.isArray(events) || events.length === 0) {
      logger.info('No events found in the webhook.');
      return res.status(400).json({
        message: 'No events found'
      });
    }

    // Load alert configuration from database
    let alertConfig;
    try {
      const configResult = await pool.query('SELECT * FROM bad_margin_alert_config WHERE id = 1');
      if (configResult.rows.length === 0) {
        // Use defaults if no config exists
        alertConfig = {
          margin_threshold: 29.00,
          alert_emails: ['support@acmeops.com'],
          exception_service_ids: [],
          exception_labels: ['school', 'non', 'support'],
          enabled: true
        };
      } else {
        alertConfig = {
          margin_threshold: parseFloat(configResult.rows[0].margin_threshold) || 29.00,
          alert_emails: configResult.rows[0].alert_emails || ['support@acmeops.com'],
          exception_service_ids: configResult.rows[0].exception_service_ids || [],
          exception_labels: configResult.rows[0].exception_labels || ['school', 'non', 'support'],
          enabled: configResult.rows[0].enabled !== false
        };
      }
    } catch (configError) {
      logger.error({ error: configError.message }, '❌ Error loading alert config, using defaults');
      // Fallback to defaults if table doesn't exist yet
      alertConfig = {
        margin_threshold: BAD_MARGIN_THRESHOLD * 100, // Convert to percentage
        alert_emails: ['support@acmeops.com'],
        exception_service_ids: [],
        exception_labels: ['school', 'non', 'support'],
        enabled: true
      };
    }

    // Check if alerts are enabled
    if (!alertConfig.enabled) {
      logger.info('⏸️ Bad margin alerts are disabled in configuration');
      return res.status(200).json({ message: 'Alerts disabled' });
    }

    const marginThresholdPercent = alertConfig.margin_threshold;

    for (const event of events) {
      if (event.action !== 'MARKED_AN_APPOINTMENT_AS_COMPLETE' && event.action !== 'CREATED_REPORT') {
        logger.info({ action: event.action }, '⚠️ Ignoring event type');
        continue;
      }
      const {
        id,
        rcras,
        cjas,
        service
      } = event.subject;
      if (!id) {
        logger.info('❌ Missing lesson ID');
        continue;
      }
      if (!service || !service.id) {
        logger.info({ lessonId: id }, '❌ Missing service ID for lesson');
        continue;
      }
      if (!Array.isArray(rcras) || rcras.length === 0) {
        logger.info({ lessonId: id }, '❌ No student payments found for lesson');
        continue;
      }
      if (!Array.isArray(cjas) || cjas.length === 0) {
        logger.info({ lessonId: id }, '❌ No tutor payment data found for lesson');
        continue;
      }

      // Fetch service data first - needed for sr_premium calculation
      let serviceData;
      try {
        const serviceResponse = await tutorCruncherAPI.get(`services/${service.id}/`);
        serviceData = serviceResponse.data;
      } catch (err) {
        logger.error({ serviceId: service.id, error: err.message }, '❌ Failed to fetch service');
        continue;
      }

      // Get units and charge type for calculations
      const units = parseFloat(event.subject.units || 0);
      const chargeType = serviceData.dft_charge_type || 'hourly';

      // Calculate total revenue from students (multiply by units for hourly services)
      // Only include students who were not marked as "missed" (do not charge)
      const totalRevenue = rcras
        .filter(student => student.status !== 'missed' && student.status !== 'Missed')
        .reduce((sum, student) => {
          const chargeRate = Number(student.charge_rate) || 0;
          // For hourly services, charge_rate is per-unit, so multiply by units
          if (chargeType === 'hourly' || chargeType === 'hourly-split') {
            return sum + (chargeRate * units);
          }
          // For one-off services, charge_rate is the total
          return sum + chargeRate;
        }, 0);

      // Calculate base tutor pay from contractors (multiply by units for hourly services)
      const baseTutorCost = cjas.reduce((sum, tutor) => {
        const payRate = Number(tutor.pay_rate) || 0;
        // For hourly services, pay_rate is per-unit, so multiply by units
        if (chargeType === 'hourly' || chargeType === 'hourly-split') {
          return sum + (payRate * units);
        }
        // For one-off services, pay_rate is the total
        return sum + payRate;
      }, 0);

      // Calculate student premium: count students with status <> 'missed' * sr_premium * units
      const srPremium = serviceData.sr_premium ? parseFloat(serviceData.sr_premium) : 0;
      const studentCount = rcras.filter(student =>
        student.status !== 'missed' && student.status !== 'Missed'
      ).length;
      const studentPremium = srPremium > 0 && studentCount > 0 && units > 0
        ? studentCount * srPremium * units
        : 0;

      // Total tutor cost = base pay + student premium
      const totalTutorCost = baseTutorCost + studentPremium;

      const profit = totalRevenue - totalTutorCost;
      const margin = totalRevenue > 0 ? (profit / totalRevenue * 100).toFixed(2) : 0;
      logger.info({ lessonId: id, chargeType, units, totalRevenue, baseTutorCost, studentPremium, studentCount, srPremium, totalTutorCost, margin }, '📊 Lesson margin calculated');

      if (margin < marginThresholdPercent) {
        // Check if service ID is in exception list
        if (alertConfig.exception_service_ids && alertConfig.exception_service_ids.includes(service.id)) {
          logger.info({ serviceId: service.id, lessonId: id }, '⚠️ Service is in exception list, skipping alert');
          continue;
        }

        // Check if service has excluded labels
        const excludeSubstrings = alertConfig.exception_labels || [];
        let shouldExclude = false;
        if (Array.isArray(serviceData.labels)) {
          for (const labelObj of serviceData.labels) {
            if (labelObj.name && excludeSubstrings.some(sub => labelObj.name.toLowerCase().includes(sub.toLowerCase()))) {
              shouldExclude = true;
              break;
            }
          }
        }
        if (shouldExclude) {
          logger.info({ serviceId: service.id, lessonId: id }, '⚠️ Service contains an excluded label, skipping alert');
          continue;
        }

        // Check if alert already exists for this appointment to prevent duplicates
        const existingAlert = await pool.query(
          `SELECT id FROM bad_margin_alerts WHERE appointment_id = $1 LIMIT 1`,
          [id]
        );

        if (existingAlert.rows.length > 0) {
          logger.info({ lessonId: id, alertId: existingAlert.rows[0].id }, '⏭️ Alert already exists, skipping duplicate');
          continue; // Skip creating duplicate alert and sending duplicate email
        }

        // Save alert to database for tracking
        const tutorcruncherUrl = `https://account.acmeops.com/cal/appointments/${id}/`;
        let alertRecordId;
        try {
          const insertResult = await pool.query(
            `INSERT INTO bad_margin_alerts (
              appointment_id, service_id, service_name, tutor_name, tutor_id,
              total_revenue, base_tutor_cost, student_premium, total_tutor_cost,
              profit_loss, margin_percentage, student_count, units, sr_premium,
              tutorcruncher_url, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING id`,
            [
              id,
              service.id,
              serviceData.name || service.name || 'Unknown',
              cjas[0]?.name || 'Unknown',
              cjas[0]?.contractor || null,
              totalRevenue,
              baseTutorCost,
              studentPremium,
              totalTutorCost,
              profit,
              parseFloat(margin),
              studentCount,
              units,
              srPremium,
              tutorcruncherUrl,
              'open'
            ]
          );
          alertRecordId = insertResult.rows[0].id;
          logger.info({ alertRecordId }, '💾 Alert saved to database');
        } catch (dbError) {
          logger.error({ error: dbError.message }, '❌ Error saving alert to database');
          // Continue even if database save fails - still send email
        }

        logger.info({ lessonId: id }, '🚨 Bad margin detected, sending alert email');
        const emailRecipients = Array.isArray(alertConfig.alert_emails)
          ? alertConfig.alert_emails.join(', ')
          : alertConfig.alert_emails || 'support@acmeops.com';

        const mailOptions = {
          from: '"Acme Operations" <support@acmeops.com>',
          to: emailRecipients,
          subject: `🚨 Bad Margin Alert - Lesson ${id}`,
          html: `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f9f9f9; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  <!-- Header -->
                  <div style="background-color: #dc3545; color: white; padding: 15px; text-align: center; border-radius: 6px;">
                    <h2 style="margin: 0;">🚨 Bad Margin Alert</h2>
                  </div>
                  <!-- Lesson Details -->
                  <div style="padding: 20px;">
                    <p style="font-size: 18px; font-weight: bold; color: #dc3545;">
                      ⚠️ Admin, please review this low-margin lesson.
                    </p>
                    <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Lesson ID:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">
                          <a href="https://account.acmeops.com/cal/appointments/${id}/" target="_blank" style="color: #007bff; text-decoration: none; font-weight: bold;">
                            ${id}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Tutor Name:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${cjas[0]?.name || 'Unknown'}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Margin:</td>
                        <td style="padding: 10px; border: 1px solid #ddd; color: ${margin < 0 ? '#dc3545' : '#ff9800'}; font-weight: bold;">
                          ${margin}%
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Base Tutor Cost:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">$${baseTutorCost.toFixed(2)}</td>
                      </tr>
                      ${studentPremium > 0 ? `
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Student Premium:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">$${studentPremium.toFixed(2)} (${studentCount} students × $${srPremium.toFixed(2)} × ${units} units)</td>
                      </tr>
                      ` : ''}
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Total Tutor Cost:</td>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">$${totalTutorCost.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Total Revenue:</td>
                        <td style="padding: 10px; border: 1px solid #ddd;">$${totalRevenue.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">Profit/Loss:</td>
                        <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: ${profit < 0 ? '#dc3545' : '#4CAF50'};">
                          $${profit.toFixed(2)}
                        </td>
                      </tr>
                    </table>
                    <p style="margin-top: 20px; text-align: center; font-weight: bold;">
                      🔍 Please investigate this issue to ensure profitability.
                    </p>
                  </div>
                  <!-- Footer -->
                  <div style="background-color: #6a469d; color: white; text-align: center; padding: 10px; border-radius: 6px;">
                    <p style="margin: 0;">📋 Acme Operations System Logs</p>
                  </div>
                </div>
              </body>
            </html>
          `
        };
        const emailSender = getEmailSender();
        if (emailSender) {
          await emailSender.sendEmail({
            to: mailOptions.to,
            subject: mailOptions.subject,
            html: mailOptions.html,
            tags: ['bad-margin-alert'],
          });
          logger.info({ lessonId: id }, '✅ Alert email sent');
        } else {
          logger.warn({ lessonId: id }, '⚠️ Brevo email sender not available — bad margin alert not sent');
        }
      } else {
        logger.info({ lessonId: id }, '✅ Lesson processed, margin is healthy');
      }
    }

    res.status(200).json({
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    logger.error({ err: error }, '❌ Error processing webhook');
    res.status(500).json({
      message: 'Internal server error',
      error: error.message
    });
  }
});

module.exports = router;
