// services/lead-scoring-service.js
/**
 * Lead Scoring Service
 *
 * Scores CCT prospects using Claude API inference.
 * Event-driven: prospects are marked stale on data changes,
 * then batch-scored by a background worker.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

// Tier thresholds (0-10 scale)
const TIER_THRESHOLDS = {
  HOT: 8,    // 8-10
  WARM: 5,   // 5-7
  COOL: 3,   // 3-4
  COLD: 0    // 0-2
};

function getTier(score) {
  if (score >= TIER_THRESHOLDS.HOT) return 'Hot';
  if (score >= TIER_THRESHOLDS.WARM) return 'Warm';
  if (score >= TIER_THRESHOLDS.COOL) return 'Cool';
  return 'Cold';
}

const SCORING_SYSTEM_PROMPT = `You are an expert enrollment analyst for Acme Operations, a children's chess education company. You score prospective leads on a 0-10 scale based on their likelihood to convert from inquiry to paying customer (first paid lesson after trial).

Acme Operations serves children ages 3-12 with in-home tutoring, online lessons, and club programs across NYC, LA, SF, Westside, Eastside, and online. A "conversion" means the family completes their first PAID lesson after a trial.

SCORING RUBRIC (0-10):
- 0-2 (Cold): No engagement, outside service area, unresponsive after multiple contacts, wrong age range
- 3-4 (Cool): Some initial interest but weak signals — generic inquiry, no trial booked, slow response
- 5-7 (Warm): Meaningful engagement — trial booked or attended, responsive to follow-ups, good fit demographics
- 8-10 (Hot): Strong conversion signals — trial completed with positive feedback, pricing discussed, paid lesson being scheduled, referral from existing family, responded quickly

COMPONENT SCORING (each 0-10, then weighted into overall):
1. Family Fit (25%): Child age match (sweet spot 4-8), location in active market, program type alignment
2. Engagement Level (30%): Response speed, number of interactions, email/phone engagement, trial attendance
3. Funnel Progress (25%): How far through the pipeline (inquiry → trial → follow-up → scheduling paid)
4. Source Quality (10%): Referral > school partnership > organic search > paid ad > cold inquiry
5. Timing Signals (10%): Recency of inquiry, school year timing, expressed urgency, follow-up responsiveness

CALIBRATION EXAMPLES:
- Score 9: Parent in NYC, child age 6, referred by existing family, attended trial last week, responded same day to follow-up, actively discussing scheduling first paid lesson. Tier: Hot.
- Score 6: Parent in LA, child age 5, found via Google ad, booked trial for next week, responded within 48h to initial contact. Tier: Warm.
- Score 3: Parent online inquiry, child age 11, heard about us from Facebook, no response to follow-up after 5 days. Tier: Cool.
- Score 1: Inquiry from 3 weeks ago, no response to 3 follow-up attempts, email bounced. Tier: Cold.

You MUST return valid JSON matching the exact schema provided. Score conservatively — a 7 should genuinely feel likely to convert.`;

class LeadScoringService {
  constructor(pool) {
    this.pool = pool;
    this.anthropic = new Anthropic();
  }

  /**
   * Mark a prospect's score as stale (needs re-scoring)
   */
  async markStale(clientId, triggerEvent = 'unknown') {
    await this.pool.query(
      `UPDATE clients SET lead_score_stale = true WHERE id = $1`,
      [clientId]
    );
    logger.info({ clientId, triggerEvent }, 'Lead score marked stale');
  }

  /**
   * Get all prospects needing re-scoring
   */
  async getStaleProspects(limit = 20) {
    const { rows } = await this.pool.query(`
      SELECT
        c.id,
        c.client_id,
        c.first_name,
        c.last_name,
        c.email,
        c.mobile,
        c.phone,
        c.market,
        c.lead_type,
        c.labels,
        c.status,
        c.prospect_status,
        c.date_registration_complete,
        c.date_tutor_client_paired,
        c.date_tutor_client_paired_scheduled,
        c.date_trial_first_lesson,
        c.trial_follow_up_completed,
        c.first_paid_lesson_scheduled,
        c.first_paid_lesson_completed,
        c.manual_intake,
        c.intake_notes,
        c.intake_source,
        c.follow_up_due_at,
        c.assigned_tutor_id,
        c.assigned_tutor_name,
        c.created_at,
        c.lead_score,
        c.lead_score_updated_at,
        bs.heard_about,
        bs.utm,
        bs.landing_url,
        bs.referrer,
        bs.booking_type,
        bs.actual_price,
        bs.original_price,
        bs.created_at as submission_created_at,
        ps.name as pipeline_stage,
        ps.order_index as stage_order
      FROM clients c
      LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text
      LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
      WHERE c.lead_score_stale = true
        AND c.status = 'prospect'
      ORDER BY c.created_at DESC
      LIMIT $1
    `, [limit]);

    return rows;
  }

  /**
   * Get latest notes for a prospect (for context)
   */
  async getLatestNotes(clientId, limit = 5) {
    const { rows } = await this.pool.query(`
      SELECT note, created_at, created_by
      FROM client_notes
      WHERE client_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [clientId, limit]);
    return rows;
  }

  /**
   * Get conversion event history for a prospect
   */
  async getEventHistory(clientId) {
    const { rows } = await this.pool.query(`
      SELECT
        from_prospect_status,
        to_prospect_status,
        automation_trigger,
        change_reason,
        created_at
      FROM client_conversion_events
      WHERE client_id = $1
      ORDER BY created_at ASC
    `, [clientId]);
    return rows;
  }

  /**
   * Assemble the context string for a single prospect
   */
  async assembleProspectContext(prospect) {
    const [notes, events] = await Promise.all([
      this.getLatestNotes(prospect.id),
      this.getEventHistory(prospect.id)
    ]);

    const now = new Date();
    const createdAt = new Date(prospect.created_at);
    const daysSinceInquiry = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    const utmData = prospect.utm || {};

    return `PROSPECT: ${prospect.first_name} ${prospect.last_name}
Email: ${prospect.email || 'N/A'}
Phone: ${prospect.mobile || prospect.phone || 'N/A'}

DEMOGRAPHICS:
- Market: ${prospect.market || 'Unknown'}
- Lead Type: ${prospect.lead_type || 'Unknown'}
- Labels: ${JSON.stringify(prospect.labels || [])}
- Program Interest: ${prospect.booking_type || 'Unknown'}

FUNNEL STATUS:
- Current Status: ${prospect.prospect_status || 'Need To Contact'}
- Pipeline Stage: ${prospect.pipeline_stage || 'Unassigned'}
- Days Since Inquiry: ${daysSinceInquiry}
- Registration Complete: ${prospect.date_registration_complete || 'No'}
- Offered to Tutors: ${prospect.date_offered_to_tutors || 'No'}
- Tutor Paired: ${prospect.date_tutor_client_paired || 'No'}
- Tutor Paired Scheduled: ${prospect.date_tutor_client_paired_scheduled || 'No'}
- Trial Lesson Date: ${prospect.date_trial_first_lesson || 'Not scheduled'}
- Trial Follow-Up Complete: ${prospect.trial_follow_up_completed ? 'Yes' : 'No'}
- First Paid Scheduled: ${prospect.first_paid_lesson_scheduled || 'No'}
- First Paid Complete: ${prospect.first_paid_lesson_completed ? 'Yes' : 'No'}
- Tutor Assigned: ${prospect.assigned_tutor_name || 'None'}

SOURCE & ATTRIBUTION:
- How They Heard: ${prospect.heard_about || 'Unknown'}
- UTM Source: ${utmData.utm_source || 'N/A'}
- UTM Medium: ${utmData.utm_medium || 'N/A'}
- UTM Campaign: ${utmData.utm_campaign || 'N/A'}
- Landing URL: ${prospect.landing_url || 'N/A'}
- Referrer: ${prospect.referrer || 'N/A'}
- Intake Source: ${prospect.intake_source || 'N/A'}
- Manual Intake: ${prospect.manual_intake ? 'Yes' : 'No'}

NOTES (most recent first):
${notes.length > 0 ? notes.map(n => `- [${new Date(n.created_at).toLocaleDateString()}] ${n.note}`).join('\n') : '- No notes'}

EVENT HISTORY:
${events.length > 0 ? events.map(e => `- [${new Date(e.created_at).toLocaleDateString()}] ${e.from_prospect_status || '?'} → ${e.to_prospect_status || '?'}${e.automation_trigger ? ` (auto: ${e.automation_trigger})` : ''}${e.change_reason ? ` — ${e.change_reason}` : ''}`).join('\n') : '- No events'}

INTAKE NOTES: ${prospect.intake_notes || 'None'}`;
  }

  /**
   * Score a single prospect via Claude API
   */
  async scoreProspect(prospect, triggerEvent = 'manual') {
    const context = await this.assembleProspectContext(prospect);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: SCORING_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Score this prospect. Return JSON only.\n\n${context}`
        }
      ],
      tools: [{
        name: 'submit_lead_score',
        description: 'Submit the scored lead assessment',
        input_schema: {
          type: 'object',
          properties: {
            overall_score: { type: 'integer', description: '0-10 overall conversion likelihood' },
            components: {
              type: 'object',
              properties: {
                family_fit: { type: 'integer', description: '0-10 family fit score' },
                engagement: { type: 'integer', description: '0-10 engagement level score' },
                funnel_progress: { type: 'integer', description: '0-10 funnel progress score' },
                source_quality: { type: 'integer', description: '0-10 source quality score' },
                timing: { type: 'integer', description: '0-10 timing signals score' }
              },
              required: ['family_fit', 'engagement', 'funnel_progress', 'source_quality', 'timing']
            },
            reasoning: { type: 'string', description: 'Brief explanation of score (2-3 sentences)' },
            recommended_action: {
              type: 'string',
              enum: ['immediate_outreach', 'schedule_follow_up', 'nurture_sequence', 'deprioritize'],
              description: 'Recommended next action for this prospect'
            }
          },
          required: ['overall_score', 'components', 'reasoning', 'recommended_action']
        }
      }],
      tool_choice: { type: 'tool', name: 'submit_lead_score' }
    });

    // Extract tool use result
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) {
      throw new Error('Claude did not return a tool use response');
    }

    const result = toolUse.input;
    const score = Math.max(0, Math.min(10, result.overall_score));
    const tier = getTier(score);
    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);

    // Update client record
    await this.pool.query(`
      UPDATE clients
      SET lead_score = $1,
          lead_score_tier = $2,
          lead_score_reasoning = $3,
          lead_score_components = $4,
          lead_score_stale = false,
          lead_score_updated_at = NOW()
      WHERE id = $5
    `, [score, tier, result.reasoning, JSON.stringify(result.components), prospect.id]);

    // Insert history record
    await this.pool.query(`
      INSERT INTO lead_score_history (client_id, score, tier, components, reasoning, trigger_event, model_used, tokens_used)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [prospect.id, score, tier, JSON.stringify(result.components), result.reasoning, triggerEvent, 'claude-sonnet-4-20250514', tokensUsed]);

    logger.info({
      clientId: prospect.id,
      score,
      tier,
      triggerEvent,
      tokensUsed
    }, 'Prospect scored');

    return { score, tier, reasoning: result.reasoning, components: result.components, recommended_action: result.recommended_action };
  }

  /**
   * Batch score all stale prospects
   * Called by the background worker
   */
  async scoreStaleProspects() {
    const staleProspects = await this.getStaleProspects(20);

    if (staleProspects.length === 0) {
      logger.info('No stale prospects to score');
      return { scored: 0, errors: 0 };
    }

    logger.info({ count: staleProspects.length }, 'Scoring stale prospects');

    let scored = 0;
    let errors = 0;

    // Score sequentially to respect API rate limits
    for (const prospect of staleProspects) {
      try {
        await this.scoreProspect(prospect, 'batch_stale');
        scored++;
      } catch (err) {
        errors++;
        logger.error({
          clientId: prospect.id,
          error: err.message
        }, 'Failed to score prospect');

        // If rate limited, stop the batch
        if (err.status === 429 || err.message?.includes('rate')) {
          logger.warn('Rate limited, stopping batch');
          break;
        }
      }
    }

    return { scored, errors, total: staleProspects.length };
  }
}

module.exports = LeadScoringService;
