export function publicSiteUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '');
  }
  const configured = String(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.EXPO_PUBLIC_SITE_URL || ''
  ).trim();
  if (configured) {
    try { return new URL(configured).origin; }
    catch { throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute URL'); }
  }
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return 'http://localhost:8888';
  }
  throw new Error('NEXT_PUBLIC_SITE_URL is required outside the browser');
}

export function publicAssetUrl(path: string): string {
  return `${publicSiteUrl()}/${String(path).replace(/^\/+/, '')}`;
}
