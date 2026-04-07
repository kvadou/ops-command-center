// Utility functions for bidirectional sync with TutorCruncher
const tutorCruncherSync = {
  
  // Sync client data to TutorCruncher
  async syncClientToTutorCruncher(clientId, updates, pool) {
    try {
      const axios = require('axios');
      const tutorCruncherAPI = axios.create({
        baseURL: 'https://secure.tutorcruncher.com/api',
        headers: {
          Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
        },
      });

      // Get client data to find TutorCruncher client ID
      const { rows: clientData } = await pool.query(`
        SELECT client_id, first_name, last_name, email, mobile, phone, 
               street, state, town, country, postcode, timezone, status
        FROM clients WHERE id = $1
      `, [clientId]);

      if (clientData.length === 0) {
        throw new Error('Client not found');
      }

      const tcClientId = clientData[0].client_id;
      const client = clientData[0];

      // Map our updates to TutorCruncher format
      const tcUpdates = {};
      
      if (updates.status) {
        tcUpdates.status = updates.status;
      }
      
      if (updates.first_name) {
        tcUpdates.first_name = updates.first_name;
      }
      
      if (updates.last_name) {
        tcUpdates.last_name = updates.last_name;
      }
      
      if (updates.email) {
        tcUpdates.email = updates.email;
      }
      
      if (updates.mobile) {
        tcUpdates.mobile = updates.mobile;
      }
      
      if (updates.phone) {
        tcUpdates.phone = updates.phone;
      }
      
      if (updates.street) {
        tcUpdates.street = updates.street;
      }
      
      if (updates.state) {
        tcUpdates.state = updates.state;
      }
      
      if (updates.town) {
        tcUpdates.town = updates.town;
      }
      
      if (updates.country) {
        tcUpdates.country = updates.country;
      }
      
      if (updates.postcode) {
        tcUpdates.postcode = updates.postcode;
      }
      
      if (updates.timezone) {
        tcUpdates.timezone = updates.timezone;
      }

      // Only sync if there are actual updates
      if (Object.keys(tcUpdates).length > 0) {
        await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, tcUpdates);
        logger.info(`✅ Synced client data to TutorCruncher for client ${tcClientId}`);
      }

      return true;
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to sync client to TutorCruncher:');
      throw error;
    }
  },

  // Sync pipeline stage to TutorCruncher
  async syncPipelineStageToTutorCruncher(clientId, pipelineStageId, pool) {
    try {
      const axios = require('axios');
      const tutorCruncherAPI = axios.create({
        baseURL: 'https://secure.tutorcruncher.com/api',
        headers: {
          Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
        },
      });

      // Get client data to find TutorCruncher client ID
      const { rows: clientData } = await pool.query(`
        SELECT client_id FROM clients WHERE id = $1
      `, [clientId]);

      if (clientData.length === 0) {
        throw new Error('Client not found');
      }

      const tcClientId = clientData[0].client_id;
      
      // Update pipeline stage in TutorCruncher
      await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, {
        pipeline_stage: pipelineStageId
      });

      logger.info(`✅ Synced pipeline stage to TutorCruncher for client ${tcClientId}`);
      return true;
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to sync pipeline stage to TutorCruncher:');
      throw error;
    }
  },

  // Sync client status to TutorCruncher
  async syncClientStatusToTutorCruncher(clientId, status, pool) {
    try {
      const axios = require('axios');
const { logger } = require('./logger');
      const tutorCruncherAPI = axios.create({
        baseURL: 'https://secure.tutorcruncher.com/api',
        headers: {
          Authorization: `token ${process.env.TUTORCRUNCHER_API_TOKEN}`,
        },
      });

      // Get client data to find TutorCruncher client ID
      const { rows: clientData } = await pool.query(`
        SELECT client_id FROM clients WHERE id = $1
      `, [clientId]);

      if (clientData.length === 0) {
        throw new Error('Client not found');
      }

      const tcClientId = clientData[0].client_id;
      
      // Update status in TutorCruncher
      await tutorCruncherAPI.patch(`/clients/${tcClientId}/`, {
        status: status
      });

      logger.info(`✅ Synced client status to TutorCruncher for client ${tcClientId}`);
      return true;
    } catch (error) {
      logger.error({ error: error.message }, '❌ Failed to sync client status to TutorCruncher:');
      throw error;
    }
  }
};

module.exports = tutorCruncherSync;
