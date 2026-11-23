import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { revertRegistry, type RevertCapability } from '@/src/services/revert-registry';
import { PlannedPaymentId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import {
  type AuditChanges,
  asRecord,
  eventFieldNames,
  plannedPaymentRevertibleFields,
} from './shared';

const canRevertPlannedPayment: RevertCapability = (action, rawChanges) => {
  const changes = rawChanges as AuditChanges;
  if (
    action !== AuditAction.UPDATE ||
    changes.eventType !== 'planned_payment.updated' ||
    !changes.before ||
    !asRecord(changes.after)
  ) {
    return false;
  }
  const fields = eventFieldNames(changes);
  return fields.length > 0 && fields.every(field => plannedPaymentRevertibleFields.has(field));
};

export function registerPlannedPaymentAuditHandler(): void {
  revertRegistry.register(
    'planned_payment',
    async (entityId, rawChanges, action, workplaceId, context) => {
      const changes = rawChanges as AuditChanges;
      const before = asRecord(changes.before);
      const after = asRecord(changes.after);
      if (action !== AuditAction.UPDATE || !before || !after || !context?.auditLogId) {
        return false;
      }
      await plannedPaymentRepository.revertAuditUpdate(
        workplaceId,
        entityId as PlannedPaymentId,
        before,
        after,
        eventFieldNames(changes),
        context.auditLogId,
      );
      return true;
    },
    canRevertPlannedPayment,
  );
}
