import { database } from '@/src/data/database/Database'
import Account, {
  AccountSubtype,
  AccountType,
  getDefaultSubtypeForType,
  isSubtypeAllowedForType
} from '@/src/data/models/Account'
import Transaction from '@/src/data/models/Transaction'
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository'
import { ValidationError } from '@/src/utils/errors'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import { map, of } from 'rxjs'
import { supportsRawSql } from '../database/DatabaseUtils'

export interface AccountPersistenceInput {
  name: string
  accountType: AccountType
  accountSubtype?: AccountSubtype
  currencyCode: string
  description?: string
  icon?: string
  orderNum?: number
  parentAccountId?: string
}

export class AccountRepository {
  private get db() {
    return database
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts')
  }

  /**
   * Reactive Observation Methods
   */

  observeAll() {
    return this.accounts
      .query(Q.where('deleted_at', Q.eq(null)), Q.sortBy('order_num', Q.asc))
      .observeWithColumns(['account_type', 'account_subtype', 'name', 'order_num', 'currency_code', 'icon', 'description', 'parent_account_id', 'deleted_at'])
  }

  observeByType(accountType: string) {
    const query = this.accounts
      .query(
        Q.where('account_type', accountType),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
    return query.observeWithColumns(['name', 'account_subtype', 'order_num', 'currency_code', 'icon', 'description', 'parent_account_id', 'deleted_at'])
  }

  observeByIds(accountIds: string[]) {
    if (accountIds.length === 0) {
      return of([] as Account[])
    }

    return this.accounts
      .query(
        Q.where('id', Q.oneOf(accountIds)),
        Q.where('deleted_at', Q.eq(null))
      )
      .observeWithColumns(['name', 'account_type', 'account_subtype', 'currency_code', 'order_num', 'icon', 'description', 'parent_account_id', 'deleted_at'])
  }

  observeById(accountId: string) {
    return this.accounts
      .findAndObserve(accountId)
      .pipe(
        map((account) => (account.deletedAt ? null : account))
      )
  }

  /**
   * Observe all active transactions for an account.
   * Used for reactive in-memory balance calculation.
   */
  observeTransactionsForBalance(accountId: string) {
    return database.collections.get<Transaction>('transactions')
      .query(
        Q.experimentalJoinTables(['journals']),
        Q.where('account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
        Q.on('journals', [
          Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
          Q.where('deleted_at', Q.eq(null))
        ])
      )
      .observe()
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async find(id: string): Promise<Account | null> {
    try {
      return await this.accounts.find(id)
    } catch {
      return null
    }
  }

  async findAllByIds(ids: string[]): Promise<Account[]> {
    if (ids.length === 0) return []
    return this.accounts.query(Q.where('id', Q.oneOf(ids))).fetch()
  }

  async findByName(name: string): Promise<Account | null> {
    const accounts = await this.accounts
      .query(
        Q.and(
          Q.where('name', name),
          Q.where('deleted_at', Q.eq(null))
        )
      )
      .fetch()
    return accounts[0] || null
  }

  async findAll(): Promise<Account[]> {
    return this.accounts
      .query(
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
      .fetch()
  }

  async findByType(accountType: AccountType): Promise<Account[]> {
    return this.accounts
      .query(
        Q.where('account_type', accountType),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
      .fetch()
  }

  async exists(): Promise<boolean> {
    const count = await this.accounts
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetchCount()
    return count > 0
  }

  async countNonDeleted(): Promise<number> {
    return this.accounts
      .query(Q.where('deleted_at', Q.eq(null)))
      .fetchCount()
  }

  async seedDefaults(defaults: AccountPersistenceInput[]): Promise<void> {
    const normalizedDefaults = defaults.map((entry) => ({
      ...entry,
      accountSubtype: entry.accountSubtype ?? getDefaultSubtypeForType(entry.accountType)
    }))
    normalizedDefaults.forEach((entry) => this.validateSubtype(entry.accountType, entry.accountSubtype))
    await this.db.write(async () => {
      const creates = normalizedDefaults.map((data) =>
        this.accounts.prepareCreate((account) => {
          Object.assign(account, data)
          account.createdAt = new Date()
          account.updatedAt = new Date()
        })
      )
      if (creates.length > 0) {
        await this.db.batch(...creates)
      }
    })
  }

  async create(data: AccountPersistenceInput): Promise<Account> {
    await this.ensureUniqueName(data.name)
    const payload: AccountPersistenceInput = {
      ...data,
      accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType)
    }
    this.validateSubtype(payload.accountType, payload.accountSubtype)
    return await this.db.write(async () => {
      return this.accounts.create((account) => {
        Object.assign(account, payload)
        account.createdAt = new Date()
        account.updatedAt = new Date()
      })
    })
  }

  async update(account: Account, updates: Partial<AccountPersistenceInput>): Promise<Account> {
    if (updates.name && updates.name !== account.name) {
      await this.ensureUniqueName(updates.name, account.id)
    }
    const normalizedUpdates: Partial<AccountPersistenceInput> = { ...updates }
    if (normalizedUpdates.accountType && normalizedUpdates.accountSubtype === undefined) {
      normalizedUpdates.accountSubtype = isSubtypeAllowedForType(
        normalizedUpdates.accountType,
        account.accountSubtype
      )
        ? account.accountSubtype
        : getDefaultSubtypeForType(normalizedUpdates.accountType)
    }

    const nextType = normalizedUpdates.accountType ?? account.accountType
    const nextSubtype = normalizedUpdates.accountSubtype ?? account.accountSubtype
    this.validateSubtype(nextType, nextSubtype)
    return await this.db.write(async () => {
      await account.update((acc) => {
        Object.assign(acc, normalizedUpdates)
        acc.updatedAt = new Date()
      })
      return account
    })
  }

  async delete(account: Account): Promise<void> {
    await this.db.write(async () => {
      await account.update(record => {
        record.deletedAt = new Date()
        record.updatedAt = new Date()
      })
    })
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
    const children = await this.accounts.query(
      Q.where('parent_account_id', accountId),
      Q.where('deleted_at', Q.eq(null))
    ).fetch()

    let ids = children.map(c => c.id)
    for (const child of children) {
      const descendantIds = await this.getDescendantIds(child.id)
      ids = [...ids, ...descendantIds]
    }
    return ids
  }

  /**
   * Pure in-memory BFS traversal given a pre-fetched flat account list.
   * Zero DB queries — call this whenever you already have all accounts in memory.
   */
  getDescendantIdsFromList(accountId: string, allAccounts: Account[]): string[] {
    const childrenMap = new Map<string, string[]>();
    for (const acc of allAccounts) {
      if (acc.parentAccountId && !acc.deletedAt) {
        const arr = childrenMap.get(acc.parentAccountId) ?? [];
        arr.push(acc.id);
        childrenMap.set(acc.parentAccountId, arr);
      }
    }

    const result: string[] = [];
    const queue: string[] = [accountId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = childrenMap.get(current) ?? [];
      for (const childId of children) {
        result.push(childId);
        queue.push(childId);
      }
    }
    return result;
  }

  async hasChildren(accountId: string): Promise<boolean> {
    const count = await this.accounts.query(
      Q.where('parent_account_id', accountId),
      Q.where('deleted_at', Q.eq(null))
    ).fetchCount()
    return count > 0
  }

  observeHasChildren(accountId: string) {
    return this.accounts.query(
      Q.where('parent_account_id', accountId),
      Q.where('deleted_at', Q.eq(null))
    ).observe().pipe(
      map(children => children.length > 0)
    )
  }

  observeSubAccountCount(accountId: string) {
    return this.accounts.query(
      Q.where('parent_account_id', accountId),
      Q.where('deleted_at', Q.eq(null))
    ).observeCount()
  }

  queryByParentId(parentId: string) {
    return this.accounts.query(
      Q.where('parent_account_id', parentId),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc)
    )
  }

  private async ensureUniqueName(name: string, excludeId?: string): Promise<void> {
    const sanitizedName = name.trim()

    // Query specifically for the name to avoid fetching all accounts.
    // We use a case-insensitive check in SQLite via normalized comparison if possible,
    // otherwise a small set of matches is checked in JS.
    const potentialDuplicates = await this.accounts
      .query(
        Q.where('name', Q.like(Q.sanitizeLikeString(sanitizedName))),
        Q.where('deleted_at', Q.eq(null))
      )
      .fetch()

    const duplicate = potentialDuplicates.find(account => {
      if (excludeId && account.id === excludeId) return false
      return account.name.trim().toLowerCase() === sanitizedName.toLowerCase()
    })

    if (duplicate) {
      throw new ValidationError(`Account with name "${name}" already exists`)
    }
  }

  private validateSubtype(accountType: AccountType, subtype?: AccountSubtype): void {
    if (!isSubtypeAllowedForType(accountType, subtype)) {
      throw new ValidationError(`Subtype ${subtype} is not valid for account type ${accountType}`)
    }
  }

  /**
   * Optimized raw SQL fetch for account list items.
   * Returns accounts with direct balances and monthly stats in a single pass.
   */
  async getAccountListItemsRaw(startOfMonth: number, endOfMonth: number, includeDeleted: boolean = false): Promise<any[] | null> {
    if (!supportsRawSql(this.db)) return null;

    const activeStatusesStr = ACTIVE_JOURNAL_STATUSES.map(s => `'${s}'`).join(',');

    // We use left joins and group by instead of correlated subqueries.
    // For direct_balance we use a joined subquery that finds the latest transaction per account.
    const sql = `
      WITH LatestTrans AS (
        SELECT t.account_id, MAX(t.transaction_date) as max_date, MAX(t.created_at) as max_created
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        WHERE t.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status IN (${activeStatusesStr})
        GROUP BY t.account_id
      ),
      LatestBalance AS (
        SELECT t.account_id, t.running_balance
        FROM transactions t
        JOIN LatestTrans lt ON t.account_id = lt.account_id AND t.transaction_date = lt.max_date AND t.created_at = lt.max_created
      ),
      AggregatedStats AS (
        SELECT 
          t.account_id,
          COUNT(*) as direct_transaction_count,
          SUM(
            CASE WHEN (t.transaction_date >= ? AND t.transaction_date <= ?) THEN
              CASE 
                WHEN (a.account_type = 'INCOME' AND t.transaction_type = 'CREDIT') THEN t.amount
                WHEN (a.account_type = 'INCOME' AND t.transaction_type = 'DEBIT') THEN -t.amount
                WHEN (a.account_type = 'EXPENSE' AND t.transaction_type = 'CREDIT') THEN -t.amount
                WHEN (a.account_type = 'EXPENSE' AND t.transaction_type = 'DEBIT') THEN t.amount
                WHEN (a.account_type IN ('ASSET', 'LIABILITY', 'EQUITY') AND t.transaction_type = 'CREDIT') THEN t.amount
                WHEN (a.account_type IN ('ASSET', 'LIABILITY', 'EQUITY') AND t.transaction_type = 'DEBIT') THEN -t.amount
                ELSE 0 
              END
            ELSE 0 END
          ) as monthly_income,
          SUM(
            CASE WHEN (t.transaction_date >= ? AND t.transaction_date <= ?) THEN
              CASE 
                WHEN a.account_type IN ('EXPENSE', 'ASSET') AND t.transaction_type = 'DEBIT' THEN t.amount
                WHEN a.account_type IN ('EXPENSE', 'ASSET') AND t.transaction_type = 'CREDIT' THEN -t.amount
                ELSE 0 
              END
            ELSE 0 END
          ) as monthly_expenses
        FROM transactions t
        JOIN journals j ON t.journal_id = j.id
        JOIN accounts a ON t.account_id = a.id
        WHERE t.deleted_at IS NULL AND j.deleted_at IS NULL AND j.status IN (${activeStatusesStr})
        GROUP BY t.account_id
      )
      SELECT 
        a.id as id, 
        a.name as name, 
        a.account_type as account_type, 
        a.account_subtype as account_subtype, 
        a.currency_code as currency_code, 
        a.icon as icon, 
        a.parent_account_id as parent_account_id,
        lb.running_balance as direct_balance,
        IFNULL(agg.direct_transaction_count, 0) as direct_transaction_count,
        IFNULL(agg.monthly_income, 0) as monthly_income,
        IFNULL(agg.monthly_expenses, 0) as monthly_expenses
      FROM accounts a
      LEFT JOIN LatestBalance lb ON a.id = lb.account_id
      LEFT JOIN AggregatedStats agg ON a.id = agg.account_id
      WHERE ${includeDeleted ? '1=1' : 'a.deleted_at IS NULL'}
      ORDER BY a.order_num ASC
    `;

    return await transactionRawRepository.queryRaw(sql, [startOfMonth, endOfMonth, startOfMonth, endOfMonth]);
  }
}


export const accountRepository = new AccountRepository()
