/**
 * PDFKit Generation Service
 * Fast, reliable PDF generation using PDFKit (no browser dependencies)
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');
const { DateTime } = require('luxon');

// Company information
const COMPANY_INFO = {
  name: 'Acme Operations',
  address: '254 7th Ave',
  city: 'Brooklyn',
  state: 'NY',
  zip: '11215',
  country: 'United States',
  phone: '(212) 796-2737',
  email: 'support@acmeops.com',
  website: 'https://acmeops.com/',
};

class PDFKitGenerationService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Format currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }

  /**
   * Format date
   */
  formatDate(date, format = 'MM/dd/yyyy') {
    if (!date) return '';
    const dt = DateTime.fromJSDate(new Date(date));
    return dt.toFormat(format);
  }

  /**
   * Format date for invoice display (e.g., "Dec 10, 2025 — 3:45 PM")
   */
  formatInvoiceDate(date) {
    if (!date) return '';
    const dt = DateTime.fromJSDate(new Date(date));
    const dateStr = dt.toFormat('LLL d, yyyy');
    const timeStr = dt.toFormat('h:mm a');
    return `${dateStr} — ${timeStr}`;
  }

  /**
   * Generate invoice PDF using PDFKit
   * @param {number} invoiceId - Invoice ID
   * @param {Object} poolOverride - Optional pool override
   * @returns {Promise<Buffer>} PDF buffer
   */
  async generateInvoicePDF(invoiceId, poolOverride = null) {
    const poolToUse = poolOverride || this.pool;
    const client = await poolToUse.connect();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Fetch invoice data with all required fields
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
          client.release();
          return reject(new Error(`Invoice ${invoiceId} not found`));
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
          items = [];
        }

        // Generate invoice number if missing
        const invoiceNumber = invoice.invoice_number || invoice.display_id || `INV-${invoice.id}`;

        // Load logo if available
        let logoPath = null;
        const possibleLogoPaths = [
          path.join(__dirname, '../public/logo192.png'),
          path.join(__dirname, '../public/logo512.png'),
          path.join(process.cwd(), 'public/logo192.png'),
          path.join(process.cwd(), 'public/logo512.png'),
        ];
        
        for (const logo of possibleLogoPaths) {
          try {
            if (fs.existsSync(logo)) {
              logoPath = logo;
              logger.info({ msg: 'Logo found for PDF', path: logo });
              break;
            }
          } catch (e) {
            // Continue checking other paths
          }
        }
        
        if (!logoPath) {
          logger.warn({ msg: 'Logo not found for PDF generation', checkedPaths: possibleLogoPaths });
        }

        // Create PDF document with optimized margins
        // Letter size: 8.5" x 11" = 612pt x 792pt
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 40, bottom: 40, left: 50, right: 50 }
        });
        
        // Page dimensions
        const pageWidth = 612;
        const pageHeight = 792;
        const leftMargin = 50;
        const rightMargin = 50;
        const topMargin = 40;
        const bottomMargin = 40;
        const usableWidth = pageWidth - leftMargin - rightMargin; // 512pt
        const usableHeight = pageHeight - topMargin - bottomMargin; // 712pt

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          client.release();
          const pdfBuffer = Buffer.concat(chunks);
          logger.info({
            msg: 'Invoice PDF generated with PDFKit',
            invoiceId,
            invoiceNumber,
            size: pdfBuffer.length
          });
          resolve(pdfBuffer);
        });
        doc.on('error', (error) => {
          client.release();
          reject(error);
        });

        // Track current Y position manually (PDFKit doesn't expose doc.y reliably)
        let currentPageY = topMargin;
        
        // Helper function to check if we need a new page
        const checkPageBreak = (requiredHeight) => {
          if (currentPageY + requiredHeight > pageHeight - bottomMargin) {
            doc.addPage();
            currentPageY = topMargin;
            return currentPageY;
          }
          return currentPageY;
        };
        
        // Helper function to move Y position
        const moveY = (offset) => {
          currentPageY += offset;
          return currentPageY;
        };
        
        // Helper function to set Y position
        const setY = (y) => {
          currentPageY = y;
          return currentPageY;
        };

        // Helper function to draw header on new page
        const drawPageHeader = (yPos) => {
          // Company info header (right-aligned, matching refined styling)
          const companyInfoWidth = 150;
          const companyInfoX = pageWidth - rightMargin - companyInfoWidth;
          doc.fontSize(13)
            .fillColor('#6A469D')
            .font('Helvetica-Bold')
            .text(COMPANY_INFO.name, companyInfoX, yPos, { align: 'right', width: companyInfoWidth, lineGap: 2 })
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor('#6B7280') // Lighter gray
            .text(COMPANY_INFO.address, companyInfoX, yPos + 13, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(`${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}`, companyInfoX, yPos + 22, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.email, companyInfoX, yPos + 30, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.phone, companyInfoX, yPos + 38, { align: 'right', width: companyInfoWidth });
          return yPos + 50;
        };

        // Start first page
        let yPos = topMargin;
        currentPageY = topMargin;
        
        // Header section - Logo and Company Info
        if (logoPath) {
          try {
            doc.image(logoPath, leftMargin, yPos, { 
              width: 70, 
              height: 70, 
              fit: [70, 70]
            });
          } catch (logoError) {
            logger.warn({ 
              msg: 'Could not load logo for PDF', 
              path: logoPath, 
              error: logoError.message
            });
          }
        }

        // Company info (right-aligned, improved line height and lighter gray)
        const companyInfoWidth = 150;
        const companyInfoX = pageWidth - rightMargin - companyInfoWidth;
        doc.fontSize(13)
          .fillColor('#6A469D')
          .font('Helvetica-Bold')
          .text(COMPANY_INFO.name, companyInfoX, yPos, { align: 'right', width: companyInfoWidth, lineGap: 2 })
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor('#6B7280') // Lighter gray for secondary text
          .text(COMPANY_INFO.address, companyInfoX, yPos + 13, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
          .text(`${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}`, companyInfoX, yPos + 22, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
          .text(COMPANY_INFO.country, companyInfoX, yPos + 30, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
          .text(COMPANY_INFO.phone, companyInfoX, yPos + 38, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
          .text(COMPANY_INFO.email, companyInfoX, yPos + 46, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
          .text(COMPANY_INFO.website, companyInfoX, yPos + 54, { align: 'right', width: companyInfoWidth });

        // Invoice title section - tighter spacing
        yPos = Math.max(yPos + 75, topMargin + 75);
        currentPageY = yPos;
        yPos = checkPageBreak(110);
        currentPageY = yPos;

        // Large Invoice title
        yPos += 6; // Reduced space above
        doc.fontSize(32) // Slightly reduced from 34
          .fillColor('#6A469D')
          .font('Helvetica-Bold')
          .text('INVOICE', leftMargin, yPos);
        
        // Thin divider line under title
        yPos += 35; // Reduced spacing below title
        doc.moveTo(leftMargin, yPos)
          .lineTo(leftMargin + 200, yPos)
          .strokeColor('#E5E7EB')
          .lineWidth(0.5)
          .stroke();
        
        yPos += 15; // Tighter spacing to cards

        // Invoice Details Card (left side) - improved styling
        const invoiceDate = this.formatDate(invoice.date_created || invoice.date_sent);
        const dateSent = invoice.date_sent ? this.formatDate(invoice.date_sent) : null;
        const status = invoice.status ? invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) : null;
        
        const cardHeight = 70; // Slightly reduced from 75
        const cardPadding = 12;
        
        // Draw subtle background card for invoice details (softer background)
        doc.rect(leftMargin, yPos, 240, cardHeight)
          .fill('#F5F7FB') // Softer slate-50 equivalent
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280') // text-gray-500
          .font('Helvetica')
          .text('INVOICE DETAILS', leftMargin + cardPadding, yPos + cardPadding);
        
        // Values: medium weight
        let detailY = yPos + cardPadding + 11; // Slightly reduced
        doc.fontSize(8.5)
          .fillColor('#1F2937') // text-gray-800
          .font('Helvetica')
          .text(`Invoice Number: ${invoiceNumber}`, leftMargin + cardPadding, detailY)
          .text(`Date Created: ${invoiceDate}`, leftMargin + cardPadding, detailY + 12); // Slightly reduced
        
        detailY += 24; // Slightly reduced
        if (dateSent) {
          doc.text(`Date Sent: ${dateSent}`, leftMargin + cardPadding, detailY);
          detailY += 12; // Slightly reduced
        }
        if (status) {
          doc.font('Helvetica-Bold')
            .text(`Status: ${status}`, leftMargin + cardPadding, detailY);
        }

        // Bill To section (right side) - matching height and styling
        const clientName = `${invoice.client_first_name || ''} ${invoice.client_last_name || ''}`.trim();
        const clientAddressLines = [];
        if (invoice.client_street) clientAddressLines.push(invoice.client_street);
        if (invoice.client_town || invoice.client_state || invoice.client_postcode) {
          const cityStateZip = [
            invoice.client_town,
            invoice.client_state ? `${invoice.client_state} ${invoice.client_postcode || ''}`.trim() : invoice.client_postcode
          ].filter(Boolean).join(', ');
          if (cityStateZip) clientAddressLines.push(cityStateZip);
        }
        if (invoice.client_country) clientAddressLines.push(invoice.client_country);
        const clientAddress = clientAddressLines.join('\n');

        // Bill To card - align with right edge of table (flush right with table)
        const billToWidth = 200;
        const billToX = leftMargin + usableWidth - billToWidth; // Align with table right edge
        
        // Draw subtle background card for Bill To (matching height)
        doc.rect(billToX, yPos, billToWidth, cardHeight)
          .fill('#F5F7FB') // Softer slate-50 equivalent
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280') // text-gray-500
          .font('Helvetica')
          .text('BILL TO', billToX + cardPadding, yPos + cardPadding);
        
        // Client name: bold
        doc.fontSize(8.5)
          .fillColor('#1F2937') // text-gray-800
          .font('Helvetica-Bold')
          .text(clientName, billToX + cardPadding, yPos + cardPadding + 11, { width: billToWidth - (cardPadding * 2) });
        
        let clientTextY = yPos + cardPadding + 23; // Slightly reduced
        if (clientAddress) {
          doc.font('Helvetica')
            .text(clientAddress, billToX + cardPadding, clientTextY, { width: billToWidth - (cardPadding * 2), lineGap: 2 });
          clientTextY += (clientAddressLines.length * 10); // Slightly reduced
        }
        if (invoice.client_email) {
          doc.text(invoice.client_email, billToX + cardPadding, clientTextY, { width: billToWidth - (cardPadding * 2) });
        }

        // Line items table - ensure proper spacing to avoid overlap with cards
        // Cards are drawn at yPos with height cardHeight, so they end at yPos + cardHeight
        // Table should start after cards end with proper spacing
        const cardsEndY = yPos + cardHeight; // Cards end here
        yPos = cardsEndY + 18; // Start table 18pt after cards end
        currentPageY = yPos;
        yPos = checkPageBreak(200);
        currentPageY = yPos;

        const tableLeft = leftMargin;
        const tableWidth = usableWidth;
        const tableTop = yPos;

        // Column widths optimized for readability
        // Increase amount column width to prevent cutoff, reduce description slightly
        const colWidths = {
          date: 110, // Increased for better date formatting
          units: 60,
          amount: 115, // Increased from 100 to prevent "Amount" cutoff
          description: tableWidth - 110 - 60 - 115 - 36 // Remaining space minus gaps (3 gaps × 12pt = 36pt)
        };

        const colX = {
          date: tableLeft + 10,
          description: tableLeft + colWidths.date + 12,
          units: tableLeft + colWidths.date + 12 + colWidths.description + 12,
          amount: tableLeft + colWidths.date + 12 + colWidths.description + 12 + colWidths.units + 12
        };
        
        // Ensure amount column doesn't overflow - adjust if needed
        const amountRightEdge = colX.amount + colWidths.amount;
        if (amountRightEdge > tableLeft + tableWidth) {
          // Adjust description width to fit
          const overflow = amountRightEdge - (tableLeft + tableWidth);
          colWidths.description = Math.max(180, colWidths.description - overflow - 5);
          colX.description = tableLeft + colWidths.date + 12;
          colX.units = tableLeft + colWidths.date + 12 + colWidths.description + 12;
          colX.amount = tableLeft + colWidths.date + 12 + colWidths.description + 12 + colWidths.units + 12;
        }

        // Table header with purple background (improved)
        doc.fontSize(9)
          .fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .rect(tableLeft, tableTop, tableWidth, 24) // Slightly reduced from 26
          .fill('#6A469D')
          .fillColor('#FFFFFF')
          .text('Date', colX.date, tableTop + 7, { width: colWidths.date })
          .text('Description', colX.description, tableTop + 7, { width: colWidths.description })
          .text('Units', colX.units, tableTop + 7, { width: colWidths.units, align: 'right' })
          .text('Amount', colX.amount, tableTop + 7, { width: colWidths.amount - 8, align: 'right' });

        // Table rows - increased row height for readability
        let currentY = tableTop + 26; // Match header height
        currentPageY = currentY;
        items.forEach((item, index) => {
          // Increased row height for readability
          const rowHeight = (item.student_names && item.student_names.length > 0) || item.tutor_name ? 40 : 28; // Increased from 36/24
          
          if (currentY + rowHeight > pageHeight - bottomMargin - 180) {
            // Need new page - draw header and table header
            doc.addPage();
            yPos = drawPageHeader(topMargin);
            currentY = yPos + 20;
            currentPageY = currentY;
            
            // Redraw table header
            doc.fontSize(9)
              .fillColor('#FFFFFF')
              .font('Helvetica-Bold')
              .rect(tableLeft, currentY, tableWidth, 24)
              .fill('#6A469D')
              .fillColor('#FFFFFF')
              .text('Date', colX.date, currentY + 7, { width: colWidths.date })
              .text('Description', colX.description, currentY + 7, { width: colWidths.description })
              .text('Units', colX.units, currentY + 7, { width: colWidths.units, align: 'right' })
              .text('Amount', colX.amount, currentY + 7, { width: colWidths.amount - 8, align: 'right' });
            currentY += 24;
            currentPageY = currentY;
          }

          // Softer gray for alternating rows
          const bgColor = index % 2 === 0 ? '#FFFFFF' : '#F8F9FA'; // Softer gray
          doc.rect(tableLeft, currentY, tableWidth, rowHeight)
            .fill(bgColor)
            .stroke('#E5E7EB')
            .lineWidth(0.5);

          // Improved date formatting: "Dec 10, 2025 — 3:45 PM"
          const formattedDate = this.formatInvoiceDate(item.item_date);
          const description = item.description || 'Lesson';
          const units = item.units || 1;
          const amount = this.formatCurrency(item.amount);

          // Date (formatted nicely)
          doc.fontSize(8)
            .fillColor('#1F2937') // Darker for better readability
            .font('Helvetica')
            .text(formattedDate, colX.date, currentY + 7, { width: colWidths.date, lineGap: 1 });
          
          // Description
          doc.text(description, colX.description, currentY + 7, { width: colWidths.description });
          
          let descY = currentY + 18; // Slightly reduced
          if (item.student_names && item.student_names.length > 0) {
            doc.fontSize(7)
              .fillColor('#6B7280') // Lighter gray
              .text(`Students: ${item.student_names.join(', ')}`, colX.description, descY, { width: colWidths.description });
            descY += 10; // Slightly reduced
          }
          if (item.tutor_name) {
            doc.fontSize(7)
              .fillColor('#6B7280') // Lighter gray
              .text(`Tutor: ${item.tutor_name}`, colX.description, descY, { width: colWidths.description });
          }

          // Units and Amount (right-aligned, with proper padding)
          doc.fontSize(8)
            .fillColor('#1F2937')
            .text(units.toString(), colX.units, currentY + 7, { width: colWidths.units, align: 'right' })
            .text(amount, colX.amount, currentY + 7, { width: colWidths.amount - 8, align: 'right' });

          currentY += rowHeight;
          currentPageY = currentY;
        });

        // Totals section - premium styling, narrower card, flush right
        currentY = checkPageBreak(130); // Reserve space
        currentPageY = currentY;
        
        // Premium totals card - narrower, flush right, with shadow effect
        const totalsCardY = currentY + 14; // Slightly reduced spacing
        const totalsCardHeight = 110; // Slightly reduced from 115
        const totalsCardWidth = 260; // Narrower card
        const totalsCardX = tableLeft + tableWidth - totalsCardWidth; // Flush right
        
        // Shadow effect (simulated with multiple rectangles)
        doc.rect(totalsCardX + 2, totalsCardY + 2, totalsCardWidth, totalsCardHeight)
          .fill('#E5E7EB')
          .opacity(0.3);
        
        // Main card with rounded corners effect (PDFKit doesn't support rounded corners directly, but we can simulate)
        doc.rect(totalsCardX, totalsCardY, totalsCardWidth, totalsCardHeight)
          .fill('#FFFFFF')
          .stroke('#E5E7EB')
          .lineWidth(1);

        // Calculate amounts
        const affiliateAmount = parseFloat(invoice.affiliate_amount) || 0;
        const tutorAmount = parseFloat(invoice.tutor_amount) || 0;
        const branchTax = parseFloat(invoice.branch_tax) || 0;
        const branchNetAmount = parseFloat(invoice.branch_net_amount) || 0;
        const invoiceTotal = parseFloat(invoice.gross) || 0;

        let totalsY = totalsCardY + 14;
        const labelWidth = 150;
        const amountWidth = 90;
        const totalsCardPadding = 14; // Different padding for totals card

        // Consistent line spacing (leading-6 equivalent = 18pt)
        const lineSpacing = 18;

        doc.fontSize(8)
          .fillColor('#6B7280') // Lighter gray
          .font('Helvetica')
          .text('Affiliate Amount:', totalsCardX + totalsCardPadding, totalsY, { width: labelWidth, align: 'right' })
          .fillColor('#1F2937')
          .text(this.formatCurrency(affiliateAmount), totalsCardX + labelWidth + totalsCardPadding, totalsY, { width: amountWidth, align: 'right' });
        
        totalsY += lineSpacing;
        doc.fillColor('#6B7280')
          .text('Tutor Amount:', totalsCardX + totalsCardPadding, totalsY, { width: labelWidth, align: 'right' })
          .fillColor('#1F2937')
          .text(this.formatCurrency(tutorAmount), totalsCardX + labelWidth + totalsCardPadding, totalsY, { width: amountWidth, align: 'right' });
        
        totalsY += lineSpacing;
        doc.fillColor('#6B7280')
          .text('Branch Tax:', totalsCardX + totalsCardPadding, totalsY, { width: labelWidth, align: 'right' })
          .fillColor('#1F2937')
          .text(this.formatCurrency(branchTax), totalsCardX + labelWidth + totalsCardPadding, totalsY, { width: amountWidth, align: 'right' });
        
        totalsY += lineSpacing;
        doc.fillColor('#6B7280')
          .text('Branch Net Amount:', totalsCardX + totalsCardPadding, totalsY, { width: labelWidth, align: 'right' })
          .fillColor('#1F2937')
          .text(this.formatCurrency(branchNetAmount), totalsCardX + labelWidth + totalsCardPadding, totalsY, { width: amountWidth, align: 'right' });

        // Thicker, crisp divider (border-t-2 equivalent)
        totalsY += 10; // mt-2 equivalent
        doc.moveTo(totalsCardX + totalsCardPadding, totalsY)
          .lineTo(totalsCardX + totalsCardWidth - totalsCardPadding, totalsY)
          .strokeColor('#6A469D')
          .lineWidth(2) // Thicker divider
          .stroke();

        // Invoice Total - bold, larger, purple
        totalsY += 12; // mb-2 equivalent
        doc.fontSize(14) // text-xl equivalent
          .font('Helvetica-Bold')
          .fillColor('#6A469D')
          .text('Invoice Total:', totalsCardX + totalsCardPadding, totalsY, { width: labelWidth, align: 'right' })
          .text(this.formatCurrency(invoiceTotal), totalsCardX + labelWidth + totalsCardPadding, totalsY, { width: amountWidth, align: 'right' });

        // Footer - place right after totals, not at fixed position
        const footerY = Math.max(totalsCardY + totalsCardHeight + 12, currentPageY + 20); // Place after totals card
        // Only add footer if it fits on current page
        if (footerY + 20 < pageHeight - bottomMargin) {
          doc.fontSize(7.5) // text-xs equivalent
            .fillColor('#6B7280') // text-gray-500 with reduced opacity
            .font('Helvetica')
            .text('Thank you for choosing Acme Operations!', leftMargin, footerY, { align: 'center', width: usableWidth })
            .fontSize(7)
            .text(`Questions? Email ${COMPANY_INFO.email}`, leftMargin, footerY + 8, { align: 'center', width: usableWidth });
        }

        // Finalize PDF
        doc.end();

      } catch (error) {
        client.release();
        logger.error({
          msg: 'Error generating invoice PDF with PDFKit',
          invoiceId,
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  /**
   * Generate credit request PDF using PDFKit
   */
  async generateCreditRequestPDF(creditRequestId, poolOverride = null) {
    const poolToUse = poolOverride || this.pool;
    const client = await poolToUse.connect();
    
    return new Promise(async (resolve, reject) => {
      try {
        // Try credit_requests table first, then proforma_invoices
        let { rows: crRows } = await client.query(
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

        let creditRequest;
        let items = [];

        if (crRows.length > 0) {
          creditRequest = crRows[0];
          // Fetch items from credit_request_items with appointment details
          const { rows: itemsRows } = await client.query(
            `SELECT 
              cri.*,
              a.start as appointment_start,
              a.finish as appointment_finish,
              a.topic as appointment_topic,
              s.name as service_name
            FROM credit_request_items cri
            LEFT JOIN appointments a ON cri.appointment_id = a.appointment_id
            LEFT JOIN services s ON a.service_id = s.service_id
            WHERE cri.credit_request_id = $1 
            ORDER BY cri.created_at ASC`,
            [creditRequestId]
          );
          items = itemsRows;
        } else {
          // Try proforma_invoices table
          const { rows: piRows } = await client.query(
            `SELECT 
              pi.*,
              c.first_name as client_first_name,
              c.last_name as client_last_name,
              c.email as client_email,
              c.street as client_street,
              c.town as client_town,
              c.state as client_state,
              c.postcode as client_postcode,
              c.country as client_country
            FROM proforma_invoices pi
            LEFT JOIN clients c ON pi.client_id::text = c.client_id::text
            WHERE pi.id = $1`,
            [creditRequestId]
          );
          if (piRows.length === 0) {
            client.release();
            return reject(new Error(`Credit request ${creditRequestId} not found`));
          }
          creditRequest = piRows[0];
          // Parse items from JSONB
          if (creditRequest.items) {
            items = typeof creditRequest.items === 'string' 
              ? JSON.parse(creditRequest.items) 
              : creditRequest.items;
          }
        }

        const creditRequestNumber = creditRequest.credit_request_number || creditRequest.display_id || `PFI-${creditRequest.id}`;
        const total = parseFloat(creditRequest.amount) || 0;

        // Load logo if available (same as invoice/payment order)
        let logoPath = null;
        const possibleLogoPaths = [
          path.join(__dirname, '../public/logo192.png'),
          path.join(__dirname, '../public/logo512.png'),
          path.join(process.cwd(), 'public/logo192.png'),
          path.join(process.cwd(), 'public/logo512.png'),
        ];
        
        for (const logo of possibleLogoPaths) {
          try {
            if (fs.existsSync(logo)) {
              logoPath = logo;
              logger.info({ msg: 'Logo found for credit request PDF', path: logo });
              break;
            }
          } catch (e) {
            // Continue checking other paths
          }
        }
        
        if (!logoPath) {
          logger.warn({ msg: 'Logo not found for credit request PDF generation', checkedPaths: possibleLogoPaths });
        }

        // Create PDF document with optimized margins (matching payment order)
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 30, bottom: 50, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          client.release();
          const pdfBuffer = Buffer.concat(chunks);
          logger.info({
            msg: 'Credit request PDF generated with PDFKit',
            creditRequestId,
            creditRequestNumber,
            size: pdfBuffer.length
          });
          resolve(pdfBuffer);
        });
        doc.on('error', (error) => {
          client.release();
          reject(error);
        });

        // Page dimensions
        const pageWidth = 612;
        const pageHeight = 792;
        const leftMargin = 50;
        const rightMargin = 50;
        const topMargin = 40;
        const bottomMargin = 50;
        const usableWidth = pageWidth - leftMargin - rightMargin; // 512pt
        const usableHeight = pageHeight - topMargin - bottomMargin; // 702pt

        // Track current Y position
        let currentPageY = topMargin;
        
        // Helper function to check if we need a new page
        const checkPageBreak = (requiredHeight) => {
          if (currentPageY + requiredHeight > pageHeight - bottomMargin) {
            doc.addPage();
            currentPageY = topMargin;
            // Redraw header on new page
            drawPageHeader();
            return true;
          }
          return false;
        };

        // Helper function to draw header on new page (matching invoice/payment order style)
        const drawPageHeader = () => {
          let yPos = topMargin;
          
          // Logo (left side)
          if (logoPath) {
            try {
              doc.image(logoPath, leftMargin, yPos, { 
                width: 70, 
                height: 70, 
                fit: [70, 70]
              });
            } catch (logoError) {
              logger.warn({ 
                msg: 'Could not load logo for credit request PDF', 
                path: logoPath, 
                error: logoError.message
              });
            }
          }

          // Company info (right-aligned, matching invoice/payment order style)
          const companyInfoWidth = 150;
          const companyInfoX = pageWidth - rightMargin - companyInfoWidth;
          doc.fontSize(13)
            .fillColor('#6A469D')
            .font('Helvetica-Bold')
            .text(COMPANY_INFO.name, companyInfoX, yPos, { align: 'right', width: companyInfoWidth, lineGap: 2 })
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor('#6B7280') // Lighter gray for secondary text
            .text(COMPANY_INFO.address, companyInfoX, yPos + 13, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(`${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}`, companyInfoX, yPos + 22, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.country, companyInfoX, yPos + 30, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.phone, companyInfoX, yPos + 38, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.email, companyInfoX, yPos + 46, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.website, companyInfoX, yPos + 54, { align: 'right', width: companyInfoWidth });
          
          currentPageY = Math.max(yPos + 75, topMargin + 75);
        };

        // Draw first page header
        drawPageHeader();
        checkPageBreak(110);
        
        // Credit Request title section - matching invoice/payment order style
        let yPos = currentPageY;
        yPos += 6; // Reduced space above
        doc.fontSize(32) // Matching invoice/payment order size
          .fillColor('#6A469D')
          .font('Helvetica-Bold')
          .text('CREDIT REQUEST', leftMargin, yPos);
        
        // Thin divider line under title (matching invoice/payment order)
        yPos += 35; // Reduced spacing below title
        doc.moveTo(leftMargin, yPos)
          .lineTo(leftMargin + 200, yPos)
          .strokeColor('#E5E7EB')
          .lineWidth(0.5)
          .stroke();
        
        yPos += 15; // Tighter spacing to cards
        currentPageY = yPos;
        
        // Credit Request Details Card (left side) - matching invoice/payment order card style
        const creditDate = this.formatDate(creditRequest.date_created || creditRequest.date_raised);
        const dateSent = creditRequest.date_sent ? this.formatDate(creditRequest.date_sent) : null;
        const datePaid = creditRequest.date_paid ? this.formatDate(creditRequest.date_paid) : null;
        
        const cardHeight = 70; // Matching invoice/payment order card height
        const cardPadding = 12;
        
        // Draw subtle background card for credit request details (matching invoice/payment order style)
        doc.rect(leftMargin, yPos, 240, cardHeight)
          .fill('#F5F7FB') // Softer slate-50 equivalent
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280')
          .font('Helvetica-Bold')
          .text('CREDIT REQUEST DETAILS', leftMargin + cardPadding, yPos + cardPadding, { width: 240 - cardPadding * 2 });
        
        // Details content
        let detailY = yPos + cardPadding + 10;
        doc.fontSize(9)
          .fillColor('#111827')
          .font('Helvetica')
          .text(`Credit Request Number: ${creditRequestNumber}`, leftMargin + cardPadding, detailY, { width: 240 - cardPadding * 2, lineGap: 3 })
          .text(`Date Created: ${creditDate}`, leftMargin + cardPadding, detailY + 12, { width: 240 - cardPadding * 2, lineGap: 3 });
        
        if (dateSent) {
          doc.text(`Date Sent: ${dateSent}`, leftMargin + cardPadding, detailY + 24, { width: 240 - cardPadding * 2, lineGap: 3 });
        }
        if (datePaid) {
          doc.text(`Date Paid: ${datePaid}`, leftMargin + cardPadding, detailY + (dateSent ? 36 : 24), { width: 240 - cardPadding * 2, lineGap: 3 });
        }
        
        // Credit To Card (right side) - matching invoice/payment order style
        const clientName = `${creditRequest.client_first_name || ''} ${creditRequest.client_last_name || ''}`.trim();
        
        // Build address lines array (matching invoice style)
        const clientAddressLines = [];
        if (creditRequest.client_street) clientAddressLines.push(creditRequest.client_street);
        if (creditRequest.client_town || creditRequest.client_state || creditRequest.client_postcode) {
          const cityStateZip = [
            creditRequest.client_town,
            creditRequest.client_state ? `${creditRequest.client_state} ${creditRequest.client_postcode || ''}`.trim() : creditRequest.client_postcode
          ].filter(Boolean).join(', ');
          if (cityStateZip) clientAddressLines.push(cityStateZip);
        }
        if (creditRequest.client_country) clientAddressLines.push(creditRequest.client_country);
        const clientAddress = clientAddressLines.join('\n');
        
        // Credit To card - align with right edge (matching invoice/payment order)
        const creditToWidth = 200;
        const creditToX = leftMargin + usableWidth - creditToWidth; // Align with table right edge
        
        doc.rect(creditToX, yPos, creditToWidth, cardHeight)
          .fill('#F5F7FB')
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280')
          .font('Helvetica')
          .text('CREDIT TO', creditToX + cardPadding, yPos + cardPadding);
        
        // Client name: bold (matching invoice/payment order)
        doc.fontSize(8.5)
          .fillColor('#1F2937')
          .font('Helvetica-Bold')
          .text(clientName, creditToX + cardPadding, yPos + cardPadding + 11, { width: creditToWidth - (cardPadding * 2) });
        
        // Client address and email with proper Y tracking (matching invoice style)
        let clientTextY = yPos + cardPadding + 23;
        if (clientAddress) {
          doc.font('Helvetica')
            .text(clientAddress, creditToX + cardPadding, clientTextY, { width: creditToWidth - (cardPadding * 2), lineGap: 2 });
          clientTextY += (clientAddressLines.length * 10); // Calculate based on number of lines
        }
        if (creditRequest.client_email) {
          doc.text(creditRequest.client_email, creditToX + cardPadding, clientTextY, { width: creditToWidth - (cardPadding * 2) });
        }
        
        // Fetch payment information if credit request is paid
        let paymentInfo = null;
        if (creditRequest.date_paid) {
          try {
            const { rows: balanceRows } = await client.query(
              `SELECT 
                bu.*
              FROM balance_updates bu
              WHERE bu.client_id = $1 
                AND (bu.description LIKE '%credit%' OR bu.description LIKE '%Credit%' OR bu.related_credit_request_id = $2)
                AND bu.created_at::date = $3::date
              ORDER BY bu.created_at DESC
              LIMIT 1`,
              [creditRequest.client_id, creditRequestId, creditRequest.date_paid]
            );
            if (balanceRows.length > 0) {
              paymentInfo = balanceRows[0];
            }
          } catch (e) {
            logger.warn({ msg: 'Could not fetch payment info for credit request PDF', error: e.message });
          }
        }
        
        // Items table header (matching TutorCruncher format - Description, Units, Amount)
        yPos += cardHeight + 15;
        currentPageY = yPos;
        currentPageY += 10;
        checkPageBreak(100);
        
        const tableTop = currentPageY;
        doc.fillColor('#FFFFFF')
          .rect(leftMargin, tableTop, usableWidth, 24)
          .fill('#6A469D')
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Description', leftMargin + 8, tableTop + 8)
          .text('Units', leftMargin + usableWidth - 150, tableTop + 8, { width: 50, align: 'right' })
          .text('Amount', leftMargin + usableWidth - 80, tableTop + 8, { width: 80, align: 'right' });
        
        currentPageY = tableTop + 24;
        
        // Items rows with pagination - show description from credit request or items
        const mainDescription = creditRequest.description || creditRequest.reason || '';
        
        if (items && items.length > 0) {
          items.forEach((item, index) => {
            checkPageBreak(24); // Check if we need a new page for this row
            
            const bgColor = index % 2 === 0 ? '#FFFFFF' : '#F9FAFB';
            doc.rect(leftMargin, currentPageY, usableWidth, 24)
              .fill(bgColor);
            
            // Use item description or main description
            const description = item.appointment_topic || item.custom_description || item.description || mainDescription || 'Credit adjustment';
            const units = parseFloat(item.units) || 1;
            const amount = parseFloat(item.amount) || 0;
            
            doc.fillColor('#111827')
              .fontSize(9)
              .font('Helvetica')
              .text(description, leftMargin + 8, currentPageY + 8, { width: usableWidth - 150, ellipsis: true })
              .text(units.toString(), leftMargin + usableWidth - 150, currentPageY + 8, { width: 50, align: 'right' })
              .font('Helvetica-Bold')
              .text(this.formatCurrency(amount), leftMargin + usableWidth - 80, currentPageY + 8, { width: 80, align: 'right' });
            
            currentPageY += 24;
          });
        } else {
          // Show main description as single item if no items exist
          checkPageBreak(24);
          const bgColor = '#FFFFFF';
          doc.rect(leftMargin, currentPageY, usableWidth, 24)
            .fill(bgColor);
          
          doc.fillColor('#111827')
            .fontSize(9)
            .font('Helvetica')
            .text(mainDescription || 'Credit adjustment', leftMargin + 8, currentPageY + 8, { width: usableWidth - 150, ellipsis: true })
            .text('1', leftMargin + usableWidth - 150, currentPageY + 8, { width: 50, align: 'right' })
            .font('Helvetica-Bold')
            .text(this.formatCurrency(total), leftMargin + usableWidth - 80, currentPageY + 8, { width: 80, align: 'right' });
          
          currentPageY += 24;
        }
        
        // Summary section (matching TutorCruncher format)
        currentPageY += 15;
        checkPageBreak(60);
        
        // Total of items
        doc.fontSize(9)
          .font('Helvetica')
          .fillColor('#111827')
          .text('Total of items:', leftMargin + usableWidth - 150, currentPageY, { width: 100, align: 'right' })
          .font('Helvetica-Bold')
          .text(this.formatCurrency(total), leftMargin + usableWidth - 50, currentPageY, { width: 50, align: 'right' });
        
        currentPageY += 12;
        
        // Amount already paid
        const amountPaid = creditRequest.date_paid ? total : 0;
        doc.fontSize(9)
          .font('Helvetica')
          .fillColor('#111827')
          .text('Amount already paid:', leftMargin + usableWidth - 150, currentPageY, { width: 100, align: 'right' })
          .font('Helvetica-Bold')
          .text(this.formatCurrency(amountPaid), leftMargin + usableWidth - 50, currentPageY, { width: 50, align: 'right' });
        
        currentPageY += 12;
        
        // Amount due for payment
        const amountDue = total - amountPaid;
        doc.fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#111827')
          .text('AMOUNT DUE FOR PAYMENT:', leftMargin + usableWidth - 150, currentPageY, { width: 100, align: 'right' })
          .text(this.formatCurrency(amountDue), leftMargin + usableWidth - 50, currentPageY, { width: 50, align: 'right' });
        
        currentPageY += 20;
        
        // Payment information section (if paid)
        if (paymentInfo && creditRequest.date_paid) {
          checkPageBreak(50);
          
          doc.fontSize(10)
            .font('Helvetica-Bold')
            .fillColor('#111827')
            .text('Summary of payments made', leftMargin, currentPageY);
          
          currentPageY += 15;
          
          // Payment table header
          const paymentTableTop = currentPageY;
          doc.fillColor('#FFFFFF')
            .rect(leftMargin, paymentTableTop, usableWidth, 20)
            .fill('#6A469D')
            .fillColor('#FFFFFF')
            .fontSize(8)
            .font('Helvetica-Bold')
            .text('Payment Method', leftMargin + 8, paymentTableTop + 6)
            .text('Date', leftMargin + 200, paymentTableTop + 6)
            .text('Amount', leftMargin + usableWidth - 80, paymentTableTop + 6, { width: 80, align: 'right' });
          
          currentPageY = paymentTableTop + 20;
          
          // Payment row
          const paymentBgColor = '#F9FAFB';
          doc.rect(leftMargin, currentPageY, usableWidth, 20)
            .fill(paymentBgColor);
          
          const paymentMethod = paymentInfo.payment_method || paymentInfo.description || 'Card Payment with Stripe';
          const paymentDate = this.formatDate(paymentInfo.created_at || creditRequest.date_paid);
          const paymentAmount = parseFloat(paymentInfo.change_amount) || total;
          
          doc.fillColor('#111827')
            .fontSize(8)
            .font('Helvetica')
            .text(paymentMethod, leftMargin + 8, currentPageY + 6, { width: 180, ellipsis: true })
            .text(paymentDate, leftMargin + 200, currentPageY + 6, { width: 220, ellipsis: true })
            .font('Helvetica-Bold')
            .text(this.formatCurrency(paymentAmount), leftMargin + usableWidth - 80, currentPageY + 6, { width: 80, align: 'right' });
          
          currentPageY += 20;
        }
        
        currentPageY += 10;

        doc.end();

      } catch (error) {
        client.release();
        logger.error({
          msg: 'Error generating credit request PDF with PDFKit',
          creditRequestId,
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  /**
   * Generate payment order PDF using PDFKit
   */
  async generatePaymentOrderPDF(paymentOrderId, poolOverride = null) {
    const poolToUse = poolOverride || this.pool;
    const client = await poolToUse.connect();
    
    return new Promise(async (resolve, reject) => {
      try {
        const { rows: poRows } = await client.query(
          `SELECT * FROM payment_orders WHERE id = $1`,
          [paymentOrderId]
        );

        if (poRows.length === 0) {
          client.release();
          return reject(new Error(`Payment order ${paymentOrderId} not found`));
        }

        const paymentOrder = poRows[0];

        // Fetch items from payment_order_charges table (same as API endpoint)
        const { rows: itemsRows } = await client.query(
          `SELECT 
            poc.*,
            a.start as appointment_start,
            a.finish as appointment_finish,
            a.topic as appointment_topic,
            s.name as service_name
          FROM payment_order_charges poc
          LEFT JOIN appointments a ON poc.appointment_id = a.appointment_id
          LEFT JOIN services s ON a.service_id = s.service_id
          WHERE poc.payment_order_id = $1 
          ORDER BY poc.date ASC, poc.charge_index ASC`,
          [paymentOrderId]
        );
        
        // Transform items to match expected format
        const items = itemsRows.map(item => ({
          ...item,
          item_date: item.date || item.appointment_start,
          description: item.appointment_topic || item.adhoc_charge_description || `Charge ${(item.charge_index || 0) + 1}`,
          amount: parseFloat(item.amount) || 0,
          tax_amount: parseFloat(item.tax_amount) || 0,
          units: parseFloat(item.units) || 1,
          rate: parseFloat(item.rate) || 0,
        }));

        const paymentOrderNumber = paymentOrder.payment_order_number || `PO-${paymentOrder.id}`;
        const totalToPay = parseFloat(paymentOrder.total_to_pay_tutor || paymentOrder.amount) || 0;
        const totalTax = parseFloat(paymentOrder.total_tax) || 0;
        const tutorName = `${paymentOrder.payee_first || ''} ${paymentOrder.payee_last || ''}`.trim();

        // Create PDF document with reduced top margin
        const doc = new PDFDocument({
          size: 'LETTER',
          margins: { top: 30, bottom: 50, left: 50, right: 50 }
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => {
          client.release();
          const pdfBuffer = Buffer.concat(chunks);
          logger.info({
            msg: 'Payment order PDF generated with PDFKit',
            paymentOrderId,
            paymentOrderNumber,
            size: pdfBuffer.length
          });
          resolve(pdfBuffer);
        });
        doc.on('error', (error) => {
          client.release();
          reject(error);
        });

        // Page dimensions
        const pageWidth = 612;
        const pageHeight = 792;
        const leftMargin = 50;
        const rightMargin = 50;
        const topMargin = 40;
        const bottomMargin = 50;
        const usableWidth = pageWidth - leftMargin - rightMargin; // 512pt
        const usableHeight = pageHeight - topMargin - bottomMargin; // 702pt

        // Load logo if available (same as invoice)
        let logoPath = null;
        const possibleLogoPaths = [
          path.join(__dirname, '../public/logo192.png'),
          path.join(__dirname, '../public/logo512.png'),
          path.join(process.cwd(), 'public/logo192.png'),
          path.join(process.cwd(), 'public/logo512.png'),
        ];
        
        for (const logo of possibleLogoPaths) {
          try {
            if (fs.existsSync(logo)) {
              logoPath = logo;
              logger.info({ msg: 'Logo found for payment order PDF', path: logo });
              break;
            }
          } catch (e) {
            // Continue checking other paths
          }
        }
        
        if (!logoPath) {
          logger.warn({ msg: 'Logo not found for payment order PDF generation', checkedPaths: possibleLogoPaths });
        }

        // Track current Y position
        let currentPageY = topMargin;
        
        // Helper function to check if we need a new page
        const checkPageBreak = (requiredHeight) => {
          if (currentPageY + requiredHeight > pageHeight - bottomMargin) {
            doc.addPage();
            currentPageY = topMargin;
            return true;
          }
          return false;
        };

        // Helper function to draw header on new page (matching invoice style)
        const drawPageHeader = () => {
          let yPos = topMargin;
          
          // Logo (left side)
          if (logoPath) {
            try {
              doc.image(logoPath, leftMargin, yPos, { 
                width: 70, 
                height: 70, 
                fit: [70, 70]
              });
            } catch (logoError) {
              logger.warn({ 
                msg: 'Could not load logo for payment order PDF', 
                path: logoPath, 
                error: logoError.message
              });
            }
          }

          // Company info (right-aligned, matching invoice style)
          const companyInfoWidth = 150;
          const companyInfoX = pageWidth - rightMargin - companyInfoWidth;
          doc.fontSize(13)
            .fillColor('#6A469D')
            .font('Helvetica-Bold')
            .text(COMPANY_INFO.name, companyInfoX, yPos, { align: 'right', width: companyInfoWidth, lineGap: 2 })
            .fontSize(7.5)
            .font('Helvetica')
            .fillColor('#6B7280') // Lighter gray for secondary text
            .text(COMPANY_INFO.address, companyInfoX, yPos + 13, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(`${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}`, companyInfoX, yPos + 22, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.country, companyInfoX, yPos + 30, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.phone, companyInfoX, yPos + 38, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.email, companyInfoX, yPos + 46, { align: 'right', width: companyInfoWidth, lineGap: 1.5 })
            .text(COMPANY_INFO.website, companyInfoX, yPos + 54, { align: 'right', width: companyInfoWidth });
          
          currentPageY = Math.max(yPos + 75, topMargin + 75);
        };

        // Draw first page header
        drawPageHeader();
        checkPageBreak(110);
        
        // Payment Order title section - matching invoice style
        let yPos = currentPageY;
        yPos += 6; // Reduced space above
        doc.fontSize(32) // Matching invoice size
          .fillColor('#6A469D')
          .font('Helvetica-Bold')
          .text('PAYMENT ORDER', leftMargin, yPos);
        
        // Thin divider line under title (matching invoice)
        yPos += 35; // Reduced spacing below title
        doc.moveTo(leftMargin, yPos)
          .lineTo(leftMargin + 200, yPos)
          .strokeColor('#E5E7EB')
          .lineWidth(0.5)
          .stroke();
        
        yPos += 15; // Tighter spacing to cards
        
        // Payment Order Details Card (left side) - matching invoice card style
        const poDate = this.formatDate(paymentOrder.date_created || paymentOrder.date_sent);
        const dateSent = paymentOrder.date_sent ? this.formatDate(paymentOrder.date_sent) : null;
        const status = paymentOrder.status ? paymentOrder.status.charAt(0).toUpperCase() + paymentOrder.status.slice(1) : null;
        
        const cardHeight = 70; // Matching invoice card height
        const cardPadding = 12;
        
        // Draw subtle background card for payment order details (matching invoice style)
        doc.rect(leftMargin, yPos, 240, cardHeight)
          .fill('#F5F7FB') // Softer slate-50 equivalent
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280') // text-gray-500
          .font('Helvetica')
          .text('PAYMENT ORDER DETAILS', leftMargin + cardPadding, yPos + cardPadding);
        
        // Values: medium weight
        let detailY = yPos + cardPadding + 11;
        doc.fontSize(8.5)
          .fillColor('#1F2937') // text-gray-800
          .font('Helvetica')
          .text(`Payment Order Number: ${paymentOrderNumber}`, leftMargin + cardPadding, detailY)
          .text(`Date Created: ${poDate}`, leftMargin + cardPadding, detailY + 12);
        
        detailY += 24;
        if (dateSent) {
          doc.text(`Date Sent: ${dateSent}`, leftMargin + cardPadding, detailY);
          detailY += 12;
        }
        if (status) {
          doc.font('Helvetica-Bold')
            .text(`Status: ${status}`, leftMargin + cardPadding, detailY);
        }

        // Pay To section (right side) - matching invoice "Bill To" card style
        const billToWidth = 200;
        const billToX = leftMargin + usableWidth - billToWidth; // Align with table right edge
        
        // Draw subtle background card for Pay To (matching height and style)
        doc.rect(billToX, yPos, billToWidth, cardHeight)
          .fill('#F5F7FB') // Softer slate-50 equivalent
          .stroke('#E5E7EB')
          .lineWidth(0.5);
        
        // Label: uppercase, muted
        doc.fontSize(7)
          .fillColor('#6B7280') // text-gray-500
          .font('Helvetica')
          .text('PAY TO', billToX + cardPadding, yPos + cardPadding);
        
        // Tutor name: bold
        doc.fontSize(8.5)
          .fillColor('#1F2937') // text-gray-800
          .font('Helvetica-Bold')
          .text(tutorName, billToX + cardPadding, yPos + cardPadding + 11, { width: billToWidth - (cardPadding * 2) });
        
        let tutorTextY = yPos + cardPadding + 23;
        if (paymentOrder.payee_email) {
          doc.font('Helvetica')
            .text(paymentOrder.payee_email, billToX + cardPadding, tutorTextY, { width: billToWidth - (cardPadding * 2) });
        }

        // Table starts after cards end
        const cardsEndY = yPos + cardHeight;
        currentPageY = cardsEndY + 18; // Start table 18pt after cards end

        // Table header - ensure proper spacing
        const tableWidth = usableWidth;
        const rowHeight = 24; // Reduced row height for compact display
        const tableLeft = leftMargin;
        
        // Check if we need a new page before table
        checkPageBreak(150); // Reserve space for table header + a few rows + summary

        const tableTop = currentPageY;
        doc.fillColor('#FFFFFF')
          .rect(tableLeft, tableTop, tableWidth, rowHeight)
          .fill('#6A469D')
          .fillColor('#FFFFFF')
          .fontSize(9)
          .font('Helvetica-Bold')
          .text('Topic', tableLeft + 10, tableTop + 7, { width: 130 })
          .text('Start', tableLeft + 150, tableTop + 7, { width: 140 })
          .text('Units', tableLeft + 300, tableTop + 7, { width: 50, align: 'right' })
          .text('Tax', tableLeft + 360, tableTop + 7, { width: 50, align: 'right' })
          .text('Amount', tableLeft + 420, tableTop + 7, { width: 70, align: 'right' });

        let currentY = tableTop + rowHeight;
        currentPageY = currentY;

        // Draw items with pagination
        items.forEach((item, index) => {
          // Check if we need a new page (reserve space for summary at bottom)
          if (currentY + rowHeight > pageHeight - bottomMargin - 100) {
            doc.addPage();
            currentPageY = topMargin;
            
            // Redraw table header on new page (no need for full header on continuation pages)
            currentY = currentPageY + 20;
            doc.fillColor('#FFFFFF')
              .rect(tableLeft, currentY, tableWidth, rowHeight)
              .fill('#6A469D')
              .fillColor('#FFFFFF')
              .fontSize(9)
              .font('Helvetica-Bold')
              .text('Topic', tableLeft + 10, currentY + 7, { width: 130 })
              .text('Start', tableLeft + 150, currentY + 7, { width: 140 })
              .text('Units', tableLeft + 300, currentY + 7, { width: 50, align: 'right' })
              .text('Tax', tableLeft + 360, currentY + 7, { width: 50, align: 'right' })
              .text('Amount', tableLeft + 420, currentY + 7, { width: 70, align: 'right' });
            currentY += rowHeight;
            currentPageY = currentY;
          }

          const bgColor = index % 2 === 0 ? '#F9F9F9' : '#FFFFFF';
          doc.rect(tableLeft, currentY, tableWidth, rowHeight)
            .fill(bgColor);
          
          // Format topic/description
          const topic = item.appointment_topic || item.adhoc_charge_description || item.description || 'Lesson';
          
          // Format start date/time - use appointment_start if available, otherwise use date
          let startDateStr = 'N/A';
          if (item.appointment_start) {
            startDateStr = this.formatDate(item.appointment_start, 'MM/dd/yyyy hh:mm a');
          } else if (item.date) {
            startDateStr = this.formatDate(item.date, 'MM/dd/yyyy hh:mm a');
          } else if (item.item_date) {
            startDateStr = this.formatDate(item.item_date, 'MM/dd/yyyy hh:mm a');
          }
          
          doc.fontSize(8)
            .fillColor('#333')
            .font('Helvetica')
            .text(topic, tableLeft + 10, currentY + 7, { width: 130 })
            .text(startDateStr, tableLeft + 150, currentY + 7, { width: 140 })
            .text((item.units || 1).toString(), tableLeft + 300, currentY + 7, { width: 50, align: 'right' })
            .text(this.formatCurrency(item.tax_amount || 0), tableLeft + 360, currentY + 7, { width: 50, align: 'right' })
            .text(this.formatCurrency(item.amount || 0), tableLeft + 420, currentY + 7, { width: 70, align: 'right' });
          
          currentY += rowHeight;
          currentPageY = currentY;
        });

        // Summary - ensure it fits on current page or move to next
        checkPageBreak(80);
        const summaryY = currentPageY + 15;
        
        doc.fontSize(9)
          .fillColor('#333')
          .font('Helvetica')
          .text('Total to Pay Tutor:', tableLeft + tableWidth - 200, summaryY, { width: 100, align: 'right' })
          .font('Helvetica-Bold')
          .text(this.formatCurrency(totalToPay), tableLeft + tableWidth - 100, summaryY, { width: 80, align: 'right' });
        
        if (totalTax > 0) {
          doc.font('Helvetica')
            .text('Total Tax:', tableLeft + tableWidth - 200, summaryY + 12, { width: 100, align: 'right' })
            .text(this.formatCurrency(totalTax), tableLeft + tableWidth - 100, summaryY + 12, { width: 80, align: 'right' });
        }

        doc.end();

      } catch (error) {
        client.release();
        logger.error({
          msg: 'Error generating payment order PDF with PDFKit',
          paymentOrderId,
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }
}

module.exports = PDFKitGenerationService;
