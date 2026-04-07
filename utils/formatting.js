/**
 * Shared formatting utilities
 */

/**
 * Format currency
 */
function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Format date
 */
function formatDate(date, format = 'short') {
  const d = new Date(date);
  const formats = {
    short: d.toLocaleDateString('en-US'),
    long: d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    iso: d.toISOString().split('T')[0],
    datetime: d.toLocaleString('en-US')
  };
  return formats[format] || formats.short;
}

/**
 * Format phone number
 */
function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

/**
 * Truncate text
 */
function truncate(text, maxLength = 100, suffix = '...') {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitalize first letter
 */
function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/**
 * Format duration (minutes to readable format)
 */
function formatDuration(minutes) {
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${mins}m`;
  }
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Convert markdown to HTML for email content
 * Handles:
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - Line breaks → <br> tags
 * - Literal <br> tags → proper HTML <br> tags
 * 
 * @param {string} markdown - Markdown text to convert
 * @returns {string} HTML string
 */
function markdownToHtml(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  
  let html = markdown;
  
  // First, normalize literal <br> tags (with or without spaces)
  // Handle variations: <br>, <br >, <br/>, <br />, <br><br>, etc.
  // Convert literal <br> tags to actual line breaks first
  html = html.replace(/<br\s*\/?>/gi, '\n');
  
  // Also handle HTML-encoded <br> tags
  html = html.replace(/&lt;br\s*\/?&gt;/gi, '\n');
  html = html.replace(/&lt;br\s*&gt;/gi, '\n');
  
  // Convert **bold** to <strong>bold</strong>
  // Use non-greedy matching to handle multiple bold sections
  // Process bold first so we don't accidentally match it as italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert *italic* to <em>italic</em>
  // Match single asterisks that aren't part of **bold**
  // Since we've already converted **bold**, we can safely match *text* patterns
  // Use a pattern that matches * followed by non-asterisk content, then *
  html = html.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  
  // Convert line breaks (including normalized <br> tags) to <br> tags
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

/**
 * Strip markdown syntax from text for plain text emails
 * Removes ** and * but keeps the text content
 * 
 * @param {string} markdown - Markdown text to strip
 * @returns {string} Plain text without markdown syntax
 */
function stripMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';
  
  let text = markdown;
  
  // Remove **bold** markers (keep the text)
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  
  // Remove *italic* markers (keep the text)
  // Since we've already removed **bold**, we can safely match remaining *text* patterns
  text = text.replace(/\*([^*\n]+?)\*/g, '$1');
  
  return text;
}

module.exports = {
  formatCurrency,
  formatDate,
  formatPhoneNumber,
  truncate,
  capitalize,
  formatDuration,
  formatFileSize,
  markdownToHtml,
  stripMarkdown
};
