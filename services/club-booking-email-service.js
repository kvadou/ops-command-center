/**
 * Club Booking Email Service
 * Sends branded club booking confirmation emails with venue logistics.
 */

const { logger } = require('../utils/logger');
const { getInstance: getBrevoInstance } = require('../utils/brevo-email-sender');

class ClubBookingEmailService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Send a branded club booking confirmation email with venue logistics.
   * Non-blocking: catches errors internally and logs them without throwing.
   *
   * @param {Object} params
   * @param {string} params.parentEmail - Recipient email
   * @param {string} params.parentName  - Parent display name
   * @param {string} params.childName   - Child first name
   * @param {string} params.bookingType - 'trial' or 'single'
   * @param {string} params.clubSlug    - Club slug (e.g. 'park-slope')
   * @param {string} params.sessionDate - ISO date string or displayable date
   * @param {number} params.amountPaid  - Dollar amount charged
   */
  async sendConfirmation(params) {
    const {
      parentEmail,
      parentName,
      childName,
      bookingType,
      clubSlug,
      sessionDate,
      amountPaid,
    } = params;

    try {
      // 1. Fetch club details from DB
      const { rows } = await this.pool.query(
        `SELECT name, venue_name, venue_address, logistics_info,
                cancellation_policy, contact_email, contact_phone
           FROM clubs
          WHERE slug = $1`,
        [clubSlug]
      );

      if (!rows.length) {
        logger.warn({ clubSlug }, 'Club not found for booking confirmation email');
        return;
      }

      const club = rows[0];

      // 2. Format the date
      const formattedDate = this._formatDate(sessionDate);

      // 3. Build the HTML
      const isTrial = bookingType === 'trial';
      const subject = isTrial
        ? `Your Trial Class at ${club.name} is Confirmed!`
        : `Your Class at ${club.name} is Confirmed!`;

      const html = this._buildHtml({
        parentName,
        childName,
        isTrial,
        formattedDate,
        club,
        amountPaid,
      });

      // 4. Send via Brevo
      const brevo = getBrevoInstance();
      if (!brevo) {
        logger.warn('Brevo email sender not available, skipping club confirmation email');
        return;
      }

      const result = await brevo.sendEmail({
        to: parentEmail,
        subject,
        html,
      });

      if (result.success) {
        logger.info(
          { parentEmail, clubSlug, bookingType, messageId: result.messageId },
          'Club booking confirmation email sent'
        );
      } else {
        logger.error(
          { parentEmail, clubSlug, error: result.error },
          'Club booking confirmation email failed via Brevo'
        );
      }
    } catch (err) {
      logger.error(
        { err, parentEmail, clubSlug },
        'Club booking confirmation email failed unexpectedly'
      );
    }
  }

  /**
   * Format a date string into a human-readable form.
   * @param {string} dateStr - ISO date or displayable string
   * @returns {string}
   */
  _formatDate(dateStr) {
    if (!dateStr) return 'TBD';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Build the branded HTML email body.
   * @private
   */
  _buildHtml({ parentName, childName, isTrial, formattedDate, club, amountPaid }) {
    const classLabel = isTrial ? 'trial class' : 'class';
    const firstName = (parentName || '').split(' ')[0] || 'there';

    const logisticsSection = club.logistics_info
      ? `
        <tr>
          <td style="padding: 24px 32px;">
            <h2 style="margin: 0 0 12px; font-size: 18px; color: #2D2F8E;">Getting There</h2>
            <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">${this._escapeHtml(club.logistics_info)}</p>
          </td>
        </tr>`
      : '';

    const cancellationSection = club.cancellation_policy
      ? `
        <tr>
          <td style="padding: 0 32px 24px;">
            <h2 style="margin: 0 0 12px; font-size: 18px; color: #2D2F8E;">Cancellation Policy</h2>
            <p style="margin: 0; font-size: 14px; color: #666; line-height: 1.6;">${this._escapeHtml(club.cancellation_policy)}</p>
          </td>
        </tr>`
      : '';

    const contactEmail = club.contact_email || 'support@acmeops.com';
    const contactPhone = club.contact_phone || '';

    const contactPhoneHtml = contactPhone
      ? `<br/>Phone: <a href="tel:${contactPhone}" style="color: #6A469D; text-decoration: none;">${contactPhone}</a>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 32px 32px 28px; text-align: center;">
              <h1 style="margin: 0 0 4px; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">Acme Operations</h1>
              <p style="margin: 0; font-size: 14px; color: #E8FBFF; font-style: italic;">Chess Through Storytelling</p>
            </td>
          </tr>

          <!-- Confirmation Greeting -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 32px;">&#9813;</p>
              <h2 style="margin: 0 0 8px; font-size: 22px; color: #2D2F8E;">Your ${classLabel} is confirmed!</h2>
              <p style="margin: 0; font-size: 16px; color: #555;">Hi ${this._escapeHtml(firstName)}, we can't wait to see ${this._escapeHtml(childName || 'your child')} on the board!</p>
            </td>
          </tr>

          <!-- Class Details Box -->
          <tr>
            <td style="padding: 8px 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #E8FBFF; border-radius: 8px; border: 1px solid #d0e8ef;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <h3 style="margin: 0 0 16px; font-size: 16px; color: #2D2F8E; text-transform: uppercase; letter-spacing: 1px;">Class Details</h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Date</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._escapeHtml(formattedDate)}</td>
                      </tr>
                      ${club.venue_name ? `<tr>
                        <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Venue</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._escapeHtml(club.venue_name)}</td>
                      </tr>` : ''}
                      ${club.venue_address ? `<tr>
                        <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Address</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #222;">${this._escapeHtml(club.venue_address)}</td>
                      </tr>` : ''}
                      <tr>
                        <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Student</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._escapeHtml(childName || 'Your child')}</td>
                      </tr>
                      <tr>
                        <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Amount Paid</td>
                        <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">$${Number(amountPaid || 0).toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What to Expect -->
          <tr>
            <td style="padding: 0 32px 24px;">
              <h2 style="margin: 0 0 12px; font-size: 18px; color: #2D2F8E;">What to Expect</h2>
              <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
                Our classes use storytelling and interactive play to teach chess fundamentals.
                ${isTrial
                  ? 'During the trial, your child will experience a fun, introductory session designed for beginners and returning players alike. No prior chess knowledge is needed!'
                  : 'Each session builds on previous lessons with engaging stories and guided play. Students progress at their own pace in a supportive group setting.'}
              </p>
            </td>
          </tr>

          <!-- Getting There (conditional) -->
          ${logisticsSection}

          <!-- Cancellation Policy (conditional) -->
          ${cancellationSection}

          <!-- Contact Footer -->
          <tr>
            <td style="padding: 24px 32px; border-top: 1px solid #eee;">
              <p style="margin: 0; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
                Questions? Reach us at
                <a href="mailto:${contactEmail}" style="color: #6A469D; text-decoration: none;">${contactEmail}</a>${contactPhoneHtml}
              </p>
            </td>
          </tr>

          <!-- Brand Footer -->
          <tr>
            <td style="background-color: #2D2F8E; padding: 20px 32px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 14px; color: #E8FBFF; font-weight: 600;">Acme Operations</p>
              <p style="margin: 0; font-size: 12px; color: #a0a0cc;">Learn chess through the power of storytelling</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Escape HTML special characters to prevent XSS in email content.
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = ClubBookingEmailService;
