// services/marketing-results-tracker.js
/**
 * Marketing Results Tracker Service
 *
 * Tracks campaign performance after launch by taking snapshots
 * at day 1, 7, 14, and 30 and comparing to AI projections.
 */

const MetaAdsApi = require('./meta-ads-api');
const GoogleAdsApi = require('./google-ads-api');
const { logger } = require('../utils/logger');

class MarketingResultsTracker {
  constructor(pool) {
    this.pool = pool;
    this.metaApi = new MetaAdsApi();
    this.googleApi = new GoogleAdsApi();
  }

  /**
   * Get metrics for a specific campaign
   */
  async getCampaignMetrics(platform, externalId) {
    const metrics = {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
    };

    try {
      if (platform === 'meta' && this.metaApi.isConfigured()) {
        const campaigns = await this.metaApi.getCampaignsList();
        const campaign = campaigns.find(c => c.id === externalId);
        if (campaign) {
          metrics.spend = parseFloat(campaign.spend || 0);
          metrics.impressions = parseInt(campaign.impressions || 0);
          metrics.clicks = parseInt(campaign.clicks || 0);
          // Note: conversions/revenue would come from attribution
        }
      } else if (platform === 'google' && this.googleApi.isConfigured()) {
        const campaigns = await this.googleApi.getCampaignsList();
        const campaign = campaigns.find(c => c.id === externalId);
        if (campaign) {
          metrics.spend = parseFloat(campaign.cost || 0) / 1000000; // Google returns micros
          metrics.impressions = parseInt(campaign.impressions || 0);
          metrics.clicks = parseInt(campaign.clicks || 0);
          metrics.conversions = parseInt(campaign.conversions || 0);
        }
      }
    } catch (err) {
      logger.warn({ data: err.message }, `Could not fetch metrics for ${platform}/${externalId}:`);
    }

    // Calculate derived metrics
    metrics.ctr = metrics.impressions > 0
      ? (metrics.clicks / metrics.impressions * 100).toFixed(2)
      : 0;
    metrics.cpc = metrics.clicks > 0
      ? (metrics.spend / metrics.clicks).toFixed(2)
      : 0;
    metrics.cpl = metrics.conversions > 0
      ? (metrics.spend / metrics.conversions).toFixed(2)
      : 0;
    metrics.roas = metrics.spend > 0
      ? (metrics.revenue / metrics.spend).toFixed(2)
      : 0;

    return metrics;
  }

  /**
   * Take a snapshot for a draft
   */
  async takeSnapshot(draftId, snapshotType) {
    // Get draft details
    const draftResult = await this.pool.query(
      'SELECT * FROM marketing_campaign_drafts WHERE id = $1',
      [draftId]
    );

    if (draftResult.rows.length === 0) {
      throw new Error('Draft not found');
    }

    const draft = draftResult.rows[0];

    if (!draft.external_id) {
      throw new Error('Draft has no external campaign ID');
    }

    // Get current metrics
    const metrics = await this.getCampaignMetrics(draft.platform, draft.external_id);

    // Compare to projection
    const projection = draft.projected_impact || {};
    const vsProjection = {};

    if (projection.estimated_cpl) {
      vsProjection.cpl_projected = projection.estimated_cpl;
      vsProjection.cpl_actual = metrics.cpl;
      vsProjection.cpl_variance = metrics.cpl > 0
        ? ((metrics.cpl - projection.estimated_cpl) / projection.estimated_cpl * 100).toFixed(1)
        : null;
    }

    if (projection.estimated_roas) {
      vsProjection.roas_projected = projection.estimated_roas;
      vsProjection.roas_actual = metrics.roas;
      vsProjection.roas_variance = projection.estimated_roas > 0
        ? ((metrics.roas - projection.estimated_roas) / projection.estimated_roas * 100).toFixed(1)
        : null;
    }

    // Save snapshot
    await this.pool.query(`
      INSERT INTO marketing_draft_results (draft_id, snapshot_type, snapshot_date, metrics, vs_projection)
      VALUES ($1, $2, CURRENT_DATE, $3, $4)
      ON CONFLICT (draft_id, snapshot_type) DO UPDATE SET
        metrics = EXCLUDED.metrics,
        vs_projection = EXCLUDED.vs_projection,
        created_at = NOW()
    `, [draftId, snapshotType, JSON.stringify(metrics), JSON.stringify(vsProjection)]);

    // Update draft results summary
    await this.updateDraftResultsSummary(draftId);

    return { metrics, vsProjection };
  }

  /**
   * Update the results summary on the draft
   */
  async updateDraftResultsSummary(draftId) {
    const snapshotsResult = await this.pool.query(`
      SELECT snapshot_type, metrics, vs_projection
      FROM marketing_draft_results
      WHERE draft_id = $1
      ORDER BY snapshot_date DESC
    `, [draftId]);

    const summary = {
      lastUpdated: new Date().toISOString(),
      snapshots: snapshotsResult.rows.reduce((acc, row) => {
        acc[row.snapshot_type] = {
          metrics: row.metrics,
          vsProjection: row.vs_projection,
        };
        return acc;
      }, {}),
    };

    // Determine overall status
    const latest = snapshotsResult.rows[0];
    if (latest?.vs_projection?.cpl_variance) {
      const variance = parseFloat(latest.vs_projection.cpl_variance);
      if (variance > 30) {
        summary.status = 'underperforming';
      } else if (variance < -20) {
        summary.status = 'exceeding';
      } else {
        summary.status = 'on_track';
      }
    }

    await this.pool.query(`
      UPDATE marketing_campaign_drafts
      SET results_summary = $2
      WHERE id = $1
    `, [draftId, JSON.stringify(summary)]);
  }

  /**
   * Get drafts that need snapshots today
   */
  async getDraftsNeedingSnapshots() {
    // Find pushed drafts and determine which snapshots are due
    const result = await this.pool.query(`
      SELECT
        d.id,
        d.platform,
        d.external_id,
        d.pushed_at,
        EXTRACT(DAY FROM NOW() - d.pushed_at) as days_since_push
      FROM marketing_campaign_drafts d
      WHERE d.status = 'pushed'
        AND d.external_id IS NOT NULL
        AND d.pushed_at IS NOT NULL
    `);

    const draftsNeedingSnapshots = [];

    for (const draft of result.rows) {
      const daysSincePush = Math.floor(draft.days_since_push);

      // Check which snapshots are needed
      const snapshotsNeeded = [];

      if (daysSincePush >= 1) {
        const hasDay1 = await this.hasSnapshot(draft.id, 'day_1');
        if (!hasDay1) snapshotsNeeded.push('day_1');
      }
      if (daysSincePush >= 7) {
        const hasDay7 = await this.hasSnapshot(draft.id, 'day_7');
        if (!hasDay7) snapshotsNeeded.push('day_7');
      }
      if (daysSincePush >= 14) {
        const hasDay14 = await this.hasSnapshot(draft.id, 'day_14');
        if (!hasDay14) snapshotsNeeded.push('day_14');
      }
      if (daysSincePush >= 30) {
        const hasDay30 = await this.hasSnapshot(draft.id, 'day_30');
        if (!hasDay30) snapshotsNeeded.push('day_30');
      }

      if (snapshotsNeeded.length > 0) {
        draftsNeedingSnapshots.push({
          ...draft,
          snapshotsNeeded,
        });
      }
    }

    return draftsNeedingSnapshots;
  }

  /**
   * Check if a snapshot exists
   */
  async hasSnapshot(draftId, snapshotType) {
    const result = await this.pool.query(
      'SELECT 1 FROM marketing_draft_results WHERE draft_id = $1 AND snapshot_type = $2',
      [draftId, snapshotType]
    );
    return result.rows.length > 0;
  }

  /**
   * Run scheduled snapshot job
   */
  async runScheduledSnapshots() {
    logger.info('\n========== Results Tracker Snapshots ==========');

    const draftsNeedingSnapshots = await this.getDraftsNeedingSnapshots();
    logger.info(`Found ${draftsNeedingSnapshots.length} drafts needing snapshots`);

    let snapshotsTaken = 0;

    for (const draft of draftsNeedingSnapshots) {
      for (const snapshotType of draft.snapshotsNeeded) {
        try {
          await this.takeSnapshot(draft.id, snapshotType);
          logger.info(`  ✓ ${snapshotType} snapshot for draft ${draft.id}`);
          snapshotsTaken++;
        } catch (err) {
          logger.error({ error: err.message }, `  ✗ Failed ${snapshotType} for draft ${draft.id}:`);
        }
      }
    }

    logger.info(`Took ${snapshotsTaken} snapshots`);
    logger.info('========== Snapshots Complete ==========\n');

    return { draftsProcessed: draftsNeedingSnapshots.length, snapshotsTaken };
  }

  /**
   * Get results for a draft
   */
  async getDraftResults(draftId) {
    const result = await this.pool.query(`
      SELECT * FROM marketing_draft_results
      WHERE draft_id = $1
      ORDER BY
        CASE snapshot_type
          WHEN 'before' THEN 1
          WHEN 'day_1' THEN 2
          WHEN 'day_7' THEN 3
          WHEN 'day_14' THEN 4
          WHEN 'day_30' THEN 5
        END
    `, [draftId]);
    return result.rows;
  }
}

module.exports = MarketingResultsTracker;
