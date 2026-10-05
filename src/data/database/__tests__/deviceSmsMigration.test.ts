import { migrations } from '../migrations';
import { schema } from '../schema';
import { runMigrationSqlFixture } from './migrationSqlHarness';

/** Loki does not execute unsafe SQL migrations. Exercise the real upgrade SQL in SQLite. */
it('upgrades schema 32 to 33 with audit backfill, Device SMS ownership, and preserved consumed copies', () => {
  expect(schema.version).toBe(34);
  expect(migrations.maxVersion).toBe(34);
  const upgrades = migrations.sortedMigrations.filter(migration => migration.toVersion === 33);
  expect(upgrades.map(migration => migration.toVersion)).toEqual([33]);
  const [upgrade] = upgrades;
  const addedAuditColumns = upgrade.steps.flatMap(step =>
    step.type === 'add_columns' && step.table === 'audit_logs'
      ? step.columns.map(column => column.name)
      : [],
  );
  const sql = upgrade?.steps.flatMap(step => (step.type === 'sql' ? [step.sql] : []));
  const result = runMigrationSqlFixture(
    `
for name, columns in payload['tables'].items():
    create_table(name, columns)
db.execute("INSERT INTO audit_logs (id, entity_type, entity_id, action, changes, timestamp, created_at, workplace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ('audit-valid', 'JOURNAL', 'journal-b', 'CREATE', json.dumps(dict(source='system', eventType='journal.sms_auto_posted', correlationId='correlation-1')), 1000, 1000, 'B'))
db.execute("INSERT INTO audit_logs (id, entity_type, entity_id, action, changes, timestamp, created_at, workplace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", ('audit-invalid', 'ACCOUNT', 'account-a', 'UPDATE', '{broken', 1000, 1000, 'A'))
def insert(id, workplace, source, status, raw, metadata='{}', channel='sms', deleted=False):
    values = dict(id=id, _status='deleted' if deleted else 'synced', _changed='', workplace_id=workplace, channel=channel,
        device_source_id=source, sender_address='BANK', raw_body=raw, input_date=1000, input_fingerprint='sha256:fixture',
        parse_status='parsed', parsed_amount=500, parsed_currency_code='INR', direction='debit', processing_status=status,
        linked_journal_id='journal-b' if status=='imported' else None, metadata_json=metadata, first_seen_at=1, last_scanned_at=2, created_at=1, updated_at=2)
    db.execute('INSERT INTO transaction_inbox_records (' + ','.join(values) + ') VALUES (' + ','.join('?' for _ in values) + ')', list(values.values()))
insert('z-pending', 'A', 'shared', 'pending', 'private body', '{"body":"private body","duplicateReasons":["possible duplicate"]}')
insert('a-imported', 'B', 'shared', 'imported', 'private body')
insert('pending-only', 'A', 'pending', 'parse_failed', 'needs review', '{broken')
insert('dismissed', 'B', 'dismissed', 'dismissed', 'restorable')
insert('voice', 'A', 'voice', 'pending', 'spoken', channel='voice')
insert('deleted', 'A', 'deleted', 'pending', 'deleted body', deleted=True)
apply_steps(payload['steps'])
db.row_factory = sqlite3.Row
print(json.dumps(dict(devices=[dict(row) for row in db.execute('SELECT * FROM device_sms_inbox_records')], copies=[dict(row) for row in db.execute('SELECT * FROM transaction_inbox_records')], audits=[dict(row) for row in db.execute('SELECT * FROM audit_logs')])))
`,
    {
      steps: upgrade.steps,
      tables: {
        transaction_inbox_records: schema.tables.transaction_inbox_records.columnArray,
        audit_logs: schema.tables.audit_logs.columnArray.filter(
          column => !addedAuditColumns.includes(column.name),
        ),
      },
    },
  );
  expect(
    sql?.filter(statement => statement.includes('device_sms_inbox_records')).join(' '),
  ).not.toMatch(/json_(group|object|valid|extract)/);
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const data: {
    devices: {
      id: string;
      device_source_id: string;
      raw_body: string | null;
      review_states_json: string;
      notification_state: string;
    }[];
    copies: { id: string; linked_journal_id: string | null }[];
    audits: {
      id: string;
      entity_type: string;
      source: string;
      event_type: string;
      correlation_id: string | null;
    }[];
  } = JSON.parse(result.stdout);
  expect(data.devices).toHaveLength(3);
  const shared = data.devices.find(device => device.device_source_id === 'shared');
  expect(shared?.id).toBe('a-imported');
  expect(shared?.raw_body).toBe('private body');
  expect(shared?.notification_state).toBe('none');
  expect(shared?.review_states_json).not.toContain('private body');
  expect(data.copies.map(copy => copy.id).sort()).toEqual(['a-imported', 'dismissed', 'voice']);
  expect(data.copies.find(copy => copy.id === 'a-imported')?.linked_journal_id).toBe('journal-b');
  expect(data.devices.find(device => device.id === 'pending-only')?.raw_body).toBe('needs review');
  expect(data.audits.find(audit => audit.id === 'audit-valid')).toMatchObject({
    entity_type: 'journal',
    source: 'system',
    event_type: 'journal.sms_auto_posted',
    correlation_id: 'correlation-1',
  });
  expect(data.audits.find(audit => audit.id === 'audit-invalid')).toMatchObject({
    entity_type: 'account',
    source: 'app',
    event_type: 'account.update',
    correlation_id: null,
  });
});
