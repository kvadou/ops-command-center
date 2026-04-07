// services/klaviyo-sync-service.js
/**
 * Klaviyo Sync Service
 *
 * Syncs flows, flow emails, and lists from Klaviyo API to local database.
 * Extends the basic campaign sync in klaviyo-ads-service.js.
 *
 * NOTE: The existing klaviyo_flows table uses `id` as the Klaviyo flow ID (varchar),
 * not a separate `klaviyo_flow_id` column. This service works with that schema.
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const REVISION = '2024-10-15';

class KlaviyoSyncService {
  constructor(pool) {
    this.pool = pool;
    this.apiKey = process.env.KLAVIYO_API_KEY;
    this.enabled = !!this.apiKey;

    if (!this.enabled) {
      logger.warn('Klaviyo Sync Service: KLAVIYO_API_KEY not configured');
    }
  }

  /**
   * Make authenticated request to Klaviyo API
   */
  async _request(endpoint, params = {}) {
    if (!this.enabled) {
      logger.info(`[STUB] Klaviyo sync _request: ${endpoint}`);
      return { data: [] };
    }

    const response = await axios({
      method: 'GET',
      url: `${KLAVIYO_API_BASE}${endpoint}`,
      params,
      headers: {
        'Accept': 'application/json',
        'revision': REVISION,
        'Authorization': `Klaviyo-API-Key ${this.apiKey}`,
      },
      timeout: 30000,
    });

    return response.data;
  }

  /**
   * Paginate through Klaviyo API results
   */
  async _paginate(endpoint, params = {}) {
    const allData = [];
    let cursor = null;
    let iterations = 0;
    const maxIterations = 50;

    while (iterations < maxIterations) {
      const requestParams = { ...params };
      if (cursor) {
        requestParams['page[cursor]'] = cursor;
      }

      const response = await this._request(endpoint, requestParams);

      if (response.data && Array.isArray(response.data)) {
        allData.push(...response.data);
      }

      const nextLink = response.links?.next;
      if (!nextLink) break;

      const cursorMatch = nextLink.match(/page%5Bcursor%5D=([^&]+)/);
      if (!cursorMatch) break;

      cursor = decodeURIComponent(cursorMatch[1]);
      iterations++;
    }

    return allData;
  }

  /**
   * Sync all flows from Klaviyo
   * NOTE: Existing table uses `id` as the Klaviyo flow ID directly
   */
  async syncFlows() {
    if (!this.enabled) {
      return { success: false, error: 'Klaviyo not configured' };
    }

    try {
      logger.info('Syncing Klaviyo flows...');
      const flows = await this._paginate('/flows/');

      let synced = 0;
      for (const flow of flows) {
        const flowId = flow.id;
        const attrs = flow.attributes || {};

        await this.pool.query(`
          INSERT INTO klaviyo_flows (id, name, status, trigger_type, synced_at, raw_data)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            status = EXCLUDED.status,
            trigger_type = EXCLUDED.trigger_type,
            synced_at = NOW(),
            raw_data = EXCLUDED.raw_data
        `, [
          flowId,
          attrs.name || 'Unnamed Flow',
          attrs.status || 'unknown',
          attrs.trigger_type || null,
          JSON.stringify(flow),
        ]);
        synced++;
      }

      logger.info(`  ✓ Synced ${synced} flows`);
      return { success: true, flowsCount: synced };
    } catch (error) {
      logger.error({ error: error.message }, 'Error syncing Klaviyo flows:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync flow messages (emails) for all flows
   */
  async syncFlowEmails() {
    if (!this.enabled) {
      return { success: false, error: 'Klaviyo not configured' };
    }

    try {
      logger.info('Syncing Klaviyo flow emails...');

      // Get all flows from database - note: `id` IS the klaviyo flow id
      const flowsResult = await this.pool.query(
        'SELECT id FROM klaviyo_flows'
      );

      let totalEmails = 0;
      for (const flow of flowsResult.rows) {
        try {
          // Fetch flow actions/messages
          const response = await this._request(
            `/flows/${flow.id}/flow-actions/`,
            { 'include': 'flow-messages' }
          );

          const actions = response.data || [];
          let position = 0;

          for (const action of actions) {
            // Each action may have associated messages
            const messages = response.included?.filter(
              inc => inc.type === 'flow-message'
            ) || [];

            for (const message of messages) {
              const msgAttrs = message.attributes || {};

              await this.pool.query(`
                INSERT INTO klaviyo_flow_emails
                  (flow_id, klaviyo_email_id, position_in_flow, subject, preview_text, last_synced_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (flow_id, klaviyo_email_id) DO UPDATE SET
                  position_in_flow = EXCLUDED.position_in_flow,
                  subject = EXCLUDED.subject,
                  preview_text = EXCLUDED.preview_text,
                  last_synced_at = NOW()
              `, [
                flow.id, // flow_id is varchar, matches klaviyo_flows.id
                message.id,
                position++,
                msgAttrs.label || msgAttrs.subject || 'No subject',
                msgAttrs.preview_text || null,
              ]);
              totalEmails++;
            }
          }
        } catch (flowError) {
          logger.warn({ data: flowError.message }, `  Warning: Could not sync emails for flow ${flow.id}:`);
        }
      }

      logger.info(`  ✓ Synced ${totalEmails} flow emails`);
      return { success: true, emailsCount: totalEmails };
    } catch (error) {
      logger.error({ error: error.message }, 'Error syncing Klaviyo flow emails:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync all lists from Klaviyo
   * NOTE: Existing table uses `id` as the Klaviyo list ID directly
   */
  async syncLists() {
    if (!this.enabled) {
      return { success: false, error: 'Klaviyo not configured' };
    }

    try {
      logger.info('Syncing Klaviyo lists...');
      const lists = await this._paginate('/lists/');

      let synced = 0;
      for (const list of lists) {
        const listId = list.id;
        const attrs = list.attributes || {};

        await this.pool.query(`
          INSERT INTO klaviyo_lists (id, name, list_type, synced_at, raw_data)
          VALUES ($1, $2, $3, NOW(), $4)
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            list_type = EXCLUDED.list_type,
            synced_at = NOW(),
            raw_data = EXCLUDED.raw_data
        `, [
          listId,
          attrs.name || 'Unnamed List',
          attrs.list_type || 'list',
          JSON.stringify(list),
        ]);
        synced++;
      }

      logger.info(`  ✓ Synced ${synced} lists`);
      return { success: true, listsCount: synced };
    } catch (error) {
      logger.error({ error: error.message }, 'Error syncing Klaviyo lists:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync flow metrics (aggregate stats)
   */
  async syncFlowMetrics() {
    if (!this.enabled) {
      return { success: false, error: 'Klaviyo not configured' };
    }

    try {
      logger.info('Syncing Klaviyo flow metrics...');

      // Get flows that need metrics update
      const flowsResult = await this.pool.query(
        'SELECT id, name FROM klaviyo_flows'
      );

      let updated = 0;
      for (const flow of flowsResult.rows) {
        try {
          // Query metrics for this flow using the reporting API
          const metricsResponse = await this._request(
            `/flow-series-reports/`,
            {
              'filter': `equals(flow_id,"${flow.id}")`,
              'fields[flow-series-report]': 'statistics',
            }
          );

          const stats = metricsResponse.data?.[0]?.attributes?.statistics || {};

          await this.pool.query(`
            UPDATE klaviyo_flows
            SET metrics = $2, synced_at = NOW()
            WHERE id = $1
          `, [flow.id, JSON.stringify(stats)]);

          updated++;
        } catch (flowError) {
          // Metrics endpoint may not be available for all flows
          logger.warn(`  Warning: Could not fetch metrics for flow ${flow.name}`);
        }
      }

      logger.info(`  ✓ Updated metrics for ${updated} flows`);
      return { success: true, updatedCount: updated };
    } catch (error) {
      logger.error({ error: error.message }, 'Error syncing Klaviyo flow metrics:');
      return { success: false, error: error.message };
    }
  }

  /**
   * Run full sync of all Klaviyo data
   */
  async syncAll() {
    logger.info('\n========== Klaviyo Full Sync ==========');

    const results = {
      flows: await this.syncFlows(),
      flowEmails: await this.syncFlowEmails(),
      lists: await this.syncLists(),
      metrics: await this.syncFlowMetrics(),
    };

    logger.info('========== Sync Complete ==========\n');
    return results;
  }

  /**
   * Get all flows with their emails
   */
  async getFlowsWithEmails() {
    const result = await this.pool.query(`
      SELECT
        f.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'klaviyo_email_id', e.klaviyo_email_id,
              'position', e.position_in_flow,
              'subject', e.subject,
              'metrics', e.metrics
            ) ORDER BY e.position_in_flow
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) as emails
      FROM klaviyo_flows f
      LEFT JOIN klaviyo_flow_emails e ON e.flow_id = f.id
      GROUP BY f.id
      ORDER BY f.name
    `);
    return result.rows;
  }

  /**
   * Get all lists with member counts
   */
  async getLists() {
    const result = await this.pool.query(`
      SELECT * FROM klaviyo_lists ORDER BY name
    `);
    return result.rows;
  }
}

module.exports = KlaviyoSyncService;
