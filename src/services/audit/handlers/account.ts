import { deleteAccount, recoverAccount } from '@/src/services/accounts/accountDeleteCommands';
import {
  accountMatchesAuditSnapshot,
  revertAccountFromAuditState,
} from '@/src/services/accounts/accountAuditCommands';
import { ACCOUNT_REVERT_CONFLICT_MESSAGE } from '@/src/domain/audit/revertErrors';
import { revertRegistry, type RevertCapability } from '@/src/services/revert-registry';
import { AccountAuditState } from '@/src/types/audit';
import { AccountId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import {
  type AuditChanges,
  accountRevertibleFields,
  asRecord,
  capabilityForFields,
  eventFieldNames,
} from './shared';

const canRevertAccount: RevertCapability = (action, rawChanges) => {
  if (action !== AuditAction.CREATE) {
    return capabilityForFields(accountRevertibleFields)(action, rawChanges);
  }
  const after = asRecord(rawChanges.after);
  if (!after) return false;
  const initialBalance = after.initialBalance;
  return initialBalance == null || initialBalance === 0;
};

export function registerAccountAuditHandler(): void {
  revertRegistry.register(
    'account',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      const accountId = entityId as AccountId;
      if (action === AuditAction.CREATE) {
        const after = asRecord(changes.after);
        if (
          !after ||
          !(await accountMatchesAuditSnapshot(
            workplaceId,
            accountId,
            { ...after, deletedAt: null },
            ['initialBalance'],
          ))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await deleteAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: { ...after, deletedAt: null },
          ignoredExpectedFields: ['initialBalance'],
        });
        return true;
      }
      if (action === AuditAction.DELETE) {
        const before = asRecord(changes.before);
        const after = asRecord(changes.after);
        if (
          !before ||
          !after ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, before, ['deletedAt'])) ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, after))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await recoverAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: { ...before, ...after },
        });
        return true;
      }
      if (action !== AuditAction.UPDATE || !changes.before) return false;
      if ('deletedAt' in changes.before) {
        if (
          !changes.after ||
          !(await accountMatchesAuditSnapshot(workplaceId, accountId, changes.after))
        ) {
          throw new Error(ACCOUNT_REVERT_CONFLICT_MESSAGE);
        }
        await deleteAccount(accountId, workplaceId, {
          revertsLogId: context?.auditLogId,
          expectedCurrent: changes.after,
        });
        return true;
      }

      return revertAccountFromAuditState(
        workplaceId,
        accountId,
        changes.before as AccountAuditState,
        {
          changedFields: eventFieldNames(changes),
          expectedAfter: changes.after,
          auditLogId: context?.auditLogId,
        },
      );
    },
    canRevertAccount,
  );
}
