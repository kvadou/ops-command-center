/**
 * Accounting Email Service
 * Sends invoices, credit requests, and payment orders via Brevo with PDF attachments
 */

const { logger } = require('../utils/logger');
const { getInstance: getBrevoEmailSender } = require('../utils/brevo-email-sender');
const PDFGenerationService = require('./pdf-generation-service');

class AccountingEmailService {
  constructor(pool, puppeteer) {
    this.pool = pool;
    this.pdfService = new PDFGenerationService(pool, puppeteer);
    this.brevoSender = getBrevoEmailSender();
  }

  /**
   * Send invoice email with PDF attachment
   * @param {number} invoiceId - Invoice ID
   * @param {string} recipientEmail - Recipient email address (optional, defaults to client email)
   * @returns {Promise<Object>} Email sending result
   */
  async sendInvoiceEmail(invoiceId, recipientEmail = null) {
    const client = await this.pool.connect();
    try {
      // Fetch invoice data
      const { rows: invoiceRows } = await client.query(
        `SELECT 
          i.*,
          c.email as client_email,
          c.first_name as client_first_name,
          c.last_name as client_last_name
        FROM invoices i
        LEFT JOIN clients c ON i.client_id::text = c.client_id::text
        WHERE i.id = $1`,
        [invoiceId]
      );

      if (invoiceRows.length === 0) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const invoice = invoiceRows[0];
      const emailTo = recipientEmail || invoice.client_email || invoice.email_sent_to;

      if (!emailTo) {
        throw new Error(`No email address found for invoice ${invoiceId}`);
      }

      // Generate PDF
      const pdfBuffer = await this.pdfService.generateInvoicePDF(invoiceId);
      const invoiceNumber = invoice.invoice_number || `INV-${invoice.id}`;

      // Create email HTML
      const emailHtml = this.getInvoiceEmailTemplate(invoice, invoiceNumber);

      // Send email via Brevo API with attachment
      const emailResult = await this.sendEmailWithAttachment({
        to: emailTo,
        subject: `Invoice ${invoiceNumber} from Acme Operations`,
        html: emailHtml,
        text: this.stripHtml(emailHtml),
        attachments: [
          {
            name: `Invoice_${invoiceNumber}.pdf`,
            content: pdfBuffer.toString('base64'),
            encoding: 'base64'
          }
        ],
        tags: ['accounting', 'invoice']
      });

      if (emailResult.success) {
        // Update invoice with email tracking
        await client.query(
          `UPDATE invoices 
           SET email_sent_at = NOW(), 
               email_sent_to = $1
           WHERE id = $2`,
          [emailTo, invoiceId]
        );

        logger.info({
          msg: 'Invoice email sent',
          invoiceId,
          invoiceNumber,
          recipientEmail: emailTo,
          messageId: emailResult.messageId
        });
      }

      return emailResult;
    } catch (error) {
      logger.error({
        msg: 'Error sending invoice email',
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
   * Send credit request email with PDF attachment
   * @param {number} creditRequestId - Credit request ID
   * @param {string} recipientEmail - Recipient email address (optional, defaults to client email)
   * @param {boolean} forceSend - Force send even if feature flag is disabled (for testing)
   * @returns {Promise<Object>} Email sending result
   */
  async sendCreditRequestEmail(creditRequestId, recipientEmail = null, forceSend = false) {
    // Check feature flag unless forceSend is true
    if (!forceSend && !this.isStandaloneAccountingEnabled()) {
      logger.warn({
        msg: 'Standalone accounting email sending is disabled',
        creditRequestId,
        reason: 'STANDALONE_ACCOUNTING_ENABLED is not set to true'
      });
      throw new Error('Standalone accounting is not enabled. Set STANDALONE_ACCOUNTING_ENABLED=true to enable email sending.');
    }

    const client = await this.pool.connect();
    try {
      // Fetch credit request data
      const { rows: crRows } = await client.query(
        `SELECT 
          cr.*,
          c.email as client_email,
          c.first_name as client_first_name,
          c.last_name as client_last_name
        FROM credit_requests cr
        LEFT JOIN clients c ON cr.client_id::text = c.client_id::text
        WHERE cr.id = $1`,
        [creditRequestId]
      );

      if (crRows.length === 0) {
        throw new Error(`Credit request ${creditRequestId} not found`);
      }

      const creditRequest = crRows[0];
      const emailTo = recipientEmail || creditRequest.client_email || creditRequest.email_sent_to;

      if (!emailTo) {
        throw new Error(`No email address found for credit request ${creditRequestId}`);
      }

      // Generate PDF
      const pdfBuffer = await this.pdfService.generateCreditRequestPDF(creditRequestId);
      const creditRequestNumber = creditRequest.credit_request_number || `PFI-${creditRequest.id}`;

      // Create email HTML
      const emailHtml = this.getCreditRequestEmailTemplate(creditRequest, creditRequestNumber);

      // Send email via Brevo API with attachment
      const emailResult = await this.sendEmailWithAttachment({
        to: emailTo,
        subject: `Credit Request ${creditRequestNumber} from Acme Operations`,
        html: emailHtml,
        text: this.stripHtml(emailHtml),
        attachments: [
          {
            name: `CreditRequest_${creditRequestNumber}.pdf`,
            content: pdfBuffer.toString('base64'),
            encoding: 'base64'
          }
        ],
        tags: ['accounting', 'credit-request']
      });

      if (emailResult.success) {
        // Update credit request with email tracking
        await client.query(
          `UPDATE credit_requests 
           SET email_sent_at = NOW(), 
               email_sent_to = $1
           WHERE id = $2`,
          [emailTo, creditRequestId]
        );

        logger.info({
          msg: 'Credit request email sent',
          creditRequestId,
          creditRequestNumber,
          recipientEmail: emailTo,
          messageId: emailResult.messageId
        });
      }

      return emailResult;
    } catch (error) {
      logger.error({
        msg: 'Error sending credit request email',
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
   * Send payment order email with PDF attachment
   * @param {number} paymentOrderId - Payment order ID
   * @param {string} recipientEmail - Recipient email address (optional, defaults to tutor email)
   * @returns {Promise<Object>} Email sending result
   */
  async sendPaymentOrderEmail(paymentOrderId, recipientEmail = null) {
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
      const emailTo = recipientEmail || paymentOrder.payee_email || paymentOrder.email_sent_to;

      if (!emailTo) {
        throw new Error(`No email address found for payment order ${paymentOrderId}`);
      }

      // Generate PDF
      const pdfBuffer = await this.pdfService.generatePaymentOrderPDF(paymentOrderId);
      const paymentOrderNumber = paymentOrder.payment_order_number || `PO-${paymentOrder.id}`;

      // Create email HTML
      const emailHtml = this.getPaymentOrderEmailTemplate(paymentOrder, paymentOrderNumber);

      // Send email via Brevo API with attachment
      const emailResult = await this.sendEmailWithAttachment({
        to: emailTo,
        subject: `Payment Order ${paymentOrderNumber} from Acme Operations`,
        html: emailHtml,
        text: this.stripHtml(emailHtml),
        attachments: [
          {
            name: `PaymentOrder_${paymentOrderNumber}.pdf`,
            content: pdfBuffer.toString('base64'),
            encoding: 'base64'
          }
        ],
        tags: ['accounting', 'payment-order']
      });

      if (emailResult.success) {
        // Update payment order with email tracking
        await client.query(
          `UPDATE payment_orders 
           SET email_sent_at = NOW(), 
               email_sent_to = $1
           WHERE id = $2`,
          [emailTo, paymentOrderId]
        );

        logger.info({
          msg: 'Payment order email sent',
          paymentOrderId,
          paymentOrderNumber,
          recipientEmail: emailTo,
          messageId: emailResult.messageId
        });
      }

      return emailResult;
    } catch (error) {
      logger.error({
        msg: 'Error sending payment order email',
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
   * Send email with attachment via Brevo API
   * @param {Object} emailData - Email data with attachments
   * @returns {Promise<Object>} Email sending result
   */
  async sendEmailWithAttachment(emailData) {
    if (!this.brevoSender) {
      throw new Error('Brevo email sender not initialized. BREVO_API_KEY is required.');
    }

    const axios = require('axios');

    try {
      const { to, subject, html, text, attachments = [], tags = [] } = emailData;

      // Brevo API supports attachments as base64 in JSON payload
      const payload = {
        sender: {
          name: 'Acme Operations',
          email: 'support@acmeops.com'
        },
        to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
        subject: subject,
        htmlContent: html,
        textContent: text || this.stripHtml(html),
        tags: tags,
        attachment: attachments.map(att => ({
          name: att.name,
          content: att.content
        }))
      };

      const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        messageId: response.data.messageId,
        data: response.data
      };
    } catch (error) {
      logger.error({
        msg: 'Error sending email with attachment via Brevo',
        error: error.response?.data || error.message,
        stack: error.stack
      });
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get invoice email template HTML
   */
  getInvoiceEmailTemplate(invoice, invoiceNumber) {
    const clientName = `${invoice.client_first_name || ''} ${invoice.client_last_name || ''}`.trim();
    const amount = parseFloat(invoice.gross) || 0;
    const paymentUrl = `${process.env.APP_URL || 'https://analytics.chessat3.com'}/accounting/invoices/${invoice.id}/pay`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6A469D;
    }
    .logo {
      max-width: 150px;
      height: auto;
      margin-bottom: 10px;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 5px;
    }
    .content {
      margin-bottom: 30px;
    }
    .button {
      display: inline-block;
      padding: 12px 24px;
      background-color: #6A469D;
      color: white;
      text-decoration: none;
      border-radius: 5px;
      font-weight: bold;
      margin: 20px 0;
    }
    .button:hover {
      background-color: #2D2F8E;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">Acme Operations</div>
  </div>
  
  <div class="content">
    <p>Dear ${clientName},</p>
    
    <p>Please find attached your invoice <strong>${invoiceNumber}</strong> for the amount of <strong>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}</strong>.</p>
    
    ${invoice.status === 'pending' || invoice.status === 'unpaid' ? `
    <p style="text-align: center;">
      <a href="${paymentUrl}" class="button">Pay Invoice Online</a>
    </p>
    
    <p>You can also pay by quoting reference <strong>${invoiceNumber}</strong> when making your payment.</p>
    ` : ''}
    
    <p>If you have any questions about this invoice, please contact us at support@acmeops.com.</p>
    
    <p>Thank you for your business!</p>
    
    <p>Best regards,<br>Acme Operations</p>
  </div>
  
  <div class="footer">
    <p>Acme Operations<br>254 7th Ave, Brooklyn, NY 11215<br>support@acmeops.com</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Get credit request email template HTML
   */
  getCreditRequestEmailTemplate(creditRequest, creditRequestNumber) {
    const clientName = `${creditRequest.client_first_name || ''} ${creditRequest.client_last_name || ''}`.trim();
    const amount = parseFloat(creditRequest.amount) || 0;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6A469D;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 5px;
    }
    .content {
      margin-bottom: 30px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">Acme Operations</div>
  </div>
  
  <div class="content">
    <p>Dear ${clientName},</p>
    
    <p>Please find attached your credit request <strong>${creditRequestNumber}</strong> for the amount of <strong>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}</strong>.</p>
    
    ${creditRequest.description || creditRequest.reason ? `
    <p><strong>Reason:</strong> ${creditRequest.description || creditRequest.reason}</p>
    ` : ''}
    
    <p>This credit will be applied to your account balance. If you have any questions, please contact us at support@acmeops.com.</p>
    
    <p>Best regards,<br>Acme Operations</p>
  </div>
  
  <div class="footer">
    <p>Acme Operations<br>254 7th Ave, Brooklyn, NY 11215<br>support@acmeops.com</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Get payment order email template HTML
   */
  getPaymentOrderEmailTemplate(paymentOrder, paymentOrderNumber) {
    const tutorName = `${paymentOrder.payee_first || ''} ${paymentOrder.payee_last || ''}`.trim();
    const amount = parseFloat(paymentOrder.total_to_pay_tutor || paymentOrder.amount) || 0;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6A469D;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 5px;
    }
    .content {
      margin-bottom: 30px;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">Acme Operations</div>
  </div>
  
  <div class="content">
    <p>Dear ${tutorName},</p>
    
    <p>Please find attached your payment order <strong>${paymentOrderNumber}</strong> for the amount of <strong>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)}</strong>.</p>
    
    <p>Payment will be processed according to your payment method on file. If you have any questions, please contact us at support@acmeops.com.</p>
    
    <p>Thank you for your service!</p>
    
    <p>Best regards,<br>Acme Operations</p>
  </div>
  
  <div class="footer">
    <p>Acme Operations<br>254 7th Ave, Brooklyn, NY 11215<br>support@acmeops.com</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Strip HTML tags to create plain text version
   */
  stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = AccountingEmailService;