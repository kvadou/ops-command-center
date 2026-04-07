const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
const { logger } = require('../utils/logger');
const { auth } = global;
const router = express.Router();
router.post('/', asyncHandler(async (req, res) => {
  const {
    email,
    subject,
    message
  } = req.body;
  logger.info({ email, subject }, 'Email payload received');
  if (!email || !message) {
    return res.status(400).json({
      error: 'Email and message are required'
    });
  }
  try {
    const emailSender = getEmailSender();
    if (!emailSender) {
      logger.warn('Brevo email sender not available — BREVO_API_KEY not configured');
      return res.status(500).json({ error: 'Email service unavailable' });
    }
    const result = await emailSender.sendEmail({
      to: email,
      subject: subject || 'Tutor Monthly Report',
      html: message,
      replyTo: 'support@acmeops.com',
      tags: ['tutor-reports'],
    });
    logger.info({ messageId: result.messageId }, 'Email sent');
    res.status(200).json({
      message: 'Email sent successfully!'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error sending email');
    res.status(500).json({
      error: 'Failed to send email.'
    });
  }
}));
module.exports = router;