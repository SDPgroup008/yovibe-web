jest.mock('../netlify/shared/ticketFulfillment', () => ({ confirmPaymentVerified: jest.fn() }));
const { COUNTRY_CURRENCIES, configuredOperations } = require('../netlify/shared/pawapayCountryConfig');
const { ticketQuote } = require('../netlify/shared/marketPayments');
const { checkPayment } = require('../netlify/shared/settlement');
const { installmentAmounts, lateFeeStartsAt, ticketShare, walletPhone } = require('../shared/eventMoney');

describe.each(Object.entries(COUNTRY_CURRENCIES))('%s configured wallets', (country, market) => {
  test.each(market.currencies)('%s routes each operation independently', currency => {
    const operationTypes = [{ DEPOSIT: { status: 'OPERATIONAL' } }, { operationType: 'PAYOUT', status: 'DELAYED' }, { operationType: 'REFUND', status: 'CLOSED' }];
    const providers = [...market.providers, 'UNLISTED'].map(provider => ({ provider, currencies: [{ currency, operationTypes }] }));
    const config = { countries: [{ country: market.alpha3, providers }] };
    expect(configuredOperations(config, country, currency, 'DEPOSIT').map(option => option.provider)).toEqual(market.providers);
    for (const operation of ['PAYOUT', 'REFUND']) {
      expect(configuredOperations(config, country, currency, operation).every(row => !row.available)).toBe(true);
    }
  });
});

test('table prices, installment fees and the per-ticket shares reconcile to the original currency', () => {
  const event = { date: '2026-10-01', country_code: 'CD', currency: 'USD', late_fee_percent: 10,
    entry_fees: [{ name: 'Table', amount: 'USD 25.15', isTable: true, tableSize: 3 }] };
  expect(ticketQuote(event, 'Table', 6, new Date('2026-10-01T05:59:59Z')).amount).toBe('50.30');
  expect(ticketQuote(event, 'Table', 6, new Date('2026-10-01T06:00:00Z')).amount).toBe('55.33');
  expect(installmentAmounts(50.30, 2, 'CD', 'USD')).toEqual(Array(2).fill({ amount: 25.15, serviceFee: 2.01, totalDue: 27.16 }));
  expect([0, 1, 2].map(i => ticketShare(25.15, 3, i, 100))).toEqual([8.39, 8.38, 8.38]);
  expect(lateFeeStartsAt('2026-10-01', 'UG').toISOString()).toBe('2026-10-01T04:00:00.000Z');
});

test.each([['0772123456','256','256772123456'], ['0178123456','225','2250178123456'], ['+254712345678','256',null]])(
  'wallet %s must belong to country prefix %s', (input, prefix, expected) => expect(walletPhone(input, prefix)).toBe(expected)
);

test('settlement requires completed payment in the quoted denomination for the same order', () => {
  const expected = { method: 'mobile_money', id: 'a', currency: 'CDF', amount: '100.50' };
  const verified = { status: 'completed', depositId: 'a', currency: 'CDF', amount: 100.5 };
  expect(() => checkPayment(verified, expected)).not.toThrow();
  for (const other of [{ currency: 'USD' }, { amount: 100 }, { status: 'pending' }, { depositId: 'b' }]) {
    expect(() => checkPayment({ ...verified, ...other }, expected)).toThrow();
  }
});
