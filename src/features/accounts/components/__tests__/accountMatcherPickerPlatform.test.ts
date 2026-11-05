import { canChooseOlderAccountMatcherMessages } from '../accountMatcherPickerPlatform';

describe('account matcher older-message picker platform gate', () => {
  it('offers device inbox messages on Android only', () => {
    expect(canChooseOlderAccountMatcherMessages('android')).toBe(true);
    expect(canChooseOlderAccountMatcherMessages('ios')).toBe(false);
    expect(canChooseOlderAccountMatcherMessages('web')).toBe(false);
  });
});
