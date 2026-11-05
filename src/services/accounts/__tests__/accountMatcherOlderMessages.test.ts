import { AppConfig } from '@/src/constants';
import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { asWorkplaceId } from '@/src/types/ids';
import {
  readLatestAccountMatcherMessages,
  readOlderAccountMatcherMessages,
} from '../accountMatcherOlderMessages';

jest.mock('@/src/services/sms/SmsInboxBridge', () => ({
  smsInboxBridge: {
    getLatestMessages: jest.fn(),
    getOlderMessages: jest.fn(),
    setAutomaticImportEnabled: jest.fn(),
  },
}));

describe('read-only account matcher device messages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the latest device page through the disclosed bridge and returns a date/id cursor', async () => {
    jest.mocked(smsInboxBridge.getLatestMessages).mockResolvedValue([
      { id: '12', address: 'BANKXYZ', body: 'Recent', date: 300 },
      { id: '9', address: 'BANKXYZ', body: 'Older tie', date: 100 },
      { id: '10', address: 'BANKXYZ', body: 'Newer tie', date: 100 },
    ]);

    const page = await readLatestAccountMatcherMessages(asWorkplaceId('workplace-1'));

    expect(smsInboxBridge.getLatestMessages).toHaveBeenCalledWith(
      AppConfig.pagination.smsImportScanLimit,
      true,
    );
    expect(page.messages.map(message => message.rawBody)).toEqual([
      'Recent',
      'Newer tie',
      'Older tie',
    ]);
    expect(page.messages[0]).toEqual(
      expect.objectContaining({
        id: 'android-sms:12',
        deviceSourceId: '12',
        processingStatus: 'pending',
        linkedAccountIds: [],
        linkedAccountNames: [],
      }),
    );
    expect(page.nextCursor).toEqual({ date: 100, id: '9' });
    expect(page.hasMore).toBe(false);
  });

  it('continues older pages using the date/id cursor without enabling listening', async () => {
    const cursor = { date: 100, id: '9' };
    jest
      .mocked(smsInboxBridge.getOlderMessages)
      .mockResolvedValue([{ id: '8', address: 'BANKXYZ', body: 'Earlier', date: 90 }]);

    const page = await readOlderAccountMatcherMessages(asWorkplaceId('workplace-1'), cursor);

    expect(smsInboxBridge.getOlderMessages).toHaveBeenCalledWith(
      cursor,
      AppConfig.pagination.smsImportScanLimit,
    );
    expect(page.messages[0].rawBody).toBe('Earlier');
    expect(page.nextCursor).toEqual({ date: 90, id: '8' });
    expect(smsInboxBridge.setAutomaticImportEnabled).not.toHaveBeenCalled();
  });
});
