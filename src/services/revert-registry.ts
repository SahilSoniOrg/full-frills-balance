import { WorkplaceId } from '@/src/types/ids';

export const REVERT_CONFLICT_MESSAGE =
  'This journal changed after the selected history entry. Refresh and review the latest change.';

export const ACCOUNT_REVERT_CONFLICT_MESSAGE =
  'This account changed after the selected history entry. Refresh and review the latest change.';

export const WORKPLACE_REVERT_CONFLICT_MESSAGE =
  'This Workplace changed after the selected history entry. Refresh and review the latest change.';

export interface AuditRevertContext {
  auditLogId: string;
}

export type RevertHandler<T = any> = (
  entityId: string,
  changes: { before?: Partial<T>; after?: Partial<T> },
  action: string,
  workplaceId: WorkplaceId,
  context?: AuditRevertContext,
) => Promise<void | boolean>;

export type RevertCapability = (action: string, changes: Record<string, unknown>) => boolean;

interface RevertRegistration {
  handler: RevertHandler;
  canRevert: RevertCapability;
}

class RevertRegistry {
  private handlers = new Map<string, RevertRegistration>();

  register(entityType: string, handler: RevertHandler, canRevert?: RevertCapability) {
    this.handlers.set(entityType.toLowerCase(), {
      handler,
      canRevert:
        canRevert ??
        ((action, changes) =>
          action === 'CREATE' || action === 'DELETE' || Boolean(changes.before)),
    });
  }

  getHandler(entityType: string): RevertHandler | undefined {
    return this.handlers.get(entityType.toLowerCase())?.handler;
  }

  getRegisteredEntityTypes(): string[] {
    return [...this.handlers.keys()].sort();
  }

  supports(entityType: string, action: string, changes: Record<string, unknown>): boolean {
    const registration = this.handlers.get(entityType.toLowerCase());
    return registration ? registration.canRevert(action, changes) : false;
  }
}

export const revertRegistry = new RevertRegistry();
