jest.mock('../netlify/shared/supabaseAdmin', () => ({ getAdminClient: jest.fn() }));
jest.mock('../netlify/shared/eventSummaryBroadcast', () => ({ sendEventSummaryBroadcast: jest.fn() }));
const { getAdminClient } = require('../netlify/shared/supabaseAdmin');
const { sendEventSummaryBroadcast } = require('../netlify/shared/eventSummaryBroadcast');
const today = require('../netlify/functions/broadcast-todays-events');
const week = require('../netlify/functions/broadcast-week-events');

afterEach(() => { jest.clearAllMocks(); delete process.env.NOTIFICATION_DISPATCH_ENABLED; delete process.env.APP_ENV; });

test.each([today, week])('staging never sends scheduled broadcasts', async (scheduled) => {
  process.env.APP_ENV = 'staging';
  process.env.NOTIFICATION_DISPATCH_ENABLED = 'true';
  expect((await scheduled.handler()).statusCode).toBe(204);
  expect(getAdminClient).not.toHaveBeenCalled();
  expect(sendEventSummaryBroadcast).not.toHaveBeenCalled();
});

test.each([today, week])('production without the dispatch flag does not send', async (scheduled) => {
  process.env.APP_ENV = 'production';
  expect((await scheduled.handler()).statusCode).toBe(204);
  expect(sendEventSummaryBroadcast).not.toHaveBeenCalled();
});
