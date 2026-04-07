/**
 * Subscription Notification Service
 * Handles email notifications for subscription events:
 * - Enrollment confirmation
 * - Payment success
 * - Payment failure (with retry info and TutorCruncher link)
 * - Subscription cancellation
 * - Term completion
 */


const { logger } = require('../utils/logger');
const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
const { pool } = global;

class SubscriptionNotificationService {
  /**
   * Send enrollment confirmation email
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} config - Term billing config
   * @param {Object} options - Additional options (parentName, parentEmail, etc.)
   */
  async sendEnrollmentConfirmation(enrollment, config, options = {}) {
    try {
      const { parentName, parentEmail, studentName, paymentPlan } = options;
      
      const termName = config.term_name || 'Term';
      const totalLessons = config.total_lessons || 0;
      const classDates = config.class_dates || [];
      
      // Format class dates for display
      const formattedDates = classDates
        .slice(0, 10) // Show first 10 dates
        .map(dateStr => {
          const date = new Date(dateStr);
          return date.toLocaleDateString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          });
        });
      
      const paymentTypeText = paymentPlan === 'term' 
        ? 'Full Term Payment' 
        : 'Monthly Subscription';
      
      const subject = `Welcome to ${termName} - Enrollment Confirmed`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6A469D 0%, #2D2F8E 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #6A469D; }
            .dates-list { margin: 10px 0; }
            .dates-list li { margin: 5px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to Acme Operations!</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <p>Thank you for enrolling in <strong>${termName}</strong>!</p>
              
              <div class="info-box">
                <h3>Enrollment Details</h3>
                <p><strong>Student:</strong> ${studentName || 'Student'}</p>
                <p><strong>Payment Method:</strong> ${paymentTypeText}</p>
                <p><strong>Total Lessons:</strong> ${totalLessons}</p>
                <p><strong>Enrollment Date:</strong> ${new Date(enrollment.enrollment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
              
              ${paymentPlan === 'monthly' ? `
                <div class="info-box">
                  <h3>Monthly Billing</h3>
                  <p>Your subscription will automatically charge on the 1st of each month based on the number of lessons scheduled for that month.</p>
                  <p><strong>Next Billing Date:</strong> ${new Date(enrollment.first_billing_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
              ` : `
                <div class="info-box">
                  <h3>Term Payment</h3>
                  <p>Your full term payment has been processed. No further charges will be made.</p>
                </div>
              `}
              
              ${formattedDates.length > 0 ? `
                <div class="info-box">
                  <h3>Upcoming Class Dates</h3>
                  <ul class="dates-list">
                    ${formattedDates.map(date => `<li>${date}</li>`).join('')}
                    ${classDates.length > 10 ? `<li><em>... and ${classDates.length - 10} more dates</em></li>` : ''}
                  </ul>
                </div>
              ` : ''}
              
              <p>We're excited to have you join us! If you have any questions, please don't hesitate to reach out.</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Welcome to Acme Operations!

Hi ${parentName || 'Parent'},

Thank you for enrolling in ${termName}!

Enrollment Details:
- Student: ${studentName || 'Student'}
- Payment Method: ${paymentTypeText}
- Total Lessons: ${totalLessons}
- Enrollment Date: ${new Date(enrollment.enrollment_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

${paymentPlan === 'monthly' ? `
Monthly Billing:
Your subscription will automatically charge on the 1st of each month based on the number of lessons scheduled for that month.
Next Billing Date: ${new Date(enrollment.first_billing_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
` : `
Term Payment:
Your full term payment has been processed. No further charges will be made.
`}

${formattedDates.length > 0 ? `
Upcoming Class Dates:
${formattedDates.map(date => `- ${date}`).join('\n')}
${classDates.length > 10 ? `... and ${classDates.length - 10} more dates` : ''}
` : ''}

We're excited to have you join us! If you have any questions, please don't hesitate to reach out.

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-enrollment'],
        });
      } else {
        logger.warn(`⚠️ Brevo email sender not available — enrollment confirmation not sent to ${parentEmail}`);
      }

      logger.info(`✅ Enrollment confirmation email sent to ${parentEmail}`);
    } catch (error) {
      logger.error({ err: error }, 'Error sending enrollment confirmation:');
      throw error;
    }
  }

  /**
   * Send payment success notification
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} billingHistory - Billing history record
   * @param {Object} options - Additional options
   */
  async sendPaymentSuccess(enrollment, billingHistory, options = {}) {
    try {
      const { parentName, parentEmail } = options;
      
      // Get term config for context
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [enrollment.service_id]
      );
      const config = configResult.rows[0];
      if (config) {
        config.class_dates = JSON.parse(config.class_dates);
      }
      
      const termName = config?.term_name || 'Term';
      const amount = billingHistory.amount_charged || 0;
      const lessons = billingHistory.lessons_count || 0;
      const billingMonth = billingHistory.billing_month;
      
      const subject = `Payment Successful - ${termName}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #34B256 0%, #6A469D 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .success-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #34B256; }
            .amount { font-size: 32px; font-weight: bold; color: #34B256; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Successful</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <p>Your payment for <strong>${termName}</strong> has been processed successfully.</p>
              
              <div class="success-box">
                <p><strong>Billing Period:</strong> ${new Date(billingMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
                <p><strong>Lessons:</strong> ${lessons}</p>
                <p class="amount">$${amount.toFixed(2)}</p>
                <p><strong>Status:</strong> Paid</p>
              </div>
              
              ${enrollment.payment_type === 'monthly' ? `
                <p>Your next automatic payment will be processed on the 1st of next month.</p>
              ` : ''}
              
              <p>Thank you for your payment!</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Payment Successful

Hi ${parentName || 'Parent'},

Your payment for ${termName} has been processed successfully.

Billing Period: ${new Date(billingMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
Lessons: ${lessons}
Amount: $${amount.toFixed(2)}
Status: Paid

${enrollment.payment_type === 'monthly' ? 'Your next automatic payment will be processed on the 1st of next month.' : ''}

Thank you for your payment!

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-payment-success'],
        });
      } else {
        logger.warn(`⚠️ Brevo email sender not available — payment success email not sent to ${parentEmail}`);
      }

      logger.info(`✅ Payment success email sent to ${parentEmail}`);
    } catch (error) {
      logger.error({ err: error }, 'Error sending payment success notification:');
      throw error;
    }
  }

  /**
   * Send payment failure notification
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} failureRecord - Payment failure record
   * @param {Object} options - Additional options
   */
  async sendPaymentFailure(enrollment, failureRecord, options = {}) {
    try {
      const { parentName, parentEmail, retryCount, maxRetries } = options;
      
      // Get term config
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [enrollment.service_id]
      );
      const config = configResult.rows[0];
      const termName = config?.term_name || 'Term';
      
      const amount = failureRecord.amount || 0;
      const errorMessage = failureRecord.error_message || 'Payment processing failed';
      const attemptsRemaining = maxRetries - retryCount;
      
      const subject = `Action Required: Payment Failed for ${termName}`;
      
      // TutorCruncher link for updating payment method
      const tutorcruncherLink = `https://secure.tutorcruncher.com/account/payment-methods/`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #DA2E72 0%, #F79A30 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert-box { background: #fff3cd; border: 2px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 8px; }
            .action-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #DA2E72; }
            .button { display: inline-block; background: #6A469D; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Failed</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <div class="alert-box">
                <h3>⚠️ Action Required</h3>
                <p>We were unable to process your payment for <strong>${termName}</strong>.</p>
                <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
                <p><strong>Error:</strong> ${errorMessage}</p>
              </div>
              
              <div class="action-box">
                <h3>What You Need to Do</h3>
                <p>Please update your payment method in TutorCruncher:</p>
                <a href="${tutorcruncherLink}" class="button">Update Payment Method</a>
                <p style="margin-top: 15px;">
                  <strong>We will retry your payment automatically.</strong>
                  ${attemptsRemaining > 0 
                    ? `You have ${attemptsRemaining} more attempt${attemptsRemaining > 1 ? 's' : ''} remaining.`
                    : 'This was the final attempt. Please update your payment method to avoid service interruption.'}
                </p>
              </div>
              
              <p><strong>Next Retry:</strong> ${retryCount < maxRetries ? 'Tomorrow' : 'Please update payment method manually'}</p>
              
              <p>If you have any questions or need assistance, please contact our support team.</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Action Required: Payment Failed

Hi ${parentName || 'Parent'},

We were unable to process your payment for ${termName}.

Amount: $${amount.toFixed(2)}
Error: ${errorMessage}

What You Need to Do:
Please update your payment method in TutorCruncher: ${tutorcruncherLink}

We will retry your payment automatically.
${attemptsRemaining > 0 
  ? `You have ${attemptsRemaining} more attempt${attemptsRemaining > 1 ? 's' : ''} remaining.`
  : 'This was the final attempt. Please update your payment method to avoid service interruption.'}

Next Retry: ${retryCount < maxRetries ? 'Tomorrow' : 'Please update payment method manually'}

If you have any questions or need assistance, please contact our support team.

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-payment-failure'],
        });

        // Also send to admin team
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@acmeops.com';
        await emailSender.sendEmail({
          to: adminEmail,
          subject: `[Admin Alert] Payment Failed - ${parentName || 'Unknown'}`,
          text: `
Payment failure alert:

Enrollment ID: ${enrollment.id}
Parent: ${parentName || 'Unknown'} (${parentEmail})
Term: ${termName}
Amount: $${amount.toFixed(2)}
Error: ${errorMessage}
Retry Count: ${retryCount}/${maxRetries}
          `,
          tags: ['subscription-payment-failure-admin'],
        });

        logger.info(`✅ Payment failure email sent to ${parentEmail} and ${adminEmail}`);
      } else {
        logger.warn(`⚠️ Brevo email sender not available — payment failure emails not sent`);
      }
    } catch (error) {
      logger.error({ err: error }, 'Error sending payment failure notification:');
      throw error;
    }
  }

  /**
   * Send subscription cancellation notification
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} options - Additional options
   */
  async sendCancellationNotification(enrollment, options = {}) {
    try {
      const { parentName, parentEmail, reason } = options;
      
      // Get term config
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [enrollment.service_id]
      );
      const config = configResult.rows[0];
      const termName = config?.term_name || 'Term';
      
      const subject = `Subscription Cancelled - ${termName}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6A469D 0%, #2D2F8E 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #6A469D; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Subscription Cancelled</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <p>Your subscription for <strong>${termName}</strong> has been cancelled.</p>
              
              <div class="info-box">
                <p><strong>Cancellation Date:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}
                <p>No further charges will be processed.</p>
              </div>
              
              <p>We're sorry to see you go! If you have any questions or would like to re-enroll, please don't hesitate to contact us.</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Subscription Cancelled

Hi ${parentName || 'Parent'},

Your subscription for ${termName} has been cancelled.

Cancellation Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
${reason ? `Reason: ${reason}` : ''}
No further charges will be processed.

We're sorry to see you go! If you have any questions or would like to re-enroll, please don't hesitate to contact us.

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-cancellation'],
        });
      } else {
        logger.warn(`⚠️ Brevo email sender not available — cancellation email not sent to ${parentEmail}`);
      }

      logger.info(`✅ Cancellation email sent to ${parentEmail}`);
    } catch (error) {
      logger.error({ err: error }, 'Error sending cancellation notification:');
      throw error;
    }
  }

  /**
   * Send term completion notification
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} options - Additional options
   */
  async sendTermCompletionNotification(enrollment, options = {}) {
    try {
      const { parentName, parentEmail } = options;
      
      // Get term config
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [enrollment.service_id]
      );
      const config = configResult.rows[0];
      const termName = config?.term_name || 'Term';
      
      const subject = `Term Complete - ${termName}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #34B256 0%, #6A469D 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .success-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #34B256; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Term Complete!</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <p>Congratulations! Your child has completed <strong>${termName}</strong>.</p>
              
              <div class="success-box">
                <p>Your subscription has been automatically cancelled as the term has ended.</p>
                <p>No further charges will be processed.</p>
              </div>
              
              <p>Thank you for being part of Acme Operations! We hope your child enjoyed the program.</p>
              
              <p>If you'd like to enroll in future terms, please visit our booking page.</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Term Complete!

Hi ${parentName || 'Parent'},

Congratulations! Your child has completed ${termName}.

Your subscription has been automatically cancelled as the term has ended.
No further charges will be processed.

Thank you for being part of Acme Operations! We hope your child enjoyed the program.

If you'd like to enroll in future terms, please visit our booking page.

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-term-completion'],
        });
      } else {
        logger.warn(`⚠️ Brevo email sender not available — term completion email not sent to ${parentEmail}`);
      }

      logger.info(`✅ Term completion email sent to ${parentEmail}`);
    } catch (error) {
      logger.error({ err: error }, 'Error sending term completion notification:');
      throw error;
    }
  }

  /**
   * Send upcoming charge reminder (3 days before 1st of month)
   * @param {Object} enrollment - Subscription enrollment object
   * @param {Object} options - Additional options
   */
  async sendUpcomingChargeReminder(enrollment, options = {}) {
    try {
      const { parentName, parentEmail, nextBillingDate, estimatedAmount, lessonsCount } = options;
      
      // Get term config
      const configResult = await pool.query(
        'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
        [enrollment.service_id]
      );
      const config = configResult.rows[0];
      const termName = config?.term_name || 'Term';
      
      const subject = `Upcoming Charge - ${termName}`;
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #50C8DF 0%, #6A469D 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .reminder-box { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #50C8DF; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Upcoming Charge Reminder</h1>
            </div>
            <div class="content">
              <p>Hi ${parentName || 'Parent'},</p>
              
              <p>This is a friendly reminder that your subscription for <strong>${termName}</strong> will be charged soon.</p>
              
              <div class="reminder-box">
                <p><strong>Charge Date:</strong> ${new Date(nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                <p><strong>Lessons:</strong> ${lessonsCount || 'TBD'}</p>
                <p><strong>Estimated Amount:</strong> $${estimatedAmount ? estimatedAmount.toFixed(2) : 'TBD'}</p>
              </div>
              
              <p>This charge will be processed automatically. No action is required from you.</p>
              
              <p>If you need to update your payment method, please do so before the charge date.</p>
              
              <p>Best regards,<br>The Acme Operations Team</p>
            </div>
          </div>
        </body>
        </html>
      `;
      
      const text = `
Upcoming Charge Reminder

Hi ${parentName || 'Parent'},

This is a friendly reminder that your subscription for ${termName} will be charged soon.

Charge Date: ${new Date(nextBillingDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
Lessons: ${lessonsCount || 'TBD'}
Estimated Amount: $${estimatedAmount ? estimatedAmount.toFixed(2) : 'TBD'}

This charge will be processed automatically. No action is required from you.

If you need to update your payment method, please do so before the charge date.

Best regards,
The Acme Operations Team
      `;
      
      const emailSender = getEmailSender();
      if (emailSender) {
        await emailSender.sendEmail({
          to: parentEmail,
          subject,
          html,
          text,
          tags: ['subscription-charge-reminder'],
        });
      } else {
        logger.warn(`⚠️ Brevo email sender not available — upcoming charge reminder not sent to ${parentEmail}`);
      }

      logger.info(`✅ Upcoming charge reminder sent to ${parentEmail}`);
    } catch (error) {
      logger.error({ err: error }, 'Error sending upcoming charge reminder:');
      throw error;
    }
  }
}

module.exports = new SubscriptionNotificationService();
