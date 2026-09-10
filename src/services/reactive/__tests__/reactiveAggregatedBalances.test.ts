import Account from '@/src/data/models/Account';
import { snapshotAccountObservation } from '@/src/services/reactive/reactiveAggregatedBalances';
import { AccountId } from '@/src/types/ids';

describe('snapshotAccountObservation', () => {
  it('preserves the pre-write signature when WatermelonDB reuses model references', () => {
    const account = {
      id: '00000000-0000-4000-8000-000000000005',
      archivedAt: undefined,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      reconciledAt: undefined,
    } as unknown as Account;

    const before = snapshotAccountObservation([account]);
    account.archivedAt = new Date('2026-01-02T00:00:00.000Z');
    const after = snapshotAccountObservation([account]);

    expect(after.signature).not.toBe(before.signature);
    expect(before.signature).toContain(':null:');
  });

  it('refreshes when an account hierarchy placement changes', () => {
    const account = {
      id: '00000000-0000-4000-8000-000000000006',
      parentAccountId: null,
      orderNum: 0,
    } as unknown as Account;

    const before = snapshotAccountObservation([account]);
    account.parentAccountId = '00000000-0000-4000-8000-000000000007' as AccountId;
    const after = snapshotAccountObservation([account]);

    expect(after.signature).not.toBe(before.signature);

    account.orderNum = 1;
    const afterReorder = snapshotAccountObservation([account]);

    expect(afterReorder.signature).not.toBe(after.signature);
  });
});
