const COUNTRY_CURRENCIES = Object.freeze({
  BJ: { alpha3: 'BEN', currencies: ['XOF'], providers: ['MOOV_BEN', 'MTN_MOMO_BEN'] },
  CM: { alpha3: 'CMR', currencies: ['XAF'], providers: ['MTN_MOMO_CMR'] },
  CI: { alpha3: 'CIV', currencies: ['XOF'], providers: ['MTN_MOMO_CIV', 'ORANGE_CIV'] },
  CD: { alpha3: 'COD', currencies: ['CDF', 'USD'], providers: ['AIRTEL_COD', 'ORANGE_COD', 'VODACOM_MPESA_COD'] },
  GA: { alpha3: 'GAB', currencies: ['XAF'], providers: ['AIRTEL_GAB', 'MOOV_GAB'] },
  KE: { alpha3: 'KEN', currencies: ['KES'], providers: ['MPESA_KEN'] },
  CG: { alpha3: 'COG', currencies: ['XAF'], providers: ['AIRTEL_COG', 'MTN_MOMO_COG'] },
  RW: { alpha3: 'RWA', currencies: ['RWF'], providers: ['AIRTEL_RWA', 'MTN_MOMO_RWA'] },
  SN: { alpha3: 'SEN', currencies: ['XOF'], providers: ['FREE_SEN', 'ORANGE_SEN'] },
  SL: { alpha3: 'SLE', currencies: ['SLE'], providers: ['ORANGE_SLE'] },
  UG: { alpha3: 'UGA', currencies: ['UGX'], providers: ['AIRTEL_OAPI_UGA', 'MTN_MOMO_UGA'] },
  ZM: { alpha3: 'ZMB', currencies: ['ZMW'], providers: ['AIRTEL_OAPI_ZMB', 'MTN_MOMO_ZMB', 'ZAMTEL_ZMB'] },
});

module.exports = { COUNTRY_CURRENCIES };
