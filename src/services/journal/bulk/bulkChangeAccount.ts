import Transaction from '@/src/data/models/Transaction';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { TransactionType } from '@/src/types/enums';
import { groupTransactionsByJournal } from './bulkHelpers';

export interface JournalAccountEditEligibility {
  canEditDebit: boolean;
  canEditCredit: boolean;
  debitAccounts: AccountId[];
  creditAccounts: AccountId[];
  reason?: string;
}

/**
 * Checks whether all selected journals have exactly 1 debit and/or 1 credit leg.
 * Read-only query — safe for UI preview. The write path verifies inline.
 */
export async function checkJournalAccountEditEligibility(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<JournalAccountEditEligibility> {
  if (journalIds.length === 0) {
    return { canEditDebit: false, canEditCredit: false, debitAccounts: [], creditAccounts: [] };
  }

  const transactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);
  return evaluateEligibility(transactions, journalIds);
}

/** Pure eligibility evaluation from an already-fetched transaction set. */
function evaluateEligibility(
  transactions: Transaction[],
  journalIds: JournalId[],
): JournalAccountEditEligibility {
  const txByJournal = groupTransactionsByJournal(transactions);

  let allHaveSingleDebit = true;
  let allHaveSingleCredit = true;
  const debitAccounts = new Set<AccountId>();
  const creditAccounts = new Set<AccountId>();

  for (const id of journalIds) {
    const list = txByJournal.get(id) ?? [];
    const debits = list.filter(t => t.transactionType === TransactionType.DEBIT);
    const credits = list.filter(t => t.transactionType === TransactionType.CREDIT);

    if (debits.length !== 1) {
      allHaveSingleDebit = false;
    } else {
      debitAccounts.add(debits[0].accountId);
    }

    if (credits.length !== 1) {
      allHaveSingleCredit = false;
    } else {
      creditAccounts.add(credits[0].accountId);
    }
  }

  return {
    canEditDebit: allHaveSingleDebit,
    canEditCredit: allHaveSingleCredit,
    debitAccounts: Array.from(debitAccounts),
    creditAccounts: Array.from(creditAccounts),
    reason:
      !allHaveSingleDebit && !allHaveSingleCredit
        ? 'Selected transactions have multiple debit and credit split legs and cannot be bulk-reassigned.'
        : undefined,
  };
}

export interface BulkChangeAccountResult {
  updatedCount: number;
  originalAccountIdByTransactionId: Record<string, AccountId>;
}

/**
 * Bulk reassigns either the debit (destination) or credit (source) account across selected
 * journals in an atomic batch. The repository revalidates the affected journals and derives
 * their display types inside the write. Returns the original account mapping for one-tap undo.
 */
export async function bulkChangeJournalAccount(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
  targetType: 'debit' | 'credit',
  newAccountId: AccountId,
): Promise<BulkChangeAccountResult> {
  const allTransactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);
  const eligibility = evaluateEligibility(allTransactions, journalIds);

  if (targetType === 'debit' && !eligibility.canEditDebit) {
    throw new Error('All selected transactions must have exactly one destination (debit) leg.');
  }
  if (targetType === 'credit' && !eligibility.canEditCredit) {
    throw new Error('All selected transactions must have exactly one source (credit) leg.');
  }

  const transactionType = targetType === 'debit' ? TransactionType.DEBIT : TransactionType.CREDIT;
  const transactionsToUpdate = allTransactions.filter(t => t.transactionType === transactionType);

  if (transactionsToUpdate.length === 0) {
    return { updatedCount: 0, originalAccountIdByTransactionId: {} };
  }

  const originalAccountIdByTransactionId: Record<string, AccountId> = {};

  for (const tx of transactionsToUpdate) {
    originalAccountIdByTransactionId[tx.id] = tx.accountId;
  }

  await journalPersistenceService.reassignAccounts(
    {
      accountIdByTransactionId: new Map(
        transactionsToUpdate.map(transaction => [transaction.id, newAccountId]),
      ),
    },
    workplaceId,
  );

  return {
    updatedCount: transactionsToUpdate.length,
    originalAccountIdByTransactionId,
  };
}

/**
 * Reverts account changes for a set of transactions using the original account map.
 * All reassignments happen in a single atomic database batch.
 */
export async function undoBulkChangeJournalAccount(
  workplaceId: WorkplaceId,
  originalAccountIdByTransactionId: Record<string, AccountId>,
): Promise<void> {
  const txIds = Object.keys(originalAccountIdByTransactionId);
  if (txIds.length === 0) return;

  const transactions = await transactionQueryRepository.findByIds(workplaceId, txIds);
  if (transactions.length === 0) return;

  await journalPersistenceService.reassignAccounts(
    {
      accountIdByTransactionId: new Map(
        transactions
          .filter(transaction => originalAccountIdByTransactionId[transaction.id])
          .map(transaction => [transaction.id, originalAccountIdByTransactionId[transaction.id]]),
      ),
    },
    workplaceId,
  );
}
