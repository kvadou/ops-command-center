const express = require('express');
const router = express.Router();
const { auth } = global;
const { logger } = require('../utils/logger');
const cache = require('../utils/cache');
const { columnExists } = require('../utils/schema-cache');

const { getLocationPool } = require('../utils/pool');
const { asyncHandler } = require('../middleware/error-handler');

// PUT /api/jobs/:id - Update a job/service
router.put('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);
    await cache.clearCacheByPrefix('jobs:available');

    const {
      name,
      brief_title,
      description,
      concise_description,
      dft_charge_type,
      dft_charge_rate,
      dft_contractor_rate,
      sr_premium,
      status,
      colour,
      require_student,
      require_tutor,
      default_tutor_permissions,
      cap,
      added_fee_per_lesson,
      max_students,
      job_inactivity_time,
      review_units,
      lesson_reports_required,
      auto_invoice,
      sales_codes,
      commission_tax,
      tax_setting,
      tutor_tax,
      location_id,
    } = req.body;

    // Build update query dynamically based on provided fields
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (dft_charge_type !== undefined) {
      updates.push(`dft_charge_type = $${paramCount++}`);
      values.push(dft_charge_type);
    }
    if (dft_charge_rate !== undefined) {
      updates.push(`dft_charge_rate = $${paramCount++}`);
      values.push(parseFloat(dft_charge_rate));
    }
    if (dft_contractor_rate !== undefined) {
      updates.push(`dft_contractor_rate = $${paramCount++}`);
      values.push(parseFloat(dft_contractor_rate));
    }
    if (sr_premium !== undefined) {
      updates.push(`sr_premium = $${paramCount++}`);
      values.push(sr_premium ? parseFloat(sr_premium) : null);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    // Note: calendar_colour column may not exist in local database schema
    // Skip calendar_colour update for local-only jobs (negative IDs)
    if (colour !== undefined && serviceId > 0) {
      // Only update calendar_colour for TutorCruncher jobs (positive IDs)
      // Check if column exists first to avoid errors (cached)
      const hasCalendarColour = await columnExists(pool, 'services', 'calendar_colour');
      if (hasCalendarColour) {
        updates.push(`calendar_colour = $${paramCount++}`);
        values.push(colour);
      }
    }

    // Update local database
    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
      values.push(serviceId);
      
      const updateQuery = `
        UPDATE services
        SET ${updates.join(', ')}
        WHERE service_id = $${paramCount}
      `;
      
      await pool.query(updateQuery, values);
    }

    // Update TutorCruncher via API
    try {
      const { tutorCruncherAPI } = global;
      if (tutorCruncherAPI) {
        const updateData = {};
        
        if (name !== undefined) updateData.name = name;
        if (dft_charge_type !== undefined) updateData.dft_charge_type = dft_charge_type;
        if (dft_charge_rate !== undefined) updateData.dft_charge_rate = parseFloat(dft_charge_rate);
        if (dft_contractor_rate !== undefined) updateData.dft_contractor_rate = parseFloat(dft_contractor_rate);
        if (status !== undefined) updateData.status = status;
        if (colour !== undefined) updateData.colour = colour;
        
        // Handle extra_attrs for additional fields
        const extraAttrs = {};
        if (brief_title !== undefined) extraAttrs.brief_title = brief_title;
        if (description !== undefined) extraAttrs.description = description;
        if (concise_description !== undefined) extraAttrs.concise_description = concise_description;
        if (require_student !== undefined) extraAttrs.require_student = require_student;
        if (require_tutor !== undefined) extraAttrs.require_tutor = require_tutor;
        if (default_tutor_permissions !== undefined) extraAttrs.default_tutor_permissions = default_tutor_permissions;
        if (cap !== undefined && cap !== '') extraAttrs.cap = parseFloat(cap);
        if (added_fee_per_lesson !== undefined && added_fee_per_lesson !== '') extraAttrs.added_fee_per_lesson = parseFloat(added_fee_per_lesson);
        if (max_students !== undefined && max_students !== '') extraAttrs.max_students = parseInt(max_students);
        if (job_inactivity_time !== undefined && job_inactivity_time !== '') extraAttrs.job_inactivity_time = parseInt(job_inactivity_time);
        if (review_units !== undefined && review_units !== '') extraAttrs.review_units = parseFloat(review_units);
        if (lesson_reports_required !== undefined) extraAttrs.lesson_reports_required = lesson_reports_required;
        if (auto_invoice !== undefined) extraAttrs.auto_invoice = auto_invoice;
        if (sales_codes !== undefined && sales_codes !== '') extraAttrs.sales_codes = sales_codes;
        if (commission_tax !== undefined && commission_tax !== '') extraAttrs.commission_tax = commission_tax;
        if (tax_setting !== undefined) extraAttrs.tax_setting = tax_setting;
        if (tutor_tax !== undefined && tutor_tax !== '') extraAttrs.tutor_tax = tutor_tax;
        if (location_id !== undefined && location_id !== null) extraAttrs.location_id = location_id;
        
        if (Object.keys(extraAttrs).length > 0) {
          updateData.extra_attrs = extraAttrs;
        }

        await tutorCruncherAPI.put(`services/${serviceId}/`, updateData);
      }
    } catch (tcError) {
      logger.error({ msg: 'Error updating service in TutorCruncher', serviceId, error: tcError.message });
      // Continue even if TutorCruncher update fails - local DB is updated
    }

    res.json({ 
      success: true, 
      message: 'Job updated successfully',
      service_id: serviceId
    });
  } catch (error) {
    logger.error({ msg: 'Error updating job', error: error.message });
    res.status(500).json({ error: 'Failed to update job', details: error.message });
  }
}));

// POST /api/jobs/:id/tutors - Add tutor to job
router.post('/:id/tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const { contractor, pay_rate, contractor_permissions, add_to_future_lessons } = req.body;

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    if (!contractor) {
      return res.status(400).json({ error: 'Contractor ID is required' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);
    await cache.clearCacheByPrefix('jobs:available');

    // Ensure contractor is an integer
    const contractorId = parseInt(contractor);
    if (isNaN(contractorId)) {
      return res.status(400).json({ error: 'Invalid contractor ID' });
    }

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, use the API
      const payload = {
        contractor: contractorId
      };
      
      if (pay_rate) {
        payload.pay_rate = pay_rate.toString();
      }
      
      if (contractor_permissions) {
        payload.contractor_permissions = contractor_permissions;
      } else {
        payload.contractor_permissions = 'view';
      }

      // Add contractor to service via TutorCruncher API
      try {
        const { tutorCruncherAPI } = global;
        if (!tutorCruncherAPI) {
          return res.status(500).json({ error: 'TutorCruncher API not available' });
        }
        
        await tutorCruncherAPI.post(`services/${serviceId}/contractor/add/`, payload);
      } catch (tcError) {
        logger.error({ msg: 'Error adding contractor to service in TutorCruncher', serviceId, contractorId, error: tcError.message, details: tcError.response?.data });
        return res.status(500).json({ 
          error: 'Failed to add tutor to job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    } else {
      // For local-only jobs, create a placeholder appointment if none exists and associate tutor
      // First check if there's any appointment for this service with a valid appointment_id
      const { rows: existingAppointments } = await pool.query(
        `SELECT appointment_id FROM appointments 
         WHERE service_id = $1 AND appointment_id IS NOT NULL 
         LIMIT 1`,
        [serviceId]
      );

      let appointmentId;
      if (existingAppointments.length === 0 || !existingAppointments[0].appointment_id) {
        // Create a placeholder appointment for local-only jobs
        const { rows: serviceData } = await pool.query(
          `SELECT name FROM services WHERE service_id = $1`,
          [serviceId]
        );
        const serviceName = serviceData[0]?.name || 'Placeholder';

        // Generate a local appointment_id (negative number to avoid conflicts)
        const maxLocalIdResult = await pool.query(`
          SELECT MIN(appointment_id::integer) as min_id 
          FROM appointments 
          WHERE appointment_id::text ~ '^-?[0-9]+$' AND appointment_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const newAppointmentId = (minLocalId - 1).toString();

        const { rows: newAppointment } = await pool.query(
          `INSERT INTO appointments (appointment_id, service_id, start, finish, topic, status, charge_type, units)
           VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 hour', $3, 'planned', 'hourly', 1)
           RETURNING appointment_id`,
          [newAppointmentId, serviceId.toString(), serviceName]
        );
        appointmentId = newAppointment[0]?.appointment_id;
        if (!appointmentId) {
          throw new Error('Failed to create placeholder appointment - appointment_id is null');
        }
        logger.info({ msg: 'Created placeholder appointment for local-only service', appointmentId, serviceId });
      } else {
        appointmentId = existingAppointments[0]?.appointment_id;
        if (!appointmentId) {
          throw new Error('Existing appointment has null appointment_id');
        }
        logger.info({ msg: 'Using existing appointment for service', appointmentId, serviceId });
      }

      // Verify contractor exists before associating
      const { rows: contractorCheck } = await pool.query(
        `SELECT contractor_id FROM contractors WHERE contractor_id = $1`,
        [contractorId]
      );

      if (contractorCheck.length === 0) {
        return res.status(404).json({ 
          error: 'Contractor not found', 
          details: `Contractor with ID ${contractorId} does not exist in the database` 
        });
      }

      // Associate contractor with the appointment
      try {
        // Ensure appointment_id is a string (it's VARCHAR in the database)
        const appointmentIdStr = appointmentId.toString();
        
        // Get contractor name for appointment_contractors table
        const { rows: contractorInfo } = await pool.query(
          `SELECT first_name, last_name FROM contractors WHERE contractor_id = $1`,
          [contractorId]
        );
        const contractorName = contractorInfo.length > 0 
          ? `${contractorInfo[0].first_name || ''} ${contractorInfo[0].last_name || ''}`.trim() || 'Unknown'
          : 'Unknown';
        
        const insertResult = await pool.query(
          `INSERT INTO appointment_contractors (appointment_id, contractor_id, contractor_name, pay_rate)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (appointment_id, contractor_id) 
           DO UPDATE SET contractor_name = $3, pay_rate = $4
           RETURNING appointment_id, contractor_id`,
          [appointmentIdStr, contractorId, contractorName, pay_rate ? parseFloat(pay_rate) : null]
        );
        
        // Check if the insert actually happened (might have been skipped due to conflict)
        if (insertResult.rows.length === 0) {
          // Check if the association already exists
          const { rows: existing } = await pool.query(
            `SELECT appointment_id, contractor_id 
             FROM appointment_contractors 
             WHERE appointment_id = $1 AND contractor_id = $2`,
            [appointmentIdStr, contractorId]
          );
          
          if (existing.length > 0) {
            // Already associated, that's fine
            logger.info({ msg: 'Tutor already associated with appointment', contractorId, appointmentId: appointmentIdStr });
          } else {
            // Something went wrong
            throw new Error('Failed to associate tutor with appointment');
          }
        }

        // Handle "add to future lessons" if requested
        if (add_to_future_lessons) {
          // Get all future planned lessons for this service
          const { rows: futureLessons } = await pool.query(
            `SELECT appointment_id FROM appointments
             WHERE service_id = $1
             AND status = 'planned'
             AND start > NOW()`,
            [serviceId]
          );

          // Add tutor to all future planned lessons in parallel
          await Promise.all(futureLessons.map(async (lesson) => {
            const lessonAppointmentId = lesson.appointment_id.toString();
            try {
              await pool.query(
                `INSERT INTO appointment_contractors (appointment_id, contractor_id, contractor_name, pay_rate)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (appointment_id, contractor_id)
                 DO UPDATE SET contractor_name = $3, pay_rate = $4`,
                [lessonAppointmentId, contractorId, contractorName, pay_rate ? parseFloat(pay_rate) : null]
              );
            } catch (err) {
              logger.error({ msg: 'Error adding tutor to future lesson', lessonAppointmentId, error: err.message });
              // Continue with other lessons even if one fails
            }
          }));
        }
      } catch (dbError) {
        logger.error({ msg: 'Database error associating tutor', error: dbError.message, code: dbError.code });
        // Check if it's a foreign key constraint error
        if (dbError.code === '23503') {
          return res.status(400).json({ 
            error: 'Invalid appointment or contractor', 
            details: 'The appointment or contractor does not exist in the database' 
          });
        }
        // Check for other constraint violations
        if (dbError.code === '23505') {
          // Unique constraint violation - already exists, that's okay
          logger.info({ msg: 'Tutor already associated with appointment', contractorId, appointmentId });
        } else {
          throw dbError; // Re-throw if it's a different error
        }
      }
    }

    res.json({ success: true, message: 'Tutor added to job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error adding tutor to job', error: error.message });
    res.status(500).json({ error: 'Failed to add tutor to job', details: error.message });
  }
}));

// DELETE /api/jobs/:id/tutors/:tutorId - Remove tutor from job
router.delete('/:id/tutors/:tutorId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const tutorId = parseInt(req.params.tutorId);

    if (isNaN(serviceId) || isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid job or tutor ID' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);
    await cache.clearCacheByPrefix('jobs:available');

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, use the API
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          await tutorCruncherAPI.post(`services/${serviceId}/contractor/remove/`, {
            contractor: tutorId
          });
        }
      } catch (tcError) {
        logger.error({ msg: 'Error removing contractor from service in TutorCruncher', serviceId, tutorId, error: tcError.message });
        return res.status(500).json({ 
          error: 'Failed to remove tutor from job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    } else {
      // For local-only jobs, remove from appointment_contractors
      await pool.query(
        `DELETE FROM appointment_contractors ac
         USING appointments a
         WHERE ac.appointment_id = a.appointment_id
           AND a.service_id::text = $1::text
           AND ac.contractor_id = $2`,
        [serviceId.toString(), tutorId]
      );
    }

    res.json({ success: true, message: 'Tutor removed from job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error removing tutor from job', error: error.message });
    res.status(500).json({ error: 'Failed to remove tutor from job', details: error.message });
  }
}));

// PATCH /api/jobs/:id/tutors/:tutorId/rate - Update tutor pay rate for a job
router.patch('/:id/tutors/:tutorId/rate', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const tutorId = parseInt(req.params.tutorId);
    const { pay_rate } = req.body;

    if (isNaN(serviceId) || isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid job or tutor ID' });
    }

    if (pay_rate === undefined || pay_rate === null) {
      return res.status(400).json({ error: 'Pay rate is required' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);

    const rateValue = parseFloat(pay_rate);
    if (isNaN(rateValue) || rateValue < 0) {
      return res.status(400).json({ error: 'Invalid pay rate value' });
    }

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, we'd need to update via API
      // For now, we'll update locally stored appointment_contractors
      // Note: This might need to sync with TutorCruncher API in the future
    }

    // Update pay_rate for all appointments associated with this service and tutor
    const updateResult = await pool.query(
      `UPDATE appointment_contractors ac
       SET pay_rate = $1
       FROM appointments a
       WHERE ac.appointment_id = a.appointment_id
         AND a.service_id::text = $2::text
         AND ac.contractor_id = $3`,
      [rateValue, serviceId.toString(), tutorId]
    );

    res.json({ 
      success: true, 
      message: 'Tutor pay rate updated successfully',
      pay_rate: rateValue
    });
  } catch (error) {
    logger.error({ msg: 'Error updating tutor pay rate', error: error.message });
    res.status(500).json({ error: 'Failed to update tutor pay rate', details: error.message });
  }
}));

// POST /api/jobs/:id/students - Add student to job
router.post('/:id/students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const { recipient, charge_rate } = req.body;

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);
    await cache.clearCacheByPrefix('jobs:available');

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, use the API
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          await tutorCruncherAPI.post(`services/${serviceId}/recipient/add/`, {
            recipient,
            charge_rate: charge_rate ? parseFloat(charge_rate) : undefined
          });
        }
      } catch (tcError) {
        logger.error({ msg: 'Error adding recipient to service in TutorCruncher', serviceId, error: tcError.message });
        return res.status(500).json({ 
          error: 'Failed to add student to job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    } else {
      // For local-only jobs, add to service_recipients table
      // First get recipient and client info
      const { rows: recipientData } = await pool.query(
        `SELECT recipient_id, first_name, last_name, paying_client_id, 
                (SELECT first_name || ' ' || last_name FROM clients WHERE client_id::text = paying_client_id::text) as paying_client_name
         FROM recipients 
         WHERE recipient_id::text = $1::text`,
        [recipient]
      );

      if (recipientData.length === 0) {
        return res.status(404).json({ error: 'Recipient not found' });
      }

      const recipientInfo = recipientData[0];
      const recipientName = `${recipientInfo.first_name || ''} ${recipientInfo.last_name || ''}`.trim();

      // Insert into service_recipients
      // Note: service_id is integer, recipient_id might be text/varchar
      // Check for existing record first to handle type mismatches
      const existingCheck = await pool.query(
        `SELECT id FROM service_recipients 
         WHERE service_id::text = $1::text AND recipient_id::text = $2::text
         LIMIT 1`,
        [serviceId.toString(), recipientInfo.recipient_id]
      );

      if (existingCheck.rows.length > 0) {
        // Update existing record
        await pool.query(
          `UPDATE service_recipients 
           SET recipient_name = $3, 
               paying_client_id = $4, 
               paying_client_name = $5,
               charge_rate = $6
           WHERE service_id::text = $1::text AND recipient_id::text = $2::text`,
          [
            serviceId.toString(),
            recipientInfo.recipient_id,
            recipientName,
            recipientInfo.paying_client_id,
            recipientInfo.paying_client_name,
            charge_rate ? parseFloat(charge_rate) : null
          ]
        );
      } else {
        // Insert new record
        // recipient_id is integer in service_recipients table
        await pool.query(
          `INSERT INTO service_recipients 
           (service_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate)
           VALUES ($1, $2::integer, $3, $4::integer, $5, $6)`,
          [
            serviceId,
            recipientInfo.recipient_id,
            recipientName,
            recipientInfo.paying_client_id,
            recipientInfo.paying_client_name,
            charge_rate ? parseFloat(charge_rate) : null
          ]
        );
      }
    }

    res.json({ success: true, message: 'Student added to job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error adding student to job', error: error.message });
    res.status(500).json({ error: 'Failed to add student to job', details: error.message });
  }
}));

// DELETE /api/jobs/:id/students/:studentId - Remove student from job
router.delete('/:id/students/:studentId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);

    if (isNaN(serviceId) || isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid job or student ID' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);
    await cache.clearCacheByPrefix('jobs:available');

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, use the API
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          await tutorCruncherAPI.post(`services/${serviceId}/recipient/remove/`, {
            recipient: studentId
          });
        }
      } catch (tcError) {
        logger.error({ msg: 'Error removing recipient from service in TutorCruncher', serviceId, studentId, error: tcError.message });
        return res.status(500).json({ 
          error: 'Failed to remove student from job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    } else {
      // For local-only jobs, remove from service_recipients
      await pool.query(
        `DELETE FROM service_recipients 
         WHERE service_id::text = $1::text AND recipient_id = $2`,
        [serviceId.toString(), studentId]
      );
    }

    res.json({ success: true, message: 'Student removed from job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error removing student from job', error: error.message });
    res.status(500).json({ error: 'Failed to remove student from job', details: error.message });
  }
}));

// PATCH /api/jobs/:id/students/:studentId/rate - Update student charge rate for a job
router.patch('/:id/students/:studentId/rate', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);
    const { charge_rate } = req.body;

    if (isNaN(serviceId) || isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid job or student ID' });
    }

    if (charge_rate === undefined || charge_rate === null) {
      return res.status(400).json({ error: 'Charge rate is required' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);

    const rateValue = parseFloat(charge_rate);
    if (isNaN(rateValue) || rateValue < 0) {
      return res.status(400).json({ error: 'Invalid charge rate value' });
    }

    // Check if this is a local-only job (negative service ID)
    const isLocalOnly = serviceId < 0;

    if (!isLocalOnly) {
      // For TutorCruncher jobs, we'd need to update via API
      // For now, we'll update locally stored service_recipients and appointment_recipients
      // Note: This might need to sync with TutorCruncher API in the future
    }

    // Update charge_rate in service_recipients
    await pool.query(
      `UPDATE service_recipients 
       SET charge_rate = $1
       WHERE service_id::text = $2::text AND recipient_id::text = $3::text`,
      [rateValue, serviceId.toString(), studentId.toString()]
    );

    // Also update charge_rate in appointment_recipients for all appointments in this service
    await pool.query(
      `UPDATE appointment_recipients ar
       SET charge_rate = $1
       FROM appointments a
       WHERE ar.appointment_id = a.appointment_id
         AND a.service_id::text = $2::text
         AND ar.recipient_id::text = $3::text`,
      [rateValue, serviceId.toString(), studentId.toString()]
    );

    res.json({ 
      success: true, 
      message: 'Student charge rate updated successfully',
      charge_rate: rateValue
    });
  } catch (error) {
    logger.error({ msg: 'Error updating student charge rate', error: error.message });
    res.status(500).json({ error: 'Failed to update student charge rate', details: error.message });
  }
}));

// GET /api/jobs/:id/available-tutors - Get available tutors to add
router.get('/:id/available-tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const cacheKey = `jobs:${serviceId}:available-tutors`;
    const result = await cache.getOrSet(cacheKey, async () => {
      // Get all contractors
      const query = `
        SELECT
          contractor_id,
          first_name,
          last_name,
          email,
          status
        FROM contractors
        WHERE status != 'deleted'
        ORDER BY last_name, first_name
      `;

      const { rows } = await pool.query(query);
      return rows;
    }, 45); // 45 second TTL - tutors list changes less frequently than students

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error fetching available tutors', serviceId, error: error.message });
    res.status(500).json({ error: 'Failed to fetch available tutors', details: error.message });
  }
}));

// GET /api/jobs/:id/available-students - Get available students to add
router.get('/:id/available-students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const cacheKey = `jobs:${serviceId}:available-students`;
    const result = await cache.getOrSet(cacheKey, async () => {
      // Get all recipients not already associated with this service
      const query = `
        SELECT DISTINCT
          r.recipient_id,
          COALESCE(
            NULLIF(TRIM(r.first_name || ' ' || r.last_name), ''),
            r.first_name,
            r.last_name,
            'Unknown Student'
          ) as recipient_name,
          r.paying_client_id,
          COALESCE(
            NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
            c.first_name,
            c.last_name,
            NULL
          ) as paying_client_name
        FROM recipients r
        LEFT JOIN clients c ON r.paying_client_id::text = c.client_id::text
        WHERE ((r.first_name IS NOT NULL AND r.first_name != '')
           OR (r.last_name IS NOT NULL AND r.last_name != ''))
        AND r.recipient_id::text NOT IN (
          -- Students already in service_recipients
          SELECT sr.recipient_id::text
          FROM service_recipients sr
          WHERE sr.service_id::text = $1::text
          UNION
          -- Students already in appointments for this service
          SELECT DISTINCT ar.recipient_id::text
          FROM appointment_recipients ar
          JOIN appointments a ON ar.appointment_id = a.appointment_id
          WHERE a.service_id::text = $1::text
        )
        ORDER BY recipient_name
      `;

      const { rows } = await pool.query(query, [serviceId]);
      return rows;
    }, 30); // 30 second TTL - student associations change frequently

    res.json(result);
  } catch (error) {
    logger.error({ msg: 'Error fetching available students', serviceId, error: error.message });
    res.status(500).json({ error: 'Failed to fetch available students', details: error.message });
  }
}));

// POST /api/jobs/:id/request-review - Request a review for a job
router.post('/:id/request-review', auth, asyncHandler(async (req, res) => {
  try {
    const serviceId = parseInt(req.params.id);

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    // TODO: Implement review request functionality
    // This would typically involve sending an email to the client via TutorCruncher API
    
    res.json({ success: true, message: 'Review request sent successfully' });
  } catch (error) {
    logger.error({ msg: 'Error requesting review', error: error.message });
    res.status(500).json({ error: 'Failed to request review', details: error.message });
  }
}));

// POST /api/jobs/:id/labels - Add a label to a job
router.post('/:id/labels', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const { labelId } = req.body;

    if (isNaN(serviceId)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    if (!labelId) {
      return res.status(400).json({ error: 'Label ID is required' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);

    const isLocalOnly = serviceId < 0;

    if (isLocalOnly) {
      // For local-only services, add label to local database
      // First, get the label name
      const labelResult = await pool.query(
        `SELECT name FROM labels WHERE id = $1`,
        [parseInt(labelId)]
      );

      if (labelResult.rows.length === 0) {
        return res.status(404).json({ error: 'Label not found' });
      }

      const labelName = labelResult.rows[0].name;

      // Insert into service_labels junction table
      await pool.query(
        `INSERT INTO service_labels (service_id, label_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (service_id, label_id) DO NOTHING`,
        [serviceId, parseInt(labelId)]
      );

      // Update services.labels column (stored as JSON array of label names)
      // Get current labels, add new one, and update
      const serviceResult = await pool.query(
        `SELECT labels FROM services WHERE service_id = $1`,
        [serviceId]
      );

      if (serviceResult.rows.length > 0) {
        const currentLabels = serviceResult.rows[0].labels;
        let labelNames = [];
        
        // Parse current labels (could be JSON string or already parsed)
        if (typeof currentLabels === 'string') {
          try {
            labelNames = JSON.parse(currentLabels);
          } catch (e) {
            labelNames = [];
          }
        } else if (Array.isArray(currentLabels)) {
          labelNames = currentLabels;
        }

        // Add new label if not already present
        if (!labelNames.includes(labelName)) {
          labelNames.push(labelName);
          
          await pool.query(
            `UPDATE services 
             SET labels = $1, updated_at = NOW()
             WHERE service_id = $2`,
            [JSON.stringify(labelNames), serviceId]
          );
        }
      }
    } else {
      // For TutorCruncher services, add label via TutorCruncher API
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          await tutorCruncherAPI.post(`services/${serviceId}/add_label/`, {
            label: parseInt(labelId)
          });
        }
      } catch (tcError) {
        logger.error({ msg: 'Error adding label to service in TutorCruncher', serviceId, labelId, error: tcError.message });
        return res.status(500).json({ 
          error: 'Failed to add label to job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    }

    res.json({ success: true, message: 'Label added to job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error adding label to job', error: error.message });
    res.status(500).json({ error: 'Failed to add label to job', details: error.message });
  }
}));

// DELETE /api/jobs/:id/labels/:labelId - Remove a label from a job
router.delete('/:id/labels/:labelId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const serviceId = parseInt(req.params.id);
    const labelId = parseInt(req.params.labelId);

    if (isNaN(serviceId) || isNaN(labelId)) {
      return res.status(400).json({ error: 'Invalid job or label ID' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${serviceId}`);

    const isLocalOnly = serviceId < 0;

    if (isLocalOnly) {
      // For local-only services, remove label from local database
      // First, get the label name
      const labelResult = await pool.query(
        `SELECT name FROM labels WHERE id = $1`,
        [labelId]
      );

      if (labelResult.rows.length > 0) {
        const labelName = labelResult.rows[0].name;

        // Remove from service_labels junction table
        await pool.query(
          `DELETE FROM service_labels 
           WHERE service_id = $1 AND label_id = $2`,
          [serviceId, labelId]
        );

        // Update services.labels column to remove the label name
        const serviceResult = await pool.query(
          `SELECT labels FROM services WHERE service_id = $1`,
          [serviceId]
        );

        if (serviceResult.rows.length > 0) {
          const currentLabels = serviceResult.rows[0].labels;
          let labelNames = [];
          
          // Parse current labels (could be JSON string or already parsed)
          if (typeof currentLabels === 'string') {
            try {
              labelNames = JSON.parse(currentLabels);
            } catch (e) {
              labelNames = [];
            }
          } else if (Array.isArray(currentLabels)) {
            labelNames = currentLabels;
          }

          // Remove label name if present
          labelNames = labelNames.filter(name => name !== labelName);
          
          await pool.query(
            `UPDATE services 
             SET labels = $1, updated_at = NOW()
             WHERE service_id = $2`,
            [JSON.stringify(labelNames), serviceId]
          );
        }
      }
    } else {
      // For TutorCruncher services, remove label via TutorCruncher API
      try {
        const { tutorCruncherAPI } = global;
        if (tutorCruncherAPI) {
          await tutorCruncherAPI.post(`services/${serviceId}/remove_label/`, {
            label: labelId
          });
        }
      } catch (tcError) {
        logger.error({ msg: 'Error removing label from service in TutorCruncher', serviceId, labelId, error: tcError.message });
        return res.status(500).json({ 
          error: 'Failed to remove label from job', 
          details: tcError.response?.data || tcError.message 
        });
      }
    }

    res.json({ success: true, message: 'Label removed from job successfully' });
  } catch (error) {
    logger.error({ msg: 'Error removing label from job', error: error.message });
    res.status(500).json({ error: 'Failed to remove label from job', details: error.message });
  }
}));

// POST /api/jobs/associate - Associate a job/service with a client and students
router.post('/associate', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { service_id, client_id, student_ids } = req.body;

    if (!service_id) {
      return res.status(400).json({ error: 'Service ID is required' });
    }

    // Clear relevant caches
    await cache.clearCacheByPrefix(`jobs:${service_id}`);
    await cache.clearCacheByPrefix('jobs:available');

    logger.info({
      msg: 'Associating job with client and students',
      serviceId: service_id,
      clientId: client_id,
      studentIds: student_ids
    });

    // If client_id is provided but no student_ids, create a direct association
    // This allows jobs to be linked to clients even without students yet
    if (client_id && (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0)) {
      try {
        // Check if there's already a service_recipients entry for this service
        const existingServiceCheck = await pool.query(
          `SELECT id FROM service_recipients 
           WHERE service_id::text = $1 AND paying_client_id::text = $2
           LIMIT 1`,
          [service_id.toString(), client_id.toString()]
        );

        if (existingServiceCheck.rows.length === 0) {
          // Fetch client name
          let payingClientName = null;
          try {
            const clientResult = await pool.query(
              `SELECT client_id, first_name, last_name 
               FROM clients 
               WHERE client_id::text = $1 
               LIMIT 1`,
              [client_id.toString()]
            );
            
            if (clientResult.rows.length > 0) {
              payingClientName = `${clientResult.rows[0].first_name} ${clientResult.rows[0].last_name}`.trim();
            }
          } catch (clientError) {
            logger.warn({ msg: 'Could not fetch client details', clientId: client_id, error: clientError.message });
          }

          // Insert a placeholder association to link the service to the client
          // Use a negative recipient_id to indicate this is a client-only association
          await pool.query(
            `INSERT INTO service_recipients 
             (service_id, recipient_id, recipient_name, paying_client_id, paying_client_name)
             VALUES ($1::integer, -999999, NULL, $2::integer, $3)
             ON CONFLICT DO NOTHING`,
            [
              service_id.toString(),
              client_id.toString(),
              payingClientName
            ]
          );

          logger.info({
            msg: 'Associated service with client (no students)',
            serviceId: service_id,
            clientId: client_id
          });
        }
      } catch (clientAssocError) {
        logger.error({
          msg: 'Error associating service with client',
          serviceId: service_id,
          clientId: client_id,
          error: clientAssocError.message
        });
        // Continue even if this fails
      }
    }

    // Associate students with the service via service_recipients table
    if (student_ids && Array.isArray(student_ids) && student_ids.length > 0) {
      // Process all students in parallel
      await Promise.all(student_ids.map(async (studentId) => {
        try {
          // Check if association already exists
          const existingCheck = await pool.query(
            `SELECT id FROM service_recipients
             WHERE service_id = $1 AND recipient_id = $2`,
            [service_id.toString(), studentId.toString()]
          );

          if (existingCheck.rows.length === 0) {
            // Get student and client details for the association
            let recipientName = null;
            let payingClientId = client_id || null;
            let payingClientName = null;

            // Fetch student and client details in parallel
            const [studentResult, clientResult] = await Promise.all([
              pool.query(
                `SELECT recipient_id, recipient_name, paying_client_id
                 FROM appointment_recipients
                 WHERE recipient_id = $1
                 LIMIT 1`,
                [studentId.toString()]
              ).catch(err => {
                logger.warn({ msg: 'Could not fetch student details', studentId, error: err.message });
                return { rows: [] };
              }),
              payingClientId
                ? pool.query(
                    `SELECT client_id, first_name, last_name
                     FROM clients
                     WHERE client_id::text = $1
                     LIMIT 1`,
                    [payingClientId.toString()]
                  ).catch(err => {
                    logger.warn({ msg: 'Could not fetch client details', clientId: payingClientId, error: err.message });
                    return { rows: [] };
                  })
                : Promise.resolve({ rows: [] })
            ]);

            if (studentResult.rows.length > 0) {
              recipientName = studentResult.rows[0].recipient_name;
              // Use the student's paying_client_id if client_id not provided
              if (!payingClientId && studentResult.rows[0].paying_client_id) {
                payingClientId = studentResult.rows[0].paying_client_id;

                // Fetch client name for the student's paying_client_id
                try {
                  const extraClientResult = await pool.query(
                    `SELECT client_id, first_name, last_name
                     FROM clients
                     WHERE client_id::text = $1
                     LIMIT 1`,
                    [payingClientId.toString()]
                  );
                  if (extraClientResult.rows.length > 0) {
                    payingClientName = `${extraClientResult.rows[0].first_name} ${extraClientResult.rows[0].last_name}`.trim();
                  }
                } catch (clientError) {
                  logger.warn({ msg: 'Could not fetch client details', clientId: payingClientId, error: clientError.message });
                }
              }
            }

            if (clientResult.rows.length > 0) {
              payingClientName = `${clientResult.rows[0].first_name} ${clientResult.rows[0].last_name}`.trim();
            }

            // Insert association into service_recipients table
            // First check if record already exists
            const existing = await pool.query(
              `SELECT id FROM service_recipients
               WHERE service_id::text = $1 AND recipient_id::text = $2`,
              [service_id.toString(), studentId.toString()]
            );

            if (existing.rows.length === 0) {
              // Insert new association
              await pool.query(
                `INSERT INTO service_recipients
                 (service_id, recipient_id, recipient_name, paying_client_id, paying_client_name)
                 VALUES ($1::integer, $2::integer, $3, $4::integer, $5)`,
                [
                  service_id.toString(),
                  studentId.toString(),
                  recipientName,
                  payingClientId ? payingClientId.toString() : null,
                  payingClientName
                ]
              );
            } else {
              // Update existing association with latest client info
              await pool.query(
                `UPDATE service_recipients
                 SET recipient_name = $3, paying_client_id = $4::integer, paying_client_name = $5
                 WHERE service_id::text = $1 AND recipient_id::text = $2`,
                [
                  service_id.toString(),
                  studentId.toString(),
                  recipientName,
                  payingClientId ? payingClientId.toString() : null,
                  payingClientName
                ]
              );
            }

            logger.info({
              msg: 'Associated student with service',
              serviceId: service_id,
              studentId,
              recipientName
            });
          }
        } catch (studentAssocError) {
          logger.error({
            msg: 'Error associating student with service',
            serviceId: service_id,
            studentId,
            error: studentAssocError.message
          });
          // Continue with other students even if one fails
        }
      }));
    }

    res.json({ 
      success: true, 
      message: 'Job associated with client and students successfully',
      service_id,
      client_id: client_id || null,
      student_ids: student_ids || []
    });
  } catch (error) {
    logger.error({
      msg: 'Error associating job with client and students',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to associate job with client and students', 
      details: error.message 
    });
  }
}));

module.exports = router;
