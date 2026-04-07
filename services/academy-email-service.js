/**
 * Academy Email Service
 *
 * Sends email notifications for Academy milestones:
 * - Badge earned
 * - Phase completed
 * - Program completed
 * - Weekly progress summary
 */

const brevoSender = require('../utils/brevo-email-sender');
const { logger } = require('../utils/logger');

class AcademyEmailService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get franchisee contact info
   */
  async getFranchiseeContact(franchiseId) {
    // Get contact info from users table associated with franchise
    const result = await this.pool.query(`
      SELECT u.email, u.first_name, u.last_name
      FROM users u
      WHERE u.franchise_id = $1
        AND u.role IN ('franchise_owner', 'admin', 'manager')
      ORDER BY
        CASE u.role
          WHEN 'franchise_owner' THEN 1
          WHEN 'admin' THEN 2
          ELSE 3
        END
      LIMIT 1
    `, [franchiseId]);

    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // Fallback: try to find any user with this franchise_id
    const fallbackResult = await this.pool.query(`
      SELECT u.email, u.first_name, u.last_name
      FROM users u
      WHERE u.franchise_id = $1
      LIMIT 1
    `, [franchiseId]);

    return fallbackResult.rows[0] || null;
  }

  /**
   * Send badge earned notification
   */
  async sendBadgeEarnedEmail(franchiseId, badge) {
    const sender = brevoSender.getInstance();
    if (!sender) {
      logger.info('📧 Brevo not configured, skipping badge email');
      return { success: false, reason: 'Brevo not configured' };
    }

    const contact = await this.getFranchiseeContact(franchiseId);
    if (!contact?.email) {
      logger.info(`📧 No contact email found for franchise ${franchiseId}`);
      return { success: false, reason: 'No contact email' };
    }

    const firstName = contact.first_name || 'Franchisee';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .badge-container { text-align: center; padding: 40px 20px; background: linear-gradient(180deg, #fefce8 0%, #fef3c7 100%); }
    .badge-icon { width: 80px; height: 80px; background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 16px rgba(245, 158, 11, 0.3); }
    .badge-icon span { font-size: 40px; }
    .badge-title { font-size: 24px; font-weight: bold; color: #92400e; margin-bottom: 8px; }
    .badge-description { color: #78350f; font-size: 14px; }
    .points-badge { display: inline-block; background: #fef3c7; border: 2px solid #fbbf24; padding: 8px 16px; border-radius: 20px; margin-top: 16px; }
    .points-badge span { color: #92400e; font-weight: bold; }
    .content { padding: 32px; }
    .cta-button { display: inline-block; background: #2D2F8E; color: white !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Achievement Unlocked!</h1>
    </div>
    <div class="badge-container">
      <div class="badge-icon">
        <span>🏆</span>
      </div>
      <div class="badge-title">${badge.title}</div>
      <div class="badge-description">${badge.description || 'Congratulations on this achievement!'}</div>
      ${badge.points_reward > 0 ? `
      <div class="points-badge">
        <span>+${badge.points_reward} Points</span>
      </div>
      ` : ''}
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>Congratulations! You've earned a new badge in the Franchise Academy. Your dedication to learning and growing your Acme Operations franchise is paying off!</p>
      <p>Keep up the great work and continue your journey to unlock more achievements.</p>
      <p style="text-align: center;">
        <a href="https://join.acmeops.com/academy" class="cta-button">View Your Progress</a>
      </p>
      <p>Best regards,<br>The Acme Operations Team</p>
    </div>
    <div class="footer">
      <p>Acme Operations Franchise Academy</p>
      <p>Questions? Contact us at support@acmeops.com</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const result = await sender.sendEmail({
        to: contact.email,
        subject: `🏆 You earned a badge: ${badge.title}`,
        html,
        location: 'production',
      });

      logger.info(`📧 Badge earned email sent to ${contact.email} for badge: ${badge.title}`);
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send badge email:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send phase completed notification
   */
  async sendPhaseCompletedEmail(franchiseId, phase, progressStats) {
    const sender = brevoSender.getInstance();
    if (!sender) {
      logger.info('📧 Brevo not configured, skipping phase email');
      return { success: false, reason: 'Brevo not configured' };
    }

    const contact = await this.getFranchiseeContact(franchiseId);
    if (!contact?.email) {
      logger.info(`📧 No contact email found for franchise ${franchiseId}`);
      return { success: false, reason: 'No contact email' };
    }

    const firstName = contact.first_name || 'Franchisee';
    const phaseNames = {
      1: 'Foundation & Setup',
      2: 'Market Activation',
      3: 'Growth & Refinement',
    };
    const phaseName = phaseNames[phase] || `Phase ${phase}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .celebration { text-align: center; padding: 40px 20px; }
    .celebration-icon { font-size: 64px; margin-bottom: 16px; }
    .phase-title { font-size: 28px; font-weight: bold; color: #059669; margin-bottom: 8px; }
    .phase-subtitle { color: #6b7280; font-size: 16px; }
    .stats-grid { display: flex; justify-content: center; gap: 24px; margin: 24px 0; }
    .stat-box { text-align: center; padding: 16px; background: #f0fdf4; border-radius: 12px; min-width: 100px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #059669; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .content { padding: 32px; }
    .cta-button { display: inline-block; background: #059669; color: white !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎊 Phase Complete!</h1>
    </div>
    <div class="celebration">
      <div class="celebration-icon">🎉</div>
      <div class="phase-title">${phaseName}</div>
      <div class="phase-subtitle">You've completed Phase ${phase} of 3!</div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${progressStats?.total_points || 0}</div>
          <div class="stat-label">Total Points</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${progressStats?.current_streak_days || 0}</div>
          <div class="stat-label">Day Streak</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${progressStats?.completion_percentage || 0}%</div>
          <div class="stat-label">Overall Progress</div>
        </div>
      </div>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>Incredible work! You've successfully completed <strong>${phaseName}</strong> of your 90-Day Launch Program. This is a major milestone in your franchise journey!</p>
      ${phase < 3 ? `
      <p>You're ready to move on to Phase ${phase + 1}. Keep the momentum going!</p>
      ` : `
      <p>You've completed all phases of the 90-Day Launch Program! You're now fully equipped to run a successful Acme Operations franchise.</p>
      `}
      <p style="text-align: center;">
        <a href="https://join.acmeops.com/academy" class="cta-button">Continue Your Journey</a>
      </p>
      <p>Best regards,<br>The Acme Operations Team</p>
    </div>
    <div class="footer">
      <p>Acme Operations Franchise Academy</p>
      <p>Questions? Contact us at support@acmeops.com</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const result = await sender.sendEmail({
        to: contact.email,
        subject: `🎊 Congratulations! You completed ${phaseName}`,
        html,
        location: 'production',
      });

      logger.info(`📧 Phase completed email sent to ${contact.email} for phase: ${phase}`);
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send phase completed email:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send program completed notification
   */
  async sendProgramCompletedEmail(franchiseId, progressStats) {
    const sender = brevoSender.getInstance();
    if (!sender) {
      logger.info('📧 Brevo not configured, skipping program completion email');
      return { success: false, reason: 'Brevo not configured' };
    }

    const contact = await this.getFranchiseeContact(franchiseId);
    if (!contact?.email) {
      logger.info(`📧 No contact email found for franchise ${franchiseId}`);
      return { success: false, reason: 'No contact email' };
    }

    const firstName = contact.first_name || 'Franchisee';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%); padding: 40px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 28px; }
    .header p { color: rgba(255,255,255,0.9); margin: 8px 0 0; }
    .trophy { text-align: center; padding: 40px 20px; background: linear-gradient(180deg, #faf5ff 0%, #f3e8ff 100%); }
    .trophy-icon { font-size: 80px; margin-bottom: 16px; }
    .trophy-title { font-size: 32px; font-weight: bold; color: #7c3aed; }
    .stats-grid { display: flex; justify-content: center; gap: 16px; margin: 32px 0; flex-wrap: wrap; }
    .stat-box { text-align: center; padding: 20px; background: white; border-radius: 12px; min-width: 120px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .stat-value { font-size: 28px; font-weight: bold; color: #7c3aed; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .content { padding: 32px; }
    .cta-button { display: inline-block; background: #7c3aed; color: white !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎓 Program Complete!</h1>
      <p>90-Day Launch Program</p>
    </div>
    <div class="trophy">
      <div class="trophy-icon">🏆</div>
      <div class="trophy-title">Congratulations, Graduate!</div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${progressStats?.total_points || 0}</div>
          <div class="stat-label">Points Earned</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${progressStats?.badges_earned || 0}</div>
          <div class="stat-label">Badges Earned</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${progressStats?.longest_streak_days || 0}</div>
          <div class="stat-label">Best Streak</div>
        </div>
      </div>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>🎉 <strong>Congratulations!</strong> You have officially completed the Acme Operations 90-Day Launch Program!</p>
      <p>This is an incredible achievement. You've learned everything you need to run a successful Acme Operations franchise, from setting up your business to marketing, operations, and growth strategies.</p>
      <p>Remember, the Franchise Academy resources are always available to you. Keep using the AI Coach and Resource Library as you continue to grow your business.</p>
      <p style="text-align: center;">
        <a href="https://join.acmeops.com/academy" class="cta-button">View Your Achievements</a>
      </p>
      <p>Here's to your continued success!</p>
      <p>Best regards,<br>The Acme Operations Team</p>
    </div>
    <div class="footer">
      <p>Acme Operations Franchise Academy</p>
      <p>Questions? Contact us at support@acmeops.com</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const result = await sender.sendEmail({
        to: contact.email,
        subject: `🎓 Congratulations! You've completed the 90-Day Launch Program!`,
        html,
        location: 'production',
      });

      logger.info(`📧 Program completed email sent to ${contact.email}`);
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send program completed email:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Send weekly progress summary (can be triggered by cron)
   */
  async sendWeeklyProgressEmail(franchiseId, progressStats) {
    const sender = brevoSender.getInstance();
    if (!sender) {
      logger.info('📧 Brevo not configured, skipping weekly email');
      return { success: false, reason: 'Brevo not configured' };
    }

    const contact = await this.getFranchiseeContact(franchiseId);
    if (!contact?.email) {
      logger.info(`📧 No contact email found for franchise ${franchiseId}`);
      return { success: false, reason: 'No contact email' };
    }

    const firstName = contact.first_name || 'Franchisee';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Poppins', Arial, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background-color: #f3f4f6; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #2D2F8E 0%, #6A469D 100%); padding: 32px; text-align: center; }
    .header h1 { color: white; margin: 0; font-size: 24px; }
    .progress-section { padding: 32px; text-align: center; }
    .progress-ring { width: 120px; height: 120px; margin: 0 auto 16px; position: relative; }
    .progress-text { font-size: 32px; font-weight: bold; color: #2D2F8E; }
    .progress-label { color: #6b7280; font-size: 14px; }
    .stats-row { display: flex; justify-content: space-around; margin: 24px 0; }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #2D2F8E; }
    .stat-label { font-size: 12px; color: #6b7280; }
    .content { padding: 0 32px 32px; }
    .cta-button { display: inline-block; background: #2D2F8E; color: white !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { background: #f9fafb; padding: 24px; text-align: center; color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Your Weekly Progress</h1>
    </div>
    <div class="progress-section">
      <div class="progress-text">${progressStats?.completion_percentage || 0}%</div>
      <div class="progress-label">Overall Progress</div>
      <div class="stats-row">
        <div class="stat">
          <div class="stat-value">${progressStats?.total_points || 0}</div>
          <div class="stat-label">Total Points</div>
        </div>
        <div class="stat">
          <div class="stat-value">Day ${progressStats?.current_day || 0}</div>
          <div class="stat-label">of 90</div>
        </div>
        <div class="stat">
          <div class="stat-value">${progressStats?.current_streak_days || 0}🔥</div>
          <div class="stat-label">Day Streak</div>
        </div>
      </div>
    </div>
    <div class="content">
      <p>Hi ${firstName},</p>
      <p>Here's your weekly progress update for the Franchise Academy. ${progressStats?.completion_percentage >= 50 ? "You're making great progress!" : "Keep going, you've got this!"}</p>
      ${progressStats?.next_action ? `<p><strong>Suggested next step:</strong> ${progressStats.next_action}</p>` : ''}
      <p style="text-align: center;">
        <a href="https://join.acmeops.com/academy" class="cta-button">Continue Learning</a>
      </p>
      <p>Best regards,<br>The Acme Operations Team</p>
    </div>
    <div class="footer">
      <p>Acme Operations Franchise Academy</p>
      <p>You're receiving this because you're enrolled in the 90-Day Launch Program.</p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      const result = await sender.sendEmail({
        to: contact.email,
        subject: `📊 Your Academy Progress: ${progressStats?.completion_percentage || 0}% Complete`,
        html,
        location: 'production',
      });

      logger.info(`📧 Weekly progress email sent to ${contact.email}`);
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to send weekly progress email:');
      return { success: false, error: error.message };
    }
  }
}

module.exports = AcademyEmailService;
