import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { getDefaultSubtypeForType, isSubtypeAllowedForType } from '@/src/types/accountSubtype';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { ValidationError } from '@/src/utils/errors';
import { Model, Q } from '@nozbe/watermelondb';
import { accountMergeOperations } from './AccountMergeOperations';
import { accountQueryRepository } from './AccountQueryRepository';
import type { AccountPersistenceInput } from './types';

export class AccountWriteRepository {
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
    return this.persistCreatedAccount({ payload: data });
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
      const { metadata, ...accountData } = payload;
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
   * One writer for a new account plus optional companion rows, extra ops, and a
   * follow-up batch (e.g. opening-balance journal after the account is visible).
   */
  async persistCreatedAccount(params: {
    payload: AccountPersistenceInput;
    /** Resolve lock-sensitive fields from the writer's current account set. */
    resolvePayload?: (accounts: readonly Account[]) => AccountPersistenceInput;
    companionPayloads?: AccountPersistenceInput[];
    extraOps?: (created: { account: Account; companions: Account[] }) => Model[];
    followUpBatch?: (created: { account: Account; companions: Account[] }) => Promise<Model[]>;
    afterBatch?: () => void;
  }): Promise<Account> {
    if (!params.payload.workplaceId) {
      throw new ValidationError('workplaceId is required to create an account');
    }
    await this.ensureUniqueName(params.payload.name, params.payload.workplaceId);
    for (const companion of params.companionPayloads ?? []) {
      if (!companion.workplaceId) {
        throw new ValidationError('workplaceId is required to create an account');
      }
      await this.ensureUniqueName(companion.name, companion.workplaceId);
    }

    return this.db.write(async () => {
      const payload = params.resolvePayload
        ? params.resolvePayload(await accountQueryRepository.findAll(params.payload.workplaceId))
        : params.payload;
      const { account, ops } = this.prepareCreateOps(payload);
      const companions: Account[] = [];
      for (const companion of params.companionPayloads ?? []) {
        const prepared = this.prepareCreateOps(companion);
        companions.push(prepared.account);
        ops.push(...prepared.ops);
      }
      const extras = params.extraOps?.({ account, companions }) ?? [];
      await this.db.batch(...ops, ...extras);

      const followUp = (await params.followUpBatch?.({ account, companions })) ?? [];
      if (followUp.length > 0) {
        await this.db.batch(...followUp);
      }
      params.afterBatch?.();
      return account;
    });
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

  async prepareMergeOperations(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<(Account | AccountMetadata)[]> {
    return accountMergeOperations.prepareMergeOperations(
      workplaceId,
      sourceAccountIds,
      targetAccountId,
    );
  }

  loadMergeRecords(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ) {
    return accountMergeOperations.loadMergeRecords(workplaceId, sourceAccountIds, targetAccountId);
  }

  prepareLoadedMergeOperations(
    records: Parameters<typeof accountMergeOperations.prepareLoadedMergeOperations>[0],
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ) {
    return accountMergeOperations.prepareLoadedMergeOperations(
      records,
      sourceAccountIds,
      targetAccountId,
    );
  }
}

export const accountWriteRepository = new AccountWriteRepository();
