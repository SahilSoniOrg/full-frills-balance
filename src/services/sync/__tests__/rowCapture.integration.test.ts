import fixture from './fixtures/dataPreparation.v1.json';
import { rowSource } from '../rowSource';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { database } from '@/src/data/database/Database';
import { rowImportData, validateWorkplaceRows } from '../workplaceRowValidation';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { asWorkplaceId } from '@/src/types/ids';
import { Icon } from '@/src/types/domainIcons';

jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: jest.fn(async () => 2) },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { workplace: { getSnapshot: () => ({ safeToSpendDays: 30 }) } },
}));

const workplaceId = asWorkplaceId(fixture.input.workplace.id);
beforeEach(async () => {
  await resetDatabase();
});
afterEach(() => {
  jest.restoreAllMocks();
});

it('captures real repository projections, scopes rows, and works in both existing consistency paths', async () => {
  const data = rowImportData(validateWorkplaceRows(fixture.rows, workplaceId));
  await importRepository.batchInsertRowRestore(
    { id: workplaceId, name: 'Synthetic books', icon: Icon.Briefcase, defaultCurrencyCode: 'USD' },
    data,
    'a'.repeat(64),
  );
  await importRepository.batchInsertRowRestore(
    {
      id: asWorkplaceId('foreign'),
      name: 'Other',
      icon: Icon.Briefcase,
      defaultCurrencyCode: 'USD',
    },
    {
      accounts: [{ ...data.accounts[0], id: 'foreign-account' }],
      journals: [],
      transactions: [],
      auditLogs: [],
    },
    'b'.repeat(64),
  );
  const capture = jest.spyOn(exportRepository, 'captureConsistently');
  const read = await rowSource.readWorkplaceRows(workplaceId);
  expect(capture).toHaveBeenCalledTimes(1);
  const inWriter = await database.write(() => rowSource.readWorkplaceRowsInWriter(workplaceId));
  expect(capture).toHaveBeenCalledTimes(1);
  expect(inWriter).toEqual(read);
  expect(
    read
      .filter(row => row.table === 'accounts')
      .map(row => row.rowId)
      .sort(),
  ).toEqual(['cash', 'expense']);
  expect(read.some(row => row.rowId === 'foreign-account')).toBe(false);
  // Publication fills legacy account subtypes and rebuilds balances in the supplied
  // import bag. Capture preserves persisted defaults and excludes derived balances.
  expect(rowImportData(read)).toMatchObject(fixture.importData);
  expect(read.every(row => !Object.hasOwn(row.content, 'runningBalance'))).toBe(true);
});

it('advances by the last raw ID across a completely excluded page', async () => {
  jest
    .spyOn(workplaceRepository, 'find')
    .mockResolvedValue({ ...fixture.input.workplace, updatedAt: new Date(20) } as never);
  const pending = fixture.input.tables.transaction_inbox_records[0];
  const filtered = Array.from({ length: 250 }, (_, index) => ({
    ...pending,
    id: `sms-${String(index).padStart(3, '0')}`,
  }));
  const included = { ...pending, id: 'sms-250', processingStatus: 'dismissed' };
  const pages = jest.spyOn(exportRepository, 'fetchTablePage').mockImplementation(async input => {
    if (input.tableName !== 'transaction_inbox_records') return [];
    if (!input.afterId) return filtered;
    expect(input.afterId).toBe('sms-249');
    return [included];
  });
  const rows = await rowSource.readWorkplaceRows(workplaceId);
  expect(
    rows.filter(row => row.table === 'transaction_inbox_records').map(row => row.rowId),
  ).toEqual(['sms-250']);
  expect(
    pages.mock.calls.every(([input]) => input.workplaceId === workplaceId && input.limit === 250),
  ).toBe(true);
  expect(
    pages.mock.calls.filter(([input]) => input.tableName === 'transaction_inbox_records'),
  ).toHaveLength(2);
});
