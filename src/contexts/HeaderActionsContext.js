import React, { createContext, useContext, useState, useMemo } from 'react';

const HeaderActionsContext = createContext({
  actions: null,
  setActions: () => {},
});

export const useHeaderActions = () => {
  const context = useContext(HeaderActionsContext);
  if (!context) {
    throw new Error('useHeaderActions must be used within HeaderActionsProvider');
  }
  return context;
};

export const HeaderActionsProvider = ({ children }) => {
  const [actions, setActions] = useState(null);

  const contextValue = useMemo(() => ({ actions, setActions }), [actions, setActions]);

  return (
    <HeaderActionsContext.Provider value={contextValue}>
      {children}
    </HeaderActionsContext.Provider>
  );
};

