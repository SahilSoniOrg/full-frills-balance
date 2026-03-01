import { database } from '@/src/data/database/Database'
import Account, {
  AccountSubcategory,
  AccountType,
  getDefaultSubcategoryForType,
  isSubcategoryAllowedForType
} from '@/src/data/models/Account'
import Transaction from '@/src/data/models/Transaction'
import { ValidationError } from '@/src/utils/errors'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import { map, of } from 'rxjs'

export interface AccountPersistenceInput {
  name: string
  accountType: AccountType
  accountSubcategory?: AccountSubcategory
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
      accountSubcategory: entry.accountSubcategory ?? getDefaultSubcategoryForType(entry.accountType)
    }))
    normalizedDefaults.forEach((entry) => this.validateSubcategory(entry.accountType, entry.accountSubcategory))
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
      accountSubcategory: data.accountSubcategory ?? getDefaultSubcategoryForType(data.accountType)
    }
    this.validateSubcategory(payload.accountType, payload.accountSubcategory)
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
    if (normalizedUpdates.accountType && normalizedUpdates.accountSubcategory === undefined) {
      normalizedUpdates.accountSubcategory = isSubcategoryAllowedForType(
        normalizedUpdates.accountType,
        account.accountSubcategory
      )
        ? account.accountSubcategory
        : getDefaultSubcategoryForType(normalizedUpdates.accountType)
    }

    const nextType = normalizedUpdates.accountType ?? account.accountType
    const nextSubcategory = normalizedUpdates.accountSubcategory ?? account.accountSubcategory
    this.validateSubcategory(nextType, nextSubcategory)
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

  private validateSubcategory(accountType: AccountType, subcategory?: AccountSubcategory): void {
    if (!isSubcategoryAllowedForType(accountType, subcategory)) {
      throw new ValidationError(`Subcategory ${subcategory} is not valid for account type ${accountType}`)
    }
  }

  /**
   * Optimized raw SQL fetch for account list items.
   * Returns accounts with direct balances and monthly stats in a single pass.
   */
  async getAccountListItemsRaw(startOfMonth: number, endOfMonth: number, includeDeleted: boolean = false): Promise<any[] | null> {
    // WatermelonDB provides access to the underlying adapter
    const adapter = this.db.adapter as any

    // We only support raw SQL on SQLite (Native)
    // The queryRaw signature for SQLiteAdapter is (sql, args)
    // We try to find the specific adapter that supports queryRaw
    const sqlAdapter = adapter.underlyingAdapter || adapter

    if (sqlAdapter && typeof sqlAdapter.queryRaw === 'function') {
      const sql = `
        SELECT 
          a.id as id, 
          a.name as name, 
          a.account_type as account_type, 
          a.account_subtype as account_subtype, 
          a.currency_code as currency_code, 
          a.icon as icon, 
          a.parent_account_id as parent_account_id,
          (
            SELECT t.running_balance 
            FROM transactions t
            JOIN journals j ON t.journal_id = j.id
            WHERE t.account_id = a.id 
              AND t.deleted_at IS NULL 
              AND j.deleted_at IS NULL 
              AND j.status IN ('POSTED', 'REVERSED')
            ORDER BY t.transaction_date DESC, t.created_at DESC
            LIMIT 1
          ) as direct_balance,
          IFNULL((
            SELECT COUNT(*) 
            FROM transactions t 
            WHERE t.account_id = a.id AND t.deleted_at IS NULL
          ), 0) as direct_transaction_count,
          IFNULL((
            SELECT SUM(CASE WHEN t.transaction_type = 'CREDIT' THEN t.amount ELSE 0 END)
            FROM transactions t
            JOIN journals j ON t.journal_id = j.id
            WHERE t.account_id = a.id
              AND t.deleted_at IS NULL 
              AND j.deleted_at IS NULL 
              AND j.status IN ('POSTED', 'REVERSED')
              AND t.transaction_date >= ?
              AND t.transaction_date <= ?
          ), 0) as monthly_income,
          IFNULL((
            SELECT SUM(CASE WHEN t.transaction_type = 'DEBIT' THEN t.amount ELSE 0 END)
            FROM transactions t
            JOIN journals j ON t.journal_id = j.id
            WHERE t.account_id = a.id
              AND t.deleted_at IS NULL 
              AND j.deleted_at IS NULL 
              AND j.status IN ('POSTED', 'REVERSED')
              AND t.transaction_date >= ?
              AND t.transaction_date <= ?
          ), 0) as monthly_expenses
        FROM accounts a
        WHERE ${includeDeleted ? '1=1' : 'a.deleted_at IS NULL'}
        ORDER BY a.order_num ASC
      `
      // Correct signature for underlying bridge queryRaw is (sql, args)
      return await sqlAdapter.queryRaw(sql, [startOfMonth, endOfMonth, startOfMonth, endOfMonth])
    }

    // Fallback for LokiJS or other environments: 
    // Return null to signal that optimized raw fetch is not supported.
    return null
  }
}


export const accountRepository = new AccountRepository()
