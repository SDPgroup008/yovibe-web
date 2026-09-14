const PRODUCTION_SUPABASE_REF = 'uqukizjohackrcwrtefk';
const PRODUCTION_SITE_HOSTS = new Set(['yovibe.net', 'www.yovibe.net']);
const PRODUCTION_R2_BUCKETS = new Set(['yovibe']);
const PRODUCTION_R2_PUBLIC_HOST = 'pub-9790a44a83ab4a5e92acd4f1904afbbe.r2.dev';

function appEnvironment() {
  const value = String(process.env.APP_ENV || '').trim().toLowerCase();
  if (value) return value;
  if (process.env.NODE_ENV === 'test') return 'test';
  throw new Error('APP_ENV is required (expected staging, development, test, or production)');
}

function requiredEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && !String(value).includes('placeholder') && !String(value).includes('your_')) {
      return String(value).trim();
    }
  }
  throw new Error(`${names.join(' or ')} is not configured`);
}

function parseUrl(label, value) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL`);
  }
}

function isStaging() {
  return appEnvironment() === 'staging';
}

function assertSupabaseUrl(value) {
  const url = parseUrl('SUPABASE_URL', value);
  if (isStaging()) {
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
      throw new Error('Staging SUPABASE_URL must use a hosted supabase.co project');
    }
    if (url.hostname.startsWith(`${PRODUCTION_SUPABASE_REF}.`)) {
      throw new Error('Staging configuration points to the production Supabase project');
    }
  }
  return value.replace(/\/$/, '');
}

function assertSiteUrl(value) {
  const url = parseUrl('SITE_URL', value);
  if (isStaging() && PRODUCTION_SITE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Staging SITE_URL points to the production site');
  }
  return value.replace(/\/$/, '');
}

function assertPesapalUrl(value) {
  const url = parseUrl('PESAPAL_API_URL', value);
  if (isStaging() && url.hostname !== 'cybqa.pesapal.com') {
    throw new Error('Staging PesaPal requests must use cybqa.pesapal.com');
  }
  return value.replace(/\/$/, '');
}

function assertPawaPayUrl(value) {
  const url = parseUrl('PAWAPAY_API_URL', value);
  if (isStaging() && url.hostname !== 'api.sandbox.pawapay.io') {
    throw new Error('Staging pawaPay requests must use api.sandbox.pawapay.io');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (!path) url.pathname = '/v2';
  else if (path !== '/v2') throw new Error('PAWAPAY_API_URL must use the /v2 API path');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

function assertR2Config(config) {
  parseUrl('R2_ENDPOINT', config.endpoint);
  if (isStaging()) {
    if (PRODUCTION_R2_BUCKETS.has(config.bucket)) {
      throw new Error(`Staging ${config.kind} R2 configuration points to the production bucket`);
    }
    if (!config.bucket.includes('stagging')) {
      throw new Error(`Staging ${config.kind} R2 bucket must be explicitly staging-scoped`);
    }
    if (config.kind === 'private' && config.publicUrl) {
      throw new Error('Private R2 configuration must not expose a public URL');
    }
    if (config.publicUrl && parseUrl('R2_PUBLIC_URL', config.publicUrl).hostname === PRODUCTION_R2_PUBLIC_HOST) {
      throw new Error('Staging R2 configuration points to the production public bucket URL');
    }
  }
  return config;
}

function getSiteUrl() {
  return assertSiteUrl(requiredEnv('SITE_URL'));
}

module.exports = {
  appEnvironment,
  requiredEnv,
  isStaging,
  assertSupabaseUrl,
  assertSiteUrl,
  assertPesapalUrl,
  assertPawaPayUrl,
  assertR2Config,
  getSiteUrl,
};
