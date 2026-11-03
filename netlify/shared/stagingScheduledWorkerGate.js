/**
 * Keep high-frequency scheduled maintenance workers quiet in staging unless
 * they are explicitly enabled for a recovery/email test.
 *
 * Production is intentionally never gated here. Other environments retain
 * their existing behaviour as well.
 */
function isScheduledWorkerEnabled() {
  const appEnv = String(process.env.APP_ENV || '').trim().toLowerCase();
  const deployContext = String(process.env.CONTEXT || '').trim().toLowerCase();
  const branch = String(process.env.BRANCH || '').trim().toLowerCase();
  let siteHost = '';
  try {
    siteHost = new URL(String(process.env.SITE_URL || '')).hostname.toLowerCase();
  } catch {
    // An absent or malformed SITE_URL must not make a non-production worker run.
  }

  // Netlify branch deploys can inherit production-looking variables. Treat the
  // staging branch/site as staging even when APP_ENV was configured incorrectly.
  const isStaging = ['staging', 'stagging'].includes(appEnv)
    || branch === 'stagging'
    || siteHost.includes('yovibe-stagging')
    || (deployContext === 'branch-deploy' && branch !== 'main');

  // Production retains the original always-on behavior. Every other
  // environment is opt-in, which also fails closed for local/preview runs.
  if (appEnv === 'production' && !isStaging) return true;
  return String(process.env.STAGING_SCHEDULED_WORKERS_ENABLED || '').trim().toLowerCase() === 'true';
}

function disabledResponse(workerName) {
  console.info('[ScheduledWorkerGate] skipped', {
    worker: workerName,
    appEnv: String(process.env.APP_ENV || '').trim().toLowerCase() || 'unset',
    context: String(process.env.CONTEXT || '').trim().toLowerCase() || 'unset',
    branch: String(process.env.BRANCH || '').trim() || 'unset',
    stagingWorkersEnabled: String(process.env.STAGING_SCHEDULED_WORKERS_ENABLED || '').trim().toLowerCase() === 'true',
  });

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
