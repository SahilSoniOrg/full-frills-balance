import { database } from '@/src/data/database/Database';
import { transactionRawPatternQueries } from '@/src/data/repositories/raw/TransactionRawPatternQueries';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { WorkplaceId } from '@/src/types/domain';

describe('TransactionRawPatternQueries workplace isolation', () => {
  const workplaceOne = 'wp-pattern-one' as WorkplaceId;
  const workplaceTwo = 'wp-pattern-two' as WorkplaceId;

  beforeEach(async () => {
    jest.restoreAllMocks();
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('scopes the raw SQL path to the requested workplace', async () => {
    const queryRaw = jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue([]);

    await transactionRawPatternQueries.getRecurringPatternsRaw(workplaceOne, 1_000, 3);

    const [sql, args] = queryRaw.mock.calls[0];
    expect(sql).toContain('j.workplace_id = ?');
    expect(args).toContain(workplaceOne);
  });

  it('scopes the WatermelonDB fallback query to the requested workplace', async () => {
    jest.spyOn(transactionRawMetricsQueries, 'queryRaw').mockResolvedValue(null);
    const transactions = database.collections.get('transactions');
    const query = jest.spyOn(transactions, 'query');

    await transactionRawPatternQueries.getRecurringPatternsRaw(workplaceTwo, 0, 3);

    expect(JSON.stringify(query.mock.calls[0])).toContain('workplace_id');
    expect(JSON.stringify(query.mock.calls[0])).toContain(workplaceTwo);
  });
});
