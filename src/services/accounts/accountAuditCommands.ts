import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { accountQueryRepository, accountWriteRepository } from '@/src/data/repositories/account';
import type { AccountPersistenceInput } from '@/src/data/repositories/account/types';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import { normalizeAccountAuditState } from '@/src/services/accounts/accountAuditState';
import { AccountAuditState } from '@/src/types/audit';
import { AuditAction } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';

export interface RevertAccountAuditOptions {
  changedFields?: string[];
  expectedAfter?: Record<string, unknown>;
  auditLogId?: string;
}

function metadataSnapshot(metadata: AccountMetadata | null): Record<string, unknown> | null {
  if (!metadata) return null;
  return {
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
  };
}

function currentFieldValue(
  field: string,
  account: Awaited<ReturnType<typeof accountQueryRepository.findWithDeleted>> & {},
  metadata: AccountMetadata | null,
): unknown {
  if (!account) return undefined;
  if (field === 'metadata') return metadataSnapshot(metadata);
  if (field === 'parentAccountId') return account.parentAccountId ?? null;
  if (field === 'archivedAt') return account.archivedAt?.toISOString() ?? null;
  if (field === 'deletedAt') return account.deletedAt?.toISOString() ?? null;
  if (field === 'reconciledAt') return account.reconciledAt?.toISOString() ?? null;
  if (field === 'restoredAt') return account.updatedAt?.toISOString() ?? null;
  if (field === 'orderNum') return account.orderNum ?? null;
  const value = (account as unknown as Record<string, unknown>)[field];
  return value === undefined ? null : value;
}

function matchesExpected(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual ?? null) === JSON.stringify(expected ?? null);
}

/** Compare a persisted snapshot with the current account fields before an undo writes. */
export async function accountMatchesAuditSnapshot(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  snapshot: Record<string, unknown>,
  ignoredFields: readonly string[] = [],
): Promise<boolean> {
  const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
  if (!account) return false;
  const fields = Object.keys(snapshot).filter(
    field => field !== 'action' && !ignoredFields.includes(field),
  );
  const metadata = fields.includes('metadata')
    ? await accountQueryRepository.findMetadata(workplaceId, accountId)
    : null;
  return matchesAccountAuditSnapshotState(account, metadata, snapshot, ignoredFields);
}

export function assertAccountAuditSnapshot(
  account: NonNullable<Awaited<ReturnType<typeof accountQueryRepository.findWithDeleted>>>,
  metadata: AccountMetadata | null,
  snapshot: Record<string, unknown>,
  ignoredFields: readonly string[] = [],
): void {
  if (!matchesAccountAuditSnapshotState(account, metadata, snapshot, ignoredFields)) {
    throw new Error(
      'This account changed after the selected history entry. Refresh and review the latest change.',
    );
  }
}

function matchesAccountAuditSnapshotState(
  account: NonNullable<Awaited<ReturnType<typeof accountQueryRepository.findWithDeleted>>>,
  metadata: AccountMetadata | null,
  snapshot: Record<string, unknown>,
  ignoredFields: readonly string[],
): boolean {
  const fields = Object.keys(snapshot).filter(
    field => field !== 'action' && !ignoredFields.includes(field),
  );
  for (const field of fields) {
    if (
      ![
        'name',
        'accountType',
        'accountSubtype',
        'currencyCode',
        'description',
        'icon',
        'color',
        'parentAccountId',
        'orderNum',
        'reconciledAt',
        'restoredAt',
        'archivedAt',
        'deletedAt',
        'metadata',
      ].includes(field)
    ) {
      return false;
    }
    if (!matchesExpected(currentFieldValue(field, account, metadata), snapshot[field])) {
      return false;
    }
  }
  return fields.length > 0;
}

function currentSnapshotValue(
  field: string,
  account: NonNullable<Awaited<ReturnType<typeof accountQueryRepository.findWithDeleted>>>,
  metadata: AccountMetadata | null,
): unknown {
  return currentFieldValue(field, account, metadata);
}

/**
 * Restores only fields changed by this event, checks that those fields have not since
 * changed, and writes the compensating audit entry in the same database batch.
 */
export async function revertAccountFromAuditState(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  beforeRaw: AccountAuditState | Record<string, unknown>,
  options: RevertAccountAuditOptions = {},
): Promise<boolean> {
  const before = normalizeAccountAuditState(beforeRaw);
  const account = await accountQueryRepository.findWithDeleted(workplaceId, accountId);
  if (!account) throw new Error('Account not found');

  const changedFields = options.changedFields?.length
    ? [...new Set(options.changedFields)]
    : Object.keys(beforeRaw);
  if (changedFields.length === 0) return false;

  const metadata = changedFields.includes('metadata')
    ? await accountQueryRepository.findMetadata(workplaceId, accountId)
    : null;
  const expectedAfter = options.expectedAfter ?? {};
  for (const field of changedFields) {
    if (!Object.prototype.hasOwnProperty.call(expectedAfter, field)) continue;
    if (!matchesExpected(currentSnapshotValue(field, account, metadata), expectedAfter[field])) {
      throw new Error(
        'This account changed after the selected history entry. Refresh and review the latest change.',
      );
    }
  }

  const payload: Partial<AccountPersistenceInput> = {};
  const includes = (field: string) => changedFields.includes(field);
  if (includes('name') && before.name !== undefined && before.name !== null)
    payload.name = before.name;
  if (includes('accountType') && before.accountType !== undefined)
    payload.accountType = before.accountType;
  if (includes('accountSubtype') && before.accountSubtype !== undefined)
    payload.accountSubtype = before.accountSubtype;
  if (includes('currencyCode') && before.currencyCode !== undefined)
    payload.currencyCode = before.currencyCode;
  if (includes('description') && 'description' in before)
    payload.description = before.description ?? null;
  if (includes('icon') && 'icon' in before) payload.icon = before.icon ?? null;
  if (includes('color') && 'color' in before) payload.color = before.color ?? undefined;
  if (includes('parentAccountId') && 'parentAccountId' in before)
    payload.parentAccountId = before.parentAccountId ?? null;
  if (includes('orderNum') && 'orderNum' in before) payload.orderNum = before.orderNum ?? null;
  if (includes('reconciledAt') && 'reconciledAt' in before)
    payload.reconciledAt = before.reconciledAt ?? null;
  if (includes('deletedAt') && 'deletedAt' in before) payload.deletedAt = before.deletedAt ?? null;
  if (includes('archivedAt') && 'archivedAt' in before)
    payload.archivedAt = before.archivedAt ?? null;
  if (includes('metadata') && 'metadata' in before) {
    payload.metadata = before.metadata as Partial<AccountPersistenceInput['metadata']> | null;
  }

  if (Object.keys(payload).length === 0) return false;

  await accountWriteRepository.update(
    account,
    payload,
    workplaceId,
    {
      extraOps: (currentAccount, currentMetadata) => {
        const auditBefore: Record<string, unknown> = {};
        for (const field of changedFields) {
          auditBefore[field] = currentFieldValue(field, currentAccount, currentMetadata);
        }
        return [
          auditRepository.prepareLog(
            {
              entityType: 'account',
              entityId: accountId,
              eventType: 'account.reverted',
              action: AuditAction.UPDATE,
              source: 'app',
              revertsLogId: options.auditLogId,
              changes: { before: auditBefore, after: payload },
            },
            workplaceId,
          ),
        ];
      },
      validateCurrent: (currentAccount, currentMetadata) => {
        for (const field of changedFields) {
          if (
            Object.prototype.hasOwnProperty.call(expectedAfter, field) &&
            !matchesExpected(
              currentSnapshotValue(field, currentAccount, currentMetadata),
              expectedAfter[field],
            )
          ) {
            throw new Error(
              'This account changed after the selected history entry. Refresh and review the latest change.',
            );
          }
        }
      },
    },
  );

  return true;
}
