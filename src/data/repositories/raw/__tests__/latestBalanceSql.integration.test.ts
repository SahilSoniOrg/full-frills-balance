import { schema } from '@/src/data/database/schema';
import { runMigrationSqlFixture } from '@/src/data/database/__tests__/migrationSqlHarness';
import { accountListMetricsQueries } from '@/src/data/repositories/account/AccountListMetricsQueries';
import { asWorkplaceId } from '@/src/types/ids';
import { rawSqlExecutor } from '../RawSqlExecutor';
import { transactionRawMetricsQueries } from '../TransactionRawMetricsQueries';

// Execute the actual emitted SQL: a mocked native result cannot establish that
// the latest-row selection respects ties, status, cutoffs, or malformed links.
it.each([false, true])(
  'preserves balance selection and period totals (counts: %s)',
  async includeCount => {
    const query = jest.spyOn(rawSqlExecutor, 'query').mockResolvedValue([]);
    try {
      await transactionRawMetricsQueries.getLatestBalancesRaw(
        asWorkplaceId('A'),
        ['a', 'empty', 'foreign'],
        20,
      );
      await accountListMetricsQueries.getAccountListItemsRaw(
        15,
        25,
        asWorkplaceId('A'),
        includeCount,
      );
      const result = runMigrationSqlFixture(
        `
for name, columns in payload['tables'].items():
    create_table(name, columns)
db.executescript(payload['indexes'])
def insert(table, **values):
    values = dict(_status='synced', _changed='', **values)
    db.execute('INSERT INTO ' + table + ' (' + ','.join(values) + ') VALUES (' + ','.join('?' for _ in values) + ')', list(values.values()))
for id, workplace in [('a', 'A'), ('empty', 'A'), ('foreign', 'B')]:
    insert('accounts', id=id, workplace_id=workplace, name=id, account_type='ASSET', currency_code='USD', order_num=0)
for id, workplace, status, deleted in [('posted', 'A', 'POSTED', None), ('reversed', 'A', 'REVERSED', None), ('planned', 'A', 'PLANNED', None), ('deleted', 'A', 'POSTED', 1), ('foreign', 'B', 'POSTED', None)]:
    insert('journals', id=id, workplace_id=workplace, status=status, deleted_at=deleted)
for id, date, created, balance, journal, workplace, account, deleted in [
    ('older', 10, 1, 10, 'posted', 'A', 'a', None),
    ('tie-a', 20, 2, 20, 'posted', 'A', 'a', None),
    ('tie-z', 20, 2, 30, 'reversed', 'A', 'a', None),
    ('future', 40, 3, 40, 'posted', 'A', 'a', None),
    ('planned', 50, 3, 500, 'planned', 'A', 'a', None),
    ('deleted-leg', 60, 3, 600, 'posted', 'A', 'a', 1),
    ('deleted-journal', 70, 3, 700, 'deleted', 'A', 'a', None),
    ('foreign-journal', 80, 3, 800, 'foreign', 'A', 'a', None),
    ('foreign-leg', 90, 3, 900, 'posted', 'B', 'a', None),
    ('foreign-account', 100, 3, 1000, 'posted', 'A', 'foreign', None),
]:
    insert('transactions', id=id, workplace_id=workplace, account_id=account, journal_id=journal, transaction_date=date, created_at=created, running_balance=balance, amount=10, transaction_type='DEBIT', deleted_at=deleted)
db.row_factory = sqlite3.Row
rows = [[dict(row) for row in db.execute(query['sql'], query['args'])] for query in payload['queries']]
print(json.dumps(dict(latest=rows[0], metrics=rows[1])))
`,
        {
          tables: Object.fromEntries(
            Object.entries(schema.tables).map(([name, table]) => [name, table.columnArray]),
          ),
          indexes: schema.unsafeSql?.('', 'setup'),
          queries: query.mock.calls.map(([sql, args]) => ({ sql, args })),
        },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const data: {
        latest: { accountId: string; runningBalance: number }[];
        metrics: {
          id: string;
          direct_balance: number | null;
          direct_transaction_count: number;
          periodIncrease: number;
          periodDecrease: number;
        }[];
      } = JSON.parse(result.stdout);
      expect(data.latest).toEqual([{ accountId: 'a', runningBalance: 30 }]);
      expect(data.metrics).toHaveLength(2);
      expect(data.metrics.find(row => row.id === 'a')).toMatchObject({
        direct_balance: 40,
        direct_transaction_count: includeCount ? 4 : 0,
        periodIncrease: 20,
        periodDecrease: 0,
      });
      expect(data.metrics.find(row => row.id === 'empty')).toMatchObject({
        direct_balance: null,
        direct_transaction_count: 0,
        periodIncrease: 0,
        periodDecrease: 0,
      });
    } finally {
      query.mockRestore();
    }
  },
);
