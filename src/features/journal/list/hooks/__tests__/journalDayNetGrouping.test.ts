import { getJournalViewerSignedAmount } from '@/src/features/journal/list/hooks/journalDayNetGrouping';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { AccountType, JournalDisplayType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';

describe('getJournalViewerSignedAmount', () => {
  it('converts a scoped native line using its own currency', () => {
    const journal: EnrichedJournal = {
      id: 'j1' as JournalId,
      journalDate: 1,
      currencyCode: 'INR',
      status: 'POSTED',
      totalAmount: 800,
      transactionCount: 2,
      displayType: JournalDisplayType.TRANSFER,
      accounts: [
        {
          id: 'dollar-account' as AccountId,
          name: 'Dollar account',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
          amount: 10,
          currencyCode: 'USD',
        },
      ],
    };

    expect(
      getJournalViewerSignedAmount(journal, { accountId: 'dollar-account' as AccountId }, 'INR', {
        USD: 0.0125,
      }),
    ).toBe(-800);
  });
});
