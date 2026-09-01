import { asWorkplaceId } from '@/src/types/ids';
import { isRestoreOwnershipTuple } from '../restoreOwnership';

describe('isRestoreOwnershipTuple', () => {
  const operationId = asWorkplaceId('operation');

  it('allows a source-only draft before publication', () => {
    expect(
      isRestoreOwnershipTuple({
        operationId,
        sourceFingerprint: 'abc',
        handoff: undefined,
        claimedFingerprint: undefined,
      }),
    ).toBe(true);
  });

  it('requires source, workplace, and claim to match the handoff', () => {
    const handoff = {
      operationId,
      workplaceId: operationId,
      fingerprint: 'abc',
    };
    expect(
      isRestoreOwnershipTuple({
        operationId,
        sourceFingerprint: 'abc',
        handoff,
        claimedFingerprint: 'abc',
      }),
    ).toBe(true);
    expect(
      isRestoreOwnershipTuple({
        operationId,
        sourceFingerprint: 'other',
        handoff,
        claimedFingerprint: 'abc',
      }),
    ).toBe(false);
    expect(
      isRestoreOwnershipTuple({
        operationId,
        sourceFingerprint: 'abc',
        handoff: { ...handoff, workplaceId: asWorkplaceId('other') },
        claimedFingerprint: 'abc',
      }),
    ).toBe(false);
    expect(
      isRestoreOwnershipTuple({
        operationId,
        sourceFingerprint: 'abc',
        handoff,
        claimedFingerprint: undefined,
      }),
    ).toBe(false);
  });
});
