import { database } from '@/src/data/database/Database';
import { ledgerWriteService } from '@/src/services/ledger';
import ExpoSmsInbox from '@/modules/expo-sms-inbox';
import { smsService } from '@/src/services/sms-service';
import { InboxProcessingStatus } from '@/src/types/domain';

jest.mock('react-native/Libraries/Utilities/Platform', () => ({
  __esModule: true,
  default: {
    OS: 'android',
    Version: '30',
    select: jest.fn(obj => obj.android || obj.default),
    constants: {
      getConstants: () => ({
        isTesting: true,
        osVersion: '30',
        systemName: 'Android',
      }),
    },
    isPad: false,
    isTVOS: false,
  },
}));

jest.mock('react-native/Libraries/PermissionsAndroid/PermissionsAndroid', () => ({
  __esModule: true,
  default: {
    check: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue('granted'),
    RESULTS: {
      GRANTED: 'granted',
    },
    PERMISSIONS: {
      READ_SMS: 'android.permission.READ_SMS',
    },
  },
}));

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: {
    getSmsInbox: jest.fn(),
  },
}));

jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(fn => fn()),
    batch: jest.fn(),
    collections: {
      get: jest.fn(),
    },
  },
}));

jest.mock('@/src/services/ledger', () => ({
  ledgerWriteService: {
    prepareCreateJournalFromPreparedData: jest.fn(),
  },
}));
jest.mock('@/src/services/ledger/prepareJournalData', () => ({
  prepareJournalData: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/src/data/repositories/account', () => ({
  ...jest.requireActual('@/src/data/repositories/account'),
  accountQueryRepository: {
    find: jest.fn().mockImplementation(async (_workplaceId: string, id: string) => ({
      id,
      name: `Account ${id}`,
    })),
  },
}));

jest.mock('@/src/services/analytics');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn().mockResolvedValue('INR'),
  },
}));
// SmsSyncPipeline reads journal lookups from the SMS-dedup intent module, not via
// the JournalRepository facade.
jest.mock('@/src/data/repositories/journal/SmsJournalQueries', () => ({
  smsJournalQueries: {
    findJournalByOriginalSmsId: jest.fn().mockResolvedValue(null),
    findJournalsByOriginalSmsIds: jest.fn().mockResolvedValue(new Map()),
    findJournalBySmsFingerprint: jest.fn().mockResolvedValue(null),
    findJournalsBySmsFingerprints: jest.fn().mockResolvedValue(new Map()),
    findJournalsByReferenceNumbers: jest.fn().mockResolvedValue(new Map()),
    findNearbyJournals: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/utils/logger');

describe('SmsService Batching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ExpoSmsInbox!.getSmsInbox as jest.Mock).mockResolvedValue([]);
  });

  it('collects all operations and calls batch exactly once per chunk within a single write', async () => {
    const workplaceId = 'wp-1' as any;

    // Mock messages
    const messages = [
      { id: '1', address: 'BANK', body: 'Spent 100', date: Date.now() },
      { id: '2', address: 'BANK', body: 'Spent 200', date: Date.now() },
    ];
    (ExpoSmsInbox!.getSmsInbox as jest.Mock).mockResolvedValue(messages);

    // Mock collections
    const mockInboxCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      }),
      prepareCreate: jest.fn(fn => {
        const obj = { workplaceId: '', deviceSmsId: '' };
        fn(obj);
        return obj;
      }),
    };
    const mockRulesCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      }),
    };

    (database.collections.get as jest.Mock).mockImplementation(name => {
      if (name === 'transaction_inbox_records') return mockInboxCollection;
      if (name === 'transaction_auto_post_rules') return mockRulesCollection;
      return null;
    });

    await smsService.processUnprocessedSms(workplaceId);

    // Verify database.write was called once
    expect(database.write).toHaveBeenCalledTimes(1);

    // Verify database.batch was called
    expect(database.batch).toHaveBeenCalled();

    // Check that batch was called with collected ops
    const batchArgs = (database.batch as jest.Mock).mock.calls;
    const totalBatchedOps = batchArgs.reduce((acc, call) => acc + call[0].length, 0);

    // We have 2 messages, each should create 1 SmsInboxRecord
    expect(totalBatchedOps).toBe(2);
    expect(mockInboxCollection.prepareCreate).toHaveBeenCalledTimes(2);
  });

  it('includes ledger operations in the same batch when auto-post is triggered', async () => {
    const workplaceId = 'wp-1' as any;

    const messages = [{ id: '1', address: 'BANK', body: 'Spent 100', date: Date.now() }];
    (ExpoSmsInbox!.getSmsInbox as jest.Mock).mockResolvedValue(messages);

    const mockInboxCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([]),
      }),
      prepareCreate: jest.fn(fn => {
        const obj = { id: 'new-inbox-record', workplaceId: '', deviceSmsId: '1' };
        fn(obj);
        return obj;
      }),
    };

    // Mock a rule that matches
    const mockRulesCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            senderMatch: 'BANK',
            isActive: true,
            sourceAccountId: 'acc-1',
            categoryAccountId: 'cat-1',
            prepareUpdate: jest.fn(),
          },
        ]),
      }),
    };

    (database.collections.get as jest.Mock).mockImplementation(name => {
      if (name === 'transaction_inbox_records') return mockInboxCollection;
      if (name === 'transaction_auto_post_rules') return mockRulesCollection;
      return null;
    });

    // Mock ledgerWriteService to return some ops
    (ledgerWriteService.prepareCreateJournalFromPreparedData as jest.Mock).mockReturnValue({
      journal: { id: 'journal-1' },
      ops: [{ id: 'op-1' }, { id: 'op-2' }],
      accountsToRebuild: new Set(['acc-1']),
    });

    // Remove the incorrect mock for journalRepository.getRuleDefinition
    // since it's a private method of SmsService, not JournalRepository.

    await smsService.processUnprocessedSms(workplaceId);

    // Verify database.batch was called
    expect(database.batch).toHaveBeenCalled();
    const batchArgs = (database.batch as jest.Mock).mock.calls;
    const totalBatchedOps = batchArgs.reduce((acc, call) => acc + call[0].length, 0);

    // Should be at least 3 ops (1 inbox record + 2 ledger ops)
    expect(totalBatchedOps).toBeGreaterThanOrEqual(3);
  });

  it('rechecks the scoped inbox state inside the final write before auto-posting', async () => {
    const workplaceId = 'wp-1' as any;
    const messages = [{ id: '1', address: 'BANK', body: 'Spent 100', date: Date.now() }];
    (ExpoSmsInbox!.getSmsInbox as jest.Mock).mockResolvedValue(messages);

    type MockInboxRecord = {
      id: string;
      workplaceId: string;
      deviceSourceId: string;
      processingStatus: InboxProcessingStatus;
      linkedJournalId: string;
      firstSeenAt: number;
      metadataJson: string;
      prepareUpdate: jest.Mock<MockInboxRecord, [(record: MockInboxRecord) => void]>;
    };
    const existingRecord: MockInboxRecord = {
      id: 'existing-inbox-record',
      workplaceId,
      deviceSourceId: '1',
      processingStatus: InboxProcessingStatus.AUTO_POSTED,
      linkedJournalId: 'journal-already-created',
      firstSeenAt: Date.now() - 1_000,
      metadataJson: '{}',
      prepareUpdate: jest.fn((fn: (record: MockInboxRecord) => void): MockInboxRecord => {
        fn(existingRecord);
        return existingRecord;
      }),
    };
    const initialFetch = jest.fn().mockResolvedValue([]);
    const finalFetch = jest.fn().mockResolvedValue([existingRecord]);
    const mockInboxCollection = {
      query: jest
        .fn()
        .mockReturnValueOnce({ fetch: initialFetch })
        .mockReturnValueOnce({ fetch: finalFetch }),
      prepareCreate: jest.fn(),
    };
    const mockRulesCollection = {
      query: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue([
          {
            id: 'rule-1',
            senderMatch: 'BANK',
            isActive: true,
            sourceAccountId: 'acc-1',
            categoryAccountId: 'cat-1',
            prepareUpdate: jest.fn(),
          },
        ]),
      }),
    };

    (database.collections.get as jest.Mock).mockImplementation(name => {
      if (name === 'transaction_inbox_records') return mockInboxCollection;
      if (name === 'transaction_auto_post_rules') return mockRulesCollection;
      return null;
    });

    await smsService.processUnprocessedSms(workplaceId);

    expect(database.write).toHaveBeenCalledTimes(1);
    expect(finalFetch).toHaveBeenCalledTimes(1);
    expect(ledgerWriteService.prepareCreateJournalFromPreparedData).not.toHaveBeenCalled();
    expect(mockInboxCollection.prepareCreate).not.toHaveBeenCalled();
    expect(existingRecord.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(existingRecord.processingStatus).toBe(InboxProcessingStatus.AUTO_POSTED);
    expect(existingRecord.linkedJournalId).toBe('journal-already-created');
  });
});
