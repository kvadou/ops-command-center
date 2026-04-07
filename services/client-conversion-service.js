/**
 * Client Conversion Service
 * Extracts business logic from routes into a service layer
 */
const { tableExists, columnsExist, columnExists } = require('../utils/schema-cache');
const { logger } = require('../utils/logger');

class ClientConversionService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Get all clients with conversion status
   */
  async getClients(pagination = { page: 1, limit: 50 }) {
    const { page, limit, offset } = pagination;
    
    // Check if clients table has the new columns (cached)
    const existingCols = await columnsExist(this.pool, 'clients', ['status', 'pipeline_stage_id']);

    const hasStatusColumn = existingCols.includes('status');
    const hasPipelineColumn = existingCols.includes('pipeline_stage_id');
    
    let baseQuery;
    if (hasStatusColumn && hasPipelineColumn) {
      baseQuery = `
        SELECT 
          c.id,
          c.client_id,
          c.first_name,
          c.last_name,
          c.email,
          c.mobile,
          c.phone,
          c.status as client_status,
          c.created_at as client_created_at,
          c.updated_at as client_updated_at,
          c.labels,
          c.market,
          c.lead_type,
          c.date_registration_complete,
          c.assigned_tutor_id,
          c.assigned_tutor_name,
          c.date_tutor_client_paired,
          c.date_tutor_client_paired_scheduled,
          c.date_trial_first_lesson,
          c.trial_follow_up_completed,
          c.first_paid_lesson_scheduled,
          c.first_paid_lesson_completed,
          c.manual_intake,
          c.intake_notes,
          c.intake_source,
          c.intake_created_by,
          c.follow_up_due_at,
          c.has_class_pack,
          c.club_class_name,
          c.lead_score,
          c.lead_score_tier,
          c.lead_score_reasoning,
          c.lead_score_components,
          c.lead_score_stale,
          c.lead_score_updated_at,
          bs.id as submission_id,
          bs.booking_type,
          bs.payment_status,
          bs.status as submission_status,
          bs.created_at as submission_created_at,
          bs.actual_price,
          bs.original_price,
          bs.heard_about,
          bs.utm,
          bs.landing_url,
          bs.referrer,
          c.pipeline_stage_id,
          ps.name as pipeline_stage,
          ps.pipeline as pipeline_name,
          ps.order_index as stage_order,
          ps.active as stage_active
        FROM clients c
        LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text
        LEFT JOIN pipeline_stages ps ON c.pipeline_stage_id = ps.id
        WHERE c.status = 'prospect'
        ORDER BY c.created_at DESC
      `;
    } else {
      baseQuery = `
        SELECT 
          c.id,
          c.client_id,
          c.first_name,
          c.last_name,
          c.email,
          c.mobile,
          c.phone,
          c.status as client_status,
          c.created_at as client_created_at,
          c.updated_at as client_updated_at,
          c.labels,
          c.market,
          c.lead_type,
          c.date_registration_complete,
          c.assigned_tutor_id,
          c.assigned_tutor_name,
          c.date_tutor_client_paired,
          c.date_tutor_client_paired_scheduled,
          c.date_trial_first_lesson,
          c.trial_follow_up_completed,
          c.first_paid_lesson_scheduled,
          c.first_paid_lesson_completed,
          c.manual_intake,
          c.intake_notes,
          c.intake_source,
          c.intake_created_by,
          c.follow_up_due_at,
          c.has_class_pack,
          c.club_class_name,
          c.lead_score,
          c.lead_score_tier,
          c.lead_score_reasoning,
          c.lead_score_components,
          c.lead_score_stale,
          c.lead_score_updated_at,
          bs.id as submission_id,
          bs.booking_type,
          bs.payment_status,
          bs.status as submission_status,
          bs.created_at as submission_created_at,
          bs.actual_price,
          bs.original_price,
          bs.heard_about,
          bs.utm,
          bs.landing_url,
          bs.referrer,
          c.pipeline_stage_id,
          NULL as pipeline_stage,
          NULL as pipeline_name,
          NULL as stage_order,
          NULL as stage_active
        FROM clients c
        LEFT JOIN booking_submissions bs ON c.client_id = bs.tc_client_id::text
        WHERE c.status = 'prospect'
        ORDER BY c.created_at DESC
      `;
    }
    
    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM clients c WHERE c.status = 'prospect'`;
    const countResult = await this.pool.query(countQuery);
    const total = parseInt(countResult.rows[0].total);
    
    // Apply pagination
    const paginatedQuery = `${baseQuery} LIMIT ${limit} OFFSET ${offset}`;
    const { rows } = await this.pool.query(paginatedQuery);
    
    return {
      clients: rows,
      total,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get pipeline stages
   */
  async getPipelineStages() {
    const pipelineStagesExist = await tableExists(this.pool, 'pipeline_stages');

    if (!pipelineStagesExist) {
      return [];
    }
    
    const { rows } = await this.pool.query(`
      SELECT id, name, pipeline, order_index, active 
      FROM pipeline_stages 
      WHERE active = true 
      ORDER BY pipeline, order_index
    `);
    
    return rows;
  }

  /**
   * Update client pipeline stage
   */
  async updatePipelineStage(clientId, pipelineStageId) {
    const hasPipelineCol = await columnExists(this.pool, 'clients', 'pipeline_stage_id');

    if (!hasPipelineCol) {
      logger.warn('⚠️ pipeline_stage_id column missing; skipping pipeline stage update');
      const { rows } = await this.pool.query(
        'SELECT * FROM clients WHERE id = $1',
        [clientId]
      );
      if (rows.length === 0) {
        throw new Error('Client not found');
      }
      return rows[0];
    }

    // Get the pipeline stage name to check if it's Won or Lost
    const stageResult = await this.pool.query(
      'SELECT name FROM pipeline_stages WHERE id = $1',
      [pipelineStageId]
    );
    
    const stageName = stageResult.rows[0]?.name?.toLowerCase() || '';
    const isWonOrLost = stageName === 'won' || stageName === 'lost';
    
    // Check if archived_at column exists (cached)
    const hasArchivedColumn = await columnExists(this.pool, 'clients', 'archived_at');

    const candidates = [];

    const numericId = Number(clientId);
    if (!Number.isNaN(numericId)) {
      if (hasArchivedColumn && isWonOrLost) {
        candidates.push({
          query: 'UPDATE clients SET pipeline_stage_id = $1, status = $2, archived_at = NOW(), updated_at = NOW() WHERE id = $3 RETURNING *',
          values: [pipelineStageId, 'archived', numericId],
        });
      } else {
      candidates.push({
        query: 'UPDATE clients SET pipeline_stage_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        values: [pipelineStageId, numericId],
      });
      }
    }

    // Fallback to matching TutorCruncher client_id if primary key lookup fails
    if (hasArchivedColumn && isWonOrLost) {
      candidates.push({
        query: `
          UPDATE clients
          SET pipeline_stage_id = $1, status = $2, archived_at = NOW(), updated_at = NOW()
          WHERE client_id::text = $3
          RETURNING *
        `,
        values: [pipelineStageId, 'archived', String(clientId)],
      });
    } else {
    candidates.push({
      query: `
        UPDATE clients
        SET pipeline_stage_id = $1, updated_at = NOW()
        WHERE client_id::text = $2
        RETURNING *
      `,
      values: [pipelineStageId, String(clientId)],
    });
    }

    let updatedClient = null;
    for (const candidate of candidates) {
      const { rows } = await this.pool.query(candidate.query, candidate.values);
      if (rows.length > 0) {
        updatedClient = rows[0];
        break;
      }
    }

    if (!updatedClient) {
    throw new Error('Client not found');
    }

    // Sync pipeline stage to TutorCruncher
    try {
      const tutorCruncherSync = require('../utils/tutorCruncherSync');
      // Use client_id (TutorCruncher ID) from the updated client record
      const tcClientId = updatedClient.client_id;
      if (tcClientId) {
        await tutorCruncherSync.syncPipelineStageToTutorCruncher(updatedClient.id, pipelineStageId, this.pool);
        logger.info(`✅ Synced pipeline stage ${pipelineStageId} to TutorCruncher for client ${tcClientId}`);
      }
    } catch (syncError) {
      // Log error but don't fail the update - the local database update succeeded
      logger.error({ error: syncError.message }, '⚠️ Failed to sync pipeline stage to TutorCruncher (local update succeeded):');
    }

    // If Lost, add to Klaviyo resurrection flow
    if (stageName === 'lost' && updatedClient.email) {
      try {
        const axios = require('axios');
        const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
        const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
        
        if (KLAVIYO_API_KEY) {
          // Check if profile exists
          const profileResponse = await axios.get(
            `${KLAVIYO_API_BASE}/profiles/`,
            {
              params: {
                'filter': `equals(email,"${updatedClient.email}")`
              },
              headers: {
                'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                'revision': '2024-10-15',
                'Content-Type': 'application/json'
              }
            }
          );

          const profileId = profileResponse.data?.data?.[0]?.id;
          
          if (profileId) {
            // Trigger event to add to resurrection flow
            await axios.post(
              `${KLAVIYO_API_BASE}/events/`,
              {
                data: {
                  type: 'event',
                  attributes: {
                    metric: {
                      data: {
                        type: 'metric',
                        attributes: {
                          name: 'Lost Client'
                        }
                      }
                    },
                    profile: {
                      data: {
                        type: 'profile',
                        id: profileId
                      }
                    },
                    properties: {
                      pipeline_stage: 'Lost',
                      archived_at: new Date().toISOString()
                    }
                  }
                }
              },
              {
                headers: {
                  'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
                  'revision': '2024-10-15',
                  'Content-Type': 'application/json'
                }
              }
            );
            logger.info(`✅ Added client ${updatedClient.email} to Klaviyo resurrection flow`);
          }
        }
      } catch (klaviyoError) {
        logger.error({ error: klaviyoError.message }, 'Error adding client to Klaviyo resurrection flow:');
        // Don't fail the update if Klaviyo fails
      }
    }

    if (isWonOrLost) {
      logger.info(`✅ Client ${clientId} moved to ${stageName} stage and archived`);
    }
    
    return updatedClient;
  }

  /**
   * Delete a prospect from the local conversion tracker (keeps TutorCruncher intact)
   */
  async deleteProspect(clientId) {
    await this.pool.query('BEGIN');

    try {
      const { rows } = await this.pool.query(
        `SELECT id, client_id, first_name, last_name, email
         FROM clients
         WHERE id = $1`,
        [clientId]
      );

      if (rows.length === 0) {
        throw new Error('Client not found');
      }

      await this.pool.query('DELETE FROM clients WHERE id = $1', [clientId]);

      await this.pool.query('COMMIT');
      return rows[0];
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Add note to client
   */
  async addNote(clientId, note, createdBy) {
    const { rows } = await this.pool.query(
      'INSERT INTO client_notes (client_id, note, created_by, created_at) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [clientId, note, createdBy]
    );
    
    return rows[0];
  }

  /**
   * Get client notes
   */
  async getNotes(clientId) {
    const { rows } = await this.pool.query(
      'SELECT * FROM client_notes WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    
    return rows;
  }

  /**
   * Update client status
   */
  async updateStatus(clientId, status) {
    if (!['prospect', 'live', 'dormant'].includes(status)) {
      throw new Error('Invalid status. Must be prospect, live, or dormant');
    }
    
    const { rows } = await this.pool.query(
      'UPDATE clients SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, clientId]
    );
    
    if (rows.length === 0) {
      throw new Error('Client not found');
    }
    
    return rows[0];
  }

  /**
   * Update prospect status with logging to client_conversion_events
   */
  async updateProspectStatus(clientId, newStatus, changedBy = 'system', automationTrigger = null, changeReason = null) {
    // Valid prospect statuses
    const validStatuses = [
      'Need To Contact',
      'Waiting for Response',
      'Building',
      'Waiting to Pair',
      'Waiting for Trial',
      'Trial Follow-Up',
      'Won',
      'Lost'
    ];

    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid prospect status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Check if prospect_status column exists (cached)
    const hasProspectStatus = await columnExists(this.pool, 'clients', 'prospect_status');

    if (!hasProspectStatus) {
      throw new Error('prospect_status column does not exist. Please run migration first.');
    }

    // Get current prospect status
    const clientResult = await this.pool.query(
      'SELECT id, prospect_status FROM clients WHERE id = $1',
      [clientId]
    );

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const currentStatus = clientResult.rows[0].prospect_status;

    // Don't update if status hasn't changed
    if (currentStatus === newStatus) {
      return clientResult.rows[0];
    }

    // Update prospect status (and promote to live when Won)
    let updateQuery, updateParams;
    if (newStatus === 'Won') {
      updateQuery = `UPDATE clients SET prospect_status = $1, status = 'live', archived_at = COALESCE(archived_at, NOW()), updated_at = NOW() WHERE id = $2 RETURNING *`;
      updateParams = [newStatus, clientId];
    } else if (newStatus === 'Lost') {
      updateQuery = `UPDATE clients SET prospect_status = $1, status = 'dormant', archived_at = COALESCE(archived_at, NOW()), updated_at = NOW() WHERE id = $2 RETURNING *`;
      updateParams = [newStatus, clientId];
    } else {
      updateQuery = 'UPDATE clients SET prospect_status = $1, updated_at = NOW() WHERE id = $2 RETURNING *';
      updateParams = [newStatus, clientId];
    }
    const updateResult = await this.pool.query(updateQuery, updateParams);

    // Sync status to TutorCruncher for Won/Lost transitions
    let tcSyncStatus = 'skipped';
    let tcSyncError = null;
    if (newStatus === 'Won' || newStatus === 'Lost') {
      const tutorCruncherAPI = global.tutorCruncherAPI;
      if (tutorCruncherAPI) {
        // Get TC client_id for the API call
        const tcResult = await this.pool.query('SELECT client_id FROM clients WHERE id = $1', [clientId]);
        const tcClientId = tcResult.rows[0]?.client_id;
        if (tcClientId) {
          const tcStatus = newStatus === 'Won' ? 'live' : 'dormant';
          try {
            await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, { status: tcStatus });
            tcSyncStatus = 'success';
            logger.info({ tcClientId, tcStatus }, `TC sync: updated client to ${tcStatus}`);
          } catch (tcError) {
            tcSyncStatus = 'failed';
            tcSyncError = tcError.message;
            logger.error({ error: tcError.message, tcClientId }, 'TC sync failed in updateProspectStatus');
          }
        }
      }
    }

    // Log status change to client_conversion_events
    try {
      const hasToProspectStatus = await columnExists(this.pool, 'client_conversion_events', 'to_prospect_status');

      if (hasToProspectStatus) {
        const toStatus = newStatus === 'Won' ? 'live' : newStatus === 'Lost' ? 'dormant' : 'prospect';
        await this.pool.query(`
          INSERT INTO client_conversion_events (
            client_id,
            from_stage_id,
            to_stage_id,
            from_status,
            to_status,
            from_prospect_status,
            to_prospect_status,
            changed_by,
            change_reason,
            automation_trigger,
            tc_sync_status,
            tc_sync_error,
            created_at
          ) VALUES ($1, NULL, NULL, 'prospect', $8, $2, $3, $4, $5, $6, $7, $9, NOW())
        `, [
          clientId,
          currentStatus,
          newStatus,
          changedBy,
          changeReason,
          automationTrigger,
          tcSyncStatus,
          toStatus,
          tcSyncError
        ]);
      }
    } catch (logError) {
      logger.error({ error: logError.message }, 'Error logging prospect status change:');
    }

    return updateResult.rows[0];
  }

  /**
   * Check and apply prospect status automations based on date fields
   * Returns the new status if automation should be applied, null otherwise
   */
  async checkProspectStatusAutomation(clientId) {
    // Get client data
    const clientResult = await this.pool.query(`
      SELECT 
        id, 
        prospect_status,
        date_tutor_client_paired,
        date_tutor_client_paired_scheduled,
        date_trial_first_lesson,
        first_paid_lesson_completed
      FROM clients 
      WHERE id = $1
    `, [clientId]);

    if (clientResult.rows.length === 0) {
      return null;
    }

    const client = clientResult.rows[0];
    const currentStatus = client.prospect_status;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Automation A: Waiting to Pair - when "Date Offered to Tutors" (date_tutor_client_paired) is filled
    if (client.date_tutor_client_paired && currentStatus !== 'Waiting to Pair' && currentStatus !== 'Waiting for Trial' && currentStatus !== 'Trial Follow-Up' && currentStatus !== 'Won' && currentStatus !== 'Lost') {
      return 'Waiting to Pair';
    }

    // Automation B: Waiting for Trial - when "Date Tutor and Client Paired" (date_tutor_client_paired_scheduled) is filled
    if (client.date_tutor_client_paired_scheduled && currentStatus !== 'Waiting for Trial' && currentStatus !== 'Trial Follow-Up' && currentStatus !== 'Won' && currentStatus !== 'Lost') {
      return 'Waiting for Trial';
    }

    // Automation C & D: Dynamic status update based on trial date
    // - If date is in past → "Trial Follow-Up"
    // - If date is in future → "Waiting for Trial"
    // - Works both ways: can revert from "Trial Follow-Up" to "Waiting for Trial" if date moved to future
    if (client.date_trial_first_lesson && currentStatus !== 'Won' && currentStatus !== 'Lost') {
      const trialDate = new Date(client.date_trial_first_lesson);
      trialDate.setHours(0, 0, 0, 0);
      
      if (now > trialDate) {
        // Date has passed → "Trial Follow-Up"
        if (currentStatus !== 'Trial Follow-Up') {
          return 'Trial Follow-Up';
        }
      } else {
        // Date is in future → "Waiting for Trial"
        if (currentStatus !== 'Waiting for Trial') {
          return 'Waiting for Trial';
        }
      }
    }

    // Automation: Won - when first paid lesson is completed
    if (client.first_paid_lesson_completed && currentStatus !== 'Won' && currentStatus !== 'Lost') {
      return 'Won';
    }

    return null; // No automation needed
  }

  /**
   * Check for 14-day timeout automation (mark as Lost if no progress after booking form)
   * Should be called by scheduled job
   * 
   * Logic:
   * - If booking form completed (date_registration_complete exists)
   * - And 14 days have passed since booking form completion
   * - And no progress has been made (no date_tutor_client_paired, no date_tutor_client_paired_scheduled,
   *   no date_trial_first_lesson, no status updates)
   * - Mark as Lost and archive
   */
  async check14DayTimeoutAutomation() {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    // Find clients who:
    // 1. Completed booking form (date_registration_complete exists)
    // 2. Booking form was completed 14+ days ago
    // 3. Are still prospects (not archived)
    // 4. Have NOT made progress (no date_tutor_client_paired, no date_tutor_client_paired_scheduled, no date_trial_first_lesson)
    // 5. Have NOT been updated in the last 14 days (no status changes or date updates)
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.prospect_status,
        c.pipeline_stage_id,
        c.date_registration_complete,
        c.date_tutor_client_paired,
        c.date_tutor_client_paired_scheduled,
        c.date_trial_first_lesson,
        c.updated_at,
        COALESCE(
          (SELECT MAX(created_at)
           FROM client_conversion_events
           WHERE client_id = c.id),
          c.created_at
        ) as last_activity
      FROM clients c
      WHERE c.date_registration_complete IS NOT NULL
      AND c.date_registration_complete <= $1
      AND c.status = 'prospect'
      AND c.prospect_status != 'Won'
      AND c.prospect_status != 'Lost'
      AND c.archived_at IS NULL
      -- No progress made: all progress dates are NULL
      AND c.date_tutor_client_paired IS NULL
      AND c.date_tutor_client_paired_scheduled IS NULL
      AND c.date_trial_first_lesson IS NULL
      -- No activity in last 14 days (check both updated_at and last event)
      AND COALESCE(
        (SELECT MAX(created_at)
         FROM client_conversion_events
         WHERE client_id = c.id),
        c.updated_at,
        c.created_at
      ) <= $1
    `, [fourteenDaysAgo]);

    const updated = [];
    for (const row of result.rows) {
      try {
        // Store previous stage for restore
        await this.storePreviousStage(row.id);

        // Update prospect status to Lost
        await this.updateProspectStatus(
          row.id,
          'Lost',
          'system',
          '14_day_timeout',
          'Automatically marked as Lost after 14 days of inactivity following booking form completion'
        );

        // Archive the client (move to Lost tab)
        await this.pool.query(
          `UPDATE clients
           SET archived_at = NOW(), status = 'dormant', updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        updated.push({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          previousStatus: row.prospect_status,
          previousStageId: row.pipeline_stage_id
        });

        logger.info(`✅ Marked client ${row.id} as Lost after 14 days of inactivity`);
      } catch (error) {
        logger.error({ error: error.message }, `Error updating client ${row.id} to Lost:`);
      }
    }

    return { count: updated.length, clients: updated, trigger: '14_day_timeout' };
  }

  /**
   * Store previous pipeline stage and status before moving to Won/Lost
   * This enables the restore functionality
   */
  async storePreviousStage(clientId) {
    try {
      const result = await this.pool.query(`
        UPDATE clients
        SET
          previous_pipeline_stage_id = pipeline_stage_id,
          previous_prospect_status = prospect_status
        WHERE id = $1
        RETURNING id, previous_pipeline_stage_id, previous_prospect_status
      `, [clientId]);

      if (result.rows.length > 0) {
        logger.info(`[CCT] Stored previous stage for client ${clientId}: stage=${result.rows[0].previous_pipeline_stage_id}, status=${result.rows[0].previous_prospect_status}`);
      }

      return result.rows[0];
    } catch (error) {
      logger.error({ error: error.message }, `Error storing previous stage for client ${clientId}:`);
      // Don't fail the parent operation
      return null;
    }
  }

  /**
   * Check for 30-day Building timeout automation
   * Marks prospects as Lost if they've been in "Building" status for 30+ days
   */
  async check30DayBuildingTimeoutAutomation() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Find clients who:
    // 1. Are in "Building" status
    // 2. Have been in Building for 30+ days (check updated_at or last event)
    // 3. Are still prospects (not archived)
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.prospect_status,
        c.pipeline_stage_id,
        c.updated_at,
        COALESCE(
          (SELECT MAX(created_at)
           FROM client_conversion_events
           WHERE client_id = c.id),
          c.updated_at,
          c.created_at
        ) as last_activity
      FROM clients c
      WHERE c.prospect_status = 'Building'
      AND c.status = 'prospect'
      AND c.archived_at IS NULL
      -- Last activity was 30+ days ago
      AND COALESCE(
        (SELECT MAX(created_at)
         FROM client_conversion_events
         WHERE client_id = c.id),
        c.updated_at,
        c.created_at
      ) <= $1
    `, [thirtyDaysAgo]);

    const updated = [];
    for (const row of result.rows) {
      try {
        // Store previous stage for restore
        await this.storePreviousStage(row.id);

        // Update prospect status to Lost
        await this.updateProspectStatus(
          row.id,
          'Lost',
          'system',
          '30_day_building_timeout',
          'Automatically marked as Lost after 30 days in Building status'
        );

        // Archive the client
        await this.pool.query(
          `UPDATE clients
           SET archived_at = NOW(), status = 'dormant', updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        updated.push({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          previousStatus: row.prospect_status,
          previousStageId: row.pipeline_stage_id
        });

        logger.info(`✅ Marked client ${row.id} as Lost after 30 days in Building`);
      } catch (error) {
        logger.error({ error: error.message }, `Error updating client ${row.id} to Lost:`);
      }
    }

    return { count: updated.length, clients: updated, trigger: '30_day_building_timeout' };
  }

  /**
   * Check for 30-day post-trial timeout automation
   * Marks prospects as Lost if 30+ days have passed since trial with no conversion
   */
  async check30DayPostTrialTimeoutAutomation() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    // Find clients who:
    // 1. Had a trial (date_trial_first_lesson is not null)
    // 2. Trial was 30+ days ago
    // 3. Haven't converted (first_paid_lesson_completed is false)
    // 4. Are in "Trial Follow-Up" status
    // 5. Are still prospects (not archived)
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.prospect_status,
        c.pipeline_stage_id,
        c.date_trial_first_lesson
      FROM clients c
      WHERE c.date_trial_first_lesson IS NOT NULL
      AND c.date_trial_first_lesson <= $1
      AND c.prospect_status = 'Trial Follow-Up'
      AND (c.first_paid_lesson_completed IS NULL OR c.first_paid_lesson_completed = false)
      AND c.status = 'prospect'
      AND c.archived_at IS NULL
    `, [thirtyDaysAgo]);

    const updated = [];
    for (const row of result.rows) {
      try {
        // Store previous stage for restore
        await this.storePreviousStage(row.id);

        // Update prospect status to Lost
        await this.updateProspectStatus(
          row.id,
          'Lost',
          'system',
          '30_day_trial_timeout',
          'Automatically marked as Lost after 30 days post-trial with no conversion'
        );

        // Archive the client
        await this.pool.query(
          `UPDATE clients
           SET archived_at = NOW(), status = 'dormant', updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        updated.push({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          previousStatus: row.prospect_status,
          previousStageId: row.pipeline_stage_id,
          trialDate: row.date_trial_first_lesson
        });

        logger.info(`✅ Marked client ${row.id} as Lost after 30 days post-trial`);
      } catch (error) {
        logger.error({ error: error.message }, `Error updating client ${row.id} to Lost:`);
      }
    }

    return { count: updated.length, clients: updated, trigger: '30_day_trial_timeout' };
  }

  /**
   * Check for auto-Won automation
   * Marks prospects as Won when first paid lesson is completed
   */
  async checkAutoWonAutomation() {
    // Find clients who:
    // 1. Have first_paid_lesson_completed = true
    // 2. Are NOT already Won or Lost
    // 3. Are still prospects
    const result = await this.pool.query(`
      SELECT
        c.id,
        c.first_name,
        c.last_name,
        c.email,
        c.prospect_status,
        c.pipeline_stage_id
      FROM clients c
      WHERE c.first_paid_lesson_completed = true
      AND c.prospect_status NOT IN ('Won', 'Lost')
      AND c.status = 'prospect'
      AND c.archived_at IS NULL
    `);

    const updated = [];
    for (const row of result.rows) {
      try {
        // Store previous stage for restore (even though Won is positive, allow restore)
        await this.storePreviousStage(row.id);

        // Update prospect status to Won
        await this.updateProspectStatus(
          row.id,
          'Won',
          'system',
          'first_paid_lesson',
          'Automatically marked as Won after completing first paid lesson'
        );

        // Update client status to live (Won clients become "live" clients)
        await this.pool.query(
          `UPDATE clients
           SET archived_at = NOW(), status = 'live', updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );

        updated.push({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          email: row.email,
          previousStatus: row.prospect_status,
          previousStageId: row.pipeline_stage_id
        });

        logger.info(`✅ Marked client ${row.id} as Won after first paid lesson`);
      } catch (error) {
        logger.error({ error: error.message }, `Error updating client ${row.id} to Won:`);
      }
    }

    return { count: updated.length, clients: updated, trigger: 'first_paid_lesson' };
  }

  /**
   * Run all CCT automations and return results
   * Called by scheduled job and on page load
   */
  async runAllAutomations() {
    const results = {
      fourteenDayTimeout: null,
      thirtyDayBuilding: null,
      thirtyDayTrial: null,
      autoWon: null,
      totalProcessed: 0
    };

    try {
      // Run 14-day timeout
      results.fourteenDayTimeout = await this.check14DayTimeoutAutomation();
      results.totalProcessed += results.fourteenDayTimeout.count;

      // Run 30-day Building timeout
      results.thirtyDayBuilding = await this.check30DayBuildingTimeoutAutomation();
      results.totalProcessed += results.thirtyDayBuilding.count;

      // Run 30-day post-trial timeout
      results.thirtyDayTrial = await this.check30DayPostTrialTimeoutAutomation();
      results.totalProcessed += results.thirtyDayTrial.count;

      // Run auto-Won
      results.autoWon = await this.checkAutoWonAutomation();
      results.totalProcessed += results.autoWon.count;

      // Only log when something was processed
      if (results.totalProcessed > 0) {
        logger.info(`[CCT Automation] Processed ${results.totalProcessed} clients`);
      }
    } catch (error) {
      logger.error({ error: error.message }, '[CCT Automation] Error running automations:');
    }

    return results;
  }
}

module.exports = ClientConversionService;
