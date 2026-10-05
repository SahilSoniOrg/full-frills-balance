import { database } from '@/src/data/database/Database';
import type AuditLog from '@/src/data/models/AuditLog';
import { prepareImportedEntityAuditRecords } from '@/src/data/repositories/importAuditWriters';
import { resetDatabase } from '@/src/testing/resetDatabase';
import type { AccountId, WorkplaceId } from '@/src/types/ids';

const WORKPLACE = 'wp-import-audit' as WorkplaceId;

describe('prepareImportedEntityAuditRecords', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('records planned-payment FX fields in the import audit', async () => {
    let logs: AuditLog[] = [];
    await database.write(async () => {
      logs = prepareImportedEntityAuditRecords(
        WORKPLACE,
        {
          accounts: [],
          journals: [],
          transactions: [],
          plannedPayments: [
            {
              id: 'pp-fx',
              name: 'Rent abroad',
              amount: 100,
              currencyCode: 'USD',
              fxMode: 'fixed',
              destinationAmount: 8300,
              fromAccountId: 'acc-usd' as AccountId,
              toAccountId: 'acc-inr' as AccountId,
              intervalN: 1,
              intervalType: 'MONTHLY',
              startDate: 0,
              nextOccurrence: 0,
              status: 'ACTIVE',
              isAutoPost: false,
            },
          ],
        },
        { correlationId: 'import-1' },
      );
      await database.batch(logs);
    });

    expect(logs).toHaveLength(1);
    const { after } = JSON.parse(logs[0].changes) as { after: Record<string, unknown> };
    expect(after).toMatchObject({ fxMode: 'fixed', destinationAmount: 8300 });
  });
});
