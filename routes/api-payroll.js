const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAdmin } = require('../middleware/rbac');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { tableExists } = require('../utils/schema-cache');
const { asyncHandler } = require('../middleware/error-handler');
const { logger } = require('../utils/logger');
const { pool } = global;

// Helper function to calculate business days before a date (excluding weekends)
function getBusinessDaysBefore(date, days = 2) {
  const result = new Date(date);
  let subtracted = 0;
  while (subtracted < days) {
    result.setDate(result.getDate() - 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday or Saturday
      subtracted++;
    }
  }
  return result;
}

// Generate future pay cycles based on pattern
// Pay periods: Sunday to Saturday, every 2 weeks
// Payday: Every other Friday
// Deadline: 2 business days before payday
function generatePayCycles(startDate, count = 12) {
  const cycles = [];
  // Parse start date - handle both Date object and string
  let periodStart = startDate instanceof Date ? new Date(startDate) : new Date(startDate);
  
  // Ensure we start on a Sunday (11/2/2025 is a Sunday)
  const day = periodStart.getDay();
  if (day !== 0) {
    // Adjust to previous Sunday
    periodStart.setDate(periodStart.getDate() - day);
  }
  
  for (let i = 0; i < count; i++) {
    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodEnd.getDate() + 13); // 14 days total (Sunday to Saturday)
    
    // Calculate payday: Friday, 6 days after period end
    const payday = new Date(periodEnd);
    payday.setDate(payday.getDate() + 6); // Friday after Saturday
    
    // Calculate deadline: 2 business days before payday
    const deadline = getBusinessDaysBefore(payday, 2);
    
    cycles.push({
      payPeriodStart: formatDate(periodStart),
      payPeriodEnd: formatDate(periodEnd),
      payrollDeadline: formatDate(deadline),
      payday: formatDate(payday)
    });
    
    // Move to next cycle (2 weeks later)
    periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() + 1); // Next Sunday
  }
  
  return cycles;
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Employee mapping from TutorCruncher names to Engage PEO IDs
// Based on the image provided showing employee IDs and pay rates
const EMPLOYEE_MAP = {
  'Jane Levy': { id: 'H44768', name: 'Jane Levy', department: 'Tutors', regRate: 40 },
  'Rachel Cassar': { id: 'T44778', name: 'Rachel Cassar', department: 'Tutors', regRate: 70 },
  'Mary Hartley': { id: 'B44762', name: 'Mary Hartley', department: 'Tutors', regRate: 60 },
  'Mary Hartley (Malaney)': { id: 'B44762', name: 'Mary Hartley', department: 'Tutors', regRate: 60 },
  'Mary Malaney': { id: 'B44762', name: 'Mary Hartley', department: 'Tutors', regRate: 60 },
  'Kimberly Kidani': { id: 'F44766', name: 'Kimberly Kidani', department: 'Clubs', regRate: 25 },
  'Max Berry': { id: 'Z44760', name: 'Berry Maxwell', department: 'Tutors', regRate: 60 },
  'Berry Maxwell': { id: 'Z44760', name: 'Berry Maxwell', department: 'Tutors', regRate: 60 },
  'Parker Jenkins': { id: 'E44765', name: 'Nathan Jenkins', department: 'Tutors', regRate: 25 },
  'Nathan Jenkins': { id: 'E44765', name: 'Nathan Jenkins', department: 'Tutors', regRate: 25 },
  'Jasmine Haefner': { id: 'A44761', name: 'Jasmine Haefner', department: 'Tutors', regRate: 75 },
  'Ana Moioli': { id: 'P44775', name: 'Ana Santana Moioli', department: 'Tutors', regRate: 65 },
  'Ana Santana Moioli': { id: 'P44775', name: 'Ana Santana Moioli', department: 'Tutors', regRate: 65 },
  'Brianna Buckner': { id: 'K44771', name: 'Brianna Buckner', department: 'Clubs', regRate: 25 },
  'Brianna Buckner (Mooney)': { id: 'K44771', name: 'Brianna Buckner', department: 'Clubs', regRate: 25 },
  'Mafalda Pinto Correia': { id: 'N44774', name: 'Mafalda PintoCorreia', department: 'Tutors', regRate: 70 },
  'Mafalda PintoCorreia': { id: 'N44774', name: 'Mafalda PintoCorreia', department: 'Tutors', regRate: 70 },
  'Mafalda Pinto Cavin': { id: 'N44774', name: 'Mafalda PintoCorreia', department: 'Tutors', regRate: 70 },
  'Jake Silbermann': { id: 'R44776', name: 'Jake Silberman', department: 'Tutors', regRate: 70 },
  'Jake Silberman': { id: 'R44776', name: 'Jake Silberman', department: 'Tutors', regRate: 70 },
  'Allison Clardy': { id: 'U44779', name: 'Allison Clardy', department: 'Retail', regRate: 25 },
};

// Non-teaching work rate (REG1) - default
const DEFAULT_REG1_RATE = 25;

// Ensure payroll_settings table exists
async function ensurePayrollSettings() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_settings (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `);
}

// Get employee rate configurations
async function getEmployeeRates() {
  await ensurePayrollSettings();
  const { rows } = await pool.query(
    `SELECT data FROM payroll_settings WHERE id = 'employee_rates'`
  );
  if (rows.length) {
    return rows[0].data;
  }
  // Return default rates from EMPLOYEE_MAP
  const defaultRates = {};
  Object.values(EMPLOYEE_MAP).forEach(emp => {
    if (!defaultRates[emp.id]) {
      defaultRates[emp.id] = {
        employeeId: emp.id,
        employeeName: emp.name,
        department: emp.department,
        regRate: emp.regRate,
        reg1Rate: DEFAULT_REG1_RATE
      };
    }
  });
  return defaultRates;
}

// Save employee rate configurations
async function saveEmployeeRates(rates) {
  await ensurePayrollSettings();
  await pool.query(
    `INSERT INTO payroll_settings (id, data, updated_at) VALUES ('employee_rates', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [rates]
  );
}

// Helper function to get week ending date (Saturday)
function getWeekEndingDate(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  // Calculate days to add to get to Saturday
  // If day is 0 (Sunday), add 6 days
  // If day is 1 (Monday), add 5 days
  // If day is 2 (Tuesday), add 4 days
  // If day is 3 (Wednesday), add 3 days
  // If day is 4 (Thursday), add 2 days
  // If day is 5 (Friday), add 1 day
  // If day is 6 (Saturday), add 0 days
  const daysToAdd = day === 0 ? 6 : 6 - day;
  const saturday = new Date(date);
  saturday.setDate(date.getDate() + daysToAdd);
  return saturday;
}

// Format date as MM/DD/YYYY
function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

// Find employee mapping by name (fuzzy matching)
function findEmployee(contactName) {
  if (!contactName) return null;
  
  // Try exact match first
  if (EMPLOYEE_MAP[contactName]) {
    return EMPLOYEE_MAP[contactName];
  }
  
  // Try partial matches
  const normalizedName = contactName.toLowerCase().trim();
  for (const [key, value] of Object.entries(EMPLOYEE_MAP)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedName.includes(normalizedKey) || normalizedKey.includes(normalizedName)) {
      return value;
    }
  }
  
  return null;
}

// Check if description indicates non-teaching work
function isNonTeachingWork(description) {
  if (!description) return false;
  const desc = description.toLowerCase();
  return desc.includes('non teaching') || 
         desc.includes('non-teaching') ||
         desc.includes('curriculum work') ||
         desc.includes('club support');
}

// GET /api/payroll/rates - Get employee rate configurations
router.get('/rates', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const rates = await getEmployeeRates();
    res.json(rates);
  } catch (error) {
    logger.error({ err: error }, 'Error fetching employee rates:');
    res.status(500).json({ error: 'Failed to fetch employee rates', details: error.message });
  }
}));

// PUT /api/payroll/rates - Save employee rate configurations
router.put('/rates', requireAdmin, asyncHandler(async (req, res) => {
  try {
    await saveEmployeeRates(req.body);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error saving employee rates:');
    res.status(500).json({ error: 'Failed to save employee rates', details: error.message });
  }
}));

// POST /api/payroll/analyze - Analyze CSV and return summary (without generating import)
router.post('/analyze', requireAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const employeeRates = await getEmployeeRates();
    const csvContent = req.file.buffer.toString('utf-8');
    
    // Parse CSV
    const records = [];
    await new Promise((resolve, reject) => {
      const stream = Readable.from([csvContent]);
      stream
        .pipe(csv({
          skipEmptyLines: true,
          skipLinesWithError: true
        }))
        .on('data', (data) => records.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Group by employee - sum actual dollar amounts from CSV, then calculate hours based on REG rate
    const employeeHours = new Map(); // key: employeeId
    const invoiceToEmployee = new Map(); // Track employee by invoice number
    
    for (const record of records) {
      let contactName = record.ContactName || '';
      const invoiceNumber = record.InvoiceNumber || '';
      
      // If ContactName is empty but we have an invoice number, use the last employee for this invoice
      if (!contactName && invoiceNumber && invoiceToEmployee.has(invoiceNumber)) {
        contactName = invoiceToEmployee.get(invoiceNumber);
      }
      
      const employee = findEmployee(contactName);
      
      // Skip if we can't find employee
      if (!employee) {
        if (contactName) {
          logger.warn(`Employee not found for: ${contactName}`);
        }
        continue;
      }
      
      // Store employee for this invoice so we can use it for subsequent rows
      if (invoiceNumber && contactName) {
        invoiceToEmployee.set(invoiceNumber, contactName);
      }
      
      const quantity = parseFloat(record.Quantity || '0');
      if (isNaN(quantity) || quantity <= 0) continue;
      
      const unitAmount = parseFloat(record.UnitAmount || '0');
      if (isNaN(unitAmount) || unitAmount <= 0) continue;
      
      // Store employee info and sum actual dollar amounts from CSV
      if (!employeeHours.has(employee.id)) {
        const rateConfig = employeeRates[employee.id] || {
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          regRate: employee.regRate,
          reg1Rate: DEFAULT_REG1_RATE
        };
        employeeHours.set(employee.id, {
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          regRate: rateConfig.regRate,
          reg1Rate: rateConfig.reg1Rate,
          totalAmount: 0 // Sum actual dollar amounts from CSV
        });
      }
      
      const entry = employeeHours.get(employee.id);
      // Sum actual dollar amounts: Quantity × UnitAmount from CSV
      entry.totalAmount += quantity * unitAmount;
    }
    
    // Calculate hours based on total amount divided by REG rate
    for (const [employeeId, entry] of employeeHours.entries()) {
      // Hours = Total Amount / REG Rate
      entry.totalHours = entry.regRate > 0 ? entry.totalAmount / entry.regRate : 0;
    }
    
    // Format summary for display - show total hours and amount calculated with REG rate
    const summary = Array.from(employeeHours.values())
      .map(emp => ({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        department: emp.department,
        regRate: emp.regRate,
        reg1Rate: emp.reg1Rate,
        regularHours: emp.totalHours, // All hours go to REG
        nonTeachHours: 0, // No REG1 hours
        regularTotal: emp.totalAmount, // Total calculated with REG rate
        nonTeachTotal: 0,
        totalHours: emp.totalHours,
        totalAmount: emp.totalAmount
      }))
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    
    const grandTotal = summary.reduce((sum, emp) => sum + emp.totalAmount, 0);
    
    res.json({
      summary,
      grandTotal,
      employeeRates
    });
    
  } catch (error) {
    logger.error({ err: error }, 'Error analyzing payroll file:');
    res.status(500).json({ 
      error: 'Failed to analyze payroll file', 
      details: error.message 
    });
  }
}));

// GET /api/payroll/pay-cycles - Get pay cycles (current and future)
router.get('/pay-cycles', requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Check if pay_cycles table exists (cached)
    const pcExists = await tableExists(pool, 'pay_cycles');

    if (!pcExists) {
      // Generate initial pay cycles starting from 11/2/2025
      const startDate = new Date(2025, 10, 2); // November 2, 2025
      const cycles = generatePayCycles(startDate, 12);
      
      // Return cycles without saving (table doesn't exist yet)
      return res.json({ cycles });
    }
    
    // Get active pay cycles from database
    const { rows } = await pool.query(`
      SELECT 
        id,
        pay_period_start as "payPeriodStart",
        pay_period_end as "payPeriodEnd",
        payroll_deadline as "payrollDeadline",
        payday,
        is_active as "isActive"
      FROM pay_cycles
      WHERE is_active = true
      ORDER BY payday ASC
    `);
    
    // If table exists but has no active cycles, generate cycles on the fly
    if (rows.length === 0) {
      logger.info('pay_cycles table exists but is empty. Generating cycles on the fly...');
      const startDate = new Date(2025, 10, 2); // November 2, 2025
      const cycles = generatePayCycles(startDate, 12);
      return res.json({ cycles });
    }
    
    res.json({ cycles: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching pay cycles:');
    res.status(500).json({ error: 'Failed to fetch pay cycles', details: error.message });
  }
}));

// POST /api/payroll/pay-cycles - Generate and save future pay cycles
router.post('/pay-cycles', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { startDate, count = 12 } = req.body;
    
    if (!startDate) {
      return res.status(400).json({ error: 'Start date is required' });
    }
    
    // Ensure pay_cycles table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pay_cycles (
        id SERIAL PRIMARY KEY,
        pay_period_start DATE NOT NULL,
        pay_period_end DATE NOT NULL,
        payroll_deadline DATE NOT NULL,
        payday DATE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(pay_period_start, pay_period_end)
      );
    `);
    
    const cycles = generatePayCycles(new Date(startDate), count);
    
    // Insert cycles into database
    for (const cycle of cycles) {
      await pool.query(`
        INSERT INTO pay_cycles (pay_period_start, pay_period_end, payroll_deadline, payday, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (pay_period_start, pay_period_end) DO NOTHING
      `, [
        cycle.payPeriodStart,
        cycle.payPeriodEnd,
        cycle.payrollDeadline,
        cycle.payday
      ]);
    }
    
    res.json({ success: true, cycles });
  } catch (error) {
    logger.error({ err: error }, 'Error generating pay cycles:');
    res.status(500).json({ error: 'Failed to generate pay cycles', details: error.message });
  }
}));

// GET /api/payroll/history - Get payroll history
router.get('/history', requireAdmin, asyncHandler(async (req, res) => {
  try {
    // Ensure payroll_history table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_history (
        id SERIAL PRIMARY KEY,
        pay_period_start DATE NOT NULL,
        pay_period_end DATE NOT NULL,
        payroll_deadline DATE NOT NULL,
        payday DATE NOT NULL,
        csv_data TEXT NOT NULL,
        summary_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        employee_rates JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    const { rows } = await pool.query(`
      SELECT 
        id,
        pay_period_start as "payPeriodStart",
        pay_period_end as "payPeriodEnd",
        payroll_deadline as "payrollDeadline",
        payday,
        summary_data as "summaryData",
        employee_rates as "employeeRates",
        created_at as "createdAt"
      FROM payroll_history
      ORDER BY payday DESC, created_at DESC
      LIMIT 50
    `);
    
    res.json({ history: rows });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching payroll history:');
    res.status(500).json({ error: 'Failed to fetch payroll history', details: error.message });
  }
}));

// GET /api/payroll/history/:id - Get specific payroll run details
router.get('/history/:id', requireAdmin, asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT 
        id,
        pay_period_start as "payPeriodStart",
        pay_period_end as "payPeriodEnd",
        payroll_deadline as "payrollDeadline",
        payday,
        csv_data as "csvData",
        summary_data as "summaryData",
        employee_rates as "employeeRates",
        created_at as "createdAt"
      FROM payroll_history
      WHERE id = $1
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }
    
    res.json({ payroll: rows[0] });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching payroll run:');
    res.status(500).json({ error: 'Failed to fetch payroll run', details: error.message });
  }
}));

// POST /api/payroll/process - Process TutorCruncher export and generate Engage PEO import
router.post('/process', requireAdmin, upload.single('file'), asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const employeeRates = await getEmployeeRates();
    const csvContent = req.file.buffer.toString('utf-8');
    
    // Parse CSV using csv-parser
    const records = [];
    await new Promise((resolve, reject) => {
      const stream = Readable.from([csvContent]);
      stream
        .pipe(csv({
          skipEmptyLines: true,
          skipLinesWithError: true
        }))
        .on('data', (data) => records.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    // Group hours by employee and week ending date
    const hoursMap = new Map(); // key: `${employeeId}_${weekEnding}`
    const invoiceToEmployee = new Map(); // Track employee by invoice number
    
    for (const record of records) {
      let contactName = record.ContactName || '';
      const invoiceNumber = record.InvoiceNumber || '';
      
      // If ContactName is empty but we have an invoice number, use the last employee for this invoice
      if (!contactName && invoiceNumber && invoiceToEmployee.has(invoiceNumber)) {
        contactName = invoiceToEmployee.get(invoiceNumber);
      }
      
      const employee = findEmployee(contactName);
      
      if (!employee) {
        if (contactName) {
          logger.warn(`Employee not found for: ${contactName}`);
        }
        continue;
      }
      
      // Store employee for this invoice so we can use it for subsequent rows
      if (invoiceNumber && contactName) {
        invoiceToEmployee.set(invoiceNumber, contactName);
      }
      
      const startDate = record.StartDate || record.FinishDate || '';
      if (!startDate) continue;
      
      // Parse date in MM/DD/YYYY format
      let date;
      const dateMatch = startDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (dateMatch) {
        const [, month, day, year] = dateMatch;
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      } else {
        date = new Date(startDate);
      }
      
      if (isNaN(date.getTime())) {
        logger.warn(`Invalid date: ${startDate}`);
        continue;
      }
      
      const weekEnding = getWeekEndingDate(date);
      const weekEndingStr = formatDate(weekEnding);
      
      const quantity = parseFloat(record.Quantity || '0');
      if (isNaN(quantity) || quantity <= 0) continue;
      
      const unitAmount = parseFloat(record.UnitAmount || '0');
      if (isNaN(unitAmount) || unitAmount <= 0) continue;
      
      const key = `${employee.id}_${weekEndingStr}`;
      
      if (!hoursMap.has(key)) {
        const rateConfig = employeeRates[employee.id] || {
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          regRate: employee.regRate,
          reg1Rate: DEFAULT_REG1_RATE
        };
        hoursMap.set(key, {
          employeeId: employee.id,
          employeeName: employee.name,
          department: employee.department,
          weekEnding: weekEndingStr,
          regRate: rateConfig.regRate,
          totalAmount: 0 // Sum dollar amounts from CSV
        });
      }
      
      const entry = hoursMap.get(key);
      // Sum actual dollar amounts: Quantity × UnitAmount from CSV
      entry.totalAmount += quantity * unitAmount;
    }
    
    // Convert to array and create rows - one row per employee per week with all hours in REG
    const weekData = Array.from(hoursMap.values())
      .sort((a, b) => {
        if (a.employeeId !== b.employeeId) {
          return a.employeeId.localeCompare(b.employeeId);
        }
        return a.weekEnding.localeCompare(b.weekEnding);
      });
    
    // Create rows - calculate hours from total amount divided by REG rate
    const output = [];
    for (const week of weekData) {
      if (week.totalAmount > 0 && week.regRate > 0) {
        // Calculate hours: Total Amount / REG Rate
        const hours = week.totalAmount / week.regRate;
        output.push({
          employeeId: week.employeeId,
          employeeName: week.employeeName,
          department: week.department,
          weekEnding: week.weekEnding,
          hours: hours,
          rate: week.regRate
        });
      }
    }
    
    // Sort: employee, then week
    output.sort((a, b) => {
      if (a.employeeId !== b.employeeId) {
        return a.employeeId.localeCompare(b.employeeId);
      }
      return a.weekEnding.localeCompare(b.weekEnding);
    });
    
    // Generate CSV manually
    const escapeCsvField = (value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    
    const headers = [
      'Employee ID ',
      'Employee Name',
      'Department',
      'Week Ending Date',
      'Regular Hours ',
      'Non-Teach ',
      'OT Hours',
      'Holiday Hours',
      'Sick Hours',
      'Vac Hours',
      'PTO ',
      'Bonus',
      'Commission'
    ];
    
    const csvRows = [
      headers.join(','),
      ...output.map(row => {
        // All hours go in Regular Hours column, Non-Teach is empty
        return [
          escapeCsvField(row.employeeId),
          escapeCsvField(row.employeeName),
          escapeCsvField(row.department),
          escapeCsvField(row.weekEnding),
          escapeCsvField(row.hours), // All hours in Regular Hours
          escapeCsvField(''), // Non-Teach empty
          escapeCsvField(''), // OT Hours
          escapeCsvField(''), // Holiday Hours
          escapeCsvField(''), // Sick Hours
          escapeCsvField(''), // Vac Hours
          escapeCsvField(''), // PTO
          escapeCsvField(''), // Bonus
          escapeCsvField('')  // Commission
        ].join(',');
      })
    ];
    
    const csvOutput = csvRows.join('\n');
    
    // Save to history if pay period info provided
    const { payPeriodStart, payPeriodEnd, payrollDeadline, payday, saveToHistory } = req.body;
    if (saveToHistory && payPeriodStart && payPeriodEnd && payrollDeadline && payday) {
      try {
        // Ensure payroll_history table exists (will be created by migration, but this ensures it exists)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS payroll_history (
            id SERIAL PRIMARY KEY,
            pay_period_start DATE NOT NULL,
            pay_period_end DATE NOT NULL,
            payroll_deadline DATE NOT NULL,
            payday DATE NOT NULL,
            csv_data TEXT NOT NULL,
            summary_data JSONB NOT NULL DEFAULT '{}'::jsonb,
            employee_rates JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `);
        
        // Create indexes if they don't exist
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_payroll_history_pay_period 
          ON payroll_history(pay_period_start, pay_period_end);
        `).catch(() => {}); // Ignore if index already exists
        
        await pool.query(`
          CREATE INDEX IF NOT EXISTS idx_payroll_history_payday 
          ON payroll_history(payday);
        `).catch(() => {}); // Ignore if index already exists
        
        // Calculate summary totals
        const summary = output.reduce((acc, row) => {
          const empId = row.employeeId;
          if (!acc[empId]) {
            acc[empId] = {
              employeeId: empId,
              employeeName: row.employeeName,
              department: row.department,
              totalHours: 0,
              totalAmount: 0
            };
          }
          acc[empId].totalHours += row.hours;
          acc[empId].totalAmount += row.hours * row.rate;
          return acc;
        }, {});
        
        const summaryArray = Object.values(summary);
        const grandTotal = summaryArray.reduce((sum, emp) => sum + emp.totalAmount, 0);
        
        // Save to production database
        const result = await pool.query(`
          INSERT INTO payroll_history (
            pay_period_start, pay_period_end, payroll_deadline, payday,
            csv_data, summary_data, employee_rates, created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [
          payPeriodStart,
          payPeriodEnd,
          payrollDeadline,
          payday,
          csvOutput,
          JSON.stringify({ summary: summaryArray, grandTotal }),
          JSON.stringify(employeeRates),
          req.user?.id || null
        ]);
        
        logger.info(`✅ Payroll history saved to database (ID: ${result.rows[0].id})`);
      } catch (historyError) {
        logger.error({ data: historyError }, '❌ Error saving to payroll history:');
        logger.error({ data: historyError.stack }, 'Stack:');
        // Don't fail the request if history save fails, but log it
      }
    }
    
    // Format today's date as YYYYMMDD for filename
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="hourly_w2_payroll_import_${dateStr}.csv"`);
    res.send(csvOutput);
    
  } catch (error) {
    logger.error({ err: error }, 'Error processing payroll file:');
    res.status(500).json({ 
      error: 'Failed to process payroll file', 
      details: error.message 
    });
  }
}));

module.exports = router;

