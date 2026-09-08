import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);
  const [spinsAllowed, setSpinsAllowed] = useState(1);
  const [spinsCompleted, setSpinsCompleted] = useState(0);
  const [retriesRemaining, setRetriesRemaining] = useState(2);

  function resetSpinFlow() {
    setSpinsAllowed(1);
    setSpinsCompleted(0);
    setRetriesRemaining(2);
  }

  const value = {
    name,
    setName,
    result,
    setResult,
    spinsAllowed,
    setSpinsAllowed,
    spinsCompleted,
    setSpinsCompleted,
    retriesRemaining,
    setRetriesRemaining,
    resetSpinFlow,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
