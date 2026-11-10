import { migrations } from '../migrations';
import { schema } from '../schema';
import { runMigrationSqlFixture } from './migrationSqlHarness';

const MATCHER_COLUMNS = [
  'account_id',
  'definition_json',
  'conditions_key',
  'is_enabled',
  'provenance',
  'created_at',
  'updated_at',
  'workplace_id',
];

function stepsTo(versions: number[]) {
  return migrations.sortedMigrations
    .filter(migration => versions.includes(migration.toVersion))
    .flatMap(migration => migration.steps);
}

describe('account matcher schema (v36)', () => {
  it('registers a single v36 step and final matcher layout', () => {
    expect(schema.version).toBe(38);
    expect(migrations.maxVersion).toBe(38);
    expect(
      migrations.sortedMigrations
        .filter(migration => migration.toVersion >= 36)
        .map(migration => migration.toVersion),
    ).toEqual([36, 37, 38]);
    expect(schema.tables.account_matchers.columnArray.map(column => column.name)).toEqual(
      MATCHER_COLUMNS,
    );
  });

  it('upgrades from v35 with account_matchers', () => {
    const result = runMigrationSqlFixture(
      `
create_table('journal_metadata', payload['journal_columns'])
db.execute("INSERT INTO journal_metadata (id, journal_id, import_source, workplace_id) VALUES ('m1', 'j1', 'sms', 'wp')")
apply_steps(payload['steps'])
db.row_factory = sqlite3.Row
print(json.dumps(dict(
  matcher_columns=[row[1] for row in db.execute('PRAGMA table_info(account_matchers)')],
  preserved=dict(db.execute('SELECT id, journal_id FROM journal_metadata').fetchone()),
)))
`,
      {
        steps: stepsTo([36]),
        journal_columns: schema.tables.journal_metadata.columnArray,
      },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.matcher_columns).toEqual(expect.arrayContaining(MATCHER_COLUMNS));
    expect(data.preserved).toEqual({ id: 'm1', journal_id: 'j1' });
  });
});
