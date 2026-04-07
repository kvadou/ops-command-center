const { logger } = require('../utils/logger');

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';

class WebflowTutorSyncService {
  constructor(pool) {
    this.pool = pool;
    this.token = process.env.WEBFLOW_API_TOKEN;
    this.collectionId = process.env.WEBFLOW_TUTORS_COLLECTION_ID;
    this.siteId = process.env.WEBFLOW_SITE_ID;
  }

  isConfigured() {
    return !!(this.token && this.collectionId && this.siteId);
  }

  async webflowRequest(method, path, body) {
    const url = `${WEBFLOW_API_BASE}${path}`;
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      logger.error({ status: response.status, data, url }, 'Webflow API error');
      throw new Error(`Webflow API error ${response.status}: ${data.message || JSON.stringify(data)}`);
    }

    return data;
  }

  /**
   * Build field data payload for Webflow from contractor record.
   * Maps OpsHub contractor fields → Webflow CMS fields.
   */
  buildFieldData(contractor) {
    const name = `${contractor.first_name} ${contractor.last_name}`.trim();
    const fieldData = {
      name,
      slug: contractor.slug,
      role: contractor.profile_title || '',
      'short-description': contractor.profile_teaching_style || '',
      bio: contractor.profile_bio || '',
    };

    // Booking link — points to OpsHub booking form with tutor pre-selection
    fieldData['booking-link'] = `https://join.acmeops.com/booking?tutorId=${contractor.contractor_id}&tutorName=${encodeURIComponent(name)}`;

    return fieldData;
  }

  /**
   * Sync a single tutor to Webflow CMS.
   * Creates or updates the collection item, then publishes.
   */
  async syncTutor(contractorId) {
    if (!this.isConfigured()) {
      logger.info(`[STUB] Webflow syncTutor: contractor ${contractorId} — returning mock item ID`);
      return 'wf-stub-item-001';
    }

    // Fetch contractor from DB
    const { rows } = await this.pool.query(
      `SELECT contractor_id, first_name, last_name, slug,
              profile_bio, profile_headshot_url, profile_teaching_style,
              profile_years_experience, profile_title, photo, local_image_url,
              review_rating, town, state, webflow_item_id, profile_visible
       FROM contractors WHERE contractor_id = $1`,
      [contractorId]
    );

    if (rows.length === 0) {
      logger.warn({ contractorId }, 'Contractor not found for Webflow sync');
      return null;
    }

    const contractor = rows[0];

    if (!contractor.profile_visible) {
      // If not visible and has a Webflow item, unpublish/archive it
      if (contractor.webflow_item_id) {
        logger.info({ contractorId, webflowItemId: contractor.webflow_item_id }, 'Archiving hidden tutor from Webflow');
        try {
          await this.webflowRequest('PATCH', `/collections/${this.collectionId}/items/${contractor.webflow_item_id}`, {
            isArchived: true,
          });
        } catch (err) {
          logger.error({ contractorId, error: err.message }, 'Failed to archive Webflow item');
        }
      }
      return null;
    }

    const fieldData = this.buildFieldData(contractor);

    let itemId = contractor.webflow_item_id;

    if (itemId) {
      // Update existing item
      logger.info({ contractorId, itemId }, 'Updating Webflow tutor item');
      await this.webflowRequest('PATCH', `/collections/${this.collectionId}/items/${itemId}`, {
        isArchived: false,
        isDraft: false,
        fieldData,
      });
    } else {
      // Create new item
      logger.info({ contractorId, slug: contractor.slug }, 'Creating Webflow tutor item');
      const result = await this.webflowRequest('POST', `/collections/${this.collectionId}/items`, {
        isArchived: false,
        isDraft: false,
        fieldData,
      });

      itemId = result.id;

      // Store webflow_item_id for future updates
      await this.pool.query(
        'UPDATE contractors SET webflow_item_id = $1 WHERE contractor_id = $2',
        [itemId, contractorId]
      );
    }

    // Publish the item
    try {
      await this.webflowRequest('POST', `/collections/${this.collectionId}/items/publish`, {
        itemIds: [itemId],
      });
      logger.info({ contractorId, itemId }, 'Webflow tutor item published');
    } catch (err) {
      logger.warn({ contractorId, itemId, error: err.message }, 'Webflow publish failed — item saved as draft');
    }

    return itemId;
  }

  /**
   * Sync photo to Webflow.
   * Webflow Image fields require a hosted URL — we pass the S3/photo URL.
   */
  async syncTutorPhoto(contractorId) {
    if (!this.isConfigured()) {
      logger.info(`[STUB] Webflow syncTutorPhoto: contractor ${contractorId}`);
      return null;
    }

    const { rows } = await this.pool.query(
      'SELECT webflow_item_id, local_image_url, profile_headshot_url, photo FROM contractors WHERE contractor_id = $1',
      [contractorId]
    );

    if (rows.length === 0 || !rows[0].webflow_item_id) return null;

    const photoUrl = rows[0].local_image_url || rows[0].profile_headshot_url || rows[0].photo;
    if (!photoUrl) return null;

    // Webflow v2 PATCH requires isArchived/isDraft alongside fieldData
    await this.webflowRequest('PATCH', `/collections/${this.collectionId}/items/${rows[0].webflow_item_id}`, {
      isArchived: false,
      isDraft: false,
      fieldData: {
        photo: { url: photoUrl },
      },
    });

    return rows[0].webflow_item_id;
  }
}

module.exports = WebflowTutorSyncService;
