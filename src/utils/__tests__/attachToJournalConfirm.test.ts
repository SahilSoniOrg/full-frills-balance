import { buildAttachToJournalConfirmMessage } from '../attachToJournalConfirm';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import type { PlainInboxRecord } from '@/src/types/plainDtos';
import { JournalId } from '@/src/types/ids';

describe('buildAttachToJournalConfirmMessage', () => {
  it('includes inbox merchant, amount, body, and journal target', () => {
    const inbox: PlainInboxRecord = {
      id: 'inbox-1',
      channel: 'sms',
      deviceSourceId: 'sms-1',
      senderAddress: 'HDFCBK',
      rawBody: 'USD 420.00 debited for CAFE.',
      inputDate: Date.UTC(2026, 10, 11, 16, 0, 0),
      parseStatus: 'parsed',
      parsedAmount: 420,
      parsedCurrencyCode: 'USD',
      parsedMerchant: 'CAFE',
      direction: 'debit',
      processingStatus: 'pending',
    };
    const journal = {
      id: 'j-1' as JournalId,
      description: 'Manual Cafe',
      journalDate: Date.UTC(2026, 10, 11, 14, 0, 0),
      totalAmount: 420,
      currencyCode: 'USD',
    } as EnrichedJournal;

    const message = buildAttachToJournalConfirmMessage({
      inbox,
      journal,
      journalLabel: 'Manual Cafe',
      hourCycle: '12-hour',
    });

    expect(message).toContain('Inbox item');
    expect(message).toContain('Merchant: CAFE');
    expect(message).toContain('Sender: HDFCBK');
    expect(message).toContain('Message: USD 420.00 debited for CAFE.');
    expect(message).toContain('Attach to');
    expect(message).toContain('Manual Cafe');
    expect(message).toContain('will not create a new entry');
  });
});
