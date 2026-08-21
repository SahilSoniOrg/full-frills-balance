import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { journalPresenter, type TransactionLike } from '@/src/services/accounting/journalPresenter';
import {
  AccountId,
  AccountType,
  JournalDisplayType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { enqueueRebuildIfNeeded, groupTransactionsByJournal } from './bulkHelpers';

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
 * journals in an atomic batch. Single-fetch: eligibility is verified inline from the same
 * transaction set used for the update, eliminating the TOCTOU race of a separate check.
 * Returns the original account mapping to support one-tap undo.
 */
export async function bulkChangeJournalAccount(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
  targetType: 'debit' | 'credit',
  newAccountId: AccountId,
): Promise<BulkChangeAccountResult> {
  // Single fetch — verify eligibility inline from the same data
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

  const affectedAccounts = new Set<AccountId>([newAccountId]);
  let minDate = Infinity;
  const originalAccountIdByTransactionId: Record<string, AccountId> = {};

  for (const tx of transactionsToUpdate) {
    originalAccountIdByTransactionId[tx.id] = tx.accountId;
    affectedAccounts.add(tx.accountId);
    minDate = Math.min(minDate, tx.transactionDate);
  }

  // Load parent journals and recalculate displayTypes
  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const displayTypeByJournalId = await computeSimulatedDisplayTypes(
    workplaceId,
    journals,
    allTransactions,
    tx => (tx.transactionType === transactionType ? newAccountId : tx.accountId),
  );

  await journalWriteRepository.bulkReassignTransactionAccounts({
    workplaceId,
    transactions: transactionsToUpdate,
    newAccountId,
    journals,
    displayTypeByJournalId,
  });

  enqueueRebuildIfNeeded(affectedAccounts, minDate, workplaceId);

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

  const journalIds = Array.from(new Set(transactions.map(t => t.journalId)));
  const allTransactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);
  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);

  const affectedAccounts = new Set<AccountId>();
  let minDate = Infinity;

  for (const tx of transactions) {
    const originalAccId = originalAccountIdByTransactionId[tx.id];
    if (originalAccId) {
      affectedAccounts.add(originalAccId);
      affectedAccounts.add(tx.accountId);
      minDate = Math.min(minDate, tx.transactionDate);
    }
  }

  const displayTypeByJournalId = await computeSimulatedDisplayTypes(
    workplaceId,
    journals,
    allTransactions,
    tx => originalAccountIdByTransactionId[tx.id] ?? tx.accountId,
  );

  // Single atomic batch — each transaction goes back to its own original account and parent journals are updated
  await journalWriteRepository.bulkReassignTransactionAccountsToOriginals({
    workplaceId,
    transactions,
    originalAccountIdByTxId: originalAccountIdByTransactionId,
    journals,
    displayTypeByJournalId,
  });

  enqueueRebuildIfNeeded(affectedAccounts, minDate, workplaceId);
}

/**
 * Computes updated display types for parent journals after simulated transaction account reassignments.
 */
async function computeSimulatedDisplayTypes(
  workplaceId: WorkplaceId,
  journals: Journal[],
  allTransactions: Transaction[],
  resolveAccountId: (tx: Transaction) => AccountId,
): Promise<Map<JournalId, JournalDisplayType>> {
  const allAccountIds = new Set<AccountId>();
  for (const tx of allTransactions) {
    allAccountIds.add(tx.accountId);
    allAccountIds.add(resolveAccountId(tx));
  }

  const accounts = await accountQueryRepository.findAllByIds(
    workplaceId,
    Array.from(allAccountIds),
  );
  const accountTypeMap = new Map<string, AccountType>(
    accounts.map(a => [a.id, a.accountType as AccountType]),
  );

  const txByJournal = groupTransactionsByJournal(allTransactions);
  const displayTypeByJournalId = new Map<JournalId, JournalDisplayType>();

  for (const journal of journals) {
    const txs = txByJournal.get(journal.id) ?? [];
    const simulatedTxs: TransactionLike[] = txs.map(t => ({
      accountId: resolveAccountId(t),
      amount: t.amount,
      transactionType: t.transactionType as TransactionType,
    }));
    const newDisplayType = journalPresenter.getJournalDisplayType(simulatedTxs, accountTypeMap);
    displayTypeByJournalId.set(journal.id, newDisplayType);
  }

  return displayTypeByJournalId;
}
