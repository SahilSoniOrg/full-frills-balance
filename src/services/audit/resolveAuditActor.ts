import { getLocalAuditActorId } from '@/src/services/audit-identity';
import type { AuditActor, AuditEventSource } from '@/src/types/auditEvents';

export function resolveAuditActor(source?: AuditEventSource): AuditActor {
  if (source === 'system' || source === 'repair') return { type: 'system' };
  if (source !== undefined && source !== 'app' && source !== 'import') {
    return { type: 'unknown' };
  }
  const id = getLocalAuditActorId();
  return {
    type: 'user',
    ...(id ? { id, idScope: 'local-install' } : {}),
  };
}
