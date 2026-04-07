import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';

const BranchContext = createContext();

const AVAILABLE_BRANCHES = {
  main: {
    id: 'main',
    label: 'Acme Operations HQ',
    subdomain: 'www',
    url: window.location.origin.replace(/^https?:\/\/([^.]+)\./, 'https://www.')
  },
  'westside': {
    id: 'westside',
    label: 'Westside',
    subdomain: 'westside',
    url: 'https://westside.acmeops.com'
  },
  'eastside': {
    id: 'eastside',
    label: 'Eastside',
    subdomain: 'eastside',
    url: 'https://eastside.acmeops.com'
  }
};

export function BranchProvider({ children, user }) {
  // Determine current branch from subdomain
  const getCurrentBranchFromSubdomain = () => {
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];
    
    if (subdomain === 'westside') return 'westside';
    if (subdomain === 'eastside') return 'eastside';
    return 'main';
  };

  const [currentBranch, setCurrentBranch] = useState(() => {
    const saved = localStorage.getItem('selectedBranch');
    if (saved && AVAILABLE_BRANCHES[saved]) {
      return saved;
    }
    return getCurrentBranchFromSubdomain();
  });

  const [isHQUser, setIsHQUser] = useState(() => {
    const userEmail = user?.email?.toLowerCase() || '';
    return userEmail.includes('@acmeops.com') && 
           !userEmail.includes('eastside') && 
           !userEmail.includes('westside');
  });

  const switchBranch = (branchId) => {
    if (AVAILABLE_BRANCHES[branchId] && isHQUser) {
      setCurrentBranch(branchId);
      localStorage.setItem('selectedBranch', branchId);
      // Optionally redirect to that branch's URL
      // window.location.href = AVAILABLE_BRANCHES[branchId].url;
    }
  };

  const getAvailableBranches = () => {
    if (isHQUser) {
      return Object.keys(AVAILABLE_BRANCHES);
    }
    return [currentBranch].filter(Boolean);
  };

  const getBranchInfo = (branchId) => {
    return AVAILABLE_BRANCHES[branchId] || null;
  };

  const contextValue = useMemo(() => ({
    currentBranch,
    switchBranch,
    getAvailableBranches,
    getBranchInfo,
    branchInfo: AVAILABLE_BRANCHES[currentBranch],
    isHQUser
  }), [currentBranch, switchBranch, getAvailableBranches, getBranchInfo, isHQUser]);

  return (
    <BranchContext.Provider value={contextValue}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}

export { AVAILABLE_BRANCHES };

