import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDiscoveryCountry, type CountrySelection } from '../config/countries';
import { publicSiteUrl } from '../config/runtime';

const COUNTRY_PREFERENCE_KEY = 'yovibe_discovery_country_v1';

/** A saved choice wins over approximate IP geolocation, including ALL. */
export async function resolveDiscoveryCountry(): Promise<CountrySelection> {
  try {
    const saved = await AsyncStorage.getItem(COUNTRY_PREFERENCE_KEY);
    if (saved === 'ALL' || (saved && isDiscoveryCountry(saved))) return saved;
  } catch {
    // Storage may be unavailable in private browser sessions.
  }

  try {
    const response = await fetch(`${publicSiteUrl()}/api/visitor-country`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return 'ALL';
    const payload = await response.json();
    const country = typeof payload?.countryCode === 'string' ? payload.countryCode.toUpperCase() : '';
    return isDiscoveryCountry(country) ? country : 'ALL';
  } catch {
    return 'ALL';
  }
}

export async function saveDiscoveryCountry(country: CountrySelection): Promise<void> {
  await AsyncStorage.setItem(COUNTRY_PREFERENCE_KEY, country);
}
