import Journal from '@/src/data/models/Journal';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { JournalDisplayType, TransactionType } from '@/src/types/enums';
import { safeAdd } from '@/src/utils/money';
import { enqueueRebuildIfNeeded } from './bulkHelpers';

export interface MergeLine {
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
  plannedPaymentId?: PlannedPaymentId;
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

  const journalMap = new Map(journals.map(j => [j.id, j]));
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

  const plannedPaymentIds = Array.from(
    new Set(
      orderedJournals
        .map(journal => journal.plannedPaymentId)
        .filter((id): id is PlannedPaymentId => Boolean(id)),
    ),
  );
  if (plannedPaymentIds.length > 1) {
    return mergeFailure('Cannot merge transactions linked to different planned payments.', {
      sourceJournals: orderedJournals,
      currencyCode,
    });
  }
  const plannedPaymentId = plannedPaymentIds[0];

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
  const allTransactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);

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
        accountId: tx.accountId,
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
    plannedPaymentId,
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
        plannedPaymentId: analysis.plannedPaymentId,
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
