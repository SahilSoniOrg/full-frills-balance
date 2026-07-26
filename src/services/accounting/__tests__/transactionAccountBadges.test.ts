import { buildTimelineAccountBadges } from '@/src/services/accounting/timelineAccountBadges';

describe('buildTimelineAccountBadges', () => {
  it('shows two accounts and overflow chip when more than two counterparts', () => {
    const badges = buildTimelineAccountBadges([
      { id: 'a1', name: 'Bank', accountType: 'ASSET' },
      { id: 'a2', name: 'Food', accountType: 'EXPENSE' },
      { id: 'a3', name: 'Travel', accountType: 'EXPENSE' },
    ]);

    expect(badges).toHaveLength(3);
    expect(badges[0].text).toBe('Bank');
    expect(badges[1].text).toBe('Food');
    expect(badges[2].text).toBe('+1 more');
    expect(badges[2].variant).toBe('default');
  });

  it('adds from/to prefixes in journal context', () => {
    const badges = buildTimelineAccountBadges(
      [
        { id: 'a1', name: 'Cash', accountType: 'ASSET', role: 'SOURCE' },
        { id: 'a2', name: 'Groceries', accountType: 'EXPENSE', role: 'DESTINATION' },
      ],
      { withFromToPrefixes: true },
    );

    expect(badges[0].text).toBe('From: Cash');
    expect(badges[1].text).toBe('To: Groceries');
  });
});
