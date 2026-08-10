import Account from '@/src/data/models/Account';
import { snapshotAccountObservation } from '@/src/services/reactive/reactiveAggregatedBalances';

describe('snapshotAccountObservation', () => {
  it('preserves the pre-write signature when WatermelonDB reuses model references', () => {
    const account = {
      id: 'account-1',
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
});
