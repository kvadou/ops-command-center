/**
 * Lesson Report Screenshot Generator
 * Generates a single PNG image from lesson report HTML using Puppeteer
 */

const { logger } = require('./logger');

let puppeteer;
let chromium;
try {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} catch (e) {
  logger.warn({ data: e.message }, 'Puppeteer/Chromium not available for lesson report screenshots:');
}

/**
 * Generate a PNG screenshot from lesson report HTML content
 * @param {string} htmlContent - The HTML content to render
 * @param {Object} options - Optional configuration
 * @param {number} options.width - Viewport width (default: 600)
 * @param {boolean} options.fullPage - Capture full page (default: true)
 * @returns {Promise<string|null>} Base64 encoded PNG (without data: prefix) or null on error
 */
async function generateLessonReportScreenshot(htmlContent, options = {}) {
  if (!puppeteer || !chromium) {
    logger.warn('Puppeteer/Chromium not available, cannot generate lesson report screenshot');
    return null;
  }

  if (!htmlContent) {
    logger.warn('No HTML content provided for screenshot generation');
    return null;
  }

  const { width = 600, fullPage = true } = options;

  let browser = null;
  try {
    logger.info('Starting lesson report screenshot generation...');

    browser = await puppeteer.launch({
      headless: chromium.headless,
      executablePath: await chromium.executablePath(),
      args: chromium.args
    });

    const page = await browser.newPage();

    // Set viewport with 2x device scale factor for high-quality (retina) rendering
    await page.setViewport({ width, height: 800, deviceScaleFactor: 2 });

    // Wrap content in a styled container for consistent rendering
    const styledHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 20px;
              background: white;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              width: ${width}px;
            }
            /* Ensure images don't overflow */
            img {
              max-width: 100%;
              height: auto;
            }
            /* Add some visual polish */
            .report-wrapper {
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              padding: 20px;
            }
          </style>
        </head>
        <body>
          <div class="report-wrapper">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;

    await page.setContent(styledHtml, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait a moment for any remaining rendering
    await new Promise(resolve => setTimeout(resolve, 500));

    // Take the screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: fullPage,
      omitBackground: false
    });

    await browser.close();
    browser = null;

    // Convert buffer to base64 string (without the data: prefix for Brevo)
    const base64String = screenshot.toString('base64');

    logger.info(`Successfully generated lesson report screenshot (${Math.round(base64String.length / 1024)}KB)`);

    return base64String;

  } catch (error) {
    logger.error({ err: error }, 'Error generating lesson report screenshot:');

    // Ensure browser is closed on error
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        logger.error({ data: closeError }, 'Error closing browser:');
      }
    }

    return null;
  }
}

/**
 * Generate a PNG screenshot for a consolidated lesson report (multiple students)
 * @param {Array<Object>} studentReports - Array of student report data
 * @param {string} studentReports[].studentName - Student name
 * @param {string} studentReports[].tutorName - Tutor name
 * @param {string} studentReports[].feedbackHtml - HTML-formatted feedback
 * @param {Object} options - Optional configuration
 * @returns {Promise<string|null>} Base64 encoded PNG or null on error
 */
async function generateConsolidatedReportScreenshot(studentReports, options = {}) {
  if (!studentReports || studentReports.length === 0) {
    logger.warn('No student reports provided for consolidated screenshot');
    return null;
  }

  // Build consolidated HTML
  let consolidatedHtml = '';

  for (let i = 0; i < studentReports.length; i++) {
    const report = studentReports[i];

    if (i > 0) {
      consolidatedHtml += `
        <hr style="margin: 24px 0; border: none; border-top: 2px solid #e5e7eb;">
      `;
    }

    consolidatedHtml += `
      <div style="margin-bottom: 16px;">
        <h2 style="color: #6a469d; margin: 0 0 8px 0; font-size: 20px;">
          ${escapeHtml(report.studentName)}
        </h2>
        <p style="color: #6b7280; margin: 0 0 16px 0; font-size: 14px;">
          Coach: ${escapeHtml(report.tutorName)}
        </p>
        <div style="color: #374151; font-size: 15px; line-height: 1.6;">
          ${report.feedbackHtml || '<em style="color: #9ca3af;">No feedback provided</em>'}
        </div>
      </div>
    `;
  }

  // Add header
  const headerHtml = `
    <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #6a469d;">
      <h1 style="color: #6a469d; margin: 0; font-size: 24px;">
        Acme Operations Lesson Report
      </h1>
      <p style="color: #6b7280; margin: 8px 0 0 0; font-size: 14px;">
        ${studentReports.length} student${studentReports.length > 1 ? 's' : ''}
      </p>
    </div>
  `;

  return generateLessonReportScreenshot(headerHtml + consolidatedHtml, options);
}

/**
 * Helper to escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

module.exports = {
  generateLessonReportScreenshot,
  generateConsolidatedReportScreenshot
};
