import ExpoSmsInbox from '@/modules/expo-sms-inbox';
import { smsService } from '../sms-service';
import { smsSyncPipeline } from '../sms/pipeline';
import { WorkplaceId } from '@/src/types/ids';
import { Platform, PermissionsAndroid } from 'react-native';

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: { getSmsInbox: jest.fn(), getSmsInboxBefore: jest.fn() },
}));
jest.mock('@/src/services/sms/pipeline', () => ({
  smsSyncPipeline: { scanMessages: jest.fn().mockResolvedValue(0) },
}));
jest.mock('@/src/services/sms/SmsPrivacyService', () => ({
  smsPrivacyService: { cleanupLegacyContent: jest.fn().mockResolvedValue(undefined) },
}));

it('scans past 500 with a fixed page size and handles equal timestamps using provider IDs', async () => {
  const previousOs = Platform.OS;
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  const permission = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  const messages = Array.from({ length: 600 }, (_, index) => ({
    id: String(600 - index),
    date: Math.floor((600 - index) / 2),
    address: 'BANK',
    body: 'fixture',
  }));
  jest
    .mocked(ExpoSmsInbox!.getSmsInbox)
    .mockImplementation(async limit => messages.slice(0, limit));
  jest
    .mocked(ExpoSmsInbox!.getSmsInboxBefore)
    .mockImplementation(async (date, id, limit) =>
      messages
        .filter(
          message =>
            message.date < date || (message.date === date && Number(message.id) < Number(id)),
        )
        .slice(0, limit),
    );
  try {
    const first = await smsService.scanRecentSmsPage('workplace' as WorkplaceId, 500);
    const second = await smsService.scanOlderSmsPage(first.cursor, 'workplace' as WorkplaceId, 25);
    expect(first.cursor).toEqual({ date: 50, id: '101' });
    expect(ExpoSmsInbox!.getSmsInboxBefore).toHaveBeenCalledWith(50, '101', 25);
    expect(jest.mocked(smsSyncPipeline.scanMessages).mock.calls[1][1][0].id).toBe('100');
    expect(second.cursor?.id).toBe('76');
    expect(
      jest.mocked(smsSyncPipeline.scanMessages).mock.calls.flatMap(call => call[1]),
    ).toHaveLength(525);
  } finally {
    permission.mockRestore();
    Object.defineProperty(Platform, 'OS', { value: previousOs, configurable: true });
  }
});
