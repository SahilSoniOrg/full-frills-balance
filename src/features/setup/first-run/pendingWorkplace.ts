import { generator } from '@/src/data/database/idGenerator';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';

const PENDING_WORKPLACE_KEY = 'cash_clarity_pending_workplace_id';

export function readPendingCashClarityWorkplaceId(): WorkplaceId | undefined {
  const value = storage.getString(PENDING_WORKPLACE_KEY);
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return asWorkplaceId(value);
}

export function cashClarityWorkplaceId(): WorkplaceId {
  const existing = readPendingCashClarityWorkplaceId();
  if (existing) return existing;
  const id = asWorkplaceId(generator());
  storage.set(PENDING_WORKPLACE_KEY, id);
  return id;
}

export function clearPendingCashClarityWorkplaceId(): void {
  storage.remove(PENDING_WORKPLACE_KEY);
}
