import { analytics } from '@/src/services/analytics-service';
import { AccountId } from '@/src/types/domain';
import { DateRange, PeriodFilter } from '@/src/utils/dateUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface JournalSearchFilterParams {
  q?: string;
  startDate?: string;
  endDate?: string;
  accountIds?: string;
  minAmount?: string;
  maxAmount?: string;
  displayType?: string;
}

export function useJournalSearchFilters(params: JournalSearchFilterParams) {
  const {
    q,
    startDate,
    endDate,
    accountIds: accountIdsParam,
    minAmount: minAmountParam,
    maxAmount: maxAmountParam,
    displayType: displayTypeParam,
  } = params;
  const [searchQuery, setSearchQuery] = useState(q || '');
  const [dateRange, setDateRangeState] = useState<DateRange | null>(() => {
    const start = Number.parseInt(startDate || '', 10);
    const end = Number.parseInt(endDate || '', 10);
    return Number.isFinite(start) && Number.isFinite(end)
      ? { startDate: start, endDate: end }
      : null;
  });
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(() =>
    dateRange && endDate ? { type: 'CUSTOM' } : { type: 'ALL_TIME' },
  );
  const [accountIds, setAccountIds] = useState<AccountId[]>(() =>
    accountIdsParam ? (accountIdsParam.split(',') as AccountId[]) : [],
  );
  const [minAmount, setMinAmount] = useState(minAmountParam || '');
  const [maxAmount, setMaxAmount] = useState(maxAmountParam || '');
  const [displayType, setDisplayType] = useState(displayTypeParam || '');

  const setDateRange = useCallback((range: DateRange | null, filter: PeriodFilter) => {
    setDateRangeState(range);
    setPeriodFilter(filter);
  }, []);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTrackedQueryRef = useRef('');

  useEffect(() => {
    const hasMeaningfulQuery =
      searchQuery.length >= 2 ||
      accountIds.length > 0 ||
      minAmount !== '' ||
      maxAmount !== '' ||
      displayType !== '' ||
      dateRange !== null;
    if (!hasMeaningfulQuery) return;

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      const queryKey = `${searchQuery}:${accountIds.join(',')}:${minAmount}:${maxAmount}:${displayType}:${dateRange?.startDate}`;
      if (queryKey === lastTrackedQueryRef.current) return;
      lastTrackedQueryRef.current = queryKey;
      analytics.logSearchPerformed('journal', searchQuery.length);
      analytics.trackFeatureUsage('journal_search', 'query_details', {
        query_length: searchQuery.length,
        has_account_filter: accountIds.length > 0,
        account_count: accountIds.length,
        has_amount_filter: minAmount !== '' || maxAmount !== '',
        has_display_type_filter: displayType !== '',
        has_date_filter: dateRange !== null,
        period_filter_type: periodFilter.type,
      });
    }, 2000);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, accountIds, minAmount, maxAmount, displayType, dateRange, periodFilter.type]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDateRangeState(null);
    setPeriodFilter({ type: 'ALL_TIME' });
    setAccountIds([]);
    setMinAmount('');
    setMaxAmount('');
    setDisplayType('');
  }, []);

  const queryDateRange = useMemo(
    () => (dateRange ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : undefined),
    [dateRange],
  );
  const queryOptions = useMemo(
    () => ({
      minAmount: minAmount ? parseFloat(minAmount) : undefined,
      maxAmount: maxAmount ? parseFloat(maxAmount) : undefined,
      displayType: displayType || undefined,
      accountIds: accountIds.length > 0 ? accountIds : undefined,
    }),
    [minAmount, maxAmount, displayType, accountIds],
  );

  return {
    searchQuery,
    setSearchQuery,
    dateRange,
    periodFilter,
    setDateRange,
    accountIds,
    setAccountIds,
    minAmount,
    setMinAmount,
    maxAmount,
    setMaxAmount,
    displayType,
    setDisplayType,
    clearFilters,
    queryDateRange,
    queryOptions,
  };
}
