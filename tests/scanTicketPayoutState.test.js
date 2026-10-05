const { buildTicketRedemptionUpdate } = require('../netlify/functions/scan-ticket');

describe('scan ticket payout state', () => {
  const timestamp = '2026-10-05T08:00:00.000Z';

  test('makes a legacy scan-gated ticket eligible after scanning', () => {
    expect(buildTicketRedemptionUpdate({ payout_status: 'pending', payout_eligible: false }, timestamp)).toEqual({
      status: 'used',
      is_scanned: true,
      scanned_at: timestamp,
      payout_eligible: true,
    });
  });

  test('does not overwrite a payout already claimed or paid before scanning', () => {
    expect(buildTicketRedemptionUpdate({ payout_status: 'paid', payout_eligible: false }, timestamp)).toEqual({
      status: 'used',
      is_scanned: true,
      scanned_at: timestamp,
    });
    expect(buildTicketRedemptionUpdate({ payout_status: 'processing', payout_eligible: false }, timestamp)).not.toHaveProperty('payout_eligible');
  });

  test('preserves eligibility already granted at verified sale time', () => {
    const update = buildTicketRedemptionUpdate({ payout_status: 'pending', payout_eligible: true }, timestamp);
    expect(update).not.toHaveProperty('payout_eligible');
    expect(update).not.toHaveProperty('payout_status');
  });
});
