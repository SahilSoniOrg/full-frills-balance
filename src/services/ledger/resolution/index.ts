import Account from '@/src/data/models/Account';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { AccountId, AccountType, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import { LocalTransactionClassifier } from '@/src/utils/nlp/BayesClassifier';
import { fuzzyMatch } from './fuzzyMatcher';
import { getBayesTrainingData, resolveFromHistory } from './historyResolver';
import { SYNONYM_DICTIONARY } from './synonymDictionary';
import { ResolutionParams, ResolutionResult } from './types';

export * from './types';
export * from './synonymDictionary';
export * from './fuzzyMatcher';
export * from './historyResolver';

export async function resolveAccount(params: ResolutionParams): Promise<ResolutionResult> {
  const {
    sourceHint,
    destinationHint,
    direction,
    workplaceId,
    isReversal,
    rawText,
    unconstrained,
  } = params;

  // Fetch active accounts in workspace
  const accounts = await accountQueryRepository.findAll(workplaceId);

  // Group active accounts by Asset/Liability (Source) and Income/Expense (Category)
  const assetAccounts = accounts.filter(
    acc => acc.accountType === AccountType.ASSET || acc.accountType === AccountType.LIABILITY,
  );
  const categoryAccounts = accounts.filter(
    acc => acc.accountType === AccountType.EXPENSE || acc.accountType === AccountType.INCOME,
  );
  const expenseAccounts = categoryAccounts.filter(acc => acc.accountType === AccountType.EXPENSE);
  const incomeAccounts = categoryAccounts.filter(acc => acc.accountType === AccountType.INCOME);
  const targetCategoryAccounts =
    direction === 'credit'
      ? incomeAccounts
      : direction === 'debit'
        ? expenseAccounts
        : categoryAccounts;

  let resolvedSourceId: AccountId | undefined;
  let resolvedCategoryId: AccountId | undefined;
  let sourceScore = 0;
  let categoryScore = 0;
  let sourceStrategy: ResolutionResult['strategyUsed'] = 'default';
  let categoryStrategy: ResolutionResult['strategyUsed'] = 'default';

  // 1. Fuzzy match for Source Account
  const primarySourceHint = sourceHint || destinationHint;
  if (primarySourceHint && (unconstrained ? accounts : assetAccounts).length > 0) {
    const bestSource = fuzzyMatch(primarySourceHint, unconstrained ? accounts : assetAccounts);
    // If using the fallback hint (destinationHint), require a slightly more conservative threshold (e.g. >= 0.70)
    const threshold = sourceHint ? 0.85 : 0.7;
    if (bestSource && bestSource.score >= threshold) {
      resolvedSourceId = bestSource.account.id;
      sourceScore = bestSource.score;
      sourceStrategy = 'fuzzy';
    }
  }

  // 2. Fuzzy match for Category Account
  const primaryCategoryHint = destinationHint || sourceHint;
  const candidateCategoryAccounts = unconstrained ? accounts : targetCategoryAccounts;
  if (primaryCategoryHint && candidateCategoryAccounts.length > 0) {
    const bestCategory = fuzzyMatch(primaryCategoryHint, candidateCategoryAccounts);
    // If using the fallback hint (sourceHint), require a slightly more conservative threshold (e.g. >= 0.70)
    const threshold = destinationHint ? 0.85 : 0.7;
    if (bestCategory && bestCategory.score >= threshold) {
      resolvedCategoryId = bestCategory.account.id;
      categoryScore = bestCategory.score;
      categoryStrategy = 'fuzzy';
    } else {
      // Synonym lookup (Only for actual categories if not unconstrained)
      const words = primaryCategoryHint
        .toLowerCase()
        .split(/[\s,._\-\/]+/)
        .filter(w => w.length > 1);
      for (const word of words) {
        const synonym = SYNONYM_DICTIONARY[word];
        if (synonym) {
          const bestSynonymMatch = fuzzyMatch(synonym, candidateCategoryAccounts);
          if (bestSynonymMatch && bestSynonymMatch.score >= 0.85) {
            resolvedCategoryId = bestSynonymMatch.account.id;
            categoryScore = bestSynonymMatch.score * 0.9; // Small penalty for synonym indirection
            categoryStrategy = 'fuzzy';
            break;
          }
        }
      }
    }
  }

  // If fuzzy matching resolved both with high confidence, return immediately
  if (resolvedSourceId && resolvedCategoryId && sourceScore >= 0.85 && categoryScore >= 0.85) {
    return buildResult(
      resolvedSourceId,
      resolvedCategoryId,
      (sourceScore + categoryScore) / 2,
      'fuzzy',
      accounts,
      undefined, // semanticType unknown yet
      isReversal,
    );
  }

  // 3. Historical Miner Lookup (Only for unresolved parts!)
  if (!resolvedSourceId || !resolvedCategoryId) {
    if (destinationHint || sourceHint) {
      const hint = destinationHint || sourceHint || '';
      const historyResult = await resolveFromHistory(
        hint,
        direction,
        workplaceId,
        assetAccounts,
        targetCategoryAccounts,
      );
      if (historyResult && historyResult.confidence > 0.75) {
        if (!resolvedSourceId && historyResult.sourceAccountId) {
          resolvedSourceId = historyResult.sourceAccountId;
          sourceScore = historyResult.confidence;
          sourceStrategy = 'history';
        }
        if (!resolvedCategoryId && historyResult.categoryAccountId) {
          resolvedCategoryId = historyResult.categoryAccountId;
          categoryScore = historyResult.confidence;
          categoryStrategy = 'history';
        }
      }
    }
  }

  // 4. Local Naive Bayes Classification (Only if category is still unresolved!)
  if (!resolvedCategoryId && (destinationHint || sourceHint)) {
    const hint = destinationHint || sourceHint || '';
    const trainingSamples = await getBayesTrainingData(workplaceId);
    if (trainingSamples.length > 0) {
      const classifier = new LocalTransactionClassifier();
      classifier.train(trainingSamples);
      const classification = classifier.classify(hint);
      if (classification.length > 0 && classification[0].probability > 0.7) {
        resolvedCategoryId = classification[0].categoryAccountId as AccountId;
        categoryScore = classification[0].probability;
        categoryStrategy = 'bayes';
      }
    }
  }

  // Ensure source and destination are never the same account
  if (resolvedSourceId === resolvedCategoryId && resolvedSourceId) {
    if (sourceScore >= categoryScore) {
      resolvedCategoryId = undefined;
      categoryScore = 0;
    } else {
      resolvedSourceId = undefined;
      sourceScore = 0;
    }
  }

  // 5. Default Fallbacks if still unresolved (filter by direction so Expenses get Expense accounts, not Income/Salary)
  const defaultCategory =
    direction === 'credit'
      ? incomeAccounts[0]?.id || EMPTY_ACCOUNT_ID
      : direction === 'debit'
        ? expenseAccounts[0]?.id || EMPTY_ACCOUNT_ID
        : categoryAccounts[0]?.id || EMPTY_ACCOUNT_ID;

  const fallbackSource =
    resolvedSourceId || (unconstrained ? undefined : assetAccounts[0]?.id) || EMPTY_ACCOUNT_ID;
  const fallbackCategory =
    resolvedCategoryId || (unconstrained ? undefined : defaultCategory) || EMPTY_ACCOUNT_ID;

  // Penalize strategy and confidence if only one of the sides resolved successfully
  const finalStrategy =
    resolvedSourceId && resolvedCategoryId
      ? 'fuzzy'
      : resolvedSourceId || resolvedCategoryId
        ? resolvedSourceId
          ? sourceStrategy
          : categoryStrategy
        : 'default';

  const finalConfidence =
    resolvedSourceId && resolvedCategoryId
      ? (sourceScore + categoryScore) / 2
      : resolvedSourceId || resolvedCategoryId
        ? Math.max(sourceScore, categoryScore) * 0.9 // Small penalty if only one side matched
        : unconstrained
          ? 0
          : 0.4; // Zero confidence if AI second-pass failed to match anything

  // 6. Semantic Tagging
  let semanticType: string | undefined;
  if (isReversal) {
    const text = (rawText || '').toLowerCase();
    if (text.includes('cashback')) {
      semanticType = 'CASHBACK';
    } else if (text.includes('chargeback')) {
      semanticType = 'CHARGEBACK';
    } else if (text.includes('refund')) {
      semanticType = 'REFUND';
    } else {
      semanticType = direction === 'credit' ? 'REFUND' : 'EXPENSE_REVERSAL';
    }
  }

  return buildResult(
    fallbackSource,
    fallbackCategory,
    finalConfidence,
    finalStrategy,
    accounts,
    semanticType,
    isReversal,
  );
}

function buildResult(
  sourceId: AccountId,
  categoryId: AccountId,
  confidence: number,
  strategy: ResolutionResult['strategyUsed'],
  accounts: Account[],
  semanticType?: string,
  isReversal?: boolean,
): ResolutionResult {
  const sourceAcc = accounts.find(a => a.id === sourceId);
  const categoryAcc = accounts.find(a => a.id === categoryId);

  return {
    sourceAccountId: sourceId,
    categoryAccountId: categoryId,
    sourceAccountName: sourceAcc?.name,
    categoryAccountName: categoryAcc?.name,
    confidence,
    strategyUsed: strategy,
    semanticType,
    isReversal,
  };
}

export class AccountResolutionService {
  resolve(params: ResolutionParams): Promise<ResolutionResult> {
    return resolveAccount(params);
  }
}

export const accountResolutionService = new AccountResolutionService();
