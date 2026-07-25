import { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { counterAccountsFromJournalPeers } from '@/src/services/accounting/displayTransactionCounterAccounts';
import { AccountId, DisplayTransaction, EnrichedJournal, TransactionId } from '@/src/types/domain';

export function mapEnrichedJournalAccountToDisplayTransaction(
  journal: EnrichedJournal,
  account: EnrichedJournal['accounts'][number],
): DisplayTransaction {
  const counterAccounts = counterAccountsFromJournalPeers(journal.accounts, account.id);

  return {
    id: `${journal.id}_${account.id}` as TransactionId,
    journalId: journal.id,
    accountId: account.id as AccountId,
    amount: journal.totalAmount,
    currencyCode: journal.currencyCode,
    transactionType: account.role === 'SOURCE' ? TransactionType.CREDIT : TransactionType.DEBIT,
    transactionDate: journal.journalDate,
    notes: journal.notes,
    journalDescription: journal.description,
    accountName: account.name,
    accountType: account.accountType as AccountType,
    icon: account.icon,
    counterAccounts: counterAccounts.length > 0 ? counterAccounts : undefined,
    displayTitle: journal.description || 'Transaction',
    displayType: journal.displayType,
    semanticLabel: journal.semanticLabel,
    semanticType: journal.semanticType,
    isIncrease: account.role === 'DESTINATION',
  };
}

export function buildDisplayTransactionsForScopedAccounts(
  journals: EnrichedJournal[],
  scopedAccountIds: AccountId[],
): DisplayTransaction[] {
  const displayTxs: DisplayTransaction[] = [];
  const scopedSet = new Set(scopedAccountIds);

  for (const journal of journals) {
    for (const account of journal.accounts) {
      if (scopedSet.has(account.id as AccountId)) {
        displayTxs.push(mapEnrichedJournalAccountToDisplayTransaction(journal, account));
      }
    }
  }

  return displayTxs;
}

export function buildDisplayTransactionsForJournalAccounts(
  journals: EnrichedJournal[],
  accountIds: AccountId[],
): DisplayTransaction[] {
  return buildDisplayTransactionsForScopedAccounts(journals, accountIds);
}
