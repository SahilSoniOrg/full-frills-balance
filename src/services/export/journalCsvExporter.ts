import type { JournalTimelineQuery } from '@/src/data/repositories/journal/JournalObserveQueries';
import { iterateEnrichedJournalTimeline } from '@/src/services/journal/journalTimelineReadModel';
import { throwIfShareAborted } from '@/src/services/sharing/sharingCancellation';
import type { EnrichedJournal } from '@/src/types/domainReadModels';
import { ShareFormat, type Shareable, type SharePreparationContext } from '@/src/types/sharing';
import dayjs from 'dayjs';
import { createTextExportWriter } from './textExportWriter';

export type JournalCsvExportQuery = Omit<JournalTimelineQuery, 'limit'> & {
  title: string;
};

export const JOURNAL_CSV_SHAREABLE_ID = 'journal-csv-export';

function snapshotQuery(query: JournalCsvExportQuery): JournalCsvExportQuery {
  return {
    ...query,
    dateRange: query.dateRange
      ? {
          ...query.dateRange,
          journalIds: query.dateRange.journalIds ? [...query.dateRange.journalIds] : undefined,
          accountIds: query.dateRange.accountIds ? [...query.dateRange.accountIds] : undefined,
        }
      : undefined,
    status: query.status ? [...query.status] : undefined,
  };
}

function csvCell(value: string | number | undefined): string {
  if (typeof value === 'number') return String(value);
  const text = value ?? '';
  // Quote text and neutralize formulas, including ones preceded by whitespace.
  const safe = /^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportRow(
  journal: EnrichedJournal,
  leg?: EnrichedJournal['accounts'][number],
): (string | number | undefined)[] {
  return [
    journal.id,
    leg?.transactionId,
    leg ? 'TRANSACTION' : 'JOURNAL_ONLY',
    dayjs(journal.journalDate).format('YYYY-MM-DDTHH:mm:ssZ'),
    leg?.transactionDate !== undefined
      ? dayjs(leg.transactionDate).format('YYYY-MM-DDTHH:mm:ssZ')
      : undefined,
    journal.description || journal.semanticLabel,
    journal.notes,
    journal.status,
    journal.displayType,
    leg?.transactionType,
    leg?.id,
    leg?.name,
    leg?.accountType,
    leg?.amount,
    leg?.transactionCurrencyCode,
    leg?.currencyCode,
    journal.currencyCode,
    leg?.exchangeRate,
  ];
}

const HEADERS = [
  'Journal ID',
  'Transaction ID',
  'Row Type',
  'Journal Date',
  'Transaction Date',
  'Description',
  'Journal Notes',
  'Status',
  'Journal Type',
  'Transaction Type',
  'Account ID',
  'Account',
  'Account Type',
  'Transaction Amount',
  'Transaction Currency',
  'Account Currency',
  'Journal Currency',
  'Exchange Rate',
];

export function createJournalCsvShareable(query: JournalCsvExportQuery): Shareable {
  const snapshot = snapshotQuery(query);
  const period = snapshot.dateRange;
  const timeframe =
    period?.startDate !== undefined && period.endDate !== undefined
      ? `${dayjs(period.startDate).format('YYYY-MM-DD')}_${dayjs(period.endDate).format('YYYY-MM-DD')}`
      : 'all-time';

  return {
    id: JOURNAL_CSV_SHAREABLE_ID,
    title: snapshot.title,
    filename: `transactions-${timeframe}`,
    mimeType: 'text/csv',
    fileExtension: 'csv',
    supportedFormats: [ShareFormat.CSV],
    scope: { kind: 'workplace', workplaceId: snapshot.workplaceId },
    requireFile: true,
    preferStreaming: true,
    async prepare(format: ShareFormat, context: SharePreparationContext) {
      if (format !== ShareFormat.CSV)
        throw new Error(`Unsupported journal export format: ${format}`);
      throwIfShareAborted(context.signal);
      const timelineQuery: Omit<JournalTimelineQuery, 'limit'> = {
        workplaceId: snapshot.workplaceId,
        dateRange: snapshot.dateRange,
        searchQuery: snapshot.searchQuery,
        status: snapshot.status,
        minAmount: snapshot.minAmount,
        maxAmount: snapshot.maxAmount,
        displayType: snapshot.displayType,
      };
      const writer = createTextExportWriter(
        `transactions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.csv`,
        'text/csv',
        context,
      );
      let exportedCount = 0;
      const rowBuffer: string[] = [];
      try {
        await writer.write('\uFEFF' + HEADERS.map(csvCell).join(','));
        for await (const journals of iterateEnrichedJournalTimeline(
          timelineQuery,
          context.signal,
        )) {
          for (const journal of journals) {
            const legs = journal.accounts.length > 0 ? journal.accounts : [undefined];
            for (const leg of legs) {
              rowBuffer.push(exportRow(journal, leg).map(csvCell).join(','));
              exportedCount += 1;
              if (rowBuffer.length === 500) {
                throwIfShareAborted(context.signal);
                await writer.write('\r\n' + rowBuffer.join('\r\n'));
                rowBuffer.length = 0;
                context.reportProgress(`${exportedCount} rows exported`);
              }
            }
          }
        }
        if (rowBuffer.length > 0) {
          throwIfShareAborted(context.signal);
          await writer.write('\r\n' + rowBuffer.join('\r\n'));
          context.reportProgress(`${exportedCount} rows exported`);
        }
        if (exportedCount === 0) {
          writer.cleanup();
          return null;
        }
        return writer.getArtifact();
      } catch (error) {
        writer.cleanup();
        throw error;
      }
    },
  };
}
