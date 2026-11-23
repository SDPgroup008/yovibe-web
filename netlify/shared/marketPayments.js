const { walletPhone: providerPhone, lateFeeStartsAt, priceScale } = require('../../shared/eventMoney');
const { toMinorUnits, fromMinorUnits } = require('./money');
const { fetchConfiguredOperations } = require('./pawapayCountryConfig');

function invalid(message, statusCode = 422) {
  return Object.assign(new Error(message), { statusCode });
}

// Normalise insignificant zeroes without changing the value.
function decimal(value) {
  return String(value ?? '').trim().replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function amountMatches(a, b) {
  try { return toMinorUnits(decimal(a), 2) === toMinorUnits(decimal(b), 2); }
  catch { return false; }
}


async function paymentRoute({ country, currency, provider, amount, operation, phoneNumber }) {
  const options = await fetchConfiguredOperations(country, currency, operation);
  const route = options.find(row => row.provider === provider && row.available);
  if (!route) throw invalid('This provider is unavailable for the selected currency and operation');
  const precision = { NONE: 0, TWO: 2, TWO_PLACES: 2 }[route.decimalsInAmount];
  if (precision === undefined) throw invalid('Provider amount precision is unavailable');
  let units;
  try { units = toMinorUnits(decimal(amount), precision); }
  catch { throw invalid('The amount exceeds the precision supported by this provider'); }
  const cents = toMinorUnits(decimal(amount), 2);
  if (units <= 0n || (route.minimum != null && cents < toMinorUnits(decimal(route.minimum), 2))
    || (route.maximum != null && cents > toMinorUnits(decimal(route.maximum), 2))) {
    throw invalid('The amount is outside this provider’s transaction limits');
  }
  if (operation === 'DEPOSIT' && country === 'UG' && cents > 500000000n) throw invalid('The mobile-money deposit limit is UGX 5,000,000');
  const phone = phoneNumber == null ? null : providerPhone(phoneNumber, route.prefix);
  if (phoneNumber != null && !phone) throw invalid('Enter a mobile-money number for the event country');
  return { ...route, phoneNumber: phone, amount: fromMinorUnits(units, precision) };
}

function ticketQuote(event, ticketType, quantity, now = new Date()) {
  const fee = event.entry_fees?.find(item => item.name === ticketType);
  const size = fee?.isTable ? Number(fee.tableSize) : 1;
  if (!fee || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(size) || size < 1 || quantity % size !== 0) {
    throw invalid('Invalid ticket type or quantity');
  }
  const price = String(fee.amount).trim().replace(/^[A-Z]{3}\s+/i, '');
  if (!/^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/.test(price)) throw invalid('Invalid ticket price');
  const precision = priceScale(event.country_code, event.currency) === 1 ? 0 : 2;
  const unit = toMinorUnits(decimal(price.replace(/,/g, '')), precision);
  const subtotal = unit * BigInt(quantity / size);
  const threshold = lateFeeStartsAt(event.date, event.country_code || 'UG');
  const percent = toMinorUnits(decimal(event.late_fee_percent ?? 0), 2);
  const late = now >= threshold ? (subtotal * percent + 5000n) / 10000n : 0n;
  return { amount: fromMinorUnits(subtotal + late, precision), unitPrice: fromMinorUnits(unit, precision),
    tableSize: size, isTableEntry: !!fee.isTable, lateFeePercent: now >= threshold ? Number(event.late_fee_percent || 0) : 0 };
}

module.exports = { amountMatches, decimal, invalid, paymentRoute, providerPhone, ticketQuote };
