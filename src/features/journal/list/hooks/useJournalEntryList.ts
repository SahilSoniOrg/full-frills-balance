import { AppConfig } from '@/src/constants';
import { useAppReady } from '@/src/contexts/app-shell/appReady';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useJournals } from '@/src/features/journal/hooks/useJournals';
import { buildTimelineGroupingOptions } from '@/src/features/journal/list/hooks/journalDayNetGrouping';
import {
  buildListSelectionChrome,
  type SelectionChromeBase,
} from '@/src/components/shared/buildSelectionChrome';
import { selectableJournalIds } from '@/src/components/journal/selectableJournalIds';
import { useCurrencyPrecision } from '@/src/hooks/use-currencies';
import { useExchangeRates } from '@/src/hooks/useExchangeRates';
import { useJournalListGrouping } from '@/src/hooks/useJournalListGrouping';
import { pruneSelectedIds } from '@/src/hooks/selectionState';
import { useSelection } from '@/src/hooks/useSelection';
import { useShareable } from '@/src/hooks/useShareable';
import { useJournalCsvExport, type ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
import { useSharePrefs } from '@/src/hooks/useSharePrefs';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import {
  createSelectedJournalShareable,
  type ShareableJournalEntry,
} from '@/src/services/sharing/JournalShareProvider';
import { computeSelectedJournalsTotal } from '@/src/services/journal/selectedJournalTotal';
import type { JournalTimelineRow } from '@/src/services/journal/journalTimelineRows';
import {
  journalFlowSignOf,
  postingFlowSignOf,
  viewerLegOf,
} from '@/src/services/journal/journalTimelinePresentation';
import type { FlowSign } from '@/src/domain/accounting/presentationPolicy';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { EnrichedJournal } from '@/src/types/domainReadModels';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { JournalTimelineViewer } from '@/src/types/journalTimeline';
import { JournalListItem } from '@/src/types/ui';
import { logger } from '@/src/services/observability/logger';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export type JournalEntryListPaginationPolicy = 'default' | 'always';

export interface UseJournalEntryListParams {
  workplaceId: WorkplaceId;
  enabled?: boolean;
  pageSize?: number;
  dateRange?: { startDate: number; endDate: number };
  searchQuery?: string;
  statuses?: JournalStatus[];
  queryOptions?: {
    minAmount?: number;
    maxAmount?: number;
    displayType?: string;
    accountIds?: AccountId[];
    journalIds?: JournalId[];
    initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  };
  initialItems?: EnrichedJournal[] | (() => EnrichedJournal[]);
  shareTitle?: string;
  paginationPolicy?: JournalEntryListPaginationPolicy;
  viewer?: JournalTimelineViewer;
  /** Override workplace currency for day-net grouping (e.g. insight with linked currency). */
  baseCurrency?: string;
  /** One card row per scoped account leg (e.g. budget with multiple expense accounts). */
  expandScopedLegs?: AccountId[];
  /** When set, row taps call this instead of opening journal details. */
  onJournalPress?: (journalId: JournalId) => void;
  /** Disable long-press multi-select (e.g. attach/pick flows). */
  disableSelection?: boolean;
}

export interface JournalEntryListCore {
  csvExport: ShareableCsvControl;
  items: JournalListItem[];
  journals: EnrichedJournal[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: Error | null;
  retry: () => void;
  hasMore: boolean;
  onEndReached?: () => void;
  selectedIds: Set<JournalId>;
  selectionChrome?: SelectionChromeBase;
  isSelectionModeActive: boolean;
  onLongPressItem: (id: JournalId) => void;
  toggleSelection: (id: JournalId) => void;
  exitSelectionMode: () => void;
  onShareSelected: () => void;
}

/**
 * Share rows use the sign the list row shows, not the stored journal type: a
 * refund is stored as EXPENSE but is income flow, so sharing must not file it
 * as spending. A zero sign (transfer, mixed) keeps its stored type.
 */
export function shareDisplayTypeFor(
  sign: FlowSign,
  fallback: JournalDisplayType,
): JournalDisplayType {
  if (sign > 0) return JournalDisplayType.INCOME;
  if (sign < 0) return JournalDisplayType.EXPENSE;
  return fallback;
}

/** Build a share row from the same amount and sign the selected list row shows. */
export function toShareableJournalEntry(
  journal: EnrichedJournal,
  viewer?: JournalTimelineViewer,
): ShareableJournalEntry {
  const leg = viewerLegOf(journal, viewer);
  const sign = leg ? postingFlowSignOf(leg) : journalFlowSignOf(journal);
  return {
    id: journal.id,
    date: journal.journalDate,
    description: journal.description || journal.semanticLabel || 'Journal entry',
    amount: leg?.amount ?? journal.totalAmount,
    currencyCode: leg?.currencyCode || journal.currencyCode,
    displayType: shareDisplayTypeFor(sign, journal.displayType),
  };
}

const noopLongPress = () => {};

/**
 * Shared journal list/search pipeline: fetch, day grouping, selection, share, pagination.
 */
export function useJournalEntryList({
  workplaceId,
  enabled = true,
  pageSize = AppConfig.defaults.journalPageSize,
  dateRange,
  searchQuery = '',
  statuses,
  queryOptions,
  initialItems,
  shareTitle = 'Journal Report',
  paginationPolicy = 'default',
  viewer,
  baseCurrency: baseCurrencyOverride,
  expandScopedLegs,
  onJournalPress,
  disableSelection = false,
}: UseJournalEntryListParams): JournalEntryListCore {
  const { isInitialized } = useAppReady();
  const { defaultShareFormat } = useSharePrefs();
  const { defaultCurrencyCode: workplaceCurrency } = useWorkplace();
  const baseCurrency = baseCurrencyOverride ?? workplaceCurrency;
  const { rateMap: exchangeRateMap } = useExchangeRates(isInitialized ? baseCurrency : undefined);
  const { precision } = useCurrencyPrecision(baseCurrency);
  const missingCurrenciesCache = useRef(new Set<string>());

  const timelineRowOptions = useMemo(
    () => ({ viewer, expandAccountIds: expandScopedLegs }),
    [viewer, expandScopedLegs],
  );

  const journalOptions = useMemo(
    () => ({
      ...queryOptions,
      initialItems: initialItems ?? queryOptions?.initialItems,
      timelineRowOptions,
      enabled,
    }),
    [enabled, queryOptions, initialItems, timelineRowOptions],
  );

  const { journals, timelineRows, isLoading, isLoadingMore, hasMore, loadMore, error, retry } =
    useJournals(workplaceId, pageSize, dateRange, searchQuery, statuses, undefined, journalOptions);

  const selectionControl = useSelection<JournalId>();
  const csvQuery = useMemo(
    () => ({
      workplaceId,
      title: shareTitle,
      dateRange: {
        ...dateRange,
        accountIds: queryOptions?.accountIds,
        journalIds: queryOptions?.journalIds,
      },
      searchQuery,
      status: statuses,
      minAmount: queryOptions?.minAmount,
      maxAmount: queryOptions?.maxAmount,
      displayType: queryOptions?.displayType,
    }),
    [workplaceId, shareTitle, dateRange, queryOptions, searchQuery, statuses],
  );
  const csvExport = useJournalCsvExport(csvQuery, {
    disabled: !isInitialized || isLoading || journals.length === 0,
  });
  const {
    selectedIds,
    isSelectionModeActive,
    toggleSelection,
    onLongPressItem,
    clearItems,
    exitSelectionMode,
    setSelectedIds,
  } = selectionControl;

  const selectionActive = !disableSelection && isSelectionModeActive;

  const handleRowPress = useCallback(
    (row: JournalTimelineRow) => {
      if (selectionActive) {
        toggleSelection(row.selectionId);
        return;
      }

      if (onJournalPress) {
        onJournalPress(row.journal.id);
        return;
      }

      AppNavigation.toJournalDetails(row.journal.id);
    },
    [selectionActive, onJournalPress, toggleSelection],
  );

  const groupingOptions = useMemo(
    () =>
      buildTimelineGroupingOptions(
        timelineRows ?? [],
        baseCurrency,
        precision,
        exchangeRateMap,
        handleRowPress,
      ),
    [timelineRows, baseCurrency, exchangeRateMap, handleRowPress, precision],
  );

  const { groupedItems: items } = useJournalListGrouping(groupingOptions);

  const selectedEntries = useMemo<ShareableJournalEntry[]>(
    () => journals.filter(j => selectedIds.has(j.id)).map(j => toShareableJournalEntry(j, viewer)),
    [journals, selectedIds, viewer],
  );
  const selectedSource = useMemo(
    () =>
      selectedEntries.length
        ? createSelectedJournalShareable(
            selectedEntries,
            {
              title: shareTitle,
              includeTime: true,
              sort: 'desc',
              showEmojis: true,
            },
            workplaceId,
          )
        : null,
    [selectedEntries, shareTitle, workplaceId],
  );
  const selectedShare = useShareable(selectedSource);
  const onShareSelected = useCallback(async () => {
    if (selectedEntries.length === 0) return;
    await selectedShare.share(defaultShareFormat);
  }, [selectedEntries.length, selectedShare, defaultShareFormat]);

  const selectableIds = useMemo(
    () => (selectionActive ? selectableJournalIds(items) : []),
    [items, selectionActive],
  );
  const selectedTotal = useMemo(
    () =>
      selectionActive ? computeSelectedJournalsTotal(timelineRows ?? [], selectedIds) : undefined,
    [selectionActive, selectedIds, timelineRows],
  );
  const { selectAll: selectItems } = selectionControl;
  const selectionChrome = useMemo<JournalEntryListCore['selectionChrome']>(
    () =>
      selectionActive
        ? buildListSelectionChrome({
            selectedIds,
            selectableIds,
            amountSummary: selectedTotal && {
              ...selectedTotal,
              label: AppConfig.strings.selection.signedTotal,
              signed: true,
            },
            itemTypeLabel: AppConfig.strings.selection.itemTypes.transaction,
            selectAll: () => selectItems(selectableIds),
            clearItems,
            exitSelectionMode,
          })
        : undefined,
    [
      selectionActive,
      selectedIds,
      selectableIds,
      selectedTotal,
      selectItems,
      clearItems,
      exitSelectionMode,
    ],
  );

  useEffect(() => {
    if (selectedIds.size === 0 || isLoading) return;

    setSelectedIds(prev =>
      pruneSelectedIds(
        prev,
        journals.map(j => j.id),
      ),
    );
  }, [journals, selectedIds, setSelectedIds, isLoading]);

  useEffect(() => {
    const toFetch = new Set<string>();
    journals.forEach(j => {
      if (j.currencyCode !== baseCurrency) {
        const rate = exchangeRateMap[j.currencyCode];
        if (!rate || rate <= 0) {
          if (!missingCurrenciesCache.current.has(j.currencyCode)) {
            toFetch.add(j.currencyCode);
            missingCurrenciesCache.current.add(j.currencyCode);
          }
        }
      }
    });

    toFetch.forEach(currencyCode => {
      exchangeRateService
        .getRate(baseCurrency, currencyCode)
        .catch(e =>
          logger.error(`Failed to dynamically fetch rate for missing currency ${currencyCode}`, e),
        );
    });
  }, [journals, baseCurrency, exchangeRateMap]);

  const onEndReached = useMemo(() => {
    if (paginationPolicy === 'default') {
      if (error || searchQuery || !hasMore) return undefined;
      return loadMore;
    }

    if (error || !hasMore) return undefined;
    return () => {
      if (isLoadingMore) return;
      loadMore();
    };
  }, [error, paginationPolicy, searchQuery, hasMore, loadMore, isLoadingMore]);

  return {
    csvExport,
    items,
    journals,
    isLoading,
    isLoadingMore,
    error,
    retry,
    hasMore,
    onEndReached,
    selectedIds,
    selectionChrome,
    isSelectionModeActive: selectionActive,
    onLongPressItem: disableSelection ? noopLongPress : onLongPressItem,
    toggleSelection,
    exitSelectionMode,
    onShareSelected,
  };
}
