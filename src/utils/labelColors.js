/**
 * Label color mapping from TutorCruncher
 * This ensures all labels throughout the Acme Operations operations hub
 * match the exact colors defined in TutorCruncher
 */

export const tutorCruncherLabelColors = {
  '1099': '#32cd32',
  'Club - Park Slope': '#1e90ff',
  'Club - Park Slope Support': '#ff1493',
  'First Lesson Complete': '#ffffff',
  'Home - Hamptons': '#ffebcd',
  'Home - LA': 'gold',
  'Home - NYC': 'MediumOrchid',
  'Home - SF': '#40e0d0',
  'Home - Westchester': 'BlanchedAlmond',
  'Job Finished': 'yellow',
  'No Label': '#d3d3d3',
  'Non-Billable': '#2f4f4f',
  'Non Teaching Work': 'SlateGray',
  'Online': 'lightgreen',
  'Referral (Converted)': '#228b22',
  'Referral (Pending)': '#addcad',
  'School - Hamptons': '#ffa500',
  'School - LA': '#ffa500',
  'School - NYC': '#ffa500',
  'School - SF': '#ffa500',
  'Shenandoah Valley': 'DarkMagenta',
  'Sync to Website': 'Gold',
  'Takeover': '#158b11',
  'Tournament': '#dc143c',
  'W2': '#1e90ff',
  'Event': '#5b14ff', // Additional label from ClientConversionTracker
};

/**
 * Get the color for a label name from TutorCruncher
 * Falls back to a default color if not found
 * 
 * @param {string} labelName - The label name
 * @param {string} fallbackColor - Default color if label not found (default: '#2D2F8E')
 * @returns {string} The hex color code or CSS color name
 */
export function getLabelColor(labelName, fallbackColor = '#2D2F8E') {
  if (!labelName) return fallbackColor;
  
  // Try exact match first
  if (tutorCruncherLabelColors[labelName]) {
    return tutorCruncherLabelColors[labelName];
  }
  
  // Try case-insensitive match
  const lowerLabelName = labelName.toLowerCase();
  for (const [key, value] of Object.entries(tutorCruncherLabelColors)) {
    if (key.toLowerCase() === lowerLabelName) {
      return value;
    }
  }
  
  return fallbackColor;
}

/**
 * Get contrast color (black or white) for text on a given background color
 * 
 * @param {string} bgColor - Background color (hex, rgb, or named color)
 * @returns {string} 'white' or 'black'
 */
export function getContrastColor(bgColor) {
  if (!bgColor) return 'white';
  
  // Handle named colors
  const namedColors = {
    'white': '#ffffff',
    'gold': '#ffd700',
    'yellow': '#ffff00',
    'lightgreen': '#90ee90',
    'MediumOrchid': '#ba55d3',
    'BlanchedAlmond': '#ffebcd',
    'SlateGray': '#708090',
    'DarkMagenta': '#8b008b',
    'Gold': '#ffd700',
  };
  
  let hex = bgColor;
  if (namedColors[bgColor]) {
    hex = namedColors[bgColor];
  } else if (!bgColor.startsWith('#')) {
    // If it's not a hex color, try to convert or default
    return 'white';
  }
  
  // Convert hex to RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return white for dark backgrounds, black for light backgrounds
  return luminance > 0.5 ? 'black' : 'white';
}














