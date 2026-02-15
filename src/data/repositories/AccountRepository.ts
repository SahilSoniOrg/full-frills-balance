import { database } from '@/src/data/database/Database'
import Account, { AccountType } from '@/src/data/models/Account'
import Transaction from '@/src/data/models/Transaction'
import { ValidationError } from '@/src/utils/errors'
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus'
import { Q } from '@nozbe/watermelondb'
import { map, of } from 'rxjs'

export interface AccountPersistenceInput {
  name: string
  accountType: AccountType
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
      .observeWithColumns(['account_type', 'name', 'order_num', 'currency_code', 'icon', 'description', 'parent_account_id', 'deleted_at'])
  }

  observeByType(accountType: string) {
    const query = this.accounts
      .query(
        Q.where('account_type', accountType),
        Q.where('deleted_at', Q.eq(null)),
        Q.sortBy('order_num', Q.asc)
      )
    return query.observeWithColumns(['name', 'order_num', 'currency_code', 'icon', 'description', 'parent_account_id', 'deleted_at'])
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
      .observeWithColumns(['name', 'account_type', 'currency_code', 'order_num', 'icon', 'description', 'parent_account_id', 'deleted_at'])
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
    await this.db.write(async () => {
      const creates = defaults.map((data) =>
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
    return await this.db.write(async () => {
      return this.accounts.create((account) => {
        Object.assign(account, data)
        account.createdAt = new Date()
        account.updatedAt = new Date()
      })
    })
  }

  async update(account: Account, updates: Partial<AccountPersistenceInput>): Promise<Account> {
    if (updates.name && updates.name !== account.name) {
      await this.ensureUniqueName(updates.name, account.id)
    }
    return await this.db.write(async () => {
      await account.update((acc) => {
        Object.assign(acc, updates)
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

  async getDescendantIds(accountId: string): Promise<string[]> {
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
}

export const accountRepository = new AccountRepository()
