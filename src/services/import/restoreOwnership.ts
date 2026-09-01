import type { WorkplaceId } from '@/src/types/ids';
import { restorePublicationClaims } from './restorePublicationClaims';

/** Source, handoff, operation, workplace, and MMKV claim must agree after publication. */
export function isRestoreOwnershipTuple(input: {
  readonly operationId: WorkplaceId;
  readonly sourceFingerprint: string | undefined;
  readonly handoff:
    | {
        readonly operationId: WorkplaceId;
        readonly workplaceId: WorkplaceId;
        readonly fingerprint: string;
      }
    | undefined;
  readonly claimedFingerprint: string | undefined;
}): boolean {
  if (!input.handoff) return true;
  return (
    input.sourceFingerprint !== undefined &&
    input.sourceFingerprint === input.handoff.fingerprint &&
    input.handoff.operationId === input.operationId &&
    input.handoff.workplaceId === input.operationId &&
    input.claimedFingerprint === input.handoff.fingerprint
  );
}

export function claimedRestoreFingerprint(operationId: WorkplaceId): string | undefined {
  return restorePublicationClaims.fingerprintFor(operationId);
}
