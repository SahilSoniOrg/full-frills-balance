import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  AccountId,
  JournalDisplayType,
  JournalId,
  TransactionType,
  WorkplaceId,
} from '@/src/types/domain';
import { safeAdd } from '@/src/utils/money';

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

  const txByJournal = new Map<JournalId, Transaction[]>();
  for (const tx of transactions) {
    const list = txByJournal.get(tx.journalId as JournalId) ?? [];
    list.push(tx);
    txByJournal.set(tx.journalId as JournalId, list);
  }

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

  if (affectedAccountIds.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(affectedAccountIds, minDate, workplaceId);
  }

  return createdJournals;
}

export interface MergeJournalsAnalysis {
  canMerge: boolean;
  reason?: string;
  errorMessage?: string;
  sourceJournals: Journal[];
  totalDebit: number;
  totalCredit: number;
  currencyCode: string;
  combinedDescription: string;
  suggestedDate: number;
  suggestedDisplayType: JournalDisplayType;
  combinedLines: {
    accountId: AccountId;
    transactionType: TransactionType;
    amount: number;
  }[];
}

export type MergeJournalsPreview = MergeJournalsAnalysis;

/**
 * Analyses candidate journals to check if they can be merged and prepares the merge preview data.
 */
export async function analyzeJournalsForMerge(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<MergeJournalsAnalysis> {
  if (journalIds.length < 2) {
    return {
      canMerge: false,
      reason: 'Select at least 2 transactions to merge.',
      sourceJournals: [],
      totalDebit: 0,
      totalCredit: 0,
      currencyCode: '',
      combinedDescription: '',
      suggestedDate: Date.now(),
      suggestedDisplayType: JournalDisplayType.TRANSFER,
      combinedLines: [],
    };
  }

  const journals = await journalQueryRepository.findByIds(workplaceId, journalIds);

  if (journals.length !== journalIds.length) {
    return {
      canMerge: false,
      reason: 'Some selected transactions could not be found.',
      sourceJournals: journals,
      totalDebit: 0,
      totalCredit: 0,
      currencyCode: '',
      combinedDescription: '',
      suggestedDate: Date.now(),
      suggestedDisplayType: JournalDisplayType.TRANSFER,
      combinedLines: [],
    };
  }

  const journalMap = new Map(journals.map(j => [j.id as JournalId, j]));
  const orderedJournals = journalIds
    .map(id => journalMap.get(id))
    .filter((j): j is Journal => Boolean(j));

  const currencyCode = orderedJournals[0].currencyCode;
  const sameCurrency = orderedJournals.every(j => j.currencyCode === currencyCode);
  if (!sameCurrency) {
    return {
      canMerge: false,
      reason: 'Cannot merge transactions with different currencies.',
      sourceJournals: orderedJournals,
      totalDebit: 0,
      totalCredit: 0,
      currencyCode,
      combinedDescription: '',
      suggestedDate: Date.now(),
      suggestedDisplayType: JournalDisplayType.TRANSFER,
      combinedLines: [],
    };
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
  const lineMap = new Map<
    string,
    { accountId: AccountId; transactionType: TransactionType; amount: number }
  >();
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
    return {
      canMerge: false,
      reason: 'Selected transactions are unbalanced across total debits and credits.',
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

  if (affectedAccountIds.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(affectedAccountIds, minDate, workplaceId);
  }

  return mergedJournal;
}

export interface JournalAccountEditEligibility {
  canEditDebit: boolean;
  canEditCredit: boolean;
  debitAccounts: AccountId[];
  creditAccounts: AccountId[];
  reason?: string;
}

/**
 * Checks whether all selected journals have exactly 1 debit and/or 1 credit leg.
 */
export async function checkJournalAccountEditEligibility(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
): Promise<JournalAccountEditEligibility> {
  if (journalIds.length === 0) {
    return { canEditDebit: false, canEditCredit: false, debitAccounts: [], creditAccounts: [] };
  }

  const transactions = await transactionRepository.findByJournals(workplaceId, journalIds);

  // Group transactions by journalId
  const txByJournal = new Map<JournalId, Transaction[]>();
  for (const tx of transactions) {
    const list = txByJournal.get(tx.journalId as JournalId) ?? [];
    list.push(tx);
    txByJournal.set(tx.journalId as JournalId, list);
  }

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
 * Bulk reassigns either the debit (destination) or credit (source) account across selected journals in an atomic batch.
 * Returns the original account mapping to support one-tap undo.
 */
export async function bulkChangeJournalAccount(
  workplaceId: WorkplaceId,
  journalIds: JournalId[],
  targetType: 'debit' | 'credit',
  newAccountId: AccountId,
): Promise<BulkChangeAccountResult> {
  const eligibility = await checkJournalAccountEditEligibility(workplaceId, journalIds);
  if (targetType === 'debit' && !eligibility.canEditDebit) {
    throw new Error('All selected transactions must have exactly one destination (debit) leg.');
  }
  if (targetType === 'credit' && !eligibility.canEditCredit) {
    throw new Error('All selected transactions must have exactly one source (credit) leg.');
  }

  const transactionType = targetType === 'debit' ? TransactionType.DEBIT : TransactionType.CREDIT;

  const allTransactions = await transactionRepository.findByJournals(workplaceId, journalIds);
  const transactions = allTransactions.filter(t => t.transactionType === transactionType);

  if (transactions.length === 0) {
    return { updatedCount: 0, originalAccountIdByTransactionId: {} };
  }

  const affectedAccounts = new Set<AccountId>([newAccountId]);
  let minDate = Infinity;
  const originalAccountIdByTransactionId: Record<string, AccountId> = {};

  for (const tx of transactions) {
    originalAccountIdByTransactionId[tx.id] = tx.accountId as AccountId;
    affectedAccounts.add(tx.accountId as AccountId);
    minDate = Math.min(minDate, tx.transactionDate);
  }

  await journalWriteRepository.bulkReassignTransactionAccounts(transactions, newAccountId);

  if (affectedAccounts.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(affectedAccounts, minDate, workplaceId);
  }

  return {
    updatedCount: transactions.length,
    originalAccountIdByTransactionId,
  };
}

/**
 * Reverts account changes for a set of transactions using the original account map.
 */
export async function undoBulkChangeJournalAccount(
  workplaceId: WorkplaceId,
  originalAccountIdByTransactionId: Record<string, AccountId>,
): Promise<void> {
  const txIds = Object.keys(originalAccountIdByTransactionId);
  if (txIds.length === 0) return;

  const transactions = await transactionRepository.findByIds(workplaceId, txIds);
  if (transactions.length === 0) return;

  const affectedAccounts = new Set<AccountId>();
  let minDate = Infinity;

  // Group transactions by target original account
  const txByTargetAccount = new Map<AccountId, Transaction[]>();
  for (const tx of transactions) {
    const originalAccId = originalAccountIdByTransactionId[tx.id];
    if (originalAccId) {
      affectedAccounts.add(originalAccId);
      affectedAccounts.add(tx.accountId as AccountId);
      minDate = Math.min(minDate, tx.transactionDate);

      const list = txByTargetAccount.get(originalAccId) ?? [];
      list.push(tx);
      txByTargetAccount.set(originalAccId, list);
    }
  }

  for (const [accId, txList] of txByTargetAccount.entries()) {
    await journalWriteRepository.bulkReassignTransactionAccounts(txList, accId);
  }

  if (affectedAccounts.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(affectedAccounts, minDate, workplaceId);
  }
}

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

  if (affectedAccountIds.size > 0 && minDate !== Infinity) {
    rebuildQueueService.enqueueMany(affectedAccountIds, minDate, workplaceId);
  }
}
