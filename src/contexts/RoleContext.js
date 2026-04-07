import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserCircleIcon,
  AcademicCapIcon,
  UsersIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';

export const RoleContext = createContext();

const AVAILABLE_ROLES = {
  admin: {
    label: 'Admin',
    icon: UserCircleIcon,
    description: 'Full system access',
    visibility: 'full'
  },
  tutor: {
    label: 'Tutor',
    icon: AcademicCapIcon,
    description: 'Tutor view',
    visibility: 'limited'
  },
  client: {
    label: 'Client',
    icon: UsersIcon,
    description: 'Client view',
    visibility: 'limited'
  },
  student: {
    label: 'Student',
    icon: BookOpenIcon,
    description: 'Student view',
    visibility: 'limited'
  }
};

export function RoleProvider({ children, user }) {
  // Default role is admin for operations team, can be overridden
  const [currentRole, setCurrentRole] = useState(() => {
    const saved = localStorage.getItem('selectedRole');
    if (saved && AVAILABLE_ROLES[saved]) {
      return saved;
    }
    // Check if user is operations team member
    const userEmail = user?.email?.toLowerCase() || '';
    const isOperationsTeam = userEmail.includes('@acmeops.com') && 
                            !userEmail.includes('eastside') && 
                            !userEmail.includes('westside');
    return isOperationsTeam ? 'admin' : null;
  });

  const switchRole = (role) => {
    if (AVAILABLE_ROLES[role]) {
      setCurrentRole(role);
      localStorage.setItem('selectedRole', role);
    }
  };

  const getAvailableRoles = () => {
    // Only operations team can switch roles
    const userEmail = user?.email?.toLowerCase() || '';
    const isOperationsTeam = userEmail.includes('@acmeops.com') && 
                            !userEmail.includes('eastside') && 
                            !userEmail.includes('westside');
    
    if (isOperationsTeam) {
      return Object.keys(AVAILABLE_ROLES);
    }
    return [currentRole].filter(Boolean);
  };

  const getRoleInfo = (role) => {
    return AVAILABLE_ROLES[role] || null;
  };

  const value = {
    currentRole,
    switchRole,
    getAvailableRoles,
    getRoleInfo,
    roleInfo: AVAILABLE_ROLES[currentRole]
  };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

export { AVAILABLE_ROLES };

