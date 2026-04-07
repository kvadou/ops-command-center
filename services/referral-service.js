/**
 * Referral Service
 * Tutor referral tracking — submission, matching, points accumulation, conversion.
 * OpsHub DB is single source of truth. STT reads/writes via API.
 */
const { logger } = require('../utils/logger');

class ReferralService {
  constructor(pool) {
    this.pool = pool;
  }

  // ─── Submit ──────────────────────────────────────────────────

  async submitReferral(data) {
    const {
      contractor_id, referred_name, referred_email, referred_phone,
      referral_type, referring_client_id, referring_client_name, notes
    } = data;

    // Get current threshold from app_settings
    const threshold = await this._getPointsThreshold();

    const { rows } = await this.pool.query(`
      INSERT INTO tutor_referrals (
        contractor_id, referred_name, referred_email, referred_phone,
        referral_type, referring_client_id, referring_client_name, notes,
        status, points_threshold, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', $9, NOW())
      RETURNING *
    `, [
      contractor_id, referred_name.trim(),
      referred_email?.trim()?.toLowerCase() || null,
      referred_phone?.trim() || null,
      referral_type || 'friend_neighbor',
      referring_client_id || null,
      referring_client_name || null,
      notes || null,
      threshold
    ]);

    logger.info({
      referral_id: rows[0].id,
      contractor_id,
      referred_name: referred_name.trim(),
      msg: 'Referral submitted'
    });

    return rows[0];
  }

  // ─── List / Detail ───────────────────────────────────────────

  async listReferrals({ contractor_id, status, limit = 100, offset = 0 } = {}) {
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (contractor_id) {
      conditions.push(`r.contractor_id = $${paramIdx++}`);
      params.push(parseInt(contractor_id, 10));
    }
    if (status) {
      conditions.push(`r.status = $${paramIdx++}`);
      params.push(status);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await this.pool.query(`
      SELECT
        r.*,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name
      FROM tutor_referrals r
      LEFT JOIN contractors c ON c.contractor_id = r.contractor_id
      ${where}
      ORDER BY r.submitted_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `, [...params, limit, offset]);

    // Get total count
    const { rows: countRows } = await this.pool.query(`
      SELECT COUNT(*)::int AS total FROM tutor_referrals r ${where}
    `, params);

    return { referrals: rows, total: countRows[0].total };
  }

  async getReferral(id) {
    const { rows } = await this.pool.query(`
      SELECT
        r.*,
        c.first_name AS tutor_first_name,
        c.last_name AS tutor_last_name
      FROM tutor_referrals r
      LEFT JOIN contractors c ON c.contractor_id = r.contractor_id
      WHERE r.id = $1
    `, [id]);

    return rows[0] || null;
  }

  // ─── Match ───────────────────────────────────────────────────

  async confirmMatch(referralId, matchedClientId, matchedClientName, reviewedBy) {
    const { rows } = await this.pool.query(`
      UPDATE tutor_referrals SET
        status = 'tracking',
        matched_client_id = $2,
        matched_client_name = $3,
        matched_at = NOW(),
        reviewed_by = $4,
        updated_at = NOW()
      WHERE id = $1 AND status IN ('submitted', 'pending_review')
      RETURNING *
    `, [referralId, matchedClientId, matchedClientName, reviewedBy]);

    if (rows.length === 0) {
      return null;
    }

    logger.info({
      referral_id: referralId,
      matched_client_id: matchedClientId,
      msg: 'Referral matched to client'
    });

    return rows[0];
  }

  async rejectReferral(referralId, reason, reviewedBy) {
    const { rows } = await this.pool.query(`
      UPDATE tutor_referrals SET
        status = 'rejected',
        rejection_reason = $2,
        rejected_at = NOW(),
        reviewed_by = $3,
        updated_at = NOW()
      WHERE id = $1 AND status IN ('submitted', 'pending_review', 'tracking')
      RETURNING *
    `, [referralId, reason || null, reviewedBy]);

    if (rows.length === 0) {
      return null;
    }

    logger.info({
      referral_id: referralId,
      reason,
      msg: 'Referral rejected'
    });

    return rows[0];
  }

  // ─── Auto-Suggest Matching ──────────────────────────────────

  async findMatchSuggestions(clientId, clientName, clientEmail, clientPhone) {
    const suggestions = [];

    // 1. Email exact match (highest confidence)
    if (clientEmail) {
      const { rows } = await this.pool.query(`
        SELECT id, contractor_id, referred_name, referred_email, referred_phone, referral_type
        FROM tutor_referrals
        WHERE status = 'submitted'
          AND LOWER(referred_email) = LOWER($1)
      `, [clientEmail]);
      for (const row of rows) {
        suggestions.push({ ...row, match_type: 'email', confidence: 'high' });
      }
    }

    // 2. Phone exact match (normalized — strip non-digits)
    if (clientPhone) {
      const normalizedPhone = clientPhone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10) {
        const { rows } = await this.pool.query(`
          SELECT id, contractor_id, referred_name, referred_email, referred_phone, referral_type
          FROM tutor_referrals
          WHERE status = 'submitted'
            AND REGEXP_REPLACE(referred_phone, '[^0-9]', '', 'g') = $1
        `, [normalizedPhone]);
        for (const row of rows) {
          // Avoid duplicates from email match
          if (!suggestions.find(s => s.id === row.id)) {
            suggestions.push({ ...row, match_type: 'phone', confidence: 'high' });
          }
        }
      }
    }

    // 3. Name similarity (pg_trgm)
    if (clientName && clientName.length > 2) {
      const { rows } = await this.pool.query(`
        SELECT id, contractor_id, referred_name, referred_email, referred_phone, referral_type,
          SIMILARITY(referred_name, $1) AS name_sim
        FROM tutor_referrals
        WHERE status = 'submitted'
          AND SIMILARITY(referred_name, $1) > 0.4
        ORDER BY name_sim DESC
        LIMIT 5
      `, [clientName]);
      for (const row of rows) {
        if (!suggestions.find(s => s.id === row.id)) {
          suggestions.push({ ...row, match_type: 'name', confidence: 'medium' });
        }
      }
    }

    return suggestions;
  }

  /**
   * Check a newly created/synced client against pending referrals.
   * If match found, update referral status to pending_review.
   */
  async checkNewClientForMatch(clientId, clientName, clientEmail, clientPhone) {
    const suggestions = await this.findMatchSuggestions(clientId, clientName, clientEmail, clientPhone);

    const updated = [];
    for (const suggestion of suggestions) {
      const { rows } = await this.pool.query(`
        UPDATE tutor_referrals SET
          status = 'pending_review',
          updated_at = NOW()
        WHERE id = $1 AND status = 'submitted'
        RETURNING *
      `, [suggestion.id]);

      if (rows.length > 0) {
        updated.push({ referral: rows[0], match_type: suggestion.match_type, confidence: suggestion.confidence });
      }
    }

    if (updated.length > 0) {
      logger.info({
        client_id: clientId,
        client_name: clientName,
        matches: updated.length,
        msg: 'Auto-match suggestions found for new client'
      });
    }

    return updated;
  }

  // ─── Points Accumulation ─────────────────────────────────────

  async updatePoints(referralId) {
    const referral = await this.getReferral(referralId);
    if (!referral || referral.status !== 'tracking' || !referral.matched_client_id) {
      return null;
    }

    // Sum revenue from completed appointments for matched client, excluding trials ($15)
    const { rows } = await this.pool.query(`
      SELECT COALESCE(SUM(
        CASE WHEN a.charge_type IN ('hourly', 'hourly-split')
          THEN ar.charge_rate * COALESCE(a.units, 1)
          ELSE ar.charge_rate
        END
      ), 0) AS total_revenue
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id = ar.appointment_id
      WHERE ar.paying_client_id = $1
        AND a.status = 'complete'
        AND a.is_deleted IS NOT TRUE
        AND ar.charge_rate > 15
    `, [referral.matched_client_id]);

    const pointsEarned = parseFloat(rows[0].total_revenue);
    const isConverted = pointsEarned >= parseFloat(referral.points_threshold);

    if (isConverted && referral.status === 'tracking') {
      // Mark as converted
      const { rows: updated } = await this.pool.query(`
        UPDATE tutor_referrals SET
          points_earned = $2,
          status = 'converted',
          converted_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [referralId, pointsEarned]);

      logger.info({
        referral_id: referralId,
        contractor_id: referral.contractor_id,
        points_earned: pointsEarned,
        msg: 'Referral converted'
      });

      return updated[0];
    }

    // Just update points
    const { rows: updated } = await this.pool.query(`
      UPDATE tutor_referrals SET
        points_earned = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [referralId, pointsEarned]);

    return updated[0];
  }

  /**
   * Batch update points for all tracking referrals.
   * Called by scheduled job.
   */
  async updateAllTrackingPoints() {
    const { rows: tracking } = await this.pool.query(`
      SELECT id FROM tutor_referrals WHERE status = 'tracking'
    `);

    const results = { updated: 0, converted: 0, errors: 0 };

    for (const ref of tracking) {
      try {
        const updated = await this.updatePoints(ref.id);
        if (updated) {
          results.updated++;
          if (updated.status === 'converted') results.converted++;
        }
      } catch (err) {
        results.errors++;
        logger.warn({ referral_id: ref.id, error: err.message, msg: 'Failed to update referral points' });
      }
    }

    return results;
  }

  // ─── Stats ───────────────────────────────────────────────────

  async getTutorStats(contractorId) {
    const { rows } = await this.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status != 'rejected')::int AS total_submitted,
        COUNT(*) FILTER (WHERE status = 'converted')::int AS total_converted,
        COUNT(*) FILTER (WHERE status = 'tracking')::int AS currently_tracking,
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review
      FROM tutor_referrals
      WHERE contractor_id = $1
    `, [parseInt(contractorId, 10)]);

    const stats = rows[0];

    // Pay tier: $5/hr raise per 5 conversions
    const conversions = stats.total_converted;
    const currentTier = Math.floor(conversions / 5);
    const rateBonus = currentTier * 5; // dollars per hour
    const conversionsToNextTier = 5 - (conversions % 5);
    const progressToNextTier = (conversions % 5);

    return {
      ...stats,
      pay_tier: currentTier,
      rate_bonus: rateBonus,
      conversions_to_next_tier: conversionsToNextTier,
      progress_to_next_tier: progressToNextTier
    };
  }

  /**
   * Get pending review count (for alert banners).
   */
  async getPendingReviewCount() {
    const { rows } = await this.pool.query(`
      SELECT COUNT(*)::int AS count FROM tutor_referrals WHERE status = 'pending_review'
    `);
    return rows[0].count;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  async _getPointsThreshold() {
    try {
      const { rows } = await this.pool.query(`
        SELECT setting_value FROM app_settings WHERE setting_key = 'referral_points_threshold'
      `);
      return rows.length > 0 ? parseFloat(rows[0].setting_value) : 300;
    } catch {
      return 300;
    }
  }
}

module.exports = ReferralService;
