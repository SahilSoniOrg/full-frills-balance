import {
  finishAppearancePicker,
  openAppearancePicker,
  peekAppearancePickerRequest,
  resetAppearancePickerSessionForTests,
  subscribeAppearancePicker,
} from '@/src/components/overlays/appearancePickerSession';
import { Icon } from '@/src/components/core';

describe('appearancePickerSession', () => {
  afterEach(() => {
    resetAppearancePickerSessionForTests();
  });

  it('opens a pending request and resolves on finish', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeAppearancePicker(listener);
    const pending = openAppearancePicker({
      mode: 'icon',
      selectedIcon: Icon.Wallet,
    });

    expect(listener).toHaveBeenCalled();
    expect(peekAppearancePickerRequest()?.mode).toBe('icon');

    finishAppearancePicker({ icon: Icon.Bank, color: '' });

    await expect(pending).resolves.toEqual({ icon: Icon.Bank, color: '' });
    expect(peekAppearancePickerRequest()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('ignores a second finish after the session is cleared', async () => {
    const pending = openAppearancePicker({ mode: 'both' });
    finishAppearancePicker(null);
    finishAppearancePicker({ icon: Icon.Bank, color: '#fff' });

    await expect(pending).resolves.toBeNull();
  });
});
