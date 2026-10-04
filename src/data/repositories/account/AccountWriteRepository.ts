import { database } from '@/src/data/database/Database';
import {
  getStagedAccounts,
  runAccountingWriteSession,
  stageAccountCreation,
  stageModelWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import { auditRepository, type AuditEntry } from '@/src/data/repositories/AuditRepository';
import { getDefaultSubtypeForType, isSubtypeAllowedForType } from '@/src/types/accountSubtype';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType, AuditAction } from '@/src/types/enums';
import { ValidationError } from '@/src/utils/errors';
import { Model, Q } from '@nozbe/watermelondb';
import { accountQueryRepository } from './AccountQueryRepository';
import type { AccountPersistenceInput } from './types';

type AccountAuditContribution = Omit<AuditEntry, 'entityType' | 'entityId'>;

export interface AccountMutationCommitFacts {
  balanceRebuildAccountIds: AccountId[];
}

/** Validated account-local changes plus the effects implied by committing them. */
interface AccountMutationPlan {
  workplaceId: WorkplaceId;
  account: Account;
  normalizedUpdates: Partial<AccountPersistenceInput>;
  existingMetadata: AccountMetadata | null;
  audit?: AccountAuditContribution;
  commitFacts: AccountMutationCommitFacts;
}

export interface AccountMutationResult {
  account: Account;
  commitFacts: AccountMutationCommitFacts;
}

interface PreparedAccountMutation<T> {
  prepareOps: () => readonly Model[];
  result: T;
}

type AccountMergeRecords = {
  metadataToRetarget: AccountMetadata[];
  sourceMetadata: AccountMetadata[];
  sourceChildren: Account[];
  targetChildren: Account[];
  sourceAccounts: Account[];
};

type AccountMergeWriteOperations = {
  accounts: Account[];
  metadata: AccountMetadata[];
  audits: AuditLog[];
};

function metadataAuditState(record: AccountMetadata): Record<string, unknown> {
  return {
    statementDay: record.statementDay ?? null,
    dueDay: record.dueDay ?? null,
    minimumPaymentAmount: record.minimumPaymentAmount ?? null,
    minimumBalanceAmount: record.minimumBalanceAmount ?? null,
    creditLimitAmount: record.creditLimitAmount ?? null,
    aprBps: record.aprBps ?? null,
    emiDay: record.emiDay ?? null,
    loanTenureMonths: record.loanTenureMonths ?? null,
    autopayEnabled: record.autopayEnabled ?? null,
    gracePeriodDays: record.gracePeriodDays ?? null,
    payFromAccountId: record.payFromAccountId ?? null,
    minPaymentOnly: record.minPaymentOnly ?? null,
    minimumPaymentPercent: record.minimumPaymentPercent ?? null,
    notes: record.notes ?? null,
  };
}

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

  /** Commit a validated account workflow through the shared single-writer session. */
  async commitMutationPlan<T>(prepare: () => Promise<PreparedAccountMutation<T>>): Promise<T> {
    return runAccountingWriteSession(async session => {
      const plan = await prepare();
      stageModelWrite(session, plan.prepareOps);
      return plan.result;
    });
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
      audit?: { initialBalance?: number; correlationId?: string };
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

    const prepared = this.prepareCreateOps(payload, options.audit ? { audit: options.audit } : {});
    const operations = [...prepared.ops];
    stageAccountCreation(session, prepared.account, operations);
    return prepared.account;
  }

  prepareCreateOps(
    data: AccountPersistenceInput,
    options: { audit?: { initialBalance?: number; correlationId?: string } } = {},
  ): { account: Account; ops: Model[] } {
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

    if (options.audit) {
      ops.push(
        this.prepareCreateAuditLog(
          account,
          data,
          options.audit.initialBalance,
          options.audit.correlationId,
        ),
      );
    }

    return { account, ops };
  }

  private prepareCreateAuditLog(
    account: Account,
    data: AccountPersistenceInput,
    initialBalance?: number,
    correlationId?: string,
  ): Model {
    const metadata = data.metadata;
    return auditRepository.prepareLog(
      {
        entityType: 'account',
        entityId: account.id,
        eventType: 'account.created',
        action: AuditAction.CREATE,
        correlationId,
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
            metadata: metadata
              ? {
                  statementDay: metadata.statementDay ?? null,
                  dueDay: metadata.dueDay ?? null,
                  minimumPaymentAmount: metadata.minimumPaymentAmount ?? null,
                  minimumBalanceAmount: metadata.minimumBalanceAmount ?? null,
                  creditLimitAmount: metadata.creditLimitAmount ?? null,
                  aprBps: metadata.aprBps ?? null,
                  emiDay: metadata.emiDay ?? null,
                  loanTenureMonths: metadata.loanTenureMonths ?? null,
                  autopayEnabled: metadata.autopayEnabled ?? null,
                  gracePeriodDays: metadata.gracePeriodDays ?? null,
                  payFromAccountId: metadata.payFromAccountId ?? null,
                  minPaymentOnly: metadata.minPaymentOnly ?? null,
                  minimumPaymentPercent: metadata.minimumPaymentPercent ?? null,
                  notes: metadata.notes ?? null,
                }
              : null,
            initialBalance,
          },
        },
      },
      data.workplaceId!,
    );
  }

  /**
   * Validate + read everything needed before prepare→batch.
   * Callers that own the write (e.g. archive compose) use this with prepareUpdateBatchOps.
   */
  async planUpdate(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    workplaceId: WorkplaceId,
    audit?: AccountAuditContribution,
  ): Promise<AccountMutationPlan> {
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

    const existingMetadata = Object.prototype.hasOwnProperty.call(updates, 'metadata')
      ? await accountQueryRepository.findMetadata(workplaceId, account.id)
      : null;

    const rebuildsBalance =
      normalizedUpdates.accountType !== undefined &&
      normalizedUpdates.accountType !== account.accountType;

    return {
      workplaceId,
      account,
      normalizedUpdates,
      existingMetadata,
      audit,
      commitFacts: {
        balanceRebuildAccountIds: rebuildsBalance ? [account.id] : [],
      },
    };
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
          if ('description' in updates) acc.description = updates.description ?? undefined;
          if ('icon' in updates) acc.icon = updates.icon ?? undefined;
          if ('parentAccountId' in updates) {
            acc.parentAccountId = updates.parentAccountId ?? undefined;
          }
          if ('orderNum' in updates) acc.orderNum = updates.orderNum ?? undefined;
          if ('reconciledAt' in updates) acc.reconciledAt = updates.reconciledAt ?? undefined;
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

    if ('metadata' in updates) {
      if (updates.metadata === null) {
        if (existingMetadata) batchOps.push(existingMetadata.prepareDestroyPermanently());
      } else if (updates.metadata) {
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
    }

    return batchOps;
  }

  /**
   * Touches the requested live accounts in one write so observers refresh.
   * Account lookup is workplace-scoped and ignores deleted rows.
   */
  async refreshAccounts(workplaceId: WorkplaceId, accountIds: AccountId[]): Promise<void> {
    await database.write(async () => {
      const accounts = await accountQueryRepository.findAllByIds(workplaceId, accountIds);
      if (accounts.length === 0) return;
      const now = new Date();
      await database.batch(
        accounts.map(account =>
          account.prepareUpdate(record => {
            record.updatedAt = now;
          }),
        ),
      );
    });
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
    options: {
      audit?: AccountAuditContribution;
      extraOps?: (account: Account, metadata: AccountMetadata | null) => Model[];
      validateCurrent?: (
        account: Account,
        metadata: AccountMetadata | null,
      ) => void | Promise<void>;
    } = {},
  ): Promise<AccountMutationResult> {
    const plan = await this.planUpdate(account, updates, workplaceId, options.audit);

    return this.commitMutationPlan(async () => {
      let currentAccount = plan.account;
      let currentMetadata = plan.existingMetadata;
      if (options.extraOps || options.validateCurrent) {
        const freshAccount = await accountQueryRepository.findWithDeleted(workplaceId, account.id);
        if (!freshAccount) throw new Error('Account not found');
        currentAccount = freshAccount;
        currentMetadata = await accountQueryRepository.findMetadata(workplaceId, account.id);
      }
      await options.validateCurrent?.(currentAccount, currentMetadata);

      return {
        prepareOps: () => [
          ...this.prepareUpdateBatchOps(currentAccount, plan.normalizedUpdates, currentMetadata),
          ...(plan.audit
            ? [
                auditRepository.prepareLog(
                  {
                    entityType: 'account',
                    entityId: currentAccount.id,
                    ...plan.audit,
                  },
                  plan.workplaceId,
                ),
              ]
            : []),
          ...(options.extraOps?.(currentAccount, currentMetadata) ?? []),
        ],
        result: { account: currentAccount, commitFacts: plan.commitFacts },
      };
    });
  }

  async delete(
    workplaceId: WorkplaceId,
    account: Account,
    options: {
      audit?: AccountAuditContribution;
      extraOps?: (account: Account, deletedAt: Date) => Model[];
      validateCurrent?: (
        account: Account,
        metadata: AccountMetadata | null,
      ) => void | Promise<void>;
    } = {},
  ): Promise<AccountMutationResult> {
    return this.commitMutationPlan(async () => {
      const currentAccount = await accountQueryRepository.find(workplaceId, account.id);
      if (!currentAccount) {
        throw new Error('Cannot delete account. Account not found in workplace provided.');
      }
      const currentMetadata =
        options.validateCurrent || options.extraOps
          ? await accountQueryRepository.findMetadata(workplaceId, account.id)
          : null;
      await options.validateCurrent?.(currentAccount, currentMetadata);

      const children = await accountQueryRepository
        .queryByParentId(workplaceId, currentAccount.id)
        .fetch();
      if (children.length > 0) {
        throw new Error(
          'Cannot delete account with children. Please delete or move children first.',
        );
      }

      const deletedAt = new Date();
      return {
        prepareOps: () => [
          currentAccount.prepareUpdate(record => {
            record.deletedAt = deletedAt;
            record.updatedAt = deletedAt;
          }),
          ...(options.audit
            ? [
                auditRepository.prepareLog(
                  {
                    entityType: 'account',
                    entityId: currentAccount.id,
                    ...options.audit,
                  },
                  workplaceId,
                ),
              ]
            : []),
          ...(options.extraOps?.(currentAccount, deletedAt) ?? []),
        ],
        result: {
          account: currentAccount,
          commitFacts: { balanceRebuildAccountIds: [] },
        },
      };
    });
  }

  async recover(
    workplaceId: WorkplaceId,
    account: Account,
    options: {
      audit?: AccountAuditContribution;
      extraOps?: (account: Account, restoredAt: Date) => Model[];
      validateCurrent?: (
        account: Account,
        metadata: AccountMetadata | null,
      ) => void | Promise<void>;
    } = {},
  ): Promise<AccountMutationResult> {
    if (account.workplaceId !== workplaceId) {
      throw new Error('Account does not belong to the specified workplace');
    }
    return this.commitMutationPlan(async () => {
      const currentAccount = await accountQueryRepository.findWithDeleted(workplaceId, account.id);
      if (!currentAccount) throw new Error('Account not found');
      const currentMetadata =
        options.validateCurrent || options.extraOps
          ? await accountQueryRepository.findMetadata(workplaceId, account.id)
          : null;
      await options.validateCurrent?.(currentAccount, currentMetadata);

      const restoredAt = new Date();
      return {
        prepareOps: () => [
          currentAccount.prepareUpdate(record => {
            record.deletedAt = undefined;
            record.updatedAt = restoredAt;
          }),
          ...(options.audit
            ? [
                auditRepository.prepareLog(
                  {
                    entityType: 'account',
                    entityId: currentAccount.id,
                    ...options.audit,
                  },
                  workplaceId,
                ),
              ]
            : []),
          ...(options.extraOps?.(currentAccount, restoredAt) ?? []),
        ],
        result: {
          account: currentAccount,
          commitFacts: { balanceRebuildAccountIds: [] },
        },
      };
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
  async mergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    const records = await this.loadAccountMergeRecords(
      workplaceId,
      sourceAccountIds,
      targetAccountId,
    );
    if (records.sourceAccounts.length !== sourceAccountIds.length) {
      throw new Error('One or more source accounts could not be found in the workplace');
    }

    stageModelWrite(session, () => {
      const { accounts, metadata, audits } = this.prepareLoadedAccountMergeWriteOperations(
        records,
        sourceAccountIds,
        targetAccountId,
        correlationId,
      );
      return [
        ...accounts,
        ...metadata,
        ...audits,
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: targetAccountId,
            eventType: 'account.merged',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: { action: 'MERGE_ACCOUNTS', mergedAccountIds: sourceAccountIds },
            undoable: false,
          },
          workplaceId,
        ),
      ];
    });
  }

  private async loadAccountMergeRecords(
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
  ): Promise<AccountMergeRecords> {
    const [metadataToRetarget, sourceMetadata, sourceChildren, targetChildren, sourceAccounts] =
      await Promise.all([
        this.metadata
          .query(
            Q.where('pay_from_account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
          )
          .fetch(),
        this.metadata
          .query(
            Q.where('account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
          )
          .fetch(),
        this.accounts
          .query(
            Q.where('parent_account_id', Q.oneOf(sourceAccountIds)),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
        this.accounts
          .query(
            Q.where('parent_account_id', targetAccountId),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch(),
        this.accounts
          .query(Q.where('id', Q.oneOf(sourceAccountIds)), Q.where('workplace_id', workplaceId))
          .fetch(),
      ]);
    return { metadataToRetarget, sourceMetadata, sourceChildren, targetChildren, sourceAccounts };
  }

  private prepareLoadedAccountMergeWriteOperations(
    records: AccountMergeRecords,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): AccountMergeWriteOperations {
    const sourceIds = new Set<string>(sourceAccountIds);
    const movedChildren = records.sourceChildren
      .filter(child => !sourceIds.has(child.id))
      .sort((a, b) => (a.orderNum ?? 0) - (b.orderNum ?? 0) || a.id.localeCompare(b.id));
    const nextOrder =
      records.targetChildren.reduce((max, child) => Math.max(max, child.orderNum ?? -1), -1) + 1;
    const accounts: Account[] = [];
    const metadata: AccountMetadata[] = [];
    const audits: AuditLog[] = [];
    const now = new Date();
    const sourceMetadataByAccountId = new Map(
      records.sourceMetadata.map(record => [record.accountId, record]),
    );
    movedChildren.forEach((record, index) => {
      const nextOrderNum = nextOrder + index;
      const before = {
        name: record.name,
        parentAccountId: record.parentAccountId ?? null,
        orderNum: record.orderNum ?? null,
      };
      accounts.push(
        record.prepareUpdate(updated => {
          updated.parentAccountId = targetAccountId;
          updated.orderNum = nextOrderNum;
          updated.updatedAt = now;
        }),
      );
      audits.push(
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: record.id,
            eventType: 'account.hierarchy_retargeted',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: {
              before,
              after: {
                name: record.name,
                parentAccountId: targetAccountId,
                orderNum: nextOrderNum,
              },
            },
            undoable: false,
          },
          record.workplaceId,
        ),
      );
    });
    records.sourceAccounts.forEach(record => {
      const sourceMetadata = sourceMetadataByAccountId.get(record.id);
      accounts.push(
        record.prepareUpdate(updated => {
          updated.deletedAt = now;
          updated.updatedAt = now;
        }),
      );
      audits.push(
        auditRepository.prepareLog(
          {
            entityType: 'account',
            entityId: record.id,
            eventType: 'account.merged_into',
            action: AuditAction.UPDATE,
            source: 'app',
            correlationId,
            changes: {
              before: {
                name: record.name,
                deletedAt: null,
                ...(sourceMetadata ? { metadata: metadataAuditState(sourceMetadata) } : {}),
              },
              after: {
                name: record.name,
                deletedAt: now,
                ...(sourceMetadata ? { metadata: null } : {}),
              },
              mergedIntoAccountId: targetAccountId,
            },
            undoable: false,
          },
          record.workplaceId,
        ),
      );
    });
    records.metadataToRetarget
      .filter(record => !sourceIds.has(record.accountId))
      .forEach(record => {
        const before = metadataAuditState(record);
        const after = { ...before, payFromAccountId: targetAccountId };
        metadata.push(
          record.prepareUpdate(updated => {
            updated.payFromAccountId = targetAccountId;
            updated.updatedAt = now;
          }),
        );
        audits.push(
          auditRepository.prepareLog(
            {
              entityType: 'account',
              entityId: record.accountId,
              eventType: 'account.payment_source_retargeted',
              action: AuditAction.UPDATE,
              source: 'app',
              correlationId,
              changes: { before: { metadata: before }, after: { metadata: after } },
              undoable: false,
            },
            record.workplaceId,
          ),
        );
      });
    metadata.push(...records.sourceMetadata.map(record => record.prepareDestroyPermanently()));

    return { accounts, metadata, audits };
  }
}

export const accountWriteRepository = new AccountWriteRepository();
