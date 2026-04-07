"use strict";

const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator'); // if used in this file
const JWT_SECRET = process.env.JWT_SECRET || global.JWT_SECRET;

// Import Klaviyo service (extracted for better maintainability)
const klaviyoService = require('./klaviyo-service');
const { logger } = require('../utils/logger');

// Import puppeteer-core and chromium for browser operations
let puppeteerCore;
let chromium;
try {
  puppeteerCore = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  logger.warn({ data: e.message }, 'Puppeteer/Chromium not available for browser operations:');
}

function buildServerFns(deps = {}) {
  const {
    pool,
    tutorCruncherAPI,
    axios,
    fetch,
    KLAVIYO_API_KEY,
    TUTORCRUNCHER_API_TOKEN,
    LABEL_ID,
    cloudinary,
    db,
    sequelize,
    Service,
    Location,
    ColourGroup,
    Appointment,
    jwt,
    JWT_SECRET,
    GRAVITY_FORMS_API_BASE_URL,
    delay: injectedDelay,
    rateLimitRetry: injectedRateLimitRetry,
    limitedGet: injectedLimitedGet,
    jwt: injectedJwt,
    JWT_SECRET: injectedJWTSecret,
    GRAVITY_FORMS_API_BASE_URL: injectedGravityBase,
    puppeteer: injectedPuppeteer,
  } = deps;

// Use injected puppeteer or fall back to puppeteer-core
const puppeteer = injectedPuppeteer || puppeteerCore;

const jwtLib = deps.jwt || require('jsonwebtoken');
const jwtSecret = deps.JWT_SECRET || process.env.JWT_SECRET || global.JWT_SECRET;

const auth = (req, res, next) => {
    const tokenFromHeader = req.header("Authorization")?.split(" ")[1];
    const tokenFromCookie = req.cookies?.token;
    const token = tokenFromHeader || tokenFromCookie;

    if (!token) {
      return res.status(401).json({ msg: "No token, authorization denied" });
    }

    try {
      const decoded = jwtLib.verify(token, jwtSecret);
      req.user = decoded.user || decoded;
      const nowSec = Math.floor(Date.now() / 1000);
      const exp = decoded.exp || 0;
      const secondsLeft = exp - nowSec;

      // Refresh token if it has less than 4 hours remaining
      if (tokenFromCookie && secondsLeft > 0 && secondsLeft < 4 * 60 * 60) {
        const fresh = jwtLib.sign({ user: req.user }, jwtSecret, { expiresIn: "24h" });
        res.cookie("token", fresh, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
      }

      // Check subdomain access permissions
      const hostname = req.get('host') || req.hostname;
      const userEmail = req.user?.email?.toLowerCase() || '';
      
      // Extract subdomain from hostname (e.g., 'eastside' from 'eastside.acmeops.com')
      let subdomain = 'production'; // default
      if (hostname) {
        const parts = hostname.split('.');
        if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'join') {
          subdomain = parts[0];
        } else if (parts[0] === 'join' || parts.length === 2) {
          subdomain = 'production'; // join.acmeops.com or acmeops.com
        }
      }

      // Define location-based email restrictions
      // Users with eastside in their email (e.g., eastside@acmeops.com) can only access eastside subdomain
      // Users with westside in their email (e.g., westside@acmeops.com) can only access westside subdomain
      // Main production users can access production (join.acmeops.com)
      
      // Check for location-specific email patterns
      // Emails like "eastside@acmeops.com" or "aliyah@eastside.acmeops.com" should be restricted
      const emailParts = userEmail.split('@');
      const emailLocal = emailParts[0]?.toLowerCase() || '';
      const emailDomain = emailParts[1]?.toLowerCase() || '';
      
      const isEastsideUser = emailLocal === 'eastside' || emailDomain.includes('eastside');
      const isWestsideUser = emailLocal === 'westside' || emailDomain.includes('westside');
      
      // Block access if:
      // - Eastside user tries to access non-Eastside subdomain
      // - Westside user tries to access non-Westside subdomain
      // - Location-specific user tries to access production
      if (isEastsideUser && subdomain !== 'eastside') {
        logger.info(`🚫 Access denied: Eastside user ${userEmail} attempted to access ${subdomain} subdomain`);
        return res.status(403).json({ 
          msg: "Access denied. This account is restricted to eastside.acmeops.com" 
        });
      }
      
      if (isWestsideUser && subdomain !== 'westside') {
        logger.info(`🚫 Access denied: Westside user ${userEmail} attempted to access ${subdomain} subdomain`);
        return res.status(403).json({ 
          msg: "Access denied. This account is restricted to westside.acmeops.com" 
        });
      }

      // Allow access for production users (they can access any subdomain)
      // This includes admin users and main branch users
      
      return next();
    } catch (err) {
      logger.error({ data: {
        error: err.message,
        name: err.name,
        hasToken: !!token,
        tokenLength: token?.length,
        hostname: req.get('host') || req.hostname,
        path: req.path
      } }, 'JWT verification failed:');
      return res.status(401).json({ msg: "Token is not valid" });
    }
  };
  const createAxiosInstance = () => {
    return axios.create({
      baseURL: GRAVITY_FORMS_API_BASE_URL,
      auth: {
        username: process.env.GRAVITY_CONSUMER_KEY,
        password: process.env.GRAVITY_CONSUMER_SECRET,
      },
    });
  };
  const fetchAllFormEntries = async (formId, axiosInstance) => {
    let allEntries = [];
    let currentPage = 1;
    const pageSize = 100;
    let totalEntries = 0;

    try {
      while (true) {
        const response = await axiosInstance.get("entries", {
          params: {
            form_id: formId,
            "paging[page_size]": pageSize,
            "paging[current_page]": currentPage,
          },
          headers: {
            "Content-Type": "application/json",
          },
        });

        const { entries, total_count } = response.data;

        logger.info({ data: entries.length }, "Fetched entries for current page:");
        logger.info({ data: currentPage }, "Current page:");
        logger.info({ data: total_count }, "Total count of all matching entries:");

        if (!entries || entries.length === 0) {
          logger.info("No more entries to fetch.");
          break;
        }

        allEntries = [...allEntries, ...entries];
        totalEntries += entries.length;
        logger.info(`Total entries fetched so far: ${totalEntries}`);

        if (totalEntries >= total_count) {
          logger.info("All entries have been fetched.");
          break;
        }

        currentPage += 1;
      }

      logger.info(`All entries fetched: ${allEntries.length} total`);
      return allEntries;
    } catch (error) {
      logger.error({ err: error }, "Error fetching Gravity Forms entries:");
      throw error;
    }
  };
  const saveEntriesToDB = async (entries, formId) => {
    const tableName = "gravity_bookings";
    try {
      logger.info({ data: JSON.stringify(entries, null, 2) }, "All Gravity Forms entries:");
      logger.info({ data: JSON.stringify(entries.slice(0, 5), null, 2) }, "First 5 Gravity Forms entries:");

      for (const entry of entries) {
        logger.info({ data: JSON.stringify(entry, null, 2) }, "Processing Gravity Forms entry:");
        logger.info({ data: Object.keys(entry) }, "Entry keys:");

        const uniqueEntryId = entry.id;

        const {
          130: utm_content = null,
          136: utm_term = null,
          135: utm_source = null,
          134: utm_medium = null,
          131: utm_campaign = null,
          125: payment_successful = null,
          133: gclid = null,
          62: referral_code = null,
          117: tutor_referral_code = null,
          63: event_code = null,
          129: campaign_code = null,
          69: booking_type = null,
          70: price = null,
          71: booking_type_price = null,
          113: trial = null,
          1: name = null,
          1.2: prefix = null,
          1.3: first_name = null,
          1.4: middle_name = null,
          1.6: last_name = null,
          1.8: suffix = null,
          3: email = null,
          4: phone = null,
          118: stripe_customer_id = null,
          119: pm = null,
          121: pmc = null,
          122: amt = null,
          37: student_type = null,
          98: number_of_students = null,
          109: current_school_student_1 = null,
          108: current_school_student_2 = null,
          13: timezone = null,
          date_created = null,
        } = entry || {};

        const price_value = price === "" ? null : price;
        const booking_type_price_value =
          booking_type_price === "" ? null : booking_type_price;
        const amt_value = amt === "" ? null : amt;
        const number_of_students_value =
          number_of_students === "" ? null : number_of_students;

        const values = [
          uniqueEntryId,
          utm_content,
          utm_term,
          utm_source,
          utm_medium,
          utm_campaign,
          payment_successful,
          gclid,
          referral_code,
          tutor_referral_code,
          event_code,
          campaign_code,
          booking_type,
          price_value,
          booking_type_price_value,
          trial,
          name,
          prefix,
          first_name,
          middle_name,
          last_name,
          suffix,
          email,
          phone,
          stripe_customer_id,
          pm,
          pmc,
          amt_value,
          student_type,
          number_of_students_value,
          current_school_student_1,
          current_school_student_2,
          timezone,
          date_created,
        ];

        logger.info({ data: values }, "Values to insert:");

        const queryString = `
        INSERT INTO ${tableName} (
          entry_id, utm_content, utm_term, utm_source, utm_medium, utm_campaign, payment_successful, gclid,
          referral_code, tutor_referral_code, event_code, campaign_code, booking_type, price, booking_type_price,
          trial, name, prefix, first_name, middle_name, last_name, suffix, email, phone, stripe_customer_id, pm, pmc,
          amt, student_type, number_of_students, current_school_student_1, current_school_student_2, timezone, date_created
        ) VALUES (
          ${values.map((_, index) => `$${index + 1}`).join(", ")}
        ) ON CONFLICT DO NOTHING
      `;
        logger.info({ data: queryString }, "Query String:");

        await pool.query(queryString, values);
      }
    } catch (error) {
      logger.error({ err: error }, `Error saving entries to ${tableName}:`);
    }
  };
  async function fetchDataWithBrowser(url) {
    if (!puppeteer || !chromium) {
      throw new Error('Puppeteer/Chromium not available for browser operations');
    }
    const browser = await puppeteer.launch({
      headless: chromium.headless,
      executablePath: await chromium.executablePath(),
      args: chromium.args
    });
    const page = await browser.newPage();
    await page.goto(url, {
      waitUntil: "networkidle2",
    });
    const data = await page.content();
    await browser.close();
    return data;
  }
  const fetchAllDataInBatches = async (
    endpoint,
    entityType,
    pageSize = 100,
    batchSize = 200,
    delayBetweenBatches = 5000
  ) => {
    let results = [];
    let currentBatch = [];
    let url = `${endpoint}/?page_size=${pageSize}`;
    let currentPage = 1;

    try {
      while (url && currentPage <= 10) {
        logger.info(`Fetching page ${currentPage} from ${url}...`);
        const response = await tutorCruncherAPI.get(url);

        currentBatch = [...currentBatch, ...response.data.results];
        logger.info(`Fetched ${response.data.results.length} records, current batch size: ${currentBatch.length}`);

        if (currentBatch.length >= batchSize) {
          logger.info(`Processing batch of size ${currentBatch.length} for ${entityType}`);
          await processBatch(currentBatch, entityType);
          currentBatch = [];
          await delay(delayBetweenBatches);
        }

        url = response.data.next;
        currentPage++;
      }

      if (currentBatch.length > 0) {
        logger.info(`Processing final batch of size ${currentBatch.length} for ${entityType}`);
        await processBatch(currentBatch, entityType);
      }

      return results;
    } catch (error) {
      logger.error({ err: error }, `Error fetching ${entityType}:`);
      return [];
    }
  };
  const processBatch = async (batchData, entityType) => {
    try {
      logger.info(`Processing batch of ${batchData.length} items for ${entityType}...`);

      if (entityType === "clients") {
        await insertOrUpdateClients(batchData);
      } else if (entityType === "services") {
        await insertOrUpdateServices(batchData);
      } else if (entityType === "recipients") {
        await insertOrUpdateRecipients(batchData);
      } else if (entityType === "appointments") {
        await insertOrUpdateAppointments(batchData);
      } else {
        logger.warn(`Unknown entity type: ${entityType}`);
      }

      logger.info(`Batch processing completed for ${entityType}.`);
    } catch (error) {
      logger.error({ err: error }, `Error processing batch for ${entityType}:`);
    }
  };
  const fetchAllDataWithRateCheck = async (endpoint) => {
    let results = [];
    let url = `${endpoint}/`;

    try {
      while (url) {
        const response = await tutorCruncherAPI.get(url);
        await checkRateLimitHeaders(response);
        results = [...results, ...response.data.results];
        url = response.data.next;
        await delay(2000);
      }
      return results;
    } catch (error) {
      logger.error({ err: error }, `Error fetching ${endpoint}:`);
      return [];
    }
  };
  const checkRateLimitHeaders = async (response) => {
    const remaining = parseInt(response.headers["x-ratelimit-remaining"], 10);
    const reset = parseInt(response.headers["x-ratelimit-reset"], 10);

    if (remaining <= 1 && reset) {
      const waitTime = reset * 1000;
      logger.info(`Rate limit hit, waiting for ${waitTime / 1000} seconds...`);
      await delay(waitTime);
    }
  };
  const shouldUpdateClient = async (client) => {
    const query = "SELECT * FROM clients WHERE client_id = $1";
    const result = await pool.query(query, [client.id]);

    const user = client.user || {};
    const first_name = user.first_name || "N/A";
    const last_name = user.last_name || "N/A";
    const email = user.email || "N/A";
    const mobile = user.mobile || "N/A";
    const status = client.status || "N/A";

    if (result.rows.length > 0) {
      const existingClient = result.rows[0];
      return (
        first_name !== existingClient.first_name ||
        last_name !== existingClient.last_name ||
        email !== existingClient.email ||
        mobile !== existingClient.mobile ||
        status !== existingClient.status
      );
    }
    return true;
  };
  const fetchAllClientsSummary = async () => {
    let results = [];
    let url = `clients/`;

    try {
      logger.info(`Fetching client summary data from TutorCruncher API...`);
      while (url) {
        const response = await tutorCruncherAPI.get(url);
        results = [...results, ...response.data.results];
        url = response.data.next;
      }
      logger.info(`Fetched ${results.length} client summaries`);
      return results;
    } catch (error) {
      logger.error({ err: error }, `Error fetching client summaries:`);
      return [];
    }
  };
  const fetchClientById = async (clientId) => {
    try {
      const response = await tutorCruncherAPI.get(`clients/${clientId}`);
      logger.info({ data: response.data }, `Full client data for ID ${clientId}:`);
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Error fetching client ${clientId}:`);
      return null;
    }
  };
  const insertOrUpdateClients = async (clients) => {
    const query = `
    INSERT INTO clients (client_id, first_name, last_name, email, status, created_at, updated_at)
    VALUES 
    ${clients
      .map(
        (_, index) =>
          `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${
            index * 5 + 4
          }, $${index * 5 + 5}, NOW(), NOW())`
      )
      .join(", ")}
    ON CONFLICT (client_id) DO UPDATE 
    SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email, 
    status = EXCLUDED.status, updated_at = NOW();
  `;

    const params = [];
    clients.forEach((client) => {
      params.push(
        client.id,
        client.first_name,
        client.last_name,
        client.email,
        client.status || "active"
      );
    });

    try {
      await pool.query(query, params);
      logger.info(`Inserted/Updated ${clients.length} clients successfully.`);
    } catch (error) {
      logger.error({ err: error }, "Error inserting/updating clients:");
    }
  };
  const fetchAllClientsInParallel = async () => {
    const pageSize = 100;
    const totalClients = 12714;
    const totalPages = Math.ceil(totalClients / pageSize);
    const clientRequests = [];

    for (let page = 1; page <= totalPages; page++) {
      clientRequests.push(tutorCruncherAPI.get(`/clients/?page=${page}`));
    }

    try {
      const clientResponses = await Promise.all(clientRequests);
      const allClients = clientResponses.flatMap(
        (response) => response.data.results
      );

      logger.info(`Fetched ${allClients.length} clients in parallel.`);
      return allClients;
    } catch (error) {
      logger.error({ err: error }, "Error fetching clients:");
      return [];
    }
  };
  const shouldUpdateService = async (service) => {
    const query = "SELECT * FROM services WHERE service_id = $1";
    const result = await pool.query(query, [service.id]);

    if (result.rows.length > 0) {
      const existingService = result.rows[0];
      return (
        service.name !== existingService.name ||
        service.description !== existingService.description ||
        service.dft_charge_type !== existingService.dft_charge_type ||
        service.dft_charge_rate !== existingService.dft_charge_rate ||
        service.dft_contractor_rate !== existingService.dft_contractor_rate ||
        service.status !== existingService.status
      );
    }
    return true;
  };
  const insertOrUpdateServices = async (services) => {
    const serviceQuery = `
    INSERT INTO services (
      service_id, name, description, dft_charge_type, dft_charge_rate, dft_contractor_rate,
      status, labels, created_at, updated_at,
      dft_location_address, dft_location_lat, dft_location_lng, inactivity_time,
      desired_skills, sr_premium, conjobs_count, rcrs_count, tc_created_at, latest_apt_ahc
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (service_id) DO UPDATE
    SET name = EXCLUDED.name, description = EXCLUDED.description, dft_charge_type = EXCLUDED.dft_charge_type,
    dft_charge_rate = EXCLUDED.dft_charge_rate, dft_contractor_rate = EXCLUDED.dft_contractor_rate,
    status = EXCLUDED.status, labels = EXCLUDED.labels, updated_at = EXCLUDED.updated_at,
    dft_location_address = EXCLUDED.dft_location_address, dft_location_lat = EXCLUDED.dft_location_lat,
    dft_location_lng = EXCLUDED.dft_location_lng, inactivity_time = EXCLUDED.inactivity_time,
    desired_skills = EXCLUDED.desired_skills, sr_premium = EXCLUDED.sr_premium,
    conjobs_count = EXCLUDED.conjobs_count, rcrs_count = EXCLUDED.rcrs_count,
    tc_created_at = EXCLUDED.tc_created_at, latest_apt_ahc = EXCLUDED.latest_apt_ahc;
  `;

    for (const service of services) {
      const serviceDetails = await fetchServiceDetailsById(service.id);

      if (!serviceDetails) {
        logger.info(`Skipping service ${service.id} due to missing details.`);
        continue;
      }

      const {
        id,
        name,
        description,
        dft_charge_type,
        dft_charge_rate,
        dft_contractor_rate,
        status,
        created,
        last_updated,
      } = serviceDetails;

      const labelNames = serviceDetails.labels.map((label) => label.name);

      // Extract enriched fields from TC detail response
      const dftLocation = serviceDetails.dft_location || {};
      const locationAddress = dftLocation.address || dftLocation.name || null;
      const locationLat = dftLocation.latitude || null;
      const locationLng = dftLocation.longitude || null;
      const inactivityTime = serviceDetails.inactivity_time || null;
      const desiredSkills = serviceDetails.desired_skills || [];
      const srPremium = serviceDetails.sr_premium || 0;
      const conjobsCount = Array.isArray(serviceDetails.conjobs) ? serviceDetails.conjobs.length : 0;
      const rcrsCount = Array.isArray(serviceDetails.rcrs) ? serviceDetails.rcrs.length : 0;
      const tcCreatedAt = serviceDetails.created || null;
      const latestAptAhc = serviceDetails.latest_apt_ahc || null;

      try {
        await pool.query(serviceQuery, [
          id,
          name,
          description,
          dft_charge_type,
          dft_charge_rate,
          dft_contractor_rate,
          status,
          JSON.stringify(labelNames),
          created,
          last_updated,
          locationAddress,
          locationLat,
          locationLng,
          inactivityTime,
          JSON.stringify(desiredSkills),
          srPremium,
          conjobsCount,
          rcrsCount,
          tcCreatedAt,
          latestAptAhc,
        ]);

        await insertServiceContractors(serviceDetails.conjobs, id);
        await insertServiceRecipients(serviceDetails.rcrs, id);
      } catch (error) {
        logger.error({ err: error }, `Error inserting/updating service ${id}:`);
      }
    }
  };
  const insertRecipients = async (recipients) => {
    const query = `
      INSERT INTO recipients (recipient_id, first_name, last_name, email, street, town, country, postcode, latitude, longitude, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (recipient_id) DO UPDATE 
      SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, email = EXCLUDED.email, 
      street = EXCLUDED.street, town = EXCLUDED.town, country = EXCLUDED.country, 
      postcode = EXCLUDED.postcode, updated_at = EXCLUDED.updated_at;
    `;

    for (const recipient of recipients) {
      await pool.query(query, [
        recipient.id,
        recipient.user.first_name,
        recipient.user.last_name,
        recipient.user.email,
        recipient.user.street,
        recipient.user.town,
        recipient.user.country,
        recipient.user.postcode,
        recipient.user.latitude,
        recipient.user.longitude,
        recipient.user.date_created,
        recipient.last_updated,
      ]);
    }
  };
  const shouldUpdateAppointment = async (appointment) => {
    const query = "SELECT * FROM appointments WHERE appointment_id = $1";
    const result = await pool.query(query, [appointment.id]);

    if (result.rows.length > 0) {
      const existingAppointment = result.rows[0];
      return (
        appointment.start !== existingAppointment.start ||
        appointment.finish !== existingAppointment.finish ||
        appointment.units !== existingAppointment.units ||
        appointment.topic !== existingAppointment.topic ||
        appointment.location !== existingAppointment.location ||
        appointment.status !== existingAppointment.status ||
        appointment.charge_type !== existingAppointment.charge_type ||
        appointment.service.id !== existingAppointment.service_id
      );
    }
    return true;
  };
  const insertOrUpdateAppointments = async (appointments) => {
    const query = `
        INSERT INTO appointments (appointment_id, start, finish, units, topic, location, status, charge_type, service_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (appointment_id) DO UPDATE 
        SET start = EXCLUDED.start, finish = EXCLUDED.finish, units = EXCLUDED.units, topic = EXCLUDED.topic, 
        location = EXCLUDED.location, status = EXCLUDED.status, charge_type = EXCLUDED.charge_type, 
        service_id = EXCLUDED.service_id, updated_at = NOW();
    `;

    for (const appointment of appointments) {
      const appointmentDetails = await fetchAppointmentById(appointment.id);

      if (appointmentDetails) {
        const updateRequired = await shouldUpdateAppointment(
          appointmentDetails
        );

        if (updateRequired) {
          await pool.query(query, [
            appointmentDetails.id,
            appointmentDetails.start,
            appointmentDetails.finish,
            appointmentDetails.units,
            appointmentDetails.topic,
            appointmentDetails.location,
            appointmentDetails.status,
            appointmentDetails.charge_type,
            appointmentDetails.service.id,
          ]);

          await insertAppointmentRecipients(
            appointmentDetails.rcras,
            appointmentDetails.id
          );
          await insertAppointmentContractors(
            appointmentDetails.cjas,
            appointmentDetails.id
          );
        }
      }

      await delay(1000);
    }
  };
  const shouldUpdateRecipient = async (recipient) => {
    const query = "SELECT * FROM recipients WHERE recipient_id = $1";
    const result = await pool.query(query, [recipient.id]);

    const user = recipient.user || {};
    const first_name = user.first_name || "N/A";
    const last_name = user.last_name || "N/A";
    const email = user.email || "N/A";
    const street = user.street || "N/A";
    const town = user.town || "N/A";
    const country = user.country || "N/A";
    const postcode = user.postcode || "N/A";

    if (result.rows.length > 0) {
      const existingRecipient = result.rows[0];
      return (
        first_name !== existingRecipient.first_name ||
        last_name !== existingRecipient.last_name ||
        email !== existingRecipient.email ||
        street !== existingRecipient.street ||
        town !== existingRecipient.town ||
        country !== existingRecipient.country ||
        postcode !== existingRecipient.postcode
      );
    }

    return true;
  };
  const fetchRecipientById = async (recipientId) => {
    try {
      const response = await tutorCruncherAPI.get(`recipients/${recipientId}`);
      logger.info({ data: response.data }, `Full recipient data for ID ${recipientId}:`);
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Error fetching recipient ${recipientId}:`);
      return null;
    }
  };
  const insertOrUpdateRecipients = async (recipients) => {
    logger.info(`Inserting/Updating ${recipients.length} recipients`);

    const query = `
    INSERT INTO recipients (
      recipient_id, first_name, last_name, email, mobile, phone, street, state, town, country, postcode, 
      latitude, longitude, timezone, title, photo, default_rate, academic_year, calendar_colour,
      date_of_birth, labels, extra_attrs, paying_client_id, associated_clients, date_created, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW()
    )
    ON CONFLICT (recipient_id) DO UPDATE 
    SET 
      first_name = EXCLUDED.first_name, 
      last_name = EXCLUDED.last_name, 
      email = EXCLUDED.email,
      mobile = EXCLUDED.mobile,
      phone = EXCLUDED.phone,
      street = EXCLUDED.street,
      state = EXCLUDED.state,
      town = EXCLUDED.town, 
      country = EXCLUDED.country, 
      postcode = EXCLUDED.postcode,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      timezone = EXCLUDED.timezone,
      title = EXCLUDED.title,
      photo = EXCLUDED.photo,
      default_rate = EXCLUDED.default_rate,
      academic_year = EXCLUDED.academic_year,
      calendar_colour = EXCLUDED.calendar_colour,
      date_of_birth = EXCLUDED.date_of_birth,
      labels = EXCLUDED.labels,
      extra_attrs = EXCLUDED.extra_attrs,
      paying_client_id = EXCLUDED.paying_client_id,
      associated_clients = EXCLUDED.associated_clients,
      date_created = EXCLUDED.date_created,
      updated_at = NOW();
  `;

    for (const recipientSummary of recipients) {
      const recipient = await fetchRecipientById(recipientSummary.id);

      if (!recipient) {
        logger.info(`Skipping recipient ${recipientSummary.id} due to failed fetch`);
        continue;
      }

      // Extract date of birth from extra_attrs
      let date_of_birth = null;
      if (recipient.extra_attrs && Array.isArray(recipient.extra_attrs)) {
        const dobAttr = recipient.extra_attrs.find(attr => attr.machine_name === 'sr_dob' && attr.value);
        if (dobAttr && dobAttr.value) {
          try {
            date_of_birth = new Date(dobAttr.value);
            // Validate date
            if (isNaN(date_of_birth.getTime())) {
              date_of_birth = null;
            }
          } catch (e) {
            logger.warn(`Invalid date_of_birth for recipient ${recipient.id}: ${dobAttr.value}`);
          }
        }
      }

      // Handle both old API structure (with user object) and new flat structure
      const first_name = recipient.first_name || (recipient.user && recipient.user.first_name) || null;
      const last_name = recipient.last_name || (recipient.user && recipient.user.last_name) || null;
      const email = recipient.email || (recipient.user && recipient.user.email) || null;
      const mobile = recipient.mobile || (recipient.user && recipient.user.mobile) || null;
      const phone = recipient.phone || (recipient.user && recipient.user.phone) || null;
      const street = recipient.street || (recipient.user && recipient.user.street) || null;
      const state = recipient.state || (recipient.user && recipient.user.state) || null;
      const town = recipient.town || (recipient.user && recipient.user.town) || null;
      const country = recipient.country || (recipient.user && recipient.user.country) || null;
      const postcode = recipient.postcode || (recipient.user && recipient.user.postcode) || null;
      const latitude = recipient.latitude || (recipient.user && recipient.user.latitude) || null;
      const longitude = recipient.longitude || (recipient.user && recipient.user.longitude) || null;
      const timezone = recipient.timezone || (recipient.user && recipient.user.timezone) || null;
      const title = recipient.title || (recipient.user && recipient.user.title) || null;
      const photo = recipient.photo || null;
      const default_rate = recipient.default_rate || null;
      const academic_year = recipient.academic_year || null;
      const calendar_colour = recipient.calendar_colour || null;
      const labels = recipient.labels ? JSON.stringify(recipient.labels) : null;
      const extra_attrs = recipient.extra_attrs ? JSON.stringify(recipient.extra_attrs) : null;
      const paying_client_id = recipient.paying_client?.id || null;
      const associated_clients = recipient.associated_clients ? JSON.stringify(recipient.associated_clients) : null;
      const date_created = recipient.date_created 
        ? new Date(recipient.date_created)
        : (recipient.user && recipient.user.date_created ? new Date(recipient.user.date_created) : null);

      try {
        logger.info(`Updating recipient: ${recipient.id} (${first_name} ${last_name})`);
        await pool.query(query, [
          recipient.id,
          first_name,
          last_name,
          email,
          mobile,
          phone,
          street,
          state,
          town,
          country,
          postcode,
          latitude,
          longitude,
          timezone,
          title,
          photo,
          default_rate,
          academic_year,
          calendar_colour,
          date_of_birth,
          labels,
          extra_attrs,
          paying_client_id,
          associated_clients,
          date_created,
        ]);
      } catch (error) {
        logger.error({ err: error }, `Error inserting/updating recipient ${recipient.id}:`);
      }
    }
  };
  const fetchAllLabelIds = async () => {
    let labels = [];
    let url = `labels/`;
    let currentPage = 1;

    try {
      while (url) {
        logger.info(`Fetching labels, page ${currentPage}`);
        const response = await tutorCruncherAPI.get(url);
        labels = labels.concat(response.data.results);
        url = response.data.next;
        currentPage++;
      }

      return labels
        .filter((label) => label.id !== 262368)
        .map((label) => label.id);
    } catch (error) {
      logger.error({ err: error }, "Error fetching labels:");
      return [];
    }
  };
  // Sync Labels from TutorCruncher into local labels table
  async function syncLabels() {
    console.time("syncLabels");
    const client = await pool.connect();
    let nextUrl = "/labels/?page_size=100";
    let page = 1;
    try {
      while (nextUrl) {
        logger.info(`[syncLabels] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        for (const lbl of data.results) {
          // TutorCruncher uses 'colour' field, not 'color'
          const color = lbl.colour || lbl.color || null;
          
          await client.query(
            `INSERT INTO labels (id, name, color, active, remote_last_updated, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               color = EXCLUDED.color,
               active = EXCLUDED.active,
               remote_last_updated = EXCLUDED.remote_last_updated,
               updated_at = NOW();`,
            [
              lbl.id,
              lbl.name,
              color, // Use colour from API
              lbl.active !== false,
              lbl.last_updated || null,
            ]
          );
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }
      logger.info(`[syncLabels]  All labels synced`);
    } finally {
      client.release();
      console.timeEnd("syncLabels");
    }
  }

  // Sync Clients from TutorCruncher
  // NOTE: For NEW clients, fetches full details to capture labels (list endpoint doesn't include them)
  async function syncClients() {
    console.time("syncClients");
    const client = await pool.connect();
    let nextUrl = "/clients/?page_size=100";
    let page = 1;
    try {
      while (nextUrl) {
        logger.info(`[syncClients] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        // Get list of client IDs to check which ones are new
        const ids = data.results.map((c) => c.id);
        const { rows: existingClients } = await client.query(
          `SELECT client_id FROM clients WHERE client_id = ANY($1)`,
          [ids]
        );
        // Convert client_id strings to integers for consistent comparison with TC API ids (which are integers)
        const existingIds = new Set(existingClients.map((r) => parseInt(r.client_id, 10)));

        for (let tcClient of data.results) {
          const isNewClient = !existingIds.has(tcClient.id);

          // For NEW clients, fetch full details to get labels
          // The list endpoint doesn't include: labels, phone, mobile, etc.
          if (isNewClient) {
            try {
              logger.info(`[syncClients]   🆕 New client ${tcClient.id} (${tcClient.first_name} ${tcClient.last_name}) - fetching full details`);
              const { data: fullClient } = await rateLimitRetry(() => limitedGet(`/clients/${tcClient.id}/`));
              tcClient = fullClient; // Replace list data with full details
            } catch (fetchErr) {
              logger.error({ error: fetchErr.message }, `[syncClients]   ⚠️ Failed to fetch details for new client ${tcClient.id}:`);
              // Continue with list data if fetch fails
            }
          }

          // Check if labels exist in the response (only from detail endpoint)
          const hasLabels = 'labels' in tcClient;
          const labelsJson = hasLabels && tcClient.labels ? JSON.stringify(tcClient.labels) : null;

          await client.query(
            `INSERT INTO clients (client_id, first_name, last_name, email, street, town, postcode, status, labels, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
             ON CONFLICT (client_id) DO UPDATE SET
               first_name = EXCLUDED.first_name,
               last_name = EXCLUDED.last_name,
               email = EXCLUDED.email,
               street = EXCLUDED.street,
               town = EXCLUDED.town,
               postcode = EXCLUDED.postcode,
               status = COALESCE(EXCLUDED.status, clients.status),
               labels = CASE WHEN $9 IS NOT NULL THEN $9::jsonb ELSE clients.labels END,
               updated_at = NOW();`,
            [
              tcClient.id,
              tcClient.first_name,
              tcClient.last_name,
              tcClient.email,
              tcClient.street || null,
              tcClient.town || null,
              tcClient.postcode || null,
              tcClient.status || null,
              labelsJson
            ]
          );
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }
      logger.info(`[syncClients] All clients synced`);
    } finally {
      client.release();
      console.timeEnd("syncClients");
    }
  }

  // Sync Pipeline Stages into local table
  async function syncPipelineStages() {
    console.time("syncPipelineStages");
    const client = await pool.connect();
    let nextUrl = "/pipeline-stages/?page_size=100";
    let page = 1;
    try {
      while (nextUrl) {
        logger.info(`[syncPipelineStages] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        for (const stg of data.results) {
          await client.query(
            `INSERT INTO pipeline_stages (id, name, pipeline, order_index, active, remote_last_updated, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               pipeline = EXCLUDED.pipeline,
               order_index = EXCLUDED.order_index,
               active = EXCLUDED.active,
               remote_last_updated = EXCLUDED.remote_last_updated,
               updated_at = NOW();`,
            [
              stg.id,
              stg.name,
              (stg.pipeline && (stg.pipeline.name || stg.pipeline)) || null,
              stg.order || null,
              stg.active !== false,
              stg.last_updated || null,
            ]
          );
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }
      logger.info(`[syncPipelineStages]  All pipeline stages synced`);
    } finally {
      client.release();
      console.timeEnd("syncPipelineStages");
    }
  }
  const fetchAllRecipientsSummary = async () => {
    let results = [];
    let url = `recipients/`;

    try {
      logger.info(`Fetching recipient summary data from TutorCruncher API...`);
      while (url) {
        const response = await tutorCruncherAPI.get(url);
        results = [...results, ...response.data.results];
        url = response.data.next;
      }
      logger.info(`Fetched ${results.length} recipient summaries`);
      return results;
    } catch (error) {
      logger.error({ err: error }, `Error fetching recipient summaries:`);
      return [];
    }
  };
  const fetchAppointmentById = async (appointmentId) => {
    try {
      const response = await tutorCruncherAPI.get(
        `appointments/${appointmentId}`
      );
      logger.info({ data: JSON.stringify(response.data, null, 2) }, `Full appointment data for ID ${appointmentId}:`);
      return response.data;
    } catch (error) {
      return null;
    }
  };
  const insertAppointmentRecipients = async (rcras, appointmentId) => {
    if (!Array.isArray(rcras)) {
      logger.warn({ data: rcras }, `rcras is not iterable for appointment ${appointmentId}:`);
      return;
    }

    if (rcras.length === 0) return;

    // Batch insert all recipients
    const values = [];
    const params = [];
    rcras.forEach((rcra, i) => {
      const offset = i * 7;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
      params.push(
        appointmentId,
        rcra.recipient,
        rcra.recipient_name,
        rcra.paying_client,
        rcra.paying_client_name,
        rcra.charge_rate,
        rcra.status
      );
    });

    const query = `
      INSERT INTO appointment_recipients (appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status)
      VALUES ${values.join(', ')}
      ON CONFLICT (appointment_id, recipient_id) DO UPDATE
      SET status = EXCLUDED.status
    `;

    await pool.query(query, params);
  };
  const insertAppointmentContractors = async (cjas, appointmentId) => {
    if (!Array.isArray(cjas)) {
      logger.warn({ data: cjas }, `cjas is not iterable for appointment ${appointmentId}:`);
      return;
    }

    if (cjas.length === 0) return;

    // Batch insert all contractors
    const values = [];
    const params = [];
    cjas.forEach((cja, i) => {
      const offset = i * 4;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(
        appointmentId,
        cja.contractor,
        cja.name,
        cja.pay_rate
      );
    });

    const query = `
      INSERT INTO appointment_contractors (appointment_id, contractor_id, contractor_name, pay_rate)
      VALUES ${values.join(', ')}
      ON CONFLICT (appointment_id, contractor_id) DO NOTHING
    `;

    await pool.query(query, params);
  };
  const fetchServiceById = async (serviceId) => {
    try {
      const response = await tutorCruncherAPI.get(`services/${serviceId}`);
      logger.info({ data: response.data }, `Full service data for ID ${serviceId}:`);

      if (!response.data) {
        logger.warn(`No service data found for service ID ${serviceId}`);
        return null;
      }

      const serviceData = response.data;
      const recipients = serviceData.rcrs || [];
      const contractors = serviceData.conjobs || [];

      const labelNames = serviceData.labels.map((label) => label.name);

      return { serviceData, recipients, contractors, labelNames };
    } catch (error) {
      logger.error({ err: error }, `Error fetching service ${serviceId}:`);
      return null;
    }
  };
  const insertServiceRecipients = async (recipients, serviceId) => {
    if (!Array.isArray(recipients)) {
      logger.warn({ data: recipients }, `recipients is not iterable for service ${serviceId}:`);
      return;
    }

    if (recipients.length === 0) return;

    // Batch insert all service recipients
    const values = [];
    const params = [];
    recipients.forEach((recipient, i) => {
      const offset = i * 6;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
      params.push(
        serviceId,
        recipient.recipient,
        recipient.recipient_name,
        recipient.paying_client,
        recipient.paying_client_name,
        recipient.charge_rate
      );
    });

    const query = `
      INSERT INTO service_recipients (service_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate)
      VALUES ${values.join(', ')}
      ON CONFLICT (service_id, recipient_id) DO NOTHING
    `;

    await pool.query(query, params);
  };
  const insertServiceContractors = async (contractors, serviceId) => {
    if (!Array.isArray(contractors)) {
      logger.warn({ data: contractors }, `contractors is not iterable for service ${serviceId}:`);
      return;
    }

    if (contractors.length === 0) return;

    // Batch insert all service contractors
    const values = [];
    const params = [];
    contractors.forEach((contractor, i) => {
      const offset = i * 4;
      values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      params.push(
        serviceId,
        contractor.contractor,
        contractor.name,
        contractor.pay_rate
      );
    });

    const query = `
      INSERT INTO service_contractors (service_id, contractor_id, contractor_name, pay_rate)
      VALUES ${values.join(', ')}
      ON CONFLICT (service_id, contractor_id) DO NOTHING
    `;

    await pool.query(query, params);
  };
  const delay =
    injectedDelay ||
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const rateLimitRetry =
    injectedRateLimitRetry ||
    (async (fn, retries = 5, delayTime = 20000) => {
      try {
        const response = await fn();
        return response;
      } catch (error) {
        if (error.response && error.response.status === 429) {
          const retryAfter = error.response.headers["retry-after"]
            ? parseInt(error.response.headers["retry-after"], 10) * 20000
            : delayTime;

          logger.info(`Rate limit hit, retrying after ${retryAfter / 20000} seconds...`);

          await delay(retryAfter);

          if (retries > 0) {
            return (injectedRateLimitRetry || rateLimitRetry)(
              fn,
              retries - 1,
              delayTime
            );
          } else {
            throw new Error("Rate limit exceeded after multiple retries.");
          }
        } else {
          throw error;
        }
      }
    });
  const fetchAllServicesInBulk = async () => {
    const pageSize = 100;
    const results = [];
    let url = `/services/?page_size=${pageSize}`;
    let page = 1;

    try {
      while (url) {
        logger.info(`Fetching services page ${page}...`);
        const data = await fetchWithRateLimitHandling(url);
        results.push(...data.results);
        url = data.next;
        page += 1;
      }
      logger.info(`Fetched ${results.length} services.`);
      return results;
    } catch (error) {
      logger.error({ err: error }, "Error fetching services in bulk:");
      return [];
    }
  };
  const fetchServiceDetails = async (serviceId) => {
    try {
      const response = await tutorCruncherAPI.get(`/services/${serviceId}`);
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Error fetching service details for ID ${serviceId}:`);
      return null;
    }
  };
  const fetchServiceDetailsInBatches = async (
    serviceIds,
    batchSize = 10,
    delayBetweenBatches = 1000
  ) => {
    let detailedServices = [];

    for (let i = 0; i < serviceIds.length; i += batchSize) {
      const batchIds = serviceIds.slice(i, i + batchSize);

      try {
        logger.info(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
            serviceIds.length / batchSize
          )}`);

        const batchResults = await Promise.all(
          batchIds.map(async (serviceId) => {
            try {
              const response = await rateLimitRetry(() =>
                tutorCruncherAPI.get(`services/${serviceId}`)
              );
              return response.data;
            } catch (error) {
              logger.error({ err: error }, `Error fetching service ${serviceId}:`);
              return null;
            }
          })
        );

        detailedServices = [
          ...detailedServices,
          ...batchResults.filter(Boolean),
        ];
        await delay(delayBetweenBatches);
      } catch (error) {
        logger.error({ err: error }, `Error processing batch:`);
      }
    }

    logger.info(`Fetched details for ${detailedServices.length} services.`);
    return detailedServices;
  };
  const fetchServicesByLabel = async (
    labelId,
    batchSize = 100,
    delayBetweenBatches = 1000
  ) => {
    let services = [];
    let url = `services/?labels=${labelId}&page_size=${batchSize}`;
    let currentPage = 1;

    try {
      while (url) {
        logger.info(`Fetching services for label ${labelId}, page ${currentPage}`);
        const response = await tutorCruncherAPI.get(url);
        services = services.concat(response.data.results);
        url = response.data.next;
        logger.info(`Fetched ${response.data.results.length} services, total so far: ${services.length}`);
        currentPage++;
        await delay(delayBetweenBatches);
      }

      return services;
    } catch (error) {
      logger.error({ err: error }, `Error fetching services for label ${labelId}:`);
      return [];
    }
  };
  const fetchServiceDetailsById = async (serviceId) => {
    return rateLimitRetry(async () => {
      const response = await tutorCruncherAPI.get(`services/${serviceId}`);
      return response.data;
    });
  };
  const fetchAppointmentsForService = async (serviceId) => {
    let appointments = [];
    let url = `appointments/?service=${serviceId}`;

    try {
      while (url) {
        logger.info(`Fetching appointments for service ${serviceId}...`);
        const response = await rateLimitRetry(() => tutorCruncherAPI.get(url));
        appointments = appointments.concat(response.results);
        url = response.next;
      }
      return appointments;
    } catch (error) {
      logger.error({ err: error }, `Error fetching appointments for service ${serviceId}:`);
      return [];
    }
  };
  const fetchAppointmentDetailsById = async (appointmentId) => {
    try {
      const response = await tutorCruncherAPI.get(
        `appointments/${appointmentId}`
      );
      return response.data;
    } catch (error) {
      logger.error({ err: error }, `Error fetching details for appointment ${appointmentId}:`);
      return null;
    }
  };
  const insertOrUpdateAppointmentsForService = async (
    appointments,
    serviceId
  ) => {
    for (const appointment of appointments) {
      const appointmentDetails = await fetchAppointmentDetailsById(
        appointment.id
      );

      if (!appointmentDetails) {
        logger.info(`Skipping appointment ${appointment.id} due to missing details.`);
        continue;
      }

      await pool.query(
        `
      INSERT INTO appointments (appointment_id, start, finish, units, topic, location, status, charge_type, service_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (appointment_id) DO UPDATE 
      SET start = EXCLUDED.start, finish = EXCLUDED.finish, units = EXCLUDED.units, topic = EXCLUDED.topic, 
      location = EXCLUDED.location, status = EXCLUDED.status, charge_type = EXCLUDED.charge_type, service_id = EXCLUDED.service_id;
    `,
        [
          appointmentDetails.id,
          appointmentDetails.start,
          appointmentDetails.finish,
          appointmentDetails.units,
          appointmentDetails.topic,
          appointmentDetails.location,
          appointmentDetails.status,
          appointmentDetails.charge_type,
          serviceId,
        ]
      );

      await insertAppointmentRecipients(
        appointmentDetails.rcras,
        appointmentDetails.id
      );
      await insertAppointmentContractors(
        appointmentDetails.cjas,
        appointmentDetails.id
      );
    }
  };
  const fetchWithRateLimitHandling = async (url, retries = 5) => {
    try {
      const response = await tutorCruncherAPI.get(url);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        const retryAfter = error.response.headers["retry-after"]
          ? parseInt(error.response.headers["retry-after"], 10) * 1000
          : 1000;
        logger.info(`Rate limit hit, retrying after ${retryAfter / 1000} seconds...`);

        await delay(retryAfter);

        if (retries > 0) {
          return fetchWithRateLimitHandling(url, retries - 1);
        } else {
          throw new Error("Rate limit exceeded after multiple retries");
        }
      } else {
        throw error;
      }
    }
  };
  const fetchAllClientsWithRateLimiting = async () => {
    const pageSize = 100;
    const totalClients = 12714;
    const totalPages = Math.ceil(totalClients / pageSize);
    const results = [];

    try {
      for (let page = 1; page <= totalPages; page++) {
        const url = `/clients/?page=${page}`;
        logger.info(`Fetching page ${page}...`);

        const data = await fetchWithRateLimitHandling(url);
        results.push(...data.results);

        await delay(600);
      }

      logger.info(`Fetched ${results.length} clients.`);
      return results;
    } catch (error) {
      logger.error({ err: error }, "Error fetching clients with rate-limiting:");
      return [];
    }
  };
  const fetchPaginatedData = async (endpoint, pageSize = 100) => {
    let results = [];
    let url = `${endpoint}?page_size=${pageSize}`;
    let page = 1;

    try {
      while (url) {
        logger.info(`Fetching page ${page} from ${url}`);
        const response = await tutorCruncherAPI.get(url);
        const data = response.data;

        results = results.concat(data.results);

        logger.info(`Fetched ${data.results.length} records from page ${page}`);

        url = data.next;
        page += 1;

        if (results.length >= pageSize) {
          logger.info(`Processing a batch of ${results.length} items...`);
          await processBatchDates(results);
          results = [];
        }
      }

      if (results.length > 0) {
        logger.info(`Processing the last batch of ${results.length} items...`);
        await processBatchDates(results);
      }

      logger.info(`All pages fetched successfully.`);
    } catch (error) {
      logger.error({ err: error }, `Error fetching data from ${endpoint}:`);
      throw error;
    }
  };
  const processBatchDates = async (batch) => {
    try {
      const appointmentQuery = `
      INSERT INTO appointments (appointment_id, start, finish, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (appointment_id) DO UPDATE
      SET start = EXCLUDED.start, finish = EXCLUDED.finish, updated_at = NOW();
    `;

      const serviceQuery = `
      INSERT INTO services (service_id, created_at, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (service_id) DO UPDATE
      SET created_at = EXCLUDED.created_at, updated_at = NOW();
    `;

      for (const item of batch) {
        if (item.start && item.finish) {
          logger.info(`Updating appointment: ${item.id}`);
          await pool.query(appointmentQuery, [
            item.id,
            item.start,
            item.finish,
          ]);
        } else if (item.created) {
          logger.info(`Updating service: ${item.id}`);
          await pool.query(serviceQuery, [item.id, item.created]);
        }
      }
      logger.info(`Batch of ${batch.length} items processed successfully.`);
    } catch (error) {
      logger.error({ err: error }, "Error processing batch:");
      throw error;
    }
  };
  const handleAppointmentWebhook = async (event) => {
    const appointmentDetails = event.subject;
    const { id, start, finish, units, topic, status, service, rcras, cjas } =
      appointmentDetails;
    const unitsNum = parseFloat(units);

    try {
      switch (event.action) {
        case "CREATED_AN_APPOINTMENT":
        case "EDITED_AN_APPOINTMENT":
          {
            const id = appointmentDetails.id;
            logger.info(`Creating/updating appointment ${id}`);

            await pool.query(
              `
      INSERT INTO appointments (
        appointment_id, start, finish, units, topic, status, service_id, charge_type, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (appointment_id) DO UPDATE 
      SET start = EXCLUDED.start,
          finish = EXCLUDED.finish,
          units = EXCLUDED.units,
          topic = EXCLUDED.topic,
          status = EXCLUDED.status,
          service_id = EXCLUDED.service_id,
          charge_type = EXCLUDED.charge_type,
          updated_at = NOW();
      `,
              [
                id,
                appointmentDetails.start,
                appointmentDetails.finish,
                appointmentDetails.units,
                appointmentDetails.topic,
                appointmentDetails.status,
                appointmentDetails.service.id,
                appointmentDetails.service.dft_charge_type,
              ]
            );

            if (Array.isArray(appointmentDetails.rcras)) {
              if (appointmentDetails.rcras.length === 0) {
                await pool.query(
                  "DELETE FROM appointment_recipients WHERE appointment_id = $1",
                  [id]
                );
              } else {
                const remainingRecipientIds = appointmentDetails.rcras.map(
                  (r) => r.recipient
                );
                const placeholders = remainingRecipientIds
                  .map((_, i) => `$${i + 2}`)
                  .join(",");
                await pool.query(
                  `DELETE FROM appointment_recipients
           WHERE appointment_id = $1
             AND recipient_id NOT IN (${placeholders})`,
                  [id, ...remainingRecipientIds]
                );
                // Batch insert recipients
                if (appointmentDetails.rcras.length > 0) {
                  const values = [];
                  const params = [];
                  appointmentDetails.rcras.forEach((recipient, i) => {
                    const offset = i * 7;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                    const baseChargeRate = parseFloat(recipient.charge_rate);
                    params.push(
                      id,
                      recipient.recipient,
                      recipient.recipient_name,
                      recipient.paying_client,
                      recipient.paying_client_name,
                      baseChargeRate,
                      recipient.status
                    );
                  });
                  await pool.query(
                    `INSERT INTO appointment_recipients (
                      appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status
                    )
                    VALUES ${values.join(', ')}
                    ON CONFLICT (appointment_id, recipient_id) DO UPDATE
                    SET recipient_name = EXCLUDED.recipient_name,
                        paying_client_id = EXCLUDED.paying_client_id,
                        paying_client_name = EXCLUDED.paying_client_name,
                        charge_rate = EXCLUDED.charge_rate,
                        status = EXCLUDED.status`,
                    params
                  );
                }

                // Trial detection and first paid lesson tracking (only on CREATED_AN_APPOINTMENT)
                if (event.action === "CREATED_AN_APPOINTMENT" && appointmentDetails.rcras && appointmentDetails.rcras.length > 0) {
                  try {
                    // Check if this is a trial lesson (topic or service labels)
                    const topic = appointmentDetails.topic || '';
                    const serviceLabels = appointmentDetails.service?.labels || [];
                    const labelNames = Array.isArray(serviceLabels) ? serviceLabels.map(l => l.name || l) : [];
                    const isTrialTopic = /trial/i.test(topic) || labelNames.some(label => /trial/i.test(label));

                    // Get all unique paying clients from this appointment
                    const payingClients = [...new Set(appointmentDetails.rcras.map(r => r.paying_client).filter(Boolean))];

                    for (const clientId of payingClients) {
                      try {
                        // Get charge rate for this specific client
                        const clientRecipient = appointmentDetails.rcras.find(r => r.paying_client === clientId);
                        const clientChargeRate = clientRecipient ? parseFloat(clientRecipient.charge_rate || 0) : 0;
                        const { TRIAL_PRICE } = require('../config/constants');
                        const isTrialPrice = clientChargeRate > 0 && clientChargeRate <= TRIAL_PRICE;

                        // Check if client exists in our database
                        const clientCheck = await pool.query(
                          'SELECT id, client_id, date_trial_first_lesson, first_paid_lesson_scheduled, club_class_name, labels FROM clients WHERE client_id = $1',
                          [clientId]
                        );

                        if (clientCheck.rows.length > 0) {
                          const client = clientCheck.rows[0];
                          const appointmentDate = new Date(appointmentDetails.start);

                          // Trial detection
                          if ((isTrialTopic || isTrialPrice) && !client.date_trial_first_lesson) {
                            // This is a trial lesson and client doesn't have trial date set
                            await pool.query(
                              `UPDATE clients 
                               SET date_trial_first_lesson = $1, updated_at = NOW()
                               WHERE client_id = $2`,
                              [appointmentDate, clientId]
                            );

                            // Move to Trial Bucket pipeline stage if exists
                            const trialStageResult = await pool.query(
                              `SELECT id FROM pipeline_stages WHERE LOWER(name) LIKE '%trial%' LIMIT 1`
                            );
                            if (trialStageResult.rows.length > 0) {
                              await pool.query(
                                `UPDATE clients SET pipeline_stage_id = $1, updated_at = NOW() WHERE client_id = $2`,
                                [trialStageResult.rows[0].id, clientId]
                              );
                            }

                            logger.info(`✅ Trial lesson detected for client ${clientId}, updated date_trial_first_lesson`);
                          }

                          // First paid lesson detection (non-trial, after trial exists, and not already scheduled)
                          if (!isTrialTopic && !isTrialPrice && client.date_trial_first_lesson && !client.first_paid_lesson_scheduled) {
                            await pool.query(
                              `UPDATE clients
                               SET first_paid_lesson_scheduled = true, updated_at = NOW()
                               WHERE client_id = $1`,
                              [clientId]
                            );
                            logger.info(`✅ First paid lesson scheduled for client ${clientId}`);
                          }

                          // Auto-populate club_class_name from the service name for club prospects
                          if (!client.club_class_name) {
                            const isClubLabel = labelNames.some(l => /^Club\s*-/i.test(l));
                            const isClubClient = client.labels && JSON.stringify(client.labels).includes('Club');
                            if (isClubLabel || isClubClient) {
                              const serviceName = appointmentDetails.service?.name || '';
                              if (serviceName && !/support/i.test(serviceName)) {
                                await pool.query(
                                  `UPDATE clients SET club_class_name = $1, updated_at = NOW() WHERE client_id = $2`,
                                  [serviceName, clientId]
                                );
                                logger.info(`✅ Auto-set club_class_name for client ${clientId}: ${serviceName}`);
                              }
                            }
                          }
                        }
                      } catch (clientError) {
                        logger.error({ error: clientError.message }, `Error processing client ${clientId} for trial/first paid lesson detection:`);
                        // Don't fail the webhook if client processing fails
                      }
                    }
                  } catch (error) {
                    logger.error({ error: error.message }, `Error in trial/first paid lesson detection:`);
                    // Don't fail the webhook if detection fails
                  }
                }
              }
            }

            if (Array.isArray(appointmentDetails.cjas)) {
              if (appointmentDetails.cjas.length === 0) {
                await pool.query(
                  "DELETE FROM appointment_contractors WHERE appointment_id = $1",
                  [id]
                );
              } else {
                const remainingContractorIds = appointmentDetails.cjas.map(
                  (c) => c.contractor
                );
                const placeholders = remainingContractorIds
                  .map((_, i) => `$${i + 2}`)
                  .join(",");
                await pool.query(
                  `DELETE FROM appointment_contractors
           WHERE appointment_id = $1
             AND contractor_id NOT IN (${placeholders})`,
                  [id, ...remainingContractorIds]
                );
                // Batch insert contractors
                if (appointmentDetails.cjas.length > 0) {
                  const values = [];
                  const params = [];
                  appointmentDetails.cjas.forEach((contractor, i) => {
                    const offset = i * 4;
                    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                    const basePayRate = parseFloat(contractor.pay_rate);
                    params.push(
                      id,
                      contractor.contractor,
                      contractor.name,
                      basePayRate
                    );
                  });
                  await pool.query(
                    `INSERT INTO appointment_contractors (
                      appointment_id, contractor_id, contractor_name, pay_rate
                    )
                    VALUES ${values.join(', ')}
                    ON CONFLICT (appointment_id, contractor_id) DO UPDATE
                    SET contractor_name = EXCLUDED.contractor_name,
                        pay_rate = EXCLUDED.pay_rate`,
                    params
                  );
                }
              }
            }
          }
          break;

        case "MARKED_AN_APPOINTMENT_AS_CANCELLED":
        case "MARKED_AN_APPOINTMENT_AS_COMPLETE":
          logger.info(`Updating appointment ${id} status to ${status}`);
          await pool.query(
            `UPDATE appointments
           SET status = $1, updated_at = NOW()
           WHERE appointment_id = $2;`,
            [status, id]
          );

          // First paid lesson complete detection
          if (status === 'complete' && appointmentDetails.rcras && appointmentDetails.rcras.length > 0) {
            try {
              const payingClients = [...new Set(appointmentDetails.rcras.map(r => r.paying_client).filter(Boolean))];
              
              for (const clientId of payingClients) {
                try {
                  const clientCheck = await pool.query(
                    'SELECT id, client_id, first_paid_lesson_scheduled, first_paid_lesson_completed FROM clients WHERE client_id = $1',
                    [clientId]
                  );

                  if (clientCheck.rows.length > 0) {
                    const client = clientCheck.rows[0];
                    
                    // Check if this is the first paid lesson (scheduled but not completed)
                    if (client.first_paid_lesson_scheduled && !client.first_paid_lesson_completed) {
                      // Check if this appointment is not a trial
                      const topic = appointmentDetails.topic || '';
                      const serviceLabels = appointmentDetails.service?.labels || [];
                      const labelNames = Array.isArray(serviceLabels) ? serviceLabels.map(l => l.name || l) : [];
                      const isTrial = /trial/i.test(topic) || labelNames.some(label => /trial/i.test(label));
                      
                      // Get charge rate to check if it's a trial price
                      const clientRecipient = appointmentDetails.rcras.find(r => r.paying_client === clientId);
                      const chargeRate = clientRecipient ? parseFloat(clientRecipient.charge_rate || 0) : 0;
                      const { TRIAL_PRICE } = require('../config/constants');
                      const isTrialPrice = chargeRate > 0 && chargeRate <= TRIAL_PRICE;

                      if (!isTrial && !isTrialPrice) {
                        // This is the first paid lesson completion
                        await pool.query(
                          `UPDATE clients 
                           SET first_paid_lesson_completed = true, updated_at = NOW()
                           WHERE client_id = $1`,
                          [clientId]
                        );

                        // Move to Won pipeline stage if exists
                        const wonStageResult = await pool.query(
                          `SELECT id FROM pipeline_stages WHERE LOWER(name) = 'won' LIMIT 1`
                        );
                        if (wonStageResult.rows.length > 0) {
                          await pool.query(
                            `UPDATE clients SET pipeline_stage_id = $1, updated_at = NOW() WHERE client_id = $2`,
                            [wonStageResult.rows[0].id, clientId]
                          );
                        }

                        logger.info(`✅ First paid lesson completed for client ${clientId}, moved to Won stage`);
                      }
                    }
                  }
                } catch (clientError) {
                  logger.error({ error: clientError.message }, `Error processing client ${clientId} for first paid lesson complete:`);
                  // Don't fail the webhook if client processing fails
                }
              }
            } catch (error) {
              logger.error({ error: error.message }, `Error in first paid lesson complete detection:`);
              // Don't fail the webhook if detection fails
            }
          }
          break;

        case "DELETED_AN_APPOINTMENT":
          logger.info(`Marking appointment ${id} as deleted`);
          await pool.query(
            `UPDATE appointments
           SET is_deleted = TRUE, updated_at = NOW()
           WHERE appointment_id = $1;`,
            [id]
          );
          break;

        case "ADDED_SR_TO_APPOINTMENT":
        case "EDITED_SR_ON_APPOINTMENT":
          logger.info(`Upserting student recipients for appointment ${id}`);
          if (rcras.length > 0) {
            const values = [];
            const params = [];
            rcras.forEach((recipient, i) => {
              const offset = i * 7;
              values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
              const multipliedChargeRate = (parseFloat(recipient.charge_rate) * unitsNum).toFixed(2);
              params.push(
                id,
                recipient.recipient,
                recipient.recipient_name,
                recipient.paying_client,
                recipient.paying_client_name,
                multipliedChargeRate,
                recipient.status
              );
            });
            await pool.query(
              `INSERT INTO appointment_recipients (
                appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status
              ) VALUES ${values.join(', ')}
              ON CONFLICT (appointment_id, recipient_id) DO UPDATE
              SET recipient_name = EXCLUDED.recipient_name,
                  paying_client_id = EXCLUDED.paying_client_id,
                  paying_client_name = EXCLUDED.paying_client_name,
                  charge_rate = EXCLUDED.charge_rate,
                  status = EXCLUDED.status`,
              params
            );
          }
          break;

        case "ADDED_CONTRACTOR_TO_APPOINTMENT":
        case "EDITED_CONTRACTOR_ON_APPOINTMENT":
          logger.info(`Upserting contractor entries for appointment ${id}`);
          if (cjas.length > 0) {
            const values = [];
            const params = [];
            cjas.forEach((contractor, i) => {
              const offset = i * 4;
              values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
              const basePayRate = parseFloat(contractor.pay_rate);
              params.push(id, contractor.contractor, contractor.name, basePayRate);
            });
            await pool.query(
              `INSERT INTO appointment_contractors (
                appointment_id, contractor_id, contractor_name, pay_rate
              ) VALUES ${values.join(', ')}
              ON CONFLICT (appointment_id, contractor_id) DO UPDATE
              SET contractor_name = EXCLUDED.contractor_name,
                  pay_rate = EXCLUDED.pay_rate`,
              params
            );
          }
          break;

        case "REMOVED_SR_FROM_APPOINTMENT": {
          logger.info(`Processing student removal for appointment ${id}`);
          if (!Array.isArray(rcras)) {
            logger.error("rcras is not an array in payload");
            break;
          }
          if (rcras.length === 0) {
            await pool.query(
              `DELETE FROM appointment_recipients WHERE appointment_id = $1;`,
              [id]
            );
            logger.info(`Deleted all student entries for appointment ${id}`);
          } else {
            const remainingRecipientIds = rcras.map((r) => r.recipient);
            const placeholders = remainingRecipientIds
              .map((_, i) => `$${i + 2}`)
              .join(",");
            const query = `
            DELETE FROM appointment_recipients
            WHERE appointment_id = $1
            AND recipient_id NOT IN (${placeholders});
          `;
            await pool.query(query, [id, ...remainingRecipientIds]);
            logger.info(`Synced student recipients for appointment ${id}`);
          }
          break;
        }

        case "REMOVED_CONTRACTOR_FROM_APPOINTMENT": {
          logger.info(`Processing contractor removal for appointment ${id}`);
          if (!Array.isArray(cjas)) {
            logger.error("cjas is not an array in payload");
            break;
          }
          if (cjas.length === 0) {
            await pool.query(
              `DELETE FROM appointment_contractors WHERE appointment_id = $1;`,
              [id]
            );
            logger.info(`Deleted all contractor entries for appointment ${id}`);
          } else {
            const remainingContractorIds = cjas.map((c) => c.contractor);
            const placeholders = remainingContractorIds
              .map((_, i) => `$${i + 2}`)
              .join(",");
            const query = `
            DELETE FROM appointment_contractors
            WHERE appointment_id = $1
            AND contractor_id NOT IN (${placeholders});
          `;
            await pool.query(query, [id, ...remainingContractorIds]);
            logger.info(`Synced contractor entries for appointment ${id}`);
          }
          break;
        }

        default:
          logger.info(`Unhandled appointment action: ${event.action}`);
          break;
      }
    } catch (error) {
      logger.error({ err: error }, `Error handling appointment webhook for appointment ${id}:`);
    }
  };
  const createOrUpdateService = async (serviceData, isCreate) => {
    const {
      id,
      name,
      description,
      dft_charge_type,
      dft_charge_rate,
      dft_contractor_rate,
      status,
      labels,
    } = serviceData;

    const labelNames = Array.isArray(labels)
      ? labels.map((label) => label.name)
      : [];

    // Extract enriched fields for job health tracking
    const dftLocation = serviceData.dft_location || {};
    const locationAddress = dftLocation.address || dftLocation.name || null;
    const locationLat = dftLocation.latitude || null;
    const locationLng = dftLocation.longitude || null;
    const conjobsCount = Array.isArray(serviceData.conjobs) ? serviceData.conjobs.length : 0;
    const rcrsCount = Array.isArray(serviceData.rcrs) ? serviceData.rcrs.length : 0;

    const query = `
    INSERT INTO services (
      service_id, name, description, dft_charge_type, dft_charge_rate, dft_contractor_rate,
      status, labels, created_at, updated_at,
      dft_location_address, dft_location_lat, dft_location_lng, conjobs_count, rcrs_count
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9, $10, $11, $12, $13)
    ON CONFLICT (service_id) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        dft_charge_type = EXCLUDED.dft_charge_type,
        dft_charge_rate = EXCLUDED.dft_charge_rate,
        dft_contractor_rate = EXCLUDED.dft_contractor_rate,
        status = EXCLUDED.status,
        labels = EXCLUDED.labels,
        updated_at = NOW(),
        dft_location_address = EXCLUDED.dft_location_address,
        dft_location_lat = EXCLUDED.dft_location_lat,
        dft_location_lng = EXCLUDED.dft_location_lng,
        conjobs_count = EXCLUDED.conjobs_count,
        rcrs_count = EXCLUDED.rcrs_count;
  `;

    try {
      // Get previous status for history tracking
      let previousStatus = null;
      if (!isCreate) {
        const { rows: existing } = await pool.query(
          'SELECT status FROM services WHERE service_id = $1', [id]
        );
        if (existing.length > 0) previousStatus = existing[0].status;
      }

      await pool.query(query, [
        id,
        name,
        description,
        dft_charge_type,
        dft_charge_rate,
        dft_contractor_rate,
        status,
        JSON.stringify(labelNames),
        locationAddress,
        locationLat,
        locationLng,
        conjobsCount,
        rcrsCount,
      ]);

      if (isCreate) {
        logger.info(`Service ${id} created successfully.`);
      } else {
        logger.info(`Service ${id} updated successfully.`);
      }

      // Record status change for job health tracking
      if (previousStatus && previousStatus !== status) {
        try {
          const JobHealthService = require('./job-health-service');
          const jobHealthService = new JobHealthService(pool);
          await jobHealthService.recordStatusChange(id, previousStatus, status);
        } catch (statusErr) {
          logger.error({ err: statusErr, serviceId: id }, 'Failed to record status change for job health');
        }
      }

      // Auto-sync to booking_types table
      await syncServiceToBookingTypes(id, serviceData);

      // Fetch and update student counts from TutorCruncher API
      await fetchAndUpdateStudentCounts(id);
    } catch (error) {
      logger.error({ err: error }, `Error inserting/updating service ${id}:`);
    }
  };

  const syncServiceToBookingTypes = async (serviceId, serviceData) => {
    try {
      logger.info(`Auto-syncing service ${serviceId} to booking_types table`);
      
      // Get the service from Services table
      const serviceRows = await pool.query(`
        SELECT "serviceId", name, description, location, price, image, type, 
               "colourGroup", "dft_max_srs" AS "dftMaxSrs", rcrs, "labelId", "labelName"
        FROM "Services" WHERE "serviceId" = $1
      `, [serviceId]);
      
      if (!serviceRows.length) {
        logger.info(`Service ${serviceId} not found in Services table, skipping booking_types sync`);
        return;
      }
      
      const service = serviceRows[0];
      
      // Extract label information from serviceData
      let labelId = null;
      let labelName = '';
      if (serviceData.labels && serviceData.labels.length > 0) {
        const primaryLabel = serviceData.labels.find(label => 
          !label.name.toLowerCase().includes('sync to website')
        ) || serviceData.labels[0];
        labelId = primaryLabel.id;
        labelName = primaryLabel.name;
      }
      
      // Determine location-specific label
      const hostname = process.env.HOSTNAME || '';
      if (!labelName && hostname.includes('eastside')) {
        labelName = 'School - Eastside';
      } else if (!labelName && hostname.includes('westside')) {
        labelName = 'School - Westside';
      }
      
      // Check if booking type already exists
      const existingBookingType = await pool.query(`
        SELECT id FROM booking_types WHERE service_id = $1
      `, [serviceId]);
      
      const payload = {
        name: serviceData.name,
        description: serviceData.description || '',
        original_price: Number(serviceData.dft_charge_rate) || 0,
        actual_price: Number(serviceData.dft_charge_rate) || 0,
        dft_charge_rate: Number(serviceData.dft_charge_rate) || 0,
        image_url: service.image || '',
        colour: service.colourGroup || 'dodgerblue',
        job_description: '',
        is_trial: false,
        category: service.location || '',
        public_internal: 'public',
        lesson_type: 'Club',
        lesson_dates: service.type || 'Per Session',
        dft_charge_type: 'Hourly',
        label_id: labelId,
        label_name: labelName,
        service_id: serviceId
      };
      
      if (existingBookingType.rows.length > 0) {
        // Update existing booking type
        await pool.query(`
          UPDATE booking_types SET
            name = $1,
            description = $2,
            original_price = $3,
            actual_price = $4,
            label_id = $5,
            label_name = $6,
            category = $7,
            dft_charge_rate = $8
          WHERE service_id = $9
        `, [
          payload.name,
          payload.description,
          payload.original_price,
          payload.actual_price,
          payload.label_id,
          payload.label_name,
          payload.category,
          payload.dft_charge_rate,
          serviceId
        ]);
        logger.info(`Updated booking type for service ${serviceId}`);
      } else {
        // Create new booking type
        await pool.query(`
          INSERT INTO booking_types (
            service_id, name, description, original_price, actual_price,
            label_id, label_name, category, lesson_type, lesson_dates,
            dft_charge_type, dft_charge_rate, colour, public_internal,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
        `, [
          payload.service_id,
          payload.name,
          payload.description,
          payload.original_price,
          payload.actual_price,
          payload.label_id,
          payload.label_name,
          payload.category,
          payload.lesson_type,
          payload.lesson_dates,
          payload.dft_charge_type,
          payload.dft_charge_rate,
          payload.colour,
          payload.public_internal
        ]);
        logger.info(`Created booking type for service ${serviceId}`);
      }
      
    } catch (error) {
      logger.error({ err: error }, `Error syncing service ${serviceId} to booking_types:`);
    }
  };

  const fetchAndUpdateStudentCounts = async (serviceId) => {
    try {
      logger.info(`Fetching student counts for service ${serviceId} from TutorCruncher API`);
      
      // Fetch full service details from TutorCruncher API
      const serviceResponse = await tutorCruncherAPI.get(`services/${serviceId}/`);
      const serviceData = serviceResponse.data;
      
      const dft_max_srs = serviceData.dft_max_srs !== null && serviceData.dft_max_srs !== undefined 
        ? serviceData.dft_max_srs 
        : 0;
      const rcrs = Array.isArray(serviceData.rcrs) ? serviceData.rcrs.length : 0;
      
      // Update the lowercase services table (synced from TutorCruncher)
      await pool.query(`
        UPDATE services 
        SET updated_at = NOW()
        WHERE service_id = $1
      `, [serviceId]);
      
      // Update the capitalized Services table (curated services)
      await pool.query(`
        UPDATE "Services" 
        SET "dft_max_srs" = $1, 
            rcrs = $2,
            "updatedAt" = NOW()
        WHERE "serviceId" = $3
      `, [
        dft_max_srs,
        rcrs,
        serviceId.toString()
      ]);
      
      logger.info(`✅ Updated student counts for service ${serviceId}: dft_max_srs=${dft_max_srs}, rcrs=${rcrs}`);
    } catch (error) {
      // Don't fail the webhook if fetching counts fails - log and continue
      logger.error({ error: error.message }, `⚠️ Failed to fetch/update student counts for service ${serviceId}:`);
    }
  };

  const removeLabelFromService = async (serviceData) => {
    const { id, labels } = serviceData;
    const labelNames = Array.isArray(labels)
      ? labels.map((label) => label.name)
      : [];

    const query = `
    UPDATE services
    SET labels = $1,
        updated_at = NOW()
    WHERE service_id = $2;
  `;

    try {
      await pool.query(query, [JSON.stringify(labelNames), id]);
      logger.info(`Labels updated for service ${id}`);
      
      // Auto-sync to booking_types table
      await syncServiceToBookingTypes(id, serviceData);
      
      // Fetch and update student counts
      await fetchAndUpdateStudentCounts(id);
    } catch (error) {
      logger.error({ err: error }, `Error updating labels for service ${id}:`);
    }
  };
  const resyncAllAppointments = async () => {
    try {
      const { rows: appointments } = await pool.query(
        `SELECT appointment_id
       FROM appointments
       WHERE updated_at IS NULL
          OR updated_at < NOW() - INTERVAL '24 hours'
       ORDER BY appointment_id DESC`
      );

      logger.info(`Found ${appointments.length} appointments to resync.`);

      for (const appointment of appointments) {
        const id = appointment.appointment_id;
        try {
          const response = await tutorCruncherAPI.get(`appointments/${id}/`);
          const appointmentData = response.data;

          const event = {
            action: "EDITED_AN_APPOINTMENT",
            subject: appointmentData,
          };

          logger.info(`Resyncing appointment ${id}...`);
          await handleAppointmentWebhook(event);
        } catch (err) {
          logger.error({ error: err.message }, `Error resyncing appointment ${id}:`);
        }

        await delay(1000);
      }
      logger.info("Resync complete.");
    } catch (err) {
      logger.error({ error: err.message }, "Error fetching appointments from DB:");
    }
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function fetchAllPages(path, params = {}, concurrency = 5) {
    const first = await limitedGet(path, {
      params: { ...params, page_size: 100, page: 1 },
    });
    const total = first.data.count;
    const perPage = 100;
    const pages = Math.ceil(total / perPage);

    const { default: pLimit } = await import("p-limit");
    const limit = pLimit(concurrency);

    const all = Array.from({ length: pages }, (_, i) => {
      const pageNum = i + 1;
      return limit(async () => {
        logger.info(`⏳ [fetchAllPages] ${path} → page ${pageNum}/${pages}`);
        const resp = await limitedGet(path, {
          params: { ...params, page_size: perPage, page: pageNum },
        });
        return resp.data.results;
      });
    });

    const results = await Promise.all(all);
    return results.flat();
  }
  async function syncInvoices() {
    console.time("syncInvoices");
    const client = await pool.connect();
    let nextUrl = "/invoices/";
    let page = 1;

    try {
      while (nextUrl) {
        logger.info(`[syncInvoices] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        const ids = data.results.map((inv) => inv.id);
        const { rows: locals } = await client.query(
          `SELECT id AS invoice_id, remote_last_updated
           FROM invoices
          WHERE id = ANY($1)`,
          [ids]
        );
        const localMap = new Map(
          locals.map((r) => [r.invoice_id, r.remote_last_updated])
        );

        for (const inv of data.results) {
          await client.query(
            `INSERT INTO invoices
             (id, display_id, date_sent, gross, net, tax,
              client_id, client_first_name, client_last_name,
              client_email, status, url, fetched_at,
              remote_last_updated)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13)
           ON CONFLICT (id) DO UPDATE SET
             display_id         = EXCLUDED.display_id,
             date_sent          = EXCLUDED.date_sent,
             gross              = EXCLUDED.gross,
             net                = EXCLUDED.net,
             tax                = EXCLUDED.tax,
             client_first_name  = EXCLUDED.client_first_name,
             client_last_name   = EXCLUDED.client_last_name,
             client_email       = EXCLUDED.client_email,
             status             = EXCLUDED.status,
             url                = EXCLUDED.url,
             fetched_at         = NOW(),
             remote_last_updated= EXCLUDED.remote_last_updated;`,
            [
              inv.id,
              inv.display_id,
              inv.date_sent,
              parseFloat(inv.gross),
              parseFloat(inv.net),
              parseFloat(inv.tax),
              inv.client.id,
              inv.client.first_name,
              inv.client.last_name,
              inv.client.email,
              inv.status,
              inv.url,
              inv.last_updated,
            ]
          );

          const localUpdated = localMap.get(inv.id);
          if (!localUpdated || new Date(inv.last_updated) > localUpdated) {
            logger.info(`[syncInvoices]   ↳ detail ${inv.id}`);
          }
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }
      logger.info("[syncInvoices]  Done");
    } finally {
      client.release();
      console.timeEnd("syncInvoices");
    }
  }
  async function syncServices() {
    console.time("syncServices");
    const client = await pool.connect();
    let nextUrl = "/services/?page_size=100";
    let page = 1;

    try {
      while (nextUrl) {
        logger.info(`[syncServices] ⏳ Page ${page}: ${nextUrl}`);
        const { data: listPage } = await rateLimitRetry(() => limitedGet(nextUrl));

        const serviceIds = listPage.results.map((svc) => svc.id);
        const { rows: locals } = await client.query(
          `SELECT service_id, remote_last_updated
         FROM services
         WHERE service_id = ANY($1)`,
          [serviceIds]
        );
        const localMap = new Map(
          locals.map((r) => [r.service_id, r.remote_last_updated])
        );

        for (const svc of listPage.results) {
          await client.query(
            `INSERT INTO services
             (service_id, name, dft_charge_type, dft_charge_rate,
              dft_contractor_rate, status, remote_last_updated,
              created_at, updated_at)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
           ON CONFLICT (service_id) DO UPDATE SET
             name                = EXCLUDED.name,
             dft_charge_type     = EXCLUDED.dft_charge_type,
             dft_charge_rate     = EXCLUDED.dft_charge_rate,
             dft_contractor_rate = EXCLUDED.dft_contractor_rate,
             status              = EXCLUDED.status,
             remote_last_updated = EXCLUDED.remote_last_updated,
             updated_at          = NOW();`,
            [
              svc.id,
              svc.name,
              svc.dft_charge_type,
              parseFloat(svc.dft_charge_rate),
              parseFloat(svc.dft_contractor_rate),
              svc.status,
              svc.last_updated,
            ]
          );

          const localUpdated = localMap.get(svc.id);
          if (!localUpdated || new Date(svc.last_updated) > localUpdated) {
            logger.info(`[syncServices]   ↳ detail ${svc.id}`);
            try {
              const { data: detail } = await rateLimitRetry(() =>
                limitedGet(`/services/${svc.id}/`)
              );
              const labels = (detail.labels || []).map((l) => ({ id: l.id, name: l.name }));
              const srPremium = detail.sr_premium != null ? parseFloat(detail.sr_premium) : null;

              // Extract location name from dft_location object
              const locationName = detail?.dft_location?.name || null;
              
              await client.query(
                `UPDATE services
             SET labels     = $2,
                 sr_premium = $3,
                 location   = COALESCE($4, location),
                 updated_at = NOW()
             WHERE service_id = $1;`,
                [svc.id, JSON.stringify(labels.map((l)=>l.name)), srPremium, locationName]
              );
              // Maintain normalized service_labels
              await client.query(`DELETE FROM service_labels WHERE service_id = $1`, [svc.id]);
              for (const l of labels) {
                await client.query(
                  `INSERT INTO labels (id, name, updated_at)
                   VALUES ($1,$2,NOW())
                   ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW();`,
                  [l.id, l.name]
                );
                await client.query(
                  `INSERT INTO service_labels (service_id, label_id, created_at, updated_at)
                   VALUES ($1,$2,NOW(),NOW())
                   ON CONFLICT (service_id, label_id) DO UPDATE SET updated_at = NOW();`,
                  [svc.id, l.id]
                );
              }

              // Auto‑seed curated "Services" row for jobs labeled "Sync to Website"
              try {
                const hasSyncToWebsite = Array.isArray(labels)
                  && labels.some((x) => String(x?.name || x).toLowerCase() === 'sync to website');

                if (hasSyncToWebsite && Service && typeof Service.findByPk === 'function') {
                  const sid = String(svc.id);
                  const existingCurated = await Service.findByPk(sid);
                  if (!existingCurated) {
                    await Service.create({
                      serviceId: sid,
                      name: detail?.name || svc.name || '',
                      description: detail?.description || '',
                      location: detail?.location || '',
                      price:
                        detail?.dft_charge_rate != null
                          ? Number(detail.dft_charge_rate)
                          : (svc.dft_charge_rate != null ? Number(svc.dft_charge_rate) : 0),
                      type: '',
                      colourGroup: null,
                      labelId: null,
                      labelName: '',
                      image: '',
                      dft_max_srs: null,
                      rcrs: null,
                    });
                    logger.info(`[syncServices]   ↳ seeded curated Services row for ${sid}`);
                  }
                }
              } catch (seedErr) {
                logger.error({ data: seedErr?.message || seedErr }, `[syncServices] seed curated failed for ${svc.id}:`);
              }
            } catch (err) {
              logger.error({ data: err.message || err }, `[syncServices] detail failed for ${svc.id}:`);
            }
          }
        }

        nextUrl = listPage.next
          ? listPage.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }

      logger.info(`[syncServices]  All services synced`);

      // Second pass: re-fetch labels for services visible on manage-services page.
      // TC doesn't update last_updated when labels change, so the main sync
      // skips the detail fetch. This ensures "Sync to Website" labels stay current.
      try {
        const { rows: visibleServices } = await client.query(
          `SELECT service_id FROM services
           WHERE COALESCE(archived, false) = false
             AND service_id IN (
               SELECT CAST("serviceId" AS INTEGER) FROM public."Services" WHERE COALESCE("archived", false) = false
             )`
        );
        if (visibleServices.length > 0) {
          logger.info(`[syncServices] 🔄 Refreshing labels for ${visibleServices.length} curated services`);
          const BATCH_SIZE = 5;
          for (let i = 0; i < visibleServices.length; i += BATCH_SIZE) {
            const batch = visibleServices.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ({ service_id }) => {
              try {
                const { data: detail } = await rateLimitRetry(() =>
                  limitedGet(`/services/${service_id}/`)
                );
                const labels = (detail.labels || []).map((l) => ({ id: l.id, name: l.name }));
                await client.query(
                  `UPDATE services SET labels = $2, updated_at = NOW() WHERE service_id = $1`,
                  [service_id, JSON.stringify(labels.map((l) => l.name))]
                );
                // Update normalized service_labels
                await client.query(`DELETE FROM service_labels WHERE service_id = $1`, [service_id]);
                for (const l of labels) {
                  await client.query(
                    `INSERT INTO labels (id, name, updated_at) VALUES ($1,$2,NOW())
                     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
                    [l.id, l.name]
                  );
                  await client.query(
                    `INSERT INTO service_labels (service_id, label_id, created_at, updated_at)
                     VALUES ($1,$2,NOW(),NOW())
                     ON CONFLICT (service_id, label_id) DO UPDATE SET updated_at = NOW()`,
                    [service_id, l.id]
                  );
                }
              } catch (err) {
                logger.error({ data: err.message || err }, `[syncServices] label refresh failed for ${service_id}:`);
              }
            }));
          }
          logger.info(`[syncServices] ✅ Label refresh complete for curated services`);
        }
      } catch (labelRefreshErr) {
        logger.error({ data: labelRefreshErr.message || labelRefreshErr }, `[syncServices] label refresh pass failed:`);
      }
    } finally {
      client.release();
      console.timeEnd("syncServices");
    }
  }
  async function syncAppointments() {
    console.time("syncAppointments");
    const client = await pool.connect();
    let page = 1;
    let nextUrl = "/appointments/?page_size=100";

    try {
      while (nextUrl) {
        logger.info(`[syncAppointments] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        const ids = data.results.map((a) => a.id);
        const { rows: locals } = await client.query(
          `SELECT appointment_id, remote_last_updated
           FROM appointments
          WHERE appointment_id = ANY($1)`,
          [ids]
        );
        const localMap = new Map(
          locals.map((r) => [r.appointment_id, r.remote_last_updated])
        );

        for (const apt of data.results) {
          await client.query(
            `INSERT INTO appointments
             (appointment_id, start, finish, units, topic, location,
              status, charge_type, service_id,
              created_at, updated_at,
              remote_last_updated)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW(),$10)
           ON CONFLICT (appointment_id) DO UPDATE SET
             start                = EXCLUDED.start,
             finish               = EXCLUDED.finish,
             units                = EXCLUDED.units,
             topic                = EXCLUDED.topic,
             location             = EXCLUDED.location,
             status               = EXCLUDED.status,
             charge_type          = EXCLUDED.charge_type,
             service_id           = EXCLUDED.service_id,
             updated_at           = NOW(),
             remote_last_updated  = EXCLUDED.remote_last_updated;`,
            [
              apt.id,
              apt.start,
              apt.finish,
              apt.units,
              apt.topic,
              JSON.stringify(apt.location),
              apt.status,
              apt.service.dft_charge_type,
              apt.service.id,
              apt.last_updated,
            ]
          );

          const localUpdated = localMap.get(apt.id);
          if (!localUpdated || new Date(apt.last_updated) > localUpdated) {
            logger.info(`[syncAppointments]   ↳ detail ${apt.id}`);
            try {
              const { data: full } = await rateLimitRetry(() =>
                limitedGet(`/appointments/${apt.id}/`)
              );

              const units = full.units
                ? parseFloat(full.units)
                : (new Date(full.finish) - new Date(full.start)) / 3600000;

              await client.query(
                `UPDATE appointments SET
               start       = $2,
               finish      = $3,
               units       = $4,
               topic       = $5,
               location    = $6,
               status      = $7,
               charge_type = $8,
               service_id  = $9,
               updated_at  = NOW()
             WHERE appointment_id = $1;`,
                [
                  full.id,
                  full.start,
                  full.finish,
                  units,
                  full.topic,
                  JSON.stringify(full.location),
                  full.status,
                  full.service.dft_charge_type,
                  full.service.id,
                ]
              );

              await client.query(
                `DELETE FROM appointment_recipients WHERE appointment_id = $1`,
                [full.id]
              );

              // Batch insert recipients
              const rcras = full.rcras || [];
              if (rcras.length > 0) {
                const values = [];
                const params = [];
                rcras.forEach((r, i) => {
                  const offset = i * 7;
                  values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                  const baseChargeRate = parseFloat(r.charge_rate);
                  params.push(
                    full.id,
                    r.recipient,
                    r.recipient_name,
                    r.paying_client,
                    r.paying_client_name,
                    baseChargeRate,
                    r.status
                  );
                });
                await client.query(
                  `INSERT INTO appointment_recipients
                   (appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status)
                   VALUES ${values.join(', ')}`,
                  params
                );
              }

              await client.query(
                `DELETE FROM appointment_contractors WHERE appointment_id = $1`,
                [full.id]
              );

              // Batch insert contractors
              const cjas = full.cjas || [];
              if (cjas.length > 0) {
                const values = [];
                const params = [];
                cjas.forEach((c, i) => {
                  const offset = i * 4;
                  values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
                  const basePayRate = parseFloat(c.pay_rate);
                  params.push(full.id, c.contractor, c.name, basePayRate);
                });
                await client.query(
                  `INSERT INTO appointment_contractors
                   (appointment_id, contractor_id, contractor_name, pay_rate)
                   VALUES ${values.join(', ')}`,
                  params
                );
              }
            } catch (err) {
              logger.error({ data: err.message || err }, `[syncAppointments] detail failed for ${apt.id}:`);
            }
          }
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }

      logger.info(`[syncAppointments]  All appointments synced`);
    } finally {
      client.release();
      console.timeEnd("syncAppointments");
    }
  }
  async function syncPaymentOrders() {
    console.time("syncPaymentOrders");
    const client = await pool.connect();
    let page = 1;
    let nextUrl = "/payment-orders/?page_size=100";

    try {
      while (nextUrl) {
        logger.info(`[syncPaymentOrders] ⏳ Page ${page}: ${nextUrl}`);
        const { data } = await rateLimitRetry(() => limitedGet(nextUrl));

        const ids = data.results.map((po) => po.id);
        const { rows: locals } = await client.query(
          `SELECT id, remote_last_updated
           FROM payment_orders
          WHERE id = ANY($1)`,
          [ids]
        );
        const localMap = new Map(
          locals.map((r) => [r.id, r.remote_last_updated])
        );

        for (const po of data.results) {
          await client.query(
            `INSERT INTO payment_orders
             (id, display_id, date_sent, date_paid, amount,
              payee_id, payee_first, payee_last, payee_email,
              status, url, fetched_at,
              remote_last_updated)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),$12)
           ON CONFLICT (id) DO UPDATE SET
             display_id         = EXCLUDED.display_id,
             date_sent          = EXCLUDED.date_sent,
             date_paid          = EXCLUDED.date_paid,
             amount             = EXCLUDED.amount,
             payee_id           = EXCLUDED.payee_id,
             payee_first        = EXCLUDED.payee_first,
             payee_last         = EXCLUDED.payee_last,
             payee_email        = EXCLUDED.payee_email,
             status             = EXCLUDED.status,
             url                = EXCLUDED.url,
             fetched_at         = NOW(),
             remote_last_updated= EXCLUDED.remote_last_updated;`,
            [
              po.id,
              po.display_id,
              po.date_sent,
              po.date_paid || null,
              parseFloat(po.amount),
              po.payee?.id || null,
              po.payee?.first_name || '',
              po.payee?.last_name || '',
              po.payee?.email || '',
              po.status,
              po.url,
              po.last_updated,
            ]
          );

          const localUpdated = localMap.get(po.id);
        if (!localUpdated || new Date(po.last_updated) > localUpdated) {
          logger.info(`[syncPaymentOrders]   ↳ detail ${po.id}`);
          try {
            const { data: full } = await rateLimitRetry(() =>
              limitedGet(`/payment-orders/${po.id}/`)
            );

            await client.query(
              `DELETE FROM payment_order_charges WHERE payment_order_id = $1`,
              [po.id]
            );
            for (let i = 0; i < full.charges.length; i++) {
              const c = full.charges[i];
              await client.query(
                `INSERT INTO payment_order_charges
                 (payment_order_id, charge_index, adhoc_charge_id,
                  appointment_id, date, amount, rate, sales_code,
                  tax_amount, units, payer, payee_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                [
                  po.id,
                  i,
                  c.adhoc_charge?.id || null,
                  c.appointment?.id || null,
                  c.date,
                  parseFloat(c.amount),
                  parseFloat(c.rate),
                  c.sales_code,
                  parseFloat(c.tax_amount),
                  parseFloat(c.units),
                  c.payer,
                  c.payee.id,
                ]
              );
            }
          } catch (err) {
            logger.error({ data: err.message || err }, `[syncPaymentOrders] detail failed for ${po.id}:`);
          }
        }
        }

        nextUrl = data.next
          ? data.next.replace(tutorCruncherAPI.defaults.baseURL, "")
          : null;
        page++;
      }

      logger.info(`[syncPaymentOrders]  All payment‑orders synced`);
    } finally {
      client.release();
      console.timeEnd("syncPaymentOrders");
    }
  }
  // Klaviyo functions - now using extracted service (services/klaviyo-service.js)
  const checkKlaviyoProfileExistence = klaviyoService.checkKlaviyoProfileExistence;
  const createOrUpdateKlaviyoProfile = klaviyoService.createOrUpdateKlaviyoProfile;
  async function createTrialOnTC(job, recipientIds, actualPrice) {
    const start = new Date();
    start.setMonth(start.getMonth() + 1);
    const finish = new Date(start.getTime() + 60 * 60 * 1000);

    const payload = {
      start: start.toISOString(),
      finish: finish.toISOString(),
      topic: `[TRIAL] - ${job.name}`,
      status: "planned",
      service: job.service_id,
    };

    const resp = await fetch(
      "https://secure.tutorcruncher.com/api/appointments/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `token ${TUTORCRUNCHER_API_TOKEN}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!resp.ok) {
      logger.error({ data: await resp.text() }, " Failed to create TC trial:");
      return;
    }

    const appointment = await resp.json();
    logger.info({ data: appointment }, " Created TC trial:");

    for (const recipientId of recipientIds) {
      const addResp = await fetch(
        `https://secure.tutorcruncher.com/api/appointments/${appointment.id}/recipient/add/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `token ${TUTORCRUNCHER_API_TOKEN}`,
          },
          body: JSON.stringify({
            recipient: recipientId,
            charge_rate: Number(actualPrice).toFixed(2),
          }),
        }
      );

      if (!addResp.ok) {
        logger.error({ data: await addResp.text() }, ` Failed to add recipient ${recipientId}:`);
      } else {
        logger.info(` Added recipient ${recipientId} to trial appointment`);
      }
    }
  }
  function markdownToHtml(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, "$1");
    text = text.replace(/\* (.*?)(?=\n|$)/gm, "$1");
    text = text.replace(/<\/?[^>]+(>|$)/g, "");

    text = text.replace(/\n+/g, "\n");

    text = text.trim();

    return text;
  }
  const getExistingProfileByEmail = klaviyoService.getExistingProfileByEmail;
  const createKlaviyoProfile = klaviyoService.createKlaviyoProfile;
  const removeFromKlaviyoList = klaviyoService.removeFromKlaviyoList;
  const addToKlaviyoList = klaviyoService.addToKlaviyoList;
  function generateJobDescHtml(lines) {
    let html = "";
    let inList = false;

    lines.forEach((rawLine) => {
      const line = rawLine.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

      if (/^<strong>.+<\/strong>$/.test(line)) {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<p>${line}</p>`;
      } else if (line.startsWith("* ")) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${line.slice(2)}</li>`;
      } else {
        if (inList) {
          html += "</ul>";
          inList = false;
        }
        html += `<p>${line}</p>`;
      }
    });

    if (inList) html += "</ul>";
    return html;
  }
  function normalizeColour(input, fallback = "#666666") {
    if (!input || typeof input !== "string") return fallback;
    const s = input.trim();

    const fullHex = /^#([0-9a-f]{6})$/i;
    if (fullHex.test(s)) return s.toUpperCase();

    const shortHex = /^#([0-9a-f]{3})$/i;
    if (shortHex.test(s)) {
      const [, h] = s.match(shortHex);
      return ("#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toUpperCase();
    }

    const rgb =
      /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i;
    const mRgb = s.match(rgb);
    if (mRgb) {
      const [, r, g, b] = mRgb.map(Number);
      const toHex = (v) =>
        Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
      return ("#" + toHex(r) + toHex(g) + toHex(b)).toUpperCase();
    }

    const hsl =
      /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/i;
    const mHsl = s.match(hsl);
    if (mHsl) {
      let h = ((parseFloat(mHsl[1]) % 360) + 360) % 360;
      const S = Math.max(0, Math.min(100, parseFloat(mHsl[2]))) / 100;
      const L = Math.max(0, Math.min(100, parseFloat(mHsl[3]))) / 100;
      const C = (1 - Math.abs(2 * L - 1)) * S;
      const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = L - C / 2;
      let r1 = 0,
        g1 = 0,
        b1 = 0;
      if (h < 60) [r1, g1, b1] = [C, X, 0];
      else if (h < 120) [r1, g1, b1] = [X, C, 0];
      else if (h < 180) [r1, g1, b1] = [0, C, X];
      else if (h < 240) [r1, g1, b1] = [0, X, C];
      else if (h < 300) [r1, g1, b1] = [X, 0, C];
      else [r1, g1, b1] = [C, 0, X];
      const toHex = (v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, "0");
      return ("#" + toHex(r1) + toHex(g1) + toHex(b1)).toUpperCase();
    }

    const NAMED = {
      mediumorchid: "#BA55D3",
    };
    const named = NAMED[s.toLowerCase()];
    if (named) return named;

    return s;
  }
  function getAge(dob) {
    return dob
      ? Math.floor(
          (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365)
        )
      : "";
  }
  async function sendEmail(details) {
    const isClubBooking = /club/i.test(details.bookingType);
    const hasJob = details.tc_service_id && details.tc_service_id !== "—";

    // Determine recipient based on landing URL subdomain or label name
    let emailRecipient = "support@acmeops.com";
    let recipientSource = "default";
    
    try {
      // First, try to get subdomain from landing URL
      const landingUrlCandidate =
        details.landing_url ||
        details.landingUrl ||
        (details.attribution &&
          (details.attribution.landing_url || details.attribution.landingUrl)) ||
        details.referrer ||
        "";
      
      if (landingUrlCandidate) {
        try {
          const url = new URL(landingUrlCandidate);
          const host = url.hostname || "";
          const subdomain = host.endsWith("acmeops.com")
            ? host.split(".")[0]
            : "";
          
          if (subdomain === "eastside") {
            emailRecipient = "eastside@acmeops.com";
            recipientSource = `landing_url subdomain: ${subdomain}`;
          } else if (subdomain === "westside") {
            emailRecipient = "westside@acmeops.com";
            recipientSource = `landing_url subdomain: ${subdomain}`;
          } else if (subdomain === "join") {
            emailRecipient = "support@acmeops.com";
            recipientSource = `landing_url subdomain: ${subdomain}`;
          }
        } catch (urlError) {
          logger.warn({ data: urlError.message }, `⚠️ Failed to parse landing URL: ${landingUrlCandidate}`);
        }
      }
      
      // Fallback: Check label_name for Westside/Eastside indicators
      if (emailRecipient === "support@acmeops.com" && details.label_name) {
        const labelName = String(details.label_name).toLowerCase();
        // Check for explicit "School - Westside" or "School - Eastside" patterns
        if (labelName.includes("school - westside") || labelName.includes("westside") || labelName.includes("nash")) {
          emailRecipient = "westside@acmeops.com";
          recipientSource = `label_name: ${details.label_name}`;
        } else if (labelName.includes("school - eastside") || labelName.includes("eastside") || labelName.includes("orl")) {
          emailRecipient = "eastside@acmeops.com";
          recipientSource = `label_name: ${details.label_name}`;
        }
      }
      
      // Additional fallback: Check booking_type name for Westside/Eastside indicators
      if (emailRecipient === "support@acmeops.com" && details.booking_type) {
        const bookingType = String(details.booking_type).toLowerCase();
        if (bookingType.includes("westside") || bookingType.includes("nash")) {
          emailRecipient = "westside@acmeops.com";
          recipientSource = `booking_type: ${details.booking_type}`;
        } else if (bookingType.includes("eastside") || bookingType.includes("orl")) {
          emailRecipient = "eastside@acmeops.com";
          recipientSource = `booking_type: ${details.booking_type}`;
        }
      }
      
      // Additional fallback: Check bookingType (alternative field name) for Westside/Eastside indicators
      if (emailRecipient === "support@acmeops.com" && details.bookingType) {
        const bookingType = String(details.bookingType).toLowerCase();
        if (bookingType.includes("westside") || bookingType.includes("nash")) {
          emailRecipient = "westside@acmeops.com";
          recipientSource = `bookingType: ${details.bookingType}`;
        } else if (bookingType.includes("eastside") || bookingType.includes("orl")) {
          emailRecipient = "eastside@acmeops.com";
          recipientSource = `bookingType: ${details.bookingType}`;
        }
      }
      
      logger.info(`📧 Email recipient determined: ${emailRecipient} (source: ${recipientSource}, landing_url: ${landingUrlCandidate || 'N/A'}, label_name: ${details.label_name || 'N/A'}, booking_type: ${details.booking_type || details.bookingType || 'N/A'})`);
    } catch (e) {
      logger.error({ error: e.message }, `❌ Error determining email recipient:`);
      // Fallback stays as support@acmeops.com
    }

    const studentNotesHtml = details.students
      .map(
        (s) =>
          `<p><strong>${s.first} ${s.last}:</strong> ${
            s.notes || "No notes provided"
          }</p>`
      )
      .join("\n");

    const emailBody = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; background-color: #f5f7fa; padding: 40px; max-width: 800px; margin: 0 auto;">
      <div style="text-align:center; margin-bottom:30px;">
      <img
        src="https://join.acmeops.com/logo512.png"
        alt="Acme Operations"
        style="max-width:120px; display:block; margin:0 auto;"
      />
    </div>
      <!-- Header -->
      <div style="text-align: center; padding-bottom: 30px;">
        <h2 style="font-size: 28px; color: #2d3436; font-weight: bold;">New ${
          details.booking_type || "—"
        } Booking!</h2>
        <p style="font-size: 16px; color: #636e72;">Submission #${
          details.id || "—"
        }</p>
      </div>

      <!-- Parent Info Section -->
      <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">Parent Info</h3>
       <p><strong>TutorCruncher ID:</strong> ${
         details.tc_client_id
           ? `<a href="https://account.acmeops.com/clients/${details.tc_client_id}">${details.tc_client_id}</a>`
           : "—"
       }</p>

        <p><strong>Name:</strong> ${details.parent_first} ${
      details.parent_last
    }</p>
        <p><strong>Email:</strong> ${details.parent_email || "—"}</p>
        <p><strong>Phone:</strong> ${details.parent_phone || "—"}</p>
      </div>

     <!-- Student Notes Section -->
    <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">Student Notes</h3>
      ${studentNotesHtml || "<p>No student notes available.</p>"}
    </div>

      <!-- Booking & Pricing Section -->
      <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">Booking & Pricing</h3>
        <p><strong>Payment Status:</strong> ${
          details.payment_status || "Not Provided"
        }</p>
        <p><strong>Booking Type:</strong> ${details.booking_type || "—"}</p>
        <p><strong>Price:</strong> $${details.actual_price || "—"}</p>
        <p><strong>Trial:</strong> ${details.is_trial ? "Yes" : "No"}</p>
      </div>
${
  hasJob
    ? `
  <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">TutorCruncher Info</h3>
    <p><strong>Job ID:</strong> ${
      details.tc_service_id
        ? `<a href="https://account.acmeops.com/cal/service/${details.tc_service_id}">${details.tc_service_id}</a>`
        : "—"
    }</p>
    <p><strong>Job Description:</strong></p>
     <pre style="color: #555; font-family: 'Helvetica Neue', Arial, sans-serif;  white-space: pre-wrap; word-wrap: break-word; padding: 15px; background-color: #fafafa; border-radius: 8px; border: 1px solid #ddd;">
          ${details.jobDescForEmail || "No job description available."}
        </pre>
  </div>
`
    : isClubBooking
    ? `
  <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">Note:</h3>
    <p>This is a club booking. No job was created, but the session details have been processed.</p>
  </div>
`
    : ""
}


      <!-- Students Section -->
      <div style="background: #ffffff; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h3 style="font-size: 20px; color: #2c3e50; margin-bottom: 15px;">Students</h3>
        <ul style="padding-left: 20px; color: #555;">
          ${
            details.students
              ? details.students
                  .map(
                    (s) => `
            <li>${s.first} ${s.last} – Level: ${
                      s.experience || "Not Provided"
                    } – Age: ${getAge(s.dob) || "N/A"}</li>
          `
                  )
                  .join("")
              : "<li>No students provided</li>"
          }
        </ul>
      </div>

      <!-- Footer Section -->
      <div style="text-align: center; font-size: 14px; color: #888; padding-top: 30px;">
        <p>Email Generated by Acme Operations</p>
      </div>
    </div>
  `;

    try {
      const { getInstance: getEmailSender } = require('../utils/brevo-email-sender');
      const emailSender = getEmailSender();
      if (emailSender) {
        const result = await emailSender.sendEmail({
          to: emailRecipient,
          subject: `[PAID - New Booking] ${details.parent_first} ${
            details.parent_last
          } - ${details.booking_type || "—"}`,
          html: emailBody,
          tags: ['new-booking'],
        });
        logger.info({ messageId: result.messageId }, "Email sent via Brevo API");
      } else {
        logger.warn("Brevo email sender not available — new booking notification not sent");
      }
    } catch (error) {
      logger.error({ err: error }, "Error sending email:");
    }
  }

  return {
    syncLabels,
    syncPipelineStages,
    addToKlaviyoList,
    auth,
    checkKlaviyoProfileExistence,
    checkRateLimitHeaders,
    createAxiosInstance,
    createKlaviyoProfile,
    createOrUpdateKlaviyoProfile,
    createOrUpdateService,
    syncServiceToBookingTypes,
    createTrialOnTC,
    delay,
    fetchAllClientsInParallel,
    fetchAllClientsSummary,
    fetchAllClientsWithRateLimiting,
    fetchAllDataInBatches,
    fetchAllDataWithRateCheck,
    fetchAllFormEntries,
    fetchAllLabelIds,
    fetchAllPages,
    fetchAllRecipientsSummary,
    fetchAllServicesInBulk,
    fetchAppointmentById,
    fetchAppointmentDetailsById,
    fetchAppointmentsForService,
    fetchClientById,
    fetchDataWithBrowser,
    fetchPaginatedData,
    fetchRecipientById,
    fetchServiceById,
    fetchServiceDetails,
    fetchServiceDetailsById,
    fetchServiceDetailsInBatches,
    fetchServicesByLabel,
    fetchWithRateLimitHandling,
    generateJobDescHtml,
    getAge,
    getExistingProfileByEmail,
    handleAppointmentWebhook,
    insertAppointmentContractors,
    insertAppointmentRecipients,
    insertOrUpdateAppointments,
    insertOrUpdateAppointmentsForService,
    insertOrUpdateClients,
    insertOrUpdateRecipients,
    insertOrUpdateServices,
    insertRecipients,
    insertServiceContractors,
    insertServiceRecipients,
    markdownToHtml,
    normalizeColour,
    processBatch,
    processBatchDates,
    rateLimitRetry,
    removeFromKlaviyoList,
    removeLabelFromService,
    resyncAllAppointments,
    saveEntriesToDB,
    sendEmail,
    shouldUpdateAppointment,
    shouldUpdateClient,
    shouldUpdateRecipient,
    shouldUpdateService,
    sleep,
    syncAppointments,
    syncClients,
    syncInvoices,
    syncPaymentOrders,
    syncServices,
  };
}

module.exports = buildServerFns;
