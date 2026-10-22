import { migrations } from '../migrations';
import { schema } from '../schema';
import { runMigrationSqlFixture } from './migrationSqlHarness';

it('installs the same ledger indexes on fresh setup, v34 upgrade, and index recreation', () => {
  const upgrade = migrations.sortedMigrations.find(migration => migration.toVersion === 35);
  expect(upgrade).toBeDefined();
  const result = runMigrationSqlFixture(
    `
for name, columns in payload['tables'].items():
    create_table(name, columns)
def indexes():
    return list(db.execute("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name"))
db.executescript(payload['setup'])
fresh = indexes()
db.executescript(payload['drop'])
after_drop = indexes()
db.executescript(payload['recreate'])
recreated = indexes()
db.executescript(payload['drop'])
apply_steps(payload['upgrade'])
upgraded = indexes()
print(json.dumps(dict(fresh=fresh, afterDrop=after_drop, recreated=recreated, upgraded=upgraded)))
`,
    {
      tables: Object.fromEntries(
        Object.entries(schema.tables).map(([name, table]) => [name, table.columnArray]),
      ),
      setup: schema.unsafeSql?.('', 'setup'),
      drop: schema.unsafeSql?.('', 'drop_indices'),
      recreate: schema.unsafeSql?.('', 'create_indices'),
      upgrade: upgrade?.steps,
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const data: {
    fresh: [string, string][];
    afterDrop: [string, string][];
    recreated: [string, string][];
    upgraded: [string, string][];
  } = JSON.parse(result.stdout);
  expect(data.fresh.map(([name]) => name)).toEqual([
    'idx_balance_snapshots_workplace_account',
    'idx_journals_workplace_status_chrono',
    'idx_transactions_workplace_account_chrono',
    'idx_transactions_workplace_journal',
  ]);
  expect(data.afterDrop).toEqual([]);
  expect(data.recreated).toEqual(data.fresh);
  expect(data.upgraded).toEqual(data.fresh);
});
