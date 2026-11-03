/**
 * Keep high-frequency scheduled maintenance workers quiet in staging unless
 * they are explicitly enabled for a recovery/email test.
 *
 * Production is intentionally never gated here. Other environments retain
 * their existing behaviour as well.
 */
function isScheduledWorkerEnabled() {
  if (String(process.env.APP_ENV || '').toLowerCase() !== 'staging') return true;
  return String(process.env.STAGING_SCHEDULED_WORKERS_ENABLED || '').toLowerCase() === 'true';
}

function disabledResponse(workerName) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      skipped: true,
      reason: 'staging scheduled workers disabled',
      worker: workerName,
    }),
  };
}

module.exports = { isScheduledWorkerEnabled, disabledResponse };
