import React from 'react';
import SchoolsBookingForms from './SchoolsBookingForms';
import { RoleProvider } from '../../contexts/RoleContext';
import { BranchProvider } from '../../contexts/BranchContext';

export default function SchoolsBookingFormsWrapper() {
  return (
    <RoleProvider>
      <BranchProvider>
          <SchoolsBookingForms />
      </BranchProvider>
    </RoleProvider>
  );
}
