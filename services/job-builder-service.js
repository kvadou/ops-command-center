/**
 * Job Builder Service
 * Handles job creation, preview, and template processing
 */

const { buildDeps } = require('../config/deps');
const { logger } = require('../utils/logger');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path');

// Load job labels mapping for color conversion
// CRITICAL: This mapping ensures labels are always converted to their correct calendar colors
// This mapping is also documented in .cursorrules for reference
let jobLabelsMap = null;
function loadJobLabelsMap() {
  if (jobLabelsMap) return jobLabelsMap;
  
  // Primary source: job-labels.json file
  try {
    const jobLabelsPath = path.join(__dirname, '../shared/job-labels.json');
    const jobLabelsData = JSON.parse(fs.readFileSync(jobLabelsPath, 'utf8'));
    jobLabelsMap = {};
    jobLabelsData.forEach(label => {
      if (label.name && label.displayColour) {
        jobLabelsMap[label.name] = label.displayColour;
      }
    });
    logger.debug({ labelCount: Object.keys(jobLabelsMap).length }, 'Loaded job labels color mapping from job-labels.json');
  } catch (err) {
    logger.warn({ error: err.message }, 'Failed to load job-labels.json, using fallback mapping');
    // Fallback: Hardcoded mapping (should match job-labels.json)
    // This ensures the mapping works even if the file is missing
    jobLabelsMap = getFallbackLabelColorMap();
  }
  
  // Verify critical mappings exist
  const criticalLabels = ['School - NYC', 'School - LA', 'School - SF', 'School - Hamptons', 
                          'Home - NYC', 'Home - LA', 'Home - SF', 'Home - Hamptons', 'Home - Westchester',
                          'Club - Park Slope', 'Club - UES', 'Online'];
  const missingLabels = criticalLabels.filter(label => !jobLabelsMap[label]);
  if (missingLabels.length > 0) {
    logger.warn({ missingLabels }, 'Some critical labels missing from mapping, using fallback');
    const fallbackMap = getFallbackLabelColorMap();
    missingLabels.forEach(label => {
      if (fallbackMap[label]) {
        jobLabelsMap[label] = fallbackMap[label];
      }
    });
  }
  
  return jobLabelsMap;
}

/**
 * Fallback label-to-color mapping
 * This should match shared/job-labels.json exactly
 * Used if job-labels.json cannot be loaded
 */
function getFallbackLabelColorMap() {
  return {
    // School labels - all use orange (#ffa500)
    'School - NYC': '#ffa500',
    'School - LA': '#ffa500',
    'School - SF': '#ffa500',
    'School - Hamptons': '#ffa500',
    
    // Home labels
    'Home - NYC': 'MediumOrchid',
    'Home - LA': 'gold',
    'Home - SF': '#40e0d0',
    'Home - Hamptons': '#ffebcd',
    'Home - Westchester': 'BlanchedAlmond',
    
    // Club labels
    'Club - Park Slope': '#1e90ff',
    'Club - UES': '#1e90ff',
    'Club - Park Slope Support': '#ff1493',
    'Club - UES Support': '#ff1493',
    
    // Other labels
    'Online': 'lightgreen',
    'First Lesson Complete': '#ffffff',
    'Job Finished': 'yellow',
    'No Label': '#d3d3d3',
    'Non-Billable': '#2f4f4f',
    'Non Teaching Work': 'SlateGray',
    'Referral (Converted)': '#228b22',
    'Referral (Pending)': '#addcad',
    'Sync to Website': 'Gold',
    'Takeover': '#158b11',
    'Tournament': '#dc143c',
    '1099': '#32cd32',
    'W2': '#1e90ff',
    'Shenandoah Valley': 'DarkMagenta'
  };
}

/**
 * Convert label name to color value
 * If the value is a label name (e.g., "School - NYC"), map it to its displayColour
 * Otherwise return the value as-is (it's already a color)
 */
function mapLabelNameToColor(value) {
  if (!value || typeof value !== 'string') return value;
  
  const labelsMap = loadJobLabelsMap();
  const trimmedValue = value.trim();
  
  // Check if it's a label name that needs mapping
  if (labelsMap[trimmedValue]) {
    const color = labelsMap[trimmedValue];
    logger.debug({ labelName: trimmedValue, color }, 'Mapped label name to color');
    return color;
  }
  
  // Not a label name, return as-is (it's already a color)
  return value;
}

const isEmpty = (value) =>
  value === undefined || value === null || value === "" || (typeof value === "string" && value.trim() === "");

const ALLOWED_CHARGE_TYPES = new Set(["hourly", "one-off", "hourly-split", "one-off-split"]);
const ALLOWED_TUTOR_PERMISSIONS = new Set(["add-edit-complete", "add-edit", "edit", "complete"]);
const ALLOWED_STATUS_VALUES = new Set(["pending", "available", "in-progress", "finished", "gone-cold"]);

const toNumberOrNull = (value) => {
  if (isEmpty(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return Boolean(value);
};

class JobBuilderService {
  constructor(pool) {
    this.pool = pool;
    const deps = buildDeps();
    this.tutorCruncherAPI = deps.tutorCruncherAPI;
    this.rateLimitRetry = deps.rateLimitRetry;
  }

  /**
   * Build Brick description text from layout and data
   */
  buildBrickDescription(brickLayout, variableMappings, formData) {
    if (!brickLayout || brickLayout.length === 0) {
      return "";
    }

    const lines = [];
    let isFirstContentElement = true; // Track if this is the first content element (not a label)
    let dayTimeProcessed = false; // Track if day_and_time has been processed to avoid duplicate

    brickLayout.forEach((element) => {
      if (element.type === "label") {
        let text = element.text || "";
        if (element.bold) text = `**${text}**`;
        if (element.caps) text = text.toUpperCase();
        
        if (element.bulletPoints) {
          const textLines = text.split('\n');
          textLines.forEach(line => {
            if (line.trim()) {
              lines.push(`• ${line}`);
            }
          });
        } else {
          lines.push(text);
        }
        // Labels don't count as first content element
      } else if (element.type === "variable") {
        const mapping = variableMappings[element.key];
        let value = "";

        if (element.key === "custom_field") {
          value = element.customText || formData[element.key] || "";
        } else if (mapping) {
          if (mapping.source === "form") {
            value = formData[mapping.field] || mapping.fallback || "";
          } else if (mapping.source === "tutorcruncher") {
            value = formData[element.key] || mapping.fallback || "";
          } else if (mapping.source === "custom") {
            value = mapping.default || "";
          }
        } else {
          // Special handling for availability - format from day_time_entries to match TutorCruncher format
          if (element.key === "availability" && formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
            // Format each day/time entry to match TutorCruncher: "Monday: between 04:30 PM – 07:00 PM"
            const formatTime = (timeStr) => {
              if (!timeStr) return "";
              const [hours, minutes] = timeStr.split(":");
              const hour = parseInt(hours, 10);
              const hour12 = hour % 12 || 12;
              const amPm = hour < 12 ? "AM" : "PM";
              // Use zero-padded hour to match TutorCruncher format (04:30 PM)
              return `${String(hour12).padStart(2, '0')}:${minutes} ${amPm}`;
            };

            const formattedEntries = formData.day_time_entries
              .filter(entry => entry.day && entry.start_time)
              .map(entry => {
                const startTime = formatTime(entry.start_time);
                const endTime = entry.end_time ? formatTime(entry.end_time) : null;
                // Match TutorCruncher format: "Monday: between 04:30 PM – 07:00 PM"
                return endTime ? `${entry.day}: between ${startTime} – ${endTime}` : `${entry.day}: ${startTime}`;
              });

            // Join with newlines so each day/time is on its own line
            value = formattedEntries.join('\n');
          } else if (element.key === "day_of_week" && formData.day_time_entries && Array.isArray(formData.day_time_entries)) {
            const days = formData.day_time_entries
              .filter(entry => entry.day)
              .map(entry => entry.day)
              .join(", ");
            value = days || formData[element.key] || "";
          } else if (element.key === "time" && formData.day_time_entries && Array.isArray(formData.day_time_entries)) {
            // Format time entries to match TutorCruncher format: "Monday: between 04:30 PM – 07:00 PM"
            const formatTime = (timeStr) => {
              if (!timeStr) return "";
              const [hours, minutes] = timeStr.split(":");
              const hour = parseInt(hours, 10);
              const hour12 = hour % 12 || 12;
              const amPm = hour < 12 ? "AM" : "PM";
              // Use zero-padded hour to match TutorCruncher format (04:30 PM)
              return `${String(hour12).padStart(2, '0')}:${minutes} ${amPm}`;
            };

            const timeEntries = formData.day_time_entries
              .filter(entry => entry.day && entry.start_time)
              .map(entry => {
                const startTime = formatTime(entry.start_time);
                const endTime = entry.end_time ? formatTime(entry.end_time) : null;
                // Match TutorCruncher format: "Monday: between 04:30 PM – 07:00 PM"
                return endTime ? `${entry.day}: between ${startTime} – ${endTime}` : `${entry.day}: ${startTime}`;
              });

            // Join with newlines so each day/time is on its own line
            value = timeEntries.join('\n') || formData[element.key] || "";
          } else if (element.key === "lesson_dates" && formData.lesson_dates && Array.isArray(formData.lesson_dates) && formData.lesson_dates.length > 0) {
            // Format lesson dates - convert YYYY-MM-DD to MM/DD/YY format
            const formatDate = (dateStr) => {
              try {
                const date = new Date(dateStr + 'T00:00:00'); // Add time to avoid timezone issues
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const year = String(date.getFullYear()).slice(-2); // Last 2 digits of year
                return `${month}/${day}/${year}`;
              } catch (e) {
                return dateStr;
              }
            };
            
            // Sort dates chronologically and format as MM/DD (no year) for lesson dates
            const sortedDates = [...formData.lesson_dates]
              .map(d => {
                try {
                  // Handle string date input (YYYY-MM-DD format)
                  const dateStr = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString().split('T')[0] : String(d));
                  const date = new Date(dateStr + 'T00:00:00');
                  if (isNaN(date.getTime())) {
                    return null; // Invalid date
                  }
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  return { date, formatted: `${month}/${day}` };
                } catch (e) {
                  return null;
                }
              })
              .filter(d => d !== null) // Remove invalid dates
              .sort((a, b) => a.date - b.date) // Sort by date
              .map(d => d.formatted); // Extract formatted strings
            
            // For School category, always format as comma-separated on one line
            // Format as comma-separated (single line)
            value = sortedDates.join(', ');
          } else if (element.key === "start_date" && formData.start_date) {
            // Format start date from YYYY-MM-DD to MM/DD/YYYY format (full year) for TutorCruncher
            try {
              const date = new Date(formData.start_date + 'T00:00:00');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              const year = String(date.getFullYear());
              value = `${month}/${day}/${year}`;
            } catch (e) {
              value = formData.start_date;
            }
          } else {
            value = formData[element.key] || "";
          }
        }

        if (element.format === "conditional_text") {
          if (element.show_if_true && value === true) {
            let text = element.label || "";
            if (element.style === "bold_caps") text = `**${text.toUpperCase()}**`;
            lines.push(text);
          }
        } else {
          // Always show the field, even if empty (use placeholder if value is empty)
          // Special handling: for client_full_name at the top, show only the value without label/prefix
          const isClientFullNameAtTop = element.key === "client_full_name" && isFirstContentElement && value;
          
          let prefix = element.prefix || "";
          let suffix = element.suffix || "";
          let displayValue = value || `[${element.label || element.key}]`;
          
          // If it's client_full_name at the top, show only the value (no prefix, no label)
          if (isClientFullNameAtTop) {
            // Just show the value, no prefix/suffix
            displayValue = value;
            prefix = "";
            suffix = "";
          }
          
          // Special handling for School category fields to match TutorCruncher format
          // School name should be bolded (first element, no bullet)
          if (element.key === "school_name" && isFirstContentElement && value) {
            lines.push(`**${displayValue}**`);
          }
          // Address should be bullet point with bolded value
          else if (element.key === "address" && value) {
            const label = prefix ? prefix.trim() : (element.label || "Address");
            const cleanLabel = label.replace(/:\s*$/, "");
            lines.push(`- ${cleanLabel}: **${displayValue}**`);
          }
          // Day and Time should be bullet point with bolded value (include end time if available)
          // Process when we encounter day_of_week element, skip time element if already processed
          else if (element.key === "day_of_week" && formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0 && !dayTimeProcessed) {
            const dayTimeEntry = formData.day_time_entries.find(entry => entry.day && entry.start_time);
            if (dayTimeEntry) {
              // Format day and time together
              const formatTime = (timeStr) => {
                if (!timeStr) return "";
                const [hours, minutes] = timeStr.split(":");
                const hour = parseInt(hours, 10);
                const hour12 = hour % 12 || 12;
                const amPm = hour < 12 ? "AM" : "PM";
                return `${hour12}:${minutes} ${amPm}`;
              };
              const pluralizeDay = (day) => {
                if (!day) return "";
                const dayMap = {
                  "Monday": "Mondays", "Tuesday": "Tuesdays", "Wednesday": "Wednesdays",
                  "Thursday": "Thursdays", "Friday": "Fridays", "Saturday": "Saturdays", "Sunday": "Sundays"
                };
                return dayMap[day] || `${day}s`;
              };
              const startTime = formatTime(dayTimeEntry.start_time);
              const endTime = dayTimeEntry.end_time ? formatTime(dayTimeEntry.end_time) : null;
              const pluralDay = pluralizeDay(dayTimeEntry.day);
              const dayTimeStr = endTime ? `${pluralDay} ${startTime} - ${endTime}` : `${pluralDay} ${startTime}`;
              lines.push(`- Day and Time: **${dayTimeStr}**`);
              dayTimeProcessed = true; // Mark as processed so we don't process time separately
              // Update first content element tracking before returning
              if (isFirstContentElement) {
                isFirstContentElement = false;
              }
              return; // Skip further processing for this element
            }
          }
          // Skip time element if day_and_time was already processed
          else if (element.key === "time" && dayTimeProcessed) {
            // Note: isFirstContentElement was already updated when day_of_week was processed
            return; // Skip - already handled by day_of_week element
          }
          // Start date should be bullet point with bolded value in MM/DD/YYYY format
          else if (element.key === "start_date" && value) {
            const label = prefix ? prefix.trim() : (element.label || "Start Date");
            const cleanLabel = label.replace(/:\s*$/, "");
            lines.push(`- ${cleanLabel}: **${displayValue}**`);
          }
          // Lesson dates: show as bullet point with label and dates on same line, bolded
          else if (element.key === "lesson_dates" && value) {
            // Format as bullet point with TutorCruncher format: "- School Lesson Dates: **10/27, 11/03, ...**"
            const label = prefix ? prefix.trim() : (element.label || "School Lesson Dates");
            // Remove colon from label if present (we'll add it)
            const cleanLabel = label.replace(/:\s*$/, "");
            lines.push(`- ${cleanLabel}: **${displayValue}**`);
          } else {
            let text = `${prefix}${displayValue}${suffix}`;
            
            if (element.bold) text = `**${text}**`;
            if (element.caps) text = text.toUpperCase();
            
            // For School category fields, use bullet points for most fields (except school_name which is already handled)
            const schoolFields = ["age_group", "number_of_students", "teaching_notes", "lesson_type"];
            const shouldUseBullet = element.bulletPoints || (schoolFields.includes(element.key) && value);
            
            // Use hyphen (-) for bullet points to match TutorCruncher format
            if (shouldUseBullet) {
              const textLines = text.split('\n');
              textLines.forEach(line => {
                if (line.trim()) {
                  lines.push(`- ${line}`);
                }
              });
            } else {
              lines.push(text);
            }
          }
          
          // Mark that we've processed the first content element
          if (isFirstContentElement && value) {
            isFirstContentElement = false;
          }
        }
      } else if (element.type === "section") {
        lines.push(`\n${element.title}:`);
        const content = formData[element.content] || "";
        if (content) {
          lines.push(content);
        }
      } else if (element.type === "custom") {
        const value = element.customText || formData[element.key] || element.default || "";
        if (value) {
          let text = value;
          if (element.bold) text = `**${text}**`;
          if (element.caps) text = text.toUpperCase();
          
          if (element.bulletPoints) {
            const textLines = text.split('\n');
            textLines.forEach(line => {
              if (line.trim()) {
                lines.push(`• ${line}`);
              }
            });
          } else {
            lines.push(text);
          }
        }
      }
    });

    return lines.join("\n");
  }

  /**
   * Generate enhanced Brick description based on category
   */
  generateEnhancedBrick(category, formData, brickLayout = []) {
    const lines = [];
    
    switch (category) {
      case "Home":
        lines.push(formData.client_name || "[Client Name]");
        if (formData.address) lines.push(`Address: ${formData.address}`);
        lines.push(`Home - NYC - ${formData.subject || "Chess"}${formData.is_trial ? " - **TRIAL**" : ""}`);
        if (formData.duration) lines.push(`Duration: ${formData.duration}`);
        lines.push(`Lesson Type: ${formData.lesson_type || "Private 1:1"}`);
        if (formData.parent_name) lines.push(`Parent: ${formData.parent_name}`);
        if (formData.children_info) lines.push(`Children: ${formData.children_info}`);
        if (formData.tutors) lines.push(`Tutors: ${formData.tutors}`);
        // Format availability from day_time_entries to match TutorCruncher format
        if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
          const formatTime = (timeStr) => {
            if (!timeStr) return "";
            const [hours, minutes] = timeStr.split(":");
            const hour = parseInt(hours, 10);
            const hour12 = hour % 12 || 12;
            const amPm = hour < 12 ? "AM" : "PM";
            // Use zero-padded hour to match TutorCruncher format (04:30 PM)
            return `${String(hour12).padStart(2, '0')}:${minutes} ${amPm}`;
          };
          lines.push("Availability-");
          formData.day_time_entries
            .filter(entry => entry.day && entry.start_time)
            .forEach(entry => {
              const startTime = formatTime(entry.start_time);
              const endTime = entry.end_time ? formatTime(entry.end_time) : null;
              // Match TutorCruncher format: "Monday: between 04:30 PM – 07:00 PM"
              const timeStr = endTime ? `${entry.day}: between ${startTime} – ${endTime}` : `${entry.day}: ${startTime}`;
              lines.push(`• ${timeStr}`);
            });
        } else if (formData.availability) {
          lines.push("Availability-");
          lines.push(formData.availability);
        }
        if (formData.start_date) lines.push(`Start Date: ${formData.start_date}`);
        if (formData.lesson_dates) lines.push(`Lesson dates: ${formData.lesson_dates}`);
        if (formData.client_notes) lines.push(`Client Notes: ${formData.client_notes}`);
        break;

      case "School":
        // School name bolded
        lines.push(`**${formData.school_name || "[School Name]"}**`);
        lines.push(`School Lesson Details - ${formData.subject || "Chess"}`);
        
        // Format day and time from day_time_entries if available
        if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
          const dayTimeEntry = formData.day_time_entries.find(entry => entry.day && entry.start_time);
          if (dayTimeEntry) {
            // Format start time from 24-hour to 12-hour format
            const formatTime = (timeStr) => {
              if (!timeStr) return "";
              const [hours, minutes] = timeStr.split(":");
              const hour = parseInt(hours, 10);
              const hour12 = hour % 12 || 12;
              const amPm = hour < 12 ? "AM" : "PM";
              return `${hour12}:${minutes} ${amPm}`;
            };
            
            // Convert day name to plural (e.g., "Monday" -> "Mondays")
            const pluralizeDay = (day) => {
              if (!day) return "";
              const dayMap = {
                "Monday": "Mondays",
                "Tuesday": "Tuesdays",
                "Wednesday": "Wednesdays",
                "Thursday": "Thursdays",
                "Friday": "Fridays",
                "Saturday": "Saturdays",
                "Sunday": "Sundays"
              };
              return dayMap[day] || `${day}s`;
            };
            
            const startTime = formatTime(dayTimeEntry.start_time);
            const endTime = dayTimeEntry.end_time ? formatTime(dayTimeEntry.end_time) : null;
            const pluralDay = pluralizeDay(dayTimeEntry.day);
            const dayTimeStr = endTime ? `${pluralDay} ${startTime} - ${endTime}` : `${pluralDay} ${startTime}`;
            lines.push(`- Day and Time: **${dayTimeStr}**`);
          }
        } else if (formData.day_of_week && formData.time) {
          lines.push(`- Day and Time: **${formData.day_of_week} ${formData.time}**`);
        }
        
        // Address bolded
        if (formData.address) lines.push(`- Address: **${formData.address}**`);
        
        // Contact info (afterschool director, etc.)
        if (formData.contact) lines.push(`- Contact: ${formData.contact}`);
        
        // Start date bolded, formatted as MM/DD/YYYY
        if (formData.start_date) {
          try {
            const date = new Date(formData.start_date + 'T00:00:00');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = String(date.getFullYear());
            lines.push(`- Start Date: **${month}/${day}/${year}**`);
          } catch (e) {
            lines.push(`- Start Date: **${formData.start_date}**`);
          }
        }
        
        if (formData.age_group) lines.push(`- Age Group: ${formData.age_group}`);
        if (formData.number_of_students) lines.push(`- Number of Students: ${formData.number_of_students}`);
        if (formData.tutors) lines.push(`- Tutors: ${formData.tutors}`);
        if (formData.teaching_notes) lines.push(`- Teaching Notes: ${formData.teaching_notes}`);
        
        // Lesson dates: bullet point with bolded dates in MM/DD format
        if (formData.lesson_dates && Array.isArray(formData.lesson_dates) && formData.lesson_dates.length > 0) {
          const sortedDates = [...formData.lesson_dates]
            .map(d => {
              try {
                // Handle string date input (YYYY-MM-DD format)
                const dateStr = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString().split('T')[0] : String(d));
                const date = new Date(dateStr + 'T00:00:00');
                if (isNaN(date.getTime())) {
                  return null; // Invalid date
                }
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return { date, formatted: `${month}/${day}` };
              } catch (e) {
                return null;
              }
            })
            .filter(d => d !== null) // Remove invalid dates
            .sort((a, b) => a.date - b.date) // Sort by date
            .map(d => d.formatted); // Extract formatted strings
          // Format as bullet point with bolded dates: "- School Lesson Dates: **10/27, 11/03, ...**"
          lines.push(`- School Lesson Dates: **${sortedDates.join(', ')}**`);
        }
        break;
        
      case "Club":
        lines.push(formData.class_name || "[Class Name]");
        if (formData.location) lines.push(`Location: ${formData.location}`);
        lines.push(`Club - NYC - ${formData.subject || "Chess"}`);
        if (formData.day_of_week && formData.time) {
          lines.push(`Day and Time: ${formData.day_of_week} ${formData.time}`);
        }
        if (formData.start_date) lines.push(`Start Date: ${formData.start_date}`);
        lines.push(`Lesson Type: Club Session`);
        if (formData.age_group) lines.push(`Age Group: ${formData.age_group}`);
        if (formData.number_of_students) lines.push(`Number of Students: ${formData.number_of_students}`);
        if (formData.tutors) lines.push(`Tutors: ${formData.tutors}`);
        if (formData.teaching_notes) lines.push(`Teaching Notes: ${formData.teaching_notes}`);
        break;
        
      case "Online":
        lines.push(formData.client_name || "[Client Name]");
        lines.push("Address: Online");
        lines.push(`Online - ${formData.subject || "Chess"}${formData.is_trial ? " - **TRIAL**" : ""}`);
        if (formData.duration) lines.push(`Duration: ${formData.duration}`);
        lines.push(`Lesson Type: Private 1:1`);
        if (formData.parent_name) lines.push(`Parent: ${formData.parent_name}`);
        if (formData.children_info) lines.push(`Children: ${formData.children_info}`);
        if (formData.timezone) lines.push(`Timezone: ${formData.timezone}`);
        if (formData.tutors) lines.push(`Tutors: ${formData.tutors}`);
        // Format availability from day_time_entries to match TutorCruncher format
        if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
          const formatTime = (timeStr) => {
            if (!timeStr) return "";
            const [hours, minutes] = timeStr.split(":");
            const hour = parseInt(hours, 10);
            const hour12 = hour % 12 || 12;
            const amPm = hour < 12 ? "AM" : "PM";
            // Use zero-padded hour to match TutorCruncher format (04:30 PM)
            return `${String(hour12).padStart(2, '0')}:${minutes} ${amPm}`;
          };
          lines.push("Availability-");
          formData.day_time_entries
            .filter(entry => entry.day && entry.start_time)
            .forEach(entry => {
              const startTime = formatTime(entry.start_time);
              const endTime = entry.end_time ? formatTime(entry.end_time) : null;
              // Match TutorCruncher format: "Monday: between 04:30 PM – 07:00 PM"
              const timeStr = endTime ? `${entry.day}: between ${startTime} – ${endTime}` : `${entry.day}: ${startTime}`;
              lines.push(`• ${timeStr}`);
            });
        } else if (formData.availability) {
          lines.push("Availability-");
          lines.push(formData.availability);
        }
        if (formData.start_date) lines.push(`Start Date: ${formData.start_date}`);
        if (formData.lesson_dates) lines.push(`Lesson dates: ${formData.lesson_dates}`);
        if (formData.client_notes) lines.push(`Client Notes: ${formData.client_notes}`);
        break;

      default:
        if (brickLayout && brickLayout.length > 0) {
          return this.buildBrickDescription(brickLayout, {}, formData);
        }
        break;
    }
    
    return lines.join("\n");
  }

  /**
   * Generate job title based on category
   */
  generateJobTitle(category, formData) {
    // Helper to extract first name from student_name
    const getStudentFirstName = (studentName) => {
      if (!studentName) return "";
      // Handle comma-separated names (multiple students) - take first student's first name
      const firstStudent = studentName.split(",")[0].trim();
      return firstStudent.split(/\s+/)[0]; // Get first name only
    };

    // Trial prefix for applicable categories
    const trialPrefix = formData.is_trial ? "TRIAL - " : "";

    switch (category) {
      case "Home":
        const studentFirstName = getStudentFirstName(formData.student_name);
        const lessonType = formData.is_sibling
          ? "Siblings"
          : formData.is_group
          ? "Group"
          : "1:1";
        let homeTitle = `${formData.client_name || ""} – ${formData.subject || ""} – Home – ${lessonType}`;
        // Append student first name in parentheses if available (matching TutorCruncher format)
        if (studentFirstName && !formData.is_sibling && !formData.is_group) {
          homeTitle = `${homeTitle} (${studentFirstName})`;
        }
        return `${trialPrefix}${homeTitle}`;

      case "Club":
        return `${formData.class_name || ""} // ${formData.day_of_week || ""} // ${formData.time || ""} // ${formData.location || ""}`;

      case "School":
        // Format day and time from day_time_entries if available
        let dayTimeStr = "";
        if (formData.day_time_entries && Array.isArray(formData.day_time_entries) && formData.day_time_entries.length > 0) {
          const dayTimeEntry = formData.day_time_entries.find(entry => entry.day && entry.start_time);
          if (dayTimeEntry) {
            // Format start time from 24-hour to 12-hour format
            const formatTime = (timeStr) => {
              if (!timeStr) return "";
              const [hours, minutes] = timeStr.split(":");
              const hour = parseInt(hours, 10);
              const hour12 = hour % 12 || 12;
              const amPm = hour < 12 ? "AM" : "PM";
              return `${hour12}:${minutes} ${amPm}`;
            };
            
            // Convert day name to plural (e.g., "Monday" -> "Mondays")
            const pluralizeDay = (day) => {
              if (!day) return "";
              const dayMap = {
                "Monday": "Mondays",
                "Tuesday": "Tuesdays",
                "Wednesday": "Wednesdays",
                "Thursday": "Thursdays",
                "Friday": "Fridays",
                "Saturday": "Saturdays",
                "Sunday": "Sundays"
              };
              return dayMap[day] || `${day}s`;
            };
            
            const startTime = formatTime(dayTimeEntry.start_time);
            const pluralDay = pluralizeDay(dayTimeEntry.day);
            dayTimeStr = `${pluralDay} ${startTime}`;
          }
        } else if (formData.day_of_week && formData.time) {
          dayTimeStr = formData.time;
        }
        
        return `${formData.school_name || ""} // ${formData.subject || "Subject"} // ${formData.semester || ""} // ${dayTimeStr || "Day Time"}`;

      case "Community":
        return `${formData.location || ""} // ${formData.subject || ""} // ${formData.semester || ""} // ${formData.section || ""}`;

      case "Online":
        const onlineStudentFirstName = getStudentFirstName(formData.student_name);
        const onlineLessonType = formData.is_sibling
          ? "Siblings"
          : formData.is_group
          ? "Group"
          : "1:1";
        let onlineTitle = `${formData.client_name || ""} – ${formData.subject || ""} – Online – ${onlineLessonType}`;
        // Append student first name in parentheses if available (matching TutorCruncher format)
        if (onlineStudentFirstName && !formData.is_sibling && !formData.is_group) {
          onlineTitle = `${onlineTitle} (${onlineStudentFirstName})`;
        }
        return `${trialPrefix}${onlineTitle}`;

      default:
        return formData.job_name || "Untitled Job";
    }
  }

  /**
   * Get template configuration
   */
  async getTemplate(templateId, includeInactive = false) {
    const query = includeInactive
      ? `SELECT jt.*, bc.brick_layout, bc.formatting_options, bc.variable_mappings
         FROM job_templates jt
         LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
         WHERE jt.id = $1`
      : `SELECT jt.*, bc.brick_layout, bc.formatting_options, bc.variable_mappings
         FROM job_templates jt
         LEFT JOIN brick_configurations bc ON jt.id = bc.template_id
         WHERE jt.id = $1 AND jt.is_active = true`;

    const result = await this.pool.query(query, [templateId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  /**
   * Create a job in TutorCruncher or locally
   */
  async createJob(templateId, formData, targetEnvironment = null) {
    const localOnly = formData.localOnly === true || formData.localOnly === 'true';
    let template;
    try {
      template = await this.getTemplate(templateId);
    } catch (dbError) {
      logger.error({ error: dbError.message, templateId }, 'Database error fetching template');
      const err = new Error(`Failed to fetch template: ${dbError.message}`);
      err.status = 500;
      err.code = 'TEMPLATE_FETCH_ERROR';
      throw err;
    }
    
    if (!template) {
      const err = new Error("Template not found or inactive");
      err.status = 404;
      err.code = 'TEMPLATE_NOT_FOUND';
      throw err;
    }

    const templateConfig = template.template_config || {};
    
    // Log template config for debugging
    logger.info({ 
      templateId, 
      templateName: template.name,
      templateConfigColour: templateConfig.colour,
      templateConfigAutoInvoice: templateConfig.auto_invoice,
      templateConfigKeys: Object.keys(templateConfig)
    }, 'Template config loaded');
    
    const jobTitle = formData.job_title || this.generateJobTitle(template.category, formData);

    const pickNumber = (field, templateValue, fallback = null) => {
      const formValue = toNumberOrNull(formData[field]);
      if (formValue !== null) {
        return formValue;
      }
      const templateNumber = toNumberOrNull(templateValue);
      if (templateNumber !== null) {
        return templateNumber;
      }
      return fallback;
    };

    const pickString = (field, templateValue, fallback = null, allowedSet = null) => {
      const getValidValue = (value) => {
        if (isEmpty(value)) {
          return null;
        }
        // Special handling for status field: convert "in_progress" to "in-progress" for backward compatibility
        if (field === 'status' && value === 'in_progress') {
          value = 'in-progress';
        }
        if (allowedSet && !allowedSet.has(value)) {
          return null;
        }
        return value;
      };

      const formValue = getValidValue(formData[field]);
      if (formValue !== null) {
        logger.debug({ field, formValue, source: 'formData' }, `Using form value for ${field}`);
        return formValue;
      }

      const templateValueSanitized = getValidValue(templateValue);
      if (templateValueSanitized !== null) {
        logger.debug({ field, templateValue: templateValueSanitized, source: 'template' }, `Using template value for ${field}`);
        return templateValueSanitized;
      }

      logger.debug({ field, fallback, source: 'fallback' }, `Using fallback value for ${field}`);
      return fallback;
    };

    const pickBoolean = (field, templateValue, fallback = false) => {
      // Explicitly check if formData has the field (even if it's false)
      if (formData.hasOwnProperty(field) && formData[field] !== undefined && formData[field] !== null) {
        const result = toBoolean(formData[field]);
        logger.debug({ field, formValue: formData[field], result, source: 'formData' }, `Using form value for ${field}`);
        return result;
      }
      if (templateValue !== undefined && templateValue !== null) {
        const result = toBoolean(templateValue);
        logger.debug({ field, templateValue, result, source: 'template' }, `Using template value for ${field}`);
        return result;
      }
      logger.debug({ field, fallback, source: 'fallback' }, `Using fallback value for ${field}`);
      return fallback;
    };

    // Build Brick description if enabled
    let jobDescription = "";
    if (template.brick_enabled) {
      if (template.brick_layout && template.brick_layout.length > 0) {
        jobDescription = this.buildBrickDescription(
          template.brick_layout,
          template.variable_mappings || {},
          formData
        );
      } else {
        jobDescription = this.generateEnhancedBrick(template.category, formData, template.brick_layout);
      }
    } else {
      jobDescription = formData.description || "";
    }

    // Build TutorCruncher service payload
    const servicePayload = {
      name: jobTitle,
      description: jobDescription,
      dft_charge_rate: pickNumber("dft_charge_rate", templateConfig.dft_charge_rate, 0),
      dft_contractor_rate: pickNumber("dft_contractor_rate", templateConfig.dft_contractor_rate, 0),
      dft_charge_type: pickString("dft_charge_type", templateConfig.dft_charge_type, "hourly", ALLOWED_CHARGE_TYPES),
      // Colour can be a color name (e.g., "Khaki", "Orange") or hex code (e.g., "#ffa500")
      // TutorCruncher accepts both formats
      // IMPORTANT: Use template colour if formData doesn't have a valid colour value
      // Only use formData.colour if it's explicitly set and not empty
      // If formData.colour is empty string, treat it as missing and use template
      // CRITICAL: Map label names (e.g., "School - NYC") to their displayColour values
      colour: (() => {
        const formColour = formData.colour;
        const templateColour = templateConfig.colour;
        
        // CRITICAL: Check if formData has a valid (non-empty) colour value
        // Empty strings should be treated as "not set" and fall back to template
        if (formData.hasOwnProperty('colour') && formColour !== undefined && formColour !== null && formColour !== '') {
          const trimmedColour = typeof formColour === 'string' ? formColour.trim() : formColour;
          if (trimmedColour !== '') {
            // Map label name to color if needed
            const mappedColour = mapLabelNameToColor(trimmedColour);
            logger.info({ 
              colour: mappedColour, 
              originalFormColour: trimmedColour,
              wasLabelName: mappedColour !== trimmedColour,
              source: 'formData' 
            }, 'Using form colour value');
            return mappedColour;
          }
        }
        
        // Use template colour if available and not empty
        if (templateColour !== undefined && templateColour !== null && templateColour !== '') {
          const trimmedTemplateColour = typeof templateColour === 'string' ? templateColour.trim() : templateColour;
          if (trimmedTemplateColour !== '') {
            // Map label name to color if needed (e.g., "School - NYC" -> "#ffa500")
            const mappedTemplateColour = mapLabelNameToColor(trimmedTemplateColour);
            logger.info({ 
              colour: mappedTemplateColour, 
              originalTemplateColour: trimmedTemplateColour,
              wasLabelName: mappedTemplateColour !== trimmedTemplateColour,
              source: 'template' 
            }, 'Using template colour value (formData colour was empty/missing)');
            return mappedTemplateColour;
          }
        }
        
        // Fall back to default (should rarely happen)
        logger.warn({ formColour, templateColour, source: 'fallback' }, 'Using fallback colour - both formData and template colours were empty');
        return "Khaki";
      })(),
      dft_max_srs: pickNumber("dft_max_srs", templateConfig.dft_max_srs, 10),
      dft_contractor_permissions: pickString(
        "dft_contractor_permissions",
        templateConfig.dft_contractor_permissions,
        "add-edit-complete",
        ALLOWED_TUTOR_PERMISSIONS
      ),
      sr_premium: pickNumber("sr_premium", templateConfig.sr_premium, 0),
      cap: pickNumber("cap", templateConfig.cap),
      extra_fee_per_apt: pickNumber("extra_fee_per_apt", templateConfig.extra_fee_per_apt),
      inactivity_time: pickNumber("inactivity_time", templateConfig.inactivity_time),
      review_units: pickNumber("review_units", templateConfig.review_units),
      require_rcr: pickBoolean("require_rcr", templateConfig.require_rcr, false),
      require_con_job: pickBoolean("require_con_job", templateConfig.require_con_job, false),
      report_required: pickBoolean("report_required", templateConfig.report_required, false),
      net_gross: pickString("net_gross", templateConfig.net_gross, "gross"),
      sales_codes: pickString("sales_codes", templateConfig.sales_codes),
      // Tax setups must be integer PKs or null, not strings
      branch_tax_setup: pickNumber("branch_tax_setup", templateConfig.branch_tax_setup),
      contractor_tax_setup: pickNumber("contractor_tax_setup", templateConfig.contractor_tax_setup),
      // IMPORTANT: Use template auto_invoice value if formData doesn't explicitly override it
      // Only use formData.auto_invoice if it's explicitly set (even if false)
      // CRITICAL: If formData.auto_invoice is undefined/null, use template value
      // CRITICAL: For School category, enforce auto_invoice=false (business rule: schools should not auto-invoice)
      auto_invoice: (() => {
        const isSchoolCategory = template.category === 'School';
        
        // CRITICAL BUSINESS RULE: Schools should never have auto_invoice enabled
        // Only allow true if explicitly set in formData AND it's not a school
        if (isSchoolCategory) {
          logger.info({ 
            templateAutoInvoice: templateConfig.auto_invoice,
            formDataAutoInvoice: formData.auto_invoice,
            category: template.category,
            result: false
          }, 'School category detected: forcing auto_invoice to false (business rule)');
          return false;
        }
        
        // For non-school categories, use normal logic
        // Check if formData explicitly has auto_invoice property
        // Note: formData.auto_invoice can be false (which is valid), so we check hasOwnProperty
        if (formData.hasOwnProperty('auto_invoice') && formData.auto_invoice !== undefined && formData.auto_invoice !== null) {
          const result = toBoolean(formData.auto_invoice);
          logger.info({ 
            auto_invoice: formData.auto_invoice, 
            result, 
            source: 'formData',
            templateAutoInvoice: templateConfig.auto_invoice,
            category: template.category
          }, 'Using form auto_invoice value');
          return result;
        }
        
        // Use template value if available (formData doesn't have auto_invoice or it's undefined/null)
        if (templateConfig.hasOwnProperty('auto_invoice') && templateConfig.auto_invoice !== undefined && templateConfig.auto_invoice !== null) {
          const result = toBoolean(templateConfig.auto_invoice);
          logger.info({ 
            auto_invoice: templateConfig.auto_invoice, 
            result, 
            source: 'template',
            formDataHasAutoInvoice: formData.hasOwnProperty('auto_invoice'),
            formDataAutoInvoice: formData.auto_invoice,
            category: template.category
          }, 'Using template auto_invoice value (formData auto_invoice was missing/undefined)');
          return result;
        }
        
        // Fall back to false
        logger.warn({ 
          formDataHasAutoInvoice: formData.hasOwnProperty('auto_invoice'),
          formDataAutoInvoice: formData.auto_invoice,
          templateHasAutoInvoice: templateConfig.hasOwnProperty('auto_invoice'),
          templateAutoInvoice: templateConfig.auto_invoice,
          category: template.category,
          source: 'fallback' 
        }, 'Using fallback auto_invoice=false - both formData and template auto_invoice were missing');
        return false;
      })(),
      // Valid status values: 'pending', 'available', 'in-progress', 'finished', 'gone-cold'
      status: pickString("status", templateConfig.status, "pending", ALLOWED_STATUS_VALUES),
      allow_proposed_rates: pickBoolean("allow_proposed_rates", templateConfig.allow_proposed_rates, false),
      dft_location: pickString("dft_location", templateConfig.dft_location),
      branch: pickNumber("branch", templateConfig.branch),
      // Ensure extra_attrs is always an object, not an array
      extra_attrs: (() => {
        const attrs = formData.extra_attrs || templateConfig.extra_attrs;
        // If it's an array, convert to empty object (TutorCruncher expects a dict/object)
        if (Array.isArray(attrs)) {
          logger.warn({ extra_attrs: attrs }, 'extra_attrs was an array, converting to empty object');
          return {};
        }
        // If it's an object, use it; otherwise default to empty object
        return (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) ? attrs : {};
      })(),
    };

    // Add recipients (rcrs) if provided
    if (formData.recipients && Array.isArray(formData.recipients)) {
      try {
        servicePayload.rcrs = formData.recipients.map((r) => {
          // Handle both object format {id, name, ...} and simple ID format
          const recipientId = r.id || r.recipient || r;
          if (!recipientId) {
            logger.warn({ recipient: r }, 'Recipient missing ID, skipping');
            return null;
          }
          return {
            recipient: typeof recipientId === 'number' ? recipientId : parseInt(recipientId, 10),
        charge_rate: r.charge_rate || null,
          };
        }).filter(r => r !== null); // Remove any null entries
      } catch (recipientError) {
        logger.error({ error: recipientError.message, recipients: formData.recipients }, 'Error processing recipients');
        throw new Error(`Invalid recipients format: ${recipientError.message}`);
      }
    }

    // Add contractors (conjobs) if provided
    if (formData.contractors && Array.isArray(formData.contractors)) {
      servicePayload.conjobs = formData.contractors.map((c) => ({
        contractor: c.id || c.contractor,
        contractor_permissions: c.permissions || servicePayload.dft_contractor_permissions,
        pay_rate: c.pay_rate || servicePayload.dft_contractor_rate,
      }));
    }

    // Log form data values for debugging
    logger.info({ 
      templateId, 
      jobTitle, 
      payloadKeys: Object.keys(servicePayload), 
      localOnly,
      formDataColour: formData.colour,
      templateColour: templateConfig.colour,
      finalColour: servicePayload.colour,
      formDataAutoInvoice: formData.auto_invoice,
      templateAutoInvoice: templateConfig.auto_invoice,
      finalAutoInvoice: servicePayload.auto_invoice,
      hasColourInFormData: formData.hasOwnProperty('colour'),
      hasAutoInvoiceInFormData: formData.hasOwnProperty('auto_invoice')
    }, 'Creating service with payload values');

    // Validate payload before sending
    if (!servicePayload.name || !servicePayload.name.trim()) {
      const err = new Error('Job name is required');
      err.status = 400;
      err.code = 'MISSING_JOB_NAME';
      throw err;
    }

    // LOCAL-ONLY MODE: Create service directly in local database without TutorCruncher
    if (localOnly) {
      try {
        // Generate a local service_id (negative numbers to avoid conflicts with TutorCruncher IDs)
        const maxLocalIdResult = await this.pool.query(`
          SELECT MIN(service_id::integer) as min_id 
          FROM services 
          WHERE service_id ~ '^-?[0-9]+$' AND service_id::integer < 0
        `);
        const minLocalId = maxLocalIdResult.rows[0]?.min_id ?? -1000000;
        const serviceId = minLocalId - 1;

        // Insert directly into local database
        const insertQuery = `
          INSERT INTO services (
            service_id, name, description, dft_charge_rate, dft_contractor_rate,
            dft_charge_type, colour, dft_max_srs, dft_contractor_permissions,
            sr_premium, cap, extra_fee_per_apt, inactivity_time, review_units,
            require_rcr, require_con_job, report_required, net_gross, sales_codes,
            branch_tax_setup, contractor_tax_setup, auto_invoice, status,
            allow_proposed_rates, dft_location, branch, extra_attrs,
            tc_created_at, remote_last_updated, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
            NOW(), NOW(), NOW(), NOW()
          )
          RETURNING *
        `;

        const insertParams = [
          serviceId.toString(), // Convert to string since service_id is VARCHAR
          servicePayload.name,
          servicePayload.description || '',
          servicePayload.dft_charge_rate || 0,
          servicePayload.dft_contractor_rate || 0,
          servicePayload.dft_charge_type || 'hourly',
          servicePayload.colour || 'Khaki',
          servicePayload.dft_max_srs || 10,
          servicePayload.dft_contractor_permissions || 'add-edit-complete',
          servicePayload.sr_premium || 0,
          servicePayload.cap || null,
          servicePayload.extra_fee_per_apt || null,
          servicePayload.inactivity_time || null,
          servicePayload.review_units || null,
          servicePayload.require_rcr || false,
          servicePayload.require_con_job || false,
          servicePayload.report_required || false,
          servicePayload.net_gross || 'gross',
          servicePayload.sales_codes || null,
          servicePayload.branch_tax_setup || null,
          servicePayload.contractor_tax_setup || null,
          servicePayload.auto_invoice || false,
          servicePayload.status || 'pending',
          servicePayload.allow_proposed_rates || false,
          servicePayload.dft_location || null,
          servicePayload.branch || null,
          JSON.stringify(servicePayload.extra_attrs || {})
        ];

        const result = await this.pool.query(insertQuery, insertParams);
        const createdService = result.rows[0];

        logger.info({
          msg: 'Created service locally (localOnly mode)',
          serviceId,
          jobTitle,
          localOnly: true
        });

        return {
          service: {
            id: createdService.service_id,
            name: createdService.name,
            description: createdService.description,
            status: createdService.status
          },
          jobTitle,
          jobDescription,
          localOnly: true
        };
      } catch (localError) {
        logger.error({
          msg: 'Error creating service locally',
          error: localError.message,
          stack: localError.stack,
          templateId,
          jobTitle
        });
        throw new Error(`Failed to create service locally: ${localError.message}`);
      }
    }

    // CRITICAL: Ensure auto_invoice is explicitly included in payload (even if false)
    // TutorCruncher may apply a default of true if the field is omitted
    if (!servicePayload.hasOwnProperty('auto_invoice')) {
      logger.warn({ 
        templateAutoInvoice: templateConfig.auto_invoice,
        formDataAutoInvoice: formData.auto_invoice 
      }, 'auto_invoice missing from payload, explicitly setting to false');
      servicePayload.auto_invoice = false;
    }
    
    // Log final payload values before sending to TutorCruncher
    // CRITICAL: Log the actual payload structure to verify auto_invoice is included
    logger.info({
      auto_invoice: servicePayload.auto_invoice,
      auto_invoiceType: typeof servicePayload.auto_invoice,
      payloadHasAutoInvoice: servicePayload.hasOwnProperty('auto_invoice'),
      templateAutoInvoice: templateConfig.auto_invoice,
      formDataAutoInvoice: formData.auto_invoice,
      templateCategory: template.category,
      // Log a subset of payload keys to verify structure
      payloadKeys: Object.keys(servicePayload).sort(),
      // Log the actual auto_invoice value from payload (for debugging)
      payloadAutoInvoiceValue: servicePayload.auto_invoice,
      // Log full payload structure (but limit size for readability)
      payloadSummary: {
        name: servicePayload.name,
        colour: servicePayload.colour,
        auto_invoice: servicePayload.auto_invoice,
        status: servicePayload.status,
        dft_charge_type: servicePayload.dft_charge_type
      }
    }, 'Final auto_invoice value in payload before sending to TutorCruncher');

    // Create service in TutorCruncher with retry logic
    let serviceResponse;
    try {
    const createService = async () => {
        // CRITICAL: Log the full payload being sent to TutorCruncher
        // This will help diagnose if auto_invoice is missing or has wrong value
        logger.info({ 
          fullPayload: JSON.stringify(servicePayload, null, 2),
          auto_invoiceInPayload: servicePayload.auto_invoice,
          auto_invoiceType: typeof servicePayload.auto_invoice
        }, 'Sending service creation request to TutorCruncher - FULL PAYLOAD');
        logger.debug({ payload: servicePayload }, 'Sending service creation request to TutorCruncher');
      return await this.tutorCruncherAPI.post("/services/", servicePayload);
    };

      serviceResponse = await this.rateLimitRetry(createService);
    } catch (apiError) {
      const responseData = apiError.response?.data;
      const status = apiError.response?.status;
      
      logger.error({ 
        error: apiError.message, 
        response: responseData,
        status: status,
        templateId,
        jobTitle,
        payload: servicePayload
      }, 'TutorCruncher API error creating service');
      
      // Format a user-friendly error message from TutorCruncher response
      let errorMessage = 'Failed to create service in TutorCruncher';
      
      if (responseData) {
        // Handle different TutorCruncher error formats
        if (responseData.detail) {
          errorMessage = responseData.detail;
        } else if (responseData.error) {
          errorMessage = responseData.error;
        } else if (typeof responseData === 'string') {
          errorMessage = responseData;
        } else if (responseData.non_field_errors) {
          // Handle non-field errors array
          errorMessage = Array.isArray(responseData.non_field_errors) 
            ? responseData.non_field_errors.join(', ')
            : responseData.non_field_errors;
        } else {
          // Format field-specific errors
          const fieldErrors = Object.entries(responseData)
            .filter(([key]) => key !== 'detail' && key !== 'error')
            .map(([field, errors]) => {
              const errorText = Array.isArray(errors) ? errors.join(', ') : errors;
              return `${field}: ${errorText}`;
            });
          
          if (fieldErrors.length > 0) {
            errorMessage = `Validation errors: ${fieldErrors.join('; ')}`;
          }
        }
      } else if (apiError.message) {
        errorMessage = apiError.message;
      }
      
      const err = new Error(errorMessage);
      err.status = status || 500;
      err.code = 'TUTORCRUNCHER_API_ERROR';
      err.details = responseData;
      throw err;
    }
    
    const createdService = serviceResponse.data;

    // CRITICAL: Log what TutorCruncher actually returned for auto_invoice
    // This will help verify if TutorCruncher respected our payload value
    logger.info({ 
      serviceId: createdService.id, 
      jobTitle,
      tutorCruncherAutoInvoice: createdService.auto_invoice,
      tutorCruncherAutoInvoiceType: typeof createdService.auto_invoice,
      payloadAutoInvoice: servicePayload.auto_invoice,
      payloadAutoInvoiceType: typeof servicePayload.auto_invoice,
      autoInvoiceMatch: createdService.auto_invoice === servicePayload.auto_invoice,
      // Log full service response for debugging
      tutorCruncherResponse: JSON.stringify(createdService, null, 2)
    }, 'TutorCruncher service created - verifying auto_invoice value');

    // CRITICAL: For School category jobs, attempt to update auto_invoice immediately after creation
    // Even though TutorCruncher API doesn't return auto_invoice in responses, it may still accept it in PUT requests
    const isSchoolCategory = template.category === 'School';
    
    if (isSchoolCategory) {
      try {
        logger.info({
          serviceId: createdService.id,
          category: template.category,
          jobTitle
        }, 'School category detected: Attempting to update auto_invoice via PUT request');

        // Fetch the full service object to get all current fields
        const getService = async () => {
          return await this.tutorCruncherAPI.get(`/services/${createdService.id}/`);
        };
        const fullServiceResponse = await this.rateLimitRetry(getService);
        const fullService = fullServiceResponse.data;

        // Build update payload with all required fields plus auto_invoice: false
        // According to TutorCruncher docs, PUT requires: name, dft_charge_rate, dft_contractor_rate
        const updatePayload = {
          name: fullService.name || servicePayload.name,
          dft_charge_rate: fullService.dft_charge_rate || servicePayload.dft_charge_rate,
          dft_contractor_rate: fullService.dft_contractor_rate || servicePayload.dft_contractor_rate,
          dft_charge_type: fullService.dft_charge_type || servicePayload.dft_charge_type,
          auto_invoice: false, // CRITICAL: Explicitly set to false for School jobs
          // Include other fields that were set during creation
          colour: fullService.colour || servicePayload.colour,
          status: fullService.status || servicePayload.status,
          description: fullService.description || servicePayload.description,
        };

        // Add any other fields that exist in the service but weren't in our original payload
        // This ensures we're sending a complete update
        if (fullService.dft_max_srs !== undefined) updatePayload.dft_max_srs = fullService.dft_max_srs;
        if (fullService.is_bookable !== undefined) updatePayload.is_bookable = fullService.is_bookable;
        if (fullService.extra_attrs !== undefined) updatePayload.extra_attrs = fullService.extra_attrs;

        logger.info({
          serviceId: createdService.id,
          updatePayload: JSON.stringify(updatePayload, null, 2),
          auto_invoice: updatePayload.auto_invoice
        }, 'Sending PUT request to update auto_invoice for School service');

        // Send PUT request to update the service with auto_invoice: false
        const updateService = async () => {
          return await this.tutorCruncherAPI.put(`/services/${createdService.id}/`, updatePayload);
        };
        const updateResponse = await this.rateLimitRetry(updateService);
        
        logger.info({
          serviceId: createdService.id,
          updateStatus: updateResponse.status,
          updateResponseData: JSON.stringify(updateResponse.data, null, 2),
          auto_invoiceInUpdatePayload: updatePayload.auto_invoice,
          tutorCruncherUrl: `https://account.acmeops.com/cal/service/${createdService.id}/edit/`
        }, 'PUT request completed for auto_invoice update - verify in TutorCruncher UI');

        // Note: TutorCruncher API doesn't return auto_invoice in responses, so we can't verify via API
        // The update may have succeeded even if the field isn't returned
        logger.info({
          serviceId: createdService.id,
          jobTitle,
          category: 'School',
          note: 'auto_invoice update attempted via PUT - verify manually in TutorCruncher UI as API does not return this field',
          tutorCruncherUrl: `https://account.acmeops.com/cal/service/${createdService.id}/edit/`
        }, 'School service auto_invoice update completed - manual verification required');

      } catch (updateError) {
        // Log error but don't fail the job creation
        const updateErrorData = updateError.response?.data;
        const updateErrorStatus = updateError.response?.status;
        
        logger.error({
          serviceId: createdService.id,
          error: updateError.message,
          response: updateErrorData,
          status: updateErrorStatus,
          jobTitle,
          category: template.category,
          tutorCruncherUrl: `https://account.acmeops.com/cal/service/${createdService.id}/edit/`,
          actionRequired: 'MANUAL: Set auto_invoice to OFF in TutorCruncher UI'
        }, 'Failed to update auto_invoice via PUT request - MANUAL ACTION REQUIRED');
        
        // Still log that manual action is needed
        logger.warn({
          serviceId: createdService.id,
          category: template.category,
          jobTitle,
          tutorCruncherUrl: `https://account.acmeops.com/cal/service/${createdService.id}/edit/`,
          actionRequired: 'MANUAL: Set auto_invoice to OFF in TutorCruncher UI',
          reason: 'PUT request to update auto_invoice failed'
        }, '⚠️  CRITICAL: School job created but auto_invoice update failed - MANUAL ACTION REQUIRED');
      }
    }

    // Add labels if specified
    if (formData.labels && Array.isArray(formData.labels)) {
      for (const labelId of formData.labels) {
        try {
          await this.rateLimitRetry(async () => {
            return await this.tutorCruncherAPI.post(
              `/services/${createdService.id}/add_label/`,
              { label: labelId }
            );
          });
        } catch (labelError) {
          logger.error({ error: labelError.message, labelId, serviceId: createdService.id }, 'Error adding label');
          // Continue even if label addition fails
        }
      }
    }

    // Create appointments from lesson dates and day/time entries
    const createdAppointments = [];
    const appointmentPayloads = []; // Collect for history logging
    if (formData.lesson_dates && Array.isArray(formData.lesson_dates) && formData.lesson_dates.length > 0) {
      const dayTimeEntries = formData.day_time_entries || [];
      
      // Get the first day/time entry (or use defaults)
      const dayTimeEntry = dayTimeEntries.find(entry => entry.day && entry.start_time) || dayTimeEntries[0] || {};
      const startTime = dayTimeEntry.start_time || formData.lesson_start_time || "14:00"; // Default to 2:00 PM
      const endTime = dayTimeEntry.end_time || formData.lesson_end_time || null;
      
      // Calculate duration in hours (default to 1 hour if end time not provided)
      let durationHours = 1;
      if (startTime && endTime) {
        const [startHour, startMin] = startTime.split(":").map(Number);
        const [endHour, endMin] = endTime.split(":").map(Number);
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        durationHours = (endMinutes - startMinutes) / 60;
        if (durationHours <= 0) durationHours = 1; // Fallback to 1 hour
      }
      
      // Get recipients and contractors for appointments
      // Use trial-specific rates when is_trial is true: $TRIAL_PRICE charge rate, $5 pay rate
      const { TRIAL_PRICE } = require('../config/constants');
      const isTrialLesson = formData.is_trial === true || formData.is_trial === 'true';

      const rcras = [];
      if (formData.recipients && Array.isArray(formData.recipients)) {
        for (const recipient of formData.recipients) {
          const recipientId = recipient.id || recipient.recipient || recipient;
          if (recipientId) {
            rcras.push({
              recipient: typeof recipientId === 'number' ? recipientId : parseInt(recipientId, 10),
              // Use TRIAL_PRICE for trial lessons, otherwise use default rate
              charge_rate: isTrialLesson ? TRIAL_PRICE : (recipient.charge_rate || servicePayload.dft_charge_rate || null),
            });
          }
        }
      }

      const cjas = [];
      if (formData.contractors && Array.isArray(formData.contractors)) {
        for (const contractor of formData.contractors) {
          const contractorId = contractor.id || contractor.contractor;
          if (contractorId) {
            cjas.push({
              contractor: typeof contractorId === 'number' ? contractorId : parseInt(contractorId, 10),
              // Use $5 for trial lessons, otherwise use default rate
              pay_rate: isTrialLesson ? 5 : (contractor.pay_rate || servicePayload.dft_contractor_rate || null),
            });
          }
        }
      }
      
      // Create an appointment for each lesson date
      for (const lessonDate of formData.lesson_dates) {
        try {
          // Parse the date string (YYYY-MM-DD format)
          const dateStr = typeof lessonDate === 'string' ? lessonDate : (lessonDate instanceof Date ? lessonDate.toISOString().split('T')[0] : String(lessonDate));
          const [year, month, day] = dateStr.split('-').map(Number);
          
          if (isNaN(year) || isNaN(month) || isNaN(day)) {
            logger.warn({ lessonDate, dateStr }, 'Invalid lesson date format, skipping appointment creation');
            continue;
          }
          
          // Combine date with start time
          // Parse time (format: "HH:mm" or "HH:mm:ss")
          const [startHour, startMinute] = startTime.split(':').map(Number);
          
          // Convert from America/New_York timezone to UTC using Luxon
          // Luxon handles DST transitions correctly per-date
          const startDT = DateTime.fromObject(
            { year, month, day, hour: startHour, minute: startMinute, second: 0 },
            { zone: 'America/New_York' }
          );
          const startISO = startDT.toUTC().toISO();
          const finishDT = startDT.plus({ hours: durationHours });
          const finishISO = finishDT.toUTC().toISO();
          
          // Build appointment payload
          // Lesson topic should match job title (no date appended)
          // For trial lessons, add TRIAL prefix to topic if not already present in job title
          const appointmentTopic = isTrialLesson && !jobTitle.startsWith("TRIAL - ")
            ? `TRIAL - ${jobTitle}`
            : jobTitle;
          const appointmentPayload = {
            service: createdService.id,
            start: startISO,
            finish: finishISO,
            status: "planned",
            topic: appointmentTopic,
            rcras: rcras.length > 0 ? rcras : undefined,
            cjas: cjas.length > 0 ? cjas : undefined,
          };
          
          // Track payload for history logging
          appointmentPayloads.push({
            lessonDate: dateStr,
            localTime: startTime,
            startUTC: startISO,
            finishUTC: finishISO,
            offsetUsed: startDT.offset / 60, // hours offset from UTC
          });

          // Create appointment in TutorCruncher
          const createAppointment = async () => {
            logger.debug({ payload: appointmentPayload }, 'Creating appointment in TutorCruncher');
            return await this.tutorCruncherAPI.post("/appointments/", appointmentPayload);
          };

          const appointmentResponse = await this.rateLimitRetry(createAppointment);
          createdAppointments.push(appointmentResponse.data);
          logger.info({ appointmentId: appointmentResponse.data.id, date: dateStr }, 'Appointment created successfully');

        } catch (appointmentError) {
          logger.error({
            error: appointmentError.message,
            lessonDate,
            serviceId: createdService.id
          }, 'Error creating appointment for lesson date');
          appointmentPayloads.push({
            lessonDate: typeof lessonDate === 'string' ? lessonDate : String(lessonDate),
            error: appointmentError.message,
          });
          // Continue creating other appointments even if one fails
        }
      }
    }

    // Log to job_builder_history
    const expectedCount = formData.lesson_dates?.length || 0;
    const historyStatus = createdAppointments.length === expectedCount
      ? 'success'
      : createdAppointments.length > 0 ? 'partial' : (expectedCount > 0 ? 'failed' : 'success');

    // Detect anomalies near DST boundaries
    const anomalies = this.detectDSTAnomalies(appointmentPayloads);

    try {
      await this.pool.query(`
        INSERT INTO job_builder_history
          (template_id, template_name, category, job_title, tc_service_id,
           created_by, lesson_count, appointment_count, status, error_message,
           request_payload, response_payload, lesson_dates, anomalies)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        templateId,
        template.name || template.category,
        template.category,
        jobTitle,
        createdService.id,
        formData.created_by || null,
        expectedCount,
        createdAppointments.length,
        historyStatus,
        null,
        JSON.stringify({ formData, appointmentPayloads }),
        JSON.stringify({ service: createdService, appointments: createdAppointments }),
        JSON.stringify(formData.lesson_dates || []),
        anomalies.length > 0 ? JSON.stringify(anomalies) : null,
      ]);
      logger.info({ tcServiceId: createdService.id, status: historyStatus, anomalyCount: anomalies.length }, 'Job builder history saved');
    } catch (historyErr) {
      logger.error({ error: historyErr.message }, 'Failed to save job builder history (non-blocking)');
    }

    return {
      service: createdService,
      jobTitle,
      jobDescription,
      appointments: createdAppointments,
      appointmentsCreated: createdAppointments.length,
    };
  }

  /**
   * Detect appointments near DST transition dates that may have time anomalies
   */
  detectDSTAnomalies(appointmentPayloads) {
    // US DST transitions: 2nd Sunday of March, 1st Sunday of November
    const getDSTTransitions = (year) => {
      // 2nd Sunday of March
      const march1 = DateTime.fromObject({ year, month: 3, day: 1 }, { zone: 'America/New_York' });
      const firstSundayMarch = march1.weekday === 7 ? march1 : march1.plus({ days: 7 - march1.weekday });
      const springForward = firstSundayMarch.plus({ weeks: 1 }); // 2nd Sunday

      // 1st Sunday of November
      const nov1 = DateTime.fromObject({ year, month: 11, day: 1 }, { zone: 'America/New_York' });
      const fallBack = nov1.weekday === 7 ? nov1 : nov1.plus({ days: 7 - nov1.weekday });

      return [springForward, fallBack];
    };

    const anomalies = [];
    const WINDOW_DAYS = 7;

    for (const payload of appointmentPayloads) {
      if (payload.error || !payload.lessonDate) continue;

      const lessonDT = DateTime.fromISO(payload.lessonDate, { zone: 'America/New_York' });
      if (!lessonDT.isValid) continue;

      const transitions = getDSTTransitions(lessonDT.year);
      for (const transition of transitions) {
        const diffDays = Math.abs(lessonDT.diff(transition, 'days').days);
        if (diffDays <= WINDOW_DAYS) {
          anomalies.push({
            lesson_date: payload.lessonDate,
            expected_time: payload.localTime,
            sent_utc: payload.startUTC,
            offset_hours: payload.offsetUsed,
            near_dst_transition: true,
            transition_date: transition.toISODate(),
            days_from_transition: Math.round(diffDays),
            flag: `within_${WINDOW_DAYS}_days_of_dst`,
          });
          break; // Only flag once per lesson
        }
      }
    }

    return anomalies;
  }

  /**
   * Get job builder history records
   */
  async getHistory({ limit = 50, offset = 0, status = null, startDate = null, endDate = null } = {}) {
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      this.pool.query(`SELECT COUNT(*) FROM job_builder_history ${whereClause}`, params),
      this.pool.query(`
        SELECT id, template_id, template_name, category, job_title, tc_service_id,
               created_by, lesson_count, appointment_count, status, error_message,
               lesson_dates, anomalies, created_at
        FROM job_builder_history
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `, [...params, limit, offset]),
    ]);

    return {
      total: parseInt(countResult.rows[0].count, 10),
      records: dataResult.rows,
    };
  }

  /**
   * Get single history record with full payloads
   */
  async getHistoryDetail(id) {
    const result = await this.pool.query(
      'SELECT * FROM job_builder_history WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Preview job title and brick without creating
   */
  async previewJob(templateId, formData) {
    const template = await this.getTemplate(templateId, true);
    if (!template) {
      const err = new Error("Template not found");
      err.status = 404;
      err.code = 'TEMPLATE_NOT_FOUND';
      throw err;
    }

    const jobTitle = formData.job_title || this.generateJobTitle(template.category, formData);

    let jobDescription = "";
    if (template.brick_enabled) {
      if (template.brick_layout && template.brick_layout.length > 0) {
        jobDescription = this.buildBrickDescription(
          template.brick_layout,
          template.variable_mappings || {},
          formData
        );
      } else {
        jobDescription = this.generateEnhancedBrick(template.category, formData, template.brick_layout);
      }
    }

    return {
      jobTitle,
      jobDescription,
      category: template.category,
    };
  }

  /**
   * Save job draft
   */
  async saveDraft(templateId, formData, jobTitle, jobDescription, userId) {
    // TODO: Implement drafts table if needed
    return {
      templateId,
      formData,
      jobTitle,
      jobDescription,
      savedAt: new Date().toISOString(),
    };
  }
}

module.exports = JobBuilderService;