import { serializeExportPayload } from '@/src/services/export/exportSerialization';
import { DEFAULT_UI_PREFERENCES } from '@/src/utils/preferences/types';

describe('serializeExportPayload', () => {
  it('stitches metadata and tables into one JSON object', async () => {
    const json = await serializeExportPayload(
      {
        exportDate: '2026-01-01T00:00:00.000Z',
        version: '1.4.0',
        schemaVersion: 42,
        preferences: DEFAULT_UI_PREFERENCES,
      },
      [
        ['accounts', [{ id: 'a1', name: 'Cash' }]],
        ['journals', [{ id: 'j1' }]],
      ],
    );

    const parsed = JSON.parse(json);
    expect(parsed.exportDate).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.accounts).toEqual([{ id: 'a1', name: 'Cash' }]);
    expect(parsed.journals).toEqual([{ id: 'j1' }]);
  });

  it('omits excluded export fields from table payloads', async () => {
    const json = await serializeExportPayload(
      {
        exportDate: '2026-01-01T00:00:00.000Z',
        version: '1.4.0',
        schemaVersion: 1,
        preferences: DEFAULT_UI_PREFERENCES,
      },
      [['transactions', [{ id: 't1', runningBalance: 100, originalSmsBody: 'sms' }]]],
    );

    expect(JSON.parse(json).transactions).toEqual([{ id: 't1' }]);
  });

  it('reports normalized 0..1 progress through serialization', async () => {
    const progress: number[] = [];
    await serializeExportPayload(
      {
        exportDate: '2026-01-01T00:00:00.000Z',
        version: '1.4.0',
        schemaVersion: 1,
        preferences: DEFAULT_UI_PREFERENCES,
      },
      [
        ['accounts', []],
        ['journals', []],
      ],
      (_message, value) => progress.push(value),
    );

    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every(value => value >= 0 && value <= 1)).toBe(true);
  });
});
