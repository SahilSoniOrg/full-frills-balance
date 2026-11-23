import type { AccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType } from '@/src/types/enums';
import { Model } from '@nozbe/watermelondb';
import { stageAccountMergeInSession } from './AccountMergeOperations';
import {
  createAccount,
  createAccountInSession,
  ensureUniqueAccountName,
  planAccountUpdate,
  prepareAccountCreateOps,
  prepareAccountUpdateBatchOps,
  updateAccount,
  validateAccountSubtype,
} from './AccountCreateUpdateOperations';
import {
  deleteAccount,
  prepareArchiveTargetOps as prepareArchiveTargetOpsImpl,
  recoverAccount,
} from './AccountLifecycleOperations';
import {
  prepareAccountRefresh,
  refreshAccounts as refreshAccountsImpl,
} from './AccountRefreshOperations';
import { commitAccountMutationPlan } from './accountMutationCommit';
import type { AccountPersistenceInput } from './types';
import type {
  AccountAuditContribution,
  AccountMutationPlan,
  AccountMutationResult,
  PreparedAccountMutation,
} from './accountWriteTypes';

export type { AccountMutationCommitFacts, AccountMutationResult } from './accountWriteTypes';

/** Thin façade over create/update, lifecycle, refresh, and merge account writes. */
export class AccountWriteRepository {
  async create(data: AccountPersistenceInput): Promise<Account> {
    return createAccount(data);
  }

  async commitMutationPlan<T>(prepare: () => Promise<PreparedAccountMutation<T>>): Promise<T> {
    return commitAccountMutationPlan(prepare);
  }

  async createInSession(
    session: AccountingWriteSession,
    data: AccountPersistenceInput,
    options: {
      appendWithinSiblingList?: boolean;
      audit?: { initialBalance?: number; correlationId?: string };
    } = {},
  ): Promise<Account> {
    return createAccountInSession(session, data, options);
  }

  prepareCreateOps(
    data: AccountPersistenceInput,
    options: { audit?: { initialBalance?: number; correlationId?: string } } = {},
  ): { account: Account; ops: Model[] } {
    return prepareAccountCreateOps(data, options);
  }

  async planUpdate(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    workplaceId: WorkplaceId,
    audit?: AccountAuditContribution,
  ): Promise<AccountMutationPlan> {
    return planAccountUpdate(account, updates, workplaceId, audit);
  }

  prepareUpdateBatchOps(
    account: Account,
    updates: Partial<AccountPersistenceInput>,
    existingMetadata: AccountMetadata | null,
    validatedPlan?: AccountMutationPlan,
  ): Model[] {
    return prepareAccountUpdateBatchOps(account, updates, existingMetadata, validatedPlan);
  }

  async refreshAccounts(workplaceId: WorkplaceId, accountIds: AccountId[]): Promise<void> {
    return refreshAccountsImpl(workplaceId, accountIds);
  }

  prepareArchiveTargetOps(
    archiveTargets: Account[],
    unarchiveTargets: Account[],
    now: Date,
  ): Model[] {
    return prepareArchiveTargetOpsImpl(archiveTargets, unarchiveTargets, now);
  }

  prepareRefresh(workplaceId: WorkplaceId, account: Account): Account {
    return prepareAccountRefresh(workplaceId, account);
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
    return updateAccount(account, updates, workplaceId, options);
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
    return deleteAccount(workplaceId, account, options);
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
    return recoverAccount(workplaceId, account, options);
  }

  async ensureUniqueName(
    name: string,
    workplaceId: WorkplaceId,
    excludeId?: AccountId,
  ): Promise<void> {
    return ensureUniqueAccountName(name, workplaceId, excludeId);
  }

  validateSubtype(accountType: AccountType, subtype?: AccountSubtype): void {
    validateAccountSubtype(accountType, subtype);
  }

  /** Stage account-owned reference changes, source deletion, and audit in one session batch. */
  async mergeInSession(
    session: AccountingWriteSession,
    workplaceId: WorkplaceId,
    sourceAccountIds: AccountId[],
    targetAccountId: AccountId,
    correlationId?: string,
  ): Promise<void> {
    return stageAccountMergeInSession(
      session,
      workplaceId,
      sourceAccountIds,
      targetAccountId,
      correlationId,
    );
  }
}

export const accountWriteRepository = new AccountWriteRepository();
