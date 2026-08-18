import type { AccountFields } from '@/src/types/domain';
import { AccountId, AccountType, EMPTY_ACCOUNT_ID, TransactionType } from '@/src/types/domain';
import {
  filterGuidedLegAccounts,
  filterToLeafAccounts,
  resolveGuidedAccountsAfterTabChange,
} from '@/src/services/journal/guidedJournalAccountEligibility';

function acct(
  partial: Partial<AccountFields> & Pick<AccountFields, 'id' | 'name' | 'accountType'>,
): AccountFields {
  return {
    currencyCode: 'USD',
    parentAccountId: null,
    ...partial,
  } as AccountFields;
}

describe('guidedJournalAccountEligibility', () => {
  const cash = acct({ id: 'cash' as AccountId, name: 'Cash', accountType: AccountType.ASSET });
  const food = acct({ id: 'food' as AccountId, name: 'Food', accountType: AccountType.EXPENSE });
  const salary = acct({
    id: 'salary' as AccountId,
    name: 'Salary',
    accountType: AccountType.INCOME,
  });
  const parent = acct({
    id: 'parent' as AccountId,
    name: 'Group',
    accountType: AccountType.ASSET,
  });
  const child = acct({
    id: 'child' as AccountId,
    name: 'Child',
    accountType: AccountType.ASSET,
    parentAccountId: 'parent' as AccountId,
  });

  it('filterToLeafAccounts removes parents', () => {
    expect(filterToLeafAccounts([parent, child])).toEqual([child]);
  });

  it('filterGuidedLegAccounts matches expense source and destination', () => {
    const leaves = [cash, food, salary];
    expect(filterGuidedLegAccounts(leaves, 'expense', TransactionType.CREDIT)).toEqual([cash]);
    expect(filterGuidedLegAccounts(leaves, 'expense', TransactionType.DEBIT)).toEqual([food]);
  });

  it('filterGuidedLegAccounts allows any leaf type on transfer legs', () => {
    const leaves = [cash, food, salary];
    expect(filterGuidedLegAccounts(leaves, 'transfer', TransactionType.CREDIT)).toHaveLength(3);
    expect(filterGuidedLegAccounts(leaves, 'transfer', TransactionType.DEBIT)).toHaveLength(3);
  });

  it('resolveGuidedAccountsAfterTabChange clears categories and migrates cash expense→income', () => {
    const byId = new Map([
      [cash.id, cash],
      [food.id, food],
    ]);
    const result = resolveGuidedAccountsAfterTabChange('income', byId, cash.id, food.id);
    expect(result.sourceAccountId).toBe(EMPTY_ACCOUNT_ID);
    expect(result.destinationAccountId).toBe(cash.id);
  });
});
