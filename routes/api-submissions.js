const express = require('express');
const {
  pool,
  axios,
  cloudinary,
  tutorCruncherAPI,
  limitedGet,
  jwt,
  stripe,
  transporter,
  db,
  sequelize,
  Service,
  Location,
  ColourGroup,
  Appointment,
  delay,
  rateLimitRetry,
  auth,
  GRAVITY_FORMS_API_BASE_URL,
  KLAVIYO_API_KEY,
  LABEL_ID,
  TUTORCRUNCHER_API_BASE
} = global;

const { generateRecommendations } = require('../utils/submissionRecommendations');
const cache = require('../utils/cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { getTutorCruncherCountryId } = require('../utils/tutorcruncherCountry');

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  // Ensure user is authenticated (auth middleware should have set req.user)
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const userRole = req.user?.role || "staff";
  if (userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

const router = express.Router();

// Helper function to calculate predicted LTV based on retention rates
async function calculatePredictedLTV(ltvByLabel) {
  try {
    // Get retention rates by label and average revenue per lesson
    const { rows } = await pool.query(`
      WITH client_revenue_per_appointment AS (
        SELECT
          a.appointment_id,
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          jsonb_extract_path_text(label_elem, 'name') AS label_name,
          SUM(
            CASE
              WHEN a.charge_type = 'hourly'
                THEN ar.charge_rate * a.units
              WHEN a.charge_type = 'one-off'
                THEN ar.charge_rate
              WHEN a.charge_type = 'one-off-split'
                THEN ar.charge_rate
              WHEN a.charge_type = 'hourly-split'
                THEN ar.charge_rate * a.units
              ELSE
                ar.charge_rate * a.units
            END
          ) AS appointment_revenue
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        JOIN services s ON a.service_id = s.service_id
        JOIN clients c ON CAST(ar.paying_client_id AS VARCHAR) = c.client_id
        CROSS JOIN LATERAL jsonb_array_elements(c.labels) AS label_elem
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
          AND jsonb_extract_path_text(label_elem, 'name') IS NOT NULL
          AND jsonb_extract_path_text(label_elem, 'name') != ''
        GROUP BY a.appointment_id, ar.paying_client_id, jsonb_extract_path_text(label_elem, 'name')
      ),
      client_lesson_counts AS (
        SELECT
          client_id,
          label_name,
          COUNT(DISTINCT appointment_id) AS lesson_count,
          SUM(appointment_revenue) AS total_revenue
        FROM client_revenue_per_appointment
        GROUP BY client_id, label_name
        HAVING COUNT(DISTINCT appointment_id) >= 1
      ),
      retention_stats AS (
        SELECT
          label_name,
          COUNT(*) FILTER (WHERE lesson_count >= 1) AS clients_with_1_lesson,
          COUNT(*) FILTER (WHERE lesson_count >= 2) AS clients_with_2_lessons,
          COUNT(*) FILTER (WHERE lesson_count >= 3) AS clients_with_3_lessons,
          COUNT(*) FILTER (WHERE lesson_count >= 4) AS clients_with_4_lessons,
          COUNT(*) FILTER (WHERE lesson_count >= 5) AS clients_with_5_lessons,
          AVG(total_revenue / NULLIF(lesson_count, 0)) AS avg_revenue_per_lesson
        FROM client_lesson_counts
        GROUP BY label_name
      )
      SELECT
        label_name,
        clients_with_1_lesson,
        clients_with_2_lessons,
        clients_with_3_lessons,
        clients_with_4_lessons,
        clients_with_5_lessons,
        CASE 
          WHEN clients_with_1_lesson > 0 THEN (clients_with_2_lessons::numeric / clients_with_1_lesson) 
          ELSE 0 
        END AS retention_rate_1_to_2,
        CASE 
          WHEN clients_with_2_lessons > 0 THEN (clients_with_3_lessons::numeric / clients_with_2_lessons) 
          ELSE 0 
        END AS retention_rate_2_to_3,
        CASE 
          WHEN clients_with_3_lessons > 0 THEN (clients_with_4_lessons::numeric / clients_with_3_lessons) 
          ELSE 0 
        END AS retention_rate_3_to_4,
        CASE 
          WHEN clients_with_4_lessons > 0 THEN (clients_with_5_lessons::numeric / clients_with_4_lessons) 
          ELSE 0 
        END AS retention_rate_4_to_5,
        COALESCE(avg_revenue_per_lesson, 0) AS avg_revenue_per_lesson
      FROM retention_stats
      WHERE clients_with_1_lesson > 0
    `);

    // Calculate predicted LTV for each label
    const predictedLTVByLabel = {};
    const retentionData = {};

    rows.forEach(row => {
      const label = row.label_name;
      const avgRevenuePerLesson = parseFloat(row.avg_revenue_per_lesson) || 0;
      
      // Calculate retention rates
      const rate1to2 = parseFloat(row.retention_rate_1_to_2) || 0;
      const rate2to3 = parseFloat(row.retention_rate_2_to_3) || 0;
      const rate3to4 = parseFloat(row.retention_rate_3_to_4) || 0;
      const rate4to5 = parseFloat(row.retention_rate_4_to_5) || 0;
      
      // Use average retention rate for future lessons (after 5)
      const avgRetentionRate = (
        rate1to2 + rate2to3 + rate3to4 + rate4to5
      ) / Math.max(1, [rate1to2, rate2to3, rate3to4, rate4to5].filter(r => r > 0).length);
      
      // Predict LTV: Start with 1 lesson, then add predicted future lessons
      let predictedLTV = avgRevenuePerLesson; // Lesson 1 (guaranteed)
      let probability = 1.0;
      
      // Lesson 2
      probability *= rate1to2;
      if (probability > 0.01) { // Stop if probability drops below 1%
        predictedLTV += avgRevenuePerLesson * probability;
      }
      
      // Lesson 3
      probability *= rate2to3;
      if (probability > 0.01) {
        predictedLTV += avgRevenuePerLesson * probability;
      }
      
      // Lesson 4
      probability *= rate3to4;
      if (probability > 0.01) {
        predictedLTV += avgRevenuePerLesson * probability;
      }
      
      // Lesson 5
      probability *= rate4to5;
      if (probability > 0.01) {
        predictedLTV += avgRevenuePerLesson * probability;
      }
      
      // Future lessons (6-20) using average retention rate
      for (let lesson = 6; lesson <= 20; lesson++) {
        probability *= avgRetentionRate;
        if (probability > 0.01) {
          predictedLTV += avgRevenuePerLesson * probability;
        } else {
          break; // Stop if probability becomes too low
        }
      }
      
      predictedLTVByLabel[label] = parseFloat(predictedLTV.toFixed(2));
      
      // Store retention data for modal display
      retentionData[label] = {
        clientsWith1Lesson: parseInt(row.clients_with_1_lesson) || 0,
        clientsWith2Lessons: parseInt(row.clients_with_2_lessons) || 0,
        clientsWith3Lessons: parseInt(row.clients_with_3_lessons) || 0,
        retentionRate1To2: parseFloat((rate1to2 * 100).toFixed(2)),
        retentionRate2To3: parseFloat((rate2to3 * 100).toFixed(2)),
        avgRevenuePerLesson: parseFloat(avgRevenuePerLesson.toFixed(2)),
        predictedLTV: parseFloat(predictedLTV.toFixed(2))
      };
    });

    // Calculate overall predicted LTV (weighted average by label)
    const labels = Object.keys(predictedLTVByLabel);
    const predictedLTV = labels.length > 0
      ? parseFloat((labels.reduce((sum, label) => sum + predictedLTVByLabel[label], 0) / labels.length).toFixed(2))
      : (Object.values(ltvByLabel).length > 0
          ? parseFloat((Object.values(ltvByLabel).reduce((a, b) => a + b, 0) / Object.values(ltvByLabel).length).toFixed(2))
          : 0);

    return {
      predictedLTV,
      predictedLTVByLabel,
      retentionData
    };
  } catch (err) {
    logger.error({ err: err }, 'Error calculating predicted LTV:');
    // Fallback to simple average
    const labels = Object.keys(ltvByLabel);
    const predictedLTV = labels.length > 0
      ? parseFloat((labels.reduce((sum, label) => sum + ltvByLabel[label], 0) / labels.length).toFixed(2))
      : 0;
    return {
      predictedLTV,
      predictedLTVByLabel: ltvByLabel,
      retentionData: {}
    };
  }
}

// Helper function to get average and median LTV by label
// Returns a map of label name -> { average, median }
async function getLTVByLabel(metric = 'average') {
  try {
    const { rows } = await pool.query(`
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= 1
      ),
      client_ltv_by_label AS (
        SELECT
          jsonb_extract_path_text(label_elem, 'name') AS label_name,
          cir.total_paid_invoices AS ltv_value
        FROM clients c
        LEFT JOIN client_lesson_stats cls ON c.client_id = cls.client_id
        LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
        CROSS JOIN LATERAL jsonb_array_elements(c.labels) AS label_elem
        WHERE cls.total_lessons >= 1
          AND cir.total_paid_invoices > 0
          AND jsonb_extract_path_text(label_elem, 'name') IS NOT NULL
          AND jsonb_extract_path_text(label_elem, 'name') != ''
      ),
      label_ltv_stats AS (
        SELECT
          label_name,
          AVG(ltv_value) AS avg_ltv,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ltv_value) AS median_ltv
        FROM client_ltv_by_label
        GROUP BY label_name
      )
      SELECT label_name, avg_ltv, median_ltv
      FROM label_ltv_stats
      WHERE avg_ltv > 0 OR median_ltv > 0
    `);
    
    // Convert to map for easy lookup
    const ltvMap = {};
    rows.forEach(row => {
      const avg = parseFloat(row.avg_ltv) || 0;
      const median = parseFloat(row.median_ltv) || 0;
      // For backward compatibility, return single value if metric specified
      if (metric === 'median') {
        ltvMap[row.label_name] = median;
      } else {
        ltvMap[row.label_name] = avg;
      }
    });
    
    return ltvMap;
  } catch (err) {
    logger.error({ err: err }, 'Error fetching LTV by label:');
    return {};
  }
}

// Helper function to get both average and median LTV by label
// Returns a map of label name -> { average, median }
async function getLTVByLabelWithBoth() {
  try {
    const { rows } = await pool.query(`
      WITH client_invoice_revenue AS (
        SELECT
          CAST(client_id AS VARCHAR) AS client_id,
          SUM(CASE WHEN status = 'paid' THEN gross ELSE 0 END) AS total_paid_invoices
        FROM invoices
        GROUP BY client_id
      ),
      client_lesson_stats AS (
        SELECT
          CAST(ar.paying_client_id AS VARCHAR) AS client_id,
          COUNT(DISTINCT ar.appointment_id) AS total_lessons
        FROM appointment_recipients ar
        JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
        GROUP BY ar.paying_client_id
        HAVING COUNT(DISTINCT ar.appointment_id) >= 1
      ),
      client_ltv_by_label AS (
        SELECT
          jsonb_extract_path_text(label_elem, 'name') AS label_name,
          cir.total_paid_invoices AS ltv_value
        FROM clients c
        LEFT JOIN client_lesson_stats cls ON c.client_id = cls.client_id
        LEFT JOIN client_invoice_revenue cir ON c.client_id = cir.client_id
        CROSS JOIN LATERAL jsonb_array_elements(c.labels) AS label_elem
        WHERE cls.total_lessons >= 1
          AND cir.total_paid_invoices > 0
          AND jsonb_extract_path_text(label_elem, 'name') IS NOT NULL
          AND jsonb_extract_path_text(label_elem, 'name') != ''
      ),
      label_ltv_stats AS (
        SELECT
          label_name,
          AVG(ltv_value) AS avg_ltv,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ltv_value) AS median_ltv
        FROM client_ltv_by_label
        GROUP BY label_name
      )
      SELECT label_name, avg_ltv, median_ltv
      FROM label_ltv_stats
      WHERE avg_ltv > 0 OR median_ltv > 0
    `);
    
    // Convert to map with both average and median
    const ltvMap = {};
    rows.forEach(row => {
      ltvMap[row.label_name] = {
        average: parseFloat(row.avg_ltv) || 0,
        median: parseFloat(row.median_ltv) || 0
      };
    });
    
    return ltvMap;
  } catch (err) {
    logger.error({ err: err }, 'Error fetching LTV by label with both metrics:');
    return {};
  }
}

// Helper function to map booking type to label name
// Extracts label from booking type (e.g., "Home - NYC Trial" -> "Home - NYC")
function getLabelFromBookingType(bookingType) {
  if (!bookingType) return null;
  
  // Remove common suffixes
  const cleaned = bookingType
    .replace(/\s*-?\s*Trial\s*$/i, '')
    .replace(/\s*-?\s*Registration\s*$/i, '');
  
  return cleaned.trim() || null;
}

// Helper function to convert Eastern Time date string to UTC timestamp
// Input: "2025-11-01" or "2025-11-01T00:00:00"
// Output: ISO string in UTC representing start/end of day in ET
function etDateToUTC(dateString, isEndOfDay = false) {
  // Extract just the date part (YYYY-MM-DD)
  const dateOnly = dateString.split('T')[0];
  
  // Create a date string representing the date in ET
  // Use America/New_York timezone which handles DST automatically
  // Format: "YYYY-MM-DDTHH:mm:ss.sss" (will be interpreted as ET)
  const hours = isEndOfDay ? 23 : 0;
  const minutes = isEndOfDay ? 59 : 0;
  const seconds = isEndOfDay ? 59 : 0;
  const ms = isEndOfDay ? 999 : 0;
  
  // Create date string for ET timezone (America/New_York)
  // Use the format that JavaScript will interpret correctly
  // We'll create a date in ET and then convert to UTC
  const etDateStr = `${dateOnly}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  
  // Parse as if it's in ET (America/New_York)
  // We need to account for the timezone offset
  // Create a date object and adjust for ET offset
  // EST is UTC-5, EDT is UTC-4
  // We'll use a more reliable method: create date in UTC, then subtract ET offset
  const tempDate = new Date(`${etDateStr}Z`); // Parse as UTC first
  // Get the timezone offset for America/New_York on this date
  // We'll use a method that works by creating a date in NY and comparing
  const utcDate = new Date(`${dateOnly}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}Z`);
  
  // Create a date string with explicit ET timezone offset
  // We'll try to determine if it's DST or not by checking the month
  // DST is typically March-November (approx), EST is November-March
  const month = parseInt(dateOnly.split('-')[1]);
  const isDST = month >= 3 && month <= 10; // Approximate DST period
  const offsetHours = isDST ? -4 : -5; // EDT is UTC-4, EST is UTC-5
  
  // Create date string with timezone offset
  // Format: "YYYY-MM-DDTHH:mm:ss.sss-05:00" or "YYYY-MM-DDTHH:mm:ss.sss-04:00"
  const offsetStr = `-${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;
  const etDateWithTZ = `${etDateStr}${offsetStr}`;
  
  // Parse and convert to UTC ISO string
  const date = new Date(etDateWithTZ);
  
  // Validate the date
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${etDateWithTZ}`);
  }
  
  return date.toISOString();
}
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { parsePagination, createPaginatedResponse } = require('../utils/pagination');

    // Parse pagination parameters (default 25 per page)
    const pagination = parsePagination(req, 25, 100);

    // Get payment_status filter from query parameter (for tab filtering)
    const paymentStatus = req.query.payment_status;

    // Cache key includes all query params that affect results
    const photoReleaseParam = req.query.photo_release;
    const cacheKey = `submissions:list:payment_status:${paymentStatus || 'all'}:photo_release:${photoReleaseParam || 'all'}:page:${pagination.page}:limit:${pagination.limit}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      // Build WHERE clause for payment_status filter
      let whereClause = '';
      let queryParams = [];
      const photoRelease = req.query.photo_release;
      if (photoRelease === 'true') {
        whereClause = 'WHERE agree_photo = true';
      } else if (paymentStatus && paymentStatus !== 'all') {
        whereClause = 'WHERE LOWER(payment_status) = LOWER($1)';
        queryParams.push(paymentStatus);
      }

      // Get total count first (with filter if applicable)
      const countQuery = `
        SELECT COUNT(*) as total
        FROM booking_submissions
        ${whereClause}
      `;
      const countResult = await pool.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total, 10);

      // Fetch paginated submissions (with filter if applicable)
      const limitParamIndex = queryParams.length + 1;
      const offsetParamIndex = queryParams.length + 2;
      const selectQuery = `
        SELECT
          id,
          booking_type      AS "bookingType",
          actual_price      AS "actualPrice",
          original_price    AS "originalPrice",
          parent_first      AS "parentFirst",
          parent_last       AS "parentLast",
          parent_email      AS "parentEmail",
          parent_phone      AS "parentPhone",
          student_type      AS "studentType",
          students,
          slots,
          heard_about       AS "heardAbout",
          address,
          agree_cancel      AS "agreeCancel",
          agree_service     AS "agreeService",
          agree_photo       AS "agreePhoto",
          signature,
          label_id          AS "labelId",
          label_name        AS "labelName",
          created_at        AS "createdAt",
          colour            AS "colour",
          payment_status,
          status,
          tc_client_id      AS "tcClientId",
          tc_service_id     AS "tcServiceId",
          credit_request_error AS "creditRequestError",
          credit_request_error_message AS "creditRequestErrorMessage",

          -- Attribution (flat)
          COALESCE(utm, '{}'::jsonb)       AS "utm",
          landing_url                       AS "landing_url",
          landing_url                       AS "landingUrl",
          referrer                          AS "referrer",
          (COALESCE(utm, '{}'::jsonb)->>'utm_source') AS "utmSource",
          (COALESCE(utm, '{}'::jsonb)->>'utm_campaign') AS "utmCampaign",

          preferred_tutor_id    AS "preferredTutorId",
          preferred_tutor_name  AS "preferredTutorName",

          -- Attribution (nested)
          jsonb_build_object(
            'utm',        COALESCE(utm, '{}'::jsonb),
            'landing_url', landing_url,
            'referrer',    referrer
          ) AS "attribution"
        FROM booking_submissions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
      `;
      const queryParamsWithPagination = [...queryParams, pagination.limit, pagination.offset];
      const {
        rows
      } = await pool.query(selectQuery, queryParamsWithPagination);

      return createPaginatedResponse(rows, pagination, total);
    }, 30); // 30 second TTL

    res.json(result);
  } catch (err) {
    logger.error({ err: err }, 'GET /api/submissions failed:');
    res.status(500).json({
      error: 'Could not fetch submissions'
    });
  }
}));
router.post('/', asyncHandler(async (req, res) => {
  // logger.info({ data: req.body }, 'Request Body');
  const {
    bookingType,
    actualPrice,
    originalPrice = actualPrice,
    parentFirst,
    parentLast,
    parentEmail,
    parentPhone,
    studentType,
    students,
    slots,
    heardAbout,
    address,
    agreeCancel,
    agreeService,
    agreePhoto,
    signature,
    labelId,
    labelName,
    selectedSessions,
    lessonType,
    isTrial = false,
    isDraft = false,
    sessionId = null,
    timezone,
    colour,
    attribution = {},
    serviceId = null, // For subscription forms
    willUseSubscriptionFlow = false, // Flag indicating subscription flow
    isStaffBooking = false, // Flag indicating staff booking
    preferredTutorId = null, // Tutor preference from public profile page
    preferredTutorName = null
  } = req.body;
  const utm = attribution.utm || {};
  const landingUrl = attribution.landing_url || null;
  const referrer = attribution.referrer || null;
  const status = isDraft ? 'draft' : 'submitted';
  const listId = isDraft ? process.env.LIST_A_ID : process.env.LIST_B_ID;
  try {
    let existingDraftId = null;
    if (sessionId) {
      const existing = await pool.query(`SELECT id, klaviyo_id, klaviyo_profile_created FROM booking_submissions WHERE session_id = $1 AND status = 'draft'`, [sessionId]);
      if (existing.rows.length > 0) {
        existingDraftId = existing.rows[0].id;
        const existingKlaviyoId = existing.rows[0]?.klaviyo_id;
        const profileCreated = existing.rows[0]?.klaviyo_profile_created;
        const { 
          rows: updatedRows
        } = await pool.query(`UPDATE booking_submissions SET
    booking_type = $1,
    actual_price = $2,
    parent_first = $3,
    parent_last = $4,
    parent_email = $5,
    parent_phone = $6,
    student_type = $7,
    students = $8,
    slots = $9,
    heard_about = $10,
    address = $11,
    agree_cancel = $12,
    agree_service = $13,
    agree_photo = $14,
    signature = $15,
    label_id = $16,
    label_name = $17,
    selected_sessions = $18,
    lesson_type = $19,
    status = $20,
    original_price = $21,
    timezone = $22,
    is_trial = $23,
    colour = COALESCE($24, colour),
    utm = $25::jsonb,
    landing_url = $26,
    referrer = $27,
    klaviyo_id = $28,
    klaviyo_profile_created = $29,
    preferred_tutor_id = $30,
    preferred_tutor_name = $31,
    created_at = CASE WHEN $20 = 'submitted' THEN NOW() ELSE created_at END
  WHERE id = $32
  RETURNING id, created_at`, [bookingType, actualPrice, parentFirst, parentLast, parentEmail, parentPhone, studentType, JSON.stringify(students || []), JSON.stringify(slots || []), heardAbout, JSON.stringify(address || {}), agreeCancel, agreeService, agreePhoto, signature, labelId, labelName, JSON.stringify(selectedSessions || []), lessonType, status, originalPrice, timezone, isTrial, colour, JSON.stringify(utm || {}), landingUrl, referrer, existingKlaviyoId || null, true, preferredTutorId ? parseInt(preferredTutorId) : null, preferredTutorName || null, existingDraftId]);
        // logger.info({ isDraft, existingDraftId, sessionId }, isDraft ? 'Draft updated' : 'Finalized');
        if (!existingKlaviyoId) {
          try {
            const profileExists = await checkKlaviyoProfileExistence(parentEmail);
            if (!profileExists) {
              logger.info(`Attempting to create Klaviyo profile for ${parentEmail}`);
              const isValidPhoneNumber = phone => {
                const regex = /^\+\d{10,15}$/;
                return regex.test(phone);
              };
              if (!isValidPhoneNumber(parentPhone)) {
                logger.warn(`Invalid phone number format: ${parentPhone}. Skipping Klaviyo profile creation.`);
              } else {
                const profileData = {
                  email: parentEmail,
                  first_name: parentFirst,
                  last_name: parentLast,
                  phone_number: parentPhone,
                  location: {
                    address1: address.street,
                    city: address.city,
                    region: address.state,
                    zip: address.zip,
                    country: 'US'
                  }
                };
                const profileId = await createKlaviyoProfile(profileData);
                logger.info(`Profile created with ID: ${profileId}`);
                await addToKlaviyoList(profileId, listId);
                logger.info('Profile added to Klaviyo list successfully!');
                await pool.query(`UPDATE booking_submissions SET klaviyo_id = $1 WHERE id = $2`, [profileId, existingDraftId]);
                logger.info('Profile ID saved to the submission');
              }
            } else {
              logger.info('Profile already exists in Klaviyo, skipping profile creation.');
              await pool.query(`UPDATE booking_submissions SET klaviyo_id = $1 WHERE id = $2`, [profileExists, existingDraftId]);
              logger.info('Existing Profile ID saved to the submission');
              await addToKlaviyoList(profileExists, listId);
              logger.info('Existing profile added to Klaviyo list');
            }
          } catch (err) {
            logger.error({ error: err.message }, 'Klaviyo integration failed:');
            logger.warn('Continuing without Klaviyo integration');
          }
        }
        // Trigger automation for booking submission
        try {
          const taskAutomationService = require('../services/task-automation-service');
          taskAutomationService.initialize(pool);
          await taskAutomationService.triggerExternalEvent('booking_submission', {
            submission_id: updatedRows[0].id,
            parent_email: parentEmail,
            parent_name: `${parentFirst} ${parentLast}`,
            booking_type: bookingType,
            label_name: labelName,
            is_trial: isTrial,
            student_count: students?.length || 0
          }, pool);
        } catch (automationError) {
          logger.error({ data: automationError }, 'Automation trigger failed (non-blocking):');
        }
        
        // Send Slack notification for submission (draft or final)
        try {
          const SlackAlerts = require('../utils/slackAlerts');
          const slackAlerts = new SlackAlerts();
          
          // For finalized submissions, check TutorCruncher client status
          let tcClientId = null;
          let tcClientStatus = null;
          if (!isDraft) {
            try {
              // Get tc_client_id from submission
              const submissionResult = await pool.query(
                'SELECT tc_client_id FROM booking_submissions WHERE id = $1',
                [updatedRows[0].id]
              );
              tcClientId = submissionResult.rows[0]?.tc_client_id;
              
              // Fetch client status from TutorCruncher if client ID exists
              if (tcClientId) {
                try {
                  const tcResponse = await tutorCruncherAPI.get(`/clients/${tcClientId}/`);
                  tcClientStatus = tcResponse.data?.status || null;
                } catch (tcError) {
                  logger.warn({ data: tcError.message }, `Could not fetch TutorCruncher client status for ${tcClientId}:`);
                }
              }
            } catch (statusError) {
              logger.warn({ data: statusError.message }, 'Error checking TutorCruncher client status (non-blocking):');
            }
          }
          
          await slackAlerts.sendBookingFormSubmissionNotification({
            submissionId: updatedRows[0].id,
            status: status,
            parentFirst,
            parentLast,
            parentEmail,
            parentPhone,
            bookingType,
            labelName,
            price: actualPrice,
            studentCount: students?.length || 0,
            isDraft: isDraft,
            createdAt: updatedRows[0].created_at,
            sessionId,
            tcClientId,
            tcClientStatus,
            preferredTutorName
          });
        } catch (slackError) {
          logger.error({ data: slackError.message }, 'Failed to send Slack notification (non-blocking):');
          // Don't fail the request if Slack notification fails
        }

        return res.status(200).json(updatedRows[0]);
      }
      // If no draft exists but we're trying to submit (isDraft = false), allow direct submission
      // This handles cases where draft creation failed or was cleared
      if (!isDraft) {
        // Fall through to create a new submission directly
        logger.info(`No draft found for session ${sessionId}, creating direct submission`);
      }
    }
    
    // Create a new submission (either as draft or direct submission)
    const {
      rows
    } = await pool.query(`INSERT INTO booking_submissions (
    booking_type, actual_price, parent_first, parent_last, parent_email, parent_phone,
    student_type, students, slots, heard_about, address,
    agree_cancel, agree_service, agree_photo, signature,
    label_id, label_name, selected_sessions, lesson_type, status, session_id,
    original_price, timezone, is_trial, colour,
    utm, landing_url, referrer,
    "isStaffBooking",
    klaviyo_id,
    preferred_tutor_id, preferred_tutor_name
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15,
    $16, $17, $18, $19, $20, $21,
    $22, $23, $24, $25,
    $26::jsonb, $27, $28,
    $29,
    $30,
    $31, $32
  )
  RETURNING id, created_at`, [bookingType, actualPrice, parentFirst, parentLast, parentEmail, parentPhone, studentType, JSON.stringify(students || []), JSON.stringify(slots || []), heardAbout, JSON.stringify(address || {}), agreeCancel, agreeService, agreePhoto, signature, labelId, labelName, JSON.stringify(selectedSessions || []), lessonType, status, sessionId, originalPrice, timezone, isTrial, colour, JSON.stringify(utm || {}), landingUrl, referrer, isStaffBooking || false, null, preferredTutorId ? parseInt(preferredTutorId) : null, preferredTutorName || null]);
    
    const submissionId = rows[0].id;
    
    // Handle Klaviyo integration
    try {
      const profileExists = await checkKlaviyoProfileExistence(parentEmail);
      if (!profileExists) {
        logger.info(`Attempting to create Klaviyo profile for ${parentEmail}`);
        const isValidPhoneNumber = phone => {
          const regex = /^\+\d{10,15}$/;
          return regex.test(phone);
        };
        if (!isValidPhoneNumber(parentPhone)) {
          logger.warn(`Invalid phone number format: ${parentPhone}. Skipping Klaviyo profile creation.`);
        } else {
          const profileData = {
            email: parentEmail,
            first_name: parentFirst,
            last_name: parentLast,
            phone_number: parentPhone,
            location: {
              address1: address.street,
              city: address.city,
              region: address.state,
              zip: address.zip,
              country: 'US'
            }
          };
          const profileId = await createKlaviyoProfile(profileData);
          logger.info(`Profile created with ID: ${profileId}`);
          await pool.query(`UPDATE booking_submissions SET klaviyo_id = $1 WHERE id = $2`, [profileId, submissionId]);
          logger.info('Profile ID saved to the submission');
          logger.info('Adding profile to Klaviyo list...');
          await addToKlaviyoList(profileId, listId);
          logger.info('Profile added to Klaviyo list successfully!');
        }
      } else {
        logger.info('Profile already exists in Klaviyo, skipping profile creation.');
        await pool.query(`UPDATE booking_submissions SET klaviyo_id = $1, klaviyo_profile_created = $2 WHERE id = $3`, [profileExists, true, submissionId]);
        logger.info('Existing Profile ID saved to the submission');
        await addToKlaviyoList(profileExists, listId);
        logger.info('Existing profile added to Klaviyo list');
      }
    } catch (err) {
      logger.error({ error: err.message }, 'Klaviyo integration failed:');
      logger.warn('Continuing without Klaviyo integration');
    }
    
    // Link any existing form events to this submission
    if (sessionId) {
      try {
        await pool.query(
          `UPDATE booking_form_events 
           SET submission_id = $1 
           WHERE session_id = $2 AND submission_id IS NULL`,
          [submissionId, sessionId]
        );
      } catch (err) {
        logger.error({ err: err }, 'Error linking form events to submission:');
        // Don't fail the request if event linking fails
      }
    }
    
    // For subscription forms: Pre-create TutorCruncher client and enrollment record
    if (!isDraft && willUseSubscriptionFlow && serviceId && address) {
      try {
        logger.info(`🔄 Pre-creating TutorCruncher client for subscription submission ${submissionId}`);
        
        // Import client creation utility
        const { createOrUpdateClient } = require('../utils/clientManager');
        
        // Convert state name to code if needed
        const stateNameToCode = {
          'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
          'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
          'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
          'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
          'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
          'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
          'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
          'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
          'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
          'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
          'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
          'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
          'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC'
        };
        
        const isUSAddress = address.country === 'United States';
        let stateCode = null;
        if (isUSAddress && address.state) {
          const stateName = (address.state || '').trim();
          if (stateName.length === 2 && /^[A-Z]{2}$/i.test(stateName)) {
            stateCode = stateName.toUpperCase();
          } else {
            stateCode = stateNameToCode[stateName] || null;
          }
        }
        
        // Create TutorCruncher client payload
        const clientPayload = {
          first_name: (parentFirst || '').trim(),
          last_name: (parentLast || '').trim(),
          email: (parentEmail || '').trim().toLowerCase(),
          phone: (parentPhone || '').trim(),
          street: (address.street || '').trim(),
          town: (address.city || '').trim(),
          state: stateCode || (address.state || '').trim(),
          country: getTutorCruncherCountryId(address.country),
          postcode: (address.zip || '').trim(),
          timezone: timezone || 'America/New_York',
          status: 'live',
          received_notifications: [
            'invoice_reminders',
            'invoices',
            'apt_reminders',
            'pfi_reminders',
            'credit-requests',
            'broadcasts',
            'lesson_scheduled'
          ],
          send_emails: false
        };
        
        // Create client
        const clientResult = await createOrUpdateClient(clientPayload, parentEmail);
        const tutorcruncherClientId = clientResult.clientId;
        
        // Update submission with TutorCruncher client ID
        await pool.query(
          `UPDATE booking_submissions SET tc_client_id = $1 WHERE id = $2`,
          [tutorcruncherClientId, submissionId]
        );
        
        logger.info(`✅ Pre-created TutorCruncher client ${tutorcruncherClientId} for submission ${submissionId}`);
        
        // Create pending enrollment record
        try {
          const subscriptionBillingService = require('../services/subscription-billing-service');
          
          // Get term billing config
          const configResult = await pool.query(
            'SELECT * FROM term_billing_configs WHERE service_id = $1 AND is_active = true',
            [serviceId]
          );
          
          if (configResult.rows.length > 0) {
            const config = configResult.rows[0];
            
            // Get enrollment date (use first slot date or today)
            const enrollmentDate = slots?.[0]?.date 
              ? new Date(slots[0].date).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            
            const enrollDate = new Date(enrollmentDate);
            const nextBillingDate = subscriptionBillingService.getNextBillingDate(enrollDate);
            
            // Parse JSONB fields
            let classDates = config.class_dates;
            if (typeof classDates === 'string') {
              try {
                classDates = JSON.parse(classDates);
              } catch (e) {
                classDates = [];
              }
            }
            
            const sortedDates = (classDates || []).map(d => new Date(d)).sort((a, b) => a - b);
            const finalClassDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : new Date();
            
            // Create enrollment record with pending status
            const enrollmentResult = await pool.query(
              `INSERT INTO subscription_enrollments (
                service_id, client_id, stripe_customer_id, stripe_subscription_id,
                payment_type, enrollment_date, first_billing_date, final_class_date,
                current_month_lessons, total_lessons_remaining, status, metadata
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              RETURNING *`,
              [
                serviceId,
                tutorcruncherClientId,
                null, // stripe_customer_id (will be set when Stripe customer created)
                null, // stripe_subscription_id (will be set when subscription created)
                'monthly',
                enrollmentDate,
                nextBillingDate.toISOString().split('T')[0],
                finalClassDate.toISOString().split('T')[0],
                0, // current_month_lessons (will be calculated)
                classDates.length,
                'pending', // Status: pending until subscription is created
                JSON.stringify({
                  submissionId: submissionId,
                  parentEmail: parentEmail,
                  parentName: `${parentFirst} ${parentLast}`,
                  preCreated: true,
                  createdAt: new Date().toISOString()
                })
              ]
            );
            
            const enrollment = enrollmentResult.rows[0];
            logger.info(`✅ Created pending enrollment record ${enrollment.id} for submission ${submissionId}`);
            
            // Store enrollment ID in submission metadata or separate field
            // We'll use a custom field or store in a separate table
            // For now, we can query by submissionId from enrollment metadata
          }
        } catch (enrollmentError) {
          logger.error({ data: enrollmentError.message }, '⚠️ Could not create pending enrollment record:');
          // Don't fail submission creation if enrollment creation fails
        }
        
      } catch (clientError) {
        logger.error({ data: clientError.message }, '⚠️ Could not pre-create TutorCruncher client:');
        // Don't fail submission creation if client creation fails
        // It will be created during subscription creation
      }
    }
    
    // Trigger automation for booking submission (only for non-drafts)
    if (!isDraft) {
      try {
        const taskAutomationService = require('../services/task-automation-service');
        taskAutomationService.initialize(pool);
        await taskAutomationService.triggerExternalEvent('booking_submission', {
          submission_id: submissionId,
          parent_email: parentEmail,
          parent_name: `${parentFirst} ${parentLast}`,
          booking_type: bookingType,
          label_name: labelName,
          is_trial: isTrial,
          student_count: students?.length || 0
        }, pool);
      } catch (automationError) {
        logger.error({ data: automationError }, 'Automation trigger failed (non-blocking):');
      }
    }
    
    // Send Slack notification for submission (draft or final)
    try {
      const SlackAlerts = require('../utils/slackAlerts');
      const slackAlerts = new SlackAlerts();
      
      // For finalized submissions, check TutorCruncher client status
      let tcClientId = null;
      let tcClientStatus = null;
      if (!isDraft) {
        try {
          // Get tc_client_id from submission (may be set later in payment flow)
          const submissionResult = await pool.query(
            'SELECT tc_client_id FROM booking_submissions WHERE id = $1',
            [submissionId]
          );
          tcClientId = submissionResult.rows[0]?.tc_client_id;
          
          // Fetch client status from TutorCruncher if client ID exists
          if (tcClientId) {
            try {
              const tcResponse = await tutorCruncherAPI.get(`/clients/${tcClientId}/`);
              tcClientStatus = tcResponse.data?.status || null;
            } catch (tcError) {
              logger.warn({ data: tcError.message }, `Could not fetch TutorCruncher client status for ${tcClientId}:`);
            }
          }
        } catch (statusError) {
          logger.warn({ data: statusError.message }, 'Error checking TutorCruncher client status (non-blocking):');
        }
      }
      
      await slackAlerts.sendBookingFormSubmissionNotification({
        submissionId,
        status: status,
        parentFirst,
        parentLast,
        parentEmail,
        parentPhone,
        bookingType,
        labelName,
        price: actualPrice,
        studentCount: students?.length || 0,
        isDraft: isDraft,
        createdAt: rows[0].created_at,
        sessionId,
        tcClientId,
        tcClientStatus,
        preferredTutorName
      });
    } catch (slackError) {
      logger.error({ data: slackError.message }, 'Failed to send Slack notification (non-blocking):');
      // Don't fail the request if Slack notification fails
    }

    // Invalidate submissions cache after creating new submission
    await cache.clearCacheByPrefix('submissions');

    return res.status(isDraft ? 201 : 201).json(rows[0]);
  } catch (err) {
    logger.error({ err: err }, 'POST /api/submissions failed:');
    res.status(500).json({
      error: 'Could not save submission'
    });
  }
}));

// Track booking form events (form progress, steps, Stripe checkout, etc.)
router.post('/track-event', asyncHandler(async (req, res) => {
  try {
    const {
      sessionId,
      submissionId = null,
      eventType,
      stepName = null,
      stepNumber = null,
      metadata = {},
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!eventType) {
      return res.status(400).json({ error: 'eventType is required' });
    }

    // Calculate duration since last event for this session - use location-specific pool if available
    const locationPool = req.locationPool || pool;
    let durationMs = null;
    const lastEvent = await locationPool.query(
      `SELECT created_at FROM booking_form_events 
       WHERE session_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );

    if (lastEvent.rows.length > 0) {
      const now = new Date();
      const lastEventTime = new Date(lastEvent.rows[0].created_at);
      durationMs = Math.max(0, now - lastEventTime);
    }

    // Insert the event - use location-specific pool if available, otherwise default
    const { rows } = await locationPool.query(
      `INSERT INTO booking_form_events 
       (session_id, submission_id, event_type, step_name, step_number, metadata, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING id, created_at`,
      [
        sessionId,
        submissionId,
        eventType,
        stepName,
        stepNumber,
        JSON.stringify(metadata),
        durationMs,
      ]
    );

    // Send Slack notification when someone starts filling out the form
    if (eventType === 'form_start') {
      try {
        const SlackAlerts = require('../utils/slackAlerts');
        const slackAlerts = new SlackAlerts();
        await slackAlerts.sendBookingFormStartNotification({
          sessionId,
          stepName,
          stepNumber,
          metadata
        });
      } catch (slackError) {
        logger.error({ data: slackError.message }, 'Failed to send Slack notification for form start (non-blocking):');
        // Don't fail the request if Slack notification fails
      }
    }

    return res.status(201).json({
      success: true,
      id: rows[0].id,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    logger.error({ err: err }, 'POST /api/submissions/track-event failed:');
    res.status(500).json({
      error: 'Could not track event',
      details: err.message,
    });
  }
}));

// Track booking form page views (landing page views)
// This endpoint tracks when someone views the booking form page, before they start filling it out
router.post('/track-view', asyncHandler(async (req, res) => {
  try {
    const {
      sessionId,
      attribution = {},
      bookingTypeId = null,
      serviceId = null,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const utm = attribution.utm || {};
    const landingUrl = attribution.landing_url || null;
    const referrer = attribution.referrer || null;

    // Check if we've already tracked a view for this session (prevent duplicates)
    const existing = await pool.query(
      `SELECT id FROM booking_form_views WHERE session_id = $1 LIMIT 1`,
      [sessionId]
    );

    if (existing.rows.length > 0) {
      // Already tracked, just return success
      return res.status(200).json({ 
        success: true, 
        message: 'View already tracked for this session',
        id: existing.rows[0].id 
      });
    }

    // Insert the view
    const { rows } = await pool.query(
      `INSERT INTO booking_form_views (
        session_id,
        utm,
        landing_url,
        referrer,
        booking_type_id,
        service_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING id`,
      [sessionId, JSON.stringify(utm), landingUrl, referrer, bookingTypeId, serviceId]
    );

    res.status(201).json({ 
      success: true, 
      id: rows[0].id 
    });
  } catch (err) {
    logger.error({ err: err }, 'Error tracking form view:');
    
    // If table doesn't exist, provide helpful error message
    if (err.code === '42P01') {
      return res.status(500).json({ 
        error: 'Database table booking_form_views does not exist. Please run the migration script.',
        details: err.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Could not track form view',
      details: err.message 
    });
  }
}));

// Get detailed submissions for analytics drill-down
// This endpoint returns filtered submissions based on the card clicked
router.get('/analytics/details', asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, payment_status, utm_source, cardType } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        error: 'startDate and endDate are required'
      });
    }

    // Adjust endDate to include the full day (end of day)
    // Handle both ISO date strings and simple date strings
    // Convert ET dates to UTC for database comparison
    const startDateUTC = etDateToUTC(startDate, false);
    const endDateUTC = etDateToUTC(endDate, true);

    logger.info({ data: { startDate, endDate, startDateUTC, endDateUTC, cardType, payment_status, utm_source } }, 'Analytics details request:');

    // Handle ad impressions, clicks, and spend - these come from ad_spend_data table
    // Support both generic (Meta) and Google-specific card types
    if (cardType === 'ad_impressions' || cardType === 'ad_clicks' || cardType === 'ad_spend' ||
        cardType === 'google_impressions' || cardType === 'google_clicks' || cardType === 'google_spend') {
      try {
        // Determine platform filter
        const isGoogle = cardType === 'google_impressions' || cardType === 'google_clicks' || cardType === 'google_spend';
        const platformFilter = isGoogle ? "AND platform = 'google'" : "AND platform = 'meta'";
        
        let query = `
          SELECT
            id,
            platform,
            campaign_name AS "campaignName",
            utm_campaign AS "utmCampaign",
            adset_name AS "adsetName",
            location,
            date,
            impressions,
            clicks,
            spend,
            ctr,
            cpc,
            conversions
          FROM ad_spend_data
          WHERE date >= $1::date AND date <= $2::date
          ${platformFilter}
        `;
        const params = [startDate, endDate.split('T')[0]]; // Use date only, not timestamp

        query += ` ORDER BY date DESC, platform, campaign_name`;

        const { rows } = await pool.query(query, params);
        
        logger.info(`[Ad Details] Query returned ${rows.length} rows for ${cardType}`);
        if (rows.length > 0) {
          logger.info({ data: {
            date: rows[0].date,
            platform: rows[0].platform,
            impressions: rows[0].impressions,
            clicks: rows[0].clicks,
            spend: rows[0].spend
          } }, '[Ad Details] Sample row:');
        } else {
          logger.info({ data: { startDate, endDate } }, '[Ad Details] No rows found. Query params:');
        }
        
        return res.json({
          submissions: rows.map(row => {
            // PostgreSQL DATE returns as string "YYYY-MM-DD", convert to ISO string
            let dateStr = null;
            if (row.date) {
              if (typeof row.date === 'string') {
                dateStr = row.date; // Already a string like "2025-10-01"
              } else if (row.date.toISOString) {
                dateStr = row.date.toISOString().split('T')[0];
              } else {
                dateStr = row.date.toString();
              }
            }
            return {
              id: row.id,
              date: dateStr,
              platform: row.platform || null,
              campaignName: row.campaignName || null,
              utmCampaign: row.utmCampaign || null,
              adsetName: row.adsetName || null,
              location: row.location || null,
              impressions: parseInt(row.impressions || 0),
              clicks: parseInt(row.clicks || 0),
              spend: parseFloat(row.spend || 0),
              ctr: parseFloat(row.ctr || 0),
              cpc: parseFloat(row.cpc || 0)
            };
          }),
          count: rows.length
        });
      } catch (err) {
        if (err.code === '42P01' && err.message.includes('ad_spend_data')) {
          return res.status(500).json({
            error: 'Ad data table not found',
            details: 'The ad_spend_data table does not exist. Please run the migration: psql $DATABASE_URL -f migrations/create_ad_spend_data_table.sql',
            submissions: [],
            count: 0
          });
        }
        throw err;
      }
    }

    // Handle Google Conversions - show conversion details and tie them to customers
    if (cardType === 'google_conversions') {
      try {
        // Get Google ad spend data with conversions
        const adDataQuery = `
          SELECT
            date,
            campaign_name AS "campaignName",
            utm_campaign AS "utmCampaign",
            conversions,
            clicks,
            spend
          FROM ad_spend_data
          WHERE date >= $1::date AND date <= $2::date
            AND platform = 'google'
            AND conversions > 0
          ORDER BY date DESC, conversions DESC
        `;
        const adDataParams = [startDateUTC.split('T')[0], endDateUTC.split('T')[0]];
        const { rows: adDataRows } = await pool.query(adDataQuery, adDataParams);
        
        // Get booking submissions that match Google campaigns
        const submissionsQuery = `
          SELECT
            id,
            booking_type,
            actual_price,
            label_name,
            created_at,
            parent_first,
            parent_last,
            parent_email,
            parent_phone,
            payment_status,
            tc_client_id,
            tc_service_id,
            COALESCE(utm->>'utm_campaign', '') AS utm_campaign,
            COALESCE(utm->>'gclid', '') AS gclid,
            COALESCE(utm->>'utm_source', '') AS utm_source
          FROM booking_submissions
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            AND (
              (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
               AND COALESCE(utm->>'utm_campaign', '') != '')
              OR COALESCE(utm->>'gclid', '') != ''
              OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
            )
            AND payment_status IN ('paid', 'verified')
          ORDER BY created_at DESC
        `;
        const submissionsParams = [startDateUTC, endDateUTC];
        const { rows: submissionRows } = await pool.query(submissionsQuery, submissionsParams);
        
        // Match conversions to submissions by campaign and date
        const conversionDetails = adDataRows.map(adRow => {
          // Find matching submissions for this campaign and date
          const matchingSubmissions = submissionRows.filter(sub => {
            const subDate = new Date(sub.created_at).toISOString().split('T')[0];
            const adDate = typeof adRow.date === 'string' ? adRow.date : adRow.date.toISOString().split('T')[0];
            // Normalize both sides: lowercase + replace spaces with underscores
            const normalize = (s) => (s || '').toLowerCase().replace(/\s+/g, '_');
            return normalize(sub.utm_campaign) === normalize(adRow.utmCampaign) && subDate === adDate;
          });
          
          return {
            date: typeof adRow.date === 'string' ? adRow.date : adRow.date.toISOString().split('T')[0],
            campaignName: adRow.campaignName,
            utmCampaign: adRow.utmCampaign,
            conversions: parseInt(adRow.conversions || 0),
            clicks: parseInt(adRow.clicks || 0),
            spend: parseFloat(adRow.spend || 0),
            matchingSubmissions: matchingSubmissions.map(sub => ({
              id: sub.id,
              parentName: `${sub.parent_first} ${sub.parent_last}`,
              parentEmail: sub.parent_email,
              parentPhone: sub.parent_phone,
              bookingType: sub.booking_type,
              price: parseFloat(sub.actual_price || 0),
              paymentStatus: sub.payment_status,
              tcClientId: sub.tc_client_id,
              tcServiceId: sub.tc_service_id,
              createdAt: sub.created_at,
              gclid: sub.gclid,
              utmCampaign: sub.utm_campaign
            }))
          };
        });
        
        return res.json({
          submissions: conversionDetails,
          count: conversionDetails.length,
          totalConversions: adDataRows.reduce((sum, row) => sum + parseInt(row.conversions || 0), 0),
          totalMatchingSubmissions: submissionRows.length
        });
      } catch (err) {
        logger.error({ err: err }, 'Error fetching Google conversions:');
        return res.status(500).json({
          error: 'Could not fetch Google conversion details',
          details: err.message
        });
      }
    }
    
    // Handle Google ROAS - show individual form completions with LTV
    if (cardType === 'google_roas' || cardType === 'google_ltv_roas') {
      try {
        // Get LTV by label for revenue calculations
        const ltvMetric = req.query.ltvMetric || 'average';
        const ltvByLabel = await getLTVByLabel(ltvMetric);
        
        // Get Google ad spend for the period
        const adSpendQuery = `
          SELECT COALESCE(SUM(spend), 0) AS total_spend
          FROM ad_spend_data
          WHERE date >= $1::date AND date <= $2::date
            AND platform = 'google'
        `;
        const adSpendParams = [startDateUTC.split('T')[0], endDateUTC.split('T')[0]];
        const { rows: adSpendRows } = await pool.query(adSpendQuery, adSpendParams);
        const totalAdSpend = parseFloat(adSpendRows[0]?.total_spend || 0);
        
        // Get individual Google form completions with their details
        let query = `
          SELECT
            id,
            booking_type,
            actual_price,
            label_name,
            created_at,
            parent_first,
            parent_last,
            parent_email,
            payment_status,
            COALESCE(utm->>'utm_campaign', '') AS utm_campaign,
            tc_client_id,
            tc_service_id
          FROM booking_submissions
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            AND (
              (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
               AND COALESCE(utm->>'utm_campaign', '') != '')
              OR COALESCE(utm->>'gclid', '') != ''
              OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
            )
            AND payment_status IN ('paid', 'verified')
          ORDER BY created_at DESC
        `;
        const params = [startDateUTC, endDateUTC];

        const { rows } = await pool.query(query, params);
        
        // Calculate LTV for each completion and build response
        let totalLtv = 0;
        const submissionsWithLtv = rows.map(row => {
          // Get label from label_name or booking_type
          let label = row.label_name;
          if (!label && row.booking_type) {
            label = getLabelFromBookingType(row.booking_type);
          }
          
          // Get LTV for this label - ensure numeric conversion to prevent string concatenation
          const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
          const finalLtv = ltv > 0 ? ltv : parseFloat(row.actual_price || 0);
          
          totalLtv += finalLtv;
          
          return {
            id: row.id,
            parentName: `${row.parent_first} ${row.parent_last}`,
            parentEmail: row.parent_email,
            bookingType: row.bookingType,
            price: parseFloat(row.actual_price || 0),
            ltv: finalLtv,
            label: label,
            paymentStatus: row.payment_status,
            createdAt: row.created_at,
            utmCampaign: row.utm_campaign,
            tcClientId: row.tc_client_id,
            tcServiceId: row.tc_service_id
          };
        });
        
        const roas = totalAdSpend > 0 ? (totalLtv / totalAdSpend).toFixed(2) : '0.00';
        
        return res.json({
          submissions: submissionsWithLtv,
          count: submissionsWithLtv.length,
          summary: {
            totalAdSpend: totalAdSpend,
            totalLtv: totalLtv,
            roas: parseFloat(roas)
          }
        });
      } catch (err) {
        logger.error({ err: err }, 'Error fetching Google ROAS:');
        return res.status(500).json({
          error: 'Could not fetch Google ROAS details',
          details: err.message
        });
      }
    }
    
    // Handle Google CPL/CPR - show individual leads/registrations
    if (cardType === 'google_cpl' || cardType === 'google_cpr') {
      try {
        // Get Google ad spend for the period
        const adSpendQuery = `
          SELECT COALESCE(SUM(spend), 0) AS total_spend
          FROM ad_spend_data
          WHERE date >= $1::date AND date <= $2::date
            AND platform = 'google'
        `;
        const adSpendParams = [startDateUTC.split('T')[0], endDateUTC.split('T')[0]];
        const { rows: adSpendRows } = await pool.query(adSpendQuery, adSpendParams);
        const totalAdSpend = parseFloat(adSpendRows[0]?.total_spend || 0);
        
        // Get individual Google form starts (for CPL) or completions (for CPR)
        const isCPR = cardType === 'google_cpr';
        let query = `
          SELECT
            id,
            booking_type,
            actual_price,
            label_name,
            created_at,
            parent_first,
            parent_last,
            parent_email,
            parent_phone,
            payment_status,
            COALESCE(utm->>'utm_campaign', '') AS utm_campaign,
            COALESCE(utm->>'gclid', '') AS gclid,
            tc_client_id,
            tc_service_id
          FROM booking_submissions
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            AND (
              (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
               AND COALESCE(utm->>'utm_campaign', '') != '')
              OR COALESCE(utm->>'gclid', '') != ''
              OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
            )
        `;
        
        if (isCPR) {
          query += ` AND payment_status IN ('paid', 'verified')`;
        }
        
        query += ` ORDER BY created_at DESC`;
        const params = [startDateUTC, endDateUTC];

        const { rows } = await pool.query(query, params);
        
        const costPer = totalAdSpend > 0 && rows.length > 0 
          ? (totalAdSpend / rows.length).toFixed(2)
          : '0.00';
        
        return res.json({
          submissions: rows.map(row => ({
            id: row.id,
            parentName: `${row.parent_first} ${row.parent_last}`,
            parentEmail: row.parent_email,
            parentPhone: row.parent_phone,
            bookingType: row.booking_type,
            price: parseFloat(row.actual_price || 0),
            paymentStatus: row.payment_status,
            createdAt: row.created_at,
            utmCampaign: row.utm_campaign,
            gclid: row.gclid,
            tcClientId: row.tc_client_id,
            tcServiceId: row.tc_service_id
          })),
          count: rows.length,
          summary: {
            totalAdSpend: totalAdSpend,
            totalLeads: rows.length,
            costPer: parseFloat(costPer)
          }
        });
      } catch (err) {
        logger.error({ err: err }, 'Error fetching Google CPL/CPR:');
        return res.status(500).json({
          error: 'Could not fetch Google CPL/CPR details',
          details: err.message
        });
      }
    }
    
    // Handle ROAS - show individual form completions with LTV
    if (cardType === 'roas') {
      try {
        // Get LTV by label for revenue calculations (default to average for backward compatibility)
        const ltvMetric = req.query.ltvMetric || 'average';
        const ltvByLabel = await getLTVByLabel(ltvMetric);
        
        // Get Meta ad spend for the period
        const adSpendQuery = `
          SELECT COALESCE(SUM(spend), 0) AS total_spend
          FROM ad_spend_data
          WHERE date >= $1::date AND date <= $2::date
            AND platform = 'meta'
        `;
        const adSpendParams = [startDateUTC.split('T')[0], endDateUTC.split('T')[0]];
        const { rows: adSpendRows } = await pool.query(adSpendQuery, adSpendParams);
        const totalAdSpend = parseFloat(adSpendRows[0]?.total_spend || 0);
        
        // Get individual Meta form completions with their details
        let query = `
          SELECT
            id,
            booking_type,
            actual_price,
            label_name,
            created_at,
            parent_first,
            parent_last,
            parent_email,
            payment_status,
            COALESCE(utm->>'utm_campaign', '') AS utm_campaign
          FROM booking_submissions
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            AND (
              -- UTM-based attribution (existing)
              (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
               AND COALESCE(utm->>'utm_campaign', '') != '')
              OR
              -- heard_about field attribution (new)
              (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
            )
            AND payment_status IN ('paid', 'verified')
          ORDER BY created_at DESC
        `;
        const params = [startDateUTC, endDateUTC];

        const { rows } = await pool.query(query, params);
        
        // Calculate LTV for each completion and build response
        let totalLtv = 0;
        const submissionsWithLtv = rows.map(row => {
          // Get label from label_name or booking_type
          let label = row.label_name;
          if (!label && row.booking_type) {
            label = getLabelFromBookingType(row.booking_type);
          }
          
          // Get LTV for this label - ensure numeric conversion to prevent string concatenation
          const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
          const finalLtv = ltv > 0 ? ltv : parseFloat(row.actual_price || 0);
          
          totalLtv += finalLtv;
          
          return {
            id: row.id,
            date: row.created_at,
            parentName: `${row.parent_first || ''} ${row.parent_last || ''}`.trim(),
            email: row.parent_email,
            paymentStatus: row.payment_status,
            amount: parseFloat(row.actual_price || 0),
            bookingType: row.booking_type,
            labelName: label || row.label_name || 'Unknown',
            ltv: finalLtv,
            utmCampaign: row.utm_campaign
          };
        });
        
        const roas = totalAdSpend > 0 && totalLtv > 0 
          ? parseFloat((totalLtv / totalAdSpend).toFixed(2))
          : 0;
        
        return res.json({
          submissions: submissionsWithLtv,
          summary: {
            totalCompletions: submissionsWithLtv.length,
            totalLtv: totalLtv,
            totalAdSpend: totalAdSpend,
            roas: roas
          },
          count: submissionsWithLtv.length
        });
      } catch (err) {
        if (err.code === '42P01' && err.message.includes('ad_spend_data')) {
          return res.status(500).json({
            error: 'Ad data table not found',
            details: 'The ad_spend_data table does not exist. Please run the migration: psql $DATABASE_URL -f migrations/create_ad_spend_data_table.sql',
            submissions: [],
            summary: {
              totalCompletions: 0,
              totalLtv: 0,
              totalAdSpend: 0,
              roas: 0
            },
            count: 0
          });
        }
        throw err;
      }
    }
    
    // Handle CPL, CPR - these require joining ad_spend_data with booking_submissions
    if (cardType === 'cpl' || cardType === 'cpr') {
      try {
        // Get LTV by label for revenue calculations
        const ltvByLabel = await getLTVByLabel();
        
        // For ROAS, get detailed submission data to calculate LTV-based revenue
        let query = `
          WITH ad_data AS (
            SELECT
              date,
              platform,
              campaign_name AS "campaignName",
              utm_campaign AS "utmCampaign",
              SUM(spend) AS ad_spend,
              SUM(impressions) AS impressions,
              SUM(clicks) AS clicks
            FROM ad_spend_data
            WHERE date >= $1::date AND date <= $2::date
            GROUP BY date, platform, campaign_name, utm_campaign
          ),
          submission_data AS (
            SELECT
              DATE(created_at) AS date,
              COALESCE(utm->>'utm_campaign', '') AS utm_campaign,
              COUNT(*) FILTER (WHERE status IN ('draft', 'submitted')) AS form_starts,
              COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
              SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
              -- Include label and booking type details for LTV calculation
              json_agg(
                json_build_object(
                  'label_name', label_name,
                  'booking_type', booking_type,
                  'actual_price', actual_price,
                  'payment_status', payment_status
                )
              ) FILTER (WHERE payment_status IN ('paid', 'verified')) AS completion_details
            FROM booking_submissions
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
              AND COALESCE(utm->>'utm_campaign', '') != ''
            GROUP BY DATE(created_at), COALESCE(utm->>'utm_campaign', '')
          )
          SELECT
            COALESCE(ad.date, sub.date) AS date,
            ad.platform,
            ad."campaignName",
            ad."utmCampaign",
            COALESCE(ad.ad_spend, 0) AS "adSpend",
            COALESCE(sub.form_starts, 0) AS "formStarts",
            COALESCE(sub.form_completions, 0) AS "formCompletions",
            COALESCE(sub.revenue, 0) AS revenue,
            sub.completion_details,
            CASE 
              WHEN COALESCE(ad.ad_spend, 0) > 0 AND COALESCE(sub.revenue, 0) > 0 
              THEN ROUND((COALESCE(sub.revenue, 0) / COALESCE(ad.ad_spend, 0))::numeric, 2)
              ELSE 0
            END AS roas,
            CASE 
              WHEN COALESCE(sub.form_starts, 0) > 0 AND COALESCE(ad.ad_spend, 0) > 0
              THEN ROUND((COALESCE(ad.ad_spend, 0) / COALESCE(sub.form_starts, 0))::numeric, 2)
              ELSE 0
            END AS cpl,
            CASE 
              WHEN COALESCE(sub.form_completions, 0) > 0 AND COALESCE(ad.ad_spend, 0) > 0
              THEN ROUND((COALESCE(ad.ad_spend, 0) / COALESCE(sub.form_completions, 0))::numeric, 2)
              ELSE 0
            END AS cpr
          FROM ad_data ad
          FULL OUTER JOIN submission_data sub 
            ON ad.date = sub.date 
            AND COALESCE(ad."utmCampaign", '') = COALESCE(sub.utm_campaign, '')
          WHERE ad.date IS NOT NULL OR sub.date IS NOT NULL
          ORDER BY COALESCE(ad.date, sub.date) DESC, ad.platform, ad."campaignName"
        `;
        const params = [startDateUTC, endDateUTC];

        const { rows } = await pool.query(query, params);
        
        return res.json({
          submissions: rows.map((row, idx) => {
            // Calculate LTV-based revenue
            let ltvRevenue = 0;
            if (row.completion_details && Array.isArray(row.completion_details)) {
              row.completion_details.forEach(detail => {
                let label = detail.label_name;
                if (!label && detail.booking_type) {
                  label = getLabelFromBookingType(detail.booking_type);
                }
                // Ensure numeric conversion to prevent string concatenation
                const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
                ltvRevenue += ltv > 0 ? ltv : parseFloat(detail.actual_price || 0);
              });
            }
            
            const finalRevenue = ltvRevenue > 0 ? ltvRevenue : parseFloat(row.revenue || 0);
            const finalRoas = row.adSpend > 0 && finalRevenue > 0 
              ? parseFloat((finalRevenue / row.adSpend).toFixed(2))
              : parseFloat(row.roas || 0);
            
            // PostgreSQL DATE returns as string "YYYY-MM-DD", convert to ISO string
            let dateStr = null;
            if (row.date) {
              if (typeof row.date === 'string') {
                dateStr = row.date; // Already a string like "2025-10-01"
              } else if (row.date.toISOString) {
                dateStr = row.date.toISOString().split('T')[0];
              } else {
                dateStr = row.date.toString();
              }
            }
            return {
              id: idx + 1, // Generate ID since we're aggregating
              date: dateStr,
              platform: row.platform || null,
              campaignName: row.campaignName || null,
              utmCampaign: row.utmCampaign || null,
              adSpend: parseFloat(row.adSpend || 0),
              formStarts: parseInt(row.formStarts || 0),
              formCompletions: parseInt(row.formCompletions || 0),
              revenue: finalRevenue,
              roas: finalRoas,
              cpl: parseFloat(row.cpl || 0),
              cpr: parseFloat(row.cpr || 0),
              conversions: parseInt(row.conversions || 0),
              completionDetails: row.completion_details || []
            };
          }),
          count: rows.length
        });
      } catch (err) {
        if (err.code === '42P01' && err.message.includes('ad_spend_data')) {
          return res.status(500).json({
            error: 'Ad data table not found',
            details: 'The ad_spend_data table does not exist. Please run the migration: psql $DATABASE_URL -f migrations/create_ad_spend_data_table.sql',
            submissions: [],
            count: 0
          });
        }
        throw err;
      }
    }

    // Handle form_views differently - they come from booking_form_views table
    if (cardType === 'form_views' || cardType === 'facebook_form_views' || cardType === 'google_form_views') {
      let query = `
        SELECT
          id,
          session_id AS "sessionId",
          created_at AS "createdAt",
          utm->>'utm_source' AS "utmSource",
          utm->>'utm_campaign' AS "utmCampaign",
          utm->>'utm_medium' AS "utmMedium",
          utm->>'gclid' AS "gclid",
          landing_url AS "landingUrl",
          referrer
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
      `;
      const params = [startDateUTC, endDateUTC];

      if (utm_source === 'facebook' || cardType === 'facebook_form_views') {
        // Note: booking_form_views table doesn't have heard_about field
        // Only UTM-based attribution is available for form views
        query += ` AND (
          LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
          AND COALESCE(utm->>'utm_campaign', '') != ''
        )`;
      } else if (utm_source === 'google' || cardType === 'google_form_views') {
        // Google form views: UTM-based OR gclid
        query += ` AND (
          (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
           AND COALESCE(utm->>'utm_campaign', '') != '')
          OR COALESCE(utm->>'gclid', '') != ''
          OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
        )`;
      }

      query += ` ORDER BY created_at DESC`;

      const { rows } = await pool.query(query, params);
      
      // For form views, we don't have submission data, so return view data
      return res.json({
        submissions: rows.map(row => ({
          id: row.id,
          createdAt: row.createdAt,
          sessionId: row.sessionId,
          utmSource: row.utmSource,
          utmCampaign: row.utmCampaign,
          utmMedium: row.utmMedium,
          gclid: row.gclid,
          landingUrl: row.landingUrl,
          referrer: row.referrer,
          type: 'view'
        })),
        count: rows.length
      });
    }

    // For submissions, build the query with filters
    // Join with ad_spend_data to get location information for meta registrations
    let query = `
      SELECT
        bs.id,
        bs.booking_type      AS "bookingType",
        bs.actual_price      AS "actualPrice",
        bs.original_price    AS "originalPrice",
        bs.parent_first      AS "parentFirst",
        bs.parent_last       AS "parentLast",
        bs.parent_email      AS "parentEmail",
        bs.parent_phone      AS "parentPhone",
        bs.created_at        AS "createdAt",
        bs.payment_status,
        bs.status,
        COALESCE(bs.utm, '{}'::jsonb)       AS "utm",
        (COALESCE(bs.utm, '{}'::jsonb)->>'utm_source') AS "utmSource",
        (COALESCE(bs.utm, '{}'::jsonb)->>'utm_campaign') AS "utmCampaign",
        -- Join with ad_spend_data to get location for meta-attributed submissions
        CASE 
          WHEN LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
            OR LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram')
          THEN (
            SELECT location 
            FROM ad_spend_data 
            WHERE platform = 'meta'
              AND utm_campaign = COALESCE(bs.utm->>'utm_campaign', '')
              AND DATE(date) = DATE(bs.created_at)
            ORDER BY date DESC
            LIMIT 1
          )
          ELSE NULL
        END AS location
      FROM booking_submissions bs
      WHERE bs.created_at >= $1::timestamptz AND bs.created_at <= $2::timestamptz
    `;
    const params = [startDateUTC, endDateUTC];
    let paramIndex = 3;

    // Add payment_status filter
    if (payment_status) {
      const statuses = payment_status.split(',');
      if (statuses.length === 1) {
        query += ` AND payment_status = $${paramIndex}`;
        params.push(statuses[0]);
        paramIndex++;
      } else {
        query += ` AND payment_status = ANY($${paramIndex})`;
        params.push(statuses);
        paramIndex++;
      }
    }

    // Add UTM source filter
    if (utm_source) {
      // For Facebook/Meta, match the counting logic: UTM-based OR heard_about field
      if (utm_source.toLowerCase() === 'facebook') {
        query += ` AND (
          -- UTM-based attribution (existing)
          (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
           AND COALESCE(utm->>'utm_campaign', '') != '')
          OR
          -- heard_about field attribution (for August and other submissions)
          (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
        )`;
      } else if (utm_source.toLowerCase() === 'google') {
        // For Google, match UTM-based OR gclid
        query += ` AND (
          (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
           AND COALESCE(utm->>'utm_campaign', '') != '')
          OR COALESCE(utm->>'gclid', '') != ''
          OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
        )`;
      } else {
        query += ` AND LOWER(COALESCE(utm->>'utm_source', '')) = $${paramIndex}`;
        params.push(utm_source.toLowerCase());
        paramIndex++;
      }
    }
    
    // Handle Google-specific card types
    if (cardType && cardType.startsWith('google_')) {
      // Ensure Google filter is applied if not already set
      if (!utm_source || utm_source.toLowerCase() !== 'google') {
        query += ` AND (
          (LOWER(COALESCE(utm->>'utm_source', '')) = 'google' 
           AND COALESCE(utm->>'utm_campaign', '') != '')
          OR COALESCE(utm->>'gclid', '') != ''
          OR LOWER(COALESCE(utm->>'utm_source', '')) LIKE '%google%'
        )`;
      }
    }

    query += ` ORDER BY created_at DESC`;

    logger.info({ data: query.substring(0, 200) + '...' }, 'Executing query:');
    logger.info({ data: params }, 'With params:');

    const { rows } = await pool.query(query, params);

    logger.info(`Found ${rows.length} submissions`);

    res.json({
      submissions: rows,
      count: rows.length
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching submission details:');
    logger.error({ data: err.stack }, 'Error stack:');
    res.status(500).json({
      error: 'Could not fetch submission details',
      details: err.message
    });
  }
}));

// Analytics endpoint for booking form performance metrics
// MUST come before /:id route to avoid matching conflicts
router.get('/analytics/metrics', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate, groupBy = 'month', ltvMetric = 'average' } = req.query;

    logger.info({ data: { startDate, endDate, groupBy } }, 'Analytics metrics request:');

    // Cache key includes all query params that affect results
    const cacheKey = `submissions:analytics:metrics:start:${startDate || 'default'}:end:${endDate || 'default'}:groupBy:${groupBy}:ltvMetric:${ltvMetric}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      // Parse dates, default to current month if not provided
      let start, end;
    if (startDate && endDate) {
      // Convert ET dates to UTC for database comparison
      const startDateUTC = etDateToUTC(startDate, false);
      const endDateUTC = etDateToUTC(endDate, true);
      start = new Date(startDateUTC);
      end = new Date(endDateUTC);
    } else {
      // Default to current month in ET, then convert to UTC
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const startDateUTC = etDateToUTC(startDateStr, false);
      const endDateUTC = etDateToUTC(endDateStr, true);
      start = new Date(startDateUTC);
      end = new Date(endDateUTC);
    }

    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        error: 'Invalid date format',
        details: 'Please provide valid ISO date strings'
      });
    }

    // Convert to ISO strings for PostgreSQL (postgres handles ISO strings well)
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // Build date filter condition using parameterized queries
    const params = [startISO, endISO];

    logger.info({ data: params }, 'Query params:');

    // Get LTV by label for revenue calculations (using selected metric)
    const ltvByLabel = await getLTVByLabel(ltvMetric);
    logger.info({ data: ltvByLabel }, 'LTV by label:');

    // Query for overall metrics - includes label_name for LTV calculation
    const overallQuery = `
      WITH form_stats AS (
        SELECT
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending_payments,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
          COUNT(DISTINCT session_id) AS unique_sessions,
          COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
          COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
          -- Facebook/Meta ads metrics (includes UTM-based AND heard_about field attribution)
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          )) AS facebook_form_starts,
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status IN ('paid', 'verified')) AS facebook_form_completions,
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status = 'paid') AS facebook_payments,
          SUM(actual_price) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status = 'paid') AS facebook_revenue,
          -- Include label_name and booking_type for LTV calculation
          json_agg(
            json_build_object(
              'label_name', label_name,
              'booking_type', booking_type,
              'payment_status', payment_status,
              'actual_price', actual_price,
              'is_facebook', CASE WHEN (
                (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
              ) THEN true ELSE false END
            ) ORDER BY created_at
          ) FILTER (WHERE payment_status IN ('paid', 'verified') AND (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          )) AS completion_details
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
      ),
      view_stats AS (
        SELECT
          COALESCE(COUNT(*), 0) AS form_views,
          COALESCE(COUNT(DISTINCT session_id), 0) AS unique_view_sessions,
          -- Facebook/Meta ads view metrics (UTM only - views don't have heard_about field)
          COALESCE(COUNT(*) FILTER (WHERE (
            LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
            AND COALESCE(utm->>'utm_campaign', '') != ''
          )), 0) AS facebook_form_views
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
      ),
      ad_spend_stats AS (
        SELECT
          COALESCE(SUM(impressions), 0) AS total_impressions,
          COALESCE(SUM(clicks), 0) AS total_clicks,
          COALESCE(SUM(spend), 0) AS total_spend,
          CASE 
            WHEN SUM(impressions) > 0 THEN ROUND((SUM(clicks)::numeric / SUM(impressions)::numeric) * 100, 2)
            ELSE 0
          END AS avg_ctr,
          CASE 
            WHEN SUM(clicks) > 0 THEN ROUND((SUM(spend)::numeric / SUM(clicks)::numeric), 2)
            ELSE 0
          END AS avg_cpc,
          -- Meta Ads specific stats
          COALESCE(SUM(impressions) FILTER (WHERE platform = 'meta'), 0) AS meta_impressions,
          COALESCE(SUM(clicks) FILTER (WHERE platform = 'meta'), 0) AS meta_clicks,
          COALESCE(SUM(spend) FILTER (WHERE platform = 'meta'), 0) AS meta_spend,
          -- Google Ads specific stats
          COALESCE(SUM(impressions) FILTER (WHERE platform = 'google'), 0) AS google_impressions,
          COALESCE(SUM(clicks) FILTER (WHERE platform = 'google'), 0) AS google_clicks,
          COALESCE(SUM(spend) FILTER (WHERE platform = 'google'), 0) AS google_spend
        FROM ad_spend_data
        WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
      )
      SELECT 
        COALESCE(vs.form_views, 0) AS form_views,
        fs.form_starts,
        fs.form_completions,
        fs.payments,
        fs.registrations,
        fs.pending_payments,
        COALESCE(fs.revenue, 0) AS revenue,
        fs.unique_sessions,
        COALESCE(vs.unique_view_sessions, 0) AS unique_view_sessions,
        fs.drafts,
        fs.submitted,
        COALESCE(vs.facebook_form_views, 0) AS facebook_form_views,
        fs.facebook_form_starts,
        fs.facebook_form_completions,
        fs.facebook_payments,
        COALESCE(fs.facebook_revenue, 0) AS facebook_revenue,
        CASE 
          WHEN COALESCE(vs.form_views, 0) > 0 THEN ROUND((fs.form_starts::numeric / vs.form_views::numeric) * 100, 2)
          ELSE 0
        END AS form_start_rate,
        CASE 
          WHEN fs.form_starts > 0 THEN ROUND((fs.form_completions::numeric / fs.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS form_completion_rate,
        CASE 
          WHEN fs.form_starts > 0 THEN ROUND((fs.payments::numeric / fs.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS payment_rate,
        CASE 
          WHEN fs.form_starts > 0 THEN ROUND((fs.payments::numeric / fs.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS overall_conversion_rate,
        CASE 
          WHEN fs.form_starts > 0 THEN ROUND(((fs.form_starts - fs.form_completions)::numeric / fs.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS abandonment_rate,
        CASE 
          WHEN fs.facebook_form_starts > 0 THEN ROUND((fs.facebook_form_completions::numeric / fs.facebook_form_starts::numeric) * 100, 2)
          ELSE 0
        END AS facebook_completion_rate,
        -- Ad spend metrics
        COALESCE(ads.total_impressions, 0) AS ad_impressions,
        COALESCE(ads.total_clicks, 0) AS ad_clicks,
        COALESCE(ads.total_spend, 0) AS ad_spend,
        COALESCE(ads.avg_ctr, 0) AS ad_ctr,
        COALESCE(ads.avg_cpc, 0) AS ad_cpc,
        COALESCE(ads.meta_impressions, 0) AS meta_impressions,
        COALESCE(ads.meta_clicks, 0) AS meta_clicks,
        COALESCE(ads.meta_spend, 0) AS meta_spend,
        COALESCE(ads.google_impressions, 0) AS google_impressions,
        COALESCE(ads.google_clicks, 0) AS google_clicks,
        COALESCE(ads.google_spend, 0) AS google_spend,
        -- Cost per lead/registration metrics (Meta Ads specific)
        CASE 
          WHEN fs.facebook_form_starts > 0 AND COALESCE(ads.meta_spend, 0) > 0 THEN ROUND((ads.meta_spend::numeric / fs.facebook_form_starts::numeric), 2)
          ELSE 0
        END AS cpl,
        CASE 
          WHEN fs.facebook_form_completions > 0 AND COALESCE(ads.meta_spend, 0) > 0 THEN ROUND((ads.meta_spend::numeric / fs.facebook_form_completions::numeric), 2)
          ELSE 0
        END AS cpr,
        CASE 
          WHEN COALESCE(ads.meta_spend, 0) > 0 THEN ROUND((COALESCE(fs.facebook_revenue, 0)::numeric / ads.meta_spend::numeric), 2)
          ELSE 0
        END AS roas
      FROM form_stats fs
      CROSS JOIN view_stats vs
      CROSS JOIN ad_spend_stats ads
    `;

    let overall;
    try {
      logger.info('Executing overall query...');
      const overallResult = await client.query(overallQuery, params);
      logger.info({ data: overallResult.rows.length }, 'Overall query succeeded, rows:');
      const rawOverall = overallResult.rows[0] || {
        form_views: 0,
        form_starts: 0,
        form_completions: 0,
        payments: 0,
        registrations: 0,
        pending_payments: 0,
        revenue: 0,
        unique_sessions: 0,
        unique_view_sessions: 0,
        drafts: 0,
        submitted: 0,
        facebook_form_views: 0,
        facebook_form_starts: 0,
        facebook_form_completions: 0,
        facebook_payments: 0,
        facebook_revenue: 0,
        form_start_rate: 0,
        form_completion_rate: 0,
        payment_rate: 0,
        overall_conversion_rate: 0,
        abandonment_rate: 0,
        facebook_completion_rate: 0,
        ad_impressions: 0,
        ad_clicks: 0,
        ad_spend: 0,
        ad_ctr: 0,
        ad_cpc: 0,
        meta_impressions: 0,
        meta_clicks: 0,
        meta_spend: 0,
        google_impressions: 0,
        google_clicks: 0,
        google_spend: 0,
        cpl: 0,
        cpr: 0,
        roas: 0,
        completion_details: []
      };
      
      // Calculate LTV-based revenue for Meta ads only
      // Use the same approach as the ROAS details endpoint for consistency
      let facebookLtvRevenue = 0;
      
      logger.info('Calculating LTV revenue for Meta ads...');
      logger.info({ data: ltvByLabel }, 'LTV by label map:');
      
      // Query Meta form completions directly (same as ROAS details endpoint)
      try {
        const metaCompletionsQuery = `
          SELECT
            label_name,
            booking_type,
            COUNT(*) as completion_count
          FROM booking_submissions
          WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            AND (
              -- UTM-based attribution (existing)
              (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' 
               AND COALESCE(utm->>'utm_campaign', '') != '')
              OR
              -- heard_about field attribution (new)
              (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
            )
            AND payment_status IN ('paid', 'verified')
          GROUP BY label_name, booking_type
        `;
        const metaCompletionsResult = await client.query(metaCompletionsQuery, params);
        
        logger.info(`Found ${metaCompletionsResult.rows.length} unique label/booking_type combinations`);
        
        metaCompletionsResult.rows.forEach((row, idx) => {
          // Get label from label_name or booking_type
          let label = row.label_name;
          if (!label && row.booking_type) {
            label = getLabelFromBookingType(row.booking_type);
          }
          
          // Get LTV for this label
          const ltv = label && ltvByLabel[label] ? ltvByLabel[label] : 0;
          const completionCount = parseInt(row.completion_count || 1);
          
          if (ltv > 0) {
            const totalLtvForThisLabel = ltv * completionCount;
            facebookLtvRevenue += totalLtvForThisLabel;
            logger.info(`[${idx}] ${completionCount} completions for "${label}" (LTV: ${ltv}) = ${totalLtvForThisLabel}, total so far: ${facebookLtvRevenue}`);
          } else {
            // Fallback to actual_price if no LTV found
            // But we don't have actual_price here, so we'll need to query it
            logger.info({ idx, label }, 'No LTV found for label, need to query actual_price');
          }
        });
        
        logger.info({ data: facebookLtvRevenue }, 'Final facebookLtvRevenue from direct query:');
        
        // Also try to use completion_details if available (as backup)
        if (facebookLtvRevenue === 0 && rawOverall.completion_details && Array.isArray(rawOverall.completion_details)) {
          logger.info('Fallback: Using completion_details from SQL query');
          rawOverall.completion_details.forEach((detail, idx) => {
            let label = detail.label_name;
            if (!label && detail.booking_type) {
              label = getLabelFromBookingType(detail.booking_type);
            }
            
            // Ensure numeric conversion to prevent string concatenation
            const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
            
            if (ltv > 0) {
              facebookLtvRevenue += ltv;
              logger.info(`[${idx}] Added LTV for label "${label}": ${ltv}, total so far: ${facebookLtvRevenue}`);
            } else {
              facebookLtvRevenue += parseFloat(detail.actual_price || 0);
              logger.info(`[${idx}] No LTV found for label "${label || `unknown`}", using actual_price: ${detail.actual_price}`);
            }
          });
        }
      } catch (ltvErr) {
        logger.error({ data: ltvErr }, 'Error calculating LTV revenue:');
        // Fallback to actual_price if LTV calculation fails
        facebookLtvRevenue = rawOverall.facebook_revenue || 0;
      }
      
      logger.info({ data: facebookLtvRevenue }, 'Final facebookLtvRevenue:');
      logger.info({ data: rawOverall.meta_spend }, 'rawOverall.meta_spend:');
      logger.info({ data: rawOverall.facebook_revenue }, 'rawOverall.facebook_revenue (actual_price sum):');
      
      // Build overall object
      // Meta Revenue card shows actual_price sum ($105) - what was actually paid
      // ROAS uses LTV-based revenue ($11,168) - projected lifetime value
      overall = {
        ...rawOverall,
        // Total revenue stays as actual_price (what was actually paid)
        revenue: rawOverall.revenue || 0,
        // Meta Revenue card shows actual trial revenue ($105) - what was actually paid
        facebook_revenue: rawOverall.facebook_revenue || 0,
        // ROAS MUST use LTV-based revenue for proper calculation (should be 8.12x)
        roas: rawOverall.meta_spend > 0 && facebookLtvRevenue > 0 
          ? parseFloat((facebookLtvRevenue / rawOverall.meta_spend).toFixed(2))
          : (rawOverall.roas || 0)
      };
      
      logger.info({ data: {
        facebookLtvRevenue,
        actualFacebookRevenue: rawOverall.facebook_revenue,
        meta_spend: rawOverall.meta_spend,
        roas_using_ltv: overall.roas,
        meta_revenue_shows_actual: overall.facebook_revenue
      } }, 'Final calculation:');
      
      // Clean up completion_details from response (not needed in final output)
      delete overall.completion_details;
      
    } catch (err) {
      logger.error({ err: err }, 'Error in overall query:');
      logger.error({ error: err.message }, 'Error message:');
      logger.error({ data: err.code }, 'Error code:');
      
      // If table doesn't exist, return zeros instead of erroring
      if (err.code === '42P01' && (err.message.includes('booking_form_views') || err.message.includes('ad_spend_data'))) {
        logger.warn('Missing table detected, returning zeros for affected metrics');
        
        // Try to get just submission stats without view stats or ad spend
        try {
          const submissionOnlyQuery = `
            WITH form_stats AS (
              SELECT
                COUNT(*) AS form_starts,
                COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
                COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
                COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
                COUNT(*) FILTER (WHERE payment_status = 'pending') AS pending_payments,
                SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
                COUNT(DISTINCT session_id) AS unique_sessions,
                COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
                COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
                COUNT(*) FILTER (WHERE (
                  (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                  OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                )) AS facebook_form_starts,
                COUNT(*) FILTER (WHERE (
                  (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                  OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                ) AND payment_status IN ('paid', 'verified')) AS facebook_form_completions,
                COUNT(*) FILTER (WHERE (
                  (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                  OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                ) AND payment_status = 'paid') AS facebook_payments,
                SUM(actual_price) FILTER (WHERE (
                  (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                  OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                ) AND payment_status = 'paid') AS facebook_revenue
              FROM booking_submissions
              WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            )
            SELECT 
              0 AS form_views,
              fs.form_starts,
              fs.form_completions,
              fs.payments,
              fs.registrations,
              fs.pending_payments,
              COALESCE(fs.revenue, 0) AS revenue,
              fs.unique_sessions,
              0 AS unique_view_sessions,
              fs.drafts,
              fs.submitted,
              0 AS facebook_form_views,
              fs.facebook_form_starts,
              fs.facebook_form_completions,
              fs.facebook_payments,
              COALESCE(fs.facebook_revenue, 0) AS facebook_revenue,
              0 AS form_start_rate,
              CASE 
                WHEN fs.form_starts > 0 THEN ROUND((fs.form_completions::numeric / fs.form_starts::numeric) * 100, 2)
                ELSE 0
              END AS form_completion_rate,
              CASE 
                WHEN fs.form_starts > 0 THEN ROUND((fs.payments::numeric / fs.form_starts::numeric) * 100, 2)
                ELSE 0
              END AS payment_rate,
              CASE 
                WHEN fs.form_starts > 0 THEN ROUND((fs.payments::numeric / fs.form_starts::numeric) * 100, 2)
                ELSE 0
              END AS overall_conversion_rate,
              CASE 
                WHEN fs.form_starts > 0 THEN ROUND(((fs.form_starts - fs.form_completions)::numeric / fs.form_starts::numeric) * 100, 2)
                ELSE 0
              END AS abandonment_rate,
              CASE 
                WHEN fs.facebook_form_starts > 0 THEN ROUND((fs.facebook_form_completions::numeric / fs.facebook_form_starts::numeric) * 100, 2)
                ELSE 0
              END AS facebook_completion_rate,
              0 AS ad_impressions,
              0 AS ad_clicks,
              0 AS ad_spend,
              0 AS ad_ctr,
              0 AS ad_cpc,
              0 AS meta_impressions,
              0 AS meta_clicks,
              0 AS meta_spend,
              0 AS google_impressions,
              0 AS google_clicks,
              0 AS google_spend,
              0 AS cpl,
              0 AS cpr,
              0 AS roas
            FROM form_stats fs
          `;
          const submissionResult = await pool.query(submissionOnlyQuery, params);
          overall = submissionResult.rows[0] || {
            form_views: 0,
            form_starts: 0,
            form_completions: 0,
            payments: 0,
            registrations: 0,
            pending_payments: 0,
            revenue: 0,
            unique_sessions: 0,
            unique_view_sessions: 0,
            drafts: 0,
            submitted: 0,
            facebook_form_views: 0,
            facebook_form_starts: 0,
            facebook_form_completions: 0,
            facebook_payments: 0,
            facebook_revenue: 0,
            form_start_rate: 0,
            form_completion_rate: 0,
            payment_rate: 0,
            overall_conversion_rate: 0,
            abandonment_rate: 0,
            facebook_completion_rate: 0,
            ad_impressions: 0,
            ad_clicks: 0,
            ad_spend: 0,
            ad_ctr: 0,
            ad_cpc: 0,
            meta_impressions: 0,
            meta_clicks: 0,
            meta_spend: 0,
            google_impressions: 0,
            google_clicks: 0,
            google_spend: 0,
            cpl: 0,
            cpr: 0,
            roas: 0
          };
          logger.info('Successfully fetched submission stats without view stats or ad spend');
        } catch (submissionErr) {
          logger.error({ data: submissionErr }, 'Error getting submission-only stats:');
          // Fallback to zeros
          overall = {
            form_views: 0,
            form_starts: 0,
            form_completions: 0,
            payments: 0,
            registrations: 0,
            pending_payments: 0,
            revenue: 0,
            unique_sessions: 0,
            unique_view_sessions: 0,
            drafts: 0,
            submitted: 0,
            facebook_form_views: 0,
            facebook_form_starts: 0,
            facebook_form_completions: 0,
            facebook_payments: 0,
            facebook_revenue: 0,
            form_start_rate: 0,
            form_completion_rate: 0,
            payment_rate: 0,
            overall_conversion_rate: 0,
            abandonment_rate: 0,
            facebook_completion_rate: 0,
            ad_impressions: 0,
            ad_clicks: 0,
            ad_spend: 0,
            ad_ctr: 0,
            ad_cpc: 0,
            meta_impressions: 0,
            meta_clicks: 0,
            meta_spend: 0,
            google_impressions: 0,
            google_clicks: 0,
            google_spend: 0,
            cpl: 0,
            cpr: 0,
            roas: 0
          };
        }
      } else {
        throw new Error(`Overall query failed: ${err.message}`);
      }
    }

    // Query for weekly breakdown (Sunday to Saturday)
    const weeklyQuery = `
      WITH submission_buckets AS (
        SELECT 
          DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day'
      ),
      view_buckets AS (
        SELECT 
          DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
          COUNT(*) AS form_views
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day'
      )
      SELECT 
        COALESCE(s.week_start, v.week_start) AS week_start,
        COALESCE(s.week_start, v.week_start) + INTERVAL '6 days' AS week_end,
        COALESCE(s.form_starts, 0) AS form_starts,
        COALESCE(s.form_completions, 0) AS form_completions,
        COALESCE(s.payments, 0) AS payments,
        COALESCE(s.registrations, 0) AS registrations,
        COALESCE(s.revenue, 0) AS revenue,
        COALESCE(v.form_views, 0) AS form_views,
        CASE 
          WHEN COALESCE(s.form_starts, 0) > 0 THEN ROUND((COALESCE(s.form_completions, 0)::numeric / s.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS form_completion_rate,
        CASE 
          WHEN COALESCE(s.form_completions, 0) > 0 THEN ROUND((COALESCE(s.payments, 0)::numeric / s.form_completions::numeric) * 100, 2)
          ELSE 0
        END AS payment_rate,
        CASE 
          WHEN COALESCE(s.form_starts, 0) > 0 THEN ROUND((COALESCE(s.payments, 0)::numeric / s.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS overall_conversion_rate
      FROM submission_buckets s
      FULL OUTER JOIN view_buckets v ON s.week_start = v.week_start
      ORDER BY COALESCE(s.week_start, v.week_start) DESC
    `;

    let weeklyResult;
    try {
      logger.info('Executing weekly query...');
      weeklyResult = await client.query(weeklyQuery, params);
      logger.info({ data: weeklyResult.rows.length }, 'Weekly query succeeded, rows:');
    } catch (err) {
      logger.error({ err: err }, 'Error in weekly query:');
      logger.error({ error: err.message }, 'Error message:');
      logger.error({ data: err.code }, 'Error code:');
      
      // If table doesn't exist, use submission-only query
      if (err.code === '42P01' && err.message.includes('booking_form_views')) {
        logger.warn('booking_form_views table does not exist, using submission-only weekly query');
        try {
          const weeklySubmissionOnlyQuery = `
            SELECT 
              DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day' AS week_start,
              DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day' + INTERVAL '6 days' AS week_end,
              COUNT(*) AS form_starts,
              COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
              COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
              COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
              SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
              0 AS form_views,
              CASE 
                WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified'))::numeric / COUNT(*)::numeric) * 100, 2)
                ELSE 0
              END AS form_completion_rate,
              CASE 
                WHEN COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status = 'paid')::numeric / COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified'))::numeric) * 100, 2)
                ELSE 0
              END AS payment_rate,
              CASE 
                WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status = 'paid')::numeric / COUNT(*)::numeric) * 100, 2)
                ELSE 0
              END AS overall_conversion_rate
            FROM booking_submissions
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            GROUP BY DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day'
            ORDER BY DATE_TRUNC('week', created_at + INTERVAL '1 day') - INTERVAL '1 day' DESC
          `;
          weeklyResult = await client.query(weeklySubmissionOnlyQuery, params);
          logger.info('Weekly submission-only query succeeded');
        } catch (submissionErr) {
          logger.error({ data: submissionErr }, 'Error in weekly submission-only query:');
          weeklyResult = { rows: [] };
        }
      } else {
        throw new Error(`Weekly query failed: ${err.message}`);
      }
    }

    // Query for monthly breakdown
    const monthlyQuery = `
      WITH submission_buckets AS (
        SELECT 
          DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' AS month_start,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
      ),
      view_buckets AS (
        SELECT 
          DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' AS month_start,
          COUNT(*) AS form_views
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
      )
      SELECT 
        COALESCE(s.month_start, v.month_start) AS month_start,
        COALESCE(s.form_starts, 0) AS form_starts,
        COALESCE(s.form_completions, 0) AS form_completions,
        COALESCE(s.payments, 0) AS payments,
        COALESCE(s.registrations, 0) AS registrations,
        COALESCE(s.revenue, 0) AS revenue,
        COALESCE(v.form_views, 0) AS form_views,
        CASE 
          WHEN COALESCE(s.form_starts, 0) > 0 THEN ROUND((COALESCE(s.form_completions, 0)::numeric / s.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS form_completion_rate,
        CASE 
          WHEN COALESCE(s.form_completions, 0) > 0 THEN ROUND((COALESCE(s.payments, 0)::numeric / s.form_completions::numeric) * 100, 2)
          ELSE 0
        END AS payment_rate,
        CASE 
          WHEN COALESCE(s.form_starts, 0) > 0 THEN ROUND((COALESCE(s.payments, 0)::numeric / s.form_starts::numeric) * 100, 2)
          ELSE 0
        END AS overall_conversion_rate
      FROM submission_buckets s
      FULL OUTER JOIN view_buckets v ON s.month_start = v.month_start
      ORDER BY COALESCE(s.month_start, v.month_start) DESC
    `;

    let monthlyResult;
    try {
      logger.info('Executing monthly query...');
      monthlyResult = await client.query(monthlyQuery, params);
      logger.info({ data: monthlyResult.rows.length }, 'Monthly query succeeded, rows:');
    } catch (err) {
      logger.error({ err: err }, 'Error in monthly query:');
      logger.error({ error: err.message }, 'Error message:');
      logger.error({ data: err.code }, 'Error code:');
      
      // If table doesn't exist, use submission-only query
      if (err.code === '42P01' && err.message.includes('booking_form_views')) {
        logger.warn('booking_form_views table does not exist, using submission-only monthly query');
        try {
          const monthlySubmissionOnlyQuery = `
            SELECT 
              DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' AS month_start,
              COUNT(*) AS form_starts,
              COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
              COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
              COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
              SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
              0 AS form_views,
              CASE 
                WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified'))::numeric / COUNT(*)::numeric) * 100, 2)
                ELSE 0
              END AS form_completion_rate,
              CASE 
                WHEN COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status = 'paid')::numeric / COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified'))::numeric) * 100, 2)
                ELSE 0
              END AS payment_rate,
              CASE 
                WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE payment_status = 'paid')::numeric / COUNT(*)::numeric) * 100, 2)
                ELSE 0
              END AS overall_conversion_rate
            FROM booking_submissions
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
            GROUP BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York'
            ORDER BY DATE_TRUNC('month', created_at AT TIME ZONE 'America/New_York') AT TIME ZONE 'America/New_York' DESC
          `;
          monthlyResult = await client.query(monthlySubmissionOnlyQuery, params);
          logger.info('Monthly submission-only query succeeded');
        } catch (submissionErr) {
          logger.error({ data: submissionErr }, 'Error in monthly submission-only query:');
          monthlyResult = { rows: [] };
        }
      } else {
        throw new Error(`Monthly query failed: ${err.message}`);
      }
    }

    // Query for campaign performance (by UTM source and campaign)
    const campaignQuery = `
      WITH campaign_stats AS (
        SELECT 
          COALESCE(utm->>'utm_source', 'direct') AS source,
          COALESCE(utm->>'utm_campaign', 'none') AS campaign,
          COALESCE(utm->>'utm_medium', 'none') AS medium,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY utm->>'utm_source', utm->>'utm_campaign', utm->>'utm_medium'
      )
      SELECT 
        source,
        campaign,
        medium,
        form_starts,
        form_completions,
        payments,
        registrations,
        COALESCE(revenue, 0) AS revenue,
        CASE 
          WHEN form_starts > 0 THEN ROUND((form_completions::numeric / form_starts::numeric) * 100, 2)
          ELSE 0
        END AS form_completion_rate,
        CASE 
          WHEN form_completions > 0 THEN ROUND((payments::numeric / form_completions::numeric) * 100, 2)
          ELSE 0
        END AS payment_rate,
        CASE 
          WHEN form_starts > 0 THEN ROUND((payments::numeric / form_starts::numeric) * 100, 2)
          ELSE 0
        END AS overall_conversion_rate
      FROM campaign_stats
      ORDER BY form_starts DESC
    `;

    let campaignResult;
    try {
      logger.info('Executing campaign query...');
      campaignResult = await client.query(campaignQuery, params);
      logger.info({ data: campaignResult.rows.length }, 'Campaign query succeeded, rows:');
    } catch (err) {
      logger.error({ err: err }, 'Error in campaign query:');
      logger.error({ error: err.message }, 'Error message:');
      logger.error({ data: err.code }, 'Error code:');
      throw new Error(`Campaign query failed: ${err.message}`);
    }

    // Query for booking type performance
    const bookingTypeQuery = `
      WITH booking_type_stats AS (
        SELECT 
          booking_type,
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
          AVG(actual_price) FILTER (WHERE payment_status = 'paid') AS avg_order_value
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
        GROUP BY booking_type
      )
      SELECT 
        booking_type,
        form_starts,
        form_completions,
        payments,
        registrations,
        COALESCE(revenue, 0) AS revenue,
        COALESCE(ROUND(avg_order_value::numeric, 2), 0) AS avg_order_value,
        CASE 
          WHEN form_starts > 0 THEN ROUND((form_completions::numeric / form_starts::numeric) * 100, 2)
          ELSE 0
        END AS form_completion_rate,
        CASE 
          WHEN form_completions > 0 THEN ROUND((payments::numeric / form_completions::numeric) * 100, 2)
          ELSE 0
        END AS payment_rate
      FROM booking_type_stats
      ORDER BY form_starts DESC
    `;

    let bookingTypeResult;
    try {
      logger.info('Executing booking type query...');
      bookingTypeResult = await client.query(bookingTypeQuery, params);
      logger.info({ data: bookingTypeResult.rows.length }, 'Booking type query succeeded, rows:');
    } catch (err) {
      logger.error({ err: err }, 'Error in booking type query:');
      logger.error({ error: err.message }, 'Error message:');
      logger.error({ data: err.code }, 'Error code:');
      throw new Error(`Booking type query failed: ${err.message}`);
    }

      logger.info('All queries succeeded, returning response');
      return {
        period: {
          startDate: start.toISOString(),
          endDate: end.toISOString()
        },
        overall,
        weekly: weeklyResult.rows,
        monthly: monthlyResult.rows,
        campaigns: campaignResult.rows,
        bookingTypes: bookingTypeResult.rows
      };
    }, 300); // 5 minute TTL

    res.json(result);
  } catch (err) {
    logger.error({ err: err }, 'GET /api/submissions/analytics/metrics failed:');
    logger.error({ data: {
      message: err.message,
      stack: err.stack,
      query: err.query || 'N/A',
      parameters: err.parameters || 'N/A',
      code: err.code
    } }, 'Error details:');
    
    // Provide helpful error message if table is missing
    if (err.code === '42P01' && err.message.includes('booking_form_views')) {
      return res.status(500).json({
        error: 'Could not fetch analytics metrics',
        details: 'The booking_form_views table does not exist. Please run the migration: psql $DATABASE_URL -f migrations/create_booking_form_views_table.sql',
        code: err.code
      });
    }
    
    res.status(500).json({
      error: 'Could not fetch analytics metrics',
      details: err.message,
      code: err.code,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    client.release();
  }
}));

router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  try {
    // First verify the submission exists
    const { rows: existing } = await pool.query(
      'SELECT id FROM booking_submissions WHERE id = $1',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    
    // Delete the submission
    const { rowCount } = await pool.query(
      'DELETE FROM booking_submissions WHERE id = $1',
      [id]
    );
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Invalidate submissions cache after deleting
    await cache.clearCacheByPrefix('submissions');

    logger.info(`✅ Admin deleted submission ${id}`);
    res.json({
      success: true,
      message: 'Submission deleted successfully',
      deletedId: id
    });
  } catch (err) {
    logger.error({ err: err }, 'Error deleting submission:');
    res.status(500).json({ error: 'Failed to delete submission' });
  }
}));

// Error tracking endpoint
router.post('/:id/track-error', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { type, error, details, statusCode, timestamp } = req.body;
  
  try {
    const errorData = {
      type: type || 'unknown',
      message: error || 'Unknown error',
      details: details || {},
      statusCode: statusCode,
      timestamp: timestamp || new Date().toISOString()
    };
    
    // Determine which error field to update based on error type
    // Use whitelist to prevent SQL injection
    const allowedFields = {
      'submission_errors': ['submission_error', 'unknown'],
      'checkout_session_errors': ['checkout_session_creation', 'checkout_session_error'],
      'payment_errors': ['payment_processing', 'payment_error'],
      'client_creation_errors': ['client_creation', 'client_creation_error']
    };
    
    let updateField = 'submission_errors';
    for (const [field, types] of Object.entries(allowedFields)) {
      if (types.includes(type)) {
        updateField = field;
        break;
      }
    }
    
    // Use parameterized query with proper field name (safe because it's from whitelist)
    const query = `UPDATE booking_submissions
       SET ${updateField} = COALESCE(${updateField}, '[]'::jsonb) || $1::jsonb,
           last_error_at = NOW(),
           error_summary = COALESCE(error_summary || E'\\n', '') || $2
     WHERE id = $3`;
    
    await pool.query(query, [
      JSON.stringify([errorData]),
      `${type}: ${error}`,
      id
    ]);
    
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err }, 'Error tracking failed:');
    res.status(500).json({ error: 'Failed to track error' });
  }
}));

// CRITICAL: Register GET /:id route handler BEFORE other routes to ensure it executes
// This route must be registered after /:id/track-error but before analytics routes
logger.info('[ROUTE REGISTRATION] Registering GET /:id route handler');
// Register route handler - SINGLE handler function (not middleware + handler)
router.get('/:id', asyncHandler(async (req, res) => {
  const {
    id
  } = req.params;
  logger.info(`[ROUTE HANDLER] GET /api/submissions/:id called with id=${id}`);
  try {
    // Cache key for this specific submission
    const cacheKey = `submissions:detail:${id}`;

    const submission = await cache.getOrSet(cacheKey, async () => {
      const {
        rows
      } = await pool.query(`
        SELECT
          id,
          booking_type        AS "bookingType",
          actual_price::float AS "actualPrice",
          original_price::float AS "originalPrice",
          parent_first        AS "parentFirst",
          parent_last         AS "parentLast",
          parent_email        AS "parentEmail",
          parent_phone        AS "parentPhone",
          student_type        AS "studentType",
          students,
          slots,
          heard_about         AS "heardAbout",
          address,
          agree_cancel        AS "agreeCancel",
          agree_service       AS "agreeService",
          agree_photo         AS "agreePhoto",
          signature,
          label_id            AS "labelId",
          label_name          AS "labelName",
          payment_status      AS "paymentStatus",
          created_at          AS "createdAt",
          selected_sessions   AS "selectedSessions",
          lesson_type         AS "lessonType",
          tc_client_id        AS "tcClientId",
          tc_service_id       AS "tcServiceId",
          timezone            AS "timezone",
          colour              AS "colour",
          credit_request_error AS "creditRequestError",
          credit_request_error_message AS "creditRequestErrorMessage",

          -- Error tracking fields
          COALESCE(submission_errors, '[]'::jsonb) AS "submissionErrors",
          COALESCE(checkout_session_errors, '[]'::jsonb) AS "checkoutSessionErrors",
          COALESCE(payment_errors, '[]'::jsonb) AS "paymentErrors",
          COALESCE(client_creation_errors, '[]'::jsonb) AS "clientCreationErrors",
          COALESCE(recommendations, '[]'::jsonb) AS "recommendations",
          last_error_at AS "lastErrorAt",
          error_summary AS "errorSummary",
          stripe_session_id AS "stripeSessionId",

          -- Preferred tutor (from public profile booking)
          preferred_tutor_id   AS "preferredTutorId",
          preferred_tutor_name AS "preferredTutorName",

          -- Attribution (flat)
          COALESCE(utm, '{}'::jsonb)       AS "utm",
          landing_url                       AS "landing_url",
          landing_url                       AS "landingUrl",
          referrer                          AS "referrer",
          (COALESCE(utm, '{}'::jsonb)->>'utm_source') AS "utmSource",
          (COALESCE(utm, '{}'::jsonb)->>'utm_campaign') AS "utmCampaign",

          -- Attribution (nested, for your helpers)
          jsonb_build_object(
            'utm',        COALESCE(utm, '{}'::jsonb),
            'landing_url', landing_url,
            'referrer',    referrer
          ) AS "attribution"
        FROM booking_submissions
        WHERE id = $1
        `, [id]);

      if (!rows.length) return null;
      return rows[0];
    }, 60); // 60 second TTL

    if (!submission) return res.status(404).json({
      error: 'Submission not found'
    });
    
    // Fetch form events for this submission
    let formEvents = [];
    try {
      // First try to get events by submission_id
      let eventsResult = await pool.query(`
        SELECT 
          id,
          session_id AS "sessionId",
          event_type AS "eventType",
          step_name AS "stepName",
          step_number AS "stepNumber",
          metadata,
          created_at AS "createdAt",
          duration_ms AS "durationMs"
        FROM booking_form_events
        WHERE submission_id = $1
        ORDER BY created_at ASC
      `, [id]);
      
      // If no events found by submission_id, try to find by session_id from booking_form_views
      // We can match by looking for events with the same session_id that might have been created before submission
      if (eventsResult.rows.length === 0) {
        // Try to find session_id from booking_form_views that might match
        // This is a fallback - ideally events should be linked by submission_id
        eventsResult = await pool.query(`
          SELECT 
            e.id,
            e.session_id AS "sessionId",
            e.event_type AS "eventType",
            e.step_name AS "stepName",
            e.step_number AS "stepNumber",
            e.metadata,
            e.created_at AS "createdAt",
            e.duration_ms AS "durationMs"
          FROM booking_form_events e
          WHERE e.session_id IN (
            SELECT DISTINCT session_id 
            FROM booking_form_views 
            WHERE created_at <= $2::timestamptz + INTERVAL '1 hour'
            ORDER BY created_at DESC
            LIMIT 10
          )
          AND e.created_at <= $2::timestamptz + INTERVAL '1 hour'
          ORDER BY e.created_at ASC
        `, [id, submission.createdAt || new Date()]);
      }
      
      formEvents = eventsResult.rows.map(row => ({
        ...row,
        metadata: row.metadata || {},
      }));
    } catch (err) {
      logger.error({ err: err }, 'Error fetching form events:');
      // Don't fail the request if events can't be fetched
      formEvents = [];
    }
    if (!submission.timezone) submission.timezone = 'Not Provided';
    
    // Add form events to submission
    submission.formEvents = formEvents;

    // Generate recommendations based on submission state
    try {
      const recommendations = generateRecommendations(submission);
      submission.analysis = recommendations;
      
      // Update recommendations in database if they've changed
      const currentRecommendations = submission.recommendations || [];
      if (JSON.stringify(recommendations.recommendations) !== JSON.stringify(currentRecommendations)) {
        await pool.query(
          `UPDATE booking_submissions 
           SET recommendations = $1::jsonb 
           WHERE id = $2`,
          [JSON.stringify(recommendations.recommendations), id]
        );
      }
    } catch (err) {
      logger.error({ err: err }, 'Error generating recommendations:');
      logger.error({ data: err.stack }, 'Error stack:');
      // Don't fail the request if recommendations fail
      submission.analysis = {
        errors: [],
        recommendations: [],
        summary: 'Unable to generate recommendations',
        hasErrors: false,
        hasRecommendations: false,
        priority: 'low'
      };
    }
    
    logger.error(`🚨 ABOUT TO SEND RESPONSE for submission ${id}`);
    logger.error({ data: !!submission.analysis }, '🚨 Response will include analysis:');
    logger.error({ data: !!submission.stripeSessionId }, '🚨 Response will include stripeSessionId:');
    res.json(submission);
  } catch (err) {
    logger.error({ err: err }, `🚨 ERROR in GET /api/submissions/${id}:`);
    logger.error({ data: err.stack }, '🚨 Error stack:');
    res.status(500).json({
      error: 'Could not fetch submission'
    });
  }
}));

// Enterprise Marketing Performance Suite - Comprehensive Analytics
// Endpoint to get LTV by label with both average and median
router.get('/analytics/ltv-by-label', asyncHandler(async (req, res) => {
  try {
    const cacheKey = 'submissions:analytics:ltv-by-label';

    const ltvByLabel = await cache.getOrSet(cacheKey, async () => {
      return await getLTVByLabelWithBoth();
    }, 300); // 5 minute TTL

    res.json(ltvByLabel);
  } catch (err) {
    logger.error({ err: err }, 'Error fetching LTV by label:');
    res.status(500).json({
      error: 'Failed to fetch LTV by label',
      details: err.message
    });
  }
}));

router.get('/analytics/enterprise', asyncHandler(async (req, res) => {
  try {
    const { startDate, endDate, market, channel, campaign, lessonType, ltvMetric = 'average' } = req.query;

    // Cache key includes all query params that affect results
    const cacheKey = `submissions:analytics:enterprise:start:${startDate || 'default'}:end:${endDate || 'default'}:market:${market || 'all'}:channel:${channel || 'all'}:campaign:${campaign || 'all'}:lessonType:${lessonType || 'all'}:ltvMetric:${ltvMetric}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      // Parse dates (same logic as /analytics/metrics)
      function etDateToUTC(dateStr, isEndOfDay) {
        const et = require('luxon').DateTime.fromISO(dateStr, { zone: 'America/New_York' });
        if (isEndOfDay) {
          return et.endOf('day').toUTC().toISO();
        }
        return et.startOf('day').toUTC().toISO();
      }

      let start, end;
      if (startDate && endDate) {
        const startDateUTC = etDateToUTC(startDate, false);
        const endDateUTC = etDateToUTC(endDate, true);
        start = new Date(startDateUTC);
        end = new Date(endDateUTC);
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const startDateStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const startDateUTC = etDateToUTC(startDateStr, false);
        const endDateUTC = etDateToUTC(endDateStr, true);
        start = new Date(startDateUTC);
        end = new Date(endDateUTC);
      }

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return null; // Will be handled after cache.getOrSet
      }

      const startISO = start.toISOString();
      const endISO = end.toISOString();
      const params = [startISO, endISO];

    // Get LTV by label (using selected metric)
    const ltvByLabel = await getLTVByLabel(ltvMetric);
    
    // Calculate predicted LTV based on retention rates
    const predictedLTVData = await calculatePredictedLTV(ltvByLabel);

    // Build filters
    let marketFilter = '';
    let channelFilter = '';
    let campaignFilter = '';
    let lessonTypeFilter = '';

    if (market) {
      marketFilter = `AND label_name ILIKE $${params.length + 1}`;
      params.push(`%${market}%`);
    }
    if (channel) {
      channelFilter = `AND LOWER(COALESCE(utm->>'utm_source', '')) = $${params.length + 1}`;
      params.push(channel.toLowerCase());
    }
    if (campaign) {
      campaignFilter = `AND COALESCE(utm->>'utm_campaign', '') ILIKE $${params.length + 1}`;
      params.push(`%${campaign}%`);
    }
    if (lessonType) {
      lessonTypeFilter = `AND booking_type ILIKE $${params.length + 1}`;
      params.push(`%${lessonType}%`);
    }

    // Comprehensive query for all metrics
    const enterpriseQuery = `
      WITH form_stats AS (
        SELECT
          COUNT(*) AS form_starts,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS form_completions,
          COUNT(*) FILTER (WHERE payment_status = 'paid') AS payments,
          COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')) AS registrations,
          SUM(actual_price) FILTER (WHERE payment_status = 'paid') AS revenue,
          COUNT(DISTINCT session_id) AS unique_sessions,
          COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
          COUNT(*) FILTER (WHERE status = 'submitted') AS submitted,
          -- Meta/Facebook metrics (includes UTM-based AND heard_about field attribution)
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          )) AS facebook_form_starts,
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status IN ('paid', 'verified')) AS facebook_form_completions,
          COUNT(*) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status = 'paid') AS facebook_payments,
          SUM(actual_price) FILTER (WHERE (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          ) AND payment_status = 'paid') AS facebook_revenue,
          -- Google metrics
          COUNT(*) FILTER (WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'google' AND COALESCE(utm->>'utm_campaign', '') != '') AS google_form_starts,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'google' AND COALESCE(utm->>'utm_campaign', '') != '' AND payment_status IN ('paid', 'verified')) AS google_form_completions,
          SUM(actual_price) FILTER (WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'google' AND COALESCE(utm->>'utm_campaign', '') != '' AND payment_status = 'paid') AS google_revenue,
          -- Calculate Facebook LTV revenue directly (no need to aggregate all details)
          -- This replaces the expensive json_agg that was being discarded anyway
          0 AS completion_details_placeholder
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          ${marketFilter}
          ${channelFilter}
          ${campaignFilter}
          ${lessonTypeFilter}
      ),
      view_stats AS (
        SELECT
          COALESCE(COUNT(*), 0) AS form_views,
          COALESCE(COUNT(DISTINCT session_id), 0) AS unique_view_sessions,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '') AS facebook_form_views,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'google' AND COALESCE(utm->>'utm_campaign', '') != '') AS google_form_views
        FROM booking_form_views
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
      ),
      ad_spend_stats AS (
        SELECT
          COALESCE(SUM(impressions), 0) AS total_impressions,
          COALESCE(SUM(clicks), 0) AS total_clicks,
          COALESCE(SUM(spend), 0) AS total_spend,
          CASE 
            WHEN SUM(impressions) > 0 THEN ROUND((SUM(clicks)::numeric / SUM(impressions)::numeric) * 100, 2)
            ELSE 0
          END AS avg_ctr,
          CASE 
            WHEN SUM(clicks) > 0 THEN ROUND((SUM(spend)::numeric / SUM(clicks)::numeric), 2)
            ELSE 0
          END AS avg_cpc,
          CASE 
            WHEN SUM(impressions) > 0 THEN ROUND((SUM(spend)::numeric / SUM(impressions)::numeric) * 1000, 2)
            ELSE 0
          END AS avg_cpm,
          -- Meta Ads
          COALESCE(SUM(impressions) FILTER (WHERE platform = 'meta'), 0) AS meta_impressions,
          COALESCE(SUM(clicks) FILTER (WHERE platform = 'meta'), 0) AS meta_clicks,
          COALESCE(SUM(spend) FILTER (WHERE platform = 'meta'), 0) AS meta_spend,
          -- Google Ads
          COALESCE(SUM(impressions) FILTER (WHERE platform = 'google'), 0) AS google_impressions,
          COALESCE(SUM(clicks) FILTER (WHERE platform = 'google'), 0) AS google_clicks,
          COALESCE(SUM(spend) FILTER (WHERE platform = 'google'), 0) AS google_spend,
          -- Reach (unique users from impressions - approximate)
          COALESCE(COUNT(DISTINCT campaign_name), 0) AS unique_campaigns
        FROM ad_spend_data
        WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
      ),
      tutor_costs AS (
        SELECT
          COALESCE(SUM(
            CASE
              WHEN a.charge_type = 'hourly'
                THEN ac.pay_rate * a.units
              WHEN a.charge_type = 'one-off'
                THEN ac.pay_rate
              WHEN a.charge_type = 'one-off-split'
                THEN ac.pay_rate
              WHEN a.charge_type = 'hourly-split'
                THEN ac.pay_rate * a.units
              ELSE
                ac.pay_rate * a.units
            END
          ), 0) AS total_tutor_pay
        FROM appointment_contractors ac
        JOIN appointments a ON a.appointment_id = ac.appointment_id
        JOIN services s ON a.service_id = s.service_id
        WHERE a.status IN ('complete', 'cancelled-chargeable')
          AND a.start >= $1::timestamptz AND a.start <= $2::timestamptz
      )
      SELECT 
        fs.*,
        vs.*,
        ads.*,
        tc.total_tutor_pay
      FROM form_stats fs
      CROSS JOIN view_stats vs
      CROSS JOIN ad_spend_stats ads
      CROSS JOIN tutor_costs tc
    `;

    const result = await pool.query(enterpriseQuery, params);
    const raw = result.rows[0] || {};

    // Ensure numeric values are parsed correctly (PostgreSQL returns numeric types as strings in JSON)
    const parseNumeric = (val) => {
      if (val === null || val === undefined) return 0;
      const num = typeof val === 'string' ? parseFloat(val) : Number(val);
      return isNaN(num) ? 0 : num;
    };

    // Parse all numeric fields
    raw.facebook_revenue = parseNumeric(raw.facebook_revenue);
    raw.meta_spend = parseNumeric(raw.meta_spend);
    raw.google_spend = parseNumeric(raw.google_spend);
    raw.total_spend = parseNumeric(raw.total_spend);
    raw.revenue = parseNumeric(raw.revenue);
    raw.total_tutor_pay = parseNumeric(raw.total_tutor_pay);

    // Calculate LTV-based revenue for Meta ads using a simpler query
    // This is more efficient than aggregating all completion_details and iterating
    let facebookLtvRevenue = 0;
    if (ltvByLabel && Object.keys(ltvByLabel).length > 0) {
      // Query Facebook submissions with label_name only (no full aggregation)
      const ltvParams = [...params]; // Copy existing params (startISO, endISO, and any filters)
      let ltvQuery = `
        SELECT 
          label_name,
          booking_type,
          actual_price
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND payment_status IN ('paid', 'verified')
          AND (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          )
      `;
      
      // Add filters if present (params already includes startISO, endISO)
      if (marketFilter) {
        ltvQuery += ` ${marketFilter}`;
      }
      if (channelFilter) {
        ltvQuery += ` ${channelFilter}`;
      }
      if (campaignFilter) {
        ltvQuery += ` ${campaignFilter}`;
      }
      if (lessonTypeFilter) {
        ltvQuery += ` ${lessonTypeFilter}`;
      }
      
      try {
        const ltvResult = await pool.query(ltvQuery, ltvParams);
        // Calculate LTV revenue in JavaScript (much faster than complex SQL CASE statements)
        ltvResult.rows.forEach(row => {
          let label = row.label_name;
          if (!label && row.booking_type) {
            label = getLabelFromBookingType(row.booking_type);
          }
          const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
          if (ltv > 0) {
            facebookLtvRevenue += ltv;
          } else {
            facebookLtvRevenue += parseFloat(row.actual_price || 0);
          }
        });
      } catch (ltvError) {
        logger.error({ data: ltvError }, 'Error calculating Facebook LTV revenue:');
        // Fallback to using actual_price sum if LTV calculation fails
        facebookLtvRevenue = raw.facebook_revenue || 0;
      }
    } else {
      // No LTV data available, use actual revenue
      facebookLtvRevenue = raw.facebook_revenue || 0;
    }

    // Calculate all metrics
    const metrics = {
      // Core Funnel Metrics
      coreFunnel: {
        reach: raw.meta_impressions || 0, // Approximate unique users
        ctr: raw.avg_ctr || 0,
        cpc: raw.avg_cpc || 0,
        formViews: raw.form_views || 0,
        formStarts: raw.form_starts || 0,
        formCompletions: raw.form_completions || 0,
        cpl: raw.facebook_form_starts > 0 && raw.meta_spend > 0 
          ? parseFloat((raw.meta_spend / raw.facebook_form_starts).toFixed(2))
          : 0,
        cpr: raw.facebook_form_completions > 0 && raw.meta_spend > 0
          ? parseFloat((raw.meta_spend / raw.facebook_form_completions).toFixed(2))
          : 0,
        trialConversionRate: raw.form_starts > 0
          ? parseFloat(((raw.form_completions / raw.form_starts) * 100).toFixed(2))
          : 0,
        trialRoas: raw.meta_spend > 0 && raw.facebook_revenue > 0
          ? parseFloat((raw.facebook_revenue / raw.meta_spend).toFixed(2))
          : 0
      },

      // Revenue & Value Metrics
      revenue: {
        totalAdAttributedRevenue: raw.facebook_revenue || 0,
        aov: raw.payments > 0
          ? parseFloat((raw.revenue / raw.payments).toFixed(2))
          : 0,
        avgLtv: Object.values(ltvByLabel).length > 0
          ? parseFloat((Object.values(ltvByLabel).reduce((a, b) => a + b, 0) / Object.values(ltvByLabel).length).toFixed(2))
          : 0,
        shortTermRoas: raw.meta_spend > 0 && raw.facebook_revenue > 0
          ? parseFloat((Number(raw.facebook_revenue) / Number(raw.meta_spend)).toFixed(2))
          : 0,
        lifetimeRoas: raw.meta_spend > 0 && facebookLtvRevenue > 0
          ? parseFloat((Number(facebookLtvRevenue) / Number(raw.meta_spend)).toFixed(2))
          : 0,
        blendedRoas: raw.meta_spend > 0 && (raw.facebook_revenue + facebookLtvRevenue) > 0
          ? parseFloat(((Number(raw.facebook_revenue) + Number(facebookLtvRevenue)) / Number(raw.meta_spend)).toFixed(2))
          : 0,
        poas: raw.meta_spend > 0 && (raw.facebook_revenue + facebookLtvRevenue) > 0
          ? parseFloat((((Number(raw.facebook_revenue) + (Number(facebookLtvRevenue) * 0.43379676)) - Number(raw.meta_spend)) / Number(raw.meta_spend)).toFixed(2))
          : 0,
        grossMargin: (raw.facebook_revenue + facebookLtvRevenue) > 0
          ? parseFloat((((Number(raw.facebook_revenue) + Number(facebookLtvRevenue)) * 0.43) / (Number(raw.facebook_revenue) + Number(facebookLtvRevenue)) * 100).toFixed(2))
          : 0,
        netMarginAfterAdSpend: (raw.facebook_revenue + facebookLtvRevenue) > 0
          ? parseFloat((((Number(raw.facebook_revenue) + Number(facebookLtvRevenue)) * 0.43 - Number(raw.meta_spend)) / (Number(raw.facebook_revenue) + Number(facebookLtvRevenue)) * 100).toFixed(2))
          : 0
      },

      // Conversion & Behavior Metrics (using available data)
      conversion: {
        bounceRate: raw.form_views > 0 && raw.form_starts > 0
          ? parseFloat(((raw.form_views - raw.form_starts) / raw.form_views * 100).toFixed(2))
          : 0,
        avgSessionDuration: 0, // Not tracked currently
        conversionRate: raw.form_starts > 0
          ? parseFloat(((raw.form_completions / raw.form_starts) * 100).toFixed(2))
          : 0,
        formAbandonmentRate: raw.form_starts > 0
          ? parseFloat(((raw.form_starts - raw.form_completions) / raw.form_starts * 100).toFixed(2))
          : 0,
        frequency: raw.meta_impressions > 0 && raw.unique_view_sessions > 0
          ? parseFloat((raw.meta_impressions / raw.unique_view_sessions).toFixed(2))
          : 0,
        viewThroughConversions: 0, // Not tracked currently
        multiTouchRoas: raw.meta_spend > 0 && facebookLtvRevenue > 0
          ? parseFloat((facebookLtvRevenue / raw.meta_spend).toFixed(2))
          : 0,
        firstTouchAttribution: raw.facebook_form_completions || 0,
        lastTouchAttribution: raw.facebook_form_completions || 0
      },

      // Cost & Efficiency Metrics
      efficiency: {
        cpm: raw.avg_cpm || 0,
        cac: raw.form_completions > 0 && raw.total_spend > 0
          ? parseFloat((raw.total_spend / raw.form_completions).toFixed(2))
          : 0,
        paybackPeriod: 0, // Would need historical data
        churnRate: 0, // Would need rebooking data
        spendByMarket: {}, // Would need breakdown by label
        spendVsRevenueByChannel: {
          meta: {
            spend: raw.meta_spend || 0,
            revenue: raw.facebook_revenue || 0
          },
          google: {
            spend: raw.google_spend || 0,
            revenue: 0 // Would need Google revenue tracking
          }
        }
      },

      // Strategic & Advanced KPIs
      strategic: {
        ltvCacRatio: 0, // Calculated below
        incrementalRevenuePerDollar: raw.total_spend > 0 && facebookLtvRevenue > 0
          ? parseFloat((facebookLtvRevenue / raw.total_spend).toFixed(2))
          : 0,
        predictedLtv: predictedLTVData.predictedLTV || 0,
        revenuePerImpression: raw.total_impressions > 0 && raw.revenue > 0
          ? parseFloat((raw.revenue / raw.total_impressions).toFixed(4))
          : 0,
        roasByMarket: {}, // Calculated below
        roasByChannel: {
          meta: raw.meta_spend > 0 && facebookLtvRevenue > 0
            ? parseFloat((facebookLtvRevenue / raw.meta_spend).toFixed(2))
            : 0,
          google: raw.google_spend > 0 && raw.google_revenue > 0
            ? parseFloat((raw.google_revenue / raw.google_spend).toFixed(2))
            : 0
        },
        retentionRate: 0 // Would need historical rebooking data
      }
    };

    // Calculate LTV:CAC ratio
    const avgLtv = metrics.revenue.avgLtv;
    const cac = metrics.efficiency.cac;
    metrics.strategic.ltvCacRatio = cac > 0 ? parseFloat((avgLtv / cac).toFixed(2)) : 0;

    // Calculate ROAS by market using a simpler query (no full aggregation)
    if (raw.facebook_form_completions > 0 && raw.meta_spend > 0 && ltvByLabel && Object.keys(ltvByLabel).length > 0) {
      const marketParams = [...params]; // Copy existing params
      let marketQuery = `
        SELECT 
          label_name,
          booking_type,
          actual_price
        FROM booking_submissions
        WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          AND payment_status IN ('paid', 'verified')
          AND (
            (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
            OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
          )
      `;
      
      // Add filters if present
      if (marketFilter) {
        marketQuery += ` ${marketFilter}`;
      }
      if (channelFilter) {
        marketQuery += ` ${channelFilter}`;
      }
      if (campaignFilter) {
        marketQuery += ` ${campaignFilter}`;
      }
      if (lessonTypeFilter) {
        marketQuery += ` ${lessonTypeFilter}`;
      }
      
      try {
        const marketResult = await pool.query(marketQuery, marketParams);
        const marketData = {};
        
        // Group by label and calculate LTV
        marketResult.rows.forEach(row => {
          let label = row.label_name || 'Unknown';
          if (!label && row.booking_type) {
            label = getLabelFromBookingType(row.booking_type);
          }
          
          if (!marketData[label]) {
            marketData[label] = { completions: 0, ltv: 0 };
          }
          marketData[label].completions += 1;
          
          const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
          marketData[label].ltv += ltv > 0 ? ltv : parseFloat(row.actual_price || 0);
        });
        
        // Calculate ROAS per market
        Object.keys(marketData).forEach(label => {
          const completions = marketData[label].completions;
          const ltv = marketData[label].ltv;
          
          if (completions > 0) {
            const marketSpend = raw.meta_spend * (completions / raw.facebook_form_completions);
            metrics.strategic.roasByMarket[label] = marketSpend > 0
              ? parseFloat((ltv / marketSpend).toFixed(2))
              : 0;
          }
        });
      } catch (marketError) {
        logger.error({ data: marketError }, 'Error calculating ROAS by market:');
        // Continue without market breakdown if query fails
      }
    }

      return {
        period: {
          startDate: startISO,
          endDate: endISO
        },
        metrics,
        raw: {
          ...raw,
          facebookLtvRevenue,
          ltvByLabel, // Include LTV by label for breakdowns
          predictedLTVData, // Include predicted LTV data with retention rates
          // completion_details removed - no longer needed (was causing performance issues)
        }
      };
    }, 300); // 5 minute TTL

    if (result === null) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    res.json(result);

  } catch (err) {
    logger.error({ err: err }, 'Error in enterprise analytics:');
    res.status(500).json({
      error: 'Failed to fetch enterprise analytics',
      details: err.message
    });
  }
}));

// Enterprise trends endpoint - returns monthly metrics from August 2025 to now
router.get('/analytics/enterprise-trends', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { DateTime } = require('luxon');
    
    // Get LTV metric preference (default to average for backward compatibility)
    const ltvMetric = req.query.ltvMetric || 'average';
    
    // Find the earliest date with AD SPEND data (not just any data)
    // This ensures we only show months where we actually have marketing data
    // Check for data from July 2025 onwards (when marketing started)
    const earliestAdSpendQuery = `
      SELECT MIN(date) AS earliest_date
      FROM ad_spend_data
      WHERE (spend > 0 OR impressions > 0 OR clicks > 0)
        AND date >= '2025-07-01'::date
    `;
    const earliestResult = await client.query(earliestAdSpendQuery);
    const earliestDateStr = earliestResult.rows[0]?.earliest_date;
    
    // Always start from July 2025 (when performance marketing started)
    // OR the earliest ad spend date AFTER July 2025, whichever is LATER
    // This prevents showing empty months before marketing started, but includes July if it has data
    const july2025 = DateTime.fromObject({ year: 2025, month: 7, day: 1 }, { zone: 'America/New_York' });
    let startDate = july2025;
    
    if (earliestDateStr) {
      const earliestDate = DateTime.fromISO(earliestDateStr, { zone: 'America/New_York' });
      const earliestMonth = earliestDate.startOf('month');
      // Use the later of: July 2025 or earliest ad spend month
      // This ensures we don't show empty months before marketing started
      if (earliestMonth > july2025) {
        startDate = earliestMonth;
        logger.info({ earliestMonth: earliestMonth.toFormat('MMM yyyy') }, 'Enterprise trends: Using earliest ad spend month instead of July 2025');
      } else {
        logger.info({ earliestMonth: earliestMonth.toFormat('MMM yyyy') }, 'Enterprise trends: Using July 2025 as start date');
      }
    } else {
      logger.info('Enterprise trends: No ad spend data found, defaulting to July 2025');
    }
    
    // Ensure we never go before July 2025
    if (startDate < july2025) {
      startDate = july2025;
      logger.info('Enterprise trends: Clamping start date to July 2025');
    }
    
    const endDate = DateTime.now().setZone('America/New_York');
    
    // Get LTV by label using the selected metric
    const ltvByLabel = await getLTVByLabel(ltvMetric);
    
    // Generate list of months from startDate to now
    const months = [];
    let currentMonth = startDate.startOf('month');
    while (currentMonth <= endDate.startOf('month')) {
      // Convert ET month boundaries to UTC properly using the same method as other endpoints
      const monthStartET = currentMonth.startOf('month');
      const monthEndET = currentMonth.endOf('month');
      
      // Convert to UTC ISO strings (same as etDateToUTC function)
      const monthStart = monthStartET.toUTC().toISO();
      const monthEnd = monthEndET.toUTC().toISO();
      
      months.push({
        monthStart,
        monthEnd,
        monthLabel: currentMonth.toFormat('MMM yyyy')
      });
      currentMonth = currentMonth.plus({ months: 1 });
    }
    
    logger.info({ monthCount: months.length, startDate: startDate.toFormat('MMM yyyy') }, 'Enterprise trends: Generating data');
    logger.info({ earliestDateStr: earliestDateStr || 'none' }, 'Enterprise trends: Earliest ad spend date found');
    if (months.length > 0) {
      logger.info(`Enterprise trends: First month range: ${months[0].monthStart} to ${months[0].monthEnd}`);
      logger.info(`Enterprise trends: Last month range: ${months[months.length - 1].monthStart} to ${months[months.length - 1].monthEnd}`);
    }
    
    // Fetch enterprise metrics for each month
    // Process in batches to avoid connection pool exhaustion
    const batchSize = 5; // Process 5 months at a time
    const monthlyData = [];
    
    for (let i = 0; i < months.length; i += batchSize) {
      const batch = months.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(async ({ monthStart, monthEnd, monthLabel }) => {
        try {
          const params = [monthStart, monthEnd];
          
          // Debug: Log the date range being queried for key months
          if (monthLabel === 'Aug 2025' || monthLabel === 'Sep 2025' || monthLabel === 'Oct 2025' || monthLabel === 'Nov 2025') {
            logger.info(`Enterprise trends [${monthLabel}]: Querying ${monthStart} to ${monthEnd}`);
          }
          
          // Simplified query for monthly trends (similar to enterprise but optimized)
          // Ensure CTEs always return at least one row even if tables are empty
          let query = `
          WITH form_stats AS (
            SELECT
              COALESCE(COUNT(*), 0) AS form_starts,
              COALESCE(COUNT(*) FILTER (WHERE payment_status IN ('paid', 'verified')), 0) AS form_completions,
              COALESCE(SUM(actual_price) FILTER (WHERE payment_status = 'paid'), 0) AS revenue,
              COALESCE(COUNT(*) FILTER (WHERE (
                (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
              )), 0) AS facebook_form_starts,
              COALESCE(COUNT(*) FILTER (WHERE (
                (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
              ) AND payment_status IN ('paid', 'verified')), 0) AS facebook_form_completions,
              COALESCE(SUM(actual_price) FILTER (WHERE (
                (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
              ) AND payment_status = 'paid'), 0) AS facebook_revenue,
              COALESCE(
                (json_agg(
                  json_build_object(
                    'label_name', label_name,
                    'booking_type', booking_type,
                    'payment_status', payment_status,
                    'is_facebook', CASE WHEN (
                      (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                      OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                    ) THEN true ELSE false END
                  ) ORDER BY created_at
                ) FILTER (WHERE payment_status IN ('paid', 'verified') AND (
                  (LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook' AND COALESCE(utm->>'utm_campaign', '') != '')
                  OR (LOWER(COALESCE(heard_about, '')) IN ('facebook', 'instagram'))
                )))::jsonb,
                '[]'::jsonb
              ) AS facebook_completions
            FROM booking_submissions
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          ),
          form_stats_ensured AS (
            SELECT * FROM form_stats
            UNION ALL
            SELECT 0, 0, 0, 0, 0, 0, '[]'::jsonb
            WHERE NOT EXISTS (SELECT 1 FROM form_stats)
          ),
          ad_spend_stats AS (
            SELECT
              COALESCE(SUM(impressions), 0) AS total_impressions,
              COALESCE(SUM(clicks), 0) AS total_clicks,
              COALESCE(SUM(spend), 0) AS total_spend,
              -- Meta/Facebook/Instagram: check for all possible platform values
              COALESCE(SUM(impressions) FILTER (WHERE LOWER(platform) IN ('meta', 'facebook', 'instagram')), 0) AS meta_impressions,
              COALESCE(SUM(clicks) FILTER (WHERE LOWER(platform) IN ('meta', 'facebook', 'instagram')), 0) AS meta_clicks,
              COALESCE(SUM(spend) FILTER (WHERE LOWER(platform) IN ('meta', 'facebook', 'instagram')), 0) AS meta_spend,
              COALESCE(SUM(spend) FILTER (WHERE LOWER(platform) = 'google'), 0) AS google_spend
            FROM ad_spend_data
            WHERE date >= DATE($1::timestamptz) AND date <= DATE($2::timestamptz)
          ),
          ad_spend_stats_ensured AS (
            SELECT * FROM ad_spend_stats
            UNION ALL
            SELECT 0, 0, 0, 0, 0, 0, 0
            WHERE NOT EXISTS (SELECT 1 FROM ad_spend_stats)
          )
        `;
        
        // Try to include view_stats, fallback if table doesn't exist
        let viewStatsQuery = `,
          view_stats AS (
            SELECT
              COALESCE(COUNT(*), 0) AS form_views,
              COALESCE(
                COUNT(*) FILTER (
                  WHERE LOWER(COALESCE(utm->>'utm_source', '')) = 'facebook'
                    AND COALESCE(utm->>'utm_campaign', '') != ''
                ),
                0
              ) AS facebook_form_views
            FROM booking_form_views
            WHERE created_at >= $1::timestamptz AND created_at <= $2::timestamptz
          )
        `;
        
        let finalQuery = query + viewStatsQuery + `
          SELECT
            f.form_starts,
            f.form_completions,
            f.revenue,
            f.facebook_form_starts,
            f.facebook_form_completions,
            f.facebook_revenue,
            f.facebook_completions,
            COALESCE(v.form_views, 0) AS form_views,
            COALESCE(v.facebook_form_views, 0) AS facebook_form_views,
            a.total_impressions,
            a.total_clicks,
            a.total_spend,
            a.meta_impressions,
            a.meta_clicks,
            a.meta_spend,
            a.google_spend
          FROM form_stats_ensured f
          CROSS JOIN view_stats v
          CROSS JOIN ad_spend_stats_ensured a
          LIMIT 1
        `;
        
        let result;
        try {
          result = await client.query(finalQuery, params);
        } catch (queryErr) {
          // If booking_form_views table doesn't exist, use fallback query
          if (queryErr.code === '42P01' && queryErr.message.includes('booking_form_views')) {
            logger.warn({ monthLabel }, 'booking_form_views table does not exist, using fallback query');
            finalQuery = query + `
              SELECT
                f.form_starts,
                f.form_completions,
                f.revenue,
                f.facebook_form_starts,
                f.facebook_form_completions,
                f.facebook_revenue,
                f.facebook_completions,
                0 AS form_views,
                0 AS facebook_form_views,
                a.total_impressions,
                a.total_clicks,
                a.total_spend,
                a.meta_impressions,
                a.meta_clicks,
                a.meta_spend,
                a.google_spend
              FROM form_stats_ensured f
              CROSS JOIN ad_spend_stats_ensured a
              LIMIT 1
            `;
            result = await pool.query(finalQuery, params);
          } else {
            logger.error({ data: queryErr }, `Query error for ${monthLabel}:`);
            logger.error({ data: finalQuery }, 'Query:');
            logger.error({ data: params }, 'Params:');
            throw queryErr;
          }
        }
        
        const row = result.rows[0] || {};
        
        // Debug: Log raw row data for key months
        if (monthLabel === 'Oct 2025' || monthLabel === 'Nov 2025' || monthLabel === 'Aug 2025' || monthLabel === 'Sep 2025') {
          logger.info({ data: {
            form_starts: row.form_starts,
            form_completions: row.form_completions,
            facebook_form_starts: row.facebook_form_starts,
            facebook_form_completions: row.facebook_form_completions,
            meta_spend: row.meta_spend,
            facebook_revenue: row.facebook_revenue,
            facebook_completions_count: row.facebook_completions ? (Array.isArray(row.facebook_completions) ? row.facebook_completions.length : 0) : 0,
            monthStart: monthStart,
            monthEnd: monthEnd
          } }, `Enterprise trends [${monthLabel}]: Raw row data:`);
        }
        
        // Calculate Facebook LTV revenue
        let facebookLtvRevenue = 0;
        if (row.facebook_completions && Array.isArray(row.facebook_completions)) {
          row.facebook_completions.forEach(completion => {
            try {
              let label = completion.label_name;
              if (!label && completion.booking_type) {
                label = getLabelFromBookingType(completion.booking_type);
              }
              // Ensure numeric conversion to prevent string concatenation
              const ltv = label && ltvByLabel[label] ? parseFloat(ltvByLabel[label]) || 0 : 0;
              facebookLtvRevenue += ltv;
            } catch (ltvErr) {
              logger.error({ data: ltvErr, completion }, 'Error calculating LTV for completion:');
            }
          });
        }
        
        // Parse numeric values
        const parseNumeric = (val) => {
          if (val === null || val === undefined) return 0;
          const num = typeof val === 'string' ? parseFloat(val) : Number(val);
          return isNaN(num) ? 0 : num;
        };
        
        const metaSpend = parseNumeric(row.meta_spend);
        const facebookRevenue = parseNumeric(row.facebook_revenue);
        const facebookCompletions = parseNumeric(row.facebook_form_completions);
        const totalSpend = parseNumeric(row.total_spend);
        const totalCompletions = parseNumeric(row.form_completions);
        
        return {
          month: monthLabel,
          monthStart,
          monthEnd,
          formViews: parseNumeric(row.form_views),
          facebookFormViews: parseNumeric(row.facebook_form_views),
          formStarts: parseNumeric(row.form_starts),
          formCompletions: parseNumeric(row.form_completions),
          revenue: parseNumeric(row.revenue),
          facebookFormStarts: parseNumeric(row.facebook_form_starts),
          facebookFormCompletions: facebookCompletions,
          facebookRevenue: facebookRevenue,
          facebookLtvRevenue: facebookLtvRevenue,
          metaImpressions: parseNumeric(row.meta_impressions),
          metaClicks: parseNumeric(row.meta_clicks),
          metaSpend: metaSpend,
          googleSpend: parseNumeric(row.google_spend),
          totalSpend: totalSpend,
          totalImpressions: parseNumeric(row.total_impressions),
          totalClicks: parseNumeric(row.total_clicks),
          // Calculated metrics
          roas: metaSpend > 0 ? parseFloat((facebookLtvRevenue / metaSpend).toFixed(2)) : 0,
          trialRoas: metaSpend > 0 ? parseFloat((facebookRevenue / metaSpend).toFixed(2)) : 0,
          blendedRoas: metaSpend > 0 ? parseFloat(((facebookRevenue + facebookLtvRevenue) / metaSpend).toFixed(2)) : 0,
          // CPL: Fix August 2025 anomaly where Facebook leads weren't properly attributed
          // If Facebook form starts are very low (< 10) in August, it indicates poor attribution
          // Use 0 for August 2025 to avoid showing inflated CPL
          cpl: (() => {
            const facebookStarts = parseNumeric(row.facebook_form_starts);
            if (monthLabel === 'Aug 2025' && facebookStarts < 10) {
              // August 2025 had poor Facebook attribution, don't show inflated CPL
              return 0;
            }
            return facebookStarts > 0 ? parseFloat((metaSpend / facebookStarts).toFixed(2)) : 0;
          })(),
          cpr: facebookCompletions > 0 ? parseFloat((metaSpend / facebookCompletions).toFixed(2)) : 0,
          cac: totalCompletions > 0 ? parseFloat((totalSpend / totalCompletions).toFixed(2)) : 0,
          conversionRate: parseNumeric(row.form_starts) > 0 ? parseFloat(((parseNumeric(row.form_completions) / parseNumeric(row.form_starts)) * 100).toFixed(2)) : 0,
          facebookConversionRate: parseNumeric(row.facebook_form_starts) > 0 ? parseFloat(((facebookCompletions / parseNumeric(row.facebook_form_starts)) * 100).toFixed(2)) : 0,
          ctr: parseNumeric(row.meta_impressions) > 0 ? parseFloat(((parseNumeric(row.meta_clicks) / parseNumeric(row.meta_impressions)) * 100).toFixed(2)) : 0,
          cpc: parseNumeric(row.meta_clicks) > 0 ? parseFloat((metaSpend / parseNumeric(row.meta_clicks)).toFixed(2)) : 0
        };
      } catch (err) {
        logger.error({ err: err }, `Error fetching data for ${monthLabel}:`);
        return {
          month: monthLabel,
          monthStart,
          monthEnd,
          formViews: 0,
          facebookFormViews: 0,
          formStarts: 0,
          formCompletions: 0,
          revenue: 0,
          facebookFormStarts: 0,
          facebookFormCompletions: 0,
          facebookRevenue: 0,
          facebookLtvRevenue: 0,
          metaImpressions: 0,
          metaClicks: 0,
          metaSpend: 0,
          googleSpend: 0,
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          roas: 0,
          trialRoas: 0,
          blendedRoas: 0,
          cpl: 0,
          cpr: 0,
          cac: 0,
          conversionRate: 0,
          facebookConversionRate: 0,
          ctr: 0,
          cpc: 0
        };
      }
        }));
        monthlyData.push(...batchResults);
      }
    
    // Debug: Log the response to see what we're returning
    logger.info(`Enterprise trends: Returning ${monthlyData.length} months of data`);
    if (monthlyData.length > 0) {
      logger.info({ data: JSON.stringify(monthlyData[0], null, 2) }, 'Sample month data:');
      // Check if we have any non-zero values
      const hasNonZeroData = monthlyData.some(month => 
        month.roas > 0 || month.metaSpend > 0 || month.facebookFormStarts > 0
      );
      logger.info(`Enterprise trends: Has non-zero data: ${hasNonZeroData}`);
      if (!hasNonZeroData) {
        logger.info('Enterprise trends: WARNING - All values appear to be zero. Check date range and data availability.');
      }
    }
    
    res.json({
      startDate: startDate.toISO(),
      endDate: endDate.toISO(),
      monthlyData
    });
  } catch (err) {
    logger.error({ err: err }, 'Error in enterprise trends:');
    logger.error({ data: err.stack }, 'Error stack:');
    res.status(500).json({
      error: 'Failed to fetch enterprise trends',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    client.release();
  }
}));

// Get realized revenue over time for Meta-acquired clients
// This tracks actual revenue generated by clients who signed up via Meta ads
router.get('/analytics/realized-revenue', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate, month } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    let startDateUTC;
    let endDateUTC;
    try {
      startDateUTC = etDateToUTC(startDate, false);
      endDateUTC = etDateToUTC(endDate, true);
    } catch (conversionError) {
      logger.error({ data: {
        startDate,
        endDate,
        message: conversionError?.message,
      } }, '❌ Invalid date range supplied to realized revenue endpoint:');
      return res.status(400).json({
        error: 'Invalid date range',
        details: conversionError?.message || 'Unable to interpret provided dates',
      });
    }

    logger.info({ data: { startDate, endDate, startDateUTC, endDateUTC } }, '📊 Fetching realized revenue for Meta-acquired clients:');

    // Query to get Meta-acquired clients and their realized revenue over time
    // This links booking_submissions to clients via tc_client_id, then tracks invoice revenue
    const query = `
      WITH meta_acquired_clients AS (
        -- Get Meta-acquired clients from booking submissions
        -- Includes both UTM-based attribution and heard_about field attribution
        SELECT DISTINCT
          bs.id AS submission_id,
          bs.tc_client_id,
          bs.created_at AS acquisition_date,
          bs.parent_first,
          bs.parent_last,
          bs.parent_email,
          bs.booking_type,
          bs.label_name,
          COALESCE(bs.utm->>'utm_campaign', '') AS utm_campaign
        FROM booking_submissions bs
        WHERE bs.created_at >= $1::timestamptz 
          AND bs.created_at <= $2::timestamptz
          AND (
            -- UTM-based attribution (existing)
            (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
             AND COALESCE(bs.utm->>'utm_campaign', '') != '')
            OR
            -- heard_about field attribution (for August and other submissions)
            (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
          )
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
      ),
      invoice_revenue_over_time AS (
        -- Get invoice revenue over time (separate to avoid cartesian product)
        -- EXCLUDE proforma invoices (PFI-*) - these are credit requests that shouldn't be counted as revenue
        SELECT
          mac.submission_id,
          mac.tc_client_id,
          mac.acquisition_date,
          mac.parent_first,
          mac.parent_last,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign,
          DATE_TRUNC('week', i.date_sent) AS revenue_week,
          DATE_TRUNC('month', i.date_sent) AS revenue_month,
          SUM(CASE 
            WHEN i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross 
            ELSE 0 
          END) AS revenue
        FROM meta_acquired_clients mac
        LEFT JOIN invoices i ON CAST(mac.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= mac.acquisition_date
        WHERE mac.tc_client_id IS NOT NULL
        GROUP BY 
          mac.submission_id,
          mac.tc_client_id,
          mac.acquisition_date,
          mac.parent_first,
          mac.parent_last,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign,
          DATE_TRUNC('week', i.date_sent),
          DATE_TRUNC('month', i.date_sent)
      ),
      proforma_revenue_over_time AS (
        -- Get proforma invoice revenue over time (separate to avoid cartesian product)
        SELECT
          mac.submission_id,
          mac.tc_client_id,
          mac.acquisition_date,
          mac.parent_first,
          mac.parent_last,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign,
          DATE_TRUNC('week', pfi.date_paid) AS revenue_week,
          DATE_TRUNC('month', pfi.date_paid) AS revenue_month,
          SUM(CASE 
            WHEN pfi.status = 'paid' 
            AND NOT EXISTS (
              SELECT 1 FROM invoices i2 
              WHERE CAST(i2.client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
              AND i2.date_sent = pfi.date_paid
              AND i2.status = 'paid'
            )
            THEN pfi.amount ELSE 0 END
          ) AS revenue
        FROM meta_acquired_clients mac
        LEFT JOIN proforma_invoices pfi ON CAST(mac.tc_client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
          AND pfi.status = 'paid'
          AND pfi.date_paid >= mac.acquisition_date
        WHERE mac.tc_client_id IS NOT NULL
        GROUP BY 
          mac.submission_id,
          mac.tc_client_id,
          mac.acquisition_date,
          mac.parent_first,
          mac.parent_last,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign,
          DATE_TRUNC('week', pfi.date_paid),
          DATE_TRUNC('month', pfi.date_paid)
      ),
      client_revenue_over_time AS (
        -- Use ONLY invoice revenue over time (exclude proforma invoices/credit requests to avoid double-counting)
        -- Credit requests are prepayments that get converted to invoices, so counting both would double-count revenue
        SELECT
          ir.submission_id,
          ir.tc_client_id,
          ir.acquisition_date,
          ir.parent_first,
          ir.parent_last,
          ir.parent_email,
          ir.booking_type,
          ir.label_name,
          ir.utm_campaign,
          ir.revenue_week,
          ir.revenue_month,
          COALESCE(ir.revenue, 0) AS revenue
        FROM invoice_revenue_over_time ir
        WHERE ir.revenue_week IS NOT NULL OR ir.revenue_month IS NOT NULL
      ),
      weekly_revenue AS (
        -- Aggregate revenue by week
        SELECT
          revenue_week AS period,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue,
          SUM(SUM(revenue)) OVER (ORDER BY revenue_week) AS cumulative_revenue
        FROM client_revenue_over_time
        WHERE revenue_week IS NOT NULL
        GROUP BY revenue_week
      ),
      monthly_revenue AS (
        -- Aggregate revenue by month
        SELECT
          revenue_month AS period,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue,
          SUM(SUM(revenue)) OVER (ORDER BY revenue_month) AS cumulative_revenue
        FROM client_revenue_over_time
        WHERE revenue_month IS NOT NULL
        GROUP BY revenue_month
      ),
      cohort_revenue AS (
        -- Cohort analysis: revenue earned by acquisition month over time
        SELECT
          DATE_TRUNC('month', acquisition_date) AS cohort_month,
          revenue_month,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue
        FROM client_revenue_over_time
        WHERE acquisition_date IS NOT NULL
          AND revenue_month IS NOT NULL
        GROUP BY DATE_TRUNC('month', acquisition_date), revenue_month
      ),
      cohort_revenue_with_cumulative AS (
        -- Show monthly revenue per cohort (not cumulative)
        -- This shows how much revenue each cohort generated in each month
        SELECT
          cohort_month,
          revenue_month,
          active_clients,
          total_revenue,
          -- Use total_revenue as monthly_revenue (not cumulative)
          -- Cumulative revenue was confusing - users want to see monthly revenue per cohort
          total_revenue AS monthly_revenue
        FROM cohort_revenue
      ),
      unique_client_acquisitions AS (
        -- Get unique client acquisitions (earliest acquisition date per client)
        SELECT
          mac.tc_client_id,
          MIN(mac.acquisition_date) AS acquisition_date
        FROM meta_acquired_clients mac
        GROUP BY mac.tc_client_id
      ),
      invoice_revenue AS (
        -- Calculate invoice revenue separately to avoid cartesian product
        -- Join from unique_client_acquisitions to ensure each invoice is counted only once
        -- EXCLUDE proforma invoices (PFI-*) - these are credit requests that shouldn't be counted as revenue
        SELECT
          uca.tc_client_id,
          SUM(CASE 
            WHEN i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross 
            ELSE 0 
          END) AS invoice_revenue,
          COUNT(DISTINCT i.id) FILTER (
            WHERE i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS invoice_count,
          MIN(i.date_sent) FILTER (
            WHERE i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS first_invoice_date,
          MAX(i.date_sent) FILTER (
            WHERE i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS last_invoice_date,
          -- Debug: List all invoice IDs and amounts for troubleshooting
          STRING_AGG(DISTINCT i.id::text || ':' || i.gross::text || ':' || COALESCE(i.display_id, ''), ', ') FILTER (
            WHERE i.status = 'paid' 
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS invoice_details
        FROM unique_client_acquisitions uca
        LEFT JOIN invoices i ON CAST(uca.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= uca.acquisition_date
        GROUP BY
          uca.tc_client_id
      ),
      proforma_revenue AS (
        -- Calculate proforma invoice revenue separately to avoid cartesian product
        -- Join from unique_client_acquisitions to ensure each proforma invoice is counted only once
        SELECT
          uca.tc_client_id,
          SUM(CASE 
            WHEN pfi.status = 'paid' 
            AND NOT EXISTS (
              SELECT 1 FROM invoices i2 
              WHERE CAST(i2.client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
              AND i2.date_sent::date = pfi.date_paid::date
              AND i2.status = 'paid'
            )
            THEN pfi.amount ELSE 0 END
          ) AS proforma_revenue,
          COUNT(DISTINCT pfi.id) FILTER (
            WHERE pfi.status = 'paid' 
            AND NOT EXISTS (
              SELECT 1 FROM invoices i2 
              WHERE CAST(i2.client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
              AND i2.date_sent::date = pfi.date_paid::date
              AND i2.status = 'paid'
            )
          ) AS proforma_invoice_count,
          MIN(pfi.date_paid) FILTER (
            WHERE pfi.status = 'paid' 
            AND NOT EXISTS (
              SELECT 1 FROM invoices i2 
              WHERE CAST(i2.client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
              AND i2.date_sent::date = pfi.date_paid::date
              AND i2.status = 'paid'
            )
          ) AS first_proforma_date,
          MAX(pfi.date_paid) FILTER (
            WHERE pfi.status = 'paid' 
            AND NOT EXISTS (
              SELECT 1 FROM invoices i2 
              WHERE CAST(i2.client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
              AND i2.date_sent::date = pfi.date_paid::date
              AND i2.status = 'paid'
            )
          ) AS last_proforma_date
        FROM unique_client_acquisitions uca
        LEFT JOIN proforma_invoices pfi ON CAST(uca.tc_client_id AS VARCHAR) = CAST(pfi.client_id AS VARCHAR)
          AND pfi.status = 'paid'
          AND pfi.date_paid >= uca.acquisition_date
        GROUP BY
          uca.tc_client_id
      ),
      unique_clients AS (
        -- Get unique clients from meta_acquired_clients to avoid double-counting
        SELECT DISTINCT ON (mac.tc_client_id)
          mac.tc_client_id,
          mac.submission_id,
          mac.acquisition_date,
          mac.parent_first,
          mac.parent_last,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign
        FROM meta_acquired_clients mac
        ORDER BY mac.tc_client_id, mac.acquisition_date ASC
      ),
      client_details AS (
        -- Use ONLY invoice revenue (exclude proforma invoices/credit requests to avoid double-counting)
        -- Credit requests are prepayments that get converted to invoices, so counting both would double-count revenue
        -- We only count paid invoices as realized revenue
        SELECT
          uc.tc_client_id,
          uc.submission_id,
          uc.acquisition_date,
          uc.parent_first || ' ' || uc.parent_last AS parent_name,
          uc.parent_email,
          uc.booking_type,
          uc.label_name,
          uc.utm_campaign,
          -- Only count paid invoices, not proforma invoices/credit requests
          COALESCE(ir.invoice_revenue, 0) AS total_revenue,
          COALESCE(ir.invoice_count, 0) AS invoice_count,
          0 AS proforma_invoice_count,
          ir.first_invoice_date AS first_payment_date,
          ir.last_invoice_date AS last_payment_date
        FROM unique_clients uc
        LEFT JOIN invoice_revenue ir ON uc.tc_client_id = ir.tc_client_id
      )
      SELECT
        'summary' AS data_type,
        jsonb_build_object(
          'total_clients', COUNT(DISTINCT cd.tc_client_id),
          'total_revenue', COALESCE(SUM(cd.total_revenue), 0),
          'avg_revenue_per_client', COALESCE(AVG(cd.total_revenue), 0),
          'clients_with_revenue', COUNT(DISTINCT cd.tc_client_id) FILTER (WHERE cd.total_revenue > 0)
        ) AS data
      FROM client_details cd
      
      UNION ALL
      
      SELECT
        'weekly' AS data_type,
        jsonb_build_object(
          'period', period::text,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'cumulative_revenue', cumulative_revenue
        ) AS data
      FROM weekly_revenue
      
      UNION ALL
      
      SELECT
        'monthly' AS data_type,
        jsonb_build_object(
          'period', period::text,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'cumulative_revenue', cumulative_revenue
        ) AS data
      FROM monthly_revenue
      
      UNION ALL
      
      SELECT
        'cohort_monthly' AS data_type,
        jsonb_build_object(
          'cohort_month', cohort_month::date,
          'revenue_month', revenue_month::date,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'monthly_revenue', monthly_revenue,
          'cumulative_revenue', monthly_revenue
        ) AS data
      FROM cohort_revenue_with_cumulative
      
      UNION ALL
      
      SELECT
        'clients' AS data_type,
        jsonb_build_object(
          'submission_id', submission_id,
          'tc_client_id', tc_client_id,
          'acquisition_date', acquisition_date,
          'parent_name', parent_name,
          'parent_email', parent_email,
          'booking_type', booking_type,
          'label_name', label_name,
          'utm_campaign', utm_campaign,
          'total_revenue', total_revenue,
          'invoice_count', invoice_count,
          'first_payment_date', first_payment_date,
          'last_payment_date', last_payment_date
        ) AS data
      FROM client_details
    `;

    const params = [startDateUTC, endDateUTC];
    const { rows } = await client.query(query, params);

    // Parse and sort results in JavaScript (PostgreSQL doesn't allow complex ORDER BY in UNION queries)
    const summary = rows.find(r => r.data_type === 'summary')?.data || {};
    const weeklyData = rows
      .filter(r => r.data_type === 'weekly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.period || !b.period) return 0;
        return new Date(a.period) - new Date(b.period);
      });
    const monthlyData = rows
      .filter(r => r.data_type === 'monthly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.period || !b.period) return 0;
        return new Date(a.period) - new Date(b.period);
      });
    const cohortMonthlyData = rows
      .filter(r => r.data_type === 'cohort_monthly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.cohort_month || !b.cohort_month) return 0;
        const cohortCompare = new Date(a.cohort_month) - new Date(b.cohort_month);
        if (cohortCompare !== 0) return cohortCompare;
        if (!a.revenue_month || !b.revenue_month) return cohortCompare;
        return new Date(a.revenue_month) - new Date(b.revenue_month);
      });
    const clientDetails = rows
      .filter(r => r.data_type === 'clients')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.acquisition_date || !b.acquisition_date) return 0;
        return new Date(b.acquisition_date) - new Date(a.acquisition_date);
      });

    // Debug: Log specific clients for troubleshooting
    // Try multiple name variations to find Joyce Ash
    const joyceAsh = clientDetails.find(c => {
      if (!c.parent_name) return false;
      const name = c.parent_name.toLowerCase();
      return name.includes('joyce') && name.includes('ash');
    });
    const fayeCope = clientDetails.find(c => c.parent_name && c.parent_name.toLowerCase().includes('faye cope'));
    
    // Log all client names to help debug
    logger.info({ data: clientDetails.map(c => c.parent_name).slice(0, 5) }, '🔍 DEBUG All client names:');
    
    if (joyceAsh) {
      logger.info(`🔍 DEBUG Joyce Ash found: ${joyceAsh.total_revenue} revenue, ${joyceAsh.invoice_count} invoices, client_id: ${joyceAsh.tc_client_id}, name: "${joyceAsh.parent_name}"`);
      // Query to see what invoices exist for this client
      const debugQuery = await client.query(`
        SELECT id, display_id, gross, status, date_sent, date_paid
        FROM invoices
        WHERE CAST(client_id AS VARCHAR) = $1
          AND status = 'paid'
        ORDER BY date_sent
      `, [joyceAsh.tc_client_id]);
      logger.info({ data: debugQuery.rows.map(r => ({
        id: r.id,
        display_id: r.display_id,
        gross: r.gross,
        date_sent: r.date_sent,
        date_paid: r.date_paid
      })) }, `🔍 DEBUG Joyce Ash invoices in DB (${debugQuery.rows.length} total):`);
      
      // Also check what the invoice_revenue CTE found
      const invoiceRevenueQuery = await client.query(`
        WITH unique_client_acquisitions AS (
          SELECT DISTINCT
            bs.tc_client_id,
            MIN(bs.created_at) AS acquisition_date
          FROM booking_submissions bs
          WHERE bs.created_at >= $1::timestamptz 
            AND bs.created_at <= $2::timestamptz
            AND (
              (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
               AND COALESCE(bs.utm->>'utm_campaign', '') != '')
              OR
              (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
            )
            AND bs.payment_status IN ('paid', 'verified')
            AND bs.tc_client_id IS NOT NULL
          GROUP BY bs.tc_client_id
        )
        SELECT
          uca.tc_client_id,
          SUM(CASE WHEN i.status = 'paid' THEN i.gross ELSE 0 END) AS invoice_revenue,
          COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') AS invoice_count,
          STRING_AGG(DISTINCT i.id::text || ':' || i.gross::text || ':' || i.display_id, ', ') FILTER (WHERE i.status = 'paid') AS invoice_details
        FROM unique_client_acquisitions uca
        LEFT JOIN invoices i ON CAST(uca.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= uca.acquisition_date
        WHERE uca.tc_client_id = $3
        GROUP BY uca.tc_client_id
      `, [startDateUTC, endDateUTC, joyceAsh.tc_client_id]);
      if (invoiceRevenueQuery.rows.length > 0) {
        logger.info({ data: invoiceRevenueQuery.rows[0] }, '🔍 DEBUG Joyce Ash invoice_revenue CTE result:');
      }
    } else {
      logger.info(`🔍 DEBUG Joyce Ash NOT FOUND in clientDetails. Total clients: ${clientDetails.length}`);
    }
    if (fayeCope) {
      logger.info(`🔍 DEBUG Faye Cope: ${fayeCope.total_revenue} revenue, ${fayeCope.invoice_count} invoices, client_id: ${fayeCope.tc_client_id}`);
    }
    logger.info(`✅ Realized revenue query completed: ${clientDetails.length} clients, ${summary.total_revenue || 0} total revenue`);

    res.json({
      summary,
      weekly: weeklyData,
      monthly: monthlyData,
      clients: clientDetails,
      cohortMonthly: cohortMonthlyData
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching realized revenue:');
    res.status(500).json({
      error: 'Failed to fetch realized revenue',
      details: err.message
    });
  } finally {
    client.release();
  }
}));

// Get realized revenue over time for Google-acquired clients
// This tracks actual revenue generated by clients who signed up via Google ads
router.get('/analytics/realized-revenue-google', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate, month } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    let startDateUTC;
    let endDateUTC;
    try {
      startDateUTC = etDateToUTC(startDate, false);
      endDateUTC = etDateToUTC(endDate, true);
    } catch (conversionError) {
      logger.error({ data: {
        startDate,
        endDate,
        message: conversionError?.message,
      } }, '❌ Invalid date range supplied to Google realized revenue endpoint:');
      return res.status(400).json({
        error: 'Invalid date range',
        details: conversionError?.message || 'Unable to interpret provided dates',
      });
    }

    logger.info({ data: { startDate, endDate, startDateUTC, endDateUTC } }, '📊 Fetching realized revenue for Google-acquired clients:');

    // Query to get Google-acquired clients and their realized revenue over time
    // This links booking_submissions to clients via tc_client_id, then tracks invoice revenue
    const query = `
      WITH google_acquired_clients AS (
        -- Get Google-acquired clients from booking submissions
        -- Includes both UTM-based attribution and heard_about field attribution
        SELECT DISTINCT
          bs.id AS submission_id,
          bs.tc_client_id,
          bs.created_at AS acquisition_date,
          bs.parent_first,
          bs.parent_last,
          bs.parent_email,
          bs.booking_type,
          bs.label_name,
          COALESCE(bs.utm->>'utm_campaign', '') AS utm_campaign
        FROM booking_submissions bs
        WHERE bs.created_at >= $1::timestamptz
          AND bs.created_at <= $2::timestamptz
          AND (
            -- UTM-based attribution
            LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'google'
            OR
            -- heard_about field attribution
            LOWER(COALESCE(bs.heard_about, '')) = 'google'
          )
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
      ),
      invoice_revenue_over_time AS (
        -- Get invoice revenue over time (separate to avoid cartesian product)
        -- EXCLUDE proforma invoices (PFI-*) - these are credit requests that shouldn't be counted as revenue
        SELECT
          gac.submission_id,
          gac.tc_client_id,
          gac.acquisition_date,
          gac.parent_first,
          gac.parent_last,
          gac.parent_email,
          gac.booking_type,
          gac.label_name,
          gac.utm_campaign,
          DATE_TRUNC('week', i.date_sent) AS revenue_week,
          DATE_TRUNC('month', i.date_sent) AS revenue_month,
          SUM(CASE
            WHEN i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross
            ELSE 0
          END) AS revenue
        FROM google_acquired_clients gac
        LEFT JOIN invoices i ON CAST(gac.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= gac.acquisition_date
        WHERE gac.tc_client_id IS NOT NULL
        GROUP BY
          gac.submission_id,
          gac.tc_client_id,
          gac.acquisition_date,
          gac.parent_first,
          gac.parent_last,
          gac.parent_email,
          gac.booking_type,
          gac.label_name,
          gac.utm_campaign,
          DATE_TRUNC('week', i.date_sent),
          DATE_TRUNC('month', i.date_sent)
      ),
      client_revenue_over_time AS (
        -- Use ONLY invoice revenue over time (exclude proforma invoices/credit requests to avoid double-counting)
        SELECT
          ir.submission_id,
          ir.tc_client_id,
          ir.acquisition_date,
          ir.parent_first,
          ir.parent_last,
          ir.parent_email,
          ir.booking_type,
          ir.label_name,
          ir.utm_campaign,
          ir.revenue_week,
          ir.revenue_month,
          COALESCE(ir.revenue, 0) AS revenue
        FROM invoice_revenue_over_time ir
        WHERE ir.revenue_week IS NOT NULL OR ir.revenue_month IS NOT NULL
      ),
      weekly_revenue AS (
        -- Aggregate revenue by week
        SELECT
          revenue_week AS period,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue,
          SUM(SUM(revenue)) OVER (ORDER BY revenue_week) AS cumulative_revenue
        FROM client_revenue_over_time
        WHERE revenue_week IS NOT NULL
        GROUP BY revenue_week
      ),
      monthly_revenue AS (
        -- Aggregate revenue by month
        SELECT
          revenue_month AS period,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue,
          SUM(SUM(revenue)) OVER (ORDER BY revenue_month) AS cumulative_revenue
        FROM client_revenue_over_time
        WHERE revenue_month IS NOT NULL
        GROUP BY revenue_month
      ),
      cohort_revenue AS (
        -- Cohort analysis: revenue earned by acquisition month over time
        SELECT
          DATE_TRUNC('month', acquisition_date) AS cohort_month,
          revenue_month,
          COUNT(DISTINCT tc_client_id) AS active_clients,
          SUM(revenue) AS total_revenue
        FROM client_revenue_over_time
        WHERE acquisition_date IS NOT NULL
          AND revenue_month IS NOT NULL
        GROUP BY DATE_TRUNC('month', acquisition_date), revenue_month
      ),
      cohort_revenue_with_cumulative AS (
        -- Show monthly revenue per cohort (not cumulative)
        SELECT
          cohort_month,
          revenue_month,
          active_clients,
          total_revenue,
          total_revenue AS monthly_revenue
        FROM cohort_revenue
      ),
      unique_client_acquisitions AS (
        -- Get unique client acquisitions (earliest acquisition date per client)
        SELECT
          gac.tc_client_id,
          MIN(gac.acquisition_date) AS acquisition_date
        FROM google_acquired_clients gac
        GROUP BY gac.tc_client_id
      ),
      invoice_revenue AS (
        -- Calculate invoice revenue separately to avoid cartesian product
        SELECT
          uca.tc_client_id,
          SUM(CASE
            WHEN i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
            THEN i.gross
            ELSE 0
          END) AS invoice_revenue,
          COUNT(DISTINCT i.id) FILTER (
            WHERE i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS invoice_count,
          MIN(i.date_sent) FILTER (
            WHERE i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS first_invoice_date,
          MAX(i.date_sent) FILTER (
            WHERE i.status = 'paid'
            AND (i.display_id IS NULL OR NOT i.display_id LIKE 'PFI-%')
          ) AS last_invoice_date
        FROM unique_client_acquisitions uca
        LEFT JOIN invoices i ON CAST(uca.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= uca.acquisition_date
        GROUP BY
          uca.tc_client_id
      ),
      unique_clients AS (
        -- Get unique clients from google_acquired_clients to avoid double-counting
        SELECT DISTINCT ON (gac.tc_client_id)
          gac.tc_client_id,
          gac.submission_id,
          gac.acquisition_date,
          gac.parent_first,
          gac.parent_last,
          gac.parent_email,
          gac.booking_type,
          gac.label_name,
          gac.utm_campaign
        FROM google_acquired_clients gac
        ORDER BY gac.tc_client_id, gac.acquisition_date ASC
      ),
      client_details AS (
        -- Use ONLY invoice revenue (exclude proforma invoices/credit requests to avoid double-counting)
        SELECT
          uc.tc_client_id,
          uc.submission_id,
          uc.acquisition_date,
          uc.parent_first || ' ' || uc.parent_last AS parent_name,
          uc.parent_email,
          uc.booking_type,
          uc.label_name,
          uc.utm_campaign,
          COALESCE(ir.invoice_revenue, 0) AS total_revenue,
          COALESCE(ir.invoice_count, 0) AS invoice_count,
          0 AS proforma_invoice_count,
          ir.first_invoice_date AS first_payment_date,
          ir.last_invoice_date AS last_payment_date
        FROM unique_clients uc
        LEFT JOIN invoice_revenue ir ON uc.tc_client_id = ir.tc_client_id
      )
      SELECT
        'summary' AS data_type,
        jsonb_build_object(
          'total_clients', COUNT(DISTINCT cd.tc_client_id),
          'total_revenue', COALESCE(SUM(cd.total_revenue), 0),
          'avg_revenue_per_client', COALESCE(AVG(cd.total_revenue), 0),
          'clients_with_revenue', COUNT(DISTINCT cd.tc_client_id) FILTER (WHERE cd.total_revenue > 0)
        ) AS data
      FROM client_details cd

      UNION ALL

      SELECT
        'weekly' AS data_type,
        jsonb_build_object(
          'period', period::text,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'cumulative_revenue', cumulative_revenue
        ) AS data
      FROM weekly_revenue

      UNION ALL

      SELECT
        'monthly' AS data_type,
        jsonb_build_object(
          'period', period::text,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'cumulative_revenue', cumulative_revenue
        ) AS data
      FROM monthly_revenue

      UNION ALL

      SELECT
        'cohort_monthly' AS data_type,
        jsonb_build_object(
          'cohort_month', cohort_month::date,
          'revenue_month', revenue_month::date,
          'active_clients', active_clients,
          'total_revenue', total_revenue,
          'monthly_revenue', monthly_revenue,
          'cumulative_revenue', monthly_revenue
        ) AS data
      FROM cohort_revenue_with_cumulative

      UNION ALL

      SELECT
        'clients' AS data_type,
        jsonb_build_object(
          'submission_id', submission_id,
          'tc_client_id', tc_client_id,
          'acquisition_date', acquisition_date,
          'parent_name', parent_name,
          'parent_email', parent_email,
          'booking_type', booking_type,
          'label_name', label_name,
          'utm_campaign', utm_campaign,
          'total_revenue', total_revenue,
          'invoice_count', invoice_count,
          'first_payment_date', first_payment_date,
          'last_payment_date', last_payment_date
        ) AS data
      FROM client_details
    `;

    const params = [startDateUTC, endDateUTC];
    const { rows } = await client.query(query, params);

    // Parse and sort results in JavaScript
    const summary = rows.find(r => r.data_type === 'summary')?.data || {};
    const weeklyData = rows
      .filter(r => r.data_type === 'weekly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.period || !b.period) return 0;
        return new Date(a.period) - new Date(b.period);
      });
    const monthlyData = rows
      .filter(r => r.data_type === 'monthly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.period || !b.period) return 0;
        return new Date(a.period) - new Date(b.period);
      });
    const cohortMonthlyData = rows
      .filter(r => r.data_type === 'cohort_monthly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.cohort_month || !b.cohort_month) return 0;
        const cohortCompare = new Date(a.cohort_month) - new Date(b.cohort_month);
        if (cohortCompare !== 0) return cohortCompare;
        if (!a.revenue_month || !b.revenue_month) return cohortCompare;
        return new Date(a.revenue_month) - new Date(b.revenue_month);
      });
    const clientDetails = rows
      .filter(r => r.data_type === 'clients')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.acquisition_date || !b.acquisition_date) return 0;
        return new Date(b.acquisition_date) - new Date(a.acquisition_date);
      });

    logger.info(`✅ Google realized revenue query completed: ${clientDetails.length} clients, ${summary.total_revenue || 0} total revenue`);

    res.json({
      summary,
      weekly: weeklyData,
      monthly: monthlyData,
      clients: clientDetails,
      cohortMonthly: cohortMonthlyData
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching Google realized revenue:');
    res.status(500).json({
      error: 'Failed to fetch Google realized revenue',
      details: err.message
    });
  } finally {
    client.release();
  }
}));

// Get Full Client Conversion Rate
// This tracks the % of registrations that become fully converted clients (trial + first lesson paid)
router.get('/analytics/full-client-conversion', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate, source } = req.query; // source: 'meta', 'google', 'klaviyo', or null for all

    // Always fetch past 12 months of data for trend analysis
    const { DateTime } = require('luxon');
    const now = DateTime.now().setZone('America/New_York');
    const twelveMonthsAgo = now.minus({ months: 12 }).startOf('month');

    // Use the past 12 months as the query range, regardless of selected date range
    const startDateUTC = twelveMonthsAgo.toUTC().toISO();
    const endDateUTC = now.endOf('day').toUTC().toISO();

    logger.info({ data: { source, startDateUTC, endDateUTC } }, '📊 Fetching full client conversion rate (past 12 months):');

    // Build source filter condition
    let sourceFilter = '';
    if (source === 'meta') {
      sourceFilter = `AND (
        (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' AND COALESCE(bs.utm->>'utm_campaign', '') != '')
        OR (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
      )`;
    } else if (source === 'google') {
      sourceFilter = `AND (
        LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'google'
        OR LOWER(COALESCE(bs.heard_about, '')) = 'google'
      )`;
    } else if (source === 'klaviyo') {
      sourceFilter = `AND (
        LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'klaviyo'
        OR LOWER(COALESCE(bs.utm->>'utm_medium', '')) = 'email'
        OR LOWER(COALESCE(bs.heard_about, '')) = 'klaviyo'
      )`;
    }

    // Use a function to safely build the query with the filter
    const buildQuery = (filter) => `
      WITH registrations AS (
        -- Get all registrations (form completions with paid/verified status)
        -- Convert to ET timezone first, then truncate to month start
        SELECT
          bs.id AS submission_id,
          bs.tc_client_id,
          (DATE_TRUNC('month', bs.created_at AT TIME ZONE 'America/New_York'))::date AS registration_month,
          bs.created_at AS registration_date
        FROM booking_submissions bs
        WHERE bs.created_at >= $1::timestamptz 
          AND bs.created_at <= $2::timestamptz
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
          ${filter}
      ),
      client_invoice_counts AS (
        -- Count paid invoices per client (trial + subsequent lessons)
        SELECT
          r.tc_client_id,
          r.submission_id,
          r.registration_month,
          r.registration_date,
          COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid') AS invoice_count
        FROM registrations r
        LEFT JOIN invoices i ON CAST(r.tc_client_id AS VARCHAR) = CAST(i.client_id AS VARCHAR)
          AND i.status = 'paid'
          AND i.date_sent >= r.registration_date
        GROUP BY r.tc_client_id, r.submission_id, r.registration_month, r.registration_date
      ),
      fully_converted_clients AS (
        -- Clients with at least 2 paid invoices (trial + first lesson)
        SELECT
          cic.tc_client_id,
          cic.submission_id,
          cic.registration_month,
          COALESCE(cic.invoice_count, 0) AS total_paid_invoices
        FROM client_invoice_counts cic
        WHERE COALESCE(cic.invoice_count, 0) >= 2
      ),
      monthly_stats AS (
        -- Calculate conversion rate by registration month
        SELECT
          r.registration_month AS registration_month,
          COUNT(DISTINCT r.submission_id) AS total_registrations,
          COUNT(DISTINCT fcc.submission_id) AS fully_converted_registrations,
          CASE 
            WHEN COUNT(DISTINCT r.submission_id) > 0 
            THEN ROUND((COUNT(DISTINCT fcc.submission_id)::numeric / COUNT(DISTINCT r.submission_id)::numeric) * 100, 2)
            ELSE 0
          END AS conversion_rate
        FROM registrations r
        LEFT JOIN fully_converted_clients fcc ON r.submission_id = fcc.submission_id
        GROUP BY r.registration_month
      ),
      overall_stats AS (
        -- Calculate overall conversion rate for all data
        SELECT
          COUNT(DISTINCT r.submission_id) AS total_registrations,
          COUNT(DISTINCT fcc.submission_id) AS fully_converted_registrations,
          CASE 
            WHEN COUNT(DISTINCT r.submission_id) > 0 
            THEN ROUND((COUNT(DISTINCT fcc.submission_id)::numeric / COUNT(DISTINCT r.submission_id)::numeric) * 100, 2)
            ELSE 0
          END AS conversion_rate
        FROM registrations r
        LEFT JOIN fully_converted_clients fcc ON r.submission_id = fcc.submission_id
      ),
      last_twelve_months_stats AS (
        -- Calculate aggregate conversion rate for past 12 months
        SELECT
          COUNT(DISTINCT r.submission_id) AS total_registrations,
          COUNT(DISTINCT fcc.submission_id) AS fully_converted_registrations,
          CASE 
            WHEN COUNT(DISTINCT r.submission_id) > 0 
            THEN ROUND((COUNT(DISTINCT fcc.submission_id)::numeric / COUNT(DISTINCT r.submission_id)::numeric) * 100, 2)
            ELSE 0
          END AS conversion_rate
        FROM registrations r
        LEFT JOIN fully_converted_clients fcc ON r.submission_id = fcc.submission_id
        WHERE r.registration_month >= (DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York' - INTERVAL '12 months'))::date
      )
      SELECT
        'summary' AS data_type,
        jsonb_build_object(
          'total_registrations', total_registrations,
          'fully_converted_registrations', fully_converted_registrations,
          'conversion_rate', conversion_rate
        ) AS data
      FROM overall_stats
      
      UNION ALL
      
      SELECT
        'last_twelve_months' AS data_type,
        jsonb_build_object(
          'total_registrations', total_registrations,
          'fully_converted_registrations', fully_converted_registrations,
          'conversion_rate', conversion_rate
        ) AS data
      FROM last_twelve_months_stats
      
      UNION ALL
      
      SELECT
        'monthly' AS data_type,
        jsonb_build_object(
          'registration_month', ms.registration_month,
          'total_registrations', ms.total_registrations,
          'fully_converted_registrations', ms.fully_converted_registrations,
          'conversion_rate', ms.conversion_rate
        ) AS data
      FROM monthly_stats ms
      WHERE ms.registration_month >= (DATE_TRUNC('month', NOW() AT TIME ZONE 'America/New_York' - INTERVAL '12 months'))::date
    `;

    const query = buildQuery(sourceFilter);
    const params = [startDateUTC, endDateUTC];
    
    logger.info({ data: { startDateUTC, endDateUTC, source } }, '🔍 Executing full client conversion query with params:');
    
    const { rows } = await client.query(query, params);

    const summary = rows.find(r => r.data_type === 'summary')?.data || {
      total_registrations: 0,
      fully_converted_registrations: 0,
      conversion_rate: 0
    };
    
    const lastTwelveMonths = rows.find(r => r.data_type === 'last_twelve_months')?.data || {
      total_registrations: 0,
      fully_converted_registrations: 0,
      conversion_rate: 0
    };
    
    const monthlyData = rows
      .filter(r => r.data_type === 'monthly')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.registration_month || !b.registration_month) return 0;
        return new Date(a.registration_month) - new Date(b.registration_month); // Sort ascending for chart
      });

    logger.info(`✅ Full client conversion query completed: ${summary.total_registrations || 0} registrations, ${summary.fully_converted_registrations || 0} fully converted, ${summary.conversion_rate || 0}% rate`);

    res.json({
      summary,
      lastTwelveMonths,
      monthly: monthlyData
    });
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching full client conversion rate:');
    logger.error({ data: err.stack }, '❌ Error stack:');
    logger.error({ data: err.code }, '❌ Error code:');
    logger.error({ data: err.detail }, '❌ Error detail:');
    logger.error({ data: err.hint }, '❌ Error hint:');
    res.status(500).json({ 
      error: 'Failed to fetch full client conversion rate', 
      details: err.message,
      code: err.code,
      hint: err.hint
    });
  } finally {
    client.release();
  }
}));

// Get false starts (dormant trial clients) - clients who paid for trial but never completed a lesson
router.get('/analytics/false-starts', asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    // Cache key includes date range
    const cacheKey = `submissions:analytics:false-starts:start:${startDate}:end:${endDate}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      // Convert dates to UTC timestamps (same as other analytics endpoints)
      const startDateUTC = etDateToUTC(startDate, false);
      const endDateUTC = etDateToUTC(endDate, true);

      logger.info({ data: { startDate, endDate, startDateUTC, endDateUTC } }, '📊 Fetching false starts (dormant trial clients):');

    // Query to find Meta-acquired clients who:
    // 1. Signed up for a trial through booking form (Meta Registrations Details)
    // 2. Have NO completed lessons (no appointments with status 'complete')
    // 3. Are marked as dormant status
    const query = `
      WITH meta_acquired_clients AS (
        -- Get Meta-acquired clients from booking submissions (Meta Registrations Details)
        SELECT DISTINCT
          bs.id AS submission_id,
          bs.tc_client_id,
          bs.created_at AS acquisition_date,
          bs.parent_first,
          bs.parent_last,
          bs.parent_email,
          bs.booking_type,
          bs.label_name,
          COALESCE(bs.utm->>'utm_campaign', '') AS utm_campaign
        FROM booking_submissions bs
        WHERE bs.created_at >= $1::timestamptz 
          AND bs.created_at <= $2::timestamptz
          AND (
            -- UTM-based attribution (existing)
            (LOWER(COALESCE(bs.utm->>'utm_source', '')) = 'facebook' 
             AND COALESCE(bs.utm->>'utm_campaign', '') != '')
            OR
            -- heard_about field attribution (new)
            (LOWER(COALESCE(bs.heard_about, '')) IN ('facebook', 'instagram'))
          )
          AND bs.payment_status IN ('paid', 'verified')
          AND bs.tc_client_id IS NOT NULL
      ),
      clients_with_completed_lessons AS (
        -- Get clients who have completed at least one lesson
        -- Check for both 'complete' status and cancelled but chargeable variants
        SELECT DISTINCT
          CAST(ar.paying_client_id AS VARCHAR) AS tc_client_id
        FROM appointment_recipients ar
        INNER JOIN appointments a ON a.appointment_id = ar.appointment_id
        WHERE a.status IN ('complete', 'cancelled-chargeable', 'cancelled - chargeable')
          AND ar.status <> 'missed'
          AND ar.paying_client_id IS NOT NULL
      ),
      false_starts AS (
        -- Clients who:
        -- 1. Signed up via Meta ads (Meta Registrations Details)
        -- 2. Have NO completed lessons
        -- 3. Are marked as dormant status
        SELECT
          mac.submission_id,
          mac.tc_client_id,
          mac.acquisition_date,
          mac.parent_first || ' ' || mac.parent_last AS parent_name,
          mac.parent_email,
          mac.booking_type,
          mac.label_name,
          mac.utm_campaign,
          c.status AS client_status
        FROM meta_acquired_clients mac
        LEFT JOIN clients_with_completed_lessons cwcl 
          ON CAST(mac.tc_client_id AS VARCHAR) = cwcl.tc_client_id
        LEFT JOIN clients c ON CAST(mac.tc_client_id AS VARCHAR) = CAST(c.client_id AS VARCHAR)
        WHERE cwcl.tc_client_id IS NULL  -- NO completed lessons
          AND LOWER(COALESCE(c.status, '')) = 'dormant'  -- Must be marked as dormant (case-insensitive)
      ),
      total_meta_registrations AS (
        -- Count total Meta-acquired clients for the date range (for percentage calculation)
        SELECT COUNT(DISTINCT mac.tc_client_id) AS total_count
        FROM meta_acquired_clients mac
      ),
      false_starts_count AS (
        -- Count false starts separately to handle empty case
        SELECT 
          COUNT(DISTINCT tc_client_id) AS total_count,
          COUNT(DISTINCT tc_client_id) FILTER (WHERE client_status = 'dormant') AS dormant_count
        FROM false_starts
      )
      SELECT
        'summary' AS data_type,
        jsonb_build_object(
          'total_false_starts', COALESCE(fsc.total_count, 0),
          'dormant_clients', COALESCE(fsc.dormant_count, 0),
          'total_meta_registrations', COALESCE(tmr.total_count, 0),
          'false_start_percentage', CASE 
            WHEN COALESCE(tmr.total_count, 0) > 0 
            THEN ROUND((COALESCE(fsc.total_count, 0)::numeric / tmr.total_count::numeric) * 100, 2)
            ELSE 0
          END
        ) AS data
      FROM total_meta_registrations tmr
      CROSS JOIN false_starts_count fsc
      
      UNION ALL
      
      SELECT
        'clients' AS data_type,
        jsonb_build_object(
          'submission_id', fs.submission_id,
          'tc_client_id', fs.tc_client_id,
          'acquisition_date', fs.acquisition_date,
          'parent_name', fs.parent_name,
          'parent_email', fs.parent_email,
          'booking_type', fs.booking_type,
          'label_name', fs.label_name,
          'utm_campaign', fs.utm_campaign,
          'client_status', fs.client_status
        ) AS data
      FROM false_starts fs
    `;

    const params = [startDateUTC, endDateUTC];
    const { rows } = await client.query(query, params);

    // Parse and sort results
    const summary = rows.find(r => r.data_type === 'summary')?.data || {};
    const clientDetails = rows
      .filter(r => r.data_type === 'clients')
      .map(r => r.data)
      .sort((a, b) => {
        if (!a.acquisition_date || !b.acquisition_date) return 0;
        return new Date(b.acquisition_date) - new Date(a.acquisition_date);
      });

      logger.info(`✅ False starts query completed: ${clientDetails.length} false starts out of ${summary.total_meta_registrations || 0} Meta registrations`);

      return {
        summary,
        clients: clientDetails
      };
    }, 300); // 5 minute TTL

    res.json(result);
  } catch (err) {
    logger.error({ err: err }, '❌ Error fetching false starts:');
    res.status(500).json({
      error: 'Failed to fetch false starts',
      details: err.message
    });
  } finally {
    client.release();
  }
}));

// Helper to get user database pool (reused connection)
let userPreferencesPool = null;
function getUserPreferencesPool() {
  if (!userPreferencesPool) {
    const { Pool } = require('pg');
    const isLocal = process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1');
    const needsSSL = process.env.NODE_ENV === "production" || ["production", "westside", "eastside", "staging"].includes(process.env.NODE_ENV);
    const dbUrl = isLocal && process.env.DATABASE_URL
      ? process.env.DATABASE_URL
      : (process.env.PRODUCTION_DATABASE_URL || process.env.DATABASE_URL);
    
    userPreferencesPool = new Pool({
      connectionString: dbUrl,
      ssl: needsSSL && !isLocal ? { rejectUnauthorized: false } : false
    });
  }
  return userPreferencesPool;
}

// Get user's marketing analytics preferences
router.get('/analytics/preferences', asyncHandler(async (req, res) => {
  try {
    // User should be set by auth middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const cacheKey = `submissions:analytics:preferences:${userId}`;

    const result = await cache.getOrSet(cacheKey, async () => {
      const userPool = getUserPreferencesPool();

      // Get user preferences from database
      const { rows } = await userPool.query(
        'SELECT preferences FROM users WHERE id = $1',
        [userId]
      );

      if (rows.length === 0) {
        return null;
      }

      // Parse preferences (handle both JSONB and string formats)
      let preferences = {};
      if (rows[0].preferences) {
        if (typeof rows[0].preferences === 'string') {
          preferences = JSON.parse(rows[0].preferences);
        } else {
          preferences = rows[0].preferences;
        }
      }

      return preferences.marketingAnalytics || {};
    }, 60); // 60 second TTL

    if (result === null) {
      return res.status(404).json({ error: 'User not found' });
    }

    const marketingAnalyticsPrefs = result;

    // Return marketing analytics preferences (default to all visible if not set)
    res.json({
      visibleMetrics: marketingAnalyticsPrefs.visibleMetrics || {
        // Overall Metrics
        'total_form_views': true,
        'total_leads': true,
        'total_registrations': true,
        'total_revenue': true,
        // Meta Ads Performance
        'meta_form_views': true,
        'meta_leads': true,
        'meta_registrations': true,
        'meta_revenue': true,
        // Meta Ad Performance KPIs
        'ad_impressions': true,
        'ad_clicks': true,
        'ad_spend': true,
        'roas': true,
        'realized_revenue': true,
        'false_starts': true,
        'actual_roas': true,
        'cpl': true,
        'cpr': true,
        // Enterprise Analytics Sections
        'enterprise_core_funnel': true,
        'enterprise_revenue': true,
        'enterprise_conversion': true,
        'enterprise_efficiency': true,
        'enterprise_strategic': true,
      }
    });
  } catch (err) {
    logger.error({ err: err }, 'Error fetching marketing analytics preferences:');
    res.status(500).json({
      error: 'Failed to fetch preferences',
      details: err.message
    });
  }
}));

// Save user's marketing analytics preferences
router.put('/analytics/preferences', asyncHandler(async (req, res) => {
  try {
    // User should be set by auth middleware
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = req.user.id;
    const { visibleMetrics } = req.body;

    if (!visibleMetrics || typeof visibleMetrics !== 'object') {
      return res.status(400).json({ error: 'visibleMetrics is required and must be an object' });
    }

    const userPool = getUserPreferencesPool();

    // Get current preferences
    const { rows } = await userPool.query(
      'SELECT preferences FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Parse current preferences (handle both JSONB and string formats)
    let currentPreferences = {};
    if (rows[0].preferences) {
      if (typeof rows[0].preferences === 'string') {
        currentPreferences = JSON.parse(rows[0].preferences);
      } else {
        currentPreferences = rows[0].preferences;
      }
    }
    
    // Update marketing analytics preferences
    const updatedPreferences = {
      ...currentPreferences,
      marketingAnalytics: {
        ...currentPreferences.marketingAnalytics,
        visibleMetrics
      }
    };

    // Save to database (PostgreSQL JSONB handles this automatically)
    await userPool.query(
      'UPDATE users SET preferences = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedPreferences), userId]
    );

    // Invalidate preferences cache for this user
    await cache.clearCacheByPrefix(`submissions:analytics:preferences:${userId}`);

    res.json({
      success: true,
      message: 'Preferences saved successfully'
    });
  } catch (err) {
    logger.error({ err: err }, 'Error saving marketing analytics preferences:');
    res.status(500).json({
      error: 'Failed to save preferences',
      details: err.message
    });
  }
}));

module.exports = router;
