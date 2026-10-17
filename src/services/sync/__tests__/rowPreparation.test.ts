import fixture from './fixtures/dataPreparation.v1.json';
import {
  cleanPhysicalRow,
  preparePhysicalRow,
  prepareWorkplaceMetadata,
  collectCurrencyCodes,
  TABLE_COLUMNS,
  type PhysicalColumn,
} from '../rowPreparation';
import { ROW_TABLES, type RowTable } from '../rowTables';
import type { PhysicalRowTable, RowSourceRecord } from '../rowRecords';
import { validateWorkplaceRows, rowImportData } from '../workplaceRowValidation';
import { canonicalRowBytes, decodeCanonicalRow, rowContentHash } from '../shortKeys';
import { asWorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/backup/cryptoProvider', () => ({
  cryptoProvider: {
    digest: async (bytes: Uint8Array) =>
      new Uint8Array(jest.requireActual('node:crypto').createHash('sha256').update(bytes).digest()),
  },
}));

const workplaceId = asWorkplaceId(fixture.input.workplace.id);
// Descriptors are plain inputs; frozen output expectations came from the old physical schema path.
function descriptors(table: PhysicalRowTable): PhysicalColumn[] {
  return ROW_TABLES.find(def => def.table === table)!.fields.map(field => ({
    name: field.name,
    type: field.type as PhysicalColumn['type'],
  }));
}
function exampleRows(): readonly RowSourceRecord[] {
  const rows: RowSourceRecord[] = [];
  for (const { table } of ROW_TABLES) {
    if (table === 'workplace') continue;
    const rawRows: Record<string, unknown>[] =
      Object.entries(fixture.input.tables).find(([name]) => name === table)?.[1] ?? [];
    for (const raw of rawRows) {
      const row = preparePhysicalRow(table, raw, descriptors(table));
      if (row) rows.push(row);
    }
  }
  rows.push(
    prepareWorkplaceMetadata(
      fixture.input.workplace,
      fixture.input.safeToSpendDays,
      fixture.input.currencyPrecisions,
    ),
  );
  return validateWorkplaceRows(rows, workplaceId);
}

describe('plain financial preparation', () => {
  it('matches frozen pre-extraction projection, canonical bytes/hash and decoded import records', async () => {
    const before = JSON.stringify(fixture.input);
    const rows = exampleRows();
    expect(rows).toEqual(fixture.rows);
    const decoded = [];
    for (const [index, row] of rows.entries()) {
      const bytes = canonicalRowBytes(row.table, row.content);
      expect(new TextDecoder().decode(bytes)).toBe(fixture.encoded[index].canonical);
      expect(await rowContentHash(row.table, row.content)).toBe(fixture.encoded[index].hash);
      decoded.push({ ...row, content: decodeCanonicalRow(row.table, 35, bytes) });
    }
    expect(rowImportData(validateWorkplaceRows(decoded, workplaceId))).toEqual(fixture.importData);
    expect(JSON.stringify(fixture.input)).toBe(before);
    expect(JSON.stringify(rows)).not.toContain('PRIVATE SYNTHETIC BODY');
  });

  it('projects only selected fields, omits null/undefined, preserves legacy truthiness and rejects wrong physical types', () => {
    const columns: PhysicalColumn[] = [
      { name: 'name', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'autopayEnabled', type: 'boolean' },
      { name: 'minimumBalanceAmount', type: 'number' },
    ];
    for (const [value, expected] of [
      [0, false],
      [1, true],
      ['false', true],
      ['', false],
    ] as const) {
      expect(
        cleanPhysicalRow(
          'account_metadata',
          {
            name: 'plain user text',
            description: null,
            autopayEnabled: value,
            deviceSecret: 'excluded',
          },
          columns,
        ),
      ).toEqual({ name: 'plain user text', autopayEnabled: expected });
    }
    expect(() =>
      cleanPhysicalRow('account_metadata', { minimumBalanceAmount: NaN }, columns),
    ).toThrow();
    expect(() => cleanPhysicalRow('account_metadata', { name: 42 }, columns)).toThrow();
    expect(TABLE_COLUMNS.accounts).not.toContain('workplace_id');
  });

  it.each(['pending', 'duplicate_flagged', 'parse_failed', 'imported', 'auto_posted', 'dismissed'])(
    'applies SMS inclusion for %s while preserving non-SMS rows',
    processingStatus => {
      const raw = { ...fixture.input.tables.transaction_inbox_records[0], processingStatus };
      const columns = descriptors('transaction_inbox_records');
      const included = ['imported', 'auto_posted', 'dismissed'].includes(processingStatus);
      expect(Boolean(preparePhysicalRow('transaction_inbox_records', raw, columns))).toBe(included);
      expect(
        preparePhysicalRow('transaction_inbox_records', { ...raw, channel: 'manual' }, columns),
      ).toBeDefined();
    },
  );

  it('cleans and validates enums before SMS exclusion, but checks identity/timestamp after exclusion', () => {
    const raw = fixture.input.tables.transaction_inbox_records[0];
    const columns = descriptors('transaction_inbox_records');
    expect(() =>
      preparePhysicalRow('transaction_inbox_records', { ...raw, metadataJson: 'broken' }, columns),
    ).toThrow();
    expect(() =>
      preparePhysicalRow('transaction_inbox_records', { ...raw, direction: 'broken' }, columns),
    ).toThrow();
    expect(
      preparePhysicalRow('transaction_inbox_records', { ...raw, id: '', updatedAt: -1 }, columns),
    ).toBeUndefined();
    expect(() =>
      preparePhysicalRow(
        'transaction_inbox_records',
        { ...raw, processingStatus: 'imported', id: '' },
        columns,
      ),
    ).toThrow(/identity/);
  });

  it('preserves already hashed fingerprints and arbitrary user-authored text', () => {
    const raw = fixture.input.tables.transaction_inbox_records[1];
    const first = preparePhysicalRow(
      'transaction_inbox_records',
      raw,
      descriptors('transaction_inbox_records'),
    )!;
    const again = preparePhysicalRow(
      'transaction_inbox_records',
      { ...raw, ...first.content },
      descriptors('transaction_inbox_records'),
    )!;
    expect(again).toEqual(first);
    expect(
      cleanPhysicalRow('account_metadata', { notes: 'SMS body: keep my own prose' }, [
        { name: 'notes', type: 'string' },
      ]),
    ).toEqual({ notes: 'SMS body: keep my own prose' });
  });

  it('collects only included currency codes and assembles metadata without mutating supplied inputs', () => {
    const rows = exampleRows();
    expect(collectCurrencyCodes('EUR', rows)).toEqual(['EUR', 'USD']);
    const map = { USD: 2 };
    const metadata = prepareWorkplaceMetadata(fixture.input.workplace, 30, map);
    map.USD = 3;
    expect(metadata.content.currencyPrecisions).toEqual({ USD: 2 });
  });
});

describe('complete Workplace validation', () => {
  const state = () => fixture.rows.map(row => ({ ...row, content: { ...row.content } }));
  it.each([
    [
      'unsupported field',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows[0].content, { secret: 'x' });
      },
    ],
    [
      'wrong type',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows[0].content, { name: 42 });
      },
    ],
    [
      'missing account',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'transactions')!.content, {
          accountId: 'missing',
        });
      },
    ],
    [
      'missing journal',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'transactions')!.content, {
          journalId: 'missing',
        });
      },
    ],
    [
      'missing metadata journal',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'journal_metadata')!.content, {
          journalId: 'missing',
        });
      },
    ],
    [
      'missing reversal',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'journals')!.content, {
          originalJournalId: 'missing',
        });
      },
    ],
    [
      'missing precision',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows[0].content, { currencyCode: 'EUR' });
      },
    ],
    [
      'extra precision',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'workplace')!.content, {
          currencyPrecisions: { USD: 2, EUR: 2 },
        });
      },
    ],
    [
      'raw metadata',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'journal_metadata')!.content, {
          metadataJson: '{"body":"private"}',
        });
      },
    ],
    [
      'raw audit',
      (rows: ReturnType<typeof state>) => {
        Object.assign(rows.find(r => r.table === 'audit_logs')!.content, {
          changes: '{"originalSmsBody":"private"}',
        });
      },
    ],
  ])('rejects %s without modifying received content', (_label, mutate) => {
    const rows = state();
    mutate(rows);
    const before = JSON.stringify(rows);
    expect(() => validateWorkplaceRows(rows, workplaceId)).toThrow();
    expect(JSON.stringify(rows)).toBe(before);
  });

  it('rejects duplicate IDs within a table, foreign/duplicate/missing metadata and tombstones', () => {
    const rows = state();
    const metadata = rows.find(row => row.table === 'workplace')!;
    for (const invalid of [
      [...rows, rows[0]],
      rows.filter(row => row.table !== 'workplace'),
      [...rows, { ...metadata, rowId: 'foreign' }],
      rows.map(row => (row.table === 'workplace' ? { ...row, rowId: 'foreign' } : row)),
      rows.map(row => ({ ...row, deleted: true })),
    ])
      expect(() => validateWorkplaceRows(invalid, workplaceId)).toThrow();
  });

  it('keeps the twelve logical source types and physical allowlist aligned', () => {
    expect(ROW_TABLES).toHaveLength(12);
    for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
      const fields = ROW_TABLES.find(row => row.table === (table as RowTable))!
        .fields.map(field => field.name)
        .sort();
      expect(
        columns
          .split(' ')
          .map(name => name.replace(/_(\w)/g, (_match, c: string) => c.toUpperCase()))
          .sort(),
      ).toEqual(fields);
    }
  });
});
