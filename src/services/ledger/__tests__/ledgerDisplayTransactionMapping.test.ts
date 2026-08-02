import { AccountType } from '@/src/data/models/Account';
import { mapAccountLedgerTransactionToListItem } from '@/src/services/ledger/accountLedgerListItems';
import {
  buildDisplayTransactionsForJournalAccounts,
  mapEnrichedJournalAccountToDisplayTransaction,
} from '@/src/services/ledger/ledgerDisplayTransactionMapping';
import { AccountId, EnrichedJournal, JournalDisplayType, JournalId } from '@/src/types/domain';

function makeJournal(accounts: EnrichedJournal['accounts']): EnrichedJournal {
  return {
    id: 'journal-1' as JournalId,
    journalDate: Date.now(),
    description: 'Split lunch',
    currencyCode: 'USD',
    status: 'POSTED',
    totalAmount: 100,
    transactionCount: accounts.length,
    displayType: JournalDisplayType.EXPENSE,
    accounts,
    semanticLabel: 'Expense',
  };
}

describe('ledger display transaction mapping', () => {
  it('uses the account-specific leg amount for multi-leg journals, not journal total', () => {
    const cashId = 'cash-1' as AccountId;
    const incomeId = 'income-1' as AccountId;
    const expenseId = 'expense-leg-1' as AccountId;

    // Journal total is sum of debits (1000). Cash leg is only 900.
    const journal = makeJournal([
      {
        id: cashId,
        name: 'Cash',
        accountType: AccountType.ASSET,
        role: 'DESTINATION',
        amount: 900,
      },
      {
        id: incomeId,
        name: 'Salary',
        accountType: AccountType.INCOME,
        role: 'SOURCE',
        amount: 1000,
      },
      {
        id: expenseId,
        name: 'Tax',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
        amount: 100,
      },
    ]);
    journal.totalAmount = 1000;

    const cashRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[0]);
    const incomeRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[1]);
    const expenseRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[2]);

    expect(cashRow.amount).toBe(900);
    expect(incomeRow.amount).toBe(1000);
    expect(expenseRow.amount).toBe(100);
    expect(cashRow.amount).not.toBe(journal.totalAmount);
  });

  it('populates counterAccounts for multi-leg journals', () => {
    const assetId = 'asset-1' as AccountId;
    const equityId = 'equity-1' as AccountId;
    const expenseId = 'expense-1' as AccountId;

    const journal = makeJournal([
      {
        id: assetId,
        name: 'Cash',
        accountType: AccountType.ASSET,
        role: 'SOURCE',
      },
      {
        id: equityId,
        name: 'Equity',
        accountType: AccountType.EQUITY,
        role: 'DESTINATION',
      },
      {
        id: expenseId,
        name: 'Food',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
      },
    ]);

    const assetRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[0]);

    expect(assetRow.counterAccounts).toHaveLength(2);
    expect(assetRow.counterAccounts?.map(a => a.name)).toEqual(['Equity', 'Food']);
  });

  it('maps ledger rows to transaction card badges with counterparties, not self', () => {
    const assetId = 'asset-2' as AccountId;
    const equityId = 'equity-2' as AccountId;
    const expenseId = 'expense-2' as AccountId;

    const journal = makeJournal([
      {
        id: assetId,
        name: 'Bank',
        accountType: AccountType.ASSET,
        role: 'SOURCE',
      },
      {
        id: equityId,
        name: 'Equity',
        accountType: AccountType.EQUITY,
        role: 'DESTINATION',
      },
      {
        id: expenseId,
        name: 'Travel',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
      },
    ]);

    const assetRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[0]);
    const listItem = mapAccountLedgerTransactionToListItem(assetRow, () => {});

    const badgeTexts = listItem.cardProps?.badges.map(b => b.text) ?? [];
    expect(badgeTexts).toEqual(['Equity', 'Travel']);
    expect(badgeTexts).not.toContain('Bank');
  });

  it('shows overflow badge when more than two counterparties', () => {
    const assetId = 'asset-3' as AccountId;

    const journal = makeJournal([
      { id: assetId, name: 'Bank', accountType: AccountType.ASSET, role: 'SOURCE' },
      {
        id: 'e1' as AccountId,
        name: 'Equity',
        accountType: AccountType.EQUITY,
        role: 'DESTINATION',
      },
      {
        id: 'e2' as AccountId,
        name: 'Food',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
      },
      {
        id: 'e3' as AccountId,
        name: 'Travel',
        accountType: AccountType.EXPENSE,
        role: 'DESTINATION',
      },
    ]);

    const assetRow = mapEnrichedJournalAccountToDisplayTransaction(journal, journal.accounts[0]);
    const listItem = mapAccountLedgerTransactionToListItem(assetRow, () => {});
    const badgeTexts = listItem.cardProps?.badges.map(b => b.text) ?? [];

    expect(badgeTexts).toEqual(['Equity', 'Food', '+1 more']);
  });

  it('buildDisplayTransactionsForScopedAccounts only includes scoped accounts', () => {
    const assetId = 'asset-scoped' as AccountId;
    const foodId = 'food-scoped' as AccountId;

    const journal = makeJournal([
      { id: assetId, name: 'Bank', accountType: AccountType.ASSET, role: 'SOURCE' },
      { id: foodId, name: 'Food', accountType: AccountType.EXPENSE, role: 'DESTINATION' },
    ]);

    const rows = buildDisplayTransactionsForJournalAccounts([journal], [assetId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].accountName).toBe('Bank');
    expect(rows[0].counterAccounts?.map(a => a.name)).toEqual(['Food']);
  });
});
