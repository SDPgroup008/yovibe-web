// Monetary amounts are parsed from decimal strings and kept as integer minor
// units. Callers must choose a currency/provider precision explicitly.
function toMinorUnits(value, decimals) {
  if (typeof value !== 'string' || !Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new TypeError('Invalid amount or precision');
  }
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());
  if (!match || (match[2] || '').length > decimals || match[1].length > 15) {
    throw new RangeError('Invalid monetary amount');
  }
  const scale = 10n ** BigInt(decimals);
  return BigInt(match[1]) * scale + BigInt((match[2] || '').padEnd(decimals, '0') || '0');
}

function fromMinorUnits(units, decimals) {
  if (typeof units !== 'bigint' || units < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 2) {
    throw new TypeError('Invalid minor units or precision');
  }
  const scale = 10n ** BigInt(decimals);
  if (decimals === 0) return units.toString();
  return `${units / scale}.${String(units % scale).padStart(decimals, '0')}`;
}

function withinLimits(amount, minimum, maximum, decimals) {
  const value = toMinorUnits(amount, decimals);
  return value > 0n
    && (minimum == null || value >= toMinorUnits(minimum, decimals))
    && (maximum == null || value <= toMinorUnits(maximum, decimals));
}

module.exports = { toMinorUnits, fromMinorUnits, withinLimits };
