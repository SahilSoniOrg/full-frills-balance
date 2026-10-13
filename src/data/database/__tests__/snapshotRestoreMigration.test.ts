import { migrations } from '../migrations';
import { schema } from '../schema';
import { runMigrationSqlFixture } from './migrationSqlHarness';

it('adds the snapshot receipt in SQLite while preserving existing local Workplace identity and settings', () => {
  const upgrade = migrations.sortedMigrations.find(migration => migration.toVersion === 35);
  expect(upgrade).toBeDefined();
  const result = runMigrationSqlFixture(
    `
create_table('workplaces', payload['columns'])
db.execute("INSERT INTO workplaces (id, name, default_currency_code, icon, created_at, updated_at) VALUES ('local-books', 'Existing books', 'INR', 'wallet', 1000, 2000)")
apply_steps(payload['steps'])
db.row_factory = sqlite3.Row
print(json.dumps(dict(db.execute('SELECT * FROM workplaces').fetchone())))
`,
    {
      steps: upgrade?.steps,
      columns: schema.tables.workplaces.columnArray.filter(
        column => column.name !== 'snapshot_restore_fingerprint',
      ),
    },
  );
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout)).toMatchObject({
    id: 'local-books',
    name: 'Existing books',
    default_currency_code: 'INR',
    icon: 'wallet',
    created_at: 1000,
    updated_at: 2000,
    snapshot_restore_fingerprint: null,
  });
});
