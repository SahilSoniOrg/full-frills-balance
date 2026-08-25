import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { PlainInboxRecord } from '@/src/types/plainDtos';
import { enrichTransactionInboxRecords } from '../transactionInboxMapping';

jest.mock('@/src/data/repositories/journal/journalTimelineModule', () => ({
  journalQueryRepository: {
    findByIds: jest.fn(),
  },
}));

describe('enrichTransactionInboxRecords', () => {
  it('carries canonical linked-journal preview fields instead of SMS values', async () => {
    const linkedJournalId = 'journal-1' as any;
    (journalQueryRepository.findByIds as jest.Mock).mockResolvedValue([
      {
        id: linkedJournalId,
        description: 'Actual journal description',
        journalDate: 1_700_000_000_000,
        status: JournalStatus.POSTED,
        totalAmount: 999,
        currencyCode: 'USD',
        displayType: JournalDisplayType.TRANSFER,
      },
    ]);

    const record = {
      id: 'inbox-1',
      channel: 'sms',
      deviceSourceId: 'sms-1',
      inputDate: 1_700_000_001_000,
      parseStatus: 'parsed',
      processingStatus: 'imported',
      parsedAmount: 12,
      parsedCurrencyCode: 'INR',
      direction: 'debit',
      linkedJournalId,
    } as PlainInboxRecord;

    const [item] = await enrichTransactionInboxRecords('workplace-1' as any, [record]);

    expect(item.linkedJournal).toMatchObject({
      journalId: linkedJournalId,
      totalAmount: 999,
      currencyCode: 'USD',
      displayType: JournalDisplayType.TRANSFER,
    });
  });
});
