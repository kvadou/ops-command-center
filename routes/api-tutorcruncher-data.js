const express = require("express");
const router = express.Router();
const { getOrSet, generateKey } = require("../utils/cache");
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Use global dependencies instead of building new ones
const { tutorCruncherAPI, limitedGet, rateLimitRetry } = global;

logger.info({ tutorCruncherAPI: !!tutorCruncherAPI, limitedGet: !!limitedGet, rateLimitRetry: !!rateLimitRetry }, '🔧 api-tutorcruncher-data loading');

// Add middleware to log all requests to this router
router.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path, url: req.url }, '🔍 ROUTER MIDDLEWARE HIT');
  next();
});

// Test route that does absolutely nothing
router.get("/ping", (req, res) => {
  logger.info('🏓 PING route hit!');
  res.json({ status: "pong", timestamp: new Date().toISOString() });
});

// Note: api-tutorcruncher-data doesn't use database connections,
// so no getLocationPool function needed. It only queries TutorCruncher API.

// Use proper RBAC middleware
const { requireStaffOrAdmin } = require("../middleware/rbac");
const { requireAuth: auth } = require("../middleware/auth");

const { getLocationPool: getPool } = require('../utils/pool');

// GET /api/tutorcruncher-data/clients - Fetch clients with search
router.get("/clients", requireStaffOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;

    let url = `/clients/?page=${page}&page_size=${limit}`;
    
    if (search) {
      // TutorCruncher supports search parameters
      url += `&search=${encodeURIComponent(search)}`;
    }

    // Cache TutorCruncher API responses (30 minutes TTL)
    const cacheKey = generateKey('tutorcruncher:clients', { search, page, limit });
    const response = await getOrSet(cacheKey, async () => {
      const fetchClients = async () => {
        return await limitedGet(url);
      };
      return await rateLimitRetry(fetchClients);
    }, 1800); // 30 minutes

    // Format response for frontend dropdown
    const clients = response.data.results.map((client) => ({
      id: client.id,
      name: `${client.first_name} ${client.last_name}`.trim(),
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.mobile || client.phone,
      address: client.address_line1
        ? `${client.address_line1}, ${client.town || ""}, ${client.postcode || ""}`.trim()
        : "",
      labels: client.labels || [],
      status: client.status,
    }));

    res.json({
      clients,
      count: response.data.count,
      next: response.data.next,
      previous: response.data.previous,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher clients:');
    res.status(500).json({
      error: "Failed to fetch clients from TutorCruncher",
      details: error.response?.data || error.message,
    });
  }
}));

// GET /api/tutorcruncher-data/clients/:id - Fetch single client with full details
router.get("/clients/:id", requireStaffOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Cache individual client (30 minutes TTL)
    const cacheKey = generateKey('tutorcruncher:client', { id });
    const response = await getOrSet(cacheKey, async () => {
      const fetchClient = async () => {
        return await limitedGet(`/clients/${id}/`);
      };
      return await rateLimitRetry(fetchClient);
    }, 1800); // 30 minutes
    const client = response.data;

    // Format full client data including recipients
    const formattedClient = {
      id: client.id,
      name: `${client.first_name} ${client.last_name}`.trim(),
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.mobile || client.phone,
      address_line1: client.address_line1,
      address_line2: client.address_line2,
      town: client.town,
      postcode: client.postcode,
      country: client.country,
      labels: client.labels || [],
      status: client.status,
      recipients: client.recipients || [], // Students/children
      extra_attrs: client.extra_attrs || [],
    };

    res.json(formattedClient);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher client:');
    res.status(500).json({
      error: "Failed to fetch client from TutorCruncher",
      details: error.response?.data || error.message,
    });
  }
}));

// GET /api/tutorcruncher-data/contractors - Fetch contractors/tutors with search (Job Builder)
// Any authenticated user can search contractors for job creation
router.get("/contractors", auth, asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    
    // Cap limit to prevent overwhelming the API
    const safeLimit = Math.min(parseInt(limit) || 50, 500);

    let url = `/contractors/?page=${page}&page_size=${safeLimit}`;
    
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    // Cache contractors (30 minutes TTL)
    const cacheKey = generateKey('tutorcruncher:contractors', { search, page, limit: safeLimit });
    
    let response;
    try {
      response = await getOrSet(cacheKey, async () => {
        const fetchContractors = async () => {
          return await limitedGet(url);
        };
        return await rateLimitRetry(fetchContractors);
      }, 1800); // 30 minutes
    } catch (cacheError) {
      logger.error({ data: cacheError }, 'Error fetching contractors from cache/API:');
      // Return empty result instead of failing completely
      return res.json({
        contractors: [],
        count: 0,
        next: null,
        previous: null,
      });
    }

    // Validate response structure
    if (!response || !response.data || !Array.isArray(response.data.results)) {
      logger.error({ data: response }, 'Invalid response structure from TutorCruncher:');
      return res.json({
        contractors: [],
        count: 0,
        next: null,
        previous: null,
      });
    }

    // Format response for frontend dropdown
    const contractors = response.data.results.map((contractor) => ({
      id: contractor.id,
      name: `${contractor.first_name || ''} ${contractor.last_name || ''}`.trim() || 'Unknown',
      first_name: contractor.first_name,
      last_name: contractor.last_name,
      email: contractor.email,
      phone: contractor.mobile || contractor.phone,
      status: contractor.status,
      labels: contractor.labels || [],
      skills: contractor.skills || [],
      pay_rate: contractor.default_rate || null,
    }));

    res.json({
      contractors,
      count: response.data.count || contractors.length,
      next: response.data.next,
      previous: response.data.previous,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher contractors:');
    logger.error({ data: error.stack }, 'Error stack:');
    // Return empty result instead of 500 to prevent page crash
    res.status(200).json({
      contractors: [],
      count: 0,
      next: null,
      previous: null,
      error: "Failed to fetch contractors - using empty list",
    });
  }
}));

// GET /api/tutorcruncher-data/contractors/:id - Fetch single contractor with full details
router.get("/contractors/:id", requireStaffOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Cache individual contractor (30 minutes TTL)
    const cacheKey = generateKey('tutorcruncher:contractor', { id });
    const response = await getOrSet(cacheKey, async () => {
      const fetchContractor = async () => {
        return await limitedGet(`/contractors/${id}/`);
      };
      return await rateLimitRetry(fetchContractor);
    }, 1800); // 30 minutes
    const contractor = response.data;

    // Format full contractor data
    const formattedContractor = {
      id: contractor.id,
      name: `${contractor.first_name} ${contractor.last_name}`.trim(),
      first_name: contractor.first_name,
      last_name: contractor.last_name,
      email: contractor.email,
      phone: contractor.mobile || contractor.phone,
      status: contractor.status,
      labels: contractor.labels || [],
      skills: contractor.skills || [],
      pay_rate: contractor.default_rate || null,
      extra_attrs: contractor.extra_attrs || [],
      contractor_permissions: contractor.default_contractor_permissions || "add-edit-complete",
    };

    res.json(formattedContractor);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher contractor:');
    res.status(500).json({
      error: "Failed to fetch contractor from TutorCruncher",
      details: error.response?.data || error.message,
    });
  }
}));

// GET /api/tutorcruncher-data/labels - Fetch all labels
router.get("/labels", asyncHandler(async (req, res) => {
  try {
    logger.info('🏷️  Labels endpoint hit!');
    
    // Helper function to get pool from request
    const pool = getPool(req);
    
    // First try to get labels from database (fast and reliable)
    try {
      if (pool) {
        const { rows: dbLabels } = await pool.query(`
          SELECT id, name, color, active
          FROM labels
          WHERE active = true
          ORDER BY name ASC
        `);
        
        if (dbLabels.length > 0) {
          logger.info(`✅ Found ${dbLabels.length} labels in database`);
          const labels = dbLabels.map(label => ({
            id: label.id,
            name: label.name,
            machine_name: null, // Not stored in DB
            colour: label.color || '#d3d3d3',
            applies_to: [], // Not stored in DB, will include all
          }));
          return res.json({ labels });
        }
      }
    } catch (dbError) {
      logger.warn({ data: dbError.message }, '⚠️ Database query failed, falling back to API:');
    }
    
    // Fallback: Fetch from TutorCruncher API
    try {
      const cacheKey = generateKey('tutorcruncher:labels', {});
      const response = await getOrSet(cacheKey, async () => {
        const fetchLabels = async () => {
          return await limitedGet("/labels/");
        };
        return await rateLimitRetry(fetchLabels);
      }, 3600); // 1 hour

      // Format labels for dropdown with colors
      const labels = response.data.results
        ? response.data.results.map((label) => ({
            id: label.id,
            name: label.name,
            machine_name: label.machine_name,
            colour: label.colour || label.color || '#d3d3d3', // Include color
            applies_to: label.applies_to || [], // Include applies_to for filtering
          }))
        : [];

      logger.info(`✅ Fetched ${labels.length} labels from TutorCruncher API`);
      return res.json({ labels });
    } catch (apiError) {
      logger.error({ data: apiError.message }, '❌ Error fetching TutorCruncher labels from API:');
      // Return empty array instead of error to prevent UI breakage
      logger.warn('⚠️ Returning empty labels array - UI will still work');
      return res.json({ labels: [] });
    }
  } catch (error) {
    logger.error({ err: error }, '❌ Unexpected error in labels endpoint:');
    // Return empty array instead of error to prevent UI breakage
    return res.json({ labels: [] });
  }
}));

// GET /api/tutorcruncher-data/labels/:id - Fetch single label details
router.get("/labels/:id", requireStaffOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Cache individual label (1 hour TTL)
    const cacheKey = generateKey('tutorcruncher:label', { id });
    const response = await getOrSet(cacheKey, async () => {
      const fetchLabel = async () => {
        return await limitedGet(`/labels/${id}/`);
      };
      return await rateLimitRetry(fetchLabel);
    }, 3600); // 1 hour
    const label = response.data;

    res.json({
      id: label.id,
      name: label.name,
      machine_name: label.machine_name,
      colour: label.colour,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher label:');
    res.status(500).json({
      error: "Failed to fetch label from TutorCruncher",
      details: error.response?.data || error.message,
    });
  }
}));

// GET /api/tutorcruncher-data/recipients - Search for recipients (students)
// This searches within clients' recipients
router.get("/recipients", requireStaffOrAdmin, asyncHandler(async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;

    // First fetch clients with recipients
    let url = `/clients/?page=${page}&page_size=${limit}`;
    
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }

    const fetchClients = async () => {
      return await limitedGet(url);
    };

    const response = await rateLimitRetry(fetchClients);

    // Extract all recipients from clients
    const recipients = [];
    response.data.results.forEach((client) => {
      if (client.recipients && Array.isArray(client.recipients)) {
        client.recipients.forEach((recipient) => {
          recipients.push({
            id: recipient.id,
            name: `${recipient.first_name} ${recipient.last_name}`.trim(),
            first_name: recipient.first_name,
            last_name: recipient.last_name,
            email: recipient.email,
            paying_client_id: client.id,
            paying_client_name: `${client.first_name} ${client.last_name}`.trim(),
            extra_attrs: recipient.extra_attrs || [],
          });
        });
      }
    });

    res.json({
      recipients,
      count: recipients.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching TutorCruncher recipients:');
    res.status(500).json({
      error: "Failed to fetch recipients from TutorCruncher",
      details: error.response?.data || error.message,
    });
  }
}));

const jobLabels = require("../shared/job-labels.json");

// GET /api/tutorcruncher-data/colours - Get available service colours
router.get("/colours", asyncHandler(async (req, res) => {
  try {
    const colours = jobLabels.map(({ name, displayColour, machineName }) => ({
      label: name,
      value: name, // Use label name as value so we can look up the label ID later
      colorValue: displayColour, // Store color separately for display
      machineName,
    }));

    res.json({ colours });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching colours:');
    res.status(500).json({ error: "Failed to fetch colours" });
  }
}));

// GET /api/tutorcruncher-data/db/clients - Search clients from database (Job Builder)
// Any authenticated user can search clients for job creation
router.get("/db/clients", auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) {
      logger.error('Database pool not available for clients search');
      return res.status(500).json({ error: "Database pool not available" });
    }

    const { search = "", limit = 50 } = req.query;
    
    // If search is empty or too short, return empty results
    if (!search || search.trim().length < 2) {
      return res.json({
        clients: [],
        count: 0,
      });
    }

    // Split search term into words for multi-word matching
    const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0);
    
    // Build query that matches all words across first_name and last_name
    // Each word can match either first_name or last_name
    let query;
    let queryParams = [];
    
    if (searchWords.length === 1) {
      // Single word: search in any field
      const searchTerm = `%${searchWords[0]}%`;
      query = `
      SELECT
        client_id as id,
        first_name,
        last_name,
        email,
        mobile,
        phone,
        street,
        town,
        state,
        postcode,
        country,
        timezone
      FROM clients
      WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 OR client_id::text ILIKE $1)
      ORDER BY first_name, last_name
      LIMIT $2
    `;
      queryParams = [searchTerm, parseInt(limit)];
    } else {
      // Multiple words: each word must match either first_name or last_name
      // This allows "georgia bri" to match "Georgia Bristol"
      const conditions = searchWords.map((word, index) => {
        const paramIndex = index + 1;
        const wordPattern = `%${word}%`;
        return `(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`;
      }).join(' AND ');
      
      query = `
        SELECT
          client_id as id,
          first_name,
          last_name,
          email,
          mobile,
          phone,
          street,
          town,
          state,
          postcode,
          country,
          timezone
        FROM clients
        WHERE ${conditions}
        ORDER BY first_name, last_name
        LIMIT $${searchWords.length + 1}
      `;
      queryParams = [
        ...searchWords.map(word => `%${word}%`),
        parseInt(limit)
      ];
    }

    const { rows } = await pool.query(query, queryParams);

    let clients = rows.map((client) => ({
      id: client.id,
      name: `${client.first_name || ""} ${client.last_name || ""}`.trim(),
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.mobile || client.phone,
      address: [client.street, client.town, client.state, client.postcode, client.country]
        .filter(Boolean)
        .join(", "),
      timezone: client.timezone,
    }));

    // Backfill address from TC detail for clients missing address data
    const missingAddress = clients.filter(c => !c.address);
    if (missingAddress.length > 0 && limitedGet && rateLimitRetry) {
      await Promise.all(missingAddress.map(async (client) => {
        try {
          const fetchDetail = async () => limitedGet(`/clients/${client.id}/`);
          const tcResponse = await rateLimitRetry(fetchDetail);
          const tc = tcResponse.data;
          const street = tc.address_line1 || tc.street || null;
          const tcAddress = [street, tc.address_line2, tc.town, tc.state, tc.postcode, tc.country]
            .filter(Boolean)
            .join(', ');
          if (tcAddress) {
            client.address = tcAddress;
            // Backfill to DB so future lookups don't need TC call
            pool.query(
              `UPDATE clients SET street = $1, town = $2, state = $3, postcode = $4, country = $5 WHERE client_id = $6`,
              [street, tc.town || null, tc.state || null, tc.postcode || null, tc.country || null, client.id]
            ).catch(err => logger.warn({ err }, `[JobBuilder] Failed to backfill address for client ${client.id}`));
          }
        } catch (err) {
          logger.warn({ err, clientId: client.id }, '[JobBuilder] Failed to fetch TC detail for address backfill');
        }
      }));
    }

    res.json({
      clients,
      count: clients.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching clients from database:');
    logger.error({ data: error.stack }, 'Error stack:');
    res.status(500).json({
      error: "Failed to fetch clients from database",
      details: error.message,
    });
  }
}));

// GET /api/tutorcruncher-data/db/clients/:clientId/recipients - Get recipients for a specific client (Job Builder)
// Any authenticated user can get recipients for job creation
router.get("/db/clients/:clientId/recipients", auth, asyncHandler(async (req, res) => {
  try {
    const pool = getPool(req);
    if (!pool) {
      return res.status(500).json({ error: "Database pool not available" });
    }

    const { clientId } = req.params;
    const { search = "" } = req.query;
    
    // Convert clientId to integer for comparison with paying_client_id
    const clientIdInt = parseInt(clientId, 10);
    if (isNaN(clientIdInt)) {
      return res.status(400).json({ error: "Invalid client ID" });
    }
    
    const searchTerm = search ? `%${search.trim()}%` : null;

    // Query recipients table directly - students are linked to clients via paying_client_id
    // (Previously queried appointment_recipients which missed new students with no appointments yet)
    let query;
    let queryParams;

    if (searchTerm) {
      query = `
        SELECT DISTINCT
          r.recipient_id::text as id,
          r.first_name,
          r.last_name,
          r.email,
          r.paying_client_id::text as client_id,
          (r.first_name || ' ' || r.last_name) as recipient_name,
          COALESCE(r.first_name, '') as first_name_sort,
          COALESCE(r.last_name, '') as last_name_sort
        FROM recipients r
        WHERE r.paying_client_id = $1
          AND (
            COALESCE(r.first_name, '') ILIKE $2
            OR COALESCE(r.last_name, '') ILIKE $2
            OR COALESCE(r.email, '') ILIKE $2
          )
        ORDER BY first_name_sort, last_name_sort, recipient_name
        LIMIT 50
      `;
      queryParams = [clientIdInt, searchTerm];
    } else {
      // If no search term, return all recipients for this client
      query = `
        SELECT DISTINCT
          r.recipient_id::text as id,
          r.first_name,
          r.last_name,
          r.email,
          r.paying_client_id::text as client_id,
          (r.first_name || ' ' || r.last_name) as recipient_name,
          COALESCE(r.first_name, '') as first_name_sort,
          COALESCE(r.last_name, '') as last_name_sort
        FROM recipients r
        WHERE r.paying_client_id = $1
        ORDER BY first_name_sort, last_name_sort, recipient_name
        LIMIT 50
      `;
      queryParams = [clientIdInt];
    }

    const { rows } = await pool.query(query, queryParams);

    let recipients = rows.map((recipient) => ({
      id: recipient.id,
      name: recipient.recipient_name || `${recipient.first_name || ""} ${recipient.last_name || ""}`.trim(),
      first_name: recipient.first_name,
      last_name: recipient.last_name,
      email: recipient.email,
      client_id: recipient.client_id,
    }));

    // Enrich recipients with full details from TutorCruncher API (including extra_attrs for DOB and chess level)
    // Fetch full recipient details in parallel (with rate limiting)
    let enrichedRecipients = await Promise.all(
      recipients.map(async (recipient) => {
        try {
          const cacheKey = generateKey('tutorcruncher:recipient', { id: recipient.id });
          const recipientResponse = await getOrSet(cacheKey, async () => {
            const fetchRecipient = async () => {
              return await limitedGet(`/recipients/${recipient.id}/`);
            };
            return await rateLimitRetry(fetchRecipient);
          }, 1800); // 30 minutes cache

          const recipientData = recipientResponse.data;
          
          // Extract DOB and chess level from extra_attrs
          let dob = null;
          let chessLevel = null;
          
          if (recipientData.extra_attrs && Array.isArray(recipientData.extra_attrs)) {
            recipientData.extra_attrs.forEach((attr) => {
              if (attr.machine_name === 'sr_dob' && attr.value) {
                dob = attr.value;
              }
              // Check for chess level/experience fields (common names: chess_level, experience, skill_level, sr_experience)
              if ((attr.machine_name === 'chess_level' || 
                   attr.machine_name === 'experience' || 
                   attr.machine_name === 'skill_level' ||
                   attr.machine_name === 'sr_experience') && attr.value) {
                chessLevel = attr.value;
              }
            });
          }
          
          return {
            ...recipient,
            dob,
            chess_level: chessLevel,
            extra_attrs: recipientData.extra_attrs || [],
          };
        } catch (error) {
          // If fetching full details fails, return basic recipient info
          logger.warn({ error: error.message }, `Could not fetch full details for recipient ${recipient.id}:`);
          return recipient;
        }
      })
    );

    // If no recipients found in local DB, try TutorCruncher API as fallback
    // This handles cases where recipients haven't been synced yet
    let finalRecipients = enrichedRecipients;
    if (enrichedRecipients.length === 0) {
      try {
        const cacheKey = generateKey('tutorcruncher:client:recipients', { clientId: clientIdInt });
        const clientResponse = await getOrSet(cacheKey, async () => {
          const fetchClient = async () => {
            return await limitedGet(`/clients/${clientIdInt}/`);
          };
          return await rateLimitRetry(fetchClient);
        }, 1800); // 30 minutes cache

        const client = clientResponse.data;
        
        // Extract paid_recipients from TutorCruncher client object
        if (client.paid_recipients && Array.isArray(client.paid_recipients)) {
          const basicRecipients = client.paid_recipients
            .filter((recipient) => {
              // Apply search filter if provided
              if (searchTerm) {
                const searchLower = searchTerm.toLowerCase().replace(/%/g, '');
                const firstName = (recipient.first_name || '').toLowerCase();
                const lastName = (recipient.last_name || '').toLowerCase();
                const email = (recipient.email || '').toLowerCase();
                return firstName.includes(searchLower) || 
                       lastName.includes(searchLower) || 
                       email.includes(searchLower);
              }
              return true;
            })
            .slice(0, 50); // Limit to 50 results
          
          // Enrich these recipients with full details too
          const fallbackRecipients = await Promise.all(
            basicRecipients.map(async (recipient) => {
              try {
                const cacheKey = generateKey('tutorcruncher:recipient', { id: recipient.id });
                const recipientResponse = await getOrSet(cacheKey, async () => {
                  const fetchRecipient = async () => {
                    return await limitedGet(`/recipients/${recipient.id}/`);
                  };
                  return await rateLimitRetry(fetchRecipient);
                }, 1800);

                const recipientData = recipientResponse.data;
                
                let dob = null;
                let chessLevel = null;
                
                if (recipientData.extra_attrs && Array.isArray(recipientData.extra_attrs)) {
                  recipientData.extra_attrs.forEach((attr) => {
                    if (attr.machine_name === 'sr_dob' && attr.value) {
                      dob = attr.value;
                    }
                    if ((attr.machine_name === 'chess_level' || 
                         attr.machine_name === 'experience' || 
                         attr.machine_name === 'skill_level' ||
                         attr.machine_name === 'sr_experience') && attr.value) {
                      chessLevel = attr.value;
                    }
                  });
                }
                
                return {
                  id: String(recipient.id),
                  name: `${recipient.first_name || ""} ${recipient.last_name || ""}`.trim(),
                  first_name: recipient.first_name,
                  last_name: recipient.last_name,
                  email: recipient.email,
                  client_id: String(clientIdInt),
                  dob,
                  chess_level: chessLevel,
                  extra_attrs: recipientData.extra_attrs || [],
                };
              } catch (error) {
                logger.warn({ error: error.message }, `Could not fetch full details for recipient ${recipient.id}:`);
                return {
                  id: String(recipient.id),
                  name: `${recipient.first_name || ""} ${recipient.last_name || ""}`.trim(),
                  first_name: recipient.first_name,
                  last_name: recipient.last_name,
                  email: recipient.email,
                  client_id: String(clientIdInt),
                };
              }
            })
          );
          finalRecipients = fallbackRecipients;
        }
      } catch (tcError) {
        // Log but don't fail - database results are primary, TutorCruncher is fallback
        logger.warn({ data: tcError.message }, 'Could not fetch recipients from TutorCruncher API:');
      }
    }

    res.json({
      recipients: finalRecipients,
      count: finalRecipients.length,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching recipients from database:');
    res.status(500).json({
      error: "Failed to fetch recipients from database",
      details: error.message,
    });
  }
}));

module.exports = router;

