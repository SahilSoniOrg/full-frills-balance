import { database } from '@/src/data/database/Database';
import { ledgerWriteService } from '@/src/services/ledger';
import ExpoSmsInbox from '@/modules/expo-sms-inbox';
import { smsService } from '@/src/services/sms-service';

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

jest.mock('@/src/services/analytics-service');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/services/WorkplaceService', () => ({
  workplaceService: {
    getCurrency: jest.fn().mockResolvedValue('INR'),
  },
}));
jest.mock('@/src/data/repositories/JournalRepository', () => ({
  journalRepository: {
    getRuleDefinition: jest.fn(),
    findJournalsByOriginalSmsIds: jest.fn().mockResolvedValue(new Map()),
    findJournalsBySmsFingerprints: jest.fn().mockResolvedValue(new Map()),
    findNearbyJournals: jest.fn().mockResolvedValue([]),
    findMatchingDuplicateInJournals: jest.fn().mockReturnValue(null),
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
});
