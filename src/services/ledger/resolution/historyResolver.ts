import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';

export interface HistoryResolutionResult {
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  confidence: number;
}

export async function resolveFromHistory(
  keyword: string,
  _direction: 'debit' | 'credit' | 'unknown',
  workplaceId: WorkplaceId,
  assetAccounts: Account[],
  categoryAccounts: Account[],
): Promise<HistoryResolutionResult | null> {
  const journals = await journalQueryRepository.findRecentByDescription(workplaceId, keyword, 15);

  if (journals.length === 0) return null;

  const journalIds = journals.map(j => j.id);
  const transactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);

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
      categoryFrequency[categoryTx.accountId] = (categoryFrequency[categoryTx.accountId] || 0) + 1;
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

export async function getBayesTrainingData(
  workplaceId: WorkplaceId,
): Promise<{ text: string; categoryAccountId: string }[]> {
  const journals = await journalQueryRepository.findRecentPosted(workplaceId, 500);

  if (journals.length === 0) return [];

  const trainingSamples: { text: string; categoryAccountId: string }[] = [];
  const journalIds = journals.map(j => j.id);

  const transactions = await transactionQueryRepository.findByJournals(workplaceId, journalIds);

  const transactionsByJournal = new Map<string, Transaction[]>();
  const accountIds = new Set<AccountId>();
  transactions.forEach(tx => {
    const list = transactionsByJournal.get(tx.journalId) || [];
    list.push(tx);
    transactionsByJournal.set(tx.journalId, list);
    accountIds.add(tx.accountId);
  });

  if (accountIds.size === 0) return [];

  const accounts = await accountQueryRepository.findAllByIds(workplaceId, Array.from(accountIds));
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
