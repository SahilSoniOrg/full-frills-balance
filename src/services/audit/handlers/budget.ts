import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { revertRegistry, type RevertCapability } from '@/src/services/revert-registry';
import { BudgetId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import {
  type AuditChanges,
  asRecord,
  budgetRevertibleFields,
  eventFieldNames,
} from './shared';

const canRevertBudget: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (action === AuditAction.CREATE) {
    return (
      (!changes.eventType ||
        changes.eventType === 'budget.create' ||
        changes.eventType === 'budget.created') &&
      !!asRecord(changes.after)
    );
  }
  if (action === AuditAction.DELETE) {
    return (
      (!changes.eventType ||
        changes.eventType === 'budget.delete' ||
        changes.eventType === 'budget.deleted') &&
      !!asRecord(changes.before)
    );
  }
  if (
    action !== AuditAction.UPDATE ||
    !changes.before ||
    (changes.eventType !== undefined &&
      changes.eventType !== 'budget.update' &&
      changes.eventType !== 'budget.updated')
  ) {
    return false;
  }
  const fields = eventFieldNames(changes);
  return fields.length > 0 && fields.every(field => budgetRevertibleFields.has(field));
};

export function registerBudgetAuditHandler(): void {
  revertRegistry.register(
    'budget',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      if (!context?.auditLogId)
        throw new Error('The selected history entry could not be identified.');
      await budgetRepository.revertAuditEntry(
        workplaceId,
        entityId as BudgetId,
        action as AuditAction,
        asRecord(changes.before),
        asRecord(changes.after),
        eventFieldNames(changes),
        context.auditLogId,
      );
      return true;
    },
    canRevertBudget,
  );
}
