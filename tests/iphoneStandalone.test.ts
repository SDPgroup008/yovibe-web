import { isIphoneStandalone } from '../src/utils/useIphoneStandalone';

describe('iPhone Home Screen detection', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';

  test('accepts either display-mode or the iOS standalone flag', () => {
    expect(isIphoneStandalone(iphone, true, false)).toBe(true);
    expect(isIphoneStandalone(iphone, false, true)).toBe(true);
  });

  test('keeps browser and other devices in their normal layouts', () => {
    expect(isIphoneStandalone(iphone, false, false)).toBe(false);
    expect(isIphoneStandalone('Mozilla/5.0 (iPad)', true, true)).toBe(false);
    expect(isIphoneStandalone('Mozilla/5.0 (Linux; Android)', true, false)).toBe(false);
  });
});
