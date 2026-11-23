// Standard merchant schedule, https://www.pawapay.io/fees (reviewed 2026-11-20).
// Percentages are basis points. Upper bounds in tier tables are exclusive.
const schedule = {
  MTN_MOMO_BEN: [220, 150], MOOV_BEN: [220, 100], MTN_MOMO_CMR: [175, 130],
  MTN_MOMO_CIV: [180, 130], ORANGE_CIV: [250, 200], AIRTEL_COD: [320, 216],
  ORANGE_COD: [300, 100], VODACOM_MPESA_COD: [250, 200], AIRTEL_GAB: [200, 100],
  MOOV_GAB: [220, 160], AIRTEL_COG: [400, 100], MTN_MOMO_COG: [400, 100],
  AIRTEL_RWA: [250, 100], MTN_MOMO_RWA: [310, 100], FREE_SEN: [200, 150],
  ORANGE_SEN: [200, 180], ORANGE_SLE: [330, 215], MTN_MOMO_UGA: [300, 100],
  AIRTEL_OAPI_UGA: [250, 100], MPESA_KEN: [100, 100], AIRTEL_OAPI_ZMB: [100, 100],
  MTN_MOMO_ZMB: [100, 200], ZAMTEL_ZMB: [100, 200],
};
const tiers = {
  MPESA_KEN: {
    DEPOSIT: [[101,0],[501,5],[1001,10],[1501,15],[2501,20],[3501,25],[5001,34],[7501,42],[10001,48],[15001,57],[20001,62],[25001,67],[30001,72],[35001,83],[40001,99],[45001,103],[150001,108]],
    PAYOUT: [[101,0],[1501,5],[5001,9],[20001,11],[150000,13]],
  },
  MTN_MOMO_UGA: { PAYOUT: [[500,0],[60000,300],[500000,600],[1000000,1000],[Infinity,1200]] },
  AIRTEL_OAPI_UGA: { PAYOUT: [[499,0],[60000,300],[500000,600],[Infinity,1000]] },
  AIRTEL_OAPI_ZMB: { DEPOSIT: [[150.01,.5],[500.01,1],[1000.01,1.5],[3000.01,2.8],[5000.01,4],[Infinity,5.5]] },
  MTN_MOMO_ZMB: { DEPOSIT: [[150.01,.42],[300.01,.9],[500.01,.8],[1000.01,1],[3000.01,2.2],[5000.01,3],[Infinity,4]] },
  ZAMTEL_ZMB: { DEPOSIT: [[150.01,.42],[300.01,.6],[500.01,.85],[1000.01,1],[3000.01,2],[5000.01,3],[Infinity,5]] },
};
const customerCollections = {
  MTN_MOMO_UGA: [[500,0],[2500,110],[5001,150],[15001,550],[30001,650],[45001,750],[60001,850],[125001,950],[250001,1050],[500001,1300],[1000000,3350],[2000000,5750],[4000000,5750],[7000000,5750]],
  AIRTEL_OAPI_UGA: [[500,0],[2500,120],[5001,150],[15001,550],[30001,650],[45001,750],[60001,850],[125001,950],[250001,1050],[500001,1300],[1000000,3350],[2000000,5750],[4000000,5750],[5000000,5750]],
  AIRTEL_OAPI_ZMB: [[500,2],[10000,5]],
  MTN_MOMO_ZMB: [[150.01,2.16],[300.01,2.2],[500.01,2.4],[1000.01,6],[3000.01,6.6],[5000.01,7],[10000.01,8]],
  ZAMTEL_ZMB: [[150.01,.08],[300.01,.1],[500.01,.2],[1000.01,.5],[3000.01,.8],[5000.01,1],[10000.01,1.5]],
};

function estimateFee(provider, operation, amount, customer = false) {
  const value = Number(amount);
  if (!schedule[provider] || !Number.isFinite(value) || value <= 0 || !['PAYOUT','DEPOSIT'].includes(operation)) return null;
  if (customer && operation === 'PAYOUT') return 0;
  const bands = customer ? customerCollections[provider] : tiers[provider]?.[operation];
  const tier = bands?.find(([limit]) => value < limit);
  if (bands && !tier) return null;
  if (!customer && ((operation === 'PAYOUT' && provider === 'MTN_MOMO_UGA' && value === 1000000)
    || (operation === 'PAYOUT' && provider === 'AIRTEL_OAPI_UGA' && value >= 500000 && value <= 500001)
    || (operation === 'DEPOSIT' && provider.endsWith('_ZMB') && value === 5000.01))) return null;
  const fixed = tier?.[1] ?? (!customer && operation === 'PAYOUT' && provider === 'MTN_MOMO_RWA' ? 60 : 0);
  const rate = customer ? (provider === 'AIRTEL_GAB' ? 100 : 0) : schedule[provider][operation === 'PAYOUT' ? 1 : 0];
  return (Math.round(Math.round(value * 100) * rate / 10000) + Math.round(fixed * 100)) / 100;
}
module.exports = { estimateFee };
