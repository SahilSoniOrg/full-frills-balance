import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  AccountId,
  JournalId,
  WorkplaceId,
  AccountType,
  TransactionType,
} from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

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
  ): Promise<{ description: string; count: number }[]> {
    const sql = `
      SELECT description, COUNT(*) as usage_count
      FROM journals
      WHERE workplace_id = ?
        AND deleted_at IS NULL
        AND description IS NOT NULL
        AND description != ''
      GROUP BY description
      ORDER BY MAX(journal_date) DESC
      LIMIT ?
    `;

    try {
      const results = await transactionRawRepository.queryRaw<{
        description: string;
        usage_count: number;
      }>(sql, [workplaceId, limit]);

      if (!results) {
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

        const counts = new Map<string, number>();
        for (const j of journals) {
          if (j.description) {
            counts.set(j.description, (counts.get(j.description) || 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .map(([description, count]) => ({ description, count }))
          .slice(0, limit);
      }

      return results.map(r => ({
        description: r.description,
        count: r.usage_count,
      }));
    } catch (error) {
      logger.error('[JournalEnrichmentQueries] getRecentUniqueDescriptions failed', error);
      return [];
    }
  }

  async getEnrichmentDataRaw(journalIds: string[]): Promise<
    {
      journal_id: JournalId;
      account_id: AccountId;
      amount: number;
      transaction_type: TransactionType;
      account_name: string;
      account_type: AccountType;
      account_icon?: string;
    }[]
  > {
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
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE t.journal_id IN (${placeholders}) AND t.deleted_at IS NULL
    `;

    type EnrichmentRow = {
      journal_id: JournalId;
      account_id: AccountId;
      amount: number;
      transaction_type: TransactionType;
      account_name: string;
      account_type: AccountType;
      account_icon?: string;
    };

    const results = await transactionRawRepository.queryRaw<EnrichmentRow>(sql, journalIds);
    if (results !== null) {
      return results;
    }

    const journals = await this.journals.query(Q.where('id', Q.oneOf(journalIds))).fetch();
    const enriched: {
      journal_id: JournalId;
      account_id: AccountId;
      amount: number;
      transaction_type: TransactionType;
      account_name: string;
      account_type: AccountType;
      account_icon?: string;
    }[] = [];

    for (const journal of journals) {
      const txs = await this.transactions
        .query(Q.where('journal_id', journal.id), Q.where('deleted_at', Q.eq(null)))
        .fetch();

      for (const tx of txs) {
        try {
          const account = await database.collections.get<Account>('accounts').find(tx.accountId);
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
        } catch {
          // Account might be deleted/missing in tests
        }
      }
    }

    return enriched;
  }
}

export const journalEnrichmentQueries = new JournalEnrichmentQueries();
