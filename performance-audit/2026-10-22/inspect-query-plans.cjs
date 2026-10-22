// Audit experiment: encode the audit baseline's fresh-install schema and inspect empty
// desktop SQLite plans. No app database, data, timings, or test runner involved.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '../..');
const baseline = 'a42bafe531f7286739863073f45ee546f63c8359';
const read = relative => {
  const result = spawnSync('git', ['show', `${baseline}:${relative}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || 'Cannot read audit baseline');
  return result.stdout;
};
const modules = new Map();
function loadSchemaFile(file) {
  if (modules.has(file)) return modules.get(file).exports;
  const result = { exports: {} };
  modules.set(file, result);
  const code = babel.transformSync(read(path.relative(root, file)), {
    filename: file,
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-typescript', '@babel/plugin-transform-modules-commonjs'],
  }).code;
  const schemaRequire = name => {
    if (name === '@nozbe/watermelondb') return require('@nozbe/watermelondb/Schema');
    if (name === './deviceSmsInboxSchema')
      return loadSchemaFile(path.join(path.dirname(file), 'deviceSmsInboxSchema.ts'));
    throw new Error('Unexpected schema dependency: ' + name);
  };
  vm.runInNewContext(
    code,
    { module: result, exports: result.exports, require: schemaRequire },
    {
      filename: file,
    },
  );
  return result.exports;
}

const { schema } = loadSchemaFile(path.join(root, 'src/data/database/schema.ts'));
const { encodeSchema } = require('@nozbe/watermelondb/adapters/sqlite/encodeSchema');
const sql = encodeSchema(schema);
fs.writeFileSync(path.join(__dirname, 'fresh-schema.sql'), sql);

const source = read('src/data/repositories/raw/TransactionRawMetricsQueries.ts').split(
  '  async getLatestBalancesRaw(',
)[1];
const balanceSql = source
  .match(/const sql = `([\s\S]*?)`;/)[1]
  .replace('${accountPlaceholders}', '?')
  .replace('${placeholders}', '?,?');
const migrations = read('src/data/database/migrations.ts');
const names = [
  'idx_transactions_workplace_account_chrono',
  'idx_transactions_workplace_journal',
  'idx_journals_workplace_status_chrono',
  'idx_balance_snapshots_workplace_account',
];
const indices = names.map(
  name => migrations.match(new RegExp('CREATE INDEX IF NOT EXISTS ' + name + '\\b[\\s\\S]*?;'))[0],
);
const input = {
  commit: baseline,
  schema: sql,
  indices,
  queries: {
    account_latest_balance: {
      sql: balanceSql,
      args: [
        'synthetic-account',
        Number.MAX_SAFE_INTEGER,
        ...Array(3).fill('synthetic-workplace'),
        'POSTED',
        'REVERSED',
      ],
      source:
        'TransactionRawMetricsQueries.getLatestBalancesRaw; exact template expanded for one account',
    },
    journal_timeline_order: {
      sql: "SELECT journals.* FROM journals WHERE workplace_id=? AND deleted_at IS NULL AND status IN (?,?) AND _status IS NOT 'deleted' ORDER BY journal_date DESC, created_at DESC LIMIT 15",
      args: ['synthetic-workplace', 'POSTED', 'REVERSED'],
      source:
        'Representative SQL for JournalObserveQueries.observeTimeline; not captured ORM SQL; excludes account join',
    },
    journal_legs_order: {
      sql: "SELECT transactions.* FROM transactions WHERE workplace_id=? AND journal_id=? AND _status IS NOT 'deleted' ORDER BY transaction_date ASC, created_at ASC",
      args: ['synthetic-workplace', 'synthetic-journal'],
      source:
        'Representative SQL for includeDeleted TransactionObserveQueries.observeByJournal; not captured ORM SQL',
    },
  },
};
const python = String.raw`
import sys, json, sqlite3, hashlib
data = json.load(sys.stdin)
fresh = sqlite3.connect(':memory:')
fresh.executescript(data['schema'])
indexed = sqlite3.connect(':memory:')
indexed.executescript(data['schema'])
indexed.executescript('\n'.join(data['indices']))
result = {
  'commit': data['commit'],
  'experiment': 'EMPTY_SCHEMA_QUERY_PLANS',
  'sqlite_version': sqlite3.sqlite_version,
  'schema_sha256': hashlib.sha256(data['schema'].encode()).hexdigest(),
  'rows_in_each_table': 0,
  'claims': 'Plan structure only; no timing, representative cardinality, physical device, or Android SQLite evidence. Added indexes are isolated migration-25 definitions, not a full upgraded schema.',
  'added_index_sql': data['indices'],
  'queries': {}
}
for name, query in data['queries'].items():
  def plan(db):
    return [list(row) for row in db.execute('EXPLAIN QUERY PLAN ' + query['sql'], query['args'])]
  result['queries'][name] = {**query, 'fresh_plan': plan(fresh), 'with_migration_25_indexes_plan': plan(indexed)}
print(json.dumps(result, indent=2))
`;
const result = spawnSync('python3', ['-c', python], {
  input: JSON.stringify(input),
  encoding: 'utf8',
  maxBuffer: 1024 * 1024,
});
if (result.status !== 0) throw new Error(result.stderr || 'SQLite plan inspection failed');
fs.writeFileSync(path.join(__dirname, 'query-plans.json'), result.stdout + '\n');
process.stdout.write(
  'Wrote fresh-schema.sql and query-plans.json; empty desktop SQLite plans only.\n',
);
