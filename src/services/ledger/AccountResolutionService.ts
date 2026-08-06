import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { AccountId, WorkplaceId, AccountType } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

export interface ResolutionResult {
  sourceAccountId: AccountId; // Mapped Asset / Liability account
  categoryAccountId: AccountId; // Mapped Income / Expense category account
  sourceAccountName?: string;
  categoryAccountName?: string;
  confidence: number;
  strategyUsed: 'fuzzy' | 'history' | 'bayes' | 'default';
  semanticType?: string;
  isReversal?: boolean;
}

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  let i, j, val;
  for (i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        val = 0;
      } else {
        val = 1;
      }
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1, // deletion
        tmp[i][j - 1] + 1, // insertion
        tmp[i - 1][j - 1] + val, // substitution
      );
    }
  }
  return tmp[a.length][b.length];
}

function getStringSimilarity(a: string, b: string): number {
  const distance = getLevenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
}

class LocalTransactionClassifier {
  private vocabulary = new Set<string>();
  private classDocCounts: Record<string, number> = {};
  private classWordCounts: Record<string, Record<string, number>> = {};
  private classTotalWords: Record<string, number> = {};
  private totalDocs = 0;

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  public train(samples: { text: string; categoryAccountId: string }[]) {
    this.vocabulary.clear();
    this.classDocCounts = {};
    this.classWordCounts = {};
    this.classTotalWords = {};
    this.totalDocs = samples.length;

    for (const sample of samples) {
      const cat = sample.categoryAccountId;
      const tokens = this.tokenize(sample.text);

      this.classDocCounts[cat] = (this.classDocCounts[cat] || 0) + 1;
      if (!this.classWordCounts[cat]) {
        this.classWordCounts[cat] = {};
        this.classTotalWords[cat] = 0;
      }

      for (const token of tokens) {
        this.vocabulary.add(token);
        this.classWordCounts[cat][token] = (this.classWordCounts[cat][token] || 0) + 1;
        this.classTotalWords[cat] += 1;
      }
    }
  }

  public classify(text: string): { categoryAccountId: string; probability: number }[] {
    const tokens = this.tokenize(text);
    const scores: { categoryAccountId: string; score: number }[] = [];
    const categories = Object.keys(this.classDocCounts);

    if (categories.length === 0 || this.totalDocs === 0 || this.vocabulary.size === 0) return [];

    for (const cat of categories) {
      let logProbability = Math.log(this.classDocCounts[cat] / this.totalDocs);
      const totalWordsInCat = this.classTotalWords[cat] || 0;
      const vocabSize = this.vocabulary.size;

      for (const token of tokens) {
        const count = this.classWordCounts[cat]?.[token] || 0;
        const wordProbability = (count + 1) / (totalWordsInCat + vocabSize);
        logProbability += Math.log(wordProbability);
      }

      scores.push({ categoryAccountId: cat, score: logProbability });
    }

    if (scores.length === 0) return [];

    scores.sort((a, b) => b.score - a.score);
    const maxScore = scores[0].score;

    const exps = scores.map(s => ({
      categoryAccountId: s.categoryAccountId,
      val: Math.exp(s.score - maxScore),
    }));
    const sumExps = exps.reduce((acc, curr) => acc + curr.val, 0);

    return exps
      .map(e => ({
        categoryAccountId: e.categoryAccountId,
        probability: sumExps > 0 ? e.val / sumExps : 0,
      }))
      .slice(0, 3);
  }
}

const SYNONYM_DICTIONARY: Record<string, string> = {
  tea: 'food',
  coffee: 'food',
  cafe: 'food',
  starbucks: 'food',
  restaurant: 'food',
  lunch: 'food',
  dinner: 'food',
  breakfast: 'food',
  swiggy: 'food',
  zomato: 'food',
  groceries: 'groceries',
  supermarket: 'groceries',
  milk: 'groceries',
  vegetables: 'groceries',
  fruits: 'groceries',
  uber: 'transport',
  ola: 'transport',
  taxi: 'transport',
  cab: 'transport',
  metro: 'transport',
  petrol: 'transport',
  fuel: 'transport',
  rent: 'rent',
  electricity: 'utilities',
  water: 'utilities',
  power: 'utilities',
  internet: 'utilities',
  wifi: 'utilities',
  broadband: 'utilities',
  phone: 'utilities',
  recharge: 'utilities',
  salary: 'salary',
  dividend: 'income',
  interest: 'income',
};

export class AccountResolutionService {
  /**
   * Resolves raw hints to source and category accounts.
   */
  async resolve(params: {
    sourceHint?: string;
    destinationHint?: string;
    direction: 'debit' | 'credit' | 'unknown';
    workplaceId: WorkplaceId;
    isReversal?: boolean;
    rawText?: string;
    unconstrained?: boolean; // If true, allows matching sourceHint to category and vice versa
  }): Promise<ResolutionResult> {
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
    const accounts = await accountRepository.findAll(workplaceId);

    // Group active accounts by Asset/Liability (Source) and Income/Expense (Category)
    const assetAccounts = accounts.filter(
      acc => acc.accountType === AccountType.ASSET || acc.accountType === AccountType.LIABILITY,
    );
    const categoryAccounts = accounts.filter(
      acc => acc.accountType === AccountType.EXPENSE || acc.accountType === AccountType.INCOME,
    );

    let resolvedSourceId: AccountId | undefined;
    let resolvedCategoryId: AccountId | undefined;
    let sourceScore = 0;
    let categoryScore = 0;
    let sourceStrategy: ResolutionResult['strategyUsed'] = 'default';
    let categoryStrategy: ResolutionResult['strategyUsed'] = 'default';

    // 1. Fuzzy match for Source Account
    const primarySourceHint = sourceHint || destinationHint;
    if (primarySourceHint && (unconstrained ? accounts : assetAccounts).length > 0) {
      const bestSource = this.fuzzyMatch(
        primarySourceHint,
        unconstrained ? accounts : assetAccounts,
      );
      // If using the fallback hint (destinationHint), require a slightly more conservative threshold (e.g. >= 0.70)
      const threshold = sourceHint ? 0.85 : 0.7;
      if (bestSource && bestSource.score >= threshold) {
        resolvedSourceId = bestSource.account.id as AccountId;
        sourceScore = bestSource.score;
        sourceStrategy = 'fuzzy';
      }
    }

    // 2. Fuzzy match for Category Account
    const primaryCategoryHint = destinationHint || sourceHint;
    if (primaryCategoryHint && (unconstrained ? accounts : categoryAccounts).length > 0) {
      const bestCategory = this.fuzzyMatch(
        primaryCategoryHint,
        unconstrained ? accounts : categoryAccounts,
      );
      // If using the fallback hint (sourceHint), require a slightly more conservative threshold (e.g. >= 0.70)
      const threshold = destinationHint ? 0.85 : 0.7;
      if (bestCategory && bestCategory.score >= threshold) {
        resolvedCategoryId = bestCategory.account.id as AccountId;
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
            const bestSynonymMatch = this.fuzzyMatch(
              synonym,
              unconstrained ? accounts : categoryAccounts,
            );
            if (bestSynonymMatch && bestSynonymMatch.score >= 0.85) {
              resolvedCategoryId = bestSynonymMatch.account.id as AccountId;
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
      return this.buildResult(
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
        const historyResult = await this.resolveFromHistory(
          hint,
          direction,
          workplaceId,
          assetAccounts,
          categoryAccounts,
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
      const trainingSamples = await this.getBayesTrainingData(workplaceId);
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
    const expenseAccounts = categoryAccounts.filter(acc => acc.accountType === AccountType.EXPENSE);
    const incomeAccounts = categoryAccounts.filter(acc => acc.accountType === AccountType.INCOME);

    const defaultCategory =
      direction === 'credit'
        ? incomeAccounts[0]?.id || categoryAccounts[0]?.id || ('' as AccountId)
        : expenseAccounts[0]?.id || categoryAccounts[0]?.id || ('' as AccountId);

    const fallbackSource =
      resolvedSourceId || (unconstrained ? undefined : assetAccounts[0]?.id) || ('' as AccountId);
    const fallbackCategory = (resolvedCategoryId ||
      (unconstrained ? undefined : defaultCategory) ||
      ('' as AccountId)) as AccountId;

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

    return this.buildResult(
      fallbackSource,
      fallbackCategory,
      finalConfidence,
      finalStrategy,
      accounts,
      semanticType,
      isReversal,
    );
  }

  private fuzzyMatch(
    hint: string,
    candidates: Account[],
  ): { account: Account; score: number } | null {
    let bestMatch: { account: Account; score: number } | null = null;
    const cleanHint = hint.toLowerCase().trim();
    const hintWords = cleanHint.split(/[\s,._\-\/]+/).filter(w => w.length > 0);

    for (const account of candidates) {
      const cleanName = account.name.toLowerCase().trim();
      const nameWords = cleanName.split(/[\s,._\-\/]+/).filter(w => w.length > 0);

      // 1. Exact match (Ultimate Tier)
      if (cleanName === cleanHint) {
        return { account, score: 1.0 };
      }

      let score = 0;

      // 2. Starts-with match (Very strong for banks like "HDFC...")
      if (cleanName.startsWith(cleanHint) || cleanHint.startsWith(cleanName)) {
        score = 0.95;
      } else {
        // 3. Exact word subset matches
        const isNameSubset = nameWords.length > 0 && nameWords.every(w => hintWords.includes(w));
        const isHintSubset = hintWords.length > 0 && hintWords.every(w => nameWords.includes(w));

        if (isNameSubset || isHintSubset) {
          score = 0.94;
        } else {
          // 4. Word overlap match with sequence bonus
          const matchingWords = nameWords.filter(w => hintWords.includes(w));
          if (matchingWords.length > 0) {
            const overlapRatio =
              matchingWords.length / Math.max(nameWords.length, hintWords.length);

            // Sequence bonus: Are matching words in the same order?
            let sequenceMatches = 0;
            let lastIdx = -1;
            for (const word of matchingWords) {
              const idx = hintWords.indexOf(word);
              if (idx > lastIdx) {
                sequenceMatches++;
                lastIdx = idx;
              }
            }
            const sequenceRatio = sequenceMatches / matchingWords.length;

            // Combined word score (Base 0.6 + overlap + sequence)
            score = 0.5 + overlapRatio * 0.2 + sequenceRatio * 0.2;
          } else {
            // 5. Fallback to Levenshtein similarity (highly penalized)
            score = getStringSimilarity(cleanHint, cleanName) * 0.6;
          }
        }
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { account, score };
      }
    }

    return bestMatch;
  }

  private async resolveFromHistory(
    keyword: string,
    _direction: 'debit' | 'credit' | 'unknown',
    workplaceId: WorkplaceId,
    assetAccounts: Account[],
    categoryAccounts: Account[],
  ): Promise<{
    sourceAccountId: AccountId;
    categoryAccountId: AccountId;
    confidence: number;
  } | null> {
    const journals = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('description', Q.like(`%${Q.sanitizeLikeString(keyword)}%`)),
        Q.sortBy('journal_date', Q.desc),
        Q.take(15),
      )
      .fetch();

    if (journals.length === 0) return null;

    const journalIds = journals.map(j => j.id);
    const transactions = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch();

    const transactionsByJournal = new Map<string, Transaction[]>();
    transactions.forEach(tx => {
      const list = transactionsByJournal.get(tx.journalId) || [];
      list.push(tx);
      transactionsByJournal.set(tx.journalId, list);
    });

    const sourceFrequency: Record<string, number> = {};
    const categoryFrequency: Record<string, number> = {};
    let matchedCount = 0;

    const assetAccountIds = new Set(assetAccounts.map(a => a.id));
    const categoryAccountIds = new Set(categoryAccounts.map(a => a.id));

    for (const journal of journals) {
      const txs = transactionsByJournal.get(journal.id) || [];
      const sourceTx = txs.find(tx => assetAccountIds.has(tx.accountId));
      const categoryTx = txs.find(tx => categoryAccountIds.has(tx.accountId));

      if (sourceTx) {
        sourceFrequency[sourceTx.accountId] = (sourceFrequency[sourceTx.accountId] || 0) + 1;
      }
      if (categoryTx) {
        categoryFrequency[categoryTx.accountId] =
          (categoryFrequency[categoryTx.accountId] || 0) + 1;
      }
      matchedCount++;
    }

    let bestSourceId: string | null = null;
    let maxSourceCount = 0;
    for (const [id, count] of Object.entries(sourceFrequency)) {
      if (count > maxSourceCount) {
        maxSourceCount = count;
        bestSourceId = id;
      }
    }

    let bestCategoryId: string | null = null;
    let maxCategoryCount = 0;
    for (const [id, count] of Object.entries(categoryFrequency)) {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        bestCategoryId = id;
      }
    }

    if (bestSourceId && bestCategoryId && matchedCount > 0) {
      const avgConfidence = (maxSourceCount / matchedCount + maxCategoryCount / matchedCount) / 2;
      return {
        sourceAccountId: bestSourceId as AccountId,
        categoryAccountId: bestCategoryId as AccountId,
        confidence: avgConfidence,
      };
    }

    return null;
  }

  private async getBayesTrainingData(
    workplaceId: WorkplaceId,
  ): Promise<{ text: string; categoryAccountId: string }[]> {
    const journals = await database.collections
      .get<Journal>('journals')
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', 'POSTED'),
        Q.sortBy('journal_date', Q.desc),
        Q.take(500),
      )
      .fetch();

    if (journals.length === 0) return [];

    const trainingSamples: { text: string; categoryAccountId: string }[] = [];
    const journalIds = journals.map(j => j.id);

    const transactions = await database.collections
      .get<Transaction>('transactions')
      .query(Q.where('journal_id', Q.oneOf(journalIds)), Q.where('deleted_at', Q.eq(null)))
      .fetch();

    const transactionsByJournal = new Map<string, Transaction[]>();
    const accountIds = new Set<string>();
    transactions.forEach(tx => {
      const list = transactionsByJournal.get(tx.journalId) || [];
      list.push(tx);
      transactionsByJournal.set(tx.journalId, list);
      accountIds.add(tx.accountId);
    });

    const accounts = await database.collections
      .get<Account>('accounts')
      .query(Q.where('id', Q.oneOf(Array.from(accountIds))))
      .fetch();
    const categoryAccounts = new Set(
      accounts
        .filter(
          acc => acc.accountType === AccountType.EXPENSE || acc.accountType === AccountType.INCOME,
        )
        .map(acc => acc.id),
    );

    for (const journal of journals) {
      if (!journal.description) continue;
      const txs = transactionsByJournal.get(journal.id) || [];
      const catTx = txs.find(tx => categoryAccounts.has(tx.accountId));
      if (catTx) {
        trainingSamples.push({
          text: journal.description,
          categoryAccountId: catTx.accountId,
        });
      }
    }

    return trainingSamples;
  }

  private buildResult(
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
}

export const accountResolutionService = new AccountResolutionService();
