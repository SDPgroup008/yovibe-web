const {
  getEventPayoutEligibility,
  isMissingSettingsTable,
  legacyScanPolicy,
} = require('../netlify/shared/eventPayoutEligibility');

function clientFor(result) {
  const query = {
    select() { return this; },
    eq() { return this; },
    maybeSingle() { return Promise.resolve(result); },
  };
  return { from: () => query };
}

describe('event payout eligibility policy', () => {
  test('uses scan-gated policy when no event setting exists', async () => {
    await expect(getEventPayoutEligibility(clientFor({ data: null, error: null }), 'event-a'))
      .resolves.toEqual(legacyScanPolicy());
  });

  test('returns the event-specific sale-time setting', async () => {
    const result = await getEventPayoutEligibility(clientFor({
      data: {
        sale_payout_enabled: true,
        changed_at: '2026-10-05T08:00:00.000Z',
        changed_by: 'admin-id',
      },
      error: null,
    }), 'event-a');

    expect(result).toEqual({
      salePayoutEnabled: true,
      changedAt: '2026-10-05T08:00:00.000Z',
      changedBy: 'admin-id',
      source: 'event_setting',
    });
  });

  test('keeps the legacy policy during a code-before-migration rollout', async () => {
    const result = await getEventPayoutEligibility(clientFor({
      data: null,
      error: { code: '42P01', message: 'relation does not exist' },
    }), 'event-a');

    expect(result.salePayoutEnabled).toBe(false);
    expect(isMissingSettingsTable({ code: 'PGRST205' })).toBe(true);
  });
});
