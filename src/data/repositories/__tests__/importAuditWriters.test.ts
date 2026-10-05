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

  it('pins planned-payment and auto-post-rule import audit after payloads', async () => {
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
          transactionAutoPostRules: [
            {
              id: 'rule-1',
              senderMatch: 'BANK',
              sourceAccountId: 'acc-1' as AccountId,
              categoryAccountId: 'acc-2' as AccountId,
              isActive: true,
            },
          ],
        },
        { correlationId: 'import-1' },
      );
      await database.batch(logs);
    });

    const after = Object.fromEntries(
      logs.map(log => [
        log.entityType,
        (JSON.parse(log.changes) as { after: Record<string, unknown> }).after,
      ]),
    );
    expect(after.planned_payment).toEqual({
      name: 'Rent abroad',
      description: null,
      amount: 100,
      currencyCode: 'USD',
      fxMode: 'fixed',
      destinationAmount: 8300,
      fromAccountId: 'acc-usd',
      toAccountId: 'acc-inr',
      intervalN: 1,
      intervalType: 'MONTHLY',
      startDate: 0,
      endDate: null,
      nextOccurrence: 0,
      status: 'ACTIVE',
      isAutoPost: false,
      recurrenceDay: null,
      recurrenceMonth: null,
      deletedAt: null,
    });
    expect(after.transaction_auto_post_rule).toEqual({
      channelsJson: null,
      senderMatch: 'BANK',
      bodyMatch: null,
      conditionsJson: null,
      actionsJson: null,
      priority: null,
      sourceAccountId: 'acc-1',
      categoryAccountId: 'acc-2',
      isActive: true,
    });
  });
});
