import visitorCountry from '../netlify/edge-functions/visitor-country';
import { DISCOVERY_COUNTRIES, isDiscoveryCountry } from '../src/config/countries';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDiscoveryCountry, saveDiscoveryCountry } from '../src/services/countryPreference';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock('../src/config/runtime', () => ({ publicSiteUrl: () => 'https://example.test' }));

test('the discovery catalogue contains unique supported codes and DRC currencies', () => {
  const codes = DISCOVERY_COUNTRIES.map((country) => country.code);
  expect(new Set(codes).size).toBe(codes.length);
  expect(isDiscoveryCountry('UG')).toBe(true);
  expect(isDiscoveryCountry('KE')).toBe(true);
  expect(isDiscoveryCountry('TZ')).toBe(false);
  expect(DISCOVERY_COUNTRIES.find((country) => country.code === 'CD')?.currencies).toEqual(['CDF', 'USD']);
});

test('country endpoint returns only a normalized code with private no-store caching', async () => {
  const response = await visitorCountry(new Request('https://example.test/api/visitor-country'), {
    geo: { country: { code: ' ke ' } },
  });
  expect(await response.json()).toEqual({ countryCode: 'KE' });
  expect(response.headers.get('cache-control')).toContain('no-store');
});

test('country endpoint handles absent or malformed geo data', async () => {
  const request = new Request('https://example.test/api/visitor-country');
  expect(await (await visitorCountry(request, {})).json()).toEqual({ countryCode: null });
  expect(await (await visitorCountry(request, { geo: { country: { code: 'UGA' } } })).json())
    .toEqual({ countryCode: null });
});

test('saved choice takes precedence over IP detection, including All', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('ALL');
  const previousFetch = globalThis.fetch;
  globalThis.fetch = jest.fn() as typeof fetch;
  try {
    expect(await resolveDiscoveryCountry()).toBe('ALL');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await saveDiscoveryCountry('KE');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('yovibe_discovery_country_v1', 'KE');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('unknown countries and failed detection fall back to All', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ countryCode: 'TZ' }) }) as typeof fetch;
    expect(await resolveDiscoveryCountry()).toBe('ALL');
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as typeof fetch;
    expect(await resolveDiscoveryCountry()).toBe('ALL');
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ countryCode: 'KE' }) }) as typeof fetch;
    expect(await resolveDiscoveryCountry()).toBe('KE');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
