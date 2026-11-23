// Event prices and installment schedules use the same units at checkout and settlement.
function priceScale(country, currency) {
  return ['UGX', 'RWF', 'XOF', 'KES'].includes(currency) || ['CM', 'CG'].includes(country) ? 1 : 100;
}

function installmentAmounts(total, count, country = 'UG', currency = 'UGX') {
  const scale = priceScale(country, currency);
  const units = Math.round(Number(total) * scale);
  if (!Number.isSafeInteger(units) || units < 0 || ![2, 3, 4, 5].includes(count)) {
    throw new Error('Invalid installment schedule');
  }
  const first = Math.round(units * (count === 2 ? 0.5 : 0.4));
  const regular = Math.floor((units - first) / (count - 1));
  return Array.from({ length: count }, (_, index) => {
    const base = index === 0 ? first : index === count - 1 ? units - first - regular * (count - 2) : regular;
    const fee = Math.round(base * 8 / 100);
    return { amount: base / scale, serviceFee: fee / scale, totalDue: (base + fee) / scale };
  });
}

// Listed markets use fixed UTC offsets. CD uses Kinshasa time for event pricing.
const utcOffsets = { BJ: 1, CM: 1, CI: 0, CD: 1, GA: 1, KE: 3, CG: 1, RW: 2, SN: 0, SL: 0, UG: 3, ZM: 2 };
function lateFeeStartsAt(eventDate, country = 'UG') {
  const offset = utcOffsets[country] * 3600000;
  const local = new Date(new Date(eventDate).getTime() + offset);
  local.setUTCHours(7, 0, 0, 0);
  return new Date(local.getTime() - offset);
}

function walletPhone(value, prefix) {
  const input = String(value || '').trim().replace(/[ ()-]/g, '');
  const code = String(prefix || '').replace(/^\+/, '');
  if (!/^\+?\d+$/.test(input) || !/^\d{1,3}$/.test(code)) return null;
  const international = input.startsWith('+') || input.startsWith('00');
  let digits = input.replace(/^(\+|00)/, '');
  if (!digits.startsWith(code)) {
    if (international) return null;
    // Benin, Côte d'Ivoire and Congo-Brazzaville retain the initial zero in E.164.
    digits = code + (['229', '225', '242'].includes(code) ? digits : digits.replace(/^0/, ''));
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

module.exports = { installmentAmounts, lateFeeStartsAt, priceScale, walletPhone };

// Distribute an order total over the issued tickets without losing its remainder.
function ticketShare(amount, quantity, index, scale) {
  const units = Math.round(Number(amount) * scale);
  return (Math.floor(units / quantity) + (index < units % quantity ? 1 : 0)) / scale;
}
module.exports.ticketShare = ticketShare;
