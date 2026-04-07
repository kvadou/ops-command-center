/**
 * Missive Sync Service
 *
 * Polls the Missive API to fetch conversations and messages,
 * capturing both incoming AND outgoing emails that webhooks miss.
 */

const axios = require('axios');
const pool = require('../deps').pool;
const { logger } = require('../utils/logger');

const MISSIVE_API_BASE = process.env.MISSIVE_API_BASE || 'https://public.missiveapp.com/v1';
const MISSIVE_API_KEY = process.env.MISSIVE_API_KEY;

// Internal domains to exclude when finding client emails
const INTERNAL_DOMAINS = ['acmeops.com', 'chessat3.com'];

class MissiveSyncService {
  constructor() {
    this.stubMode = !MISSIVE_API_KEY;
    if (!this.stubMode) {
      this.api = axios.create({
        baseURL: MISSIVE_API_BASE,
        headers: {
          'Authorization': `Bearer ${MISSIVE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
    }
  }

  /**
   * Check if Missive API is configured
   */
  isConfigured() {
    return !!MISSIVE_API_KEY;
  }

  /**
   * Fetch recent conversations from Missive
   * @param {Object} options - Filter options
   * @param {number} options.limit - Max conversations to fetch (1-50)
   * @param {string} options.organization - Organization ID to filter by
   * @param {string} options.team - Team ID to filter by
   * @param {number} options.since - Unix timestamp to fetch conversations after
   */
  async fetchConversations(options = {}) {
    if (this.stubMode) {
      return [
        { id: 'conv-001', subject: 'Schedule change request', organization: { id: 'org-1', name: 'Acme Operations' }, team: { id: 'team-1', name: 'Support' } },
        { id: 'conv-002', subject: 'New enrollment inquiry', organization: { id: 'org-1', name: 'Acme Operations' }, team: { id: 'team-1', name: 'Support' } },
        { id: 'conv-003', subject: 'Invoice question', organization: { id: 'org-1', name: 'Acme Operations' }, team: { id: 'team-2', name: 'Billing' } },
      ];
    }
    if (!this.isConfigured()) {
      throw new Error('Missive API not configured');
    }

    const params = {
      limit: options.limit || 50,
      all: true // Fetch from all mailboxes
    };

    if (options.organization) {
      params.organization = options.organization;
    }

    if (options.team) {
      params.team = options.team;
    }

    try {
      const response = await this.api.get('/conversations', { params });
      return response.data.conversations || [];
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error fetching Missive conversations:');
      throw error;
    }
  }

  /**
   * Fetch messages for a specific conversation
   * @param {string} conversationId - Missive conversation ID
   * @param {number} limit - Max messages to fetch (1-10)
   */
  async fetchConversationMessages(conversationId, limit = 10) {
    if (this.stubMode) {
      return [
        { id: 'msg-001', subject: 'Re: Schedule change', preview: 'Thanks for reaching out. We can adjust the schedule...', from_field: { name: 'Sarah Chen', address: 'sarah.chen@example.com' }, to_fields: [{ address: 'support@acmeops.com' }], delivered_at: Math.floor(Date.now() / 1000) - 3600, created_at: Math.floor(Date.now() / 1000) - 3600 },
        { id: 'msg-002', subject: 'Re: Schedule change', preview: 'That works great, thank you!', from_field: { name: 'Support Team', address: 'support@acmeops.com' }, to_fields: [{ address: 'sarah.chen@example.com' }], delivered_at: Math.floor(Date.now() / 1000) - 1800, created_at: Math.floor(Date.now() / 1000) - 1800 },
      ];
    }
    if (!this.isConfigured()) {
      throw new Error('Missive API not configured');
    }

    try {
      const response = await this.api.get(`/conversations/${conversationId}/messages`, {
        params: { limit }
      });
      return response.data.messages || [];
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, `Error fetching messages for conversation ${conversationId}:`);
      throw error;
    }
  }

  /**
   * Extract email address from a Missive address object
   */
  extractEmail(addressObj) {
    if (!addressObj) return null;
    if (typeof addressObj === 'string') return addressObj;
    return addressObj.address || addressObj.email || null;
  }

  /**
   * Determine if an email is from an internal domain
   */
  isInternalEmail(email) {
    if (!email) return false;
    return INTERNAL_DOMAINS.some(domain => email.toLowerCase().endsWith(domain));
  }

  /**
   * Find external client email from message participants
   */
  findClientEmail(fromAddress, toAddresses = []) {
    const allEmails = [fromAddress, ...toAddresses].filter(Boolean);

    // Return first non-internal email
    for (const email of allEmails) {
      if (!this.isInternalEmail(email)) {
        return email.toLowerCase();
      }
    }
    return null;
  }

  /**
   * Determine message direction based on from address
   */
  getMessageDirection(fromAddress) {
    if (!fromAddress) return 'unknown';
    return this.isInternalEmail(fromAddress) ? 'outgoing' : 'incoming';
  }

  /**
   * Store a message in the database
   * @param {Object} conversation - Missive conversation object
   * @param {Object} message - Missive message object
   */
  async storeMessage(conversation, message) {
    const fromField = message.from_field || {};
    const toFields = message.to_fields || [];
    const ccFields = message.cc_fields || [];

    const fromAddress = this.extractEmail(fromField);
    const fromName = fromField.name || null;
    const toAddresses = toFields.map(f => this.extractEmail(f)).filter(Boolean);
    const ccAddresses = ccFields.map(f => this.extractEmail(f)).filter(Boolean);

    const clientEmail = this.findClientEmail(fromAddress, toAddresses);
    const direction = this.getMessageDirection(fromAddress);

    // Determine rule_type based on direction
    const ruleType = direction === 'outgoing' ? 'outgoing_email' : 'incoming_email';

    const messageDeliveredAt = message.delivered_at ? new Date(message.delivered_at * 1000) : null;
    const messageCreatedAt = message.created_at ? new Date(message.created_at * 1000) : null;
    const messageUpdatedAt = message.updated_at ? new Date(message.updated_at * 1000) : null;

    try {
      // Check if message already exists
      const existing = await pool.query(
        'SELECT id FROM missive_communications WHERE missive_message_id = $1',
        [message.id]
      );

      if (existing.rows.length > 0) {
        // Already exists, skip
        return { id: existing.rows[0].id, inserted: false, direction, skipped: true };
      }

      // Insert new message
      const result = await pool.query(`
        INSERT INTO missive_communications (
          missive_conversation_id,
          missive_message_id,
          rule_type,
          conversation_subject,
          conversation_organization_id,
          conversation_organization_name,
          conversation_team_id,
          conversation_team_name,
          message_subject,
          message_preview,
          message_type,
          from_name,
          from_address,
          to_addresses,
          cc_addresses,
          message_delivered_at,
          message_created_at,
          message_updated_at,
          email_message_id,
          client_email,
          sync_source,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
        RETURNING id
      `, [
        conversation.id,
        message.id,
        ruleType,
        conversation.subject || null,
        conversation.organization?.id || null,
        conversation.organization?.name || null,
        conversation.team?.id || null,
        conversation.team?.name || null,
        message.subject || null,
        message.preview || null,
        'email',
        fromName,
        fromAddress,
        toAddresses.length > 0 ? toAddresses : null,
        ccAddresses.length > 0 ? ccAddresses : null,
        messageDeliveredAt,
        messageCreatedAt,
        messageUpdatedAt,
        message.email_message_id || null,
        clientEmail,
        'api_poll'
      ]);

      return {
        id: result.rows[0]?.id,
        inserted: true,
        direction
      };
    } catch (error) {
      // Handle any unexpected errors
      logger.error({ error: error.message }, `  Error storing message ${message.id}:`);
      throw error;
    }
  }

  /**
   * Sync recent conversations and messages from Missive
   * @param {Object} options - Sync options
   * @param {number} options.conversationLimit - Max conversations to fetch
   * @param {number} options.messageLimit - Max messages per conversation
   * @param {boolean} options.verbose - Log detailed progress
   */
  async syncRecentMessages(options = {}) {
    const {
      conversationLimit = 50,
      messageLimit = 10,
      verbose = false
    } = options;

    if (this.stubMode) {
      logger.info('[STUB] Missive sync — returning mock stats');
      return { conversationsFetched: 3, messagesFetched: 6, messagesInserted: 0, messagesUpdated: 0, messagesSkipped: 6, outgoingCount: 3, incomingCount: 3, errors: [] };
    }

    if (!this.isConfigured()) {
      return { error: 'Missive API not configured', synced: 0 };
    }

    const stats = {
      conversationsFetched: 0,
      messagesFetched: 0,
      messagesInserted: 0,
      messagesUpdated: 0,
      messagesSkipped: 0,
      outgoingCount: 0,
      incomingCount: 0,
      errors: []
    };

    try {
      logger.info(`🔄 Starting Missive sync (limit: ${conversationLimit} conversations)...`);

      // Fetch recent conversations
      const conversations = await this.fetchConversations({ limit: conversationLimit });
      stats.conversationsFetched = conversations.length;

      if (verbose) {
        logger.info(`  Found ${conversations.length} conversations`);
      }

      // Process each conversation
      for (const conversation of conversations) {
        try {
          // Fetch messages for this conversation
          const messages = await this.fetchConversationMessages(conversation.id, messageLimit);
          stats.messagesFetched += messages.length;

          if (verbose) {
            logger.info(`  Conversation "${conversation.subject || 'No subject'}": ${messages.length} messages`);
          }

          // Store each message
          for (const message of messages) {
            try {
              const result = await this.storeMessage(conversation, message);

              if (result.skipped) {
                stats.messagesSkipped++;
              } else if (result.inserted) {
                stats.messagesInserted++;
                if (result.direction === 'outgoing') {
                  stats.outgoingCount++;
                } else {
                  stats.incomingCount++;
                }
              } else {
                stats.messagesUpdated++;
              }
            } catch (msgError) {
              stats.errors.push({
                conversationId: conversation.id,
                messageId: message.id,
                error: msgError.message
              });
            }
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (convError) {
          stats.errors.push({
            conversationId: conversation.id,
            error: convError.message
          });
        }
      }

      logger.info(`✅ Missive sync complete:`);
      logger.info(`   Conversations: ${stats.conversationsFetched}`);
      logger.info(`   Messages fetched: ${stats.messagesFetched}`);
      logger.info(`   New messages: ${stats.messagesInserted} (${stats.outgoingCount} outgoing, ${stats.incomingCount} incoming)`);
      logger.info(`   Updated: ${stats.messagesUpdated}`);
      logger.info(`   Skipped (duplicates): ${stats.messagesSkipped}`);
      if (stats.errors.length > 0) {
        logger.info(`   Errors: ${stats.errors.length}`);
      }

      return stats;

    } catch (error) {
      logger.error({ error: error.message }, '❌ Missive sync failed:');
      stats.errors.push({ error: error.message });
      return stats;
    }
  }

  /**
   * Sync messages for a specific email address
   * Useful for syncing communications for a specific client
   * @param {string} email - Email address to search for
   */
  async syncByEmail(email) {
    if (!this.isConfigured()) {
      return { error: 'Missive API not configured', synced: 0 };
    }

    // Note: Missive API doesn't have a direct email search
    // We'd need to fetch conversations and filter, or use a different approach
    // For now, return a message indicating this limitation
    return {
      error: 'Direct email search not supported by Missive API. Use syncRecentMessages instead.',
      suggestion: 'Consider implementing conversation search via shared labels or teams'
    };
  }
}

module.exports = new MissiveSyncService();
