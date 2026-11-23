import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { WORKPLACE_REVERT_CONFLICT_MESSAGE } from '@/src/domain/audit/revertErrors';
import { revertRegistry, type RevertCapability } from '@/src/services/revert-registry';
import { WorkplaceId } from '@/src/types/ids';
import { AuditAction } from '@/src/types/enums';
import { type AuditChanges, asRecord, eventFieldNames, workplaceRevertibleFields } from './shared';

const canRevertWorkplace: RevertCapability = (action, rawChanges) => {
  if (action !== AuditAction.UPDATE) return false;
  const changes = rawChanges as AuditChanges;
  const fields = eventFieldNames(changes);
  return (
    !!changes.before &&
    !!changes.after &&
    fields.length > 0 &&
    fields.every(field => workplaceRevertibleFields.has(field))
  );
};

export function registerWorkplaceAuditHandler(): void {
  revertRegistry.register(
    'workplace',
    async (entityId, rawChanges, action, workplaceId, context) => {
      if (action !== AuditAction.UPDATE) return false;
      const changes = rawChanges as AuditChanges;
      const before = asRecord(changes.before);
      const after = asRecord(changes.after);
      const fields = eventFieldNames(changes);
      const workplace = await workplaceRepository.find(entityId as WorkplaceId);
      if (!before || !after || !workplace || workplace.id !== workplaceId) {
        throw new Error(WORKPLACE_REVERT_CONFLICT_MESSAGE);
      }

      const patch: Partial<{
        name: string;
        icon: string;
        defaultCurrencyCode: string;
      }> = {};
      const expectedCurrent: Partial<typeof patch> = {};
      for (const field of fields) {
        if (!workplaceRevertibleFields.has(field)) return false;
        const previous = before[field];
        const expectedValue = after[field];
        if (typeof previous !== 'string' || typeof expectedValue !== 'string') {
          throw new Error(WORKPLACE_REVERT_CONFLICT_MESSAGE);
        }
        patch[field as keyof typeof patch] = previous;
        expectedCurrent[field as keyof typeof expectedCurrent] = expectedValue;
      }

      if (fields.length === 0) return false;
      await workplaceRepository.update(workplace, patch, {
        source: 'app',
        eventType: 'workplace.reverted',
        undoable: false,
        revertsLogId: context?.auditLogId,
        expectedCurrent,
      });
      return true;
    },
    canRevertWorkplace,
  );
}
