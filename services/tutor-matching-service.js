// services/tutor-matching-service.js
/**
 * Tutor-Client Matching Service
 *
 * Deterministic scoring algorithm that recommends the best
 * tutor matches for a prospect based on market, load, rating,
 * label alignment, and certification health.
 *
 * No Claude API calls — pure SQL + JS math.
 */

const { logger } = require('../utils/logger');
const { MARKET_MAPPING } = require('../utils/market-mapping');

// Reverse map: market → labels that belong to it
// e.g., "SF" → ["Home - SF", "School - SF"]
const MARKET_TO_LABELS = {};
for (const [label, market] of Object.entries(MARKET_MAPPING)) {
  if (!MARKET_TO_LABELS[market]) MARKET_TO_LABELS[market] = [];
  MARKET_TO_LABELS[market].push(label);
}

// Service type prefixes from labels
const SERVICE_TYPES = ['Home', 'School', 'Club', 'Online'];

/**
 * Extract service type from a label string
 * e.g., "Home - SF" → "Home", "Online" → "Online"
 */
function getServiceType(label) {
  for (const type of SERVICE_TYPES) {
    if (label === type || label.startsWith(`${type} - `)) return type;
  }
  return null;
}

/**
 * Extract client's service types and market from their labels
 */
function parseClientLabels(labels) {
  if (!labels || !Array.isArray(labels)) return { serviceTypes: [], market: null };

  const serviceTypes = new Set();
  let market = null;

  for (const label of labels) {
    const labelName = typeof label === 'string' ? label : (label?.name || '');
    const svcType = getServiceType(labelName);
    if (svcType) serviceTypes.add(svcType);
    if (!market && MARKET_MAPPING[labelName]) {
      market = MARKET_MAPPING[labelName];
    }
  }

  return { serviceTypes: [...serviceTypes], market };
}

// Scoring weights
const WEIGHTS = {
  LOAD: 0.30,
  RATING: 0.25,
  LABEL_ALIGNMENT: 0.25,
  CERTIFICATION: 0.20
};

class TutorMatchingService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get recommended tutors for a prospect
   * @param {number} clientId - Client ID
   * @param {number} limit - Max results (default 5)
   * @returns {Array} Ranked tutor recommendations with score breakdowns
   */
  async getRecommendations(clientId, limit = 5) {
    // 1. Get client details
    const { rows: [client] } = await this.pool.query(`
      SELECT id, first_name, last_name, market, labels, assigned_tutor_id
      FROM clients
      WHERE id = $1
    `, [clientId]);

    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const clientLabels = client.labels
      ? (typeof client.labels === 'string' ? JSON.parse(client.labels) : client.labels)
      : [];
    const { serviceTypes, market } = parseClientLabels(clientLabels);

    logger.info({
      clientId,
      market,
      serviceTypes,
      labelCount: clientLabels.length
    }, 'Matching tutors for prospect');

    // 2. Get eligible tutors (approved, in matching market)
    const tutors = await this.getEligibleTutors(market, serviceTypes);

    if (tutors.length === 0) {
      logger.info({ clientId, market }, 'No eligible tutors found for market');
      return [];
    }

    // 3. Get active pairing counts for load scoring
    const loadMap = await this.getTutorLoadCounts(tutors.map(t => t.contractor_id));

    // 4. Get certification status
    const certMap = await this.getTutorCertStatus(tutors.map(t => t.contractor_id));

    // 5. Score and rank
    const scored = tutors.map(tutor => {
      const scores = this.scoreTutor(tutor, {
        market,
        serviceTypes,
        activeClients: loadMap.get(tutor.contractor_id) || 0,
        certStatus: certMap.get(tutor.contractor_id) || { total: 0, approved: 0, nearExpiry: 0 }
      });

      return {
        contractor_id: tutor.contractor_id,
        first_name: tutor.first_name,
        last_name: tutor.last_name,
        email: tutor.email,
        photo: tutor.photo,
        labels: tutor.labels,
        review_rating: tutor.review_rating,
        default_rate: tutor.default_rate,
        active_clients: loadMap.get(tutor.contractor_id) || 0,
        ...scores
      };
    });

    // Sort by composite score descending
    scored.sort((a, b) => b.composite_score - a.composite_score);

    // Filter out currently assigned tutor
    const filtered = client.assigned_tutor_id
      ? scored.filter(t => t.contractor_id !== client.assigned_tutor_id)
      : scored;

    return filtered.slice(0, limit);
  }

  /**
   * Get approved tutors whose labels overlap with client's market
   */
  async getEligibleTutors(market, serviceTypes) {
    if (!market) {
      // No market — return all approved tutors (rare edge case)
      const { rows } = await this.pool.query(`
        SELECT contractor_id, first_name, last_name, email, photo,
               labels, review_rating, default_rate, status
        FROM contractors
        WHERE status = 'approved'
        ORDER BY review_rating DESC NULLS LAST
        LIMIT 50
      `);
      return this.parseLabels(rows);
    }

    // Get all labels that map to this market
    const marketLabels = MARKET_TO_LABELS[market] || [];

    // Also include "Online" tutors if client is Online market or as fallback
    const allLabels = [...new Set([...marketLabels, 'Online'])];

    // Find tutors whose labels JSONB array contains any matching label
    // Using jsonb_array_elements to check for label overlap
    const { rows } = await this.pool.query(`
      SELECT DISTINCT ON (c.contractor_id)
        c.contractor_id, c.first_name, c.last_name, c.email, c.photo,
        c.labels, c.review_rating, c.default_rate, c.status
      FROM contractors c
      WHERE c.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(c.labels) = 'array' THEN c.labels ELSE '[]'::jsonb END
          ) AS label_text
          WHERE label_text = ANY($1)
        )
      ORDER BY c.contractor_id, c.review_rating DESC NULLS LAST
    `, [allLabels]);

    return this.parseLabels(rows);
  }

  /**
   * Parse labels from JSONB for each tutor row
   */
  parseLabels(rows) {
    return rows.map(row => ({
      ...row,
      labels: row.labels
        ? (typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels)
        : []
    }));
  }

  /**
   * Get active client count per tutor (load)
   */
  async getTutorLoadCounts(contractorIds) {
    if (contractorIds.length === 0) return new Map();

    const { rows } = await this.pool.query(`
      SELECT assigned_tutor_id AS tutor_id, COUNT(*) AS active_count
      FROM clients
      WHERE assigned_tutor_id = ANY($1)
        AND status = 'prospect'
        AND archived_at IS NULL
      GROUP BY assigned_tutor_id
    `, [contractorIds]);

    const map = new Map();
    for (const row of rows) {
      map.set(row.tutor_id, parseInt(row.active_count, 10));
    }
    return map;
  }

  /**
   * Get certification status per tutor
   */
  async getTutorCertStatus(contractorIds) {
    if (contractorIds.length === 0) return new Map();

    const { rows } = await this.pool.query(`
      SELECT
        tutor_id,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved,
        COUNT(*) FILTER (WHERE status = 'approved' AND expiration_date IS NOT NULL
                         AND expiration_date < NOW() + INTERVAL '30 days') AS near_expiry
      FROM tutor_certifications
      WHERE tutor_id = ANY($1)
      GROUP BY tutor_id
    `, [contractorIds]);

    const map = new Map();
    for (const row of rows) {
      map.set(row.tutor_id, {
        total: parseInt(row.total, 10),
        approved: parseInt(row.approved, 10),
        nearExpiry: parseInt(row.near_expiry, 10)
      });
    }
    return map;
  }

  /**
   * Score a single tutor against client requirements
   * Returns component scores (0-100) and weighted composite
   */
  scoreTutor(tutor, context) {
    const { market, serviceTypes, activeClients, certStatus } = context;

    // --- Load Score (30%) ---
    // 0 clients = 100, 10+ clients = 0, linear
    const loadScore = Math.max(0, Math.min(100, 100 - (activeClients * 10)));

    // --- Rating Score (25%) ---
    // review_rating is 0-5, normalize to 0-100
    // No rating = 50 (neutral, not penalized)
    const ratingScore = tutor.review_rating != null
      ? Math.round((tutor.review_rating / 5) * 100)
      : 50;

    // --- Label Alignment Score (25%) ---
    // Perfect: tutor has exact service type + market match (e.g., "Home - SF" for home client in SF)
    // Good: tutor is in right market but different service type
    // Fallback: Online tutor for any client
    let labelScore = 0;
    const tutorLabels = tutor.labels || [];
    const tutorLabelNames = tutorLabels.map(l => typeof l === 'string' ? l : (l?.name || ''));

    // Check for exact service type + market match
    let hasExactMatch = false;
    let hasMarketMatch = false;
    let hasOnline = false;

    for (const labelName of tutorLabelNames) {
      const labelMarket = MARKET_MAPPING[labelName];
      const labelService = getServiceType(labelName);

      if (labelMarket === market) {
        hasMarketMatch = true;
        if (serviceTypes.length === 0 || serviceTypes.includes(labelService)) {
          hasExactMatch = true;
        }
      }
      if (labelName === 'Online') hasOnline = true;
    }

    if (hasExactMatch) {
      labelScore = 100;
    } else if (hasMarketMatch) {
      labelScore = 70;
    } else if (hasOnline) {
      labelScore = 40;
    }

    // --- Certification Score (20%) ---
    // All approved = 100, any missing = 50, near-expiry = dinged
    let certScore = 100; // No certs required = perfect
    if (certStatus.total > 0) {
      const approvalRate = certStatus.approved / certStatus.total;
      certScore = Math.round(approvalRate * 100);
      // Ding for near-expiry certs
      if (certStatus.nearExpiry > 0) {
        certScore = Math.max(0, certScore - (certStatus.nearExpiry * 15));
      }
    }

    // --- Composite ---
    const composite = Math.round(
      (loadScore * WEIGHTS.LOAD) +
      (ratingScore * WEIGHTS.RATING) +
      (labelScore * WEIGHTS.LABEL_ALIGNMENT) +
      (certScore * WEIGHTS.CERTIFICATION)
    );

    return {
      composite_score: composite,
      components: {
        load: loadScore,
        rating: ratingScore,
        label_alignment: labelScore,
        certification: certScore
      }
    };
  }
}

module.exports = TutorMatchingService;
