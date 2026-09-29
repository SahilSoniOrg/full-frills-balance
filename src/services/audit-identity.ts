import { generator } from '@/src/data/database/idGenerator';
import { storage } from '@/src/utils/storage';
import { logger } from '@/src/utils/logger';

const LOCAL_AUDIT_ACTOR_ID_KEY = 'full_frills_balance_audit_actor_id_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Stable identity for events authored by this local install. It is intentionally separate
 * from the analytics distinct ID and from exported user preferences.
 */
export function getLocalAuditActorId(): string | undefined {
  try {
    const stored = storage.getString(LOCAL_AUDIT_ACTOR_ID_KEY);
    if (stored && UUID_PATTERN.test(stored)) return stored;

    const generated = generator();
    storage.set(LOCAL_AUDIT_ACTOR_ID_KEY, generated);
    return generated;
  } catch (error) {
    logger.warn('[AuditIdentity] Could not persist local actor identity', { error });
    return undefined;
  }
}

/** Forget the identity when the local database is factory-reset. */
export function clearLocalAuditActorId(): void {
  try {
    storage.remove(LOCAL_AUDIT_ACTOR_ID_KEY);
  } catch (error) {
    logger.warn('[AuditIdentity] Could not clear local actor identity', { error });
  }
}
