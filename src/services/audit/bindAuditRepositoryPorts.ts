import {
  auditRepository,
  type AuditRepositoryPorts,
} from '@/src/data/repositories/AuditRepository';
import { resolveAuditActor } from '@/src/services/audit/resolveAuditActor';
import { logger } from '@/src/services/observability/logger';

const auditRepositoryPorts: AuditRepositoryPorts = {
  resolveActor: resolveAuditActor,
  warn: (message, context) => logger.warn(message, context),
};

/** Wire service-layer actor/logger into AuditRepository (idempotent). */
export function bindAuditRepositoryPorts(): void {
  auditRepository.configure(auditRepositoryPorts);
}
