import { automaticSmsImportService } from '@/src/services/sms/AutomaticSmsImportService';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { notificationService } from '@/src/services/notification/NotificationService';

jest.mock('@/src/services/sms/SmsReviewNotificationService', () => ({
  smsReviewNotificationService: { flush: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/src/services/sms/SmsInboxBridge', () => ({
  smsInboxBridge: {
    hasAutomaticImportPermissions: jest.fn().mockResolvedValue(true),
    getLatestSmsId: jest.fn(),
    getMessagesAfterId: jest.fn(),
    setAutomaticImportEnabled: jest.fn().mockResolvedValue(undefined),
    requestAutomaticImportPermissions: jest.fn().mockResolvedValue('granted'),
  },
}));

jest.mock('@/src/services/sms/pipeline/smsSyncPipeline', () => ({
  smsSyncPipeline: {
    scanInbox: jest.fn().mockResolvedValue(0),
    scanMessages: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn().mockResolvedValue(undefined),
    getSnapshot: jest.fn().mockReturnValue({}),
    device: {
      getSnapshot: jest.fn().mockReturnValue({ areSmsReviewNotificationsEnabled: true }),
      isAutomaticSmsImportEnabled: true,
      activeWorkplaceId: 'workplace-1',
      setAutomaticSmsImportEnabled: jest.fn(),
    },
  },
}));

jest.mock('@/src/utils/storage', () => ({
  storage: {
    getString: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@/src/services/notification/NotificationService', () => ({
  notificationService: {
    requestPermissions: jest.fn().mockResolvedValue(false),
  },
}));

const bridge = smsInboxBridge as jest.Mocked<typeof smsInboxBridge>;
const pipeline = smsSyncPipeline as jest.Mocked<typeof smsSyncPipeline>;
const mockedPreferences = preferences as jest.Mocked<typeof preferences>;
const mockedStorage = storage as jest.Mocked<typeof storage>;
const mockedNotificationService = notificationService as jest.Mocked<typeof notificationService>;
const mutableDevicePreferences = mockedPreferences.device as unknown as {
  isAutomaticSmsImportEnabled: boolean;
  activeWorkplaceId: string;
};

describe('AutomaticSmsImportService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedPreferences.loadPreferences.mockResolvedValue(preferences.getSnapshot());
    jest.mocked(smsReviewNotificationService.flush).mockResolvedValue(undefined);
    jest.mocked(preferences.device.getSnapshot).mockReturnValue({
      ...preferences.device.getSnapshot(),
      areSmsReviewNotificationsEnabled: true,
    });
    mutableDevicePreferences.isAutomaticSmsImportEnabled = true;
    mutableDevicePreferences.activeWorkplaceId = 'workplace-1';
    mockedStorage.getString.mockReturnValue(undefined);
    bridge.hasAutomaticImportPermissions.mockResolvedValue(true);
    bridge.getLatestSmsId.mockResolvedValue('100');
    bridge.getMessagesAfterId.mockResolvedValue([]);
    bridge.setAutomaticImportEnabled.mockResolvedValue(undefined);
    bridge.requestAutomaticImportPermissions.mockResolvedValue('granted');
    pipeline.scanInbox.mockResolvedValue(0);
    pipeline.scanMessages.mockResolvedValue(0);
    mockedNotificationService.requestPermissions.mockResolvedValue(false);
  });

  it('does a bounded initial import, then stores the provider high-water mark', async () => {
    await automaticSmsImportService.processPending();

    expect(pipeline.scanInbox).toHaveBeenCalledWith('workplace-1', 50, undefined, {
      origin: 'initial',
      promptForPermission: false,
    });
    expect(mockedStorage.set).toHaveBeenCalledWith('automatic_sms_import_last_provider_id', '100');
  });

  it('catches up every page after the last committed provider ID', async () => {
    mockedStorage.getString.mockReturnValue('100');
    bridge.getMessagesAfterId
      .mockResolvedValueOnce([
        { id: '101', address: 'BK', body: 'debit 5', date: 1 },
        { id: '102', address: 'BK', body: 'debit 6', date: 2 },
      ])
      .mockResolvedValueOnce([]);

    await automaticSmsImportService.processPending();

    expect(pipeline.scanMessages).toHaveBeenCalledWith(
      'workplace-1',
      expect.arrayContaining([
        expect.objectContaining({ id: '101' }),
        expect.objectContaining({ id: '102' }),
      ]),
      undefined,
      { origin: 'catch_up' },
    );
    expect(bridge.getMessagesAfterId).toHaveBeenNthCalledWith(1, '100', 50);
    expect(bridge.getMessagesAfterId).toHaveBeenNthCalledWith(2, '102', 50);
    expect(mockedStorage.set).toHaveBeenLastCalledWith(
      'automatic_sms_import_last_provider_id',
      '102',
    );
  });

  it('does not advance the cursor if the database batch fails', async () => {
    mockedStorage.getString.mockReturnValue('100');
    bridge.getMessagesAfterId
      .mockResolvedValueOnce([{ id: '101', address: 'BK', body: 'debit 5', date: 1 }])
      .mockResolvedValueOnce([{ id: '101', address: 'BK', body: 'debit 5', date: 1 }])
      .mockResolvedValueOnce([]);
    pipeline.scanMessages.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(automaticSmsImportService.processPending()).rejects.toThrow(
      'database unavailable',
    );
    expect(mockedStorage.set).not.toHaveBeenCalled();
  });

  it('does not reuse the legacy import flag as automatic background consent', async () => {
    mutableDevicePreferences.isAutomaticSmsImportEnabled = false;

    await automaticSmsImportService.synchronizeOnAppStart();

    expect(bridge.requestAutomaticImportPermissions).not.toHaveBeenCalled();
    expect(bridge.setAutomaticImportEnabled).toHaveBeenCalledWith(false);
    expect(pipeline.scanInbox).not.toHaveBeenCalled();
  });

  it('does not request notification permission during app startup sync', async () => {
    await automaticSmsImportService.synchronizeOnAppStart();

    expect(mockedNotificationService.requestPermissions).not.toHaveBeenCalled();
    expect(mutableDevicePreferences.isAutomaticSmsImportEnabled).toBe(true);
    expect(bridge.setAutomaticImportEnabled).toHaveBeenCalledWith(true);
  });

  it('retries a failed headless batch and advances the cursor after success', async () => {
    mockedStorage.getString.mockReturnValue('100');
    bridge.getMessagesAfterId
      .mockResolvedValueOnce([{ id: '101', address: 'BK', body: 'debit 5', date: 1 }])
      .mockResolvedValueOnce([{ id: '101', address: 'BK', body: 'debit 5', date: 1 }])
      .mockResolvedValueOnce([]);
    pipeline.scanMessages
      .mockRejectedValueOnce(new Error('temporary database failure'))
      .mockResolvedValueOnce(1);

    await expect(automaticSmsImportService.processHeadlessArrival(false)).resolves.toBeUndefined();

    expect(bridge.getMessagesAfterId).toHaveBeenCalledTimes(3);
    expect(pipeline.scanMessages).toHaveBeenCalledTimes(2);
    expect(mockedStorage.set).toHaveBeenCalledWith('automatic_sms_import_last_provider_id', '101');
  });
});
