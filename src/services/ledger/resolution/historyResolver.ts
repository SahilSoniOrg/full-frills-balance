import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { Q } from '@nozbe/watermelondb';

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
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('journal_id', Q.oneOf(journalIds)),
      Q.where('deleted_at', Q.eq(null)),
    )
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
    .query(
      Q.where('workplace_id', workplaceId),
      Q.where('journal_id', Q.oneOf(journalIds)),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();

  const transactionsByJournal = new Map<string, Transaction[]>();
  const accountIds = new Set<string>();
  transactions.forEach(tx => {
    const list = transactionsByJournal.get(tx.journalId) || [];
    list.push(tx);
    transactionsByJournal.set(tx.journalId, list);
    accountIds.add(tx.accountId);
  });

  if (accountIds.size === 0) return [];

  const accounts = await database.collections
    .get<Account>('accounts')
    .query(Q.where('workplace_id', workplaceId), Q.where('id', Q.oneOf(Array.from(accountIds))))
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
