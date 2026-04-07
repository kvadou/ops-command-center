/**
 * Klaviyo Service
 * Handles all Klaviyo API interactions for profile and list management
 * Extracted from server-fns.js for better maintainability
 */

const axios = require('axios');
const { logger } = require('../utils/logger');

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_API_BASE = 'https://a.klaviyo.com/api';
const KLAVIYO_API_REVISION = '2024-10-15';
const KLAVIYO_STUB_MODE = !KLAVIYO_API_KEY;

/**
 * Get existing Klaviyo profile by email
 * @param {string} email - Email address to search for
 * @returns {Promise<string|null>} - Profile ID if found, null otherwise
 */
async function getExistingProfileByEmail(email) {
  if (KLAVIYO_STUB_MODE) {
    logger.info(`[STUB] Klaviyo getExistingProfileByEmail: ${email}`);
    return 'stub-profile-001';
  }
  try {
    const response = await axios.get(
      `${KLAVIYO_API_BASE}/profiles?filter=equals(email,"${email}")`,
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'Content-Type': 'application/json',
          Revision: KLAVIYO_API_REVISION
        }
      }
    );

    if (response.data && response.data.data && response.data.data.length > 0) {
      logger.info(`→ Found existing profile for ${email}`);
      return response.data.data[0].id;
    } else {
      logger.info(`→ No existing profile found for ${email}`);
      return null;
    }
  } catch (err) {
    logger.error({ error: err.response?.data || err.message }, ` Failed to retrieve profile for ${email}:`);
    throw err;
  }
}

/**
 * Check if a Klaviyo profile exists for an email
 * @param {string} email - Email address to check
 * @returns {Promise<boolean>} - True if profile exists, false otherwise
 */
async function checkKlaviyoProfileExistence(email) {
  try {
    const response = await getExistingProfileByEmail(email);
    return response ? true : false;
  } catch (err) {
    return false;
  }
}

/**
 * Create a new Klaviyo profile
 * @param {object} profileData - Profile data object
 * @returns {Promise<string>} - Created profile ID
 */
async function createKlaviyoProfile(profileData) {
  if (KLAVIYO_STUB_MODE) {
    logger.info(`[STUB] Klaviyo createKlaviyoProfile: ${profileData.email}`);
    return 'stub-profile-001';
  }
  try {
    const existingProfileId = await getExistingProfileByEmail(profileData.email);

    if (existingProfileId) {
      logger.info(`→ Profile already exists. Using existing profile ID: ${existingProfileId}`);
      return existingProfileId;
    }

    const response = await axios.post(
      `${KLAVIYO_API_BASE}/profiles`,
      {
        data: {
          type: 'profile',
          attributes: profileData
        }
      },
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'Content-Type': 'application/json',
          Revision: KLAVIYO_API_REVISION
        }
      }
    );

    logger.info(`→ Profile created for ${profileData.email}`);
    logger.info({ data: response.data }, 'Profile creation response:');

    if (response.data && response.data.data && response.data.data.id) {
      return response.data.data.id;
    } else {
      logger.error(' Profile creation failed: No profile ID returned in response');
      throw new Error('Profile ID not returned');
    }
  } catch (err) {
    logger.error({ error: err.response?.data || err.message }, ` Failed to create or retrieve profile for ${profileData.email}:`);
    throw err;
  }
}

/**
 * Create or update a Klaviyo profile (checks existence first)
 * @param {string} parentEmail - Parent email address
 * @param {string} parentFirst - Parent first name
 * @param {string} parentLast - Parent last name
 * @param {string} parentPhone - Parent phone number
 * @param {object} address - Address object with street, city, state, zip
 * @returns {Promise<string|null>} - Profile ID if created, null if already exists
 */
async function createOrUpdateKlaviyoProfile(
  parentEmail,
  parentFirst,
  parentLast,
  parentPhone,
  address
) {
  const profileExists = await checkKlaviyoProfileExistence(parentEmail);

  if (profileExists) {
    logger.info(`Profile already exists for ${parentEmail}. Skipping creation.`);
    return profileExists;
  }

  logger.info(`Attempting to create Klaviyo profile for ${parentEmail}`);

  const isValidPhoneNumber = (phone) => {
    const regex = /^\+\d{10,15}$/;
    return regex.test(phone);
  };

  const profileData = {
    email: parentEmail,
    first_name: parentFirst,
    last_name: parentLast,
    phone_number: isValidPhoneNumber(parentPhone) ? parentPhone : undefined,
    location: {
      address1: address.street,
      city: address.city,
      region: address.state,
      zip: address.zip,
      country: 'US'
    }
  };

  try {
    const profileId = await createKlaviyoProfile(profileData);
    logger.info(`Profile created with ID: ${profileId}`);
    return profileId;
  } catch (err) {
    if (err.statusCode === 409) {
      logger.error(`Profile already exists for ${parentEmail}`);
      return null;
    } else {
      logger.error({ error: err.message }, 'Error creating Klaviyo profile:');
      throw new Error('Failed to create or update Klaviyo profile');
    }
  }
}

/**
 * Add a profile to a Klaviyo list
 * @param {string} profileId - Klaviyo profile ID
 * @param {string} listId - Klaviyo list ID
 * @returns {Promise<void>}
 */
async function addToKlaviyoList(profileId, listId) {
  if (KLAVIYO_STUB_MODE) {
    logger.info(`[STUB] Klaviyo addToKlaviyoList: profile ${profileId} to list ${listId}`);
    return;
  }
  logger.info(`Adding profile ${profileId} to List ${listId}...`);

  if (!listId) {
    logger.error('Error: listId is undefined or empty');
    throw new Error('List ID is missing');
  }

  if (!KLAVIYO_API_KEY) {
    logger.error('Error: KLAVIYO_API_KEY is not set');
    throw new Error('Klaviyo API key is missing');
  }

  logger.info({ data: profileId }, 'Profile ID:');
  logger.info({ data: listId }, 'List ID:');

  const body = JSON.stringify({
    data: [
      {
        type: 'profile',
        id: profileId
      }
    ]
  });

  try {
    const response = await fetch(
      `${KLAVIYO_API_BASE}/lists/${listId}/relationships/profiles/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          'Content-Type': 'application/json',
          revision: KLAVIYO_API_REVISION
        },
        body: body
      }
    );

    logger.info({ data: response.status }, 'Response Status:');
    const responseText = await response.text();
    logger.info({ data: responseText }, 'Response Text:');

    if (response.status === 204) {
      logger.info(`Profile ${profileId} successfully added to List ${listId}. No content returned.`);
      return;
    }

    if (!response.ok) {
      logger.error({ data: responseText }, 'Error adding profile to list:');
      throw new Error(`Failed to add to list: ${response.statusText}`);
    }

    let responseData;
    if (responseText) {
      try {
        responseData = JSON.parse(responseText);
        logger.info({ data: responseData }, `Profile ${profileId} successfully added to List ${listId}`);
      } catch (e) {
        logger.error({ err: e }, 'Failed to parse response as JSON:');
        throw new Error('Response was not valid JSON');
      }
    } else {
      logger.error('Empty response body received');
      throw new Error('Received empty response body');
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to add to Klaviyo list:');
    throw new Error('Error in adding profile to Klaviyo list');
  }
}

/**
 * Remove a profile from a Klaviyo list
 * @param {string} profileId - Klaviyo profile ID
 * @param {string} listId - Klaviyo list ID
 * @returns {Promise<void>}
 */
async function removeFromKlaviyoList(profileId, listId) {
  if (KLAVIYO_STUB_MODE) {
    logger.info(`[STUB] Klaviyo removeFromKlaviyoList: profile ${profileId} from list ${listId}`);
    return;
  }
  logger.info(`Removing profile ${profileId} from List ${listId}...`);

  if (!profileId || !listId) {
    throw new Error('Profile ID or List ID is missing');
  }

  const body = JSON.stringify({
    data: [
      {
        type: 'profile',
        id: profileId
      }
    ]
  });

  try {
    const response = await fetch(
      `${KLAVIYO_API_BASE}/lists/${listId}/relationships/profiles`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
          accept: 'application/vnd.api+json',
          'content-type': 'application/vnd.api+json',
          revision: '2025-07-15'
        },
        body: body
      }
    );

    if (!response.ok) {
      const errorResponse = await response.json();
      logger.error({ data: errorResponse }, `Error removing profile from list:`);
      throw new Error(`Failed to remove from list: ${response.statusText}`);
    } else {
      logger.info(`Profile ${profileId} successfully removed from List ${listId}`);
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to remove from Klaviyo list:');
    throw new Error('Error in removing profile from Klaviyo list');
  }
}

module.exports = {
  getExistingProfileByEmail,
  checkKlaviyoProfileExistence,
  createKlaviyoProfile,
  createOrUpdateKlaviyoProfile,
  addToKlaviyoList,
  removeFromKlaviyoList
};
