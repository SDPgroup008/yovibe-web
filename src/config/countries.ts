/** Countries supported for discovery. Payment availability is verified separately. */
export const DISCOVERY_COUNTRIES = [
  { code: 'BJ', name: 'Benin', currencies: ['XOF'] },
  { code: 'CM', name: 'Cameroon', currencies: ['XAF'] },
  { code: 'CI', name: "Côte d’Ivoire", currencies: ['XOF'] },
  { code: 'CD', name: 'Democratic Republic of the Congo', currencies: ['CDF', 'USD'] },
  { code: 'GA', name: 'Gabon', currencies: ['XAF'] },
  { code: 'KE', name: 'Kenya', currencies: ['KES'] },
  { code: 'CG', name: 'Republic of the Congo', currencies: ['XAF'] },
  { code: 'RW', name: 'Rwanda', currencies: ['RWF'] },
  { code: 'SN', name: 'Senegal', currencies: ['XOF'] },
  { code: 'SL', name: 'Sierra Leone', currencies: ['SLE'] },
  { code: 'UG', name: 'Uganda', currencies: ['UGX'] },
  { code: 'ZM', name: 'Zambia', currencies: ['ZMW'] },
] as const;

export type CountryCode = typeof DISCOVERY_COUNTRIES[number]['code'];
export type CountrySelection = CountryCode | 'ALL';

export function parseEntryFee(value: unknown): number {
  const match = /^(?:[A-Z]{3}\s*)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?$/i.exec(String(value ?? '').trim());
  return match ? Number(match[1]!.replace(/,/g, '') + (match[2] || '')) : NaN;
}

export function isDiscoveryCountry(value: string): value is CountryCode {
  return DISCOVERY_COUNTRIES.some((country) => country.code === value);
}
