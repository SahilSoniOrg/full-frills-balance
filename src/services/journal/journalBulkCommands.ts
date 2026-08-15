import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { journalPresenter, type TransactionLike } from '@/src/services/accounting/journalPresenter';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  AccountId,
  AccountType,
  JournalDisplayType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { safeAdd } from '@/src/utils/money';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Groups a flat transaction list into a map keyed by journalId. */
function groupTransactionsByJournal(transactions: Transaction[]): Map<JournalId, Transaction[]> {
  const map = new Map<JournalId, Transaction[]>();
  for (const tx of transactions) {
    const key = tx.journalId as JournalId;
    const list = map.get(key) ?? [];
    list.push(tx);
    map.set(key, list);
  }
  return map;
}

/** Enqueues a running-balance rebuild only when there is meaningful work. */
function enqueueRebuildIfNeeded(
  accounts: Set<AccountId>,
  minDate: number,
  workplaceId: WorkplaceId,
): void {
  if (accounts.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(accounts, minDate, workplaceId);
  }
}

// ---------------------------------------------------------------------------
// Bulk Rename
// ---------------------------------------------------------------------------

export interface BulkRenameResult {
  renamedCount: number;
  inverseRenames: Record<JournalId, string>;
}

/**
 * Bulk updates description/payee name for a set of journals.
 * Returns an inverse rename mapping to support one-tap undo.
 */
export async function bulkRenameJournals(
  workplaceId: WorkplaceId,
  renames: Record<JournalId, string>,
): Promise<BulkRenameResult> {
  const journalIds = Object.keys(renames) as JournalId[];
  if (journalIds.length === 0) {
    return { renamedCount: 0, inverseRenames: {} };
  }

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const inverseRenames: Record<JournalId, string> = {};
  const effectiveRenames: Record<JournalId, string> = {};

  for (const journal of journals) {
    const id = journal.id as JournalId;
    const newName = renames[id];
    if (newName !== undefined && newName !== (journal.description ?? '')) {
      inverseRenames[id] = journal.description ?? '';
      effectiveRenames[id] = newName;
    }
  }

  if (Object.keys(effectiveRenames).length > 0) {
    await journalWriteRepository.bulkUpdateDescriptions(journals, effectiveRenames);
  }

  return {
    renamedCount: Object.keys(effectiveRenames).length,
    inverseRenames,
  };
}

// ---------------------------------------------------------------------------
// Bulk Duplicate
// ---------------------------------------------------------------------------

/**
 * Duplicates a set of journals into new active entries in a single atomic database batch.
 */
export async function bulkDuplicateJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<Journal[]> {
  if (journalIds.length === 0) return [];

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const transactions = await transactionRepository.findByJournals(workplaceId, journalIds);
  const txByJournal = groupTransactionsByJournal(transactions);

  const now = Date.now();
  const createItems = journals.map(journal => {
    const txs = txByJournal.get(journal.id as JournalId) ?? [];
    return {
      journalDate: now,
      description: journal.description ? `${journal.description}` : undefined,
      currencyCode: journal.currencyCode,
      totalAmount: journal.totalAmount,
      displayType: journal.displayType as JournalDisplayType,
      transactions: txs.map(tx => ({
        accountId: tx.accountId as AccountId,
        amount: tx.amount,
        transactionType: tx.transactionType as TransactionType,
        notes: tx.notes,
        exchangeRate: tx.exchangeRate,
        currencyCode: tx.currencyCode,
      })),
    };
  });

  const {
    journals: createdJournals,
    affectedAccountIds,
    minDate,
  } = await journalWriteRepository.bulkCreateJournals(workplaceId, createItems);

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);

  return createdJournals;
}

// ---------------------------------------------------------------------------
// Merge Analysis + Execution
// ---------------------------------------------------------------------------

interface MergeLine {
  accountId: AccountId;
  transactionType: TransactionType;
  amount: number;
}

export interface MergeJournalsAnalysis {
  canMerge: boolean;
  reason?: string;
  sourceJournals: Journal[];
  totalDebit: number;
  totalCredit: number;
  currencyCode: string;
  combinedDescription: string;
  suggestedDate: number;
  suggestedDisplayType: JournalDisplayType;
  combinedLines: MergeLine[];
}

/** Builds a "cannot merge" result with sensible defaults. */
function mergeFailure(
  reason: string,
  overrides?: Partial<MergeJournalsAnalysis>,
): MergeJournalsAnalysis {
  return {
    canMerge: false,
    reason,
    sourceJournals: [],
    totalDebit: 0,
    totalCredit: 0,
    currencyCode: '',
    combinedDescription: '',
    suggestedDate: Date.now(),
    suggestedDisplayType: JournalDisplayType.TRANSFER,
    combinedLines: [],
    ...overrides,
  };
}

/**
 * Analyses candidate journals to check if they can be merged and prepares the merge preview data.
 */
export async function analyzeJournalsForMerge(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<MergeJournalsAnalysis> {
  if (journalIds.length < 2) {
    return mergeFailure('Select at least 2 transactions to merge.');
  }

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);

  if (journals.length !== journalIds.length) {
    return mergeFailure('Some selected transactions could not be found.', {
      sourceJournals: journals,
    });
  }

  const journalMap = new Map(journals.map(j => [j.id as JournalId, j]));
  const orderedJournals = journalIds
    .map(id => journalMap.get(id))
    .filter((j): j is Journal => Boolean(j));

  const currencyCode = orderedJournals[0].currencyCode;
  const sameCurrency = orderedJournals.every(j => j.currencyCode === currencyCode);
  if (!sameCurrency) {
    return mergeFailure('Cannot merge transactions with different currencies.', {
      sourceJournals: orderedJournals,
      currencyCode,
    });
  }

  const firstDisplayType = orderedJournals[0]?.displayType as JournalDisplayType | undefined;
  const allSameDisplayType =
    firstDisplayType !== undefined &&
    orderedJournals.every(j => j.displayType === firstDisplayType);
  const suggestedDisplayType = allSameDisplayType ? firstDisplayType : JournalDisplayType.TRANSFER;

  const descriptions = orderedJournals
    .map(j => j.description?.trim())
    .filter((d): d is string => Boolean(d && d.length > 0));
  const uniqueDescriptions = Array.from(new Set(descriptions));
  const combinedDescription =
    uniqueDescriptions.length > 0
      ? `Merged: ${uniqueDescriptions.join(', ')}`
      : 'Merged Transaction';

  const maxDate = Math.max(...orderedJournals.map(j => j.journalDate));

  // Collect all transactions via canonical repository
  const allTransactions = await transactionRepository.findByJournals(workplaceId, journalIds);

  // Aggregate legs by accountId and transactionType using canonical safeAdd
  const lineMap = new Map<string, MergeLine>();
  let totalDebit = 0;
  let totalCredit = 0;

  for (const tx of allTransactions) {
    const key = `${tx.accountId}_${tx.transactionType}`;
    const existing = lineMap.get(key);
    const txType = tx.transactionType as TransactionType;
    if (existing) {
      existing.amount = safeAdd(existing.amount, tx.amount, 2);
    } else {
      lineMap.set(key, {
        accountId: tx.accountId as AccountId,
        transactionType: txType,
        amount: tx.amount,
      });
    }

    if (txType === TransactionType.DEBIT) {
      totalDebit = safeAdd(totalDebit, tx.amount, 2);
    } else {
      totalCredit = safeAdd(totalCredit, tx.amount, 2);
    }
  }

  // Double-entry accounting invariant check
  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return mergeFailure('Selected transactions are unbalanced across total debits and credits.', {
      sourceJournals: orderedJournals,
      totalDebit,
      totalCredit,
      currencyCode,
      combinedDescription,
      suggestedDate: maxDate,
      suggestedDisplayType,
      combinedLines: Array.from(lineMap.values()),
    });
  }

  return {
    canMerge: true,
    sourceJournals: orderedJournals,
    totalDebit,
    totalCredit,
    currencyCode,
    combinedDescription,
    suggestedDate: maxDate,
    suggestedDisplayType,
    combinedLines: Array.from(lineMap.values()),
  };
}

/**
 * Atomically merges multiple journals into a single combined journal and soft-deletes the originals.
 */
export async function mergeJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
  options?: { description?: string; journalDate?: number; displayType?: JournalDisplayType },
): Promise<Journal> {
  const analysis = await analyzeJournalsForMerge(workplaceId, journalIds);
  if (!analysis.canMerge) {
    throw new Error(analysis.reason || 'Cannot merge selected journals');
  }

  const { mergedJournal, affectedAccountIds, minDate } =
    await journalWriteRepository.mergeJournalsAtomic({
      workplaceId,
      sourceJournalIds: journalIds,
      newJournalData: {
        journalDate: options?.journalDate ?? analysis.suggestedDate,
        description: options?.description || analysis.combinedDescription,
        currencyCode: analysis.currencyCode,
        totalAmount: analysis.totalDebit,
        displayType: options?.displayType ?? analysis.suggestedDisplayType,
        transactions: analysis.combinedLines.map(line => ({
          accountId: line.accountId,
          amount: line.amount,
          transactionType: line.transactionType,
        })),
      },
    });

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);

  return mergedJournal;
}

// ---------------------------------------------------------------------------
// Bulk Change Account (Debit / Credit leg reassignment)
// ---------------------------------------------------------------------------

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

  const transactions = await transactionRepository.findByJournals(workplaceId, journalIds);
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
      debitAccounts.add(debits[0].accountId as AccountId);
    }

    if (credits.length !== 1) {
      allHaveSingleCredit = false;
    } else {
      creditAccounts.add(credits[0].accountId as AccountId);
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
  const allTransactions = await transactionRepository.findByJournals(workplaceId, journalIds);
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
    originalAccountIdByTransactionId[tx.id] = tx.accountId as AccountId;
    affectedAccounts.add(tx.accountId as AccountId);
    minDate = Math.min(minDate, tx.transactionDate);
  }

  // Load parent journals and recalculate displayTypes
  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);
  const displayTypeByJournalId = await computeSimulatedDisplayTypes(
    workplaceId,
    journals,
    allTransactions,
    tx => (tx.transactionType === transactionType ? newAccountId : (tx.accountId as AccountId)),
  );

  await journalWriteRepository.bulkReassignTransactionAccounts({
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

  const transactions = await transactionRepository.findByIds(workplaceId, txIds);
  if (transactions.length === 0) return;

  const journalIds = Array.from(new Set(transactions.map(t => t.journalId as JournalId)));
  const allTransactions = await transactionRepository.findByJournals(workplaceId, journalIds);
  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);

  const affectedAccounts = new Set<AccountId>();
  let minDate = Infinity;

  for (const tx of transactions) {
    const originalAccId = originalAccountIdByTransactionId[tx.id];
    if (originalAccId) {
      affectedAccounts.add(originalAccId);
      affectedAccounts.add(tx.accountId as AccountId);
      minDate = Math.min(minDate, tx.transactionDate);
    }
  }

  const displayTypeByJournalId = await computeSimulatedDisplayTypes(
    workplaceId,
    journals,
    allTransactions,
    tx => originalAccountIdByTransactionId[tx.id] ?? (tx.accountId as AccountId),
  );

  // Single atomic batch — each transaction goes back to its own original account and parent journals are updated
  await journalWriteRepository.bulkReassignTransactionAccountsToOriginals({
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
    allAccountIds.add(tx.accountId as AccountId);
    allAccountIds.add(resolveAccountId(tx));
  }

  const accounts = await accountRepository.findAllByIds(workplaceId, Array.from(allAccountIds));
  const accountTypeMap = new Map<string, AccountType>(
    accounts.map(a => [a.id, a.accountType as AccountType]),
  );

  const txByJournal = groupTransactionsByJournal(allTransactions);
  const displayTypeByJournalId = new Map<JournalId, JournalDisplayType>();

  for (const journal of journals) {
    const txs = txByJournal.get(journal.id as JournalId) ?? [];
    const simulatedTxs: TransactionLike[] = txs.map(t => ({
      accountId: resolveAccountId(t),
      amount: t.amount,
      transactionType: t.transactionType as TransactionType,
    }));
    const newDisplayType = journalPresenter.getJournalDisplayType(simulatedTxs, accountTypeMap);
    displayTypeByJournalId.set(journal.id as JournalId, newDisplayType);
  }

  return displayTypeByJournalId;
}

// ---------------------------------------------------------------------------
// Bulk Delete
// ---------------------------------------------------------------------------

/**
 * Atomically soft deletes multiple journals and their child transactions in a single batch.
 */
export async function bulkDeleteJournals(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<void> {
  if (journalIds.length === 0) return;

  const { affectedAccountIds, minDate } = await journalWriteRepository.bulkSoftDeleteJournals(
    workplaceId,
    journalIds,
  );

  enqueueRebuildIfNeeded(affectedAccountIds, minDate, workplaceId);
}
