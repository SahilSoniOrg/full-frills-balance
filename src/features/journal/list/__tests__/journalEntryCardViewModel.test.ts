import { AccountType, JournalDisplayType, SemanticType } from '@/src/types/enums';
import { AccountId, JournalId } from '@/src/types/ids';
import { mapTimelineItemToEntryCardProps } from '@/src/features/journal/list/journalEntryCardViewModel';
import { mapJournalToTimelineItem } from '@/src/services/journal/journalTimelinePresentation';

describe('journalEntryCardViewModel', () => {
  it('preserves journal title and account presentation', () => {
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
    expect(card.accountFlow.primaryAccount?.name).toBe('Checking');
  });
});

it('passes every structured leg through and normalizes invalid stored icons', () => {
  const card = mapTimelineItemToEntryCardProps(
    mapJournalToTimelineItem({
      id: 'j1' as JournalId,
      journalDate: Date.now(),
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 100,
      transactionCount: 4,
      displayType: JournalDisplayType.EXPENSE,
      accounts: [
        {
          id: 'bank' as AccountId,
          name: 'Bank',
          accountType: AccountType.ASSET,
          role: 'SOURCE',
          amount: 100,
          currencyCode: 'USD',
          icon: 'invalid-stored-icon',
          color: '#CDAA6B',
        },
        ...['Food', 'Travel', 'Fees'].map((name, index) => ({
          id: name as AccountId,
          name,
          accountType: AccountType.EXPENSE,
          role: 'DESTINATION' as const,
          amount: 10 + index,
          currencyCode: 'USD',
          color: '#65C6AD',
        })),
      ],
    }),
  );
  expect(card.accountFlow?.primaryAccount?.icon).toBeUndefined();
  expect(card.accountFlow?.primaryAccount?.fallbackIcon).toBeDefined();
  expect(card.accountFlow?.primaryAccount?.color).toBe('#CDAA6B');
  expect(card.accountFlow?.destinations.every(leg => leg.color === '#65C6AD')).toBe(true);
  expect(card.accountFlow?.destinations.map(leg => leg.name)).toEqual(['Fees', 'Travel', 'Food']);
  expect(card.accountFlow?.destinations.map(leg => leg.amount)).toEqual([12, 11, 10]);
});
