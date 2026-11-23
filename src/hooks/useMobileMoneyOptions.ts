import { useEffect, useState } from 'react';
import { publicSiteUrl } from '../config/runtime';

export type MobileMoneyOption = {
  provider: string; displayName: string; available: boolean; prefix: string;
  instructions?: string[];
};

export function useMobileMoneyOptions(country?: string, currency?: string, operation = 'DEPOSIT') {
  const key = [country, currency, operation].join(':');
  const [result, setResult] = useState<{ key: string; options: MobileMoneyOption[]; error: string }>({ key: '', options: [], error: '' });
  useEffect(() => {
    if (!country || !currency) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ country, currency, operation });
    fetch(`${publicSiteUrl()}/.netlify/functions/mobile-money-options?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check mobile-money providers');
        const { providers } = await response.json();
        if (!Array.isArray(providers)) throw new Error('Invalid provider configuration');
        if (!controller.signal.aborted) setResult({ key, options: providers.filter(p => p.available), error: '' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, options: [], error: 'Mobile-money options could not be loaded.' });
      });
    return () => controller.abort();
  }, [key, country, currency, operation]);
  return result.key === key ? { ...result, loading: false } : { options: [], error: '', loading: true };
}
