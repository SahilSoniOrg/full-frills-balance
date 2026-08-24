import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import type {
  JournalAutofillSuggestion,
  JournalEnrichmentRow,
} from '@/src/data/repositories/journal/journalEnrichmentTypes';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

export function computeDominantTargetAccount(
  accountEntries: {
    accountId: AccountId;
    accountName: string;
    accountType: AccountType;
    count: number;
  }[],
  dominantThreshold: number = 0.8,
): {
  targetAccountId?: AccountId;
  targetAccountName?: string;
  targetAccountType?: AccountType;
} {
  if (accountEntries.length === 0) return {};

  // First prioritize category accounts (EXPENSE or INCOME)
  const categoryAccounts = accountEntries.filter(
    a => a.accountType === AccountType.EXPENSE || a.accountType === AccountType.INCOME,
  );

  const candidatePool = categoryAccounts.length > 0 ? categoryAccounts : accountEntries;
  const totalCount = candidatePool.reduce((sum, a) => sum + a.count, 0);
  if (totalCount === 0) return {};

  const sorted = [...candidatePool].sort((a, b) => b.count - a.count);
  const top = sorted[0];

  const isDominant =
    sorted.length === 1 ||
    (top.count / totalCount >= dominantThreshold &&
      (sorted.length === 1 || top.count > (sorted[1]?.count ?? 0)));

  if (isDominant) {
    return {
      targetAccountId: top.accountId,
      targetAccountName: top.accountName,
      targetAccountType: top.accountType,
    };
  }

  return {};
}

/** Read-side enrichment and suggestion queries for journals (raw SQL + ORM fallbacks). */
export class JournalEnrichmentQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  async getRecentUniqueDescriptions(
    workplaceId: WorkplaceId,
    limit: number = 500,
  ): Promise<JournalAutofillSuggestion[]> {
    return this.getRecentSuggestionsWithTargetAccounts(workplaceId, limit);
  }

  async getRecentSuggestionsWithTargetAccounts(
    workplaceId: WorkplaceId,
    limit: number = 500,
  ): Promise<JournalAutofillSuggestion[]> {
    const sql = `
      WITH recent_descriptions AS (
        SELECT
          description,
          COUNT(*) as journal_count,
          MAX(journal_date) as latest_date
        FROM journals
        WHERE workplace_id = ?
          AND deleted_at IS NULL
          AND description IS NOT NULL
          AND description != ''
        GROUP BY description
        ORDER BY latest_date DESC
        LIMIT ?
      )
      SELECT
        d.description as description,
        d.journal_count as journal_count,
        d.latest_date as latest_date,
        t.account_id as account_id,
        a.name as account_name,
        a.account_type as account_type,
        COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN j.id END) as account_usage_count,
        MAX(j.journal_date) as account_latest_date
      FROM recent_descriptions d
      JOIN journals j ON j.description = d.description
        AND j.workplace_id = ?
        AND j.deleted_at IS NULL
      LEFT JOIN transactions t ON t.journal_id = j.id
        AND t.workplace_id = ?
        AND t.deleted_at IS NULL
      LEFT JOIN accounts a ON a.id = t.account_id
        AND a.workplace_id = ?
        AND a.deleted_at IS NULL
      GROUP BY d.description, d.journal_count, d.latest_date,
        t.account_id, a.name, a.account_type
      ORDER BY d.latest_date DESC, account_usage_count DESC
    `;

    try {
      const results = await transactionRawRepository.queryRaw<{
        description: string;
        journal_count: number;
        account_id: AccountId | null;
        account_name: string | null;
        account_type: AccountType | null;
        account_usage_count: number;
        account_latest_date: number | null;
        latest_date: number;
      }>(sql, [workplaceId, limit, workplaceId, workplaceId, workplaceId]);

      if (!results) {
        return this.getRecentSuggestionsFallback(workplaceId, limit);
      }

      // Group rows by description preserving order of latest_date
      const groups = new Map<
        string,
        {
          description: string;
          journalCount: number;
          accounts: {
            accountId: AccountId;
            accountName: string;
            accountType: AccountType;
            count: number;
            latestDate: number;
          }[];
        }
      >();

      for (const row of results) {
        if (!row.description) continue;
        let group = groups.get(row.description);
        if (!group) {
          group = {
            description: row.description,
            journalCount: Number(row.journal_count) || 0,
            accounts: [],
          };
          groups.set(row.description, group);
        }
        if (row.account_id && row.account_name && row.account_type) {
          group.accounts.push({
            accountId: row.account_id,
            accountName: row.account_name,
            accountType: row.account_type,
            count: Number(row.account_usage_count) || 0,
            latestDate: Number(row.account_latest_date) || 0,
          });
        }
      }

      const suggestions: JournalAutofillSuggestion[] = [];
      for (const group of groups.values()) {
        const accounts = [...group.accounts].sort(
          (a, b) => b.latestDate - a.latestDate || b.count - a.count,
        );

        if (accounts.length === 0) {
          suggestions.push({
            description: group.description,
            count: group.journalCount,
          });
        } else {
          for (const account of accounts) {
            suggestions.push({
              description: group.description,
              count: group.journalCount,
              targetAccountId: account.accountId,
              targetAccountName: account.accountName,
              targetAccountType: account.accountType,
            });
            if (suggestions.length >= limit) break;
          }
        }
        if (suggestions.length >= limit) break;
      }

      return suggestions;
    } catch (error) {
      logger.error(
        '[JournalEnrichmentQueries] getRecentSuggestionsWithTargetAccounts failed',
        error,
      );
      return [];
    }
  }

  private async getRecentSuggestionsFallback(
    workplaceId: WorkplaceId,
    limit: number,
  ): Promise<JournalAutofillSuggestion[]> {
    const journals = await this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('description', Q.notEq(null)),
        Q.where('description', Q.notEq('')),
        Q.sortBy('journal_date', 'desc'),
        Q.take(limit * 2),
      )
      .fetch();

    const descJournalMap = new Map<string, Journal[]>();
    for (const j of journals) {
      if (!j.description) continue;
      const list = descJournalMap.get(j.description) || [];
      list.push(j);
      descJournalMap.set(j.description, list);
    }

    const allJournalIds = journals.map(j => j.id);
    const transactions =
      allJournalIds.length === 0
        ? []
        : await this.transactions
            .query(
              Q.where('journal_id', Q.oneOf(allJournalIds)),
              Q.where('workplace_id', workplaceId),
              Q.where('deleted_at', Q.eq(null)),
            )
            .fetch();
    const accountIds = [...new Set(transactions.map(tx => tx.accountId))];
    const accounts =
      accountIds.length === 0
        ? []
        : await database.collections
            .get<Account>('accounts')
            .query(
              Q.where('id', Q.oneOf(accountIds)),
              Q.where('workplace_id', workplaceId),
              Q.where('deleted_at', Q.eq(null)),
            )
            .fetch();
    const accountsById = new Map(accounts.map(account => [account.id, account]));
    const descriptionByJournalId = new Map<string, string>();
    for (const journal of journals) {
      if (journal.description) descriptionByJournalId.set(journal.id, journal.description);
    }
    const accountJournalsByDescription = new Map<string, Map<AccountId, Set<string>>>();

    for (const tx of transactions) {
      const description = descriptionByJournalId.get(tx.journalId);
      if (!description || !accountsById.has(tx.accountId)) continue;
      let accountJournals = accountJournalsByDescription.get(description);
      if (!accountJournals) {
        accountJournals = new Map();
        accountJournalsByDescription.set(description, accountJournals);
      }
      let journalIdsForAccount = accountJournals.get(tx.accountId);
      if (!journalIdsForAccount) {
        journalIdsForAccount = new Set();
        accountJournals.set(tx.accountId, journalIdsForAccount);
      }
      journalIdsForAccount.add(tx.journalId);
    }

    const suggestions: JournalAutofillSuggestion[] = [];
    for (const [description, jList] of descJournalMap.entries()) {
      const accountEntries = [
        ...(accountJournalsByDescription.get(description)?.entries() ?? []),
      ].map(([accountId, journalIds]) => {
        const account = accountsById.get(accountId)!;
        return {
          accountId,
          accountName: account.name,
          accountType: account.accountType,
          count: journalIds.size,
        };
      });
      if (accountEntries.length === 0) {
        suggestions.push({ description, count: jList.length });
      } else {
        const accounts = [...accountEntries].sort((a, b) => b.count - a.count);
        for (const account of accounts) {
          suggestions.push({
            description,
            count: jList.length,
            targetAccountId: account.accountId,
            targetAccountName: account.accountName,
            targetAccountType: account.accountType,
          });
          if (suggestions.length >= limit) break;
        }
      }
      if (suggestions.length >= limit) break;
    }

    return suggestions;
  }

  async getEnrichmentDataRaw(
    workplaceId: WorkplaceId,
    journalIds: string[],
  ): Promise<JournalEnrichmentRow[]> {
    if (journalIds.length === 0) return [];

    const placeholders = journalIds.map(() => '?').join(',');
    const sql = `
      SELECT 
        t.journal_id as journal_id, 
        t.account_id as account_id, 
        t.amount as amount, 
        t.transaction_type as transaction_type, 
        a.name as account_name, 
        a.account_type as account_type, 
        a.icon as account_icon
      FROM journals j
      JOIN transactions t ON t.journal_id = j.id
      JOIN accounts a ON t.account_id = a.id
      WHERE j.workplace_id = ?
        AND t.workplace_id = ?
        AND a.workplace_id = ?
        AND j.id IN (${placeholders})
        AND t.deleted_at IS NULL
      ORDER BY t.journal_id, t.account_id
    `;

    const results = await transactionRawRepository.queryRaw<JournalEnrichmentRow>(sql, [
      workplaceId,
      workplaceId,
      workplaceId,
      ...journalIds,
    ]);
    if (results !== null) {
      return results;
    }

    const journals = await this.journals
      .query(Q.where('id', Q.oneOf(journalIds)), Q.where('workplace_id', workplaceId))
      .fetch();
    const enriched: JournalEnrichmentRow[] = [];

    for (const journal of journals) {
      const txs = await this.transactions
        .query(
          Q.where('journal_id', journal.id),
          Q.where('workplace_id', workplaceId),
          Q.where('deleted_at', Q.eq(null)),
        )
        .fetch();

      for (const tx of txs) {
        const [account] = await database.collections
          .get<Account>('accounts')
          .query(Q.where('id', tx.accountId), Q.where('workplace_id', workplaceId))
          .fetch();
        if (account) {
          enriched.push({
            journal_id: journal.id,
            account_id: tx.accountId,
            amount: tx.amount,
            transaction_type: tx.transactionType,
            account_name: account.name,
            account_type: account.accountType,
            account_icon: account.icon,
          });
        }
      }
    }

    return enriched;
  }
}

export const journalEnrichmentQueries = new JournalEnrichmentQueries();
