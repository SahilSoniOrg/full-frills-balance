import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  TransactionDirection,
  AccountType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { smsService } from '@/src/services/sms-service';
import { database } from '@/src/data/database/Database';

jest.mock('@/modules/expo-sms-inbox', () => ({
  __esModule: true,
  default: undefined,
}));

jest.mock('@/src/utils/logger');

describe('smsService.parseTransactionMessage', () => {
  it('parses INR debit messages with merchant and account source', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-1',
      address: 'HDFCBK',
      body: 'Your card XX1234 is debited by INR 1,299.50 at SWIGGY on 07-03. Ref 12345678',
      date: 1700000000000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSED);
    expect(parsed.type).toBe('debit');
    expect(parsed.amount).toBe(1299.5);
    expect(parsed.currencyCode).toBe('INR');
    expect(parsed.merchant).toBe('SWIGGY');
    expect(parsed.accountSource).toBe('Card 1234');
    expect(parsed.referenceNumber).toBe('12345678');
  });

  it('parses symbol-based foreign currency messages', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-2',
      address: 'AMEX',
      body: 'Amt $24.99 spent at NETFLIX on your card 9876',
      date: 1700000001000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSED);
    expect(parsed.amount).toBe(24.99);
    expect(parsed.currencyCode).toBe('USD');
    expect(parsed.merchant).toBe('NETFLIX');
    expect(parsed.type).toBe('debit');
  });

  it('marks transaction-like messages without amount as parse failed', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-3',
      address: 'ICICIB',
      body: 'Your account was debited at AMAZON. Balance available is 5000.',
      date: 1700000002000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.PARSE_FAILED);
    expect(parsed.parseReason).toContain('supported amount');
  });

  it('ignores personal sender messages', async () => {
    const parsed = await smsService.parseTransactionMessageAsync({
      id: 'sms-4',
      address: '+919999999999',
      body: 'Paid INR 100 to friend',
      date: 1700000003000,
    });

    expect(parsed.parseStatus).toBe(InboxParseStatus.IGNORED);
    expect(parsed.parseReason).toContain('Personal');
  });
});

describe('smsService.prepareMergeOperations', () => {
  test('handles dual-reference case (both source and category accounts are source accounts)', async () => {
    const sourceAccountIds = ['acc-1', 'acc-2'];
    const targetAccountId = 'target-acc';
    const workplaceId = 'wp-1';

    const mockRule = {
      id: 'rule-dual',
      sourceAccountId: 'acc-1',
      categoryAccountId: 'acc-2',
      actionsJson: JSON.stringify({
        disposition: 'auto_post',
        sourceAccountId: 'acc-1',
        categoryAccountId: 'acc-2',
      }),
      prepareUpdate: jest.fn().mockImplementation((fn: any) => {
        const record = {
          id: 'rule-dual',
          sourceAccountId: 'acc-1',
          categoryAccountId: 'acc-2',
          actionsJson: JSON.stringify({
            disposition: 'auto_post',
            sourceAccountId: 'acc-1',
            categoryAccountId: 'acc-2',
          }),
        };
        fn(record);
        return record;
      }),
    };

    // Mock query and fetch
    const mockQuery = {
      fetch: jest.fn().mockResolvedValue([mockRule]),
    };

    // Mock database.collections.get to return our mock rules
    const databaseSpy = jest.spyOn(database.collections, 'get').mockReturnValue({
      query: jest.fn().mockReturnValue(mockQuery),
    } as any);

    const ops = await smsService.prepareMergeOperations(
      workplaceId as any,
      sourceAccountIds as any,
      targetAccountId as any,
    );

    // Verify exactly one prepareUpdate was called
    expect(mockRule.prepareUpdate).toHaveBeenCalledTimes(1);
    expect(ops.length).toBe(1);
    expect((ops[0] as any).sourceAccountId).toBe(targetAccountId);
    expect((ops[0] as any).categoryAccountId).toBe(targetAccountId);
    expect(JSON.parse((ops[0] as any).actionsJson)).toEqual({
      disposition: 'auto_post',
      sourceAccountId: targetAccountId,
      categoryAccountId: targetAccountId,
    });

    databaseSpy.mockRestore();
  });
});

describe('smsService.getMatchingRule', () => {
  it('returns the matching rule for a parsed transaction', async () => {
    const mockRule = {
      id: 'rule-1',
      senderMatch: 'HDFCBK',
      bodyMatch: undefined,
      conditionsJson: undefined,
      actionsJson: JSON.stringify({
        disposition: 'review',
        sourceAccountId: 'hdfc-acc-id',
      }),
      priority: 100,
      sourceAccountId: 'hdfc-acc-id',
      categoryAccountId: '',
      isActive: true,
    };

    const mockQuery = {
      fetch: jest.fn().mockResolvedValue([mockRule]),
    };

    const databaseSpy = jest.spyOn(database.collections, 'get').mockReturnValue({
      query: jest.fn().mockReturnValue(mockQuery),
    } as any);

    const parsedTx = {
      id: 'sms-hdfc',
      amount: 1990,
      merchant: undefined,
      type: 'debit' as const,
      date: Date.now(),
      rawBody: 'Your card XX1990 is debited',
      address: 'HDFCBK',
      confidence: 0.9,
      parseStatus: InboxParseStatus.PARSED,
      parseReason: 'Parsed amount',
    };

    const rule = await smsService.getMatchingRule(
      'HDFCBK',
      'Your card XX1990 is debited',
      parsedTx,
      'wp-1' as any,
    );

    expect(rule).not.toBeNull();
    expect(rule?.id).toBe('rule-1');
    expect(rule?.sourceAccountId).toBe('hdfc-acc-id');

    databaseSpy.mockRestore();
  });
});

describe('smsService workplace isolation', () => {
  beforeEach(async () => {
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('limits preview, record-id, and linked-journal reads to the requested workplace', async () => {
    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    const createRecord = async (workplaceId: WorkplaceId, linkedJournalId: JournalId) =>
      database.write(async () =>
        inbox.create(record => {
          record.workplaceId = workplaceId;
          record.channel = 'sms';
          record.deviceSourceId = `${workplaceId}-sms`;
          record.senderAddress = 'BANK';
          record.rawBody = 'Coffee purchase';
          record.inputDate = Date.now();
          record.inputFingerprint = `${workplaceId}-fingerprint`;
          record.parseStatus = InboxParseStatus.PARSED;
          record.direction = TransactionDirection.DEBIT;
          record.processingStatus = InboxProcessingStatus.IMPORTED;
          record.linkedJournalId = linkedJournalId;
          record.firstSeenAt = Date.now();
          record.lastScannedAt = Date.now();
        }),
      );

    const workplaceId = 'wp-1' as WorkplaceId;
    const otherWorkplaceId = 'wp-2' as WorkplaceId;
    const sharedJournalId = 'shared-journal' as JournalId;
    const foreignRecord = await createRecord(otherWorkplaceId, sharedJournalId);
    const currentRecord = await createRecord(workplaceId, sharedJournalId);

    const preview = await smsService.previewRuleMatches(workplaceId, {
      mode: 'regex',
      senderMatch: 'BANK',
    });
    expect(preview.map(record => record.id)).toEqual([currentRecord.id]);
    expect(await smsService.getInboxRecord(workplaceId, foreignRecord.id)).toBeNull();
    expect((await smsService.findByLinkedJournalId(workplaceId, sharedJournalId))?.id).toBe(
      currentRecord.id,
    );

    await smsService.markInboxRecordStatus(
      workplaceId,
      foreignRecord.id,
      InboxProcessingStatus.DISMISSED,
    );
    await smsService.linkSmsToJournal(
      workplaceId,
      foreignRecord.id,
      'wrong-workplace-journal' as JournalId,
      InboxProcessingStatus.AUTO_POSTED,
    );

    expect(foreignRecord.processingStatus).toBe(InboxProcessingStatus.IMPORTED);
    expect(foreignRecord.linkedJournalId).toBe(sharedJournalId);
  });

  it('excludes foreign transactions linked to local journals from rule suggestions', async () => {
    const workplaceId = 'wp-1' as WorkplaceId;
    const otherWorkplaceId = 'wp-2' as WorkplaceId;
    const sourceAccount = await accountRepository.create({
      name: 'Local card',
      accountType: AccountType.LIABILITY,
      currencyCode: 'USD',
      workplaceId,
    });
    const categoryAccount = await accountRepository.create({
      name: 'Local coffee',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
      workplaceId,
    });

    const journalIds: JournalId[] = [];
    for (const journalDate of [1_000, 2_000]) {
      const journal = await journalWriteRepository.createJournalWithTransactions(
        {
          description: 'Coffee',
          journalDate,
          currencyCode: 'USD',
          transactions: [
            {
              accountId: sourceAccount.id,
              amount: 10,
              transactionType: TransactionType.CREDIT,
            },
          ],
        },
        workplaceId,
      );
      journalIds.push(journal.id);
    }

    const transactions = database.collections.get<Transaction>('transactions');
    const inbox = database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
    await database.write(async () => {
      for (const [index, journalId] of journalIds.entries()) {
        await transactions.create(transaction => {
          transaction.workplaceId = otherWorkplaceId;
          transaction.journalId = journalId;
          transaction.accountId = categoryAccount.id;
          transaction.amount = 10;
          transaction.transactionType = TransactionType.DEBIT;
          transaction.currencyCode = 'USD';
          transaction.transactionDate = (index + 1) * 1_000;
          transaction.createdAt = new Date();
          transaction.updatedAt = new Date();
        });
        await inbox.create(record => {
          record.workplaceId = workplaceId;
          record.channel = 'sms';
          record.deviceSourceId = `local-sms-${index}`;
          record.senderAddress = 'BANK';
          record.rawBody = 'Coffee purchase';
          record.inputDate = (index + 1) * 1_000;
          record.inputFingerprint = `local-fingerprint-${index}`;
          record.parseStatus = InboxParseStatus.PARSED;
          record.parsedMerchant = 'Coffee';
          record.direction = TransactionDirection.DEBIT;
          record.processingStatus = InboxProcessingStatus.IMPORTED;
          record.linkedJournalId = journalId;
          record.firstSeenAt = (index + 1) * 1_000;
          record.lastScannedAt = (index + 1) * 1_000;
        });
      }
    });

    expect(await smsService.getRuleSuggestions(workplaceId)).toEqual([]);
  });
});

describe('useTransactionInboxViewModel custom description template parsing', () => {
  it('substitutes merchant, amount, reference number, and sender correctly', () => {
    const customDescription = 'Ingested: {merchant} of value {amount} with Ref {ref} from {sender}';
    const item = {
      parsedMerchant: 'ZOMATO',
      parsedAmount: 349.5,
      referenceNumber: 'REF112233',
      senderAddress: 'ICICIBK',
    };

    const resolved = customDescription
      .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
      .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
      .replace(/{ref}/gi, item.referenceNumber || '')
      .replace(/{sender}/gi, item.senderAddress || '');

    expect(resolved).toBe('Ingested: ZOMATO of value 349.5 with Ref REF112233 from ICICIBK');
  });

  it('handles empty properties gracefully by using fallbacks', () => {
    const customDescription = 'Transaction at {merchant} with Ref {ref}';
    const item = {
      parsedMerchant: undefined,
      parsedAmount: undefined,
      referenceNumber: undefined,
      senderAddress: 'HDFCBK',
    };

    const resolved = customDescription
      .replace(/{merchant}/gi, item.parsedMerchant || 'Unknown Merchant')
      .replace(/{amount}/gi, item.parsedAmount != null ? String(item.parsedAmount) : '0.00')
      .replace(/{ref}/gi, item.referenceNumber || '')
      .replace(/{sender}/gi, item.senderAddress || '');

    expect(resolved).toBe('Transaction at Unknown Merchant with Ref ');
  });
});
