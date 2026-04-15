import { database } from '@/src/data/database/Database';
import Account, {
  AccountSubtype,
  AccountType,
  getDefaultSubtypeForType,
  isAccountSubtype,
  isAccountType,
  isSubtypeAllowedForType,
} from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import Transaction from '@/src/data/models/Transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import {
  getPeriodDecreaseSQLSnippet,
  getPeriodIncreaseSQLSnippet,
} from '@/src/utils/accountingHelpers';
import { ValidationError } from '@/src/utils/errors';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';
import { logger } from '@/src/utils/logger';
import { Q } from '@nozbe/watermelondb';
import { map, of } from 'rxjs';
import { supportsRawSql } from '../database/DatabaseUtils';

export interface AccountPersistenceInput {
  name: string;
  accountType: AccountType;
  accountSubtype?: AccountSubtype;
  currencyCode: string;
  description?: string;
  icon?: string;
  orderNum?: number;
  reconciledAt?: Date;
  parentAccountId?: string;
  metadata?: Partial<{
    statementDay: number;
    dueDay: number;
    minimumPaymentAmount: number;
    minimumBalanceAmount: number;
    creditLimitAmount: number;
    aprBps: number;
    emiDay: number;
    loanTenureMonths: number;
    autopayEnabled: boolean;
    gracePeriodDays: number;
    payFromAccountId: string;
    notes: string;
  }>;
}

export interface AccountListItemRaw {
  id: string;
  name: string;
  account_type: AccountType;
  account_subtype: AccountSubtype;
  currency_code: string;
  icon?: string;
  parent_account_id?: string;
  direct_balance: number;
  direct_transaction_count: number;
  periodIncrease: number;
  periodDecrease: number;
}

/**
 * Internal interface for raw query results matching the SQL schema.
 */
interface RawAccountRow {
  id: string;
  name: string;
  account_type: string;
  account_subtype?: string;
  currency_code: string;
  icon?: string;
  parent_account_id?: string;
  direct_balance: number;
  direct_transaction_count: number;
  periodIncrease: number;
  periodDecrease: number;
}

export class AccountRepository {
  private get db() {
    return database;
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts');
  }

  private get metadata() {
    return this.db.collections.get<AccountMetadata>('account_metadata');
  }

  // Memoization cache for child list lookups (O(N) -> O(1) on repeat calls)
  private descendantMapCache = new WeakMap<Account[], Map<string, string[]>>();

  /**
   * Reactive Observation Methods
   */

  observeAll() {
    return this.accounts
      .query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('order_num', Q.asc))
      .observeWithColumns([
        'account_type',
        'account_subtype',
        'name',
        'order_num',
        'currency_code',
        'icon',
        'description',
        'parent_account_id',
        'deleted_at',
        'updated_at',
      ]);
  }

  observeByType(accountType: string) {
    const query = this.accounts.query(
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc),
    );
    return query.observeWithColumns([
      'name',
      'account_subtype',
      'order_num',
      'currency_code',
      'icon',
      'description',
      'parent_account_id',
      'deleted_at',
    ]);
  }

  observeByIds(accountIds: string[]) {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    return this.accounts
      .query(Q.where('id', Q.oneOf(accountIds)), Q.where('deleted_at', Q.eq(null)))
      .observeWithColumns([
        'name',
        'account_type',
        'account_subtype',
        'currency_code',
        'order_num',
        'icon',
        'description',
        'parent_account_id',
        'deleted_at',
      ]);
  }

  observeById(accountId: string) {
    return this.accounts
      .findAndObserve(accountId)
      .pipe(map(account => (account.deletedAt ? null : account)));
  }

  /**
   * Observe all active transactions for an account.
   * Used for reactive in-memory balance calculation.
   */
  observeTransactionsForBalance(accountId: string) {
    return database.collections
      .get<Transaction>('transactions')
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null)),
        ]),
      )
      .observe();
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(id: string): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      return account.deletedAt ? null : account;
    } catch {
      return null;
    }
  }

  async findWithDeleted(id: string): Promise<Account | null> {
    try {
      return await this.accounts.find(id);
    } catch {
      return null;
    }
  }

  async findMetadata(accountId: string): Promise<AccountMetadata | null> {
    try {
      const records = await this.metadata.query(Q.where('account_id', accountId)).fetch();
      return records[0] || null;
    } catch {
      return null;
    }
  }

  async findMetadataByAccountIds(accountIds: string[]): Promise<AccountMetadata[]> {
    if (accountIds.length === 0) return [];
    return await this.metadata.query(Q.where('account_id', Q.oneOf(accountIds))).fetch();
  }

  async findAllByIds(ids: string[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    return this.accounts
      .query(Q.where('id', Q.oneOf(ids)), Q.where('deleted_at', Q.eq(null)))
      .fetch();
  }

  async findByName(name: string): Promise<Account | null> {
    const accounts = await this.accounts
      .query(Q.and(Q.where('name', name), Q.where('deleted_at', Q.eq(null))))
      .fetch();
    return accounts[0] || null;
  }

  async findAll(): Promise<Account[]> {
    return this.accounts
      .query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('order_num', Q.asc))
      .fetch();
  }

  async findByType(accountType: AccountType): Promise<Account[]> {
    return this.accounts
      .query(
        Q.where('account_type', accountType),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc),
      )
      .fetch();
  }

  async exists(): Promise<boolean> {
    const count = await this.accounts.query(Q.where('deleted_at', Q.eq(null))).fetchCount();
    return count > 0;
  }

  async countNonDeleted(): Promise<number> {
    return this.accounts.query(Q.where('deleted_at', Q.eq(null))).fetchCount();
  }

  observeByIdsWithDeleted(accountIds: string[]) {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    return this.accounts
      .query(Q.where('id', Q.oneOf(accountIds)))
      .observeWithColumns([
        'name',
        'account_type',
        'account_subtype',
        'currency_code',
        'reconciled_at',
        'parent_account_id',
        'deleted_at',
      ]);
  }

  async seedDefaults(defaults: AccountPersistenceInput[]): Promise<void> {
    const normalizedDefaults = defaults.map(entry => ({
      ...entry,
      accountSubtype: entry.accountSubtype ?? getDefaultSubtypeForType(entry.accountType),
    }));
    normalizedDefaults.forEach(entry =>
      this.validateSubtype(entry.accountType, entry.accountSubtype),
    );
    await this.db.write(async () => {
      const creates = normalizedDefaults.map(data =>
        this.accounts.prepareCreate(account => {
          Object.assign(account, data);
          account.createdAt = new Date();
          account.updatedAt = new Date();
        }),
      );
      if (creates.length > 0) {
        await this.db.batch(...creates);
      }
    });
  }

  async create(data: AccountPersistenceInput): Promise<Account> {
    await this.ensureUniqueName(data.name);
    const payload: AccountPersistenceInput = {
      ...data,
      accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType),
    };
    this.validateSubtype(payload.accountType, payload.accountSubtype);

    return await this.db.write(async () => {
      const account = await this.accounts.create(acc => {
        const { metadata, ...accountData } = payload;
        Object.assign(acc, accountData);
        // metadata is not a field on Account model
        acc.createdAt = new Date();
        acc.updatedAt = new Date();
      });

      if (data.metadata) {
        await this.metadata.create(meta => {
          Object.assign(meta, data.metadata);
          meta.account.set(account);
          meta.createdAt = new Date();
          meta.updatedAt = new Date();
        });
      }

      return account;
    });
  }

  async update(account: Account, updates: Partial<AccountPersistenceInput>): Promise<Account> {
    if (updates.name && updates.name !== account.name) {
      await this.ensureUniqueName(updates.name, account.id);
    }
    const normalizedUpdates: Partial<AccountPersistenceInput> = { ...updates };
    if (normalizedUpdates.accountType && normalizedUpdates.accountSubtype === undefined) {
      normalizedUpdates.accountSubtype = isSubtypeAllowedForType(
        normalizedUpdates.accountType,
        account.accountSubtype,
      )
        ? account.accountSubtype
        : getDefaultSubtypeForType(normalizedUpdates.accountType);
    }

    const nextType = normalizedUpdates.accountType ?? account.accountType;
    const nextSubtype = normalizedUpdates.accountSubtype ?? account.accountSubtype;
    this.validateSubtype(nextType, nextSubtype);

    return await this.db.write(async () => {
      await account.update(acc => {
        const { metadata, ...accountUpdates } = normalizedUpdates;
        Object.assign(acc, accountUpdates);
        acc.updatedAt = new Date();
      });

      if (updates.metadata) {
        const existingMetadata = await this.findMetadata(account.id);
        if (existingMetadata) {
          await existingMetadata.update(meta => {
            Object.assign(meta, updates.metadata);
            meta.updatedAt = new Date();
          });
        } else {
          await this.metadata.create(meta => {
            Object.assign(meta, updates.metadata);
            meta.account.set(account);
            meta.createdAt = new Date();
            meta.updatedAt = new Date();
          });
        }
      }

      return account;
    });
  }

  async delete(account: Account): Promise<void> {
    await this.db.write(async () => {
      await account.update(record => {
        record.deletedAt = new Date();
        record.updatedAt = new Date();
      });
    });
  }

  /**
   * Returns all descendant account IDs for the given account.
   *
   * M-5 fix: pass `allAccounts` if you already have the full list to avoid N+1 DB
   * queries. When omitted the old recursive-fetch behaviour is preserved.
   */
  async getDescendantIds(accountId: string, allAccounts?: Account[]): Promise<string[]> {
    if (allAccounts) {
      // In-memory BFS — O(n), zero DB round-trips.
      return this.getDescendantIdsFromList(accountId, allAccounts);
    }

    // Legacy path: fetch each level from the DB (retained for backward compat).
    const children = await this.accounts
      .query(Q.where('parent_account_id', accountId), Q.where('deleted_at', Q.eq(null)))
      .fetch();

    let ids = children.map(c => c.id);
    for (const child of children) {
      const descendantIds = await this.getDescendantIds(child.id);
      ids = [...ids, ...descendantIds];
    }
    return ids;
  }

  /**
   * Pure in-memory BFS traversal given a pre-fetched flat account list.
   * Zero DB queries — call this whenever you already have all accounts in memory.
   */
  getDescendantIdsFromList(accountId: string, allAccounts: Account[]): string[] {
    let childrenMap = this.descendantMapCache.get(allAccounts);

    if (!childrenMap) {
      childrenMap = new Map<string, string[]>();
      for (const acc of allAccounts) {
        if (acc.parentAccountId && !acc.deletedAt) {
          const arr = childrenMap.get(acc.parentAccountId) ?? [];
          arr.push(acc.id);
          childrenMap.set(acc.parentAccountId, arr);
        }
      }
      this.descendantMapCache.set(allAccounts, childrenMap);
    }

    const result: string[] = [];
    const queue: string[] = [accountId];
    const visited = new Set<string>([accountId]); // Cycle protection
    let head = 0; // O(1) queue processing

    while (head < queue.length) {
      const current = queue[head++]!;
      const children = childrenMap.get(current) ?? [];
      for (const childId of children) {
        if (!visited.has(childId)) {
          visited.add(childId);
          result.push(childId);
          queue.push(childId);
        }
      }
    }
    return result;
  }

  async hasChildren(accountId: string): Promise<boolean> {
    const count = await this.accounts
      .query(Q.where('parent_account_id', accountId), Q.where('deleted_at', Q.eq(null)))
      .fetchCount();
    return count > 0;
  }

  observeHasChildren(accountId: string) {
    return this.accounts
      .query(Q.where('parent_account_id', accountId), Q.where('deleted_at', Q.eq(null)))
      .observe()
      .pipe(map(children => children.length > 0));
  }

  observeSubAccountCount(accountId: string) {
    return this.accounts
      .query(Q.where('parent_account_id', accountId), Q.where('deleted_at', Q.eq(null)))
      .observeCount();
  }

  queryByParentId(parentId: string) {
    return this.accounts.query(
      Q.where('parent_account_id', parentId),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc),
    );
  }

  private async ensureUniqueName(name: string, excludeId?: string): Promise<void> {
    const sanitizedName = name.trim();

    // App-level secondary check for user convenience.
    // Note: Database integrity should still be enforced by unique indices where possible.
    const potentialDuplicates = await this.accounts
      .query(
        Q.where('name', Q.like(Q.sanitizeLikeString(sanitizedName))),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    const duplicate = potentialDuplicates.find(account => {
      if (excludeId && account.id === excludeId) return false;
      return account.name.trim().toLowerCase() === sanitizedName.toLowerCase();
    });

    if (duplicate) {
      throw new ValidationError(`Account with name "${name}" already exists`);
    }
  }

  private validateSubtype(accountType: AccountType, subtype?: AccountSubtype): void {
    if (!isSubtypeAllowedForType(accountType, subtype)) {
      throw new ValidationError(`Subtype ${subtype} is not valid for account type ${accountType}`);
    }
  }

  /**
   * Optimized raw SQL fetch for account list items.
   * Returns accounts with direct balances and monthly stats in a single pass.
   */
  async getAccountListItemsRaw(
    startOfMonth: number,
    endOfMonth: number,
    includeTotalCount: boolean = false,
    includeDeleted: boolean = false,
  ): Promise<AccountListItemRaw[] | null> {
    if (!supportsRawSql(this.db)) {
      logger.warn(
        '[AccountRepository] getAccountListItemsRaw: Raw SQL not supported. Performance risk.',
      );
      return null;
    }

    const placeholders = ACTIVE_JOURNAL_STATUSES.map(() => '?').join(',');
    const statusArgs = [...ACTIVE_JOURNAL_STATUSES];

    // We split the query into parts to avoid scanning the entire transactions table multiple times.
    // 1. RankedTransactions: Finds the absolute latest balance for each account using ROW_NUMBER.
    //    Optimization: Prune transaction scan to only include active accounts.
    // 2. AggregatedStats: Calculates monthly totals using unified helpers.
    const sql = `
      WITH RankedTransactions AS (
        SELECT 
          t.account_id, 
          t.running_balance,
          ROW_NUMBER() OVER (
            PARTITION BY t.account_id 
            ORDER BY t.transaction_date DESC, t.created_at DESC, t.id DESC
          ) as rn
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        WHERE t.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status IN (${placeholders})
          AND t.account_id IN (SELECT id FROM accounts WHERE deleted_at IS NULL)
      ),
      LatestBalance AS (
        SELECT account_id, running_balance
        FROM RankedTransactions
        WHERE rn = 1
      ),
      MonthlyAggregates AS (
        SELECT 
          t.account_id,
          SUM(${getPeriodIncreaseSQLSnippet()}) as periodIncrease,
          SUM(${getPeriodDecreaseSQLSnippet()}) as periodDecrease
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        JOIN accounts a ON t.account_id = a.id
        WHERE t.deleted_at IS NULL 
          AND j.deleted_at IS NULL 
          AND j.status IN (${placeholders})
          AND t.transaction_date >= ? AND t.transaction_date <= ?
        GROUP BY t.account_id
      )
    ${
      includeTotalCount
        ? `,
      TotalCounts AS (
        SELECT 
          t.account_id,
          COUNT(*) as direct_transaction_count
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        WHERE t.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status IN (${placeholders})
        GROUP BY t.account_id
      )`
        : ``
    }
      SELECT 
        a.id as id, 
        a.name as name, 
        a.account_type as account_type, 
        a.account_subtype as account_subtype, 
        a.currency_code as currency_code, 
        a.icon as icon, 
        a.parent_account_id as parent_account_id,
        lb.running_balance as direct_balance,
        ${includeTotalCount ? 'IFNULL(tc.direct_transaction_count, 0)' : '0'} as direct_transaction_count,
        IFNULL(ma.periodIncrease, 0) as periodIncrease,
        IFNULL(ma.periodDecrease, 0) as periodDecrease
      FROM accounts a
      LEFT JOIN LatestBalance lb ON a.id = lb.account_id
      LEFT JOIN MonthlyAggregates ma ON a.id = ma.account_id
      ${includeTotalCount ? 'LEFT JOIN TotalCounts tc ON a.id = tc.account_id' : ''}
      WHERE ${includeDeleted ? '1=1' : 'a.deleted_at IS NULL'}
      ORDER BY a.order_num ASC
    `;

    const args: any[] = [...statusArgs, ...statusArgs, startOfMonth, endOfMonth];

    if (includeTotalCount) {
      args.push(...statusArgs);
    }

    const start = Date.now();
    const results = await transactionRawRepository.queryRaw<RawAccountRow>(sql, args);
    const duration = Date.now() - start;

    logger.info(`[Trace] AccountRepository.getAccountListItemsRaw: ${duration}ms`, {
      count: results?.length || 0,
    });

    if (!results) return null;

    // Boundary Validation: Ensure DB strings match TypeScript enums
    return results.map(row => {
      if (!isAccountType(row.account_type)) {
        logger.error(
          `[Integrity] Invalid account_type found in DB: ${row.account_type} for account ${row.id}`,
        );
        row.account_type = AccountType.ASSET; // Safe fallback
      }
      if (row.account_subtype && !isAccountSubtype(row.account_subtype)) {
        logger.error(
          `[Integrity] Invalid account_subtype found in DB: ${row.account_subtype} for account ${row.id}`,
        );
        row.account_subtype = undefined;
      }
      return row as AccountListItemRaw;
    });
  }
}

/**
 * PRODUCTION INDEX REQUIREMENTS
 *
 * To ensure the above raw queries remain performant at scale (>10k transactions),
 * the following composite indices must be present in the database:
 *
 * 1. (account_id, transaction_date DESC, created_at DESC, id DESC)
 *    - Optimizes RankedTransactions/LatestBalance lookup.
 * 2. (journal_id)
 *    - Optimizes transaction-journal joins.
 * 3. (status, deleted_at)
 *    - Optimizes journal status filtering.
 */

export const accountRepository = new AccountRepository();
