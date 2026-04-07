// services/churn-prediction-service.js
/**
 * Churn Prediction Service
 *
 * Identifies at-risk clients by computing engagement signals
 * from lesson history, payment data, and communication patterns.
 * Uses Claude API for reasoning on top at-risk clients.
 *
 * Signals tracked:
 * 1. Lesson gap — days since last completed lesson
 * 2. Frequency decline — lesson rate (last 30d) vs (prior 30d)
 * 3. Cancellations — recent cancelled/missed lessons
 * 4. Payment issues — unpaid invoices
 * 5. Tutor instability — tutor changes in last 90 days
 * 6. Communication gap — days since last note/interaction
 */

const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

// Risk thresholds
const RISK_THRESHOLDS = {
  HIGH: 70,    // 70-100
  MEDIUM: 40,  // 40-69
  LOW: 0       // 0-39
};

function getRiskTier(score) {
  if (score >= RISK_THRESHOLDS.HIGH) return 'High';
  if (score >= RISK_THRESHOLDS.MEDIUM) return 'Medium';
  return 'Low';
}

// Signal weights (sum to 1.0)
const WEIGHTS = {
  LESSON_GAP: 0.30,
  FREQUENCY_DECLINE: 0.25,
  CANCELLATIONS: 0.15,
  PAYMENT_ISSUES: 0.15,
  TUTOR_INSTABILITY: 0.10,
  COMMUNICATION_GAP: 0.05
};

class ChurnPredictionService {
  constructor(pool) {
    this.pool = pool;
    this.anthropic = new Anthropic();
  }

  /**
   * Get all at-risk clients with computed signals
   * @param {Object} options - Filter options
   * @param {string} options.riskTier - Filter by risk tier (High, Medium, Low)
   * @param {number} options.limit - Max results
   * @param {number} options.offset - Pagination offset
   * @returns {Object} { clients: Array, total: number, summary: Object }
   */
  async getAtRiskClients({ riskTier, limit = 50, offset = 0 } = {}) {
    // Big query: compute all signals for live clients in one pass
    const { rows } = await this.pool.query(`
      WITH lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          MAX(a.start) AS last_lesson_date,
          COUNT(*) FILTER (WHERE a.start >= NOW() - INTERVAL '30 days' AND a.status IN ('complete', 'cancelled - chargeable')) AS lessons_last_30d,
          COUNT(*) FILTER (WHERE a.start >= NOW() - INTERVAL '60 days' AND a.start < NOW() - INTERVAL '30 days' AND a.status IN ('complete', 'cancelled - chargeable')) AS lessons_prior_30d,
          COUNT(*) FILTER (WHERE a.start >= NOW() - INTERVAL '90 days' AND a.status IN ('complete', 'cancelled - chargeable')) AS lessons_last_90d,
          COUNT(*) FILTER (WHERE a.start >= NOW() - INTERVAL '60 days' AND a.status ILIKE '%cancelled%') AS cancellations_60d,
          COUNT(*) FILTER (WHERE a.start >= NOW() - INTERVAL '60 days' AND a.status = 'cancelled - loss') AS losses_60d
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        GROUP BY ar.paying_client_id
      ),
      invoice_stats AS (
        SELECT
          client_id,
          COUNT(*) FILTER (WHERE status = 'unpaid' AND date_sent < NOW() - INTERVAL '7 days') AS overdue_invoices,
          SUM(CASE WHEN status = 'unpaid' THEN gross ELSE 0 END) AS unpaid_amount
        FROM invoices
        GROUP BY client_id
      ),
      tutor_changes AS (
        SELECT
          client_id,
          COUNT(*) AS changes_90d
        FROM client_tutor_history
        WHERE paired_at >= NOW() - INTERVAL '90 days'
          AND unpaired_at IS NOT NULL
        GROUP BY client_id
      ),
      last_note AS (
        SELECT
          client_id,
          MAX(created_at) AS last_note_date
        FROM client_notes
        GROUP BY client_id
      )
      SELECT
        c.id,
        c.client_id,
        c.first_name,
        c.last_name,
        c.email,
        c.market,
        c.status,
        c.assigned_tutor_id,
        c.assigned_tutor_name,
        c.labels,
        ls.last_lesson_date,
        COALESCE(ls.lessons_last_30d, 0) AS lessons_last_30d,
        COALESCE(ls.lessons_prior_30d, 0) AS lessons_prior_30d,
        COALESCE(ls.lessons_last_90d, 0) AS lessons_last_90d,
        COALESCE(ls.cancellations_60d, 0) AS cancellations_60d,
        COALESCE(ls.losses_60d, 0) AS losses_60d,
        COALESCE(is2.overdue_invoices, 0) AS overdue_invoices,
        COALESCE(is2.unpaid_amount, 0) AS unpaid_amount,
        COALESCE(tc.changes_90d, 0) AS tutor_changes_90d,
        ln.last_note_date,
        EXTRACT(DAY FROM NOW() - ls.last_lesson_date) AS days_since_last_lesson,
        EXTRACT(DAY FROM NOW() - COALESCE(ln.last_note_date, c.created_at)) AS days_since_last_note
      FROM clients c
      LEFT JOIN lesson_stats ls ON c.client_id = ls.client_id
      LEFT JOIN invoice_stats is2 ON c.client_id = is2.client_id
      LEFT JOIN tutor_changes tc ON c.id = tc.client_id
      LEFT JOIN last_note ln ON c.id = ln.client_id
      WHERE c.status = 'live'
        AND c.archived_at IS NULL
      ORDER BY c.first_name
    `);

    // Score each client
    const scored = rows.map(client => {
      const signals = this.computeSignals(client);
      const riskScore = this.computeRiskScore(signals);
      const tier = getRiskTier(riskScore);

      return {
        id: client.id,
        client_id: client.client_id,
        first_name: client.first_name,
        last_name: client.last_name,
        email: client.email,
        market: client.market,
        assigned_tutor_id: client.assigned_tutor_id,
        assigned_tutor_name: client.assigned_tutor_name,
        last_lesson_date: client.last_lesson_date,
        lessons_last_30d: client.lessons_last_30d,
        lessons_last_90d: client.lessons_last_90d,
        risk_score: riskScore,
        risk_tier: tier,
        signals,
        raw: {
          cancellations_60d: client.cancellations_60d,
          overdue_invoices: client.overdue_invoices,
          unpaid_amount: parseFloat(client.unpaid_amount || 0),
          tutor_changes_90d: client.tutor_changes_90d,
          days_since_last_lesson: Math.round(client.days_since_last_lesson || 0),
          days_since_last_note: Math.round(client.days_since_last_note || 0)
        }
      };
    });

    // Sort by risk score descending
    scored.sort((a, b) => b.risk_score - a.risk_score);

    // Filter by tier if requested
    const filtered = riskTier
      ? scored.filter(c => c.risk_tier === riskTier)
      : scored;

    // Summary stats
    const summary = {
      total_live: scored.length,
      high_risk: scored.filter(c => c.risk_tier === 'High').length,
      medium_risk: scored.filter(c => c.risk_tier === 'Medium').length,
      low_risk: scored.filter(c => c.risk_tier === 'Low').length
    };

    return {
      clients: filtered.slice(offset, offset + limit),
      total: filtered.length,
      summary
    };
  }

  /**
   * Compute individual signal scores (0-100 each)
   */
  computeSignals(client) {
    const daysSinceLesson = Math.round(client.days_since_last_lesson || 0);
    const daysSinceNote = Math.round(client.days_since_last_note || 0);
    const lessonsRecent = parseInt(client.lessons_last_30d, 10) || 0;
    const lessonsPrior = parseInt(client.lessons_prior_30d, 10) || 0;
    const cancellations = parseInt(client.cancellations_60d, 10) || 0;
    const overdueInvoices = parseInt(client.overdue_invoices, 10) || 0;
    const tutorChanges = parseInt(client.tutor_changes_90d, 10) || 0;

    // 1. Lesson gap (0-100): 0 days = 0 risk, 14 days = 50, 30+ days = 100
    const lessonGap = client.last_lesson_date
      ? Math.min(100, Math.round((daysSinceLesson / 30) * 100))
      : 100; // Never had a lesson = max risk

    // 2. Frequency decline (0-100): compare recent vs prior 30d
    let frequencyDecline = 0;
    if (lessonsPrior > 0) {
      const ratio = lessonsRecent / lessonsPrior;
      if (ratio <= 0) frequencyDecline = 100;       // Complete stop
      else if (ratio < 0.5) frequencyDecline = 80;  // More than half decline
      else if (ratio < 0.75) frequencyDecline = 50;  // Moderate decline
      else if (ratio < 1) frequencyDecline = 25;     // Slight decline
      else frequencyDecline = 0;                      // Same or increased
    } else if (lessonsRecent === 0) {
      frequencyDecline = 80; // No lessons in either period
    }

    // 3. Cancellations (0-100): 0 = 0, 1 = 30, 2 = 60, 3+ = 100
    const cancellationScore = Math.min(100, cancellations * 33);

    // 4. Payment issues (0-100): 0 overdue = 0, 1 = 50, 2+ = 100
    const paymentScore = Math.min(100, overdueInvoices * 50);

    // 5. Tutor instability (0-100): 0 changes = 0, 1 = 40, 2 = 70, 3+ = 100
    const tutorScore = tutorChanges === 0 ? 0
      : tutorChanges === 1 ? 40
      : tutorChanges === 2 ? 70
      : 100;

    // 6. Communication gap (0-100): 0-14d = 0, 30d = 50, 60+ = 100
    const commGap = Math.min(100, Math.round((daysSinceNote / 60) * 100));

    return {
      lesson_gap: { score: lessonGap, days: daysSinceLesson, label: 'Lesson Gap' },
      frequency_decline: { score: frequencyDecline, recent: lessonsRecent, prior: lessonsPrior, label: 'Frequency Decline' },
      cancellations: { score: cancellationScore, count: cancellations, label: 'Cancellations' },
      payment_issues: { score: paymentScore, overdue: overdueInvoices, label: 'Payment Issues' },
      tutor_instability: { score: tutorScore, changes: tutorChanges, label: 'Tutor Changes' },
      communication_gap: { score: commGap, days: daysSinceNote, label: 'Communication Gap' }
    };
  }

  /**
   * Compute weighted risk score from signals
   */
  computeRiskScore(signals) {
    return Math.round(
      (signals.lesson_gap.score * WEIGHTS.LESSON_GAP) +
      (signals.frequency_decline.score * WEIGHTS.FREQUENCY_DECLINE) +
      (signals.cancellations.score * WEIGHTS.CANCELLATIONS) +
      (signals.payment_issues.score * WEIGHTS.PAYMENT_ISSUES) +
      (signals.tutor_instability.score * WEIGHTS.TUTOR_INSTABILITY) +
      (signals.communication_gap.score * WEIGHTS.COMMUNICATION_GAP)
    );
  }

  /**
   * Get Claude-powered explanation for a specific client's churn risk
   */
  async explainRisk(clientId) {
    // Get the client's risk data
    const { clients } = await this.getAtRiskClients({ limit: 9999 });
    const client = clients.find(c => c.id === clientId);

    if (!client) {
      throw new Error(`Client ${clientId} not found or not live`);
    }

    const signals = client.signals;
    const context = `CLIENT: ${client.first_name} ${client.last_name}
Market: ${client.market || 'Unknown'}
Current Tutor: ${client.assigned_tutor_name || 'None'}
Risk Score: ${client.risk_score}/100 (${client.risk_tier})

ENGAGEMENT SIGNALS:
- Last lesson: ${signals.lesson_gap.days} days ago (risk: ${signals.lesson_gap.score}/100)
- Lesson frequency: ${signals.frequency_decline.recent} lessons last 30d vs ${signals.frequency_decline.prior} prior 30d (risk: ${signals.frequency_decline.score}/100)
- Recent cancellations: ${signals.cancellations.count} in 60 days (risk: ${signals.cancellations.score}/100)
- Overdue invoices: ${signals.payment_issues.overdue} (risk: ${signals.payment_issues.score}/100)
- Tutor changes (90d): ${signals.tutor_instability.changes} (risk: ${signals.tutor_instability.score}/100)
- Days since last communication: ${signals.communication_gap.days} (risk: ${signals.communication_gap.score}/100)
- Total lessons (90d): ${client.lessons_last_90d}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are a customer success analyst for Acme Operations, a children's chess education company. Analyze client engagement data and provide a concise churn risk assessment.

Be specific and actionable. Focus on:
1. The primary risk factors driving this client's churn risk
2. What's likely happening from the family's perspective
3. One concrete action the team should take this week

Keep it to 3-4 sentences. Be direct, not corporate.`,
      messages: [{
        role: 'user',
        content: `Assess this client's churn risk and recommend action:\n\n${context}`
      }]
    });

    const reasoning = response.content[0]?.text || 'Unable to generate reasoning';
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    logger.info({ clientId, riskScore: client.risk_score, tokensUsed }, 'Churn risk explained');

    return {
      client_id: clientId,
      risk_score: client.risk_score,
      risk_tier: client.risk_tier,
      reasoning,
      signals: client.signals,
      tokens_used: tokensUsed
    };
  }

  /**
   * Tutor churn leaderboard — which tutors are losing clients
   */
  async getTutorChurnBoard() {
    const { rows } = await this.pool.query(`
      WITH tutor_clients AS (
        SELECT
          c.assigned_tutor_id AS tutor_id,
          c.assigned_tutor_name AS tutor_name,
          COUNT(*) AS total_clients,
          COUNT(*) FILTER (WHERE c.status = 'live') AS live_clients,
          COUNT(*) FILTER (WHERE c.status = 'dormant') AS dormant_clients
        FROM clients c
        WHERE c.assigned_tutor_id IS NOT NULL
          AND c.archived_at IS NULL
        GROUP BY c.assigned_tutor_id, c.assigned_tutor_name
      ),
      recent_losses AS (
        SELECT
          cth.tutor_id,
          COUNT(*) AS clients_lost_90d
        FROM client_tutor_history cth
        JOIN clients c ON c.id = cth.client_id
        WHERE cth.unpaired_at >= NOW() - INTERVAL '90 days'
          AND cth.unpaired_at IS NOT NULL
        GROUP BY cth.tutor_id
      ),
      dormant_transitions AS (
        SELECT
          c.assigned_tutor_id AS tutor_id,
          COUNT(*) AS went_dormant_90d
        FROM clients c
        WHERE c.status = 'dormant'
          AND c.updated_at >= NOW() - INTERVAL '90 days'
          AND c.assigned_tutor_id IS NOT NULL
        GROUP BY c.assigned_tutor_id
      )
      SELECT
        tc.tutor_id,
        tc.tutor_name,
        tc.total_clients,
        tc.live_clients,
        tc.dormant_clients,
        COALESCE(rl.clients_lost_90d, 0) AS clients_lost_90d,
        COALESCE(dt.went_dormant_90d, 0) AS went_dormant_90d,
        con.review_rating,
        con.photo
      FROM tutor_clients tc
      LEFT JOIN recent_losses rl ON tc.tutor_id = rl.tutor_id
      LEFT JOIN dormant_transitions dt ON tc.tutor_id = dt.tutor_id
      LEFT JOIN contractors con ON tc.tutor_id = con.contractor_id
      WHERE tc.total_clients >= 1
      ORDER BY COALESCE(dt.went_dormant_90d, 0) + COALESCE(rl.clients_lost_90d, 0) DESC, tc.dormant_clients DESC
    `);

    return rows.map(row => ({
      tutor_id: row.tutor_id,
      tutor_name: row.tutor_name,
      photo: row.photo,
      review_rating: row.review_rating,
      total_clients: parseInt(row.total_clients, 10),
      live_clients: parseInt(row.live_clients, 10),
      dormant_clients: parseInt(row.dormant_clients, 10),
      clients_lost_90d: parseInt(row.clients_lost_90d, 10),
      went_dormant_90d: parseInt(row.went_dormant_90d, 10),
      churn_rate: row.total_clients > 0
        ? Math.round((parseInt(row.dormant_clients, 10) / parseInt(row.total_clients, 10)) * 100)
        : 0
    }));
  }
}

module.exports = ChurnPredictionService;
