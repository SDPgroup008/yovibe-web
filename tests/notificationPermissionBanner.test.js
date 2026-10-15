const {
  resolveNotificationPermissionBannerMode,
} = require('../src/utils/notificationPermissionBanner');

describe('notification permission banner', () => {
  const resolve = (overrides = {}) => resolveNotificationPermissionBannerMode({
    notificationsEnabled: true,
    permission: 'default',
    pushSupported: true,
    pushReason: 'supported',
    ...overrides,
  });

  test('requests permission on supported browsers with undecided permission', () => {
    expect(resolve()).toBe('request');
  });

  test('guides ordinary iPhone and iPad browser tabs to Home Screen installation', () => {
    expect(resolve({ pushSupported: false, pushReason: 'ios-home-screen-required' })).toBe('install-guidance');
  });

  test('guides blocked visitors to browser settings without requesting again', () => {
    expect(resolve({ permission: 'denied' })).toBe('settings-guidance');
  });

  test('hides the banner after permission is granted or notifications are disabled', () => {
    expect(resolve({ permission: 'granted' })).toBeNull();
    expect(resolve({ notificationsEnabled: false })).toBeNull();
  });
});
