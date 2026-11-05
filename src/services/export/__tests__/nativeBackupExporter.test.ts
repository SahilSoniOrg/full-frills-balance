import { exportWorkplacesToJSON } from '@/src/services/export/nativeBackupExporter';
import { AccountId, WorkplaceId } from '@/src/types/ids';

const mockFetchAndTransformTable = jest.fn();
const mockCreateZipArchive = jest.fn();
const mockGetWorkplace = jest.fn();
const mockGetPreferences = jest.fn();

jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { find: (...args: unknown[]) => mockGetWorkplace(...args) },
}));
jest.mock('@/src/services/export/exportTableTransformer', () => ({
  fetchAndTransformTable: (...args: unknown[]) => mockFetchAndTransformTable(...args),
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    loadPreferences: jest.fn().mockResolvedValue({ userName: 'Test' }),
    workplace: { getSnapshot: (...args: unknown[]) => mockGetPreferences(...args) },
  },
}));
jest.mock('@/src/utils/compression', () => ({
  compression: { createZipArchive: (...args: unknown[]) => mockCreateZipArchive(...args) },
}));

describe('native backup exporter', () => {
  const workplaceId = 'backup-wp' as WorkplaceId;
  const matcher = {
    id: 'matcher-1',
    accountId: 'account-1' as AccountId,
    definitionJson: '{"version":1,"sender":{"op":"contains","value":"BANK"}}',
    conditionsKey: '{"sender":"bank","body":null}',
    isEnabled: true,
    provenance: 'manual',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWorkplace.mockResolvedValue({
      id: workplaceId,
      name: 'Home',
      icon: 'wallet',
      defaultCurrencyCode: 'USD',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    mockGetPreferences.mockReturnValue({
      dismissedPatternIds: [],
      safeToSpendDays: 30,
      accountMatcherSuppressions: [
        { accountId: 'account-1', conditionsKey: matcher.conditionsKey, reason: 'forgotten' },
      ],
    });
    mockFetchAndTransformTable.mockImplementation(async (_workplaceId: string, table: string) =>
      table === 'account_matchers' ? [matcher] : [],
    );
    mockCreateZipArchive.mockResolvedValue({ base64: 'backup-archive', cleanup: jest.fn() });
  });

  it('exports matchers and suppressions additively in format v2', async () => {
    await expect(exportWorkplacesToJSON([workplaceId], 'selected')).resolves.toBe('backup-archive');

    const json = mockCreateZipArchive.mock.calls[0][1]['backup.json'];
    const backup = JSON.parse(json);
    expect(backup.formatVersion).toBe(2);
    expect(backup.workplaces[0].data.accountMatchers).toEqual([matcher]);
    expect(backup.workplaces[0].workplacePreferences.accountMatcherSuppressions).toEqual([
      {
        accountId: 'account-1',
        conditionsKey: matcher.conditionsKey,
        reason: 'forgotten',
      },
    ]);
  });
});
