import { registerAuditHandlers } from '@/src/services/audit-handlers';

/**
 * One-shot app side-effect registration that must run on cold start.
 * Safe to call repeatedly — individual registrars are idempotent.
 */
export function runAppBootstrapSideEffects(): void {
  registerAuditHandlers();
}
