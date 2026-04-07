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
    console.log('ðŸ”¹ Fetching appointments missing contractors...');
    const missingAppointmentsQuery = `
      SELECT a.appointment_id
      FROM appointments a
      LEFT JOIN appointment_contractors ac ON a.appointment_id = ac.appointment_id
      WHERE ac.contractor_id IS NULL
      AND a.status IN ('complete', 'cancelled-chargeable');
    `;
    const {
      rows: missingAppointments
    } = await pool.query(missingAppointmentsQuery);
    if (missingAppointments.length === 0) {
      console.log('âœ… No missing appointment_contractors found.');
      return res.json({
        message: 'No missing appointment_contractors found.'
      });
    }
    console.log(`ðŸŸ¡ Found ${missingAppointments.length} missing appointments.`);
    const missingContractors = [];
    for (const appointment of missingAppointments) {
      const appointmentId = appointment.appointment_id;
      console.log(`ðŸ”¹ Fetching details for appointment ${appointmentId}...`);
      try {
        const response = await tutorCruncherAPI.get(`/appointments/${appointmentId}/`);
        if (response.status !== 200) {
          console.error(`âŒ Failed to fetch appointment ${appointmentId}. Status: ${response.status}`);
          continue;
        }
        const data = response.data;
        console.log(`âœ… Data received for appointment ${appointmentId}:`, JSON.stringify(data, null, 2));
        if (data.cjas && data.cjas.length > 0) {
          for (const contractor of data.cjas) {
            console.log(`ðŸ”¹ Found contractor ${contractor.name} (ID: ${contractor.contractor}) for appointment ${appointmentId}`);
            missingContractors.push({
              appointment_id: appointmentId,
              contractor_id: contractor.contractor,
              contractor_name: contractor.name,
              pay_rate: contractor.pay_rate || 0
            });
          }
        } else {
          console.warn(`âš ï¸ No contractor found for appointment ${appointmentId}`);
        }
      } catch (error) {
        console.error(`âŒ Error fetching appointment ${appointmentId}:`, error.response ? error.response.data : error.message);
      }
    }
    if (missingContractors.length === 0) {
      console.log('âœ… No contractor data found for missing appointments.');
      return res.json({
        message: 'No contractor data found for missing appointments.'
      });
    }
    console.log(`ðŸŸ¡ Inserting ${missingContractors.length} missing contractors into the database...`);
    const insertQuery = `
      INSERT INTO appointment_contractors (appointment_id, contractor_id, contractor_name, pay_rate)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (appointment_id, contractor_id) DO NOTHING;
    `;
    for (const contractor of missingContractors) {
      console.log(`âœ… Inserting contractor ${contractor.contractor_name} (ID: ${contractor.contractor_id}) for appointment ${contractor.appointment_id}`);
      await pool.query(insertQuery, [contractor.appointment_id, contractor.contractor_id, contractor.contractor_name, contractor.pay_rate]);
    }
    console.log('âœ… Missing contractors successfully added.');
    res.json({
      message: 'Missing contractors successfully added.',
      added: missingContractors.length
    });
  } catch (error) {
    console.error('âŒ Error fixing missing contractors:', error);
    res.status(500).json({
      error: 'Failed to fix missing contractors.'
    });
  }
}));
module.exports = router;