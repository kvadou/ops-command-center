import React, { createContext, useContext, useState, useEffect } from 'react';

const CompanyNameContext = createContext({
  companyName: 'Acme Operations (Main Branch)',
  isMainBranch: true,
});

export function CompanyNameProvider({ children }) {
  const [companyName, setCompanyName] = useState('Acme Operations (Main Branch)');
  const [isMainBranch, setIsMainBranch] = useState(true);

  useEffect(() => {
    const fetchCompanyName = async () => {
      try {
        const response = await fetch('/api/company-name');
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Response is not JSON');
        }
        const data = await response.json();
        if (data && data.companyName) {
          setCompanyName(data.companyName);
          const isLocalhost =
            window.location.hostname.includes('localhost') ||
            window.location.hostname.includes('127.0.0.1');
          setIsMainBranch(
            data.companyName === 'Acme Operations (Main Branch)' ||
            data.companyName === '' ||
            isLocalhost
          );
        }
      } catch (err) {
        // Default to main branch on localhost
        if (
          window.location.hostname.includes('localhost') ||
          window.location.hostname.includes('127.0.0.1')
        ) {
          setCompanyName('Acme Operations (Main Branch)');
          setIsMainBranch(true);
        }
      }
    };
    fetchCompanyName();
  }, []);

  return (
    <CompanyNameContext.Provider value={{ companyName, isMainBranch }}>
      {children}
    </CompanyNameContext.Provider>
  );
}

export function useCompanyName() {
  return useContext(CompanyNameContext);
}

export default CompanyNameContext;
