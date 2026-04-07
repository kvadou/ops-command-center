/**
 * Shared validation utilities
 */

/**
 * Validate email
 */
function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number
 */
function isValidPhone(phone) {
  if (!phone) return false;
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  const digits = phone.replace(/\D/g, '');
  return phoneRegex.test(phone) && digits.length >= 10;
}

/**
 * Validate URL
 */
function isValidUrl(url) {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate date string
 */
function isValidDate(dateString) {
  if (!dateString) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

/**
 * Validate required fields
 */
function validateRequired(data, fields) {
  const missing = [];
  for (const field of fields) {
    if (!data[field] && data[field] !== 0 && data[field] !== false) {
      missing.push(field);
    }
  }
  return missing.length === 0 ? null : { missing };
}

/**
 * Sanitize string input
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Validate numeric range
 */
function isInRange(value, min, max) {
  const num = Number(value);
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidUrl,
  isValidDate,
  validateRequired,
  sanitizeString,
  isInRange
};
