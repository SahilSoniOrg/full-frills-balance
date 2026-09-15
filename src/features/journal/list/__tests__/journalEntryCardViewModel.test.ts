import { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { mapTimelineItemToEntryCardProps } from '@/src/features/journal/list/journalEntryCardViewModel';
import { mapJournalToTimelineItem } from '@/src/services/journal/journalTimelinePresentation';

describe('journalEntryCardViewModel', () => {
  it('preserves journal title and badge presentation', () => {
    const card = mapTimelineItemToEntryCardProps(
      mapJournalToTimelineItem({
        id: 'j1' as JournalId,
        journalDate: Date.now(),
        description: 'Lunch',
        currencyCode: 'USD',
        status: 'POSTED',
        totalAmount: 25,
        transactionCount: 2,
        displayType: JournalDisplayType.EXPENSE,
        accounts: [
          {
            id: 'a1' as AccountId,
            name: 'Checking',
            accountType: AccountType.ASSET,
            role: 'SOURCE',
          },
        ],
        semanticType: SemanticType.PURCHASE,
        semanticLabel: 'Purchase',
      }),
    );

    expect(card.title).toBe('Lunch');
    expect(card.badges?.map(badge => badge.text)).toEqual(['From: Checking']);
  });
});
