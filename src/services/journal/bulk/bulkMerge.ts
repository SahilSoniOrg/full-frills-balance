import Journal from '@/src/data/models/Journal';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, JournalId, PlannedPaymentId, WorkplaceId } from '@/src/types/ids';
import { JournalDisplayType, TransactionType } from '@/src/types/enums';
import { fromMinorUnits, safeAdd } from '@/src/utils/money';
import { evaluateJournalBalance } from '@/src/domain/accounting/journalBalanceEvaluator';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { currencyReadService } from '@/src/services/currency-read-service';

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
  const sameCurrency = orderedJournals.every(
    journal => journal.currencyCode.trim().toUpperCase() === currencyCode.trim().toUpperCase(),
  );
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

  const accountIds = [...new Set(allTransactions.map(transaction => transaction.accountId))];
  const accounts = await accountQueryRepository.findAllByIds(workplaceId, accountIds);
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const currencies = [currencyCode, ...accounts.map(account => account.currencyCode)].map(code =>
    code.trim().toUpperCase(),
  );
  const precisionEntries = await Promise.all(
    [...new Set(currencies)].map(
      async currency => [currency, await currencyReadService.getPrecision(currency)] as const,
    ),
  );
  const evaluation = evaluateJournalBalance({
    journalCurrency: currencyCode,
    precisionByCurrency: new Map(precisionEntries),
    lines: allTransactions.map((transaction, index) => ({
      id: String(index),
      accountId: transaction.accountId,
      accountCurrency: accountsById.get(transaction.accountId)?.currencyCode,
      amount: transaction.amount,
      exchangeRate: transaction.exchangeRate,
      transactionType: transaction.transactionType as TransactionType,
    })),
  });

  // Display the combined effect in journal currency while the write path keeps
  // each source line's native amount and exchange rate intact.
  const lineMap = new Map<string, MergeLine>();
  for (const line of evaluation.lineValues) {
    const key = `${line.accountId}_${line.transactionType}`;
    const existing = lineMap.get(key);
    if (existing) {
      existing.amount = safeAdd(existing.amount, line.journalAmount, evaluation.journalPrecision);
    } else {
      lineMap.set(key, {
        accountId: line.accountId as AccountId,
        transactionType: line.transactionType,
        amount: line.journalAmount,
      });
    }
  }
  const totalDebit = fromMinorUnits(evaluation.debitTotalMinorUnits, evaluation.journalPrecision);
  const totalCredit = fromMinorUnits(evaluation.creditTotalMinorUnits, evaluation.journalPrecision);
  const combinedLines = Array.from(lineMap.values());

  if (!evaluation.isBalanced) {
    return mergeFailure(
      evaluation.issues[0]?.message ??
        'Selected transactions are unbalanced across total debits and credits.',
      {
        sourceJournals: orderedJournals,
        totalDebit,
        totalCredit,
        currencyCode,
        combinedDescription,
        suggestedDate: maxDate,
        suggestedDisplayType,
        combinedLines,
      },
    );
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
    combinedLines,
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
  return journalPersistenceService.merge(
    {
      sourceJournalIds: journalIds,
      description: options?.description,
      journalDate: options?.journalDate,
      displayType: options?.displayType,
    },
    workplaceId,
  );
}
