const crypto = require('crypto');
const { requiredEnv } = require('./runtimeConfig');

function otpSecret() {
  const secret = requiredEnv('PAYOUT_OTP_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PAYOUT_OTP_SECRET must be at least 32 bytes');
  }
  return secret;
}

function hashOtp(userId, otp) {
  return crypto.createHmac('sha256', otpSecret())
    .update(`${String(userId)}:${String(otp).trim()}`)
    .digest('hex');
}

function otpMatches(userId, suppliedOtp, storedHash) {
  const expected = Buffer.from(hashOtp(userId, suppliedOtp), 'utf8');
  const stored = Buffer.from(String(storedHash || ''), 'utf8');
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
}

module.exports = { hashOtp, otpMatches };
