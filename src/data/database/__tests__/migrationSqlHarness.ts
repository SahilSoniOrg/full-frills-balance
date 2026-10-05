import { spawnSync } from 'node:child_process';

const MIGRATION_SQL_HELPERS = `
import json, sqlite3, sys
payload = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
def column_sql(column):
    return column['name'] + (' TEXT' if column['type'] == 'string' else ' REAL')
def create_table(name, columns):
    fields = ['id TEXT PRIMARY KEY', '_status TEXT', '_changed TEXT'] + [column_sql(column) for column in columns]
    db.execute('CREATE TABLE ' + name + ' (' + ','.join(fields) + ')')
def apply_steps(steps):
    for step in steps:
        if step['type'] == 'create_table':
            create_table(step['schema']['name'], step['schema']['columnArray'])
        elif step['type'] == 'add_columns':
            for column in step['columns']:
                db.execute('ALTER TABLE ' + step['table'] + ' ADD COLUMN ' + column_sql(column))
        elif step['type'] == 'sql':
            db.executescript(step['sql'])
        else:
            raise ValueError('Unhandled migration step: ' + step['type'])
`;

export function runMigrationSqlFixture(
  body: string,
  payload: Record<string, unknown>,
): { status: number | null; stderr: string; stdout: string } {
  return spawnSync('python3', ['-c', MIGRATION_SQL_HELPERS + body], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}
