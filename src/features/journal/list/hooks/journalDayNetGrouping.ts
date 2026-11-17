import { AppConfig } from '@/src/constants';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import {
  journalFlowSignOf,
  mapJournalToEntryCardProps,
  postingFlowSignOf,
} from '@/src/services/journal/journalTimelinePresentation';
import type { GroupingOptions } from '@/src/hooks/useJournalListGrouping';
import { amountInBaseCurrency, buildDayNetStats } from '@/src/services/ledger/buildDayNetStats';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { logger } from '@/src/services/observability/logger';

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
 * Uses the same cash-flow sign as the journal row: income +, spending −,
 * refunds +, balance-sheet-only journals 0.
 */
function getJournalSignedBaseAmount(
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
  return journalFlowSignOf(journal) * amount;
}

/**
 * Signed amount from a viewer account leg for day-net headers, using the
 * same cash-flow sign as the viewed row.
 */
export function getJournalViewerSignedAmount(
  journal: EnrichedJournal,
  viewer: JournalTimelineViewer,
  baseCurrency: string,
  exchangeRateMap: Record<string, number>,
): number {
  const viewerAccount = journal.accounts.find(a => a.id === viewer.accountId);
  const legAmount = viewerAccount?.amount ?? journal.totalAmount;
  const legCurrency = viewerAccount?.currencyCode || journal.currencyCode;
  const amount = amountInBaseCurrency(legAmount, legCurrency, baseCurrency, exchangeRateMap);
  warnIfMissingFxRate(amount, legCurrency, baseCurrency, exchangeRateMap);
  if (!viewerAccount) return 0;
  return postingFlowSignOf(viewerAccount) * amount;
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
    renderItem: row => {
      const cardProps = mapJournalToEntryCardProps(row.journal, row.viewer);
      return {
        id: row.listId,
        selectionId: row.selectionId,
        type: 'journal' as const,
        date: row.journal.journalDate,
        onPress: () => onPress(row),
        cardProps,
      };
    },
  };
}
