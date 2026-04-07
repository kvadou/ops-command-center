const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
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
const router = express.Router();
router.get('/', asyncHandler(async (req, res) => {
  try {
    const {
      label,
      startDate,
      endDate
    } = req.query;
    if (!label || !startDate || !endDate) {
      return res.status(400).json({
        error: 'label, startDate and endDate are required'
      });
    }
    const startUTC = parseUTC(startDate).setZone('America/New_York', {
      keepLocalTime: true
    }).startOf('day').toUTC().toISO();
    const endUTC = parseUTC(endDate).setZone('America/New_York', {
      keepLocalTime: true
    }).endOf('day').toUTC().toISO();
    const {
      rows
    } = await pool.query(`
      WITH
      -- 0) only count students who actually attended or were chargeable
      student_counts AS (
        SELECT
          appointment_id,
          COUNT(*)::int AS student_count
        FROM appointment_recipients
        WHERE status <> 'missed'
        GROUP BY appointment_id
      ),

      -- 1) total revenue from all *included* students on each appointment
      student_revs AS (
        SELECT
          ar.appointment_id,
          ROUND(
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
            )
          , 2) AS total_expected_revenue
        FROM appointments a
        JOIN appointment_recipients ar
          ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        JOIN student_counts sc
          ON sc.appointment_id = a.appointment_id
        WHERE a.status IN ('complete','cancelled-chargeable')
          AND a.start BETWEEN $1 AND $2
        GROUP BY ar.appointment_id
      ),

      -- 2) total pay to all tutors on each appointment
      tutor_pays AS (
  SELECT
    ac.appointment_id,
    ROUND(
      SUM(
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
      )
    , 2) + COALESCE(
      (SELECT COUNT(*) * s.sr_premium * a.units
       FROM appointment_recipients ar2
       WHERE ar2.appointment_id = ac.appointment_id
         AND ar2.status <> 'missed'
      ),
      0
    ) AS total_expected_tutor_pay
  FROM appointments a
  JOIN appointment_contractors ac
    ON ac.appointment_id = a.appointment_id
  JOIN services s ON a.service_id = s.service_id
  JOIN student_counts sc
    ON sc.appointment_id = a.appointment_id
  WHERE a.status IN ('complete','cancelled-chargeable')
    AND a.start BETWEEN $1 AND $2
  GROUP BY ac.appointment_id, s.sr_premium, a.units
),


      -- 3) the â€œdetailâ€ rows (one per student Ã— tutor combination)
      base AS (
        SELECT
          a.appointment_id,
          a.start                           AS appointment_start,
          a.status                          AS appointment_status,
          ar.status                         AS recipient_status,
          a.units,
          s.dft_charge_type                     AS charge_type,
          s.service_id,
          s.name                            AS service_name,
          ar.recipient_id,
          ar.recipient_name                 AS recipient_name,
          rc.email                          AS recipient_email,
          ar.paying_client_id               AS client_id,
          ar.paying_client_name             AS client_name,
          pc.email                          AS client_email,
          ac.contractor_id,
          ac.contractor_name                AS contractor_name,
          ac.pay_rate,
-- inside your base CTE, after joining student_counts sc
-- Per-tutor pay
CASE
  WHEN a.charge_type = 'hourly'
    THEN ROUND(ac.pay_rate * a.units,                2)
  WHEN a.charge_type = 'one-off'
    THEN ROUND(ac.pay_rate,                          2)
  WHEN a.charge_type = 'one-off-split'
    THEN ROUND(ac.pay_rate,                          2)  -- â† just the rate, no units or split
  WHEN a.charge_type = 'hourly-split'
    THEN ROUND(ac.pay_rate * a.units,                2)
  ELSE
    ROUND(ac.pay_rate * a.units,                     2)
END AS student_tutor_pay,

-- Per-student revenue
CASE
  WHEN a.charge_type = 'hourly'
    THEN ROUND(ar.charge_rate * a.units,                2)
  WHEN a.charge_type = 'one-off'
    THEN ROUND(ar.charge_rate,                          2)
  WHEN a.charge_type = 'one-off-split'
    THEN ROUND(ar.charge_rate,                          2)  -- â† just the rate, no units or split
  WHEN a.charge_type = 'hourly-split'
    THEN ROUND(ar.charge_rate,                          2)
  ELSE
    ROUND(ar.charge_rate * a.units,                     2)
END AS student_revenue,




          COALESCE(label_match.label, 'Unassigned') AS service_label
        FROM appointments a
        JOIN services s      ON a.service_id = s.service_id
        JOIN appointment_recipients ar
          ON ar.appointment_id = a.appointment_id
          AND ar.status <> 'missed'
        JOIN student_counts sc
          ON sc.appointment_id = a.appointment_id
        LEFT JOIN clients rc ON rc.id = ar.recipient_id
        LEFT JOIN clients pc ON pc.id = ar.paying_client_id
        JOIN appointment_contractors ac
          ON ac.appointment_id = a.appointment_id
        LEFT JOIN LATERAL (
          SELECT TRIM(value) AS label
          FROM jsonb_array_elements_text(s.labels) AS lbl(value)
          WHERE
            value NOT ILIKE '%Non teaching%'
            AND value NOT ILIKE '%First Lesson Complete%'
            AND value NOT ILIKE '%Job Finished%'
            AND value NOT ILIKE '%Sync to Website%'
          
        ) label_match ON TRUE
        WHERE
          a.start BETWEEN $1 AND $2
          AND a.status IN ('complete','cancelled-chargeable')
          AND COALESCE(label_match.label, 'Unknown') ILIKE $3
      )

      SELECT
        b.*,
        sr.total_expected_revenue,
        tp.total_expected_tutor_pay
      FROM base b
      LEFT JOIN student_revs sr
        ON sr.appointment_id = b.appointment_id
      LEFT JOIN tutor_pays tp
        ON tp.appointment_id = b.appointment_id
      ORDER BY b.appointment_start;
      `, [startUTC, endUTC, label]);
    res.json({
      sessions: rows
    });
  } catch (err) {
    logger.error({ err }, 'Error in /api/revenue-sessions-detail');
    res.status(500).json({
      error: err.message
    });
  }
}));
module.exports = router;