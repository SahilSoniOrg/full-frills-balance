import { database } from '@/src/data/database/Database';
import {
  getStagedAccounts,
  runAccountingWriteSession,
  stageAccountCreation,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { getDefaultSubtypeForType, isSubtypeAllowedForType } from '@/src/types/accountSubtype';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType, AuditAction } from '@/src/types/enums';
import { ValidationError } from '@/src/utils/errors';
import { Model, Q } from '@nozbe/watermelondb';
import { accountMergeOperations } from './AccountMergeOperations';
import { accountQueryRepository } from './AccountQueryRepository';
import type { AccountPersistenceInput } from './types';

export class AccountWriteRepository {
  private assertCurrencyUnchanged(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
  ): void {
    if (updates.currencyCode !== undefined && updates.currencyCode !== account.currencyCode) {
      throw new ValidationError('Account currency cannot be changed after creation');
    }
  }

  private get db() {
    return database;
  }

  private get accounts() {
    return this.db.collections.get<Account>('accounts');
  }

  private get metadata() {
    return this.db.collections.get<AccountMetadata>('account_metadata');
  }

  async create(data: AccountPersistenceInput): Promise<Account> {
    return runAccountingWriteSession(session => this.createInSession(session, data));
  }

  /**
   * Stage account creation in a caller-owned atomic accounting write.
   * The session keeps prepared models private to the repository layer.
   */
  async createInSession(
    session: AccountingWriteSession,
    data: AccountPersistenceInput,
    options: {
      appendWithinSiblingList?: boolean;
      audit?: { initialBalance?: number };
    } = {},
  ): Promise<Account> {
    if (!data.workplaceId) {
      throw new ValidationError('workplaceId is required to create an account');
    }
    await this.ensureUniqueName(data.name, data.workplaceId);

    const normalizedName = data.name.trim().toLowerCase();
    if (
      getStagedAccounts(session, data.workplaceId).some(
        account => account.name.trim().toLowerCase() === normalizedName,
      )
    ) {
      throw new ValidationError(`Account with name "${data.name}" already exists`);
    }

    let payload = data;
    if (options.appendWithinSiblingList) {
      const persistedAccounts = await accountQueryRepository.findAll(data.workplaceId);
      const candidates = [...persistedAccounts, ...getStagedAccounts(session, data.workplaceId)];
      payload = {
        ...data,
        orderNum: candidates.filter(
          candidate =>
            (candidate.parentAccountId || undefined) === (data.parentAccountId || undefined) &&
            candidate.accountType === data.accountType,
        ).length,
      };
    }

    const prepared = this.prepareCreateOps(payload);
    const operations = [...prepared.ops];
    if (options.audit) {
      const { account } = prepared;
      operations.push(
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: account.id,
            action: AuditAction.CREATE,
            changes: {
              after: {
                name: account.name,
                accountType: account.accountType,
                accountSubtype: account.accountSubtype,
                currencyCode: account.currencyCode,
                description: account.description,
                icon: account.icon,
                color: account.color,
                orderNum: account.orderNum,
                parentAccountId: account.parentAccountId,
                initialBalance: options.audit.initialBalance,
              },
            },
          },
          data.workplaceId,
        ),
      );
    }
    stageAccountCreation(session, prepared.account, operations);
    return prepared.account;
  }

  prepareCreateOps(data: AccountPersistenceInput): { account: Account; ops: Model[] } {
    if (!data.workplaceId) {
      throw new ValidationError('workplaceId is required to create an account');
    }
    const payload: AccountPersistenceInput = {
      ...data,
      accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType),
    };
    this.validateSubtype(payload.accountType, payload.accountSubtype);

    const account = this.accounts.prepareCreate(acc => {
      const { metadata, id, ...accountData } = payload;
      if (id) acc._raw.id = id;
      Object.assign(acc, accountData);
      acc.createdAt = new Date();
      acc.updatedAt = new Date();
    });

    const ops: Model[] = [account];
    if (data.metadata) {
      ops.push(
        this.metadata.prepareCreate(meta => {
          Object.assign(meta, data.metadata);
          meta.account.set(account);
          if (payload.workplaceId) {
            meta.workplaceId = payload.workplaceId;
          }
          meta.createdAt = new Date();
          meta.updatedAt = new Date();
        }),
      );
    }

    return { account, ops };
  }

  /**
   * Validate + read everything needed before prepare→batch.
   * Callers that own the write (e.g. archive compose) use this with prepareUpdateBatchOps.
   */
  async planUpdate(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    workplaceId: WorkplaceId,
  ): Promise<{
    normalizedUpdates: Partial<AccountPersistenceInput>;
    existingMetadata: AccountMetadata | null;
  }> {
    if (account.workplaceId !== workplaceId) {
      throw new Error('Account does not belong to the specified workplace');
    }
    if (updates.workplaceId && updates.workplaceId !== workplaceId) {
      throw new Error('Workplace mismatch in update payload');
    }
    this.assertCurrencyUnchanged(account, updates);
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

    const existingMetadata = updates.metadata
      ? await accountQueryRepository.findMetadata(workplaceId, account.id)
      : null;

    return { normalizedUpdates, existingMetadata };
  }

  /**
   * Sync prepare of account (+ optional metadata) ops.
   * Call only inside db.write after all awaits — WatermelonDB requires prepare→batch sync.
   */
  prepareUpdateBatchOps(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    existingMetadata: AccountMetadata | null,
  ): Model[] {
    this.assertCurrencyUnchanged(account, updates);
    const batchOps: Model[] = [];
    const hasRowUpdates = Object.keys(updates).some(key => key !== 'metadata');

    if (hasRowUpdates) {
      batchOps.push(
        account.prepareUpdate(acc => {
          const {
            metadata: _metadata,
            archivedAt: _archivedAt,
            deletedAt: _deletedAt,
            ...accountUpdates
          } = updates;
          Object.assign(acc, accountUpdates);
          if ('archivedAt' in updates) {
            acc.archivedAt = updates.archivedAt ?? undefined;
          }
          if ('deletedAt' in updates) {
            acc.deletedAt = updates.deletedAt ?? undefined;
          }
          acc.updatedAt = new Date();
        }),
      );
    }

    if (updates.metadata) {
      if (existingMetadata) {
        batchOps.push(
          existingMetadata.prepareUpdate(meta => {
            Object.assign(meta, updates.metadata);
            meta.updatedAt = new Date();
          }),
        );
      } else {
        batchOps.push(
          this.metadata.prepareCreate(meta => {
            Object.assign(meta, updates.metadata);
            meta.account.set(account);
            if (account.workplaceId) {
              meta.workplaceId = account.workplaceId;
            }
            meta.createdAt = new Date();
            meta.updatedAt = new Date();
          }),
        );
      }
    }

    return batchOps;
  }

  /**
   * Prepare the final reactive refresh for the requested live accounts.
   *
   * Resolve the accounts and prepare their updates inside the caller's write
   * batch factory so model preparation stays synchronous with the eventual
   * batch commit. Account lookup is workplace-scoped and ignores deleted rows.
   */
  async prepareRefreshOps(workplaceId: WorkplaceId, accountIds: AccountId[]): Promise<Model[]> {
    const accounts = await accountQueryRepository.findAllByIds(workplaceId, accountIds);
    return accounts.map(account =>
      account.prepareUpdate(record => {
        record.updatedAt = new Date();
      }),
    );
  }

  /**
   * Prepares WatermelonDB operations to archive or unarchive accounts.
   */
  prepareArchiveTargetOps(
    archiveTargets: Account[],
    unarchiveTargets: Account[],
    now: Date,
  ): Model[] {
    return [
      ...archiveTargets.map(account =>
        account.prepareUpdate(record => {
          record.archivedAt = now;
          record.updatedAt = now;
        }),
      ),
      ...unarchiveTargets.map(account =>
        account.prepareUpdate(record => {
          record.archivedAt = undefined;
          record.updatedAt = now;
        }),
      ),
    ];
  }

  /**
   * Prepares a reactive refresh for an account owned by the workplace.
   * The caller owns the write and is responsible for batching the prepared operation.
   */
  prepareRefresh(workplaceId: WorkplaceId, account: Account): Account {
    if (account.workplaceId !== workplaceId) {
      throw new Error('Account does not belong to the specified workplace');
    }

    return account.prepareUpdate(record => {
      record.updatedAt = new Date();
    });
  }

  async update(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    workplaceId: WorkplaceId,
    extraOps?: (account: Account) => Model[],
  ): Promise<Account> {
    const { normalizedUpdates, existingMetadata } = await this.planUpdate(
      account,
      updates,
      workplaceId,
    );

    return await this.db.write(async () => {
      const batchOps = this.prepareUpdateBatchOps(account, normalizedUpdates, existingMetadata);
      const extras = extraOps?.(account) ?? [];
      if (batchOps.length + extras.length > 0) {
        await this.db.batch(...batchOps, ...extras);
      }
      return account;
    });
  }

  async delete(
    workplaceId: WorkplaceId,
    account: Account,
    extraOps?: (account: Account) => Model[],
  ): Promise<void> {
    const existingAccount = await accountQueryRepository.find(workplaceId, account.id);
    if (!existingAccount) {
      throw new Error('Cannot delete account. Account not found in workplace provided.');
    }
    const children = await accountQueryRepository
      .queryByParentId(workplaceId, existingAccount.id)
      .fetch();
    if (children.length > 0) {
      throw new Error('Cannot delete account with children. Please delete or move children first.');
    }
    await this.db.write(async () => {
      const deleteOp = account.prepareUpdate(record => {
        record.deletedAt = new Date();
        record.updatedAt = new Date();
      });
      const extras = extraOps?.(account) ?? [];
      await this.db.batch(deleteOp, ...extras);
    });
  }

  async recover(
    workplaceId: WorkplaceId,
    account: Account,
    extraOps?: (account: Account) => Model[],
  ): Promise<void> {
    if (account.workplaceId !== workplaceId) {
      throw new Error('Account does not belong to the specified workplace');
    }
    await this.db.write(async () => {
      const recoverOp = account.prepareUpdate(record => {
        record.deletedAt = undefined;
        record.updatedAt = new Date();
      });
      const extras = extraOps?.(account) ?? [];
      await this.db.batch(recoverOp, ...extras);
    });
  }

  async ensureUniqueName(
    name: string,
    workplaceId: WorkplaceId,
    excludeId?: AccountId,
  ): Promise<void> {
    const sanitizedName = name.trim();

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

  validateSubtype(accountType: AccountType, subtype?: AccountSubtype): void {
    if (!isSubtypeAllowedForType(accountType, subtype)) {
      throw new ValidationError(`Subtype ${subtype} is not valid for account type ${accountType}`);
    }
  }

  /** Stage account-owned reference changes, source deletion, and audit in one session batch. */
  mergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<void> {
    return accountMergeOperations.mergeInSession(
      session,
      workplaceId,
      sourceAccountIds,
      targetAccountId,
    );
  }
}

export const accountWriteRepository = new AccountWriteRepository();
