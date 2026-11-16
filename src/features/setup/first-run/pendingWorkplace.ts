import { generator } from '@/src/utils/idGenerator';
import { asWorkplaceId, type WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/data/storage/storage';

const PENDING_WORKPLACE_KEY = 'cash_clarity_pending_workplace_id';

export function readPendingCashClarityWorkplaceId(): WorkplaceId | undefined {
  // A pre-session bare ID is not publication evidence and must never retarget a new session.
  return undefined;
}

export function cashClarityWorkplaceId(): WorkplaceId {
  // The conversational session owns this ID; there is no parallel ID writer.
  return asWorkplaceId(generator());
}

export function clearPendingCashClarityWorkplaceId(): void {
  storage.remove(PENDING_WORKPLACE_KEY);
}
