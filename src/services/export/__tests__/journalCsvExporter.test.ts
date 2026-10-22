import { database } from '@/src/data/database/Database';
import Journal from '@/src/data/models/Journal';
import { asJournalId, asWorkplaceId } from '@/src/types/ids';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { ShareFormat } from '@/src/types/sharing';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { createJournalCsvShareable } from '../journalCsvExporter';

// Capture only the output boundary: filtering, pagination, enrichment, and serialization stay real.
jest.mock('../textExportWriter', () => ({
  createTextExportWriter: () => {
    const chunks: string[] = [];
    return {
      write: async (content: string) => {
        chunks.push(content);
      },
      getArtifact: () => ({ kind: 'text', content: chunks.join('') }),
      cleanup: jest.fn(),
    };
  },
}));

beforeEach(async () => {
  await resetDatabase();
});

it('exports every matching journal across the 500-row boundary when timestamps tie', async () => {
  const workplaceId = asWorkplaceId('csv-workplace');
  const timestamp = 1_700_000_000_000;
  const ids = Array.from({ length: 505 }, (_, index) =>
    asJournalId(`csv-${String(index).padStart(4, '0')}`),
  );
  await database.write(async () => {
    const records = [...ids, asJournalId('other-workplace'), asJournalId('wrong-status')].map(id =>
      database.collections.get<Journal>('journals').prepareCreate(record => {
        record._raw.id = id;
        record.workplaceId = id === 'other-workplace' ? asWorkplaceId('other') : workplaceId;
        record.journalDate = timestamp;
        record.createdAt = new Date(timestamp);
        record.updatedAt = new Date(timestamp);
        record.description = id === 'csv-0504' ? '=SUM(1,2) "quoted"\nnext line' : 'Matching entry';
        record.notes = 'Notes, with commas';
        record.status = id === 'wrong-status' ? JournalStatus.PLANNED : JournalStatus.POSTED;
        record.currencyCode = 'USD';
        record.totalAmount = 12.5;
        record.transactionCount = 0;
        record.displayType = JournalDisplayType.TRANSFER;
      }),
    );
    await database.batch(records);
  });

  const source = createJournalCsvShareable({
    workplaceId,
    title: 'Filtered history',
    dateRange: { startDate: timestamp, endDate: timestamp },
    status: [JournalStatus.POSTED],
    minAmount: 12,
    maxAmount: 13,
    displayType: JournalDisplayType.TRANSFER,
  });
  const reportProgress = jest.fn();
  const artifact = await source.prepare(ShareFormat.CSV, {
    signal: new AbortController().signal,
    reportProgress,
  });
  if (artifact?.kind !== 'text') throw new Error('Expected captured CSV output');
  expect(
    artifact.content.startsWith('\uFEFF"Journal ID","Transaction ID","Row Type","Journal Date"'),
  ).toBe(true);
  const rows = artifact.content.split('\r\n').slice(1);
  expect(rows).toHaveLength(505);
  expect(rows.map(row => row.split(',')[0])).toEqual([...ids].reverse().map(id => `"${id}"`));
  expect(rows[0]).toContain('"\'=SUM(1,2) ""quoted""\nnext line"');
  expect(rows[0]).toContain('"Notes, with commas"');
  expect(rows[0]).toContain(',"JOURNAL_ONLY",');
  expect(rows[0]).not.toContain('12.5');
  expect(reportProgress.mock.calls.map(([message]) => message)).toEqual([
    '500 rows exported',
    '505 rows exported',
  ]);
});
