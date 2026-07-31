import { AppConfig } from '@/src/constants';
import { amountInBaseCurrency, buildDayNetStats } from '@/src/services/ledger/buildDayNetStats';
import { EnrichedJournal, JournalDisplayType, TransactionId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import type { GroupingOptions } from '@/src/hooks/useTransactionGrouping';
import { mapJournalToCardProps } from '../../utils/journalUiUtils';

/**
 * Signed journal amount in workplace base currency for day-net headers.
 * Income +, expense −, transfer 0. Warns (and contributes 0) when FX is missing.
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
  if (
    amount === 0 &&
    journal.currencyCode !== baseCurrency &&
    !(exchangeRateMap[journal.currencyCode] > 0)
  ) {
    logger.warn(
      AppConfig.strings.journal.errors.missingExchangeRate(journal.currencyCode, baseCurrency),
    );
  }
  if (journal.displayType === JournalDisplayType.INCOME) return amount;
  if (journal.displayType === JournalDisplayType.EXPENSE) return -amount;
  return 0;
}

/**
 * Grouping options for journal transaction lists (day separators + card rows).
 */
export function buildJournalGroupingOptions(
  journals: EnrichedJournal[],
  baseCurrency: string,
  precision: number,
  exchangeRateMap: Record<string, number>,
  onPress: (journal: EnrichedJournal) => void,
): GroupingOptions<EnrichedJournal> {
  return {
    items: journals,
    getDate: (j: EnrichedJournal) => j.journalDate,
    sortByDate: 'desc' as const,
    getStats: (journalsForDay: EnrichedJournal[]) =>
      buildDayNetStats(journalsForDay, baseCurrency, precision, j =>
        getJournalSignedBaseAmount(j, baseCurrency, exchangeRateMap),
      ),
    renderItem: (journal: EnrichedJournal) => ({
      id: journal.id as string as TransactionId,
      type: 'transaction' as const,
      date: journal.journalDate,
      onPress: () => onPress(journal),
      cardProps: mapJournalToCardProps(journal),
    }),
  };
}
