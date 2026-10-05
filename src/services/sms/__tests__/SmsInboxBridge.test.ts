import { SmsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { confirm } from '@/src/utils/alerts';
import { PermissionsAndroid, Platform } from 'react-native';

jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: { getSmsInbox: jest.fn() },
}));

describe('SmsInboxBridge permission disclosure', () => {
  let disclosureChoice: 'Continue' | 'Cancel';
  const mockConfirmShow = confirm.show as jest.MockedFunction<typeof confirm.show>;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    disclosureChoice = 'Continue';
    mockConfirmShow.mockImplementation(options => {
      if (disclosureChoice === 'Continue') options.onConfirm();
      else options.onCancel?.();
    });
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  });

  it.each([
    {
      flow: 'automatic import',
      title: 'Enable automatic SMS import?',
      run: (bridge: SmsInboxBridge) => bridge.requestAutomaticImportPermissions(),
      expectedOrder: ['disclosure', 'permission', 'permission'],
    },
    {
      flow: 'manual inbox scan',
      title: 'Allow SMS inbox import?',
      run: (bridge: SmsInboxBridge) => bridge.getLatestMessages(),
      expectedOrder: ['disclosure', 'permission'],
    },
  ])(
    'shows the $flow disclosure before requesting SMS permissions',
    async ({ title, run, expectedOrder }) => {
      const bridge = new SmsInboxBridge();
      const order: string[] = [];
      mockConfirmShow.mockImplementation(options => {
        order.push('disclosure');
        options.onConfirm();
      });
      jest.spyOn(PermissionsAndroid, 'request').mockImplementation(async () => {
        order.push('permission');
        return PermissionsAndroid.RESULTS.GRANTED;
      });

      await run(bridge);

      expect(order).toEqual(expectedOrder);
      expect(mockConfirmShow).toHaveBeenCalledWith(
        expect.objectContaining({ title, confirmText: 'Continue' }),
      );
    },
  );

  it('does not open Android permission dialogs when the disclosure is declined', async () => {
    disclosureChoice = 'Cancel';
    const bridge = new SmsInboxBridge();

    await expect(bridge.requestAutomaticImportPermissions()).resolves.toBe('cancelled');
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  });
});
