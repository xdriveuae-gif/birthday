import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [name, setName] = useState('');
  const [result, setResult] = useState(null);
  const [spinsAllowed, setSpinsAllowed] = useState(1);
  const [spinsCompleted, setSpinsCompleted] = useState(0);
  const [retriesRemaining, setRetriesRemaining] = useState(2);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [priceRange, setPriceRange] = useState(null);

  function resetSpinFlow() {
    setSpinsAllowed(1);
    setSpinsCompleted(0);
    setRetriesRemaining(2);
    setSessionId(crypto.randomUUID());
    setPriceRange(null);
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
    sessionId,
    priceRange,
    setPriceRange,
    resetSpinFlow,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
