const express = require('express');
const router = express.Router();
const {
  pool,
  tutorCruncherAPI,
  auth,
} = global;

const { getLocationPool } = require('../utils/pool');
const { logger } = require('../utils/logger');
const { asyncHandler } = require('../middleware/error-handler');

// POST /api/lessons/create - Create a new lesson/appointment
router.post('/create', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const { service_id, start, finish, topic, location, localOnly, students, tutors } = req.body;

    if (!service_id || !start || !finish) {
      return res.status(400).json({ error: 'Service ID, start time, and finish time are required' });
    }

    // LOCAL-ONLY MODE: Create lesson directly in local database without TutorCruncher
    // Also treat negative service IDs as local-only (they don't exist in TutorCruncher)
    const isLocalOnly = localOnly === true || localOnly === 'true' || parseInt(service_id) < 0;
    
    if (isLocalOnly) {
      try {
        // Generate a local appointment_id (negative numbers to avoid conflicts with TutorCruncher IDs)
        const maxLocalIdResult = await pool.query(`
          SELECT MIN(appointment_id::integer) as min_id 
          FROM appointments 
          WHERE appointment_id::text ~ '^-?[0-9]+$' AND appointment_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const appointmentId = minLocalId - 1;

        // Insert directly into local database
        const insertQuery = `
          INSERT INTO appointments (
            appointment_id, service_id, start, finish, topic, location,
            status, units, charge_type, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
          )
          RETURNING *
        `;

        // Calculate units (hours) from start and finish
        const startDate = new Date(start);
        const finishDate = new Date(finish);
        const hoursDiff = (finishDate - startDate) / (1000 * 60 * 60);
        const units = Math.max(0, hoursDiff);

        const insertParams = [
          appointmentId.toString(), // Convert to string since appointment_id is VARCHAR
          service_id.toString(),
          start,
          finish,
          topic || null,
          location || null,
          'planned', // Default status
          units || 1,
          'hourly' // Default charge type
        ];

        const result = await pool.query(insertQuery, insertParams);
        const createdAppointment = result.rows[0];

        // Associate students with the lesson
        if (students && Array.isArray(students) && students.length > 0) {
          for (const student of students) {
            try {
              // Get paying client ID and recipient name from service_recipients
              const clientQuery = await pool.query(`
                SELECT sr.paying_client_id, sr.recipient_name
                FROM service_recipients sr
                WHERE sr.service_id::text = $1 AND sr.recipient_id::text = $2
                LIMIT 1
              `, [service_id.toString(), student.recipient_id.toString()]);
              
              let payingClientId = clientQuery.rows[0]?.paying_client_id || null;
              let recipientName = clientQuery.rows[0]?.recipient_name || null;
              let payingClientName = null;

              // If not found in service_recipients, try recipients table
              if (!recipientName) {
                const recipientQuery = await pool.query(`
                  SELECT 
                    recipient_id,
                    COALESCE(first_name || ' ' || last_name, first_name, last_name) as recipient_name,
                    paying_client_id
                  FROM recipients
                  WHERE recipient_id::text = $1
                  LIMIT 1
                `, [student.recipient_id.toString()]);
                
                if (recipientQuery.rows.length > 0) {
                  recipientName = recipientQuery.rows[0].recipient_name;
                  if (!payingClientId) {
                    payingClientId = recipientQuery.rows[0].paying_client_id;
                  }
                }
              }

              // Fallback to "Unknown Student" if still no name
              if (!recipientName) {
                recipientName = 'Unknown Student';
              }

              // Get paying client name if we have a paying_client_id
              if (payingClientId) {
                const clientNameQuery = await pool.query(`
                  SELECT COALESCE(first_name || ' ' || last_name, first_name, last_name) as client_name
                  FROM clients
                  WHERE client_id::text = $1
                  LIMIT 1
                `, [payingClientId.toString()]);
                
                if (clientNameQuery.rows.length > 0) {
                  payingClientName = clientNameQuery.rows[0].client_name;
                }
              }

              await pool.query(`
                INSERT INTO appointment_recipients (
                  appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status
                ) VALUES ($1, $2, $3, $4, $5, $6, 'attending')
                ON CONFLICT (appointment_id, recipient_id) DO UPDATE SET
                  charge_rate = COALESCE(EXCLUDED.charge_rate, appointment_recipients.charge_rate),
                  recipient_name = COALESCE(EXCLUDED.recipient_name, appointment_recipients.recipient_name),
                  paying_client_name = COALESCE(EXCLUDED.paying_client_name, appointment_recipients.paying_client_name)
              `, [
                appointmentId.toString(),
                student.recipient_id.toString(),
                recipientName,
                payingClientId,
                payingClientName,
                student.charge_rate || null
              ]);
            } catch (studentError) {
              logger.error({ err: studentError }, `Error adding student ${student.recipient_id} to lesson:`);
            }
          }
        }

        // Associate tutors with the lesson
        if (tutors && Array.isArray(tutors) && tutors.length > 0) {
          for (const tutor of tutors) {
            try {
              // Get contractor name from contractors table
              const contractorQuery = await pool.query(`
                SELECT first_name, last_name 
                FROM contractors 
                WHERE contractor_id::text = $1
                LIMIT 1
              `, [tutor.contractor_id.toString()]);
              
              const contractor = contractorQuery.rows[0];
              const contractorName = contractor 
                ? `${contractor.first_name || ''} ${contractor.last_name || ''}`.trim()
                : null;

              await pool.query(`
                INSERT INTO appointment_contractors (
                  appointment_id, contractor_id, contractor_name, pay_rate, status
                ) VALUES ($1, $2, $3, $4, 'approved')
                ON CONFLICT (appointment_id, contractor_id) DO UPDATE SET
                  pay_rate = COALESCE(EXCLUDED.pay_rate, appointment_contractors.pay_rate),
                  contractor_name = COALESCE(EXCLUDED.contractor_name, appointment_contractors.contractor_name)
              `, [
                appointmentId.toString(),
                tutor.contractor_id.toString(),
                contractorName,
                tutor.pay_rate || null
              ]);
            } catch (tutorError) {
              logger.error({ err: tutorError }, `Error adding tutor ${tutor.contractor_id} to lesson:`);
            }
          }
        }

        logger.info({
          msg: 'Created lesson locally (localOnly mode)',
          appointmentId,
          serviceId: service_id,
          localOnly: true,
          studentsCount: students?.length || 0,
          tutorsCount: tutors?.length || 0
        });

        return res.status(201).json({
          success: true,
          lesson: {
            appointment_id: createdAppointment.appointment_id,
            service_id: createdAppointment.service_id,
            start: createdAppointment.start,
            finish: createdAppointment.finish,
            status: createdAppointment.status
          },
          message: 'Lesson created successfully (local only - not synced to TutorCruncher)',
          localOnly: true
        });
      } catch (localError) {
        // Log error safely
        logger.error({
          msg: 'Error creating lesson locally',
          error: localError.message,
          stack: localError.stack,
          serviceId: service_id
        });
        return res.status(500).json({
          error: 'Failed to create lesson locally',
          details: localError.message
        });
      }
    }

    // Create lesson in TutorCruncher
    const payload = {
      service: parseInt(service_id),
      start: start,
      finish: finish,
      status: 'planned'
    };

    if (topic) payload.topic = topic;
    if (location) payload.location = location;

    const response = await tutorCruncherAPI.post('/appointments/', payload);
    const appointment = response.data;

    // The webhook will sync it to local database, but we can also insert it directly for immediate availability
    try {
      await pool.query(
        `INSERT INTO appointments (
          appointment_id, service_id, start, finish, topic, location,
          status, units, charge_type, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (appointment_id) DO UPDATE SET
          start = EXCLUDED.start,
          finish = EXCLUDED.finish,
          topic = EXCLUDED.topic,
          location = EXCLUDED.location,
          status = EXCLUDED.status,
          updated_at = NOW()`,
        [
          appointment.id.toString(),
          service_id.toString(),
          appointment.start,
          appointment.finish,
          appointment.topic || null,
          appointment.location || null,
          appointment.status || 'planned',
          appointment.units || 1,
          appointment.charge_type || 'hourly'
        ]
      );
    } catch (dbError) {
      logger.warn({ error: dbError.message }, 'Failed to insert appointment into local DB, webhook will sync it');
    }

    // Associate students with the lesson via TutorCruncher API
    if (students && Array.isArray(students) && students.length > 0) {
      for (const student of students) {
        try {
          const recipientPayload = {
            recipient: parseInt(student.recipient_id)
          };
          if (student.charge_rate) {
            recipientPayload.charge_rate = student.charge_rate.toString();
          }
          await tutorCruncherAPI.post(`appointments/${appointment.id}/recipient/add/`, recipientPayload);
        } catch (studentError) {
          logger.error({ error: studentError.response?.data || studentError.message }, `Error adding student ${student.recipient_id} to lesson:`);
        }
      }
    }

    // Associate tutors with the lesson via TutorCruncher API
    if (tutors && Array.isArray(tutors) && tutors.length > 0) {
      for (const tutor of tutors) {
        try {
          const contractorPayload = {
            contractor: parseInt(tutor.contractor_id)
          };
          if (tutor.pay_rate) {
            contractorPayload.pay_rate = tutor.pay_rate.toString();
          }
          await tutorCruncherAPI.post(`appointments/${appointment.id}/contractor/add/`, contractorPayload);
        } catch (tutorError) {
          logger.error({ error: tutorError.response?.data || tutorError.message }, `Error adding tutor ${tutor.contractor_id} to lesson:`);
        }
      }
    }

    res.status(201).json({
      success: true,
      lesson: {
        appointment_id: appointment.id,
        service_id: service_id,
        start: appointment.start,
        finish: appointment.finish,
        status: appointment.status
      },
      message: 'Lesson created successfully in TutorCruncher'
    });
  } catch (error) {
    // Log error safely
    logger.error({
      msg: 'Error creating lesson',
      error: error.message,
      stack: error.stack,
      serviceId: req.body?.service_id
    });

    if (error.response) {
      return res.status(error.response.status || 500).json({
        error: 'Failed to create lesson in TutorCruncher',
        details: error.response.data || error.message
      });
    }

    res.status(500).json({
      error: 'Failed to create lesson',
      details: error.message
    });
  }
}));

// GET /api/lessons/conflicts - Check for scheduling conflicts
router.get('/conflicts', auth, asyncHandler(async (req, res) => {
  const pool = getLocationPool(req);
  const { start, end, tutor_ids, student_ids } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end are required' });
  }

  const conflicts = [];

  // Check tutor conflicts
  if (tutor_ids) {
    const tutorIdList = Array.isArray(tutor_ids) ? tutor_ids : tutor_ids.split(',');
    const tutorConflicts = await pool.query(`
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.service_id,
        ac.contractor_id,
        ac.contractor_name
      FROM appointments a
      JOIN appointment_contractors ac ON a.appointment_id::text = ac.appointment_id::text
      WHERE ac.contractor_id::text = ANY($1)
        AND a.start < $3
        AND a.finish > $2
        AND a.status NOT IN ('cancelled', 'cancelled-chargeable')
        AND COALESCE(a.is_deleted, false) = false
    `, [tutorIdList.map(String), start, end]);

    for (const row of tutorConflicts.rows) {
      conflicts.push({
        type: 'tutor',
        entity_id: row.contractor_id,
        entity_name: row.contractor_name,
        appointment_id: row.appointment_id,
        start: row.start,
        finish: row.finish,
        topic: row.topic,
        service_id: row.service_id,
      });
    }
  }

  // Check student conflicts
  if (student_ids) {
    const studentIdList = Array.isArray(student_ids) ? student_ids : student_ids.split(',');
    const studentConflicts = await pool.query(`
      SELECT
        a.appointment_id,
        a.start,
        a.finish,
        a.topic,
        a.service_id,
        ar.recipient_id,
        ar.recipient_name
      FROM appointments a
      JOIN appointment_recipients ar ON a.appointment_id::text = ar.appointment_id::text
      WHERE ar.recipient_id::text = ANY($1)
        AND a.start < $3
        AND a.finish > $2
        AND a.status NOT IN ('cancelled', 'cancelled-chargeable')
        AND COALESCE(a.is_deleted, false) = false
    `, [studentIdList.map(String), start, end]);

    for (const row of studentConflicts.rows) {
      conflicts.push({
        type: 'student',
        entity_id: row.recipient_id,
        entity_name: row.recipient_name,
        appointment_id: row.appointment_id,
        start: row.start,
        finish: row.finish,
        topic: row.topic,
        service_id: row.service_id,
      });
    }
  }

  res.json({ conflicts });
}));

// PUT /api/lessons/:id/status - Update lesson status (must come before /:id route)
router.put('/:id/status', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Valid statuses: complete, cancelled, cancelled-chargeable
    const validStatuses = ['complete', 'cancelled', 'cancelled-chargeable'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Handle local-only lesson status update
      try {
        // Update status in local database
        await pool.query(
          `UPDATE appointments SET status = $1, updated_at = NOW() WHERE appointment_id = $2`,
          [status, appointmentId.toString()]
        );

        // If marking as complete, generate invoices and payment orders
        if (status === 'complete' || status === 'completed') {
          try {
            const InvoiceGenerationService = require('../services/invoice-generation-service');
            const PaymentOrderGenerationService = require('../services/payment-order-generation-service');
            
            const invoiceService = new InvoiceGenerationService(pool);
            const paymentOrderService = new PaymentOrderGenerationService(pool);

            // Generate invoices for this completed lesson (forceGenerate=true for local-only lessons)
            const invoiceResult = await invoiceService.generateInvoiceForCompletedLesson(appointmentId.toString(), true);
            logger.info({
              msg: 'Generated invoices for local-only completed lesson',
              appointmentId,
              invoiceIds: invoiceResult.invoiceIds,
              created: invoiceResult.created,
              updated: invoiceResult.updated
            });

            // Generate payment orders for this completed lesson (forceGenerate=true for local-only lessons)
            const poResult = await paymentOrderService.generatePaymentOrderForCompletedLesson(appointmentId.toString(), true);
            logger.info({
              msg: 'Generated payment orders for local-only completed lesson',
              appointmentId,
              paymentOrderIds: poResult.paymentOrderIds,
              created: poResult.created,
              updated: poResult.updated,
              errors: poResult.errors
            });
            
            // Log errors if any occurred
            if (poResult.errors && poResult.errors.length > 0) {
              logger.error({ appointmentId, errors: poResult.errors }, '❌ Payment order generation errors');
            }
          } catch (genError) {
            // Log error but don't fail the status update
            logger.error({ err: genError, appointmentId }, 'Error generating invoices/payment orders for local lesson');
          }
        }

        return res.json({ 
          success: true, 
          status,
          localOnly: true,
          message: 'Lesson status updated (local only)'
        });
      } catch (localError) {
        logger.error({ err: localError }, 'Error updating local lesson status:');
        return res.status(500).json({ 
          error: 'Failed to update local lesson status',
          details: localError.message
        });
      }
    }

    // Handle TutorCruncher lesson status update
    // First, get the current appointment from TutorCruncher
    let appointment;
    try {
      const response = await tutorCruncherAPI.get(`appointments/${appointmentId}/`);
      appointment = response.data;
    } catch (error) {
      logger.error({ err: error }, 'Error fetching appointment from TutorCruncher:');
      return res.status(404).json({ error: 'Appointment not found in TutorCruncher' });
    }

    // Update status in TutorCruncher
    const updatePayload = {
      start: appointment.start,
      finish: appointment.finish,
      topic: appointment.topic,
      location: appointment.location,
      extra_attrs: appointment.extra_attrs || {},
      status: status,
      service: appointment.service?.id
    };

    try {
      await tutorCruncherAPI.put(`appointments/${appointmentId}/`, updatePayload);
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error updating appointment in TutorCruncher:');
      return res.status(500).json({ 
        error: 'Failed to update appointment in TutorCruncher',
        details: error.response?.data || error.message
      });
    }

    // Update status in local database
    await pool.query(
      `UPDATE appointments SET status = $1, updated_at = NOW() WHERE appointment_id = $2`,
      [status, appointmentId.toString()]
    );

    res.json({ success: true, status });
  } catch (error) {
    logger.error({ err: error }, 'Error updating lesson status:');
    res.status(500).json({ error: 'Failed to update lesson status' });
  }
}));

// PUT /api/lessons/:id - Update lesson details (must come after /:id/status route)
router.put('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const { start, finish, topic, location, location_id, extra_details, apply_to_repeated } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Handle local-only lesson update
      try {
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (start !== undefined) {
          updateFields.push(`start = $${paramIndex++}`);
          updateValues.push(start);
        }
        if (finish !== undefined) {
          updateFields.push(`finish = $${paramIndex++}`);
          updateValues.push(finish);
        }
        if (topic !== undefined) {
          updateFields.push(`topic = $${paramIndex++}`);
          updateValues.push(topic);
        }
        if (location !== undefined) {
          // Handle location as string or object
          const locationValue = typeof location === 'string' ? location : JSON.stringify(location);
          updateFields.push(`location = $${paramIndex++}`);
          updateValues.push(locationValue);
        }
        // Note: extra_details is not a column in appointments table
        // If needed, it should be stored in extra_attrs JSONB field or lesson_notes table
        // For now, we'll skip updating extra_details for local-only lessons

        if (updateFields.length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        // Recalculate units if start/finish changed
        if (start && finish) {
          const startDate = new Date(start);
          const finishDate = new Date(finish);
          const hoursDiff = (finishDate - startDate) / (1000 * 60 * 60);
          const units = Math.max(0, hoursDiff);
          updateFields.push(`units = $${paramIndex++}`);
          updateValues.push(units);
        }

        updateFields.push(`updated_at = NOW()`);
        updateValues.push(appointmentId.toString());

        const updateQuery = `
          UPDATE appointments 
          SET ${updateFields.join(', ')}
          WHERE appointment_id = $${paramIndex}
        `;

        await pool.query(updateQuery, updateValues);

        // If apply_to_repeated is true, update all future lessons with the same service_id
        if (apply_to_repeated) {
          const { rows: serviceRows } = await pool.query(
            `SELECT service_id FROM appointments WHERE appointment_id = $1`,
            [appointmentId.toString()]
          );
          
          if (serviceRows.length > 0) {
            const serviceId = serviceRows[0].service_id;
            const repeatedUpdateFields = [];
            const repeatedUpdateValues = [];
            let repeatedParamIndex = 1;

            if (start !== undefined) {
              // Calculate time difference and apply to future lessons
              const { rows: currentRows } = await pool.query(
                `SELECT start FROM appointments WHERE appointment_id = $1`,
                [appointmentId.toString()]
              );
              if (currentRows.length > 0) {
                const currentStart = new Date(currentRows[0].start);
                const newStart = new Date(start);
                const timeDiff = newStart - currentStart;
                
                // Update all future lessons by adding the time difference
                await pool.query(`
                  UPDATE appointments
                  SET start = start + ($1::interval),
                      finish = finish + ($1::interval),
                      updated_at = NOW()
                  WHERE service_id::text = $2
                    AND appointment_id::integer > $3
                    AND start > (SELECT start FROM appointments WHERE appointment_id = $3)
                `, [
                  `${timeDiff} milliseconds`,
                  serviceId.toString(),
                  appointmentId
                ]);
              }
            }
            
            if (topic !== undefined) {
              repeatedUpdateFields.push(`topic = $${repeatedParamIndex++}`);
              repeatedUpdateValues.push(topic);
            }
            if (location !== undefined) {
              const locationValue = typeof location === 'string' ? location : JSON.stringify(location);
              repeatedUpdateFields.push(`location = $${repeatedParamIndex++}`);
              repeatedUpdateValues.push(locationValue);
            }
            // Note: extra_details is not a column in appointments table
            // Skip updating extra_details for repeated lessons

            if (repeatedUpdateFields.length > 0) {
              repeatedUpdateValues.push(serviceId.toString(), appointmentId.toString());
              await pool.query(`
                UPDATE appointments
                SET ${repeatedUpdateFields.join(', ')}, updated_at = NOW()
                WHERE service_id::text = $${repeatedParamIndex}
                  AND appointment_id::integer > $${repeatedParamIndex + 1}
                  AND start > (SELECT start FROM appointments WHERE appointment_id = $${repeatedParamIndex + 1})
              `, repeatedUpdateValues);
            }
          }
        }

        return res.json({ 
          success: true,
          message: 'Lesson updated successfully (local only)',
          localOnly: true
        });
      } catch (localError) {
        logger.error({ err: localError }, 'Error updating local lesson:');
        return res.status(500).json({ 
          error: 'Failed to update local lesson',
          details: localError.message
        });
      }
    }

    // Handle TutorCruncher lesson update
    try {
      // First, get the current appointment from TutorCruncher
      const response = await tutorCruncherAPI.get(`appointments/${appointmentId}/`);
      const appointment = response.data;

      // Build update payload
      const updatePayload = {
        start: start || appointment.start,
        finish: finish || appointment.finish,
        topic: topic !== undefined ? topic : appointment.topic,
        location: location !== undefined ? location : appointment.location,
        extra_attrs: appointment.extra_attrs || {}
      };

      // Add extra_details to extra_attrs if provided
      if (extra_details !== undefined) {
        updatePayload.extra_attrs.extra_details = extra_details;
      }

      if (appointment.service?.id) {
        updatePayload.service = appointment.service.id;
      }

      // Update in TutorCruncher
      await tutorCruncherAPI.put(`appointments/${appointmentId}/`, updatePayload);

      // Update in local database
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (start !== undefined) {
        updateFields.push(`start = $${paramIndex++}`);
        updateValues.push(start);
      }
      if (finish !== undefined) {
        updateFields.push(`finish = $${paramIndex++}`);
        updateValues.push(finish);
      }
      if (topic !== undefined) {
        updateFields.push(`topic = $${paramIndex++}`);
        updateValues.push(topic);
      }
      if (location !== undefined) {
        const locationValue = typeof location === 'string' ? location : JSON.stringify(location);
        updateFields.push(`location = $${paramIndex++}`);
        updateValues.push(locationValue);
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(appointmentId.toString());
        await pool.query(
          `UPDATE appointments SET ${updateFields.join(', ')} WHERE appointment_id = $${paramIndex}`,
          updateValues
        );
      }

      res.json({ success: true, message: 'Lesson updated successfully' });
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error updating lesson in TutorCruncher:');
      return res.status(500).json({ 
        error: 'Failed to update lesson in TutorCruncher',
        details: error.response?.data || error.message
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating lesson:');
    res.status(500).json({ error: 'Failed to update lesson' });
  }
}));

// POST /api/lessons/:id/students - Add student to lesson
router.post('/:id/students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const { recipient, charge_rate } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    if (!recipient) {
      return res.status(400).json({ error: 'Recipient ID is required' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;
    
    logger.info(`POST /:id/students - Adding student ${recipient} to lesson ${appointmentId}, isLocalOnly: ${isLocalOnly}`);

    if (isLocalOnly) {
      // Add student directly to local database
      try {
        // Get the service_id from the appointment to find paying_client_id
        const appointmentResult = await pool.query(
          'SELECT service_id FROM appointments WHERE appointment_id::text = $1',
          [appointmentId.toString()]
        );

        if (appointmentResult.rows.length === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        const serviceId = appointmentResult.rows[0].service_id;

        // Get paying_client_id and recipient name from service_recipients
        const clientQuery = await pool.query(`
          SELECT sr.paying_client_id, sr.recipient_name
          FROM service_recipients sr
          WHERE sr.service_id::text = $1 AND sr.recipient_id::text = $2
          LIMIT 1
        `, [serviceId.toString(), recipient.toString()]);
        
        let payingClientId = clientQuery.rows[0]?.paying_client_id || null;
        let recipientName = clientQuery.rows[0]?.recipient_name || null;
        let payingClientName = null;

        // If not found in service_recipients, try recipients table
        if (!recipientName) {
          const recipientQuery = await pool.query(`
            SELECT 
              recipient_id,
              COALESCE(first_name || ' ' || last_name, first_name, last_name) as recipient_name,
              paying_client_id
            FROM recipients
            WHERE recipient_id::text = $1
            LIMIT 1
          `, [recipient.toString()]);
          
          if (recipientQuery.rows.length > 0) {
            recipientName = recipientQuery.rows[0].recipient_name;
            if (!payingClientId) {
              payingClientId = recipientQuery.rows[0].paying_client_id;
            }
          }
        }

        // If still no name, try appointment_recipients (might have been added to another lesson)
        if (!recipientName) {
          const existingRecipientQuery = await pool.query(`
            SELECT recipient_name, paying_client_id
            FROM appointment_recipients
            WHERE recipient_id::text = $1
            LIMIT 1
          `, [recipient.toString()]);
          
          if (existingRecipientQuery.rows.length > 0) {
            recipientName = existingRecipientQuery.rows[0].recipient_name;
            if (!payingClientId) {
              payingClientId = existingRecipientQuery.rows[0].paying_client_id;
            }
          }
        }

        // Fallback to "Unknown Student" if still no name
        if (!recipientName) {
          recipientName = 'Unknown Student';
        }

        // Get paying client name if we have a paying_client_id
        if (payingClientId) {
          const clientNameQuery = await pool.query(`
            SELECT COALESCE(first_name || ' ' || last_name, first_name, last_name) as client_name
            FROM clients
            WHERE client_id::text = $1
            LIMIT 1
          `, [payingClientId.toString()]);
          
          if (clientNameQuery.rows.length > 0) {
            payingClientName = clientNameQuery.rows[0].client_name;
          }
        }

        // Insert into appointment_recipients
        await pool.query(`
          INSERT INTO appointment_recipients (
            appointment_id, recipient_id, recipient_name, paying_client_id, paying_client_name, charge_rate, status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'attending')
          ON CONFLICT (appointment_id, recipient_id) DO UPDATE SET
            charge_rate = COALESCE(EXCLUDED.charge_rate, appointment_recipients.charge_rate),
            recipient_name = COALESCE(EXCLUDED.recipient_name, appointment_recipients.recipient_name),
            paying_client_name = COALESCE(EXCLUDED.paying_client_name, appointment_recipients.paying_client_name)
        `, [
          appointmentId.toString(),
          recipient.toString(),
          recipientName,
          payingClientId,
          payingClientName,
          charge_rate || null
        ]);

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error adding student to local lesson');
        return res.status(500).json({ 
          error: 'Failed to add student to lesson',
          details: error.message,
          isLocalOnly: true
        });
      }
    } else {
      // Add recipient via TutorCruncher API
      const payload = {
        recipient: recipient
      };
      if (charge_rate) {
        payload.charge_rate = charge_rate.toString();
      }

      try {
        await tutorCruncherAPI.post(`appointments/${appointmentId}/recipient/add/`, payload);
        res.json({ success: true });
      } catch (error) {
        // Only log non-404 errors for TutorCruncher lessons
        if (error.response?.status !== 404) {
          logger.error({ error: error.response?.data || error.message }, 'Error adding recipient in TutorCruncher:');
        }
        return res.status(500).json({ 
          error: 'Failed to add student in TutorCruncher',
          details: error.response?.data || error.message
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error adding student to lesson:');
    res.status(500).json({ error: 'Failed to add student to lesson' });
  }
}));

// DELETE /api/lessons/:id/students/:studentId - Remove student from lesson
router.delete('/:id/students/:studentId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);

    if (isNaN(appointmentId) || isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid lesson or student ID' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Remove student directly from local database
      try {
        const result = await pool.query(`
          DELETE FROM appointment_recipients 
          WHERE appointment_id::text = $1 AND recipient_id::text = $2
        `, [appointmentId.toString(), studentId.toString()]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Student not found in lesson' });
        }

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error removing student from local lesson:');
        return res.status(500).json({ 
          error: 'Failed to remove student from lesson',
          details: error.message
        });
      }
    } else {
      // Remove recipient via TutorCruncher API
      try {
        await tutorCruncherAPI.post(`appointments/${appointmentId}/recipient/remove/`, {
          recipient: studentId
        });
        res.json({ success: true });
      } catch (error) {
        // Only log non-404 errors for TutorCruncher lessons
        if (error.response?.status !== 404) {
          logger.error({ error: error.response?.data || error.message }, 'Error removing recipient in TutorCruncher:');
        }
        return res.status(500).json({ 
          error: 'Failed to remove student in TutorCruncher',
          details: error.response?.data || error.message
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error removing student from lesson:');
    res.status(500).json({ error: 'Failed to remove student from lesson' });
  }
}));

// POST /api/lessons/:id/tutors - Add tutor to lesson
router.post('/:id/tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const { contractor, pay_rate } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    if (!contractor) {
      return res.status(400).json({ error: 'Contractor ID is required' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Add tutor directly to local database
      try {
        // Verify the appointment exists
        const appointmentResult = await pool.query(
          'SELECT appointment_id FROM appointments WHERE appointment_id::text = $1',
          [appointmentId.toString()]
        );

        if (appointmentResult.rows.length === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        // Insert into appointment_contractors
        await pool.query(`
          INSERT INTO appointment_contractors (
            appointment_id, contractor_id, pay_rate, status
          ) VALUES ($1, $2, $3, 'assigned')
          ON CONFLICT (appointment_id, contractor_id) DO UPDATE SET
            pay_rate = COALESCE(EXCLUDED.pay_rate, appointment_contractors.pay_rate)
        `, [
          appointmentId.toString(),
          contractor.toString(),
          pay_rate || null
        ]);

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error adding tutor to local lesson:');
        return res.status(500).json({ 
          error: 'Failed to add tutor to lesson',
          details: error.message
        });
      }
    } else {
      // Add contractor via TutorCruncher API
      const payload = {
        contractor: contractor
      };
      if (pay_rate) {
        payload.pay_rate = pay_rate.toString();
      }

      try {
        await tutorCruncherAPI.post(`appointments/${appointmentId}/contractor/add/`, payload);
        res.json({ success: true });
      } catch (error) {
        // Only log non-404 errors for TutorCruncher lessons
        if (error.response?.status !== 404) {
          logger.error({ error: error.response?.data || error.message }, 'Error adding contractor in TutorCruncher:');
        }
        return res.status(500).json({ 
          error: 'Failed to add tutor in TutorCruncher',
          details: error.response?.data || error.message
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error adding tutor to lesson:');
    res.status(500).json({ error: 'Failed to add tutor to lesson' });
  }
}));

// DELETE /api/lessons/:id/tutors/:tutorId - Remove tutor from lesson
router.delete('/:id/tutors/:tutorId', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const tutorId = parseInt(req.params.tutorId);

    if (isNaN(appointmentId) || isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid lesson or tutor ID' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Remove tutor directly from local database
      try {
        const result = await pool.query(`
          DELETE FROM appointment_contractors 
          WHERE appointment_id::text = $1 AND contractor_id::text = $2
        `, [appointmentId.toString(), tutorId.toString()]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Tutor not found in lesson' });
        }

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error removing tutor from local lesson:');
        return res.status(500).json({ 
          error: 'Failed to remove tutor from lesson',
          details: error.message
        });
      }
    } else {
      // Remove contractor via TutorCruncher API
      try {
        await tutorCruncherAPI.post(`appointments/${appointmentId}/contractor/remove/`, {
          contractor: tutorId
        });
        res.json({ success: true });
      } catch (error) {
        // Only log non-404 errors for TutorCruncher lessons
        if (error.response?.status !== 404) {
          logger.error({ error: error.response?.data || error.message }, 'Error removing contractor in TutorCruncher:');
        }
        return res.status(500).json({ 
          error: 'Failed to remove tutor in TutorCruncher',
          details: error.response?.data || error.message
        });
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Error removing tutor from lesson:');
    res.status(500).json({ error: 'Failed to remove tutor from lesson' });
  }
}));

// PATCH /api/lessons/:id/students/:studentId/rate - Update student charge rate for lesson
router.patch('/:id/students/:studentId/rate', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const studentId = parseInt(req.params.studentId);
    const { charge_rate } = req.body;

    if (isNaN(appointmentId) || isNaN(studentId)) {
      return res.status(400).json({ error: 'Invalid lesson or student ID' });
    }

    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Update directly in local database
      try {
        const result = await pool.query(`
          UPDATE appointment_recipients 
          SET charge_rate = $1
          WHERE appointment_id::text = $2 AND recipient_id::text = $3
        `, [charge_rate || null, appointmentId.toString(), studentId.toString()]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Student not found in lesson' });
        }

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error updating student rate in local lesson:');
        return res.status(500).json({ 
          error: 'Failed to update student rate',
          details: error.message
        });
      }
    } else {
      // Update via TutorCruncher API (if supported)
      return res.status(501).json({ error: 'Rate updates for TutorCruncher lessons not yet implemented' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating student rate:');
    res.status(500).json({ error: 'Failed to update student rate' });
  }
}));

// PATCH /api/lessons/:id/tutors/:tutorId/rate - Update tutor pay rate for lesson
router.patch('/:id/tutors/:tutorId/rate', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const tutorId = parseInt(req.params.tutorId);
    const { pay_rate } = req.body;

    if (isNaN(appointmentId) || isNaN(tutorId)) {
      return res.status(400).json({ error: 'Invalid lesson or tutor ID' });
    }

    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Update directly in local database
      try {
        const result = await pool.query(`
          UPDATE appointment_contractors 
          SET pay_rate = $1
          WHERE appointment_id::text = $2 AND contractor_id::text = $3
        `, [pay_rate || null, appointmentId.toString(), tutorId.toString()]);

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Tutor not found in lesson' });
        }

        res.json({ success: true });
      } catch (error) {
        logger.error({ err: error }, 'Error updating tutor rate in local lesson:');
        return res.status(500).json({ 
          error: 'Failed to update tutor rate',
          details: error.message
        });
      }
    } else {
      // Update via TutorCruncher API (if supported)
      return res.status(501).json({ error: 'Rate updates for TutorCruncher lessons not yet implemented' });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error updating tutor rate:');
    res.status(500).json({ error: 'Failed to update tutor rate' });
  }
}));

// GET /api/lessons/:id/available-students - Get available students to add
router.get('/:id/available-students', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Get the service/job for this lesson to find related recipients
    const { rows: appointmentRows } = await pool.query(
      `SELECT service_id FROM appointments WHERE appointment_id = $1`,
      [appointmentId]
    );

    if (appointmentRows.length === 0) {
      return res.status(404).json({ error: 'Lesson not found' });
    }

    const serviceId = appointmentRows[0].service_id;

    // Get all recipients associated with this service via service_recipients table
    // Also try to get from TutorCruncher API if available
    const { rows } = await pool.query(
      `SELECT DISTINCT
        sr.recipient_id::text as recipient_id,
        COALESCE(sr.recipient_name, r.first_name || ' ' || r.last_name, 'Unknown') as recipient_name,
        sr.paying_client_id,
        sr.paying_client_name
      FROM service_recipients sr
      LEFT JOIN recipients r ON sr.recipient_id::text = r.recipient_id::text
      WHERE sr.service_id = $1
      ORDER BY recipient_name`,
      [serviceId]
    );

    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching available students:');
    res.status(500).json({ error: 'Failed to fetch available students' });
  }
}));

// GET /api/lessons/:id/available-tutors - Get available tutors to add
router.get('/:id/available-tutors', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Get all active contractors/tutors
    const { rows } = await pool.query(
      `SELECT 
        contractor_id,
        first_name,
        last_name,
        email,
        status
      FROM contractors
      WHERE status = 'approved'
      ORDER BY first_name, last_name`
    );

    res.json(rows);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching available tutors:');
    res.status(500).json({ error: 'Failed to fetch available tutors' });
  }
}));

// POST /api/lessons/:id/notes - Add note to lesson
router.post('/:id/notes', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);
    const { note } = req.body;

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    if (!note || !note.trim()) {
      return res.status(400).json({ error: 'Note is required' });
    }

    // Store note in database (assuming we have a lesson_notes table)
    // If table doesn't exist, we'll create it via migration
    await pool.query(
      `INSERT INTO lesson_notes (appointment_id, note, created_at, created_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT DO NOTHING`,
      [appointmentId, note.trim(), req.user?.id || req.user?.email || 'system']
    );

    res.json({ success: true });
  } catch (error) {
    // If table doesn't exist, create it
    if (error.message.includes('relation "lesson_notes" does not exist')) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS lesson_notes (
            id SERIAL PRIMARY KEY,
            appointment_id INTEGER NOT NULL,
            note TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            created_by VARCHAR(255),
            FOREIGN KEY (appointment_id) REFERENCES appointments(appointment_id)
          )
        `);
        // Retry the insert
        await pool.query(
          `INSERT INTO lesson_notes (appointment_id, note, created_at, created_by)
           VALUES ($1, $2, NOW(), $3)`,
          [appointmentId, note.trim(), req.user?.id || req.user?.email || 'system']
        );
        res.json({ success: true });
      } catch (createError) {
        logger.error({ err: createError }, 'Error creating lesson_notes table:');
        res.status(500).json({ error: 'Failed to add note' });
      }
    } else {
      logger.error({ err: error }, 'Error adding note:');
      res.status(500).json({ error: 'Failed to add note' });
    }
  }
}));

// DELETE /api/lessons/:id - Delete a lesson (must come before /:id route)
router.delete('/:id', auth, asyncHandler(async (req, res) => {
  try {
    const pool = getLocationPool(req);
    const appointmentId = parseInt(req.params.id);

    if (isNaN(appointmentId)) {
      return res.status(400).json({ error: 'Invalid lesson ID' });
    }

    // Check if this is a local-only lesson (negative appointment ID)
    const isLocalOnly = appointmentId < 0;

    if (isLocalOnly) {
      // Delete local-only lesson
      try {
        // Delete related records first (due to foreign key constraints)
        await pool.query(`DELETE FROM appointment_recipients WHERE appointment_id::text = $1`, [appointmentId.toString()]);
        await pool.query(`DELETE FROM appointment_contractors WHERE appointment_id::text = $1`, [appointmentId.toString()]);
        
        // Delete the appointment itself
        const result = await pool.query(
          `DELETE FROM appointments WHERE appointment_id = $1`,
          [appointmentId.toString()]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Lesson not found' });
        }

        return res.json({ 
          success: true, 
          message: 'Lesson deleted successfully',
          localOnly: true
        });
      } catch (localError) {
        logger.error({ err: localError }, 'Error deleting local lesson:');
        return res.status(500).json({ 
          error: 'Failed to delete local lesson',
          details: localError.message
        });
      }
    }

    // Handle TutorCruncher lesson deletion
    try {
      await tutorCruncherAPI.delete(`appointments/${appointmentId}/`);
    } catch (error) {
      logger.error({ error: error.response?.data || error.message }, 'Error deleting appointment from TutorCruncher:');
      return res.status(500).json({ 
        error: 'Failed to delete appointment in TutorCruncher',
        details: error.response?.data || error.message
      });
    }

    // Delete from local database
    await pool.query(
      `DELETE FROM appointments WHERE appointment_id = $1`,
      [appointmentId.toString()]
    );

    res.json({ 
      success: true, 
      message: 'Lesson deleted successfully'
    });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting lesson:');
    res.status(500).json({ 
      error: 'Failed to delete lesson',
      details: error.message
    });
  }
}));

module.exports = router;
