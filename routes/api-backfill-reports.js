const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// POST /api/backfill-reports - Backfill lesson reports for appointment 19129261
router.post('/', asyncHandler(async (req, res) => {
  try {
    logger.info('🚀 Backfilling lesson reports for appointment 19129261...');
    
    // First check if reports already exist
    const { rows: existingReports } = await pool.query(`
      SELECT id, client_name, student_name, status 
      FROM client_reports 
      WHERE appointment_id = 19129261
    `);
    
    if (existingReports.length > 0) {
      logger.info({ count: existingReports.length }, '⚠️ Found existing reports for appointment 19129261');
      return res.json({
        success: true,
        message: `Found ${existingReports.length} existing reports. Skipping insertion to avoid duplicates.`,
        reports: existingReports
      });
    }
    
    // Insert the reports
    const reports = [
      {
        tutor_name: 'Mandy Miller',
        client_name: 'Jessica Adamcheck',
        student_name: 'Owen Adamcheck',
        client_email: 'jessica.adamcheck@gmail.com',
        template_name: 'Chess Module 1: Lesson 7 - Pawns 1',
        tutor_feedback: 'We had a wonderful day today, learning about all of the princes and princesses of Chesslandia, the pawns! We learned how they like to move one step at a time and stay in a straight line so that they can race until they are One… Two… Three… LOCKED!',
        status: 'pending',
        appointment_id: 19129261
      },
      {
        tutor_name: 'Mandy Miller',
        client_name: 'FELIPE BARROSO',
        student_name: 'Gabriel Barroso',
        client_email: 'felipe.fgbarroso@gmail.com',
        template_name: 'Chess Module 1: Lesson 7 - Pawns 1',
        tutor_feedback: 'We had a wonderful day today, learning about all of the princes and princesses of Chesslandia, the pawns! We learned how they like to move one step at a time and stay in a straight line so that they can race until they are One… Two… Three… LOCKED!',
        status: 'pending',
        appointment_id: 19129261
      },
      {
        tutor_name: 'Mandy Miller',
        client_name: 'Ericka Otero',
        student_name: 'Jayden Martinez',
        client_email: 'ericka.otero@gmail.com',
        template_name: 'Chess Module 1: Lesson 7 - Pawns 1',
        tutor_feedback: 'We had a wonderful day today, learning about all of the princes and princesses of Chesslandia, the pawns! We learned how they like to move one step at a time and stay in a straight line so that they can race until they are One… Two… Three… LOCKED!',
        status: 'pending',
        appointment_id: 19129261
      },
      {
        tutor_name: 'Mandy Miller',
        client_name: 'Anderson Vasquez',
        student_name: 'Jahziel Vasquez',
        client_email: 'antonio91422@gmail.com',
        template_name: 'Chess Module 1: Lesson 7 - Pawns 1',
        tutor_feedback: 'We had a wonderful day today, learning about all of the princes and princesses of Chesslandia, the pawns! We learned how they like to move one step at a time and stay in a straight line so that they can race until they are One… Two… Three… LOCKED!',
        status: 'pending',
        appointment_id: 19129261
      },
      {
        tutor_name: 'Mandy Miller',
        client_name: 'Abby Vining',
        student_name: 'Henry Vining',
        client_email: 'abbylvining@gmail.com',
        template_name: 'Chess Module 1: Lesson 7 - Pawns 1',
        tutor_feedback: 'We had a wonderful day today, learning about all of the princes and princesses of Chesslandia, the pawns! We learned how they like to move one step at a time and stay in a straight line so that they can race until they are One… Two… Three… LOCKED!',
        status: 'pending',
        appointment_id: 19129261
      }
    ];
    
    logger.info('📝 Inserting reports...');
    const insertedReports = [];
    
    for (const report of reports) {
      const { rows } = await pool.query(`
        INSERT INTO client_reports (
          tutor_name, client_name, student_name, client_email, 
          template_name, tutor_feedback, status, appointment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, client_name, student_name, status
      `, [
        report.tutor_name,
        report.client_name,
        report.student_name,
        report.client_email,
        report.template_name,
        report.tutor_feedback,
        report.status,
        report.appointment_id
      ]);
      
      logger.info({ studentName: report.student_name, clientName: report.client_name, id: rows[0].id }, '   ✅ Report inserted');
      insertedReports.push(rows[0]);
    }
    
    logger.info('🎉 All reports inserted successfully!');
    
    res.json({
      success: true,
      message: 'All reports inserted successfully into Eastside database!',
      reports: insertedReports
    });
    
  } catch (error) {
    logger.error({ err: error }, '❌ Error inserting reports');
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;
