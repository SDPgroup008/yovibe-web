// Server-side per-event payout-eligibility policy.
//
// A missing settings table intentionally resolves to the legacy scan-gated
// policy. This makes application deployment safe before the additive database
// migration is applied, while other database errors still fail visibly.

const SETTINGS_TABLE = 'event_payout_eligibility_settings';

function isMissingSettingsTable(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' ||
    (message.includes(SETTINGS_TABLE) && (message.includes('does not exist') || message.includes('schema cache')));
}

function legacyScanPolicy() {
  return {
    salePayoutEnabled: false,
    changedAt: null,
    changedBy: null,
    source: 'legacy_default',
  };
}

async function getEventPayoutEligibility(admin, eventSlug) {
  if (!eventSlug) return legacyScanPolicy();

  const { data, error } = await admin
    .from(SETTINGS_TABLE)
    .select('sale_payout_enabled, changed_at, changed_by')
    .eq('event_slug', String(eventSlug))
    .maybeSingle();

  if (error) {
    if (isMissingSettingsTable(error)) return legacyScanPolicy();
    throw error;
  }

  return {
    salePayoutEnabled: data?.sale_payout_enabled === true,
    changedAt: data?.changed_at || null,
    changedBy: data?.changed_by || null,
    source: data ? 'event_setting' : 'legacy_default',
  };
}

module.exports = {
  SETTINGS_TABLE,
  getEventPayoutEligibility,
  isMissingSettingsTable,
  legacyScanPolicy,
};
