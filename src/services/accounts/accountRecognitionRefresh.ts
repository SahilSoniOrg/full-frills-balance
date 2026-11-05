import type { WorkplaceId } from '@/src/types/ids';
import {
  withRecognitionRefresh,
  withRecognitionRefreshWhen,
} from '@/src/services/sms/refreshSmsRecognition';

/**
 * Accounts-layer door for recognition refresh. The wrapper surrounds the write;
 * post-write side effects do not see create, delete, merge, disband, or audit revert.
 */
export function withAccountRecognitionRefresh<T>(
  workplaceId: WorkplaceId,
  write: () => Promise<T>,
): Promise<T> {
  return withRecognitionRefresh(workplaceId, write);
}

/** Refresh only when the write calls `invalidate` because parent or type actually changed. */
export function withAccountRecognitionRefreshWhen<T>(
  workplaceId: WorkplaceId,
  write: (invalidate: () => void) => Promise<T>,
): Promise<T> {
  return withRecognitionRefreshWhen(workplaceId, write);
}

/** Refresh when the caller already knows this write changes matcher eligibility. */
export function withAccountRecognitionRefreshIf<T>(
  workplaceId: WorkplaceId,
  eligibilityChanged: boolean,
  write: () => Promise<T>,
): Promise<T> {
  return eligibilityChanged ? withRecognitionRefresh(workplaceId, write) : write();
}
