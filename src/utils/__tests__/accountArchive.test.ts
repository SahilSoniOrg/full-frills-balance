import { AccountId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import {
  buildArchiveCascadeNodes,
  defaultCascadeSelection,
  filterAccountsForDisplay,
  getVisibleRoots,
  hasArchivedAccountsInList,
  isAccountArchived,
  pinnedArchivedAccountIds,
} from '@/src/utils/accountArchive';
import { isSystemAccount } from '@/src/services/accounts/accountSystemAccounts';

describe('accountArchive', () => {
  const accounts = [
    {
      id: 'parent' as AccountId,
      name: 'Parent',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: undefined,
    },
    {
      id: 'child' as AccountId,
      name: 'Child',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: 'parent' as AccountId,
      archivedAt: Date.now(),
    },
    {
      id: 'other' as AccountId,
      name: 'Other',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
      parentAccountId: undefined,
    },
  ];

  it('detects archived accounts', () => {
    expect(isAccountArchived({ archivedAt: Date.now() })).toBe(true);
    expect(isAccountArchived({ archivedAt: null })).toBe(false);
  });

  it('detects whether a list has archived accounts', () => {
    expect(hasArchivedAccountsInList(accounts)).toBe(true);
    expect(hasArchivedAccountsInList(accounts.filter(account => account.id !== 'child'))).toBe(
      false,
    );
  });

  it('filters archived accounts unless pinned', () => {
    const hidden = filterAccountsForDisplay(accounts, false).map(a => a.id);
    expect(hidden).toEqual(['parent', 'other']);

    const pinned = filterAccountsForDisplay(accounts, false, new Set(['child' as AccountId])).map(
      a => a.id,
    );
    expect(pinned).toEqual(['parent', 'child', 'other']);
  });

  it('pins only archived selected accounts', () => {
    expect(
      [...pinnedArchivedAccountIds(['child', 'other'] as AccountId[], accounts)].sort(),
    ).toEqual(['child']);
  });

  it('builds cascade nodes in hierarchy order', () => {
    const nodes = buildArchiveCascadeNodes('parent' as AccountId, accounts);
    expect(nodes.map(node => node.account.id)).toEqual(['parent', 'child']);
    expect(nodes[1].depth).toBe(1);
  });

  it('does not recurse infinitely when parent links form a cycle', () => {
    const cyclic = [
      {
        id: 'a' as AccountId,
        name: 'A',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: 'c' as AccountId,
      },
      {
        id: 'b' as AccountId,
        name: 'B',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: 'a' as AccountId,
      },
      {
        id: 'c' as AccountId,
        name: 'C',
        accountType: AccountType.ASSET,
        currencyCode: 'USD',
        parentAccountId: 'b' as AccountId,
      },
    ];

    const nodes = buildArchiveCascadeNodes('a' as AccountId, cyclic);
    expect(nodes.map(node => node.account.id)).toEqual(['a', 'b', 'c']);
  });

  it('preselects accounts that will change archive state', () => {
    const nodes = buildArchiveCascadeNodes('parent' as AccountId, accounts);
    expect(defaultCascadeSelection(nodes, true).has('parent' as AccountId)).toBe(true);
    expect(defaultCascadeSelection(nodes, true).has('child' as AccountId)).toBe(false);
    expect(defaultCascadeSelection(nodes, false).has('child' as AccountId)).toBe(true);
  });

  it('detects system accounts by generated name shape', () => {
    expect(isSystemAccount({ name: 'Opening Balances (USD)' })).toBe(true);
    expect(isSystemAccount({ name: 'Balance Corrections (INR)' })).toBe(true);
    expect(isSystemAccount({ name: 'My Opening Balances Fund' })).toBe(false);
    expect(isSystemAccount({ name: 'My Checking' })).toBe(false);
  });

  it('promotes orphan accounts when parent is absent from visible set', () => {
    const visible = [
      accounts[1], // child only — parent hidden
      accounts[2],
    ];
    expect(getVisibleRoots(visible).map(a => a.id)).toEqual(['child', 'other']);
  });

  it('shows all accounts when showArchived is true without a provider', () => {
    const withArchived = filterAccountsForDisplay(accounts, true).map(a => a.id);
    expect(withArchived).toEqual(['parent', 'child', 'other']);
  });
});
