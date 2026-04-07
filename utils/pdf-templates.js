/**
 * PDF Templates for Accounting Documents
 * HTML templates for invoices, credit requests, and payment orders with Acme Operations branding
 */

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
  logoUrl: process.env.STORY_TIME_CHESS_LOGO_URL || '/logo192.png'
};

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

/**
 * Format date
 */
function formatDate(date, format = 'MM/dd/yyyy') {
  if (!date) return '';
  const dt = DateTime.fromJSDate(new Date(date));
  return dt.toFormat(format);
}

/**
 * Get invoice template HTML
 */
function getInvoiceTemplate(invoice, items = []) {
  const invoiceDate = formatDate(invoice.date_created || invoice.date_sent);
  const invoiceDateFormatted = invoice.date_created || invoice.date_sent 
    ? formatDate(invoice.date_created || invoice.date_sent, 'MMM dd, yyyy')
    : '';
  const invoiceTimeFormatted = invoice.date_created || invoice.date_sent
    ? formatDate(invoice.date_created || invoice.date_sent, 'hh:mm a')
    : '';
  
  const clientName = `${invoice.client_first_name || ''} ${invoice.client_last_name || ''}`.trim();
  
  // Build client address with proper formatting
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

  const subtotal = parseFloat(invoice.gross) || 0;
  const tax = parseFloat(invoice.tax) || 0;
  const total = subtotal + tax;
  
  // Format item dates nicely
  const formatItemDate = (dateString) => {
    if (!dateString) return '';
    const date = formatDate(dateString, 'MMM dd, yyyy');
    const time = formatDate(dateString, 'hh:mm a');
    return `${date} — ${time}`;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Inter', 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
      color: #1f2937;
      background: #ffffff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    @page {
      margin: 0.3in;
      size: letter;
    }
    
    /* Header Section - Compact Premium Design */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #6A469D;
      page-break-inside: avoid;
    }
    .logo-section {
      flex: 0 0 auto;
    }
    .logo {
      max-width: 140px;
      height: auto;
      display: block;
      margin-bottom: 0;
    }
    .company-info {
      text-align: right;
      color: #6b7280;
      font-size: 10px;
      line-height: 1.6;
      font-weight: 400;
      max-width: 260px;
    }
    .company-info .company-name {
      font-size: 18px;
      font-weight: 700;
      color: #6A469D;
      margin-bottom: 4px;
      letter-spacing: -0.3px;
      line-height: 1.3;
      display: block;
      clear: both;
    }
    .company-info > div {
      margin-bottom: 3px;
      display: block;
      line-height: 1.6;
      min-height: 14px;
    }
    .company-info .company-name + div {
      margin-top: 2px;
    }
    
    /* Invoice Title & Metadata - Compact */
    .invoice-header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
      page-break-inside: avoid;
      gap: 18px;
    }
    .invoice-title-section {
      flex: 1;
      min-width: 0;
    }
    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      color: #6A469D;
      margin-bottom: 12px;
      letter-spacing: -0.8px;
      line-height: 1.1;
      text-transform: uppercase;
    }
    .invoice-metadata {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: 6px 16px;
      font-size: 12px;
      line-height: 1.5;
    }
    .metadata-label {
      font-weight: 600;
      color: #6b7280;
      font-size: 11px;
    }
    .metadata-value {
      color: #111827;
      font-weight: 500;
      font-size: 12px;
      word-break: break-word;
    }
    .status-badge {
      display: inline-block;
      padding: 5px 14px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    .status-paid {
      background-color: #d1fae5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .status-pending {
      background-color: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .status-unpaid {
      background-color: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
    
    /* Bill To Card - Compact Premium Styling */
    .bill-to-card {
      background: linear-gradient(135deg, #E8FBFF 0%, #f0fdfa 100%);
      border: 2px solid #6A469D;
      border-radius: 8px;
      padding: 14px;
      width: 250px;
      flex-shrink: 0;
      min-width: 250px;
      box-shadow: 0 2px 4px rgba(106, 70, 157, 0.1);
    }
    .bill-to-title {
      font-size: 9px;
      font-weight: 700;
      color: #6A469D;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(106, 70, 157, 0.2);
      line-height: 1.2;
      display: block;
    }
    .bill-to-name {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      margin-bottom: 6px;
      line-height: 1.4;
      word-wrap: break-word;
      overflow-wrap: break-word;
      display: block;
      min-height: 18px;
    }
    .bill-to-address {
      font-size: 10px;
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 4px;
      word-wrap: break-word;
      overflow-wrap: break-word;
      display: block;
    }
    .bill-to-address > div {
      margin-bottom: 3px;
      display: block;
      line-height: 1.6;
      min-height: 14px;
      clear: both;
    }
    .bill-to-email {
      font-size: 10px;
      color: #6A469D;
      margin-top: 6px;
      font-weight: 500;
      word-wrap: break-word;
      overflow-wrap: break-word;
      display: block;
      line-height: 1.5;
      min-height: 14px;
    }
    
    /* Items Table - Compact Professional Design */
    .table-container {
      margin-bottom: 16px;
      page-break-inside: auto;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e5e7eb;
    }
    thead {
      background: linear-gradient(135deg, #6A469D 0%, #5a3a8d 100%);
    }
    th {
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border: none;
      font-family: 'Inter', sans-serif;
    }
    th.text-right {
      text-align: right;
    }
    tbody tr {
      border-bottom: 1px solid #f3f4f6;
    }
    tbody tr:last-child {
      border-bottom: none;
    }
    tbody tr:nth-child(even) {
      background-color: #fafafa;
    }
    td {
      padding: 10px 12px;
      font-size: 12px;
      color: #111827;
      line-height: 1.5;
      border: none;
      vertical-align: top;
    }
    td.text-right {
      text-align: right;
      font-weight: 600;
      color: #111827;
      font-size: 12px;
    }
    .item-description {
      font-weight: 600;
      color: #111827;
      margin-bottom: 3px;
      font-size: 12px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .item-meta {
      font-size: 10px;
      color: #6b7280;
      margin-top: 3px;
      line-height: 1.4;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .item-date {
      font-size: 11px;
      color: #4b5563;
      white-space: nowrap;
      font-weight: 500;
    }
    
    /* Totals Section - Compact Premium Design */
    .totals-section {
      margin-top: 16px;
      margin-left: auto;
      width: 280px;
      page-break-inside: avoid;
    }
    .totals-box {
      background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 12px;
    }
    .totals-row-label {
      color: #6b7280;
      font-weight: 500;
      font-size: 12px;
    }
    .totals-row-value {
      color: #111827;
      font-weight: 600;
      font-size: 12px;
    }
    .totals-row.total {
      margin-top: 10px;
      padding-top: 12px;
      border-top: 2px solid #6A469D;
    }
    .totals-row.total .totals-row-label {
      color: #6A469D;
      font-weight: 700;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .totals-row.total .totals-row-value {
      color: #6A469D;
      font-weight: 700;
      font-size: 18px;
      letter-spacing: -0.3px;
    }
    
    /* Payment Instructions - Compact */
    .payment-instruction {
      background: linear-gradient(135deg, #E8FBFF 0%, #f0fdfa 100%);
      border-left: 4px solid #6A469D;
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 16px;
      font-size: 11px;
      line-height: 1.5;
      color: #1f2937;
      page-break-inside: avoid;
      box-shadow: 0 1px 3px rgba(106, 70, 157, 0.08);
    }
    .payment-instruction strong {
      color: #6A469D;
      font-weight: 700;
      font-size: 13px;
    }
    
    /* Footer - Compact Professional */
    .footer {
      margin-top: 18px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 10px;
      line-height: 1.5;
      page-break-inside: avoid;
    }
    .footer-message {
      font-weight: 600;
      color: #4b5563;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .footer-contact {
      color: #9ca3af;
      font-size: 10px;
    }
    .footer-contact a {
      color: #6A469D;
      text-decoration: none;
      font-weight: 600;
      transition: color 0.2s;
    }
    
    /* Prevent page breaks */
    .invoice-content {
      page-break-inside: avoid;
    }
    tbody tr {
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div class="logo-section">
      ${COMPANY_INFO.logoUrl ? `<img src="${COMPANY_INFO.logoUrl}" alt="Acme Operations Logo" class="logo" onerror="this.style.display='none';" />` : ''}
    </div>
    <div class="company-info">
      <div class="company-name">${COMPANY_INFO.name}</div>
      <div>${COMPANY_INFO.address}</div>
      <div>${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}</div>
      <div>${COMPANY_INFO.country}</div>
      <div style="margin-top: 4px;">
        <div>${COMPANY_INFO.phone}</div>
        <div>${COMPANY_INFO.email}</div>
        <div>${COMPANY_INFO.website}</div>
      </div>
    </div>
  </div>

  <!-- Invoice Title & Metadata -->
  <div class="invoice-header-section">
    <div class="invoice-title-section">
      <h1 class="invoice-title">Invoice</h1>
      <div class="invoice-metadata">
        <div class="metadata-label">Invoice Number:</div>
        <div class="metadata-value">${invoice.invoice_number || `INV-${invoice.id}`}</div>
        <div class="metadata-label">Invoice Date:</div>
        <div class="metadata-value">${invoiceDateFormatted || invoiceDate}</div>
        ${invoice.date_sent ? `
        <div class="metadata-label">Date Sent:</div>
        <div class="metadata-value">${formatDate(invoice.date_sent, 'MMM dd, yyyy')}</div>
        ` : ''}
        ${invoice.status ? `
        <div class="metadata-label">Status:</div>
        <div class="metadata-value">
          <span class="status-badge status-${invoice.status.toLowerCase()}">${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</span>
        </div>
        ` : ''}
      </div>
    </div>
    
    <!-- Bill To Card -->
    <div class="bill-to-card">
      <div class="bill-to-title">Bill To</div>
      <div class="bill-to-name">${clientName || 'N/A'}</div>
      ${clientAddressLines.length > 0 ? `
      <div class="bill-to-address">
        ${clientAddressLines.map(line => `<div>${line}</div>`).join('')}
      </div>
      ` : ''}
      ${invoice.client_email ? `<div class="bill-to-email">${invoice.client_email}</div>` : ''}
    </div>
  </div>

  <!-- Items Table -->
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Item Description</th>
          <th>Units</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items.length > 0 ? items.map(item => {
          const itemDate = formatItemDate(item.item_date);
          return `
          <tr>
            <td class="item-date">${itemDate || formatDate(item.item_date, 'MMM dd, yyyy hh:mm a')}</td>
            <td>
              <div class="item-description">${item.description || 'Lesson'}</div>
              ${item.student_names && item.student_names.length > 0 ? `
              <div class="item-meta">Students: ${item.student_names.join(', ')}</div>
              ` : ''}
              ${item.tutor_name ? `
              <div class="item-meta">Tutor: ${item.tutor_name}</div>
              ` : ''}
            </td>
            <td>${item.units || 1}</td>
            <td class="text-right">${formatCurrency(item.amount)}</td>
          </tr>
          `;
        }).join('') : `
        <tr>
          <td colspan="4" style="text-align: center; padding: 32px; color: #9ca3af; font-style: italic;">No items found</td>
        </tr>
        `}
      </tbody>
    </table>
  </div>

  <!-- Totals Section -->
  <div class="totals-section">
    <div class="totals-box">
      <div class="totals-row">
        <span class="totals-row-label">Subtotal</span>
        <span class="totals-row-value">${formatCurrency(subtotal)}</span>
      </div>
      ${tax > 0 ? `
      <div class="totals-row">
        <span class="totals-row-label">Tax</span>
        <span class="totals-row-value">${formatCurrency(tax)}</span>
      </div>
      ` : ''}
      <div class="totals-row total">
        <span class="totals-row-label">Total</span>
        <span class="totals-row-value">${formatCurrency(total)}</span>
      </div>
    </div>
  </div>

  ${invoice.status === 'pending' || invoice.status === 'unpaid' || invoice.status === 'raised' ? `
  <div class="payment-instruction">
    <strong>Payment Instructions:</strong><br>
    Please quote reference <strong>${invoice.invoice_number || `INV-${invoice.id}`}</strong> with your payment.<br>
    Payment can be made online through your account portal or by contacting us at ${COMPANY_INFO.email}
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <div class="footer-message">Thank you for choosing Acme Operations!</div>
    <div class="footer-contact">
      Questions? Email <a href="mailto:${COMPANY_INFO.email}">${COMPANY_INFO.email}</a> or call ${COMPANY_INFO.phone}
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Get credit request template HTML
 */
function getCreditRequestTemplate(creditRequest, items = []) {
  const creditDate = formatDate(creditRequest.date_created || creditRequest.date_raised);
  const clientName = `${creditRequest.client_first_name || ''} ${creditRequest.client_last_name || ''}`.trim();
  const clientAddress = [
    creditRequest.client_street,
    creditRequest.client_town,
    creditRequest.client_state,
    creditRequest.client_postcode,
    creditRequest.client_country
  ].filter(Boolean).join(', ');

  const total = parseFloat(creditRequest.amount) || 0;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      background: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6A469D;
    }
    .logo-section {
      flex: 1;
    }
    .logo {
      max-width: 200px;
      height: auto;
      display: block;
    }
    .logo-error {
      display: none;
    }
    .company-info {
      text-align: right;
      color: #2D2F8E;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 5px;
    }
    .document-title {
      font-size: 28px;
      font-weight: bold;
      color: #2D2F8E;
      margin-bottom: 20px;
    }
    .document-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .document-details, .client-details {
      flex: 1;
    }
    .document-details {
      padding-right: 20px;
    }
    .section-title {
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 10px;
      font-size: 14px;
      text-transform: uppercase;
    }
    .detail-row {
      margin-bottom: 5px;
    }
    .detail-label {
      font-weight: bold;
      display: inline-block;
      width: 150px;
    }
    .description-box {
      background-color: #f9f9f9;
      padding: 15px;
      border-left: 4px solid #50C8DF;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background-color: #6A469D;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .text-right {
      text-align: right;
    }
    .summary-section {
      margin-top: 30px;
      margin-left: auto;
      width: 300px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #ddd;
    }
    .summary-row.total {
      font-weight: bold;
      font-size: 16px;
      border-top: 2px solid #6A469D;
      border-bottom: 2px solid #6A469D;
      padding-top: 10px;
      padding-bottom: 10px;
      margin-top: 10px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-section">
      ${COMPANY_INFO.logoUrl ? `<img src="${COMPANY_INFO.logoUrl}" alt="Acme Operations Logo" class="logo" onerror="this.style.display='none';" />` : ''}
    </div>
    <div class="company-info">
      <div class="company-name">${COMPANY_INFO.name}</div>
      <div>${COMPANY_INFO.address}</div>
      <div>${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}</div>
      <div>${COMPANY_INFO.country}</div>
      <div style="margin-top: 10px;">
        <div>${COMPANY_INFO.phone}</div>
        <div>${COMPANY_INFO.email}</div>
        <div>${COMPANY_INFO.website}</div>
      </div>
    </div>
  </div>

  <div class="document-title">Credit Request</div>

  <div class="document-info">
    <div class="document-details">
      <div class="section-title">Credit Request Details</div>
      <div class="detail-row">
        <span class="detail-label">Credit Request Number:</span>
        <span>${creditRequest.credit_request_number || `PFI-${creditRequest.id}`}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date Created:</span>
        <span>${creditDate}</span>
      </div>
      ${creditRequest.date_raised ? `
      <div class="detail-row">
        <span class="detail-label">Date Raised:</span>
        <span>${formatDate(creditRequest.date_raised)}</span>
      </div>
      ` : ''}
      ${creditRequest.status ? `
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span>${creditRequest.status.charAt(0).toUpperCase() + creditRequest.status.slice(1)}</span>
      </div>
      ` : ''}
    </div>
    <div class="client-details">
      <div class="section-title">Credit To</div>
      <div style="font-weight: bold; margin-bottom: 5px;">${clientName}</div>
      ${clientAddress ? `<div>${clientAddress}</div>` : ''}
      ${creditRequest.client_email ? `<div>${creditRequest.client_email}</div>` : ''}
    </div>
  </div>

  ${creditRequest.description || creditRequest.reason ? `
  <div class="description-box">
    <strong>Description:</strong><br>
    ${creditRequest.description || creditRequest.reason}
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Reason</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td>${item.description || 'Credit adjustment'}</td>
        <td>${item.reason || '-'}</td>
        <td class="text-right">${formatCurrency(item.amount)}</td>
      </tr>
      `).join('')}
      ${items.length === 0 ? `
      <tr>
        <td colspan="3" style="text-align: center; padding: 20px;">No items specified</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  <div class="summary-section">
    <div class="summary-row total">
      <span>Credit Amount:</span>
      <span>${formatCurrency(total)}</span>
    </div>
  </div>

  <div class="footer">
    <div>This credit will be applied to your account balance.</div>
    <div style="margin-top: 5px;">${COMPANY_INFO.name} | ${COMPANY_INFO.address}, ${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}</div>
  </div>
</body>
</html>
  `;
}

/**
 * Get payment order template HTML
 */
function getPaymentOrderTemplate(paymentOrder, items = []) {
  const poDate = formatDate(paymentOrder.date_created || paymentOrder.date_sent);
  const tutorName = `${paymentOrder.payee_first || ''} ${paymentOrder.payee_last || ''}`.trim();

  const totalToPay = parseFloat(paymentOrder.total_to_pay_tutor || paymentOrder.amount) || 0;
  const totalTax = parseFloat(paymentOrder.total_tax) || 0;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      background: white;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6A469D;
    }
    .logo-section {
      flex: 1;
    }
    .logo {
      max-width: 200px;
      height: auto;
      display: block;
    }
    .logo-error {
      display: none;
    }
    .company-info {
      text-align: right;
      color: #2D2F8E;
    }
    .company-name {
      font-size: 24px;
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 5px;
    }
    .document-title {
      font-size: 28px;
      font-weight: bold;
      color: #2D2F8E;
      margin-bottom: 20px;
    }
    .document-info {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .document-details, .tutor-details {
      flex: 1;
    }
    .document-details {
      padding-right: 20px;
    }
    .section-title {
      font-weight: bold;
      color: #6A469D;
      margin-bottom: 10px;
      font-size: 14px;
      text-transform: uppercase;
    }
    .detail-row {
      margin-bottom: 5px;
    }
    .detail-label {
      font-weight: bold;
      display: inline-block;
      width: 150px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background-color: #6A469D;
      color: white;
      padding: 10px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:nth-child(even) {
      background-color: #f9f9f9;
    }
    .text-right {
      text-align: right;
    }
    .summary-section {
      margin-top: 30px;
      margin-left: auto;
      width: 350px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #ddd;
    }
    .summary-row.total {
      font-weight: bold;
      font-size: 16px;
      border-top: 2px solid #6A469D;
      border-bottom: 2px solid #6A469D;
      padding-top: 10px;
      padding-bottom: 10px;
      margin-top: 10px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-section">
      ${COMPANY_INFO.logoUrl ? `<img src="${COMPANY_INFO.logoUrl}" alt="Acme Operations Logo" class="logo" onerror="this.style.display='none';" />` : ''}
    </div>
    <div class="company-info">
      <div class="company-name">${COMPANY_INFO.name}</div>
      <div>${COMPANY_INFO.address}</div>
      <div>${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}</div>
      <div>${COMPANY_INFO.country}</div>
      <div style="margin-top: 10px;">
        <div>${COMPANY_INFO.phone}</div>
        <div>${COMPANY_INFO.email}</div>
        <div>${COMPANY_INFO.website}</div>
      </div>
    </div>
  </div>

  <div class="document-title">Payment Order</div>

  <div class="document-info">
    <div class="document-details">
      <div class="section-title">Payment Order Details</div>
      <div class="detail-row">
        <span class="detail-label">Payment Order Number:</span>
        <span>${paymentOrder.payment_order_number || `PO-${paymentOrder.id}`}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Date Created:</span>
        <span>${poDate}</span>
      </div>
      ${paymentOrder.date_sent ? `
      <div class="detail-row">
        <span class="detail-label">Date Sent:</span>
        <span>${formatDate(paymentOrder.date_sent)}</span>
      </div>
      ` : ''}
      ${paymentOrder.status ? `
      <div class="detail-row">
        <span class="detail-label">Status:</span>
        <span>${paymentOrder.status.charAt(0).toUpperCase() + paymentOrder.status.slice(1)}</span>
      </div>
      ` : ''}
    </div>
    <div class="tutor-details">
      <div class="section-title">Pay To</div>
      <div style="font-weight: bold; margin-bottom: 5px;">${tutorName}</div>
      ${paymentOrder.payee_email ? `<div>${paymentOrder.payee_email}</div>` : ''}
    </div>
  </div>

  <div class="section-title" style="margin-bottom: 10px;">Lessons</div>
  <table>
    <thead>
      <tr>
        <th>Topic</th>
        <th>Start</th>
        <th>Finish</th>
        <th>Units</th>
        <th class="text-right">Tax</th>
        <th class="text-right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.filter(item => !item.adhoc_charge_id).map(item => `
      <tr>
        <td>${item.description || 'Lesson'}</td>
        <td>${formatDate(item.item_date, 'MM/dd/yyyy hh:mm a')}</td>
        <td>${formatDate(item.item_date, 'MM/dd/yyyy hh:mm a')}</td>
        <td>${item.units || 1}</td>
        <td class="text-right">${formatCurrency(item.tax_amount)}</td>
        <td class="text-right">${formatCurrency(item.amount)}</td>
      </tr>
      `).join('')}
      ${items.filter(item => !item.adhoc_charge_id).length === 0 ? `
      <tr>
        <td colspan="6" style="text-align: center; padding: 20px;">No lessons</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  ${items.filter(item => item.adhoc_charge_id).length > 0 ? `
  <div class="section-title" style="margin-top: 30px; margin-bottom: 10px;">Ad Hoc Charges</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Date</th>
        <th class="text-right">Per Tutor</th>
        <th class="text-right">Tax</th>
        <th class="text-right">Charge Client</th>
      </tr>
    </thead>
    <tbody>
      ${items.filter(item => item.adhoc_charge_id).map(item => `
      <tr>
        <td>${item.description || 'Ad hoc charge'}</td>
        <td>${formatDate(item.item_date)}</td>
        <td class="text-right">${formatCurrency(item.amount)}</td>
        <td class="text-right">${formatCurrency(item.tax_amount)}</td>
        <td class="text-right">${formatCurrency(0)}</td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="summary-section">
    <div class="summary-row">
      <span>Total to Pay Tutor:</span>
      <span>${formatCurrency(totalToPay)}</span>
    </div>
    ${totalTax > 0 ? `
    <div class="summary-row">
      <span>Total Tax:</span>
      <span>${formatCurrency(totalTax)}</span>
    </div>
    ` : ''}
    <div class="summary-row">
      <span>Total to Charge Client:</span>
      <span>${formatCurrency(parseFloat(paymentOrder.total_to_charge_client) || 0)}</span>
    </div>
  </div>

  <div class="footer">
    <div>Payment will be processed according to your payment method on file.</div>
    <div style="margin-top: 5px;">${COMPANY_INFO.name} | ${COMPANY_INFO.address}, ${COMPANY_INFO.city}, ${COMPANY_INFO.state} ${COMPANY_INFO.zip}</div>
  </div>
</body>
</html>
  `;
}

module.exports = {
  getInvoiceTemplate,
  getCreditRequestTemplate,
  getPaymentOrderTemplate
};
