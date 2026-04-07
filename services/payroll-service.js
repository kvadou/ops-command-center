const csv = require('csv-parser');
const { Readable } = require('stream');
const { logger } = require('../utils/logger');

/**
 * PayrollService - Handles payroll CSV parsing and normalization
 * Supports Engage PEO and Justworks formats
 */
class PayrollService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Parse Engage PEO CSV format
   * Expected columns may vary - this is a flexible parser
   */
  async parseEngagePEOCSV(csvContent) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(csvContent);

      stream
        .pipe(csv())
        .on('data', (row) => {
          // Try to identify date column (common names: Pay Period, Period, Date)
          let dateColumn = null;
          for (const key of Object.keys(row)) {
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes('period') || lowerKey.includes('date')) {
              dateColumn = key;
              break;
            }
          }

          // Try to identify amount columns
          let grossWages = 0;
          let employerTaxes = 0;
          let benefits = 0;

          for (const [key, value] of Object.entries(row)) {
            const lowerKey = key.toLowerCase();
            const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;

            if (lowerKey.includes('gross') || lowerKey.includes('wage')) {
              grossWages += numValue;
            } else if (lowerKey.includes('tax') && (lowerKey.includes('employer') || lowerKey.includes('company'))) {
              employerTaxes += numValue;
            } else if (lowerKey.includes('benefit')) {
              benefits += numValue;
            }
          }

          if (dateColumn && row[dateColumn]) {
            results.push({
              pay_period_date: this.parseDate(row[dateColumn]),
              gross_wages: grossWages,
              employer_taxes: employerTaxes,
              benefits: benefits,
              total_payroll_cost: grossWages + employerTaxes + benefits,
              raw_row: row
            });
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /**
   * Parse Justworks CSV format
   */
  async parseJustworksCSV(csvContent) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from(csvContent);

      stream
        .pipe(csv())
        .on('data', (row) => {
          // Justworks typically has: Pay Period End Date, Gross Pay, Employer Taxes, Benefits
          const payPeriodDate = row['Pay Period End Date'] || row['Pay Period End'] || row['Date'];
          const grossWages = parseFloat(String(row['Gross Pay'] || row['Gross Wages'] || 0).replace(/[^0-9.-]/g, '')) || 0;
          const employerTaxes = parseFloat(String(row['Employer Taxes'] || row['Company Taxes'] || 0).replace(/[^0-9.-]/g, '')) || 0;
          const benefits = parseFloat(String(row['Benefits'] || row['Company Benefits'] || 0).replace(/[^0-9.-]/g, '')) || 0;

          if (payPeriodDate) {
            results.push({
              pay_period_date: this.parseDate(payPeriodDate),
              gross_wages: grossWages,
              employer_taxes: employerTaxes,
              benefits: benefits,
              total_payroll_cost: grossWages + employerTaxes + benefits,
              raw_row: row
            });
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  /**
   * Parse date string to Date object
   */
  parseDate(dateStr) {
    if (!dateStr) return null;
    
    // Try common formats
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    // Try MM/DD/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(`${parts[2]}-${parts[0]}-${parts[1]}`).toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Upload and normalize payroll CSV
   */
  async uploadPayroll(file, providerId, uploadedBy) {
    try {
      // Read file content
      const csvContent = file.buffer.toString('utf-8');

      // Get provider name to determine parser
      const providerResult = await this.pool.query(
        'SELECT name FROM payroll_providers WHERE id = $1',
        [providerId]
      );

      if (providerResult.rows.length === 0) {
        throw new Error('Payroll provider not found');
      }

      const providerName = providerResult.rows[0].name;
      let parsedData;

      // Parse based on provider
      if (providerName === 'Engage PEO') {
        parsedData = await this.parseEngagePEOCSV(csvContent);
      } else if (providerName === 'Justworks') {
        parsedData = await this.parseJustworksCSV(csvContent);
      } else {
        throw new Error(`Unknown payroll provider: ${providerName}`);
      }

      if (parsedData.length === 0) {
        throw new Error('No valid payroll data found in CSV');
      }

      // Find pay period range
      const dates = parsedData.map(p => p.pay_period_date).filter(Boolean).sort();
      const payPeriodStart = dates[0];
      const payPeriodEnd = dates[dates.length - 1];

      // Insert upload record
      const uploadResult = await this.pool.query(
        `INSERT INTO payroll_uploads (provider_id, uploaded_by, file_name, pay_period_start, pay_period_end, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          providerId,
          uploadedBy,
          file.originalname,
          payPeriodStart,
          payPeriodEnd,
          JSON.stringify(parsedData.map(p => p.raw_row))
        ]
      );

      const uploadId = uploadResult.rows[0].id;

      // Insert normalized payroll periods (batch insert)
      const validPeriods = parsedData.filter(p => p.pay_period_date);
      let inserted = 0;

      if (validPeriods.length > 0) {
        const values = [];
        const params = [];
        const NUM_COLUMNS = 7;

        validPeriods.forEach((period, i) => {
          const offset = i * NUM_COLUMNS;
          values.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7})`);
          params.push(
            uploadId,
            providerId,
            period.pay_period_date,
            period.gross_wages,
            period.employer_taxes,
            period.benefits,
            period.total_payroll_cost
          );
        });

        await this.pool.query(
          `INSERT INTO payroll_periods (
            upload_id, provider_id, pay_period_date, gross_wages,
            employer_taxes, benefits, total_payroll_cost
          ) VALUES ${values.join(', ')}
          ON CONFLICT (provider_id, pay_period_date) DO UPDATE SET
            upload_id = EXCLUDED.upload_id,
            gross_wages = EXCLUDED.gross_wages,
            employer_taxes = EXCLUDED.employer_taxes,
            benefits = EXCLUDED.benefits,
            total_payroll_cost = EXCLUDED.total_payroll_cost`,
          params
        );
        inserted = validPeriods.length;
      }

      logger.info(`Payroll upload: ${inserted} periods inserted for provider ${providerId}`);
      return { uploadId, periodsInserted: inserted };
    } catch (error) {
      logger.error('Error uploading payroll:', error);
      throw error;
    }
  }

  /**
   * Get monthly payroll aggregates
   */
  async getMonthlyPayroll(startDate, endDate) {
    try {
      // Refresh materialized view
      await this.pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY payroll_monthly_aggregates');

      const result = await this.pool.query(
        `SELECT 
            pma.month,
            pma.provider_id,
            pp.name AS provider_name,
            pma.total_gross_wages,
            pma.total_employer_taxes,
            pma.total_benefits,
            pma.total_payroll_cost,
            pma.period_count
         FROM payroll_monthly_aggregates pma
         JOIN payroll_providers pp ON pma.provider_id = pp.id
         WHERE pma.month >= $1 AND pma.month <= $2
         ORDER BY pma.month DESC, pp.name`,
        [startDate, endDate]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error getting monthly payroll:', error);
      throw error;
    }
  }
}

module.exports = PayrollService;
