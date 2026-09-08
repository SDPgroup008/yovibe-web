const { Resend } = require('resend');
const { requiredEnv } = require('./runtimeConfig');

async function sendViaZeptoMail({ to, subject, html, text }) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) return { ok: false, error: 'ZEPTOMAIL_TOKEN not configured' };
  const fromAddress = requiredEnv('TICKET_EMAIL_ADDRESS');
  try {
    const response = await fetch('https://api.zeptomail.com/v1.1/email', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { address: fromAddress, name: 'YoVibe Tickets' },
        to: [{ email_address: { address: to } }],
        subject,
        htmlbody: html,
        textbody: text,
      }),
    });
    if (!response.ok) return { ok: false, error: `ZeptoMail API error: ${response.status}` };
    return { ok: true, provider: 'zeptomail' };
  } catch (error) {
    return { ok: false, error: `ZeptoMail request failed: ${error.message}` };
  }
}

async function sendViaResend({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const from = requiredEnv('TICKET_EMAIL_FROM');
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from, to: [to], subject, html, text,
    });
    if (error) return { ok: false, error: error.message || 'Resend error' };
    return { ok: true, provider: 'resend', id: data?.id };
  } catch (error) {
    return { ok: false, error: `Resend request failed: ${error.message}` };
  }
}

async function sendTransactionalEmail(message) {
  const zepto = await sendViaZeptoMail(message);
  if (zepto.ok) return zepto;
  const resend = await sendViaResend(message);
  if (resend.ok) return resend;
  return { ok: false, error: `${zepto.error}; ${resend.error}` };
}

module.exports = { sendTransactionalEmail };
