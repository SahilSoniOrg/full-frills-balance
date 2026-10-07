import { mapSmsJournalMetadataDisplay } from '../journalDetailsHelpers';
import { InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';

describe('journalDetailsHelpers', () => {
  it('mapSmsJournalMetadataDisplay parses metadata json', () => {
    const info = mapSmsJournalMetadataDisplay({
      metadataJson: JSON.stringify({ parsedAmount: 42, parsedCurrencyCode: 'USD' }),
      inboxRecord: { id: 'sms-1', inputDate: 1_700_000_000_000 },
    });
    expect(info.amount).toBe(42);
    expect(info.currencyCode).toBe('USD');
    expect(info.inboxRecordId).toBe('sms-1');
  });

  it('mapSmsJournalMetadataDisplay reads stored inbox status and direction', () => {
    const autoPostedIncome = mapSmsJournalMetadataDisplay({
      inboxRecord: {
        processingStatus: InboxProcessingStatus.AUTO_POSTED,
        direction: TransactionDirection.CREDIT,
      },
    });
    expect(autoPostedIncome.autoPosted).toBe(true);
    expect(autoPostedIncome.amountColor).toBe('income');

    const importedExpense = mapSmsJournalMetadataDisplay({
      inboxRecord: {
        processingStatus: InboxProcessingStatus.IMPORTED,
        direction: TransactionDirection.DEBIT,
      },
    });
    expect(importedExpense.autoPosted).toBe(false);
    expect(importedExpense.amountColor).toBe('expense');
  });

  it('mapSmsJournalMetadataDisplay fails closed on invalid json', () => {
    const info = mapSmsJournalMetadataDisplay({
      metadataJson: '{not-json',
      originalSmsSender: 'BANK',
    });
    expect(info.sender).toBe('BANK');
    expect(info.amount).toBeUndefined();
  });
});
