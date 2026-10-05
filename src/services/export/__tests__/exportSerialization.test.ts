import { Icon } from '@/src/types/domainIcons';
import {
  serializeExportPayloadFromSources,
  serializeMultiWorkplaceExport,
} from '@/src/services/export/exportSerialization';
import { DEFAULT_UI_PREFERENCES } from '@/src/services/preferences/types';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';

describe('export serialization', () => {
  it('preserves retained SMS sources in backups without exporting plain-text deduplication identities', async () => {
    const source = {
      id: 'source-1',
      originalSmsSender: 'BANK',
      originalSmsBody: 'Original transaction',
      metadataJson: JSON.stringify({
        rawBody: 'Original transaction',
        smsFingerprint: 'bank::body::7',
      }),
    };
    const json = await serializeExportPayloadFromSources(
      {
        exportDate: '2026-10-02',
        version: '1.0.0',
        schemaVersion: 33,
        preferences: DEFAULT_UI_PREFERENCES,
      },
      [['journalMetadata', async () => [source]]],
    );
    const [saved] = JSON.parse(json).journalMetadata;
    expect(saved.originalSmsSender).toBe('BANK');
    expect(saved.originalSmsBody).toBe('Original transaction');
    expect(JSON.parse(saved.metadataJson)).toEqual({
      rawBody: 'Original transaction',
      smsFingerprint: hashLegacySmsFingerprint('bank::body::7'),
    });
  });
  it('loads source tables sequentially and preserves the export shape', async () => {
    const loadOrder: string[] = [];
    const loadAccounts = jest.fn(async () => {
      loadOrder.push('accounts');
      return [{ id: 'a1', runningBalance: 10 }];
    });
    const loadJournals = jest.fn(async () => {
      loadOrder.push('journals');
      return [{ id: 'j1' }];
    });
    const json = await serializeExportPayloadFromSources(
      {
        exportDate: '2026-01-01T00:00:00.000Z',
        version: '1.4.0',
        schemaVersion: 1,
        preferences: DEFAULT_UI_PREFERENCES,
      },
      [
        ['accounts', loadAccounts],
        ['journals', loadJournals],
      ],
    );

    expect(loadOrder).toEqual(['accounts', 'journals']);
    expect(loadAccounts).toHaveBeenCalledTimes(1);
    expect(loadJournals).toHaveBeenCalledTimes(1);
    expect(JSON.parse(json).accounts).toEqual([{ id: 'a1' }]);
    expect(JSON.parse(json).journals).toEqual([{ id: 'j1' }]);
  });

  it('serializes v2 data grouped by workplace', () => {
    const json = serializeMultiWorkplaceExport({
      format: 'full-frills-backup',
      formatVersion: 2,
      exportDate: '2026-01-01T00:00:00.000Z',
      exportScope: 'selected',
      preferences: DEFAULT_UI_PREFERENCES,
      workplaces: [
        {
          workplace: {
            id: 'home',
            name: 'Home',
            icon: Icon.Wallet,
            defaultCurrencyCode: 'USD',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          data: { accounts: [{ id: 'a1' }] },
        },
      ],
    });

    const parsed = JSON.parse(json);
    expect(parsed.formatVersion).toBe(2);
    expect(parsed.workplaces).toHaveLength(1);
    expect(parsed.workplaces[0].workplace.name).toBe('Home');
    expect(parsed.workplaces[0].data.accounts).toEqual([{ id: 'a1' }]);
  });
});
