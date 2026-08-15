import { getBulkHierarchyCandidates } from '../bulkHierarchyCandidates';
import { AccountId, AccountType } from '@/src/types/domain';

const account = (id: string, accountType: AccountType, parentAccountId: string | null = null) => ({
  id: id as AccountId,
  name: id,
  accountType,
  parentAccountId: parentAccountId as AccountId | null,
});

describe('getBulkHierarchyCandidates', () => {
  it('only returns parents valid for every selected account type', () => {
    const accounts = [
      account('asset-selected', AccountType.ASSET),
      account('income-selected', AccountType.INCOME),
      account('asset-parent', AccountType.ASSET),
      account('income-parent', AccountType.INCOME),
    ];

    expect(
      getBulkHierarchyCandidates(
        accounts,
        new Set(['asset-selected', 'income-selected'] as AccountId[]),
      ),
    ).toEqual([]);
  });

  it('excludes selected accounts and their descendants', () => {
    const accounts = [
      account('parent', AccountType.ASSET),
      account('selected', AccountType.ASSET, 'parent'),
      account('descendant', AccountType.ASSET, 'selected'),
      account('valid', AccountType.ASSET),
    ];

    expect(
      getBulkHierarchyCandidates(accounts, new Set(['selected'] as AccountId[])).map(a => a.id),
    ).toEqual(['parent', 'valid']);
  });
});
