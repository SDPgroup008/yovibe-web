const crypto = require('crypto');
const { requireUser, json } = require('../shared/supabaseAdmin');
const { hashOtp } = require('../shared/payoutOtp');
const { sendTransactionalEmail } = require('../shared/transactionalEmail');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    const { admin, authUser, profile } = await requireUser(event);
    const email = authUser.email || profile?.email;
    if (!email) return json(422, { error: 'Your account has no verified payout email' });

    const { data: latest, error: latestError } = await admin.from('payout_otps')
      .select('expires_at').eq('user_id', authUser.id).eq('used', false)
      .order('expires_at', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw latestError;
    if (latest && new Date(latest.expires_at).getTime() > Date.now() + 30_000) {
      return json(429, { error: 'Please wait before requesting another code' });
    }

    await admin.from('payout_otps').update({ used: true })
      .eq('user_id', authUser.id).eq('used', false);
    const otp = crypto.randomInt(100000, 1000000).toString();
    const { data: otpRow, error: insertError } = await admin.from('payout_otps').insert({
      user_id: authUser.id,
      email,
      // The existing text column now stores an HMAC, never the reusable code.
      otp: hashOtp(authUser.id, otp),
      expires_at: new Date(Date.now() + 90_000).toISOString(),
      used: false,
    }).select('id').single();
    if (insertError) throw insertError;

    const sent = await sendTransactionalEmail({
      to: email,
      subject: 'Your YoVibe payout verification code',
      html: `<p>Your payout verification code is <strong>${otp}</strong>.</p><p>It expires in 90 seconds. If you did not request a payout, do not share this code.</p>`,
      text: `Your YoVibe payout verification code is ${otp}. It expires in 90 seconds. If you did not request a payout, do not share this code.`,
    });
    if (!sent.ok) {
      await admin.from('payout_otps').update({ used: true }).eq('id', otpRow.id);
      throw new Error(`Unable to send payout code: ${sent.error}`);
    }
    return json(200, { success: true, expiresInSeconds: 90 });
  } catch (error) {
    console.error('[RequestPayoutOtp] Error:', error.message);
    return json(error.statusCode || 500, { error: error.message || 'Unable to send payout code' });
  }
};
