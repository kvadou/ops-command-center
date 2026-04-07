/**
 * QR Code Generator Service
 * 
 * Self-hosted QR code generation with advanced customization and tracking.
 * Uses qrcode npm package for generation and Cloudinary for storage.
 */

const QRCode = require('qrcode');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

/**
 * Generate a unique short code for QR code tracking URLs
 * @param {number} length - Length of the short code (default: 8)
 * @returns {string} - Unique alphanumeric short code
 */
function generateShortCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

/**
 * Build the tracking URL for a QR code
 * @param {string} shortCode - The unique short code
 * @param {string} baseUrl - The base URL of the application
 * @returns {string} - Full tracking URL
 */
function buildTrackingUrl(shortCode, baseUrl = 'https://join.acmeops.com') {
  return `${baseUrl}/qr/${shortCode}`;
}

/**
 * Map pattern style names to QRCode library options
 */
const PATTERN_STYLES = {
  'square': { type: 'square' },
  'dots': { type: 'dots', scale: 0.8 },
  'rounded': { type: 'rounded', radius: 0.5 },
  'classy': { type: 'classy' },
  'classy-rounded': { type: 'classy-rounded' },
  'extra-rounded': { type: 'extra-rounded' }
};

/**
 * Default QR code options
 */
const DEFAULT_OPTIONS = {
  errorCorrectionLevel: 'M', // M allows for logo overlay
  margin: 2,
  width: 400,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
};

/**
 * Generate a QR code with customization options
 * 
 * @param {Object} options - QR code generation options
 * @param {string} options.content - The content to encode (URL, text, etc.)
 * @param {string} options.trackingUrl - Optional tracking URL (will be used as content if provided)
 * @param {number} options.width - Width in pixels (default: 400)
 * @param {string} options.foregroundColor - Foreground color hex (default: #000000)
 * @param {string} options.backgroundColor - Background color hex (default: #FFFFFF)
 * @param {string} options.errorCorrectionLevel - L, M, Q, H (default: M)
 * @param {number} options.margin - Margin in modules (default: 2)
 * @param {string} options.format - Output format: 'svg', 'png', 'dataurl' (default: 'png')
 * @returns {Promise<Object>} - Generated QR code data
 */
async function generateQRCode(options = {}) {
  const {
    content,
    trackingUrl,
    width = 400,
    foregroundColor = '#000000',
    backgroundColor = '#FFFFFF',
    errorCorrectionLevel = 'M',
    margin = 2,
    format = 'png'
  } = options;

  const qrContent = trackingUrl || content;
  
  if (!qrContent) {
    throw new Error('QR code content or tracking URL is required');
  }

  const qrOptions = {
    ...DEFAULT_OPTIONS,
    errorCorrectionLevel,
    margin,
    width,
    color: {
      dark: foregroundColor,
      light: backgroundColor
    }
  };

  try {
    let result;
    
    if (format === 'svg') {
      result = await QRCode.toString(qrContent, { ...qrOptions, type: 'svg' });
      return {
        success: true,
        format: 'svg',
        data: result,
        mimeType: 'image/svg+xml'
      };
    } else if (format === 'dataurl') {
      result = await QRCode.toDataURL(qrContent, qrOptions);
      return {
        success: true,
        format: 'dataurl',
        data: result,
        mimeType: 'image/png'
      };
    } else {
      // PNG buffer
      result = await QRCode.toBuffer(qrContent, qrOptions);
      return {
        success: true,
        format: 'png',
        data: result,
        mimeType: 'image/png'
      };
    }
  } catch (error) {
    logger.error({ err: error }, 'QR code generation error:');
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Generate a QR code and upload to Cloudinary
 * 
 * @param {Object} cloudinary - Cloudinary instance
 * @param {Object} options - QR code options (same as generateQRCode)
 * @param {string} options.name - Name for the QR code (used in Cloudinary public_id)
 * @returns {Promise<Object>} - Cloudinary upload result with QR code URL
 */
async function generateAndUploadQRCode(cloudinary, options = {}) {
  const { name = 'qr-code', ...qrOptions } = options;
  
  // Generate the QR code as PNG buffer
  const qrResult = await generateQRCode({ ...qrOptions, format: 'png' });
  
  if (!qrResult.success) {
    throw new Error('Failed to generate QR code');
  }

  // Upload to Cloudinary
  return new Promise((resolve, reject) => {
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    const timestamp = Date.now();
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'acme-ops/qr-codes',
        public_id: `qr-${sanitizedName}-${timestamp}`,
        resource_type: 'image',
        format: 'png'
      },
      (error, result) => {
        if (error) {
          logger.error({ err: error }, 'Cloudinary upload error:');
          reject(new Error(`Failed to upload QR code: ${error.message}`));
        } else {
          resolve({
            success: true,
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height
          });
        }
      }
    );
    
    uploadStream.end(qrResult.data);
  });
}

/**
 * Generate SVG QR code for inline display or download
 * 
 * @param {string} content - Content to encode
 * @param {Object} options - Customization options
 * @returns {Promise<string>} - SVG string
 */
async function generateSVG(content, options = {}) {
  const result = await generateQRCode({
    content,
    ...options,
    format: 'svg'
  });
  return result.data;
}

/**
 * Generate Data URL for preview display
 * 
 * @param {string} content - Content to encode
 * @param {Object} options - Customization options
 * @returns {Promise<string>} - Data URL string
 */
async function generateDataURL(content, options = {}) {
  const result = await generateQRCode({
    content,
    ...options,
    format: 'dataurl'
  });
  return result.data;
}

/**
 * Parse User-Agent string to extract device, browser, and OS info
 * 
 * @param {string} userAgent - User-Agent header string
 * @returns {Object} - Parsed device info
 */
function parseUserAgent(userAgent) {
  if (!userAgent) {
    return { deviceType: 'unknown', browser: 'unknown', os: 'unknown' };
  }

  // Device type detection
  let deviceType = 'desktop';
  if (/mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    deviceType = 'tablet';
  }

  // Browser detection
  let browser = 'unknown';
  if (/edge|edg/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/chrome|crios/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/firefox|fxios/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/opera|opr/i.test(userAgent)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(userAgent)) {
    browser = 'IE';
  }

  // OS detection
  let os = 'unknown';
  if (/windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/mac os|macos/i.test(userAgent)) {
    os = 'macOS';
  } else if (/android/i.test(userAgent)) {
    os = 'Android';
  } else if (/iphone|ipad|ipod/i.test(userAgent)) {
    os = 'iOS';
  } else if (/linux/i.test(userAgent)) {
    os = 'Linux';
  }

  return { deviceType, browser, os };
}

/**
 * Generate scan analytics summary
 * 
 * @param {Array} scans - Array of scan records
 * @returns {Object} - Analytics summary
 */
function generateAnalyticsSummary(scans) {
  if (!scans || scans.length === 0) {
    return {
      totalScans: 0,
      uniqueScans: 0,
      deviceBreakdown: {},
      browserBreakdown: {},
      osBreakdown: {},
      countryBreakdown: {},
      hourlyBreakdown: Array(24).fill(0),
      dailyBreakdown: {}
    };
  }

  const uniqueIPs = new Set();
  const deviceBreakdown = {};
  const browserBreakdown = {};
  const osBreakdown = {};
  const countryBreakdown = {};
  const hourlyBreakdown = Array(24).fill(0);
  const dailyBreakdown = {};

  scans.forEach(scan => {
    // Track unique IPs
    if (scan.ip_address) {
      uniqueIPs.add(scan.ip_address);
    }

    // Device breakdown
    const device = scan.device_type || 'unknown';
    deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;

    // Browser breakdown
    const browser = scan.browser || 'unknown';
    browserBreakdown[browser] = (browserBreakdown[browser] || 0) + 1;

    // OS breakdown
    const os = scan.os || 'unknown';
    osBreakdown[os] = (osBreakdown[os] || 0) + 1;

    // Country breakdown
    const country = scan.country || 'unknown';
    countryBreakdown[country] = (countryBreakdown[country] || 0) + 1;

    // Hourly breakdown
    if (scan.scanned_at) {
      const hour = new Date(scan.scanned_at).getHours();
      hourlyBreakdown[hour]++;

      // Daily breakdown
      const date = new Date(scan.scanned_at).toISOString().split('T')[0];
      dailyBreakdown[date] = (dailyBreakdown[date] || 0) + 1;
    }
  });

  return {
    totalScans: scans.length,
    uniqueScans: uniqueIPs.size,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    countryBreakdown,
    hourlyBreakdown,
    dailyBreakdown
  };
}

module.exports = {
  generateShortCode,
  buildTrackingUrl,
  generateQRCode,
  generateAndUploadQRCode,
  generateSVG,
  generateDataURL,
  parseUserAgent,
  generateAnalyticsSummary,
  PATTERN_STYLES,
  DEFAULT_OPTIONS
};
