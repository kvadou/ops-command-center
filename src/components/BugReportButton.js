import React, { useEffect } from 'react';

// Bug icon SVG (similar to the classic bug/beetle icon)
const BUG_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink: 0;">
  <path d="M12 2C10.9 2 10 2.9 10 4C10 4.1 10 4.2 10 4.3C8.4 4.9 7.2 6.3 7 8H5C4.4 8 4 8.4 4 9C4 9.6 4.4 10 5 10H7V11H5C4.4 11 4 11.4 4 12C4 12.6 4.4 13 5 13H7V14C7 14.3 7 14.7 7.1 15H5C4.4 15 4 15.4 4 16C4 16.6 4.4 17 5 17H7.7C8.9 19.4 11.3 21 14 21H14C17.3 21 20 18.3 20 15V14V13V12V11V10H19C19.6 10 20 9.6 20 9C20 8.4 19.6 8 19 8H17C16.8 6.3 15.6 4.9 14 4.3C14 4.2 14 4.1 14 4C14 2.9 13.1 2 12 2ZM12 4C12.6 4 13 4.4 13 5C13 5.6 12.6 6 12 6C11.4 6 11 5.6 11 5C11 4.4 11.4 4 12 4ZM9 8H15C16.1 8 17 8.9 17 10V15C17 17.8 14.8 20 12 20C9.2 20 7 17.8 7 15V10C7 8.9 7.9 8 9 8Z"/>
  <ellipse cx="12" cy="14" rx="3.5" ry="4.5" fill="currentColor"/>
  <path d="M5 10H7M17 10H19M5 13H7M17 13H19M5 16H7.5M16.5 16H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 4C10 4 10.5 2.5 12 2.5C13.5 2.5 14 4 14 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/>
  <path d="M9.5 3C9.5 3 9 1.5 10 1M14.5 3C14.5 3 15 1.5 14 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
`;

// Simpler, cleaner bug icon that matches the reference image
const SIMPLE_BUG_ICON = `
<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
  <!-- Body (oval) -->
  <ellipse cx="12" cy="14" rx="5" ry="6" fill="currentColor" stroke="none"/>
  <!-- Head -->
  <ellipse cx="12" cy="7" rx="3" ry="2.5" fill="currentColor" stroke="none"/>
  <!-- Antennae -->
  <path d="M10 5.5C9.5 4 9 3 8 2.5" stroke="currentColor" fill="none"/>
  <path d="M14 5.5C14.5 4 15 3 16 2.5" stroke="currentColor" fill="none"/>
  <!-- Left legs -->
  <path d="M7 10H4" stroke="currentColor"/>
  <path d="M7 14H3" stroke="currentColor"/>
  <path d="M8 18L5 20" stroke="currentColor"/>
  <!-- Right legs -->
  <path d="M17 10H20" stroke="currentColor"/>
  <path d="M17 14H21" stroke="currentColor"/>
  <path d="M16 18L19 20" stroke="currentColor"/>
</svg>
`;

/**
 * Bug Report Button Component
 * Styles the default Sentry feedback button to match our design.
 * The button is automatically rendered by Sentry's feedback integration.
 */
export default function BugReportButton() {
  useEffect(() => {
    // Wait for Sentry feedback widget to render, then style it
    const styleSentryButton = () => {
      const sentryButton = document.querySelector('button[class*="widget"], button[aria-label*="Report"], button[class*="sentry-feedback"]');
      if (sentryButton) {
        // Apply our custom styles
        sentryButton.style.cssText = `
          position: fixed !important;
          bottom: 24px !important;
          right: 24px !important;
          z-index: 50 !important;
          display: flex !important;
          align-items: center !important;
          gap: 8px !important;
          padding: 10px 14px !important;
          background: white !important;
          border: 1px solid #d1d5db !important;
          border-radius: 9999px !important;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1) !important;
          font-size: 13px !important;
          font-weight: 500 !important;
          color: #374151 !important;
          transition: all 0.2s !important;
          cursor: pointer !important;
        `;

        // Replace the button content with our bug icon + text
        const existingIcon = sentryButton.querySelector('svg, span[class*="icon"]');
        if (existingIcon) {
          existingIcon.remove();
        }

        // Check if we already added our icon
        if (!sentryButton.querySelector('.custom-bug-icon')) {
          const iconWrapper = document.createElement('span');
          iconWrapper.className = 'custom-bug-icon';
          iconWrapper.innerHTML = SIMPLE_BUG_ICON;
          iconWrapper.style.cssText = 'display: flex; align-items: center; color: #6B7280;';
          sentryButton.insertBefore(iconWrapper, sentryButton.firstChild);
        }

        // Update text if needed
        const textSpan = sentryButton.querySelector('span:not(.custom-bug-icon)');
        if (textSpan && textSpan.textContent !== 'Report Bug') {
          textSpan.textContent = 'Report Bug';
        }

        sentryButton.addEventListener('mouseenter', () => {
          sentryButton.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1) !important';
          sentryButton.style.borderColor = '#9ca3af !important';
        });

        sentryButton.addEventListener('mouseleave', () => {
          sentryButton.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1) !important';
          sentryButton.style.borderColor = '#d1d5db !important';
        });

        return true;
      }
      return false;
    };

    // Try immediately, then retry after a delay
    if (!styleSentryButton()) {
      const interval = setInterval(() => {
        if (styleSentryButton()) {
          clearInterval(interval);
        }
      }, 100);

      // Stop trying after 5 seconds
      setTimeout(() => clearInterval(interval), 5000);
    }
  }, []);

  // This component doesn't render anything - it just styles the Sentry button
  return null;
}
