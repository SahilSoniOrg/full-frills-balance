import { AUDIT_ENTITY_CAPABILITIES } from '@/src/types/auditEntityCapabilities';
import { revertRegistry } from '@/src/services/revert-registry';
import { registerJournalAuditHandler } from '@/src/services/audit/handlers/journal';
import { registerAccountAuditHandler } from '@/src/services/audit/handlers/account';
import { registerBudgetAuditHandler } from '@/src/services/audit/handlers/budget';
import { registerPlannedPaymentAuditHandler } from '@/src/services/audit/handlers/plannedPayment';
import { registerWorkplaceAuditHandler } from '@/src/services/audit/handlers/workplace';

/** Register event-specific undo behavior and capability checks at app bootstrap. */
let registered = false;

/** Thin façade: public import path stays `@/src/services/audit-handlers`. */
export function registerAuditHandlers(): void {
  if (registered) return;

  registerJournalAuditHandler();
  registerAccountAuditHandler();
  registerBudgetAuditHandler();
  registerPlannedPaymentAuditHandler();
  registerWorkplaceAuditHandler();

  const declaredHandlers = Object.entries(AUDIT_ENTITY_CAPABILITIES)
    .filter(([, capability]) => capability.revertHandler !== 'none')
    .map(([entityType]) => entityType)
    .sort();
  const registeredHandlers = revertRegistry.getRegisteredEntityTypes();
  if (JSON.stringify(declaredHandlers) !== JSON.stringify(registeredHandlers)) {
    throw new Error(
      `Audit revert registry does not match entity capabilities (declared: ${declaredHandlers.join(', ')}; registered: ${registeredHandlers.join(', ')})`,
    );
  }
  registered = true;
}
