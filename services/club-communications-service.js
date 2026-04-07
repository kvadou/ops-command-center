/**
 * Club Communications Service
 *
 * Handles automated club communications:
 *  - Class reminders (24h before, configurable)
 *  - Missed class follow-ups
 *  - Trial follow-up sequences (3-email drip)
 *  - Pack depletion alerts (placeholder)
 *
 * All sends are idempotent -- checks club_communications_log before sending.
 */

const { logger } = require('../utils/logger');
const { getInstance: getBrevoInstance } = require('../utils/brevo-email-sender');

class ClubCommunicationsService {
  constructor(pool) {
    this.pool = pool;
  }

  // ---------------------------------------------------------------------------
  // 1. Class Reminders
  // ---------------------------------------------------------------------------

  /**
   * Send class reminder emails for upcoming appointments within the configured
   * window (default 24 hours) for a given club.
   */
  async sendClassReminders(clubId) {
    const settings = await this.getAutomationSettings(clubId);
    if (!settings || !settings.class_reminders_enabled) {
      logger.info({ clubId }, 'Club class reminders disabled, skipping');
      return { sent: 0, skipped: 0 };
    }

    const hoursBefore = settings.reminder_hours_before || 24;

    // Fetch club details for email content
    const club = await this._getClub(clubId);
    if (!club) {
      logger.warn({ clubId }, 'Club not found for class reminders');
      return { sent: 0, skipped: 0 };
    }

    // Find upcoming appointments for this club's services within the reminder window.
    // Join services via label matching on the club's service_labels.
    const { rows: upcomingStudents } = await this.pool.query(
      `SELECT
         a.appointment_id,
         a.start,
         a.finish,
         s.name AS service_name,
         ar.recipient_id,
         r.first_name AS child_first_name,
         r.last_name AS child_last_name,
         r.email AS recipient_email,
         r.paying_client_id
       FROM appointments a
       JOIN services s ON a.service_id = s.service_id
       JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
       JOIN recipients r ON ar.recipient_id::text = r.recipient_id::text
       WHERE a.start > NOW()
         AND a.start <= NOW() + ($1 || ' hours')::interval
         AND a.status = 'planned'
         AND (a.is_deleted IS NULL OR a.is_deleted = false)
         AND EXISTS (
           SELECT 1 FROM clubs c
           WHERE c.id = $2
             AND s.labels::text LIKE '%' || (c.service_labels->>0) || '%'
         )`,
      [hoursBefore, clubId]
    );

    let sent = 0;
    let skipped = 0;

    for (const student of upcomingStudents) {
      const referenceId = `${student.appointment_id}-${student.recipient_id}`;

      if (await this._alreadySent('class_reminder', referenceId)) {
        skipped++;
        continue;
      }

      const parentEmail = await this._getParentEmail(student.recipient_id, student.recipient_email, student.paying_client_id);
      if (!parentEmail) {
        logger.warn({ recipientId: student.recipient_id }, 'No parent email found for class reminder');
        skipped++;
        continue;
      }

      const subject = `Reminder: ${student.child_first_name}'s Chess Class Tomorrow`;
      const html = this._buildReminderHtml({
        childName: student.child_first_name,
        classDate: student.start,
        classEnd: student.finish,
        serviceName: student.service_name,
        club,
      });

      const result = await this._sendEmail(parentEmail, subject, html);

      await this._logCommunication({
        clubId,
        recipientId: student.recipient_id,
        email: parentEmail,
        communicationType: 'class_reminder',
        referenceId,
        subject,
        status: result.success ? 'sent' : 'failed',
        metadata: { appointmentId: student.appointment_id, messageId: result.messageId || null },
      });

      if (result.success) sent++;
      else skipped++;
    }

    logger.info({ clubId, sent, skipped, total: upcomingStudents.length }, 'Class reminders processed');
    return { sent, skipped };
  }

  // ---------------------------------------------------------------------------
  // 2. Missed Class Follow-ups
  // ---------------------------------------------------------------------------

  /**
   * Send follow-up emails for students who missed a class in the last 24 hours.
   */
  async sendMissedClassFollowups(clubId) {
    const settings = await this.getAutomationSettings(clubId);
    if (!settings || !settings.missed_class_followup_enabled) {
      logger.info({ clubId }, 'Club missed class followup disabled, skipping');
      return { sent: 0, skipped: 0 };
    }

    const club = await this._getClub(clubId);
    if (!club) {
      logger.warn({ clubId }, 'Club not found for missed class followups');
      return { sent: 0, skipped: 0 };
    }

    // Appointments completed in last 24h where student status = 'missed'
    const { rows: missedStudents } = await this.pool.query(
      `SELECT
         a.appointment_id,
         a.start,
         s.name AS service_name,
         ar.recipient_id,
         r.first_name AS child_first_name,
         r.last_name AS child_last_name,
         r.email AS recipient_email,
         r.paying_client_id
       FROM appointments a
       JOIN services s ON a.service_id = s.service_id
       JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
       JOIN recipients r ON ar.recipient_id::text = r.recipient_id::text
       WHERE a.finish >= NOW() - INTERVAL '24 hours'
         AND a.finish < NOW()
         AND a.status IN ('complete', 'completed')
         AND ar.status = 'missed'
         AND (a.is_deleted IS NULL OR a.is_deleted = false)
         AND EXISTS (
           SELECT 1 FROM clubs c
           WHERE c.id = $1
             AND s.labels::text LIKE '%' || (c.service_labels->>0) || '%'
         )`,
      [clubId]
    );

    let sent = 0;
    let skipped = 0;

    for (const student of missedStudents) {
      const referenceId = `${student.appointment_id}-${student.recipient_id}`;

      if (await this._alreadySent('missed_class_followup', referenceId)) {
        skipped++;
        continue;
      }

      const parentEmail = await this._getParentEmail(student.recipient_id, student.recipient_email, student.paying_client_id);
      if (!parentEmail) {
        logger.warn({ recipientId: student.recipient_id }, 'No parent email found for missed class followup');
        skipped++;
        continue;
      }

      const subject = `We Missed ${student.child_first_name} at Chess Class!`;
      const html = this._buildMissedClassHtml({
        childName: student.child_first_name,
        classDate: student.start,
        serviceName: student.service_name,
        club,
      });

      const result = await this._sendEmail(parentEmail, subject, html);

      await this._logCommunication({
        clubId,
        recipientId: student.recipient_id,
        email: parentEmail,
        communicationType: 'missed_class_followup',
        referenceId,
        subject,
        status: result.success ? 'sent' : 'failed',
        metadata: { appointmentId: student.appointment_id, messageId: result.messageId || null },
      });

      if (result.success) sent++;
      else skipped++;
    }

    logger.info({ clubId, sent, skipped, total: missedStudents.length }, 'Missed class followups processed');
    return { sent, skipped };
  }

  // ---------------------------------------------------------------------------
  // 3. Trial Follow-up Sequence
  // ---------------------------------------------------------------------------

  /**
   * Send a 3-email drip sequence for trial students:
   *   Day 1: "Thank you for trying!"         (trial_followup_1)
   *   Day 3: "Here's what [Child] learned"    (trial_followup_2)
   *   Day 7: "Ready to continue?"             (trial_followup_3)
   */
  async sendTrialFollowups(clubId) {
    const settings = await this.getAutomationSettings(clubId);
    if (!settings || !settings.trial_followup_enabled) {
      logger.info({ clubId }, 'Club trial followup disabled, skipping');
      return { sent: 0, skipped: 0 };
    }

    const club = await this._getClub(clubId);
    if (!club) {
      logger.warn({ clubId }, 'Club not found for trial followups');
      return { sent: 0, skipped: 0 };
    }

    // Trial students who have attended at least 1 session
    const { rows: trialStudents } = await this.pool.query(
      `SELECT
         cs.recipient_id,
         cs.last_attended,
         cs.sessions_attended,
         r.first_name AS child_first_name,
         r.last_name AS child_last_name,
         r.email AS recipient_email,
         r.paying_client_id
       FROM club_students cs
       JOIN recipients r ON cs.recipient_id::text = r.recipient_id::text
       WHERE cs.club_id = $1
         AND cs.status = 'trial'
         AND cs.sessions_attended >= 1
         AND cs.last_attended IS NOT NULL`,
      [clubId]
    );

    let sent = 0;
    let skipped = 0;

    // Each step: { days since trial, type suffix, subject builder, html builder }
    const steps = [
      {
        minDays: 1,
        maxDays: 2,
        type: 'trial_followup_1',
        subject: (name) => `Thank You for Trying Acme Operations, ${name}!`,
        buildHtml: (params) => this._buildTrialFollowupHtml({ ...params, step: 1 }),
      },
      {
        minDays: 3,
        maxDays: 4,
        type: 'trial_followup_2',
        subject: (name) => `Here's What ${name} Learned at Chess Class`,
        buildHtml: (params) => this._buildTrialFollowupHtml({ ...params, step: 2 }),
      },
      {
        minDays: 7,
        maxDays: 10,
        type: 'trial_followup_3',
        subject: (name) => `Ready to Continue? A Special Offer for ${name}`,
        buildHtml: (params) => this._buildTrialFollowupHtml({ ...params, step: 3 }),
      },
    ];

    for (const student of trialStudents) {
      const daysSinceTrial = Math.floor(
        (Date.now() - new Date(student.last_attended).getTime()) / (1000 * 60 * 60 * 24)
      );

      for (const step of steps) {
        if (daysSinceTrial < step.minDays || daysSinceTrial > step.maxDays) continue;

        const referenceId = `${clubId}-${student.recipient_id}-${step.type}`;

        if (await this._alreadySent(step.type, referenceId)) {
          skipped++;
          continue;
        }

        const parentEmail = await this._getParentEmail(student.recipient_id, student.recipient_email, student.paying_client_id);
        if (!parentEmail) {
          logger.warn({ recipientId: student.recipient_id }, `No parent email found for ${step.type}`);
          skipped++;
          continue;
        }

        const childName = student.child_first_name || 'your child';
        const subject = step.subject(childName);
        const html = step.buildHtml({ childName, club });

        const result = await this._sendEmail(parentEmail, subject, html);

        await this._logCommunication({
          clubId,
          recipientId: student.recipient_id,
          email: parentEmail,
          communicationType: step.type,
          referenceId,
          subject,
          status: result.success ? 'sent' : 'failed',
          metadata: { daysSinceTrial, messageId: result.messageId || null },
        });

        if (result.success) sent++;
        else skipped++;
      }
    }

    logger.info({ clubId, sent, skipped, total: trialStudents.length }, 'Trial followups processed');
    return { sent, skipped };
  }

  // ---------------------------------------------------------------------------
  // 4. Pack Depletion Alerts (placeholder)
  // ---------------------------------------------------------------------------

  /**
   * TODO: TutorCruncher manages packs externally -- we cannot directly query
   * remaining session counts yet. When TC exposes pack balance via API or
   * webhook, implement the check here.
   *
   * Expected behaviour: alert parents when remaining sessions <= threshold
   * (configurable in club_automation_settings.pack_depletion_threshold).
   */
  async sendPackDepletionAlerts(clubId) {
    const settings = await this.getAutomationSettings(clubId);
    if (!settings || !settings.pack_depletion_enabled) {
      logger.info({ clubId }, 'Club pack depletion alerts disabled, skipping');
      return { sent: 0, skipped: 0 };
    }

    // TODO: Implement once TC pack balance data is available
    logger.info(
      { clubId, threshold: settings.pack_depletion_threshold },
      'Pack depletion check skipped -- TC pack balance data not yet available'
    );

    return { sent: 0, skipped: 0 };
  }

  // ---------------------------------------------------------------------------
  // 5. Automation Settings CRUD
  // ---------------------------------------------------------------------------

  async getAutomationSettings(clubId) {
    const { rows } = await this.pool.query(
      `SELECT * FROM club_automation_settings WHERE club_id = $1`,
      [clubId]
    );
    return rows[0] || null;
  }

  async updateAutomationSettings(clubId, settings) {
    const allowedFields = [
      'class_reminders_enabled',
      'reminder_hours_before',
      'missed_class_followup_enabled',
      'trial_followup_enabled',
      'pack_depletion_enabled',
      'pack_depletion_threshold',
      'win_back_enabled',
      'win_back_days_inactive',
    ];

    // Build dynamic SET clause from allowed fields only
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (settings[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(settings[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return this.getAutomationSettings(clubId);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(clubId);

    const { rows } = await this.pool.query(
      `INSERT INTO club_automation_settings (club_id)
       VALUES ($${paramIndex})
       ON CONFLICT (club_id) DO UPDATE SET
         ${setClauses.join(', ')}
       RETURNING *`,
      values
    );

    logger.info({ clubId, updatedFields: setClauses.length - 1 }, 'Club automation settings updated');
    return rows[0];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if a communication has already been sent (idempotency guard).
   */
  async _alreadySent(communicationType, referenceId) {
    const { rows } = await this.pool.query(
      `SELECT 1 FROM club_communications_log
       WHERE communication_type = $1
         AND reference_id = $2
         AND status = 'sent'
       LIMIT 1`,
      [communicationType, referenceId]
    );
    return rows.length > 0;
  }

  /**
   * Log a communication attempt to club_communications_log.
   */
  async _logCommunication({ clubId, recipientId, clientId, email, communicationType, referenceId, subject, status, metadata }) {
    await this.pool.query(
      `INSERT INTO club_communications_log
         (club_id, recipient_id, client_id, email, communication_type, reference_id, subject, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        clubId,
        recipientId || null,
        clientId || null,
        email,
        communicationType,
        referenceId,
        subject,
        status || 'sent',
        JSON.stringify(metadata || {}),
      ]
    );
  }

  /**
   * Resolve the parent's email address.
   * Priority: recipients.email -> paying_client_id -> clients.email
   */
  async _getParentEmail(recipientId, recipientEmail, payingClientId) {
    // Direct recipient email takes priority if present
    if (recipientEmail) return recipientEmail;

    // Fall back to paying client's email
    if (payingClientId) {
      const { rows } = await this.pool.query(
        `SELECT email FROM clients WHERE client_id = $1`,
        [String(payingClientId)]
      );
      if (rows[0]?.email) return rows[0].email;
    }

    // Last resort: look up paying_client_id from recipients table
    const { rows: recipientRows } = await this.pool.query(
      `SELECT r.paying_client_id, c.email
       FROM recipients r
       LEFT JOIN clients c ON c.client_id = CAST(r.paying_client_id AS VARCHAR)
       WHERE r.recipient_id::text = $1`,
      [String(recipientId)]
    );
    return recipientRows[0]?.email || null;
  }

  /**
   * Fetch club details by ID.
   */
  async _getClub(clubId) {
    const { rows } = await this.pool.query(
      `SELECT id, name, slug, venue_name, venue_address, logistics_info,
              cancellation_policy, contact_email, contact_phone, service_labels
       FROM clubs WHERE id = $1`,
      [clubId]
    );
    return rows[0] || null;
  }

  /**
   * Send an email via Brevo. Returns { success, messageId }.
   */
  async _sendEmail(to, subject, html) {
    const brevo = getBrevoInstance();
    if (!brevo) {
      logger.warn('Brevo email sender not available, skipping club communication email');
      return { success: false, messageId: null };
    }

    try {
      const result = await brevo.sendEmail({ to, subject, html });
      if (!result.success) {
        logger.error({ to, subject, error: result.error }, 'Club communication email failed via Brevo');
      }
      return { success: result.success, messageId: result.messageId || null };
    } catch (err) {
      logger.error({ err, to, subject }, 'Club communication email threw unexpectedly');
      return { success: false, messageId: null };
    }
  }

  // ---------------------------------------------------------------------------
  // Email HTML Builders
  // ---------------------------------------------------------------------------

  _buildReminderHtml({ childName, classDate, classEnd, serviceName, club }) {
    const formattedDate = this._formatDateTime(classDate);
    const formattedEnd = classEnd ? this._formatTime(classEnd) : null;
    const timeRange = formattedEnd ? `${formattedDate} - ${formattedEnd}` : formattedDate;
    const contactEmail = club.contact_email || 'support@acmeops.com';

    return this._wrapInBrandTemplate(`
      <!-- Greeting -->
      <tr>
        <td style="padding: 32px 32px 16px; text-align: center;">
          <p style="margin: 0 0 8px; font-size: 32px;">&#9813;</p>
          <h2 style="margin: 0 0 8px; font-size: 22px; color: #2D2F8E;">Class Reminder</h2>
          <p style="margin: 0; font-size: 16px; color: #555;">
            ${this._esc(childName || 'Your child')}'s chess class is coming up!
          </p>
        </td>
      </tr>

      <!-- Details -->
      <tr>
        <td style="padding: 8px 32px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background-color: #E8FBFF; border-radius: 8px; border: 1px solid #d0e8ef;">
            <tr>
              <td style="padding: 20px 24px;">
                <h3 style="margin: 0 0 16px; font-size: 16px; color: #2D2F8E; text-transform: uppercase; letter-spacing: 1px;">Class Details</h3>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">When</td>
                    <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._esc(timeRange)}</td>
                  </tr>
                  ${club.venue_name ? `<tr>
                    <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Where</td>
                    <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._esc(club.venue_name)}</td>
                  </tr>` : ''}
                  ${club.venue_address ? `<tr>
                    <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Address</td>
                    <td style="padding: 6px 0; font-size: 15px; color: #222;">${this._esc(club.venue_address)}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding: 6px 0; font-size: 15px; color: #666; width: 110px; vertical-align: top;">Student</td>
                    <td style="padding: 6px 0; font-size: 15px; color: #222; font-weight: 600;">${this._esc(childName || 'Your child')}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- What to Bring -->
      <tr>
        <td style="padding: 0 32px 24px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #2D2F8E;">What to Bring</h2>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
            Just bring ${this._esc(childName || 'your child')} and a smile!
            We provide all chess sets and materials. Please arrive 5 minutes early so we can start on time.
          </p>
        </td>
      </tr>

      ${club.logistics_info ? `
      <tr>
        <td style="padding: 0 32px 24px;">
          <h2 style="margin: 0 0 12px; font-size: 18px; color: #2D2F8E;">Getting There</h2>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">${this._esc(club.logistics_info)}</p>
        </td>
      </tr>` : ''}

      <!-- Contact -->
      <tr>
        <td style="padding: 24px 32px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
            Need to cancel or reschedule? Reply to this email or contact us at
            <a href="mailto:${contactEmail}" style="color: #6A469D; text-decoration: none;">${contactEmail}</a>
          </p>
        </td>
      </tr>
    `);
  }

  _buildMissedClassHtml({ childName, classDate, serviceName, club }) {
    const formattedDate = this._formatDate(classDate);
    const contactEmail = club.contact_email || 'support@acmeops.com';

    return this._wrapInBrandTemplate(`
      <!-- Greeting -->
      <tr>
        <td style="padding: 32px 32px 16px; text-align: center;">
          <p style="margin: 0 0 8px; font-size: 32px;">&#9813;</p>
          <h2 style="margin: 0 0 8px; font-size: 22px; color: #2D2F8E;">We Missed ${this._esc(childName || 'Your Child')}!</h2>
          <p style="margin: 0; font-size: 16px; color: #555;">
            We noticed ${this._esc(childName || 'your child')} wasn't at chess class on ${this._esc(formattedDate)}.
          </p>
        </td>
      </tr>

      <!-- Message -->
      <tr>
        <td style="padding: 8px 32px 24px;">
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.6;">
            We hope everything is okay! Our classes build on each other through stories and games,
            so we'd love to see ${this._esc(childName || 'them')} back next week to keep the momentum going.
          </p>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
            If you'd like to book a make-up class, just reply to this email and we'll find a time that works.
          </p>
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="padding: 0 32px 32px; text-align: center;">
          <a href="mailto:${contactEmail}?subject=Make-up%20Class%20for%20${encodeURIComponent(childName || 'my child')}"
             style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%);
                    color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
            Book a Make-Up Class
          </a>
        </td>
      </tr>

      <!-- Contact -->
      <tr>
        <td style="padding: 24px 32px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
            Questions? Reach us at
            <a href="mailto:${contactEmail}" style="color: #6A469D; text-decoration: none;">${contactEmail}</a>
          </p>
        </td>
      </tr>
    `);
  }

  _buildTrialFollowupHtml({ childName, club, step }) {
    const contactEmail = club.contact_email || 'support@acmeops.com';
    const safeChildName = this._esc(childName || 'your child');

    const stepContent = {
      // Step 1 - Day 1: Thank you
      1: {
        heading: 'Thank You for Joining Us!',
        body: `
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.6;">
            We had a wonderful time meeting ${safeChildName} at chess class! Our unique approach
            uses storytelling to make chess fun and accessible for kids of all ages.
          </p>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
            We'd love to have ${safeChildName} continue the adventure. Each week brings new
            stories, new strategies, and new friendships on the board.
          </p>`,
        cta: null,
      },

      // Step 2 - Day 3: What they learned
      2: {
        heading: `Here's What ${safeChildName} Learned`,
        body: `
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.6;">
            During the trial class, ${safeChildName} got an introduction to the world of chess
            through our story-based curriculum. Kids learn how each piece moves by following
            characters on exciting adventures.
          </p>
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.6;">
            In upcoming classes, ${safeChildName} will build on these foundations with new stories,
            practice games, and fun challenges that develop critical thinking and problem-solving skills.
          </p>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
            Ready to keep going? We'd love to save ${safeChildName}'s spot.
          </p>`,
        cta: 'Save My Spot',
      },

      // Step 3 - Day 7: Special offer
      3: {
        heading: `Ready to Continue, ${safeChildName}?`,
        body: `
          <p style="margin: 0 0 16px; font-size: 15px; color: #444; line-height: 1.6;">
            It's been a week since ${safeChildName}'s trial class, and we wanted to check in!
            Our students often tell us that the stories and games keep getting better each week.
          </p>
          <p style="margin: 0; font-size: 15px; color: #444; line-height: 1.6;">
            We'd love to welcome ${safeChildName} back to the board. Reply to this email and
            we'll help you find the perfect plan to continue the chess journey.
          </p>`,
        cta: 'Continue the Adventure',
      },
    };

    const content = stepContent[step] || stepContent[1];

    const ctaHtml = content.cta
      ? `<tr>
          <td style="padding: 0 32px 32px; text-align: center;">
            <a href="mailto:${contactEmail}?subject=Continuing%20Classes%20for%20${encodeURIComponent(childName || 'my child')}"
               style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%);
                      color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
              ${content.cta}
            </a>
          </td>
        </tr>`
      : '';

    return this._wrapInBrandTemplate(`
      <!-- Greeting -->
      <tr>
        <td style="padding: 32px 32px 16px; text-align: center;">
          <p style="margin: 0 0 8px; font-size: 32px;">&#9813;</p>
          <h2 style="margin: 0 0 8px; font-size: 22px; color: #2D2F8E;">${content.heading}</h2>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding: 8px 32px 24px;">
          ${content.body}
        </td>
      </tr>

      ${ctaHtml}

      <!-- Contact -->
      <tr>
        <td style="padding: 24px 32px; border-top: 1px solid #eee;">
          <p style="margin: 0; font-size: 14px; color: #888; line-height: 1.6; text-align: center;">
            Questions? Reach us at
            <a href="mailto:${contactEmail}" style="color: #6A469D; text-decoration: none;">${contactEmail}</a>
          </p>
        </td>
      </tr>
    `);
  }

  // ---------------------------------------------------------------------------
  // Brand Template Wrapper
  // ---------------------------------------------------------------------------

  /**
   * Wrap content sections in the STC branded email shell.
   * Matches the gradient header / footer style from club-booking-email-service.js.
   */
  _wrapInBrandTemplate(innerRows) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Acme Operations</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f7;">
    <tr>
      <td align="center" style="padding: 24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 32px 32px 28px; text-align: center;">
              <h1 style="margin: 0 0 4px; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">Acme Operations</h1>
              <p style="margin: 0; font-size: 14px; color: #E8FBFF; font-style: italic;">Chess Through Storytelling</p>
            </td>
          </tr>

          ${innerRows}

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

  // ---------------------------------------------------------------------------
  // Formatting Utilities
  // ---------------------------------------------------------------------------

  _formatDateTime(dateStr) {
    if (!dateStr) return 'TBD';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return String(dateStr);
    }
  }

  _formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  _formatDate(dateStr) {
    if (!dateStr) return 'TBD';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  }

  /**
   * Escape HTML special characters.
   */
  _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = ClubCommunicationsService;
