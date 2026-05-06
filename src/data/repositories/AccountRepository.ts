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
import { RawAccountRow, RawSQLArg } from '@/src/data/repositories/TransactionTypes';
import { AccountId, WorkplaceId } from '@/src/types/domain';
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
  parentAccountId?: AccountId;
  workplaceId: WorkplaceId;
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
    payFromAccountId: AccountId;
    notes: string;
  }>;
}

export interface AccountListItemRaw {
  id: AccountId;
  name: string;
  account_type: AccountType;
  account_subtype: AccountSubtype;
  currency_code: string;
  icon?: string;
  parent_account_id?: AccountId;
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

  /**
   * Reactive Observation Methods
   */

  observeAll(workplaceId: WorkplaceId) {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('order_num', Q.asc),
    ];
    return this.accounts
      .query(...clauses)
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

  observeHierarchy(workplaceId: WorkplaceId) {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts.query(...clauses).observeWithColumns(['parent_account_id', 'deleted_at']);
  }

  observeByType(workplaceId: WorkplaceId, accountType: AccountType) {
    const clauses: Q.Clause[] = [
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
      Q.sortBy('order_num', Q.asc),
    ];
    return this.accounts
      .query(...clauses)
      .observeWithColumns([
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

  observeByIds(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(accountIds)),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];

    return this.accounts
      .query(...clauses)
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

  observeById(workplaceId: WorkplaceId, accountId: AccountId) {
    return this.accounts
      .findAndObserve(accountId)
      .pipe(
        map(account => (account.deletedAt || account.workplaceId !== workplaceId ? null : account)),
      );
  }

  /**
   * Observe all active transactions for an account.
   * Used for reactive in-memory balance calculation.
   */
  observeTransactionsForBalance(workplaceId: WorkplaceId, accountId: AccountId) {
    const clauses: Q.Clause[] = [
      Q.experimentalJoinTables(['journals']),
      Q.where('account_id', accountId),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    const journalClauses: Q.Clause[] = [
      Q.where('status', Q.oneOf([...ACTIVE_JOURNAL_STATUSES])),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];

    clauses.push(Q.on('journals', journalClauses as any));

    return database.collections
      .get<Transaction>('transactions')
      .query(...clauses)
      .observe();
  }

  /**
   * PURE PERSISTENCE METHODS
   */

  async findByIdRaw(id: AccountId): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      return account;
    } catch {
      return null;
    }
  }

  async find(workplaceId: WorkplaceId, id: AccountId): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      if (account.deletedAt) return null;
      if (account.workplaceId !== workplaceId) return null;
      return account;
    } catch {
      return null;
    }
  }

  async findWithDeleted(workplaceId: WorkplaceId, id: AccountId): Promise<Account | null> {
    try {
      const account = await this.accounts.find(id);
      if (account.workplaceId !== workplaceId) return null;
      return account;
    } catch {
      return null;
    }
  }

  async findMetadata(
    workplaceId: WorkplaceId,
    accountId: AccountId,
  ): Promise<AccountMetadata | null> {
    try {
      const clauses: Q.Clause[] = [
        Q.where('account_id', accountId),
        Q.where('workplace_id', workplaceId),
      ];
      const records = await this.metadata.query(...clauses).fetch();
      return records[0] || null;
    } catch {
      return null;
    }
  }

  async findMetadataByAccountIds(
    workplaceId: WorkplaceId,
    accountIds: AccountId[],
  ): Promise<AccountMetadata[]> {
    if (accountIds.length === 0) return [];
    const clauses: Q.Clause[] = [
      Q.where('account_id', Q.oneOf(accountIds)),
      Q.where('workplace_id', workplaceId),
    ];
    return await this.metadata.query(...clauses).fetch();
  }

  async findAllByIdsRaw(ids: AccountId[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    const clauses: Q.Clause[] = [Q.where('id', Q.oneOf(ids)), Q.where('deleted_at', Q.eq(null))];
    return this.accounts.query(...clauses).fetch();
  }

  async findAllByIds(workplaceId: WorkplaceId, ids: AccountId[]): Promise<Account[]> {
    if (ids.length === 0) return [];
    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(ids)),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts.query(...clauses).fetch();
  }

  async findByName(workplaceId: WorkplaceId, name: string): Promise<Account | null> {
    const clauses: Q.Clause[] = [
      Q.where('name', name),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    const accounts = await this.accounts.query(...clauses).fetch();
    return accounts[0] || null;
  }

  async findAll(workplaceId: WorkplaceId): Promise<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    clauses.push(Q.sortBy('order_num', Q.asc));
    return this.accounts.query(...clauses).fetch();
  }

  async findByType(workplaceId: WorkplaceId, accountType: AccountType): Promise<Account[]> {
    const clauses: Q.Clause[] = [
      Q.where('account_type', accountType),
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    clauses.push(Q.sortBy('order_num', Q.asc));
    return this.accounts.query(...clauses).fetch();
  }

  async exists(workplaceId: WorkplaceId): Promise<boolean> {
    const clauses: Q.Clause[] = [Q.where('deleted_at', Q.eq(null))];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }
    const count = await this.accounts.query(...clauses).fetchCount();
    return count > 0;
  }

  async countNonDeleted(workplaceId: WorkplaceId): Promise<number> {
    const clauses: Q.Clause[] = [
      Q.where('deleted_at', Q.eq(null)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts.query(...clauses).fetchCount();
  }

  observeByIdsWithDeleted(workplaceId: WorkplaceId, accountIds: AccountId[]) {
    if (accountIds.length === 0) {
      return of([] as Account[]);
    }

    const clauses: Q.Clause[] = [
      Q.where('id', Q.oneOf(accountIds)),
      Q.where('workplace_id', workplaceId),
    ];
    return this.accounts
      .query(...clauses)
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

  async create(data: AccountPersistenceInput): Promise<Account> {
    await this.ensureUniqueName(data.name, data.workplaceId, undefined);
    const payload: AccountPersistenceInput = {
      ...data,
      accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType),
    };
    this.validateSubtype(payload.accountType, payload.accountSubtype);

    return await this.db.write(async () => {
      const account = await this.accounts.create(acc => {
        const { metadata, ...accountData } = payload;
        Object.assign(acc, accountData);
        acc.createdAt = new Date();
        acc.updatedAt = new Date();
      });

      if (data.metadata) {
        await this.metadata.create(meta => {
          Object.assign(meta, data.metadata);
          meta.account.set(account);
          if (payload.workplaceId) {
            meta.workplaceId = payload.workplaceId;
          }
          meta.createdAt = new Date();
          meta.updatedAt = new Date();
        });
      }

      return account;
    });
  }

  async update(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    workplaceId: WorkplaceId,
  ): Promise<Account> {
    if (updates.name && updates.name !== account.name) {
      await this.ensureUniqueName(updates.name, workplaceId, account.id);
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
        const existingMetadata = await this.findMetadata(workplaceId, account.id);
        if (existingMetadata) {
          await existingMetadata.update(meta => {
            Object.assign(meta, updates.metadata);
            meta.updatedAt = new Date();
          });
        } else {
          await this.metadata.create(meta => {
            Object.assign(meta, updates.metadata);
            meta.account.set(account);
            if (account.workplaceId) {
              meta.workplaceId = account.workplaceId;
            }
            meta.createdAt = new Date();
            meta.updatedAt = new Date();
          });
        }
      }

      return account;
    });
  }

  async delete(workplaceId: WorkplaceId, account: Account): Promise<void> {
    //get account by id
    const existingAccount = await this.find(workplaceId, account.id);
    if (!existingAccount) {
      throw new Error('Cannot delete account. Account not found in workplace provided.');
    }
    const children = await this.queryByParentId(workplaceId, existingAccount.id).fetch();
    //if no exits, throw error
    if (children.length > 0) {
      throw new Error('Cannot delete account with children. Please delete or move children first.');
    }
    await this.db.write(async () => {
      await account.update(record => {
        record.deletedAt = new Date();
        record.updatedAt = new Date();
      });
    });
  }

  observeHasChildren(workplaceId: WorkplaceId, accountId: AccountId) {
    return this.accounts
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('parent_account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observe()
      .pipe(map(children => children.length > 0));
  }

  observeSubAccountCount(workplaceId: WorkplaceId, accountId: AccountId) {
    return this.accounts
      .query(
        Q.where('workplace_id', workplaceId),
        Q.where('parent_account_id', accountId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .observeCount();
  }

  queryByParentId(workplaceId: WorkplaceId, parentId: AccountId) {
    return this.accounts.query(
      Q.where('workplace_id', workplaceId),
      Q.where('parent_account_id', parentId),
      Q.where('deleted_at', Q.eq(null)),
      Q.sortBy('order_num', Q.asc),
    );
  }

  private async ensureUniqueName(
    name: string,
    workplaceId: WorkplaceId,
    excludeId?: AccountId,
  ): Promise<void> {
    const sanitizedName = name.trim();

    // App-level secondary check for user convenience.
    // Note: Database integrity should still be enforced by unique indices where possible.
    const clauses: Q.Clause[] = [
      Q.where('name', Q.like(Q.sanitizeLikeString(sanitizedName))),
      Q.where('deleted_at', Q.eq(null)),
    ];
    if (workplaceId) {
      clauses.push(Q.where('workplace_id', workplaceId));
    }

    const potentialDuplicates = await this.accounts.query(...clauses).fetch();

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
    workplaceId: WorkplaceId,
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
          AND t.account_id IN (SELECT id FROM accounts WHERE deleted_at IS NULL AND workplace_id = ?)
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
      WHERE ${includeDeleted ? '1=1' : 'a.deleted_at IS NULL'} AND a.workplace_id = ?
      ORDER BY a.order_num ASC
    `;

    const args: RawSQLArg[] = [...statusArgs];
    args.push(workplaceId);
    args.push(...statusArgs, startOfMonth, endOfMonth);
    if (includeTotalCount) {
      args.push(...statusArgs);
    }
    args.push(workplaceId);

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

  /**
   * Prepares WatermelonDB operations to merge accounts.
   * Handles metadata references, sub-account parent updates, and soft-deletion of source accounts.
   */
  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<(Account | AccountMetadata)[]> {
    const metaToUpdate = await this.metadata
      .query(
        Q.where('pay_from_account_id', Q.oneOf(sourceAccountIds)),
        Q.where('workplace_id', workplaceId),
      )
      .fetch();

    const sourceMetadata = await this.metadata
      .query(Q.where('account_id', Q.oneOf(sourceAccountIds)), Q.where('workplace_id', workplaceId))
      .fetch();

    const subAccounts = await this.accounts
      .query(
        Q.where('parent_account_id', Q.oneOf(sourceAccountIds)),
        Q.where('workplace_id', workplaceId),
        Q.where('deleted_at', Q.eq(null)),
      )
      .fetch();

    const sourceAccounts = await this.accounts
      .query(Q.where('id', Q.oneOf(sourceAccountIds)))
      .fetch();

    const accountMutations = new Map<
      string,
      { parentId?: AccountId; deleted?: boolean; record: Account }
    >();
    const metadataMutations = new Map<string, { payFromId?: AccountId; record: AccountMetadata }>();

    // 1. Update metadata references (payFromAccountId)
    metaToUpdate.forEach((m: AccountMetadata) => {
      if (!metadataMutations.has(m.id)) {
        metadataMutations.set(m.id, { record: m });
      }
      metadataMutations.get(m.id)!.payFromId = targetAccountId;
    });

    // 2. Update sub-accounts (move parent to target)
    subAccounts.forEach((sa: Account) => {
      if (!accountMutations.has(sa.id)) {
        accountMutations.set(sa.id, { record: sa });
      }
      accountMutations.get(sa.id)!.parentId = targetAccountId;
    });

    // 3. Soft delete source accounts
    sourceAccounts.forEach((s: Account) => {
      if (!accountMutations.has(s.id)) {
        accountMutations.set(s.id, { record: s });
      }
      accountMutations.get(s.id)!.deleted = true;
    });

    // 4. Update source metadata
    sourceMetadata.forEach((m: AccountMetadata) => {
      if (!metadataMutations.has(m.id)) {
        metadataMutations.set(m.id, { record: m });
      }
      // No specific field update other than updatedAt (handled below)
    });

    const ops: (Account | AccountMetadata)[] = [];

    accountMutations.forEach(({ record, parentId, deleted }) => {
      ops.push(
        record.prepareUpdate((r: Account) => {
          if (parentId) r.parentAccountId = parentId;
          if (deleted) r.deletedAt = new Date();
          r.updatedAt = new Date();
        }),
      );
    });

    metadataMutations.forEach(({ record, payFromId }) => {
      ops.push(
        record.prepareUpdate((r: AccountMetadata) => {
          if (payFromId) r.payFromAccountId = payFromId;
          r.updatedAt = new Date();
        }),
      );
    });

    return ops;
  }
}

export const accountRepository = new AccountRepository();
