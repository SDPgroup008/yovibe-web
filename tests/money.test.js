const { toMinorUnits, fromMinorUnits, withinLimits } = require('../netlify/shared/money');

test('preserves exact decimal values without floating-point rounding', () => {
  expect(toMinorUnits('0.29', 2)).toBe(29n);
  expect(fromMinorUnits(10025n, 2)).toBe('100.25');
  expect(toMinorUnits('5000000', 0)).toBe(5000000n);
});

test('enforces inclusive transaction limits', () => {
  expect(withinLimits('0.01', '0.01', '100.25', 2)).toBe(true);
  expect(withinLimits('100.25', '0.01', '100.25', 2)).toBe(true);
  expect(withinLimits('100.26', '0.01', '100.25', 2)).toBe(false);
  expect(withinLimits('0', '0', '100', 0)).toBe(false);
});

test('rejects scientific notation, negative values and unsupported precision', () => {
  for (const value of ['1e3', '-1', '1.001', '1,000', 'NaN']) {
    expect(() => toMinorUnits(value, 2)).toThrow();
  }
  expect(() => toMinorUnits('1.01', 0)).toThrow();
  expect(() => toMinorUnits(1.1, 2)).toThrow();
});
