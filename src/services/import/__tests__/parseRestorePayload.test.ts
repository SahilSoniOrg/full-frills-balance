import { asWorkplaceId } from '@/src/types/ids';
import { parseRestoreFacts, parseRestoreHandoff } from '../parseRestorePayload';

describe('parseRestorePayload', () => {
  it('keeps known facts and ignores additive import keys', () => {
    expect(
      parseRestoreFacts({
        workplace: { name: 'Imported', defaultCurrencyCode: 'USD', extra: true },
        future: 'ignored',
      }),
    ).toEqual({
      workplace: { name: 'Imported', defaultCurrencyCode: 'USD' },
    });
  });

  it('rejects a handoff whose operation ID does not match the draft', () => {
    expect(
      parseRestoreHandoff(
        {
          operationId: 'other',
          workplaceId: 'published',
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
          warnings: [],
        },
        asWorkplaceId('operation'),
      ),
    ).toBeUndefined();
  });

  it('keeps only skipped items with id and reason', () => {
    expect(
      parseRestoreHandoff(
        {
          operationId: 'operation',
          workplaceId: 'published',
          fingerprint: 'abc',
          facts: { workplace: {} },
          stats: {
            accounts: 1,
            journals: 1,
            transactions: 1,
            skippedTransactions: 1,
            skippedItems: [
              { id: 'tx-1', reason: 'Deleted', description: 'old' },
              { id: 12, reason: 'bad' },
              { reason: 'missing-id' },
            ],
          },
          warnings: ['partial'],
        },
        asWorkplaceId('operation'),
      )?.stats.skippedItems,
    ).toEqual([{ id: 'tx-1', reason: 'Deleted', description: 'old' }]);
  });
});
