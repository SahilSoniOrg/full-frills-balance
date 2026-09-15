import { AccountType } from '@/src/types/enums';
import { AccountId } from '@/src/types/ids';

import { counterAccountsFromJournalPeers } from '@/src/services/accounting/displayTransactionCounterAccounts';

describe('displayTransactionCounterAccounts', () => {
  const assetId = 'asset-a' as AccountId;
  const foodId = 'food-a' as AccountId;
  const travelId = 'travel-a' as AccountId;

  const accounts = [
    { id: assetId, name: 'Bank', accountType: AccountType.ASSET, role: 'SOURCE' as const },
    { id: foodId, name: 'Food', accountType: AccountType.EXPENSE, role: 'DESTINATION' as const },
    {
      id: travelId,
      name: 'Travel',
      accountType: AccountType.EXPENSE,
      role: 'DESTINATION' as const,
    },
  ];

  it('counterAccountsFromJournalPeers excludes the current account', () => {
    const peers = counterAccountsFromJournalPeers(accounts, assetId);
    expect(peers.map(p => p.name)).toEqual(['Food', 'Travel']);
  });

  it('counterAccountsFromJournalPeers dedupes duplicate account ids', () => {
    const peers = counterAccountsFromJournalPeers(
      [accounts[0], accounts[1], { ...accounts[1], role: 'NEUTRAL' as const }],
      assetId,
    );
    expect(peers).toHaveLength(1);
    expect(peers[0].name).toBe('Food');
  });
});
