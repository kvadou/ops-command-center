import React from 'react';
import SchoolDetailPage from '../SchoolDetailPage';

/**
 * SchoolsDetailWrapper - Wraps SchoolDetailPage
 * This allows the school detail page to be accessed via /schools/dashboard/school/:schoolId
 * while maintaining all existing functionality from /school-dashboard/school/:schoolId
 */
export default function SchoolsDetailWrapper() {
  return (
      <div className="w-full">
        <SchoolDetailPage />
      </div>
  );
}
