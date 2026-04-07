/**
 * PDF Generation Service
 * Generates branded PDF documents for invoices, credit requests, and payment orders using Puppeteer
 */

const { logger } = require('../utils/logger');
const { getInvoiceTemplate, getCreditRequestTemplate, getPaymentOrderTemplate } = require('../utils/pdf-templates');

let puppeteerCore;
let chromium;
try {
  puppeteerCore = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  logger.warn({ data: e.message }, 'Puppeteer/Chromium not available for PDF generation:');
}

class PDFGenerationService {
  constructor(pool, puppeteer) {
    this.pool = pool;
    // Use injected puppeteer or fall back to puppeteer-core
    this.puppeteer = puppeteer || puppeteerCore;
    this.browser = null;
  }

  /**
   * Initialize browser instance (reuse for performance)
   */
  async getBrowser() {
    if (!this.puppeteer || !chromium) {
      throw new Error('Puppeteer/Chromium is not initialized. Please ensure puppeteer and chromium are available.');
    }

    if (!this.browser) {
      try {
        this.browser = await this.puppeteer.launch({
          headless: chromium.headless,
          executablePath: await chromium.executablePath(),
          args: chromium.args
        });
      } catch (error) {
        logger.error({
          msg: 'Failed to launch Puppeteer browser',
          error: error.message,
          stack: error.stack
        });
        throw new Error(`Failed to initialize PDF browser: ${error.message}`);
      }
    }
    return this.browser;
  }

  /**
   * Generate invoice PDF
   * @param {number} invoiceId - Invoice ID
   * @param {Object} poolOverride - Optional pool override (for location-aware queries)
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateInvoicePDF(invoiceId, poolOverride = null) {
    const poolToUse = poolOverride || this.pool;
    const client = await poolToUse.connect();
    try {
      // Fetch invoice data
      const { rows: invoiceRows } = await client.query(
        `SELECT 
          i.*,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email,
          c.street as client_street,
          c.town as client_town,
          c.state as client_state,
          c.postcode as client_postcode,
          c.country as client_country
        FROM invoices i
        LEFT JOIN clients c ON i.client_id::text = c.client_id::text
        WHERE i.id = $1`,
        [invoiceId]
      );

      if (invoiceRows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const invoice = invoiceRows[0];

      // Fetch invoice items
      let items = [];
      try {
        const { rows: itemsRows } = await client.query(
          `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY item_date ASC`,
          [invoiceId]
        );
        items = itemsRows;
      } catch (itemsError) {
        logger.warn({
          msg: 'Error fetching invoice items for PDF',
          invoiceId,
          error: itemsError.message
        });
        items = []; // Continue with empty items array
      }

      // Generate invoice number if missing
      if (!invoice.invoice_number) {
        const invoiceNumber = invoice.display_id || `INV-${invoice.id}`;
        try {
          await client.query(
            `UPDATE invoices SET invoice_number = $1 WHERE id = $2`,
            [invoiceNumber, invoiceId]
          );
        } catch (updateError) {
          // Log but don't fail if update fails (might be read-only or column doesn't exist)
          logger.warn({
            msg: 'Could not update invoice_number',
            invoiceId,
            error: updateError.message
          });
        }
        invoice.invoice_number = invoiceNumber;
      }

      // Generate HTML template
      const html = getInvoiceTemplate(invoice, items);

      // Generate PDF
      const pdf = await this.generatePDFFromHTML(html);

      logger.info({
        msg: 'Invoice PDF generated',
        invoiceId,
        invoiceNumber: invoice.invoice_number
      });

      return pdf;
    } catch (error) {
      logger.error({
        msg: 'Error generating invoice PDF',
        invoiceId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate credit request PDF
   * @param {number} creditRequestId - Credit request ID
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateCreditRequestPDF(creditRequestId) {
    const client = await this.pool.connect();
    try {
      // Fetch credit request data
      const { rows: crRows } = await client.query(
        `SELECT 
          cr.*,
          c.first_name as client_first_name,
          c.last_name as client_last_name,
          c.email as client_email,
          c.street as client_street,
          c.town as client_town,
          c.state as client_state,
          c.postcode as client_postcode,
          c.country as client_country
        FROM credit_requests cr
        LEFT JOIN clients c ON cr.client_id::text = c.client_id::text
        WHERE cr.id = $1`,
        [creditRequestId]
      );

      if (crRows.length === 0) {
        throw new Error(`Credit request ${creditRequestId} not found`);
      }

      const creditRequest = crRows[0];

      // Fetch credit request items
      const { rows: items } = await client.query(
        `SELECT * FROM credit_request_items WHERE credit_request_id = $1 ORDER BY created_at ASC`,
        [creditRequestId]
      );

      // Generate credit request number if missing
      if (!creditRequest.credit_request_number) {
        const creditRequestNumber = `PFI-${creditRequest.id}`;
        await client.query(
          `UPDATE credit_requests SET credit_request_number = $1 WHERE id = $2`,
          [creditRequestNumber, creditRequestId]
        );
        creditRequest.credit_request_number = creditRequestNumber;
      }

      // Generate HTML template
      const html = getCreditRequestTemplate(creditRequest, items);

      // Generate PDF
      const pdf = await this.generatePDFFromHTML(html);

      logger.info({
        msg: 'Credit request PDF generated',
        creditRequestId,
        creditRequestNumber: creditRequest.credit_request_number
      });

      return pdf;
    } catch (error) {
      logger.error({
        msg: 'Error generating credit request PDF',
        creditRequestId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate payment order PDF
   * @param {number} paymentOrderId - Payment order ID
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePaymentOrderPDF(paymentOrderId) {
    const client = await this.pool.connect();
    try {
      // Fetch payment order data
      const { rows: poRows } = await client.query(
        `SELECT * FROM payment_orders WHERE id = $1`,
        [paymentOrderId]
      );

      if (poRows.length === 0) {
        throw new Error(`Payment order ${paymentOrderId} not found`);
      }

      const paymentOrder = poRows[0];

      // Fetch payment order items
      const { rows: items } = await client.query(
        `SELECT * FROM payment_order_items WHERE payment_order_id = $1 ORDER BY item_date ASC`,
        [paymentOrderId]
      );

      // Generate payment order number if missing
      if (!paymentOrder.payment_order_number) {
        const paymentOrderNumber = `PO-${paymentOrder.id}`;
        await client.query(
          `UPDATE payment_orders SET payment_order_number = $1 WHERE id = $2`,
          [paymentOrderNumber, paymentOrderId]
        );
        paymentOrder.payment_order_number = paymentOrderNumber;
      }

      // Generate HTML template
      const html = getPaymentOrderTemplate(paymentOrder, items);

      // Generate PDF
      const pdf = await this.generatePDFFromHTML(html);

      logger.info({
        msg: 'Payment order PDF generated',
        paymentOrderId,
        paymentOrderNumber: paymentOrder.payment_order_number
      });

      return pdf;
    } catch (error) {
      logger.error({
        msg: 'Error generating payment order PDF',
        paymentOrderId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Generate PDF from HTML string
   * @param {string} html - HTML content
   * @param {Object} options - PDF options
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generatePDFFromHTML(html, options = {}) {
    let browser;
    let page;
    
    try {
      browser = await this.getBrowser();
      page = await browser.newPage();

      // Intercept failed image requests to prevent PDF corruption
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const resourceType = request.resourceType();
        const url = request.url();
        
        // Allow all requests except failed images
        if (resourceType === 'image' && (!url || url.startsWith('data:'))) {
          request.abort();
        } else {
          request.continue();
        }
      });

      // Handle failed image loads gracefully
      page.on('requestfailed', (request) => {
        if (request.resourceType() === 'image') {
          logger.warn({
            msg: 'Image failed to load in PDF',
            url: request.url()
          });
        }
      });

      // Set content with error handling - use 'load' instead of 'networkidle0' for more reliable rendering
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 30000
      });

      // Wait a bit for any async content to load (waitForTimeout was deprecated)
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate PDF with explicit settings - optimized for single page
      const pdf = await page.pdf({
        format: 'Letter',
        printBackground: true,
        preferCSSPageSize: true, // Use CSS page size from @page rule
        margin: {
          top: '0.4in',
          right: '0.4in',
          bottom: '0.4in',
          left: '0.4in'
        },
        ...options
      });

      // Validate PDF buffer
      if (!pdf || pdf.length === 0) {
        throw new Error('Generated PDF is empty');
      }

      // Check if PDF starts with valid PDF header (%PDF)
      const pdfHeader = pdf.slice(0, 4).toString();
      if (pdfHeader !== '%PDF') {
        logger.error({
          msg: 'Invalid PDF header',
          header: pdfHeader,
          firstBytes: pdf.slice(0, 100).toString('hex')
        });
        throw new Error('Generated PDF has invalid header - PDF may be corrupted');
      }

      logger.info({
        msg: 'PDF generated successfully',
        size: pdf.length,
        header: pdfHeader
      });

      return pdf;
    } catch (error) {
      logger.error({
        msg: 'Error generating PDF from HTML',
        error: error.message,
        stack: error.stack
      });
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (closeError) {
          logger.warn({ msg: 'Error closing PDF page', error: closeError.message });
        }
      }
    }
  }

  /**
   * Close browser instance (call on shutdown)
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = PDFGenerationService;
