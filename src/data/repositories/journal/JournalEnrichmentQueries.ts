import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import type {
  JournalSuggestion,
  JournalSuggestionPage,
  JournalSuggestionAccount,
} from '@/src/types/journalSuggestions';
import type { JournalEnrichmentRow } from '@/src/data/repositories/journal/journalEnrichmentTypes';
import {
  isSuggestionPageCompatible,
  isSuggestionTransactionCompatible,
} from '@/src/domain/journal/journalSuggestionRules';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountType, TransactionType } from '@/src/types/enums';
import type { TabType } from '@/src/types/domainJournal';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';

type JournalSuggestionRouteRow = {
  description: string;
  journal_id: string;
  journal_date: number;
  transaction_type: TransactionType;
  account_id: AccountId;
  account_name: string;
  account_type: AccountType;
};

function buildJournalSuggestions(
  rows: JournalSuggestionRouteRow[],
  page: JournalSuggestionPage,
  tabType: TabType | undefined,
  limit: number,
): JournalSuggestion[] {
  const journals = new Map<
    string,
    {
      description: string;
      journalDate: number;
      sources: Map<AccountId, JournalSuggestionAccount>;
      destinations: Map<AccountId, JournalSuggestionAccount>;
    }
  >();

  for (const row of rows) {
    const journalKey = row.journal_id;
    const journal = journals.get(journalKey) ?? {
      description: row.description,
      journalDate: Number(row.journal_date) || 0,
      sources: new Map<AccountId, JournalSuggestionAccount>(),
      destinations: new Map<AccountId, JournalSuggestionAccount>(),
    };
    const account = { id: row.account_id, name: row.account_name, type: row.account_type };
    const side =
      row.transaction_type === TransactionType.CREDIT ? journal.sources : journal.destinations;
    side.set(account.id, account);
    journals.set(journalKey, journal);
  }

  const patterns = new Map<string, JournalSuggestion>();
  for (const journal of journals.values()) {
    const sources = [...journal.sources.values()].sort((a, b) => a.id.localeCompare(b.id));
    const destinations = [...journal.destinations.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const route = { sources, destinations };
    if (!isSuggestionPageCompatible(route, page)) continue;
    if (!isSuggestionTransactionCompatible(route, tabType)) continue;

    const routeKey = JSON.stringify([
      journal.description.trim(),
      sources.map(account => account.id),
      destinations.map(account => account.id),
    ]);
    const previous = patterns.get(routeKey);
    const count = (previous?.history.count ?? 0) + 1;
    patterns.set(routeKey, {
      key: routeKey,
      description: journal.description,
      route: { sources, destinations },
      history: {
        count,
        lastUsedAt: Math.max(previous?.history.lastUsedAt ?? 0, journal.journalDate),
      },
    });
  }

  return [...patterns.values()]
    .sort(
      (a, b) => b.history.lastUsedAt - a.history.lastUsedAt || b.history.count - a.history.count,
    )
    .slice(0, limit || undefined);
}

/** Read-side enrichment and suggestion queries for journals (raw SQL + ORM fallbacks). */
export class JournalEnrichmentQueries {
  private get journals() {
    return database.collections.get<Journal>('journals');
  }

  private get transactions() {
    return database.collections.get<Transaction>('transactions');
  }

  async findJournalSuggestions(params: {
    workplaceId: WorkplaceId;
    query: string;
    page: JournalSuggestionPage;
    transactionType?: TabType;
    limit: number;
  }): Promise<JournalSuggestion[]> {
    const { workplaceId, page, transactionType } = params;
    const query = params.query.trim();
    const boundedLimit = params.limit === 0 ? 0 : Math.max(1, Math.min(50, params.limit));
    const descriptionPattern = `%${query}%`;
    const statusPlaceholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(', ');
    const sql = `
      WITH recent_descriptions AS (
        SELECT description, MAX(journal_date) as latest_date
        FROM journals
        WHERE workplace_id = ?
          AND deleted_at IS NULL
          AND status IN (${statusPlaceholders})
          AND description IS NOT NULL
          AND description != ''
          AND LOWER(description) LIKE LOWER(?)
        GROUP BY description
        ORDER BY latest_date DESC
        ${boundedLimit > 0 ? 'LIMIT ?' : ''}
      )
      SELECT
        j.description as description,
        j.id as journal_id,
        j.journal_date as journal_date,
        t.transaction_type as transaction_type,
        a.id as account_id,
        a.name as account_name,
        a.account_type as account_type
      FROM recent_descriptions d
      JOIN journals j ON j.description = d.description
        AND j.workplace_id = ?
        AND j.deleted_at IS NULL
        AND j.status IN (${statusPlaceholders})
      JOIN transactions t ON t.journal_id = j.id
        AND t.workplace_id = j.workplace_id
        AND t.deleted_at IS NULL
      JOIN accounts a ON a.id = t.account_id
        AND a.workplace_id = j.workplace_id
        AND a.deleted_at IS NULL
      ORDER BY j.journal_date DESC, j.id, t.transaction_type, t.account_id
    `;

    try {
      const results = await rawSqlExecutor.query<JournalSuggestionRouteRow>(sql, [
        workplaceId,
        ...ACTIVE_JOURNAL_STATUSES,
        descriptionPattern,
        ...(boundedLimit > 0 ? [boundedLimit] : []),
        workplaceId,
        ...ACTIVE_JOURNAL_STATUSES,
      ]);

      if (!results) {
        return this.getRecentSuggestionsFallback(
          workplaceId,
          query,
          page,
          transactionType,
          boundedLimit,
        );
      }
      return buildJournalSuggestions(results, page, transactionType, boundedLimit);
    } catch (error) {
      logger.error('[JournalEnrichmentQueries] findJournalSuggestions failed', error);
      return [];
    }
  }

  private async getRecentSuggestionsFallback(
    workplaceId: WorkplaceId,
    query: string,
    page: JournalSuggestionPage,
    tabType: TabType | undefined,
    limit: number,
  ): Promise<JournalSuggestion[]> {
    const journals = await this.journals
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
        Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
        Q.where('description', Q.notEq(null)),
        Q.where('description', Q.notEq('')),
        ...(query ? [Q.where('description', Q.like(`%${query}%`))] : []),
        Q.sortBy('journal_date', 'desc'),
        ...(limit > 0 ? [Q.take(limit * 4)] : []),
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
    const transactionsByJournal = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const rows = transactionsByJournal.get(tx.journalId) ?? [];
      rows.push(tx);
      transactionsByJournal.set(tx.journalId, rows);
    }

    const suggestionRows: JournalSuggestionRouteRow[] = [];
    for (const [description, jList] of descJournalMap.entries()) {
      for (const journal of jList) {
        const journalTransactions = transactionsByJournal.get(journal.id) ?? [];
        for (const tx of journalTransactions) {
          const account = accountsById.get(tx.accountId);
          if (!account) continue;
          suggestionRows.push({
            description,
            journal_id: journal.id,
            journal_date: journal.journalDate,
            transaction_type: tx.transactionType,
            account_id: account.id,
            account_name: account.name,
            account_type: account.accountType,
          });
        }
      }
    }

    return buildJournalSuggestions(suggestionRows, page, tabType, limit);
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
        a.currency_code as account_currency_code,
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

    const results = await rawSqlExecutor.query<JournalEnrichmentRow>(sql, [
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
            account_currency_code: account.currencyCode,
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
