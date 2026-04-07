const express = require('express');
const router = express.Router();
const { tableExists } = require('../utils/schema-cache');

// Use the global pool from deps (which is environment-aware)
const {
  pool,
  axios,
  auth,
} = global;

// Get Brevo email sender
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Get current environment/location
const getCurrentLocation = (req) => {
  const location = req.location || 'production';
  return location;
};

// GET /api/school-email-campaigns/:schoolClientId/contacts - Get email contacts for a school
router.get('/:schoolClientId/contacts', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    
    const result = await locationPool.query(
      `SELECT * FROM school_email_contacts 
       WHERE school_client_id = $1 
       ORDER BY is_primary DESC, created_at DESC`,
      [schoolClientId]
    );
    
    res.json({ contacts: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school email contacts:');
    res.status(500).json({ error: 'Failed to fetch contacts', details: error.message });
  }
}));

// POST /api/school-email-campaigns/:schoolClientId/contacts - Add email contact
router.post('/:schoolClientId/contacts', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      contact_name,
      contact_role,
      email_address,
      phone,
      is_primary,
      preferred_contact_method,
      contact_type,
      notes
    } = req.body;
    
    // If this is set as primary, unset other primary contacts
    if (is_primary) {
      await locationPool.query(
        'UPDATE school_email_contacts SET is_primary = FALSE WHERE school_client_id = $1',
        [schoolClientId]
      );
    }
    
    const result = await locationPool.query(
      `INSERT INTO school_email_contacts (
        school_client_id, school_name, contact_name, contact_role, email_address,
        phone, is_primary, preferred_contact_method, contact_type, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        schoolClientId,
        req.body.school_name || 'Unknown School',
        contact_name,
        contact_role || 'admin',
        email_address,
        phone,
        is_primary || false,
        preferred_contact_method || 'email',
        contact_type || 'admin',
        notes,
        req.user?.email || 'system'
      ]
    );
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating school email contact:');
    res.status(500).json({ error: 'Failed to create contact', details: error.message });
  }
}));

// PUT /api/school-email-campaigns/contacts/:contactId - Update email contact
router.put('/contacts/:contactId', auth, asyncHandler(async (req, res) => {
  try {
    const { contactId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      contact_name,
      contact_role,
      email_address,
      phone,
      is_primary,
      preferred_contact_method,
      contact_type,
      is_active,
      notes
    } = req.body;
    
    // If setting as primary, unset other primary contacts
    if (is_primary) {
      const contactResult = await locationPool.query(
        'SELECT school_client_id FROM school_email_contacts WHERE id = $1',
        [contactId]
      );
      
      if (contactResult.rows.length > 0) {
        await locationPool.query(
          'UPDATE school_email_contacts SET is_primary = FALSE WHERE school_client_id = $1 AND id != $2',
          [contactResult.rows[0].school_client_id, contactId]
        );
      }
    }
    
    const result = await locationPool.query(
      `UPDATE school_email_contacts SET
        contact_name = COALESCE($1, contact_name),
        contact_role = COALESCE($2, contact_role),
        email_address = COALESCE($3, email_address),
        phone = COALESCE($4, phone),
        is_primary = COALESCE($5, is_primary),
        preferred_contact_method = COALESCE($6, preferred_contact_method),
        contact_type = COALESCE($7, contact_type),
        is_active = COALESCE($8, is_active),
        notes = COALESCE($9, notes),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *`,
      [
        contact_name,
        contact_role,
        email_address,
        phone,
        is_primary,
        preferred_contact_method,
        contact_type,
        is_active,
        notes,
        contactId
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    
    res.json({ contact: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating school email contact:');
    res.status(500).json({ error: 'Failed to update contact', details: error.message });
  }
}));

// DELETE /api/school-email-campaigns/contacts/:contactId - Delete email contact
router.delete('/contacts/:contactId', auth, asyncHandler(async (req, res) => {
  try {
    const { contactId } = req.params;
    const locationPool = req.locationPool || pool;
    
    await locationPool.query('DELETE FROM school_email_contacts WHERE id = $1', [contactId]);
    
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting school email contact:');
    res.status(500).json({ error: 'Failed to delete contact', details: error.message });
  }
}));

// GET /api/school-email-campaigns/:schoolClientId/schedules - Get email schedules for a school
router.get('/:schoolClientId/schedules', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    
    const result = await locationPool.query(
      `SELECT s.*, t.campaign_name, t.description, t.subject_template, t.body_template
       FROM school_email_campaign_schedules s
       LEFT JOIN school_email_campaign_templates t ON s.campaign_type = t.campaign_type
       WHERE s.school_client_id = $1
       ORDER BY s.campaign_type`,
      [schoolClientId]
    );
    
    res.json({ schedules: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school email schedules:');
    res.status(500).json({ error: 'Failed to fetch schedules', details: error.message });
  }
}));

// POST /api/school-email-campaigns/:schoolClientId/schedules - Create or update email schedule
router.post('/:schoolClientId/schedules', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      campaign_type,
      is_enabled,
      frequency,
      trigger_event,
      days_after_trigger,
      send_time,
      schedule_json,
      recipient_contact_ids,
      additional_emails,
      custom_subject,
      custom_body,
      notes
    } = req.body;
    
    // Get school name from request or database
    let schoolName = req.body.school_name;
    if (!schoolName) {
      const schoolResult = await locationPool.query(
        'SELECT school_name FROM school_email_contacts WHERE school_client_id = $1 LIMIT 1',
        [schoolClientId]
      );
      schoolName = schoolResult.rows[0]?.school_name || 'Unknown School';
    }
    
    // Calculate next scheduled date if enabled
    let nextScheduledAt = null;
    if (is_enabled && trigger_event && days_after_trigger !== undefined) {
      // This would need to be calculated based on trigger events
      // For now, we'll set it based on days_after_trigger
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + (days_after_trigger || 0));
      if (send_time) {
        const [hours, minutes] = send_time.split(':');
        nextDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      }
      nextScheduledAt = nextDate;
    }
    
    const result = await locationPool.query(
      `INSERT INTO school_email_campaign_schedules (
        school_client_id, school_name, campaign_type, is_enabled, frequency,
        trigger_event, days_after_trigger, send_time, schedule_json,
        recipient_contact_ids, additional_emails, custom_subject, custom_body,
        next_scheduled_at, created_by, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (school_client_id, campaign_type)
      DO UPDATE SET
        is_enabled = EXCLUDED.is_enabled,
        frequency = EXCLUDED.frequency,
        trigger_event = EXCLUDED.trigger_event,
        days_after_trigger = EXCLUDED.days_after_trigger,
        send_time = EXCLUDED.send_time,
        schedule_json = EXCLUDED.schedule_json,
        recipient_contact_ids = EXCLUDED.recipient_contact_ids,
        additional_emails = EXCLUDED.additional_emails,
        custom_subject = EXCLUDED.custom_subject,
        custom_body = EXCLUDED.custom_body,
        next_scheduled_at = EXCLUDED.next_scheduled_at,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING *`,
      [
        schoolClientId,
        schoolName,
        campaign_type,
        is_enabled !== undefined ? is_enabled : true,
        frequency || 'one-time',
        trigger_event,
        days_after_trigger || 0,
        send_time || '09:00:00',
        schedule_json ? JSON.stringify(schedule_json) : null,
        recipient_contact_ids || [],
        additional_emails || [],
        custom_subject,
        custom_body,
        nextScheduledAt,
        req.user?.email || 'system',
        notes
      ]
    );
    
    res.json({ schedule: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating/updating school email schedule:');
    res.status(500).json({ error: 'Failed to save schedule', details: error.message });
  }
}));

// GET /api/school-email-campaigns/templates - Get all email templates
router.get('/templates', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const { include_inactive } = req.query;
    
    // Check if table exists first (cached)
    const templatesExist = await tableExists(locationPool, 'school_email_campaign_templates');

    if (!templatesExist) {
      logger.error('Table school_email_campaign_templates does not exist. Migration needs to be run.');
      return res.status(500).json({ 
        error: 'Email templates table not found',
        details: 'The school_email_campaign_templates table does not exist. Please run the migration: node scripts/run-school-email-migration.js production'
      });
    }
    
    let query = 'SELECT * FROM school_email_campaign_templates';
    if (!include_inactive) {
      query += ' WHERE is_active = TRUE';
    }
    query += ' ORDER BY campaign_name';
    
    const result = await locationPool.query(query);
    
    res.json({ templates: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching email templates:');
    // Check if it's a "relation does not exist" error
    if (error.message && error.message.includes('does not exist')) {
      return res.status(500).json({ 
        error: 'Email templates table not found',
        details: 'The school_email_campaign_templates table does not exist. Please run the migration: node scripts/run-school-email-migration.js production'
      });
    }
    res.status(500).json({ error: 'Failed to fetch templates', details: error.message });
  }
}));

// POST /api/school-email-campaigns/templates - Create new email template
router.post('/templates', auth, asyncHandler(async (req, res) => {
  try {
    const locationPool = req.locationPool || pool;
    const {
      campaign_type,
      campaign_name,
      description,
      subject_template,
      body_template,
      from_name,
      from_email,
      default_days_after_trigger,
      default_send_time,
      is_active,
      requires_approval
    } = req.body;
    
    const result = await locationPool.query(
      `INSERT INTO school_email_campaign_templates (
        campaign_type, campaign_name, description, subject_template, body_template,
        from_name, from_email, default_days_after_trigger, default_send_time,
        is_active, requires_approval, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        campaign_type,
        campaign_name,
        description,
        subject_template,
        body_template,
        from_name || 'Acme Operations',
        from_email || 'support@acmeops.com',
        default_days_after_trigger || 0,
        default_send_time || '09:00:00',
        is_active !== false,
        requires_approval || false,
        req.user?.email || 'system'
      ]
    );
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error creating email template:');
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ error: 'Template with this campaign type already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create template', details: error.message });
    }
  }
}));

// PUT /api/school-email-campaigns/templates/:id - Update email template
router.put('/templates/:id', auth, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      campaign_name,
      description,
      subject_template,
      body_template,
      from_name,
      from_email,
      default_days_after_trigger,
      default_send_time,
      is_active,
      requires_approval
    } = req.body;
    
    const result = await locationPool.query(
      `UPDATE school_email_campaign_templates SET
        campaign_name = COALESCE($1, campaign_name),
        description = COALESCE($2, description),
        subject_template = COALESCE($3, subject_template),
        body_template = COALESCE($4, body_template),
        from_name = COALESCE($5, from_name),
        from_email = COALESCE($6, from_email),
        default_days_after_trigger = COALESCE($7, default_days_after_trigger),
        default_send_time = COALESCE($8, default_send_time),
        is_active = COALESCE($9, is_active),
        requires_approval = COALESCE($10, requires_approval),
        updated_at = NOW()
      WHERE id = $11
      RETURNING *`,
      [
        campaign_name,
        description,
        subject_template,
        body_template,
        from_name,
        from_email,
        default_days_after_trigger,
        default_send_time,
        is_active,
        requires_approval,
        id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error updating email template:');
    res.status(500).json({ error: 'Failed to update template', details: error.message });
  }
}));

// GET /api/school-email-campaigns/:schoolClientId/campaigns - Get email campaign history
router.get('/:schoolClientId/campaigns', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const { campaign_type, limit = 50 } = req.query;
    const locationPool = req.locationPool || pool;
    
    let query = `
      SELECT * FROM school_email_campaigns
      WHERE school_client_id = $1
    `;
    const params = [schoolClientId];
    
    if (campaign_type) {
      query += ` AND campaign_type = $2`;
      params.push(campaign_type);
      query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));
    } else {
      query += ` ORDER BY sent_at DESC LIMIT $2`;
      params.push(parseInt(limit));
    }
    
    const result = await locationPool.query(query, params);
    
    res.json({ campaigns: result.rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school email campaigns:');
    res.status(500).json({ error: 'Failed to fetch campaigns', details: error.message });
  }
}));

// POST /api/school-email-campaigns/:schoolClientId/send - Send email campaign
router.post('/:schoolClientId/send', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const locationPool = req.locationPool || pool;
    const {
      campaign_type,
      subject,
      body_html,
      body_text,
      recipient_emails,
      recipient_names,
      scheduled_for,
      schedule_id
    } = req.body;
    
    // Get school name
    const schoolResult = await locationPool.query(
      'SELECT school_name FROM school_email_contacts WHERE school_client_id = $1 LIMIT 1',
      [schoolClientId]
    );
    const schoolName = schoolResult.rows[0]?.school_name || 'Unknown School';
    
    // Get template for default values
    const templateResult = await locationPool.query(
      'SELECT * FROM school_email_campaign_templates WHERE campaign_type = $1',
      [campaign_type]
    );
    const template = templateResult.rows[0];
    
    // Determine if this should be scheduled or sent immediately
    const shouldSchedule = scheduled_for && new Date(scheduled_for) > new Date();
    const status = shouldSchedule ? 'scheduled' : 'pending';
    
    // Create campaign record
    const campaignResult = await locationPool.query(
      `INSERT INTO school_email_campaigns (
        school_client_id, school_name, campaign_type, schedule_id,
        subject, body_html, body_text, from_name, from_email,
        recipient_emails, recipient_names, status, scheduled_for, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        schoolClientId,
        schoolName,
        campaign_type,
        schedule_id || null,
        subject || template?.subject_template || 'Email from Acme Operations',
        body_html || template?.body_template || '',
        body_text || '',
        template?.from_name || 'Acme Operations',
        template?.from_email || 'support@acmeops.com',
        recipient_emails || [],
        recipient_names || [],
        status,
        scheduled_for || null,
        req.user?.email || 'system'
      ]
    );
    
    const campaign = campaignResult.rows[0];
    
    // If not scheduled, send immediately
    if (!shouldSchedule) {
      const location = getCurrentLocation(req);
      const brevoEmailSender = getBrevoEmailSender();
      
      if (!brevoEmailSender) {
        return res.status(500).json({ error: 'Brevo email sender not available' });
      }
      
      // Send email via Brevo
      const emailResult = await brevoEmailSender.sendEmail({
        to: recipient_emails,
        subject: campaign.subject,
        html: campaign.body_html,
        text: campaign.body_text || '',
        from: campaign.from_email,
        location: location
      });
      
      if (emailResult.success) {
        // Update campaign with Brevo message ID and sent status
        await locationPool.query(
          `UPDATE school_email_campaigns SET
            brevo_message_id = $1,
            status = 'sent',
            sent_at = NOW()
          WHERE id = $2`,
          [emailResult.messageId, campaign.id]
        );
        
        // Update schedule last_sent_at if schedule_id exists
        if (schedule_id) {
          await locationPool.query(
            `UPDATE school_email_campaign_schedules SET
              last_sent_at = NOW(),
              total_sent = total_sent + 1,
              next_scheduled_at = CASE
                WHEN frequency = 'weekly' THEN NOW() + INTERVAL '7 days'
                WHEN frequency = 'monthly' THEN NOW() + INTERVAL '1 month'
                ELSE NULL
              END
            WHERE id = $1`,
            [schedule_id]
          );
        }
        
        res.json({
          success: true,
          campaign: { ...campaign, brevo_message_id: emailResult.messageId, status: 'sent', sent_at: new Date() },
          message: 'Email sent successfully'
        });
      } else {
        // Update campaign with failed status
        await locationPool.query(
          `UPDATE school_email_campaigns SET
            status = 'failed'
          WHERE id = $1`,
          [campaign.id]
        );
        
        res.status(500).json({
          error: 'Failed to send email',
          details: emailResult.error
        });
      }
    } else {
      res.json({
        success: true,
        campaign: campaign,
        message: 'Email scheduled successfully'
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error sending school email campaign:');
    res.status(500).json({ error: 'Failed to send email campaign', details: error.message });
  }
}));

// GET /api/school-email-campaigns/:schoolClientId/analytics - Get email analytics
router.get('/:schoolClientId/analytics', auth, asyncHandler(async (req, res) => {
  try {
    const { schoolClientId } = req.params;
    const { period_start, period_end } = req.query;
    const locationPool = req.locationPool || pool;
    
    // Default to last 30 days if not specified
    const startDate = period_start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = period_end || new Date().toISOString().split('T')[0];
    
    // Get campaign statistics
    const statsResult = await locationPool.query(
      `SELECT 
        campaign_type,
        COUNT(*) as total_sent,
        COUNT(*) FILTER (WHERE status = 'sent') as sent_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        COUNT(*) FILTER (WHERE email_opened_at IS NOT NULL) as opened_count,
        COUNT(*) FILTER (WHERE email_clicked_at IS NOT NULL) as clicked_count,
        COUNT(*) FILTER (WHERE email_bounced_at IS NOT NULL) as bounced_count,
        AVG(engagement_score) as avg_engagement_score
      FROM school_email_campaigns
      WHERE school_client_id = $1
        AND sent_at >= $2::date
        AND sent_at <= $3::date
      GROUP BY campaign_type
      ORDER BY total_sent DESC`,
      [schoolClientId, startDate, endDate]
    );
    
    // Get overall statistics
    const overallResult = await locationPool.query(
      `SELECT 
        COUNT(*) as total_campaigns,
        COUNT(DISTINCT campaign_type) as campaign_types,
        COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
        COUNT(*) FILTER (WHERE email_opened_at IS NOT NULL) as total_opened,
        COUNT(*) FILTER (WHERE email_clicked_at IS NOT NULL) as total_clicked,
        AVG(engagement_score) as avg_engagement_score
      FROM school_email_campaigns
      WHERE school_client_id = $1
        AND sent_at >= $2::date
        AND sent_at <= $3::date`,
      [schoolClientId, startDate, endDate]
    );
    
    res.json({
      period: { start: startDate, end: endDate },
      overall: overallResult.rows[0] || {},
      by_campaign_type: statsResult.rows
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching school email analytics:');
    res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
  }
}));

module.exports = router;

