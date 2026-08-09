import { AppConfig } from '@/src/constants';
import { mapTimelineRowToEntryCardProps } from '@/src/adapters/journalEntryCardAdapter';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import type { GroupingOptions } from '@/src/hooks/useJournalListGrouping';
import { amountInBaseCurrency, buildDayNetStats } from '@/src/services/ledger/buildDayNetStats';
import { EnrichedJournal, JournalDisplayType } from '@/src/types/domain';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { logger } from '@/src/utils/logger';

function warnIfMissingFxRate(
  amount: number,
  currencyCode: string,
  baseCurrency: string,
  exchangeRateMap: Record<string, number>,
): void {
  if (amount === 0 && currencyCode !== baseCurrency && !(exchangeRateMap[currencyCode] > 0)) {
    logger.warn(AppConfig.strings.journal.errors.missingExchangeRate(currencyCode, baseCurrency));
  }
}

/**
 * Signed journal amount in workplace base currency for day-net headers.
 * Income +, expense −, transfer 0.
 */
export function getJournalSignedBaseAmount(
  journal: EnrichedJournal,
  baseCurrency: string,
  exchangeRateMap: Record<string, number>,
): number {
  const amount = amountInBaseCurrency(
    journal.totalAmount,
    journal.currencyCode,
    baseCurrency,
    exchangeRateMap,
  );
  warnIfMissingFxRate(amount, journal.currencyCode, baseCurrency, exchangeRateMap);
  if (journal.displayType === JournalDisplayType.INCOME) return amount;
  if (journal.displayType === JournalDisplayType.EXPENSE) return -amount;
  return 0;
}

/**
 * Signed amount from a viewer account leg for day-net headers.
 * DESTINATION = +, SOURCE = −.
 */
export function getJournalViewerSignedAmount(
  journal: EnrichedJournal,
  viewer: JournalTimelineViewer,
  baseCurrency: string,
  exchangeRateMap: Record<string, number>,
): number {
  const viewerAccount = journal.accounts.find(a => a.id === viewer.accountId);
  const legAmount = viewerAccount?.amount ?? journal.totalAmount;
  const amount = amountInBaseCurrency(
    legAmount,
    journal.currencyCode,
    baseCurrency,
    exchangeRateMap,
  );
  warnIfMissingFxRate(amount, journal.currencyCode, baseCurrency, exchangeRateMap);
  if (viewerAccount?.role === 'DESTINATION') return amount;
  if (viewerAccount?.role === 'SOURCE') return -amount;
  return 0;
}

export function buildTimelineGroupingOptions(
  rows: JournalTimelineRow[],
  baseCurrency: string,
  precision: number,
  exchangeRateMap: Record<string, number>,
  onPress: (row: JournalTimelineRow) => void,
): GroupingOptions<JournalTimelineRow> {
  return {
    items: rows,
    getDate: row => row.journal.journalDate,
    sortByDate: 'desc' as const,
    getStats: (rowsForDay: JournalTimelineRow[]) =>
      buildDayNetStats(rowsForDay, baseCurrency, precision, row =>
        row.viewer
          ? getJournalViewerSignedAmount(row.journal, row.viewer, baseCurrency, exchangeRateMap)
          : getJournalSignedBaseAmount(row.journal, baseCurrency, exchangeRateMap),
      ),
    renderItem: row => ({
      id: row.listId,
      selectionId: row.selectionId,
      type: 'journal' as const,
      date: row.journal.journalDate,
      onPress: () => onPress(row),
      cardProps: mapTimelineRowToEntryCardProps(row),
    }),
  };
}
