import Account, { AccountType } from '@/src/data/models/Account';
import { AccountId } from '@/src/types/domain';
import {
  collectDescendantIds,
  getAddChildCandidates,
  getParentCandidates,
  getVisibleRootAccountsByCategory,
  groupAccountsByParent,
} from '../hierarchyHelpers';

describe('hierarchyHelpers', () => {
  const makeAccount = (
    id: string,
    parentAccountId: string | null = null,
    accountType: AccountType = AccountType.ASSET,
  ) =>
    ({
      id: id as AccountId,
      name: id,
      parentAccountId: parentAccountId as AccountId,
      accountType,
    }) as unknown as Account;

  it('groups accounts and collects descendants across multiple levels', () => {
    const root = makeAccount('root');
    const child = makeAccount('child', 'root');
    const grandchild = makeAccount('grandchild', 'child');
    const groups = groupAccountsByParent([root, child, grandchild]);

    expect(groups.get(null)).toEqual([root]);
    expect(collectDescendantIds(groups, root.id)).toEqual(new Set([child.id, grandchild.id]));
  });

  it('only offers same-type, non-descendant accounts as candidates', () => {
    const selected = makeAccount('selected');
    const child = makeAccount('child', 'selected');
    const descendant = makeAccount('descendant', 'child');
    const sibling = makeAccount('sibling');
    const liability = makeAccount('liability', null, AccountType.LIABILITY);
    const accounts = [selected, child, descendant, sibling, liability];
    const descendants = new Set([child.id, descendant.id]);
    const balances = new Map([
      [selected.id, { directTransactionCount: 0 }],
      [sibling.id, { directTransactionCount: 0 }],
      [liability.id, { directTransactionCount: 0 }],
    ]);

    expect(getAddChildCandidates(accounts, selected, descendants)).toEqual([sibling]);
    expect(getParentCandidates(accounts, selected, descendants, balances)).toEqual([sibling]);
  });

  it('hides transaction-bearing empty roots while retaining roots with children', () => {
    const emptyRoot = makeAccount('empty');
    const populatedRoot = makeAccount('populated');
    const child = makeAccount('child', 'populated');
    const accounts = [emptyRoot, populatedRoot, child];
    const groups = groupAccountsByParent(accounts);
    const balances = new Map([
      [emptyRoot.id, { directTransactionCount: 2 }],
      [populatedRoot.id, { directTransactionCount: 2 }],
    ]);

    expect(getVisibleRootAccountsByCategory(accounts, groups, balances)).toMatchObject({
      ASSET: [populatedRoot],
    });
  });
});
