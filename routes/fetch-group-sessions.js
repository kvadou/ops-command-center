const express = require('express');
const { asyncHandler } = require('../middleware/error-handler');
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
router.post('/', asyncHandler(async (req, res) => {
  try {
    const {
      tutorId,
      startDate,
      endDate
    } = req.body;
    console.log('Fetching group sessions for tutor:', tutorId);
    console.log('Start Date:', startDate);
    console.log('End Date:', endDate);
    const groupSessions = await pool.query(`
    WITH GroupedAppointments AS (
  SELECT
    ac.contractor_id                          AS tutor_id,
    ar.appointment_id,
    a.status                                 AS appointment_status,
    COUNT(ar.recipient_id)                    AS total_students,

    COUNT(
      CASE
        WHEN
          -- (1) From appointment_recipients: must be 'attended' OR 'missed-chargeable'
          ar.status IN ('attended','missed-chargeable')
          -- (2) charge_rate not in these amounts
          AND ar.charge_rate NOT IN (80.00, 112.66, 119.00)
          -- (3) service labels contain 'home' or 'online'
          AND (
            s.labels::text LIKE '%"Home %'
            OR s.labels @> '"Online"'::jsonb
          )
          -- (4) appointment status from appointments table must be 'complete'
          AND a.status = 'complete'
        THEN 1
      END
    ) AS eligible_students

  FROM appointment_recipients ar
    JOIN appointment_contractors ac
      ON ar.appointment_id = ac.appointment_id
    JOIN appointments a
      ON ar.appointment_id = a.appointment_id
    JOIN services s
      ON a.service_id = s.service_id

  WHERE
    ac.contractor_id = $1
    AND a.start BETWEEN $2 AND $3

  GROUP BY
    ac.contractor_id,
    ar.appointment_id,
    a.status
)

SELECT
  tutor_id,
  appointment_id,
  appointment_status,
  total_students,
  eligible_students,
 CASE
  WHEN eligible_students >= 2 THEN eligible_students
  ELSE 0
END AS counted_students

FROM GroupedAppointments;
      `, [tutorId, startDate, endDate]);
    res.json({
      sessions: groupSessions.rows
    });
  } catch (error) {
    console.error('âŒ Error fetching group sessions:', error);
    res.status(500).json({
      error: 'Failed to retrieve group session data'
    });
  }
}));
module.exports = router;