import { spawnSync } from 'node:child_process';
import { migrations } from '../migrations';
import { schema } from '../schema';

it('upgrades v33 planned payments with nullable FX fields and preserves legacy third currency', () => {
  const upgrade = migrations.sortedMigrations.find(migration => migration.toVersion === 34);
  expect(schema.version).toBe(34);
  expect(migrations.maxVersion).toBe(34);
  expect(upgrade?.steps).toEqual([
    expect.objectContaining({
      type: 'add_columns',
      table: 'planned_payments',
      columns: [
        expect.objectContaining({ name: 'fx_mode', type: 'string', isOptional: true }),
        expect.objectContaining({ name: 'destination_amount', type: 'number', isOptional: true }),
      ],
    }),
  ]);
  const result = spawnSync(
    'python3',
    [
      '-c',
      `
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
columns = payload['columns']
fields = ['id TEXT PRIMARY KEY', '_status TEXT', '_changed TEXT'] + [column['name'] + (' TEXT' if column['type'] == 'string' else ' REAL') for column in columns]
db.execute('CREATE TABLE planned_payments (' + ','.join(fields) + ')')
db.execute("INSERT INTO planned_payments (id, name, amount, currency_code, from_account_id, to_account_id, is_auto_post) VALUES ('legacy', 'Third currency', 100, 'INR', 'usd-account', 'eur-account', 1)")
for step in payload['steps']:
    for column in step['columns']:
        db.execute('ALTER TABLE planned_payments ADD COLUMN ' + column['name'] + (' TEXT' if column['type'] == 'string' else ' REAL'))
db.row_factory = sqlite3.Row
print(json.dumps(dict(db.execute('SELECT * FROM planned_payments').fetchone())))
`,
    ],
    {
      input: JSON.stringify({
        steps: upgrade?.steps,
        columns: schema.tables.planned_payments.columnArray.filter(
          column => column.name !== 'fx_mode' && column.name !== 'destination_amount',
        ),
      }),
      encoding: 'utf8',
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    id: 'legacy',
    amount: 100,
    currency_code: 'INR',
    from_account_id: 'usd-account',
    to_account_id: 'eur-account',
    is_auto_post: 1,
    fx_mode: null,
    destination_amount: null,
  });
});
