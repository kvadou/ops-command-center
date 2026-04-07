const express = require('express');
const router = express.Router();
const { logger } = require('../../utils/logger');

// Missive webhook handler
router.post('/', async (req, res) => {
  const crypto = require('crypto');

  // Validate webhook signature BEFORE responding
  const MISSIVE_WEBHOOK_SECRET = process.env.MISSIVE_WEBHOOK_SECRET;
  if (!MISSIVE_WEBHOOK_SECRET) {
    logger.error('MISSIVE_WEBHOOK_SECRET not configured — rejecting webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-hook-signature'];
  if (!signature) {
    logger.error('Missive webhook missing x-hook-signature header');
    return res.status(401).json({ error: 'Missing signature' });
  }

  const computedSignature = 'sha256=' + crypto
    .createHmac('sha256', MISSIVE_WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))) {
      logger.error('Missive webhook signature validation failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }
  } catch {
    logger.error('Missive webhook signature comparison error');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  logger.info('Missive webhook signature validated');

  // Respond after verification to prevent Missive timeout (15 second limit)
  res.status(200).json({ success: true, message: 'Webhook received' });

  // Use location-aware database pool
  const pool = req.locationPool || global.pool;
  const location = req.location || 'production';

  logger.info({ location }, 'Processing Missive webhook');

  // Process webhook asynchronously (non-blocking)
  setImmediate(async () => {
    try {
      const webhookData = req.body;

      // Extract conversation and message/comment data
      const rule = webhookData.rule || {};
      const conversation = webhookData.conversation || {};
      // Missive sends message data in 'message' field (not 'latest_message')
      const latestMessage = webhookData.message || webhookData.latest_message || {};
      const ruleType = rule.type; // incoming_email, new_comment, etc.

      const conversationId = conversation.id;

      if (!conversationId) {
        logger.warn('⚠️  Missive webhook missing conversation ID');
        return;
      }

      // Handle different webhook types
      let messageId = null;
      let messageType = null;
      let messageSubject = null;
      let messagePreview = null;
      let messageDeliveredAt = null;
      let messageCreatedAt = null;
      let messageUpdatedAt = null;
      let emailMessageId = null;
      let fromAddress = null;
      let fromName = null;
      let toAddresses = [];
      let ccAddresses = [];
      let bccAddresses = [];
      let commentAuthor = null;
      let commentText = null;

      if (ruleType === 'new_comment') {
        // For comments, Missive sends the comment in a separate 'comment' field
        // (not in latest_message, which is the latest email in the conversation)
        const comment = webhookData.comment || {};
        messageId = comment.id || null;
        messageType = 'comment';
        messagePreview = comment.body || comment.text || null;
        commentText = comment.body || comment.text || null;
        messageCreatedAt = comment.created_at ? new Date(comment.created_at * 1000) : null;
        messageUpdatedAt = comment.updated_at ? new Date(comment.updated_at * 1000) : null;

        // Comment author info
        const author = comment.author || {};
        commentAuthor = author.name || author.email || null;
        fromName = author.name || null;
        fromAddress = author.email || author.address || null;

        // For comments, subject is usually the conversation subject
        messageSubject = conversation.subject || 'Comment';

        logger.info({ commentPreview: commentText ? commentText.substring(0, 50) : null, commentAuthor }, '💬 Processing comment');
      } else {
        // For emails/messages
        messageId = latestMessage.id || null;
        messageType = latestMessage.type || 'email';
        messageSubject = latestMessage.subject || conversation.subject || null;
        messagePreview = latestMessage.preview || null;
        messageDeliveredAt = latestMessage.delivered_at ? new Date(latestMessage.delivered_at * 1000) : null;
        messageCreatedAt = latestMessage.created_at ? new Date(latestMessage.created_at * 1000) : null;
        messageUpdatedAt = latestMessage.updated_at ? new Date(latestMessage.updated_at * 1000) : null;
        emailMessageId = latestMessage.email_message_id || null;

        // Extract participant emails
        const fromField = latestMessage.from_field || {};
        const toFields = latestMessage.to_fields || [];
        const ccFields = latestMessage.cc_fields || [];
        const bccFields = latestMessage.bcc_fields || [];

        fromAddress = fromField.address || null;
        fromName = fromField.name || null;
        toAddresses = toFields.map(f => f.address).filter(Boolean);
        ccAddresses = ccFields.map(f => f.address).filter(Boolean);
        bccAddresses = bccFields.map(f => f.address).filter(Boolean);
      }

      // Try to match to a client by email
      let clientId = null;
      let clientEmail = null;

      // Check from address first, then to addresses (exclude internal team emails)
      const internalDomains = ['acmeops.com', 'chessat3.com'];
      const emailsToCheck = [fromAddress, ...toAddresses]
        .filter(Boolean)
        .filter(email => !internalDomains.some(domain => email.toLowerCase().endsWith(domain)));

      for (const email of emailsToCheck) {
        try {
          // First check clients table
          const { rows } = await pool.query(
            'SELECT id, email FROM clients WHERE LOWER(email) = $1 LIMIT 1',
            [email.toLowerCase()]
          );

          if (rows.length > 0) {
            clientId = rows[0].id;
            clientEmail = rows[0].email;
            logger.info({ clientId, clientEmail }, '✅ Matched Missive communication to client');
            break;
          }

          // Also check booking_submissions for prospects not yet in clients table
          const { rows: bsRows } = await pool.query(
            `SELECT c.id, c.email FROM booking_submissions bs
             JOIN clients c ON c.client_id = bs.tc_client_id::text
             WHERE LOWER(bs.parent_email) = $1 LIMIT 1`,
            [email.toLowerCase()]
          );

          if (bsRows.length > 0) {
            clientId = bsRows[0].id;
            clientEmail = bsRows[0].email || email;
            logger.info({ clientId, email }, '✅ Matched Missive communication to client via booking_submissions');
            break;
          }

          // If no client match, still store the external email for potential future matching
          if (!clientEmail) {
            clientEmail = email.toLowerCase();
            logger.info({ clientEmail }, '📧 Storing Missive communication with external email (no client match)');
          }
        } catch (error) {
          logger.error({ email, error: error.message }, '⚠️  Error matching client for email');
        }
      }

      // Store the communication
      await pool.query(`
        INSERT INTO missive_communications (
          missive_conversation_id,
          missive_message_id,
          rule_id,
          rule_type,
          conversation_subject,
          conversation_organization_id,
          conversation_organization_name,
          conversation_team_id,
          conversation_team_name,
          message_type,
          message_subject,
          message_preview,
          message_delivered_at,
          message_created_at,
          message_updated_at,
          email_message_id,
          from_name,
          from_address,
          to_addresses,
          cc_addresses,
          bcc_addresses,
          comment_text,
          comment_author,
          client_email,
          client_id,
          webhook_data
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        ON CONFLICT (missive_conversation_id, missive_message_id)
        WHERE missive_message_id IS NOT NULL
        DO UPDATE SET
          message_updated_at = EXCLUDED.message_updated_at,
          comment_text = EXCLUDED.comment_text,
          webhook_data = EXCLUDED.webhook_data,
          updated_at = NOW()
      `, [
        conversationId,
        messageId || null,
        rule.id || null,
        ruleType || null,
        conversation.subject || null,
        conversation.organization?.id || null,
        conversation.organization?.name || null,
        conversation.team?.id || null,
        conversation.team?.name || null,
        messageType || null,
        messageSubject || null,
        messagePreview || null,
        messageDeliveredAt || null,
        messageCreatedAt || null,
        messageUpdatedAt || null,
        emailMessageId || null,
        fromName || null,
        fromAddress || null,
        toAddresses.length > 0 ? toAddresses : null,
        ccAddresses.length > 0 ? ccAddresses : null,
        bccAddresses.length > 0 ? bccAddresses : null,
        commentText || null,
        commentAuthor || null,
        clientEmail || null,
        clientId || null,
        JSON.stringify(webhookData)
      ]);

      logger.info({ conversationId, messageId }, '✅ Stored Missive communication');

    } catch (error) {
      logger.error({ err: error }, '❌ Error processing Missive webhook');
      logger.error({ stack: error.stack }, 'Error stack');
      logger.error({ webhookData: JSON.stringify(req.body, null, 2).substring(0, 500) }, 'Webhook data');
    }
  });
});

module.exports = router;
