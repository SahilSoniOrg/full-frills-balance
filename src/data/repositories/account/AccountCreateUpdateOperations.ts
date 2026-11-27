import {
  getStagedAccounts,
  getStagedPersonAccounts,
  runAccountingWriteSession,
  stageAccountCreation,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { getDefaultSubtypeForType, isSubtypeAllowedForType } from '@/src/types/accountSubtype';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { AccountSubtype, AccountType, AuditAction } from '@/src/types/enums';
import { accountMetadataAuditState } from '@/src/domain/audit/accountMetadataAuditState';
import { ValidationError } from '@/src/utils/errors';
import { Model, Q } from '@nozbe/watermelondb';
import { accountQueryRepository } from './AccountQueryRepository';
import { transactionQueryRepository } from '../transaction/TransactionQueryRepository';
import { personQueryRepository } from '../people/PersonQueryRepository';
import type { AccountPersistenceInput } from './types';
import { accountsCollection, accountMetadataCollection } from './accountWriteCollections';
import { commitAccountMutationPlan } from './accountMutationCommit';
import type {
  AccountAuditContribution,
  AccountMutationPlan,
  AccountMutationResult,
} from './accountWriteTypes';

/** Persist a catalog IconName — never leave the column empty when type/name imply a fallback. */
function persistedAccountIcon(fields: {
  name?: string | null;
  icon?: string | null;
  accountType?: AccountType | string | null;
}): string {
  return getAccountIcon(fields);
}

function assertCurrencyUnchanged(
  account: Account,
  updates: Partial<AccountPersistenceInput>,
): void {
  if (updates.currencyCode !== undefined && updates.currencyCode !== account.currencyCode) {
    throw new ValidationError('Account currency changes require a validated update plan');
  }
}

export async function ensureUniqueAccountName(
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

  const potentialDuplicates = await accountsCollection()
    .query(...clauses)
    .fetch();

  const duplicate = potentialDuplicates.find(account => {
    if (excludeId && account.id === excludeId) return false;
    return account.name.trim().toLowerCase() === sanitizedName.toLowerCase();
  });

  if (duplicate) {
    throw new ValidationError(`Account with name "${name}" already exists`);
  }
}

export function validateAccountSubtype(accountType: AccountType, subtype?: AccountSubtype): void {
  if (!isSubtypeAllowedForType(accountType, subtype)) {
    throw new ValidationError(`Subtype ${subtype} is not valid for account type ${accountType}`);
  }
}

function prepareCreateAuditLog(
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
          metadata: metadata ? accountMetadataAuditState(metadata) : null,
          initialBalance,
        },
      },
    },
    data.workplaceId!,
  );
}

export function prepareAccountCreateOps(
  data: AccountPersistenceInput,
  options: { audit?: { initialBalance?: number; correlationId?: string } } = {},
): { account: Account; ops: Model[] } {
  if (!data.workplaceId) {
    throw new ValidationError('workplaceId is required to create an account');
  }
  const payload: AccountPersistenceInput = {
    ...data,
    accountSubtype: data.accountSubtype ?? getDefaultSubtypeForType(data.accountType),
    icon: persistedAccountIcon({
      name: data.name,
      icon: data.icon,
      accountType: data.accountType,
    }),
  };
  validateAccountSubtype(payload.accountType, payload.accountSubtype);

  const account = accountsCollection().prepareCreate(acc => {
    const { metadata, id, ...accountData } = payload;
    if (id) acc._raw.id = id;
    Object.assign(acc, accountData);
    acc.createdAt = new Date();
    acc.updatedAt = new Date();
  });

  const ops: Model[] = [account];
  if (data.metadata) {
    ops.push(
      accountMetadataCollection().prepareCreate(meta => {
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
      prepareCreateAuditLog(
        account,
        data,
        options.audit.initialBalance,
        options.audit.correlationId,
      ),
    );
  }

  return { account, ops };
}

/**
 * Stage account creation in a caller-owned atomic accounting write.
 * The session keeps prepared models private to the repository layer.
 */
export async function createAccountInSession(
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
  await ensureUniqueAccountName(data.name, data.workplaceId);
  if (
    data.parentAccountId &&
    ((await personQueryRepository.findPersonAccountByAccountId(
      data.workplaceId,
      data.parentAccountId,
    )) ||
      getStagedPersonAccounts(session, data.workplaceId).some(
        link => link.accountId === data.parentAccountId,
      ))
  )
    throw new Error('A People account cannot have child accounts');

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

  const prepared = prepareAccountCreateOps(payload, options.audit ? { audit: options.audit } : {});
  const operations = [...prepared.ops];
  stageAccountCreation(session, prepared.account, operations);
  return prepared.account;
}

export async function createAccount(data: AccountPersistenceInput): Promise<Account> {
  return runAccountingWriteSession(session => createAccountInSession(session, data));
}

/**
 * Validate + read everything needed before prepare→batch.
 * Callers that own the write (e.g. archive compose) use this with prepareUpdateBatchOps.
 */
export async function planAccountUpdate(
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
  const currencyChanged =
    updates.currencyCode !== undefined && updates.currencyCode !== account.currencyCode;
  const typeChanged =
    updates.accountType !== undefined && updates.accountType !== account.accountType;
  const subtypeChanged =
    updates.accountSubtype !== undefined && updates.accountSubtype !== account.accountSubtype;
  if (
    (currencyChanged || typeChanged || subtypeChanged) &&
    (await personQueryRepository.findPersonAccountByAccountId(workplaceId, account.id))
  ) {
    throw new Error('Cannot change the type or currency of an account linked to a person');
  }
  if (
    currencyChanged &&
    (await transactionQueryRepository.countByAccountIncludingDeleted(workplaceId, account.id)) > 0
  ) {
    throw new ValidationError(
      'Account currency cannot be changed after transactions have been recorded, including deleted transactions',
    );
  }
  if (updates.name && updates.name !== account.name) {
    await ensureUniqueAccountName(updates.name, workplaceId, account.id);
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
  validateAccountSubtype(nextType, nextSubtype);

  const existingMetadata = Object.prototype.hasOwnProperty.call(updates, 'metadata')
    ? await accountQueryRepository.findMetadata(workplaceId, account.id)
    : null;

  const rebuildsBalance =
    currencyChanged ||
    (normalizedUpdates.accountType !== undefined &&
      normalizedUpdates.accountType !== account.accountType);

  return {
    workplaceId,
    account,
    normalizedUpdates,
    existingMetadata,
    audit,
    currencyChangeAllowed: currencyChanged,
    commitFacts: {
      balanceRebuildAccountIds: rebuildsBalance ? [account.id] : [],
    },
  };
}

/**
 * Sync prepare of account (+ optional metadata) ops.
 * Call only inside db.write after all awaits — WatermelonDB requires prepare→batch sync.
 */
export function prepareAccountUpdateBatchOps(
  account: Account,
  updates: Partial<AccountPersistenceInput>,
  existingMetadata: AccountMetadata | null,
  validatedPlan?: AccountMutationPlan,
): Model[] {
  // Currency authorization comes from planUpdate in this same writer, after
  // checking the complete transaction history. Unplanned batch writes stay locked.
  if (
    !validatedPlan?.currencyChangeAllowed ||
    validatedPlan.account !== account ||
    validatedPlan.normalizedUpdates.currencyCode !== updates.currencyCode
  ) {
    assertCurrencyUnchanged(account, updates);
  }
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
        // Always store a catalog IconName (heals legacy empty/unknown on any edit).
        acc.icon = persistedAccountIcon({
          name: acc.name,
          icon: 'icon' in updates ? (updates.icon ?? null) : acc.icon,
          accountType: acc.accountType,
        });
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
          accountMetadataCollection().prepareCreate(meta => {
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

export async function updateAccount(
  account: Account,
  updates: Partial<AccountPersistenceInput>,
  workplaceId: WorkplaceId,
  options: {
    audit?: AccountAuditContribution;
    extraOps?: (account: Account, metadata: AccountMetadata | null) => Model[];
    validateCurrent?: (account: Account, metadata: AccountMetadata | null) => void | Promise<void>;
  } = {},
): Promise<AccountMutationResult> {
  return commitAccountMutationPlan(async () => {
    const plan = await planAccountUpdate(account, updates, workplaceId, options.audit);
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
      rebuildRequest: {
        workplaceId: plan.workplaceId,
        accountIds: plan.commitFacts.balanceRebuildAccountIds,
        fromDate: 0,
      },
      prepareOps: () => [
        ...prepareAccountUpdateBatchOps(
          currentAccount,
          plan.normalizedUpdates,
          currentMetadata,
          plan,
        ),
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
