import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CountrySelection } from '../config/countries';
import { resolveDiscoveryCountry, saveDiscoveryCountry } from '../services/countryPreference';

type CountryContextValue = {
  country: CountrySelection;
  ready: boolean;
  selectCountry: (country: CountrySelection) => void;
};

const CountryContext = createContext<CountryContextValue | null>(null);

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [country, setCountry] = useState<CountrySelection>('ALL');
  const [ready, setReady] = useState(false);
  const selectedManually = useRef(false);

  useEffect(() => {
    let active = true;
    resolveDiscoveryCountry().then((detected) => {
      if (!active) return;
      if (!selectedManually.current) setCountry(detected);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  const selectCountry = useCallback((selection: CountrySelection) => {
    selectedManually.current = true;
    setCountry(selection);
    setReady(true);
    void saveDiscoveryCountry(selection).catch(() => {
      // Continue with the current selection when browser storage is unavailable.
    });
  }, []);

  return <CountryContext.Provider value={{ country, ready, selectCountry }}>{children}</CountryContext.Provider>;
}

export function useCountry(): CountryContextValue {
  const context = useContext(CountryContext);
  if (!context) throw new Error('useCountry must be used within CountryProvider');
  return context;
}
