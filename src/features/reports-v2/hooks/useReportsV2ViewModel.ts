import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asAccountId, asWorkplaceId, type AccountId } from '@/src/types/ids';
import { formatPeriodLabel, periodRangeForPreset } from '@/src/features/reports-v2/helpers';
import type {
  ReportsV2Basis,
  ReportsV2Comparison,
  ReportsV2DrilldownInput,
  ReportsV2FiltersViewModel,
  ReportsV2Granularity,
  ReportsV2LoadState,
  ReportsV2PeriodPreset,
  ReportsV2Query,
  ReportsV2Result,
  ReportsV2SectionId,
  ReportsV2ViewModel,
} from '@/src/features/reports-v2/types';
import type { ReportsV2QueryEngine } from '@/src/services/reports-v2/reportQueryEngine';

const EMPTY_ACCOUNT_IDS: readonly string[] = [];
const FILTER_SETTLE_DELAY_MS = 220;

export interface UseReportsV2ViewModelOptions {
  engine: ReportsV2QueryEngine;
  workplaceId: string;
  targetCurrency: string;
  timeZone?: string;
  initialSection?: ReportsV2SectionId;
  initialPeriodPreset?: ReportsV2PeriodPreset;
  initialBasis?: ReportsV2Basis;
  initialComparison?: ReportsV2Comparison;
  initialGranularity?: ReportsV2Granularity;
  initialAccountIds?: readonly string[];
  accountScopeLabel?: string;
  onRequestCustomRange?: () => void;
  onRequestAccountScope?: () => void;
  onRequestCurrency?: () => void;
  onJournalDrilldown?: (input: {
    label: string;
    journalIds: readonly string[];
    accountIds?: readonly string[];
    startDate: number;
    endDate: number;
  }) => void;
}

export function useReportsV2ViewModel({
  engine,
  workplaceId,
  targetCurrency,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  initialSection = 'overview',
  initialPeriodPreset = 'month',
  initialBasis = 'ACTUAL',
  initialComparison = 'PREVIOUS_PERIOD',
  initialGranularity = 'AUTO',
  initialAccountIds = EMPTY_ACCOUNT_IDS,
  accountScopeLabel,
  onRequestCustomRange,
  onRequestAccountScope,
  onRequestCurrency,
  onJournalDrilldown,
}: UseReportsV2ViewModelOptions): ReportsV2ViewModel & {
  setCustomRange: (startDate: number, endDate: number) => void;
} {
  const [periodPreset, setPeriodPreset] = useState<ReportsV2PeriodPreset>(initialPeriodPreset);
  const [periodRange, setPeriodRange] = useState(() => periodRangeForPreset(initialPeriodPreset));
  const [basis, setBasis] = useState<ReportsV2Basis>(initialBasis);
  const [comparison, setComparison] = useState<ReportsV2Comparison>(
    initialPeriodPreset === 'all-time' ? 'NONE' : initialComparison,
  );
  const [granularity, setGranularity] = useState<ReportsV2Granularity>(initialGranularity);
  const [activeSection, setActiveSection] = useState<ReportsV2SectionId>(initialSection);
  const [state, setState] = useState<ReportsV2LoadState>('idle');
  const [result, setResult] = useState<ReportsV2Result | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const runSequence = useRef(0);
  const hasLoaded = useRef(false);
  const scheduledRun = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialAccountIdsKey = initialAccountIds.join('\u001f');
  const [selectedAccountIds, setSelectedAccountIds] = useState<readonly AccountId[]>(() =>
    initialAccountIdsKey ? initialAccountIdsKey.split('\u001f').map(asAccountId) : [],
  );

  const query = useMemo<ReportsV2Query>(
    () => ({
      workplaceId: asWorkplaceId(workplaceId),
      period: { startDate: periodRange.startDate, endDate: periodRange.endDate, timeZone },
      targetCurrency,
      basis,
      comparison,
      granularity,
      sections: [activeSection],
      ...(selectedAccountIds.length > 0 ? { accountIds: selectedAccountIds } : {}),
    }),
    [
      basis,
      comparison,
      granularity,
      periodRange.endDate,
      periodRange.startDate,
      selectedAccountIds,
      activeSection,
      targetCurrency,
      timeZone,
      workplaceId,
    ],
  );

  const runQuery = useCallback(
    async (
      nextState: 'loading' | 'refreshing',
      queryToRun: ReportsV2Query = query,
      sequence = ++runSequence.current,
    ) => {
      setState(nextState);
      setError(null);
      try {
        const nextResult = await engine.run(queryToRun);
        if (sequence !== runSequence.current) return;
        setResult(nextResult);
        setState('success');
      } catch (cause) {
        if (sequence !== runSequence.current) return;
        setError(cause instanceof Error ? cause : new Error('Unable to load this report.'));
        setState('error');
      }
    },
    [engine, query],
  );

  const cancelScheduledRun = useCallback(() => {
    if (scheduledRun.current === null) return;
    clearTimeout(scheduledRun.current);
    scheduledRun.current = null;
  }, []);

  useEffect(() => {
    const nextState = hasLoaded.current ? 'refreshing' : 'loading';
    hasLoaded.current = true;

    // Invalidate an in-flight query as soon as the user changes a filter. This
    // keeps a late response from replacing the screen with the wrong query.
    const sequence = ++runSequence.current;
    setState(nextState);
    setError(null);
    cancelScheduledRun();

    const timer = setTimeout(
      () => {
        scheduledRun.current = null;
        void runQuery(nextState, query, sequence);
      },
      nextState === 'loading' ? 0 : FILTER_SETTLE_DELAY_MS,
    );
    scheduledRun.current = timer;

    return () => {
      if (scheduledRun.current !== timer) return;
      clearTimeout(timer);
      scheduledRun.current = null;
    };
  }, [cancelScheduledRun, query, runQuery]);

  const runImmediately = useCallback(
    (nextState: 'loading' | 'refreshing') => {
      cancelScheduledRun();
      void runQuery(nextState);
    },
    [cancelScheduledRun, runQuery],
  );

  const onPeriodPresetChange = useCallback(
    (nextPreset: ReportsV2PeriodPreset) => {
      if (nextPreset === 'custom') {
        onRequestCustomRange?.();
        return;
      }
      setPeriodPreset(nextPreset);
      if (nextPreset === 'all-time') setComparison('NONE');
      setPeriodRange(periodRangeForPreset(nextPreset));
    },
    [onRequestCustomRange],
  );
  const setCustomRange = useCallback((startDate: number, endDate: number) => {
    setPeriodPreset('custom');
    setPeriodRange({ startDate, endDate });
  }, []);
  const onAccountIdsChange = useCallback((accountIds: readonly string[]) => {
    setSelectedAccountIds(accountIds.map(asAccountId));
  }, []);
  const onDrilldown = useCallback(
    (input: ReportsV2DrilldownInput) => {
      const startDate = input.startDate ?? query.period.startDate;
      const endDate = input.endDate ?? query.period.endDate;
      const hasDirectScope = Boolean(input.accountIds?.length || input.journalIds?.length);
      if (onJournalDrilldown && hasDirectScope) {
        onJournalDrilldown({
          label: input.label,
          journalIds: input.journalIds ?? [],
          ...(input.accountIds ? { accountIds: input.accountIds } : {}),
          startDate,
          endDate,
        });
        return;
      }
      void engine
        .drillDown({
          baseQuery: query,
          ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
          ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
          ...(input.accountIds ? { accountIds: input.accountIds.map(asAccountId) } : {}),
          ...(input.accountTypes ? { accountTypes: input.accountTypes } : {}),
          ...(input.accountSubtypes ? { accountSubtypes: input.accountSubtypes as never } : {}),
          ...(input.journalIds ? { journalIds: input.journalIds as never } : {}),
          ...(input.semanticTypes ? { semanticTypes: input.semanticTypes as never } : {}),
          ...(input.flowClassifications ? { flowClassifications: input.flowClassifications } : {}),
        })
        .then(journalIds =>
          onJournalDrilldown?.({
            label: input.label,
            journalIds,
            ...(input.accountIds ? { accountIds: input.accountIds } : {}),
            startDate,
            endDate,
          }),
        )
        .catch(() => undefined);
    },
    [engine, onJournalDrilldown, query],
  );
  const filters = useMemo<ReportsV2FiltersViewModel>(
    () => ({
      periodPreset,
      periodLabel: formatPeriodLabel(periodRange.startDate, periodRange.endDate, periodPreset),
      basis,
      comparison,
      granularity,
      targetCurrency,
      accountIds: selectedAccountIds,
      onAccountIdsChange,
      accountScopeLabel:
        accountScopeLabel ??
        (selectedAccountIds.length
          ? `${selectedAccountIds.length} account${selectedAccountIds.length === 1 ? '' : 's'}`
          : 'All accounts'),
      onPeriodPresetChange,
      onBasisChange: setBasis,
      onComparisonChange: setComparison,
      onGranularityChange: setGranularity,
      onRequestCustomRange,
      onRequestAccountScope,
      onRequestCurrency,
    }),
    [
      accountScopeLabel,
      basis,
      comparison,
      granularity,
      onAccountIdsChange,
      onPeriodPresetChange,
      onRequestAccountScope,
      onRequestCurrency,
      onRequestCustomRange,
      periodPreset,
      periodRange.endDate,
      periodRange.startDate,
      selectedAccountIds,
      targetCurrency,
    ],
  );
  const renderedSection = useMemo(() => {
    if (!result) return null;
    const requestedSection = result.sections.find(section => section.id === activeSection);
    if (requestedSection) return requestedSection;
    if (state === 'refreshing' || state === 'error') return result.sections[0] ?? null;
    return null;
  }, [activeSection, result, state]);
  return {
    query,
    filters,
    activeSection,
    setActiveSection,
    state,
    result,
    renderedSection,
    error,
    onRefresh: () => runImmediately('refreshing'),
    onRetry: () => runImmediately('loading'),
    onDrilldown,
    onRequestCustomRange,
    onRequestAccountScope,
    onRequestCurrency,
    setCustomRange,
  };
}
