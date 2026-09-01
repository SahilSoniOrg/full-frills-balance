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
});
