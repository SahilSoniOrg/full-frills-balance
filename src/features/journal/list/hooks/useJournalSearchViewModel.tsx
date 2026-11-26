import { attachSelectionActions } from '@/src/components/shared/buildSelectionChrome';
import { AppConfig } from '@/src/constants';
import type { JournalSelectionBundle } from '../../components/JournalListView';
import type { JournalListModalsProps } from '../../components/JournalListModals';
import { useJournalsBulkOperations } from '../../hooks/useJournalsBulkOperations';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import type { AccountFields, PlainInboxRecord } from '@/src/types/plainDtos';
import { useAccounts } from '@/src/components/account-selection';
import { AttachToJournalConfirmContent } from '@/src/components/transaction-capture/AttachToJournalConfirmContent';
import { buildAttachToJournalConfirmMessage } from '@/src/components/transaction-capture/attachToJournalConfirm';
import { analytics } from '@/src/services/analytics';
import { smsService } from '@/src/services/sms-service';
import { transactionCaptureStrings as captureCopy } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { useHourCyclePrefs } from '@/src/hooks/useHourCyclePrefs';
import { AccountId, JournalId } from '@/src/types/ids';
import { JournalListItem } from '@/src/types/ui';
import { DateRange, PeriodFilter } from '@/src/domain/calendar/dateRanges';
import { confirm, showErrorAlert, toast } from '@/src/services/feedback/alerts';
import { AppNavigation } from '@/src/navigation/AppNavigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useJournalSearchFilters } from './useJournalSearchFilters';
import { useJournalEntryList } from './useJournalEntryList';
import type { ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
import type { EnrichedJournal } from '@/src/types/domainReadModels';

export interface JournalSearchViewModel {
  csvExport?: ShareableCsvControl;
  items: JournalListItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error?: Error | null;
  retry?: () => void;
  onEndReached?: () => void;
  /** When true, tapping a journal attaches an inbox item instead of opening details. */
  attachMode: boolean;

  // Filters
  searchQuery: string;
  setSearchQuery: (val: string) => void;

  dateRange: DateRange | null;
  periodFilter: PeriodFilter;
  setDateRange: (range: DateRange | null, filter: PeriodFilter) => void;

  accountIds: AccountId[];
  setAccountIds: (ids: AccountId[]) => void;

  minAmount: string;
  setMinAmount: (val: string) => void;

  maxAmount: string;
  setMaxAmount: (val: string) => void;

  displayType: string; // '', 'INCOME', 'EXPENSE', 'TRANSFER'
  setDisplayType: (val: string) => void;

  reportScopeLabel?: string;
  clearReportScope: () => void;

  clearFilters: () => void;

  hasMore: boolean;
  accounts: AccountFields[];

  // Filter chrome (picker visibility)
  isAccountPickerVisible: boolean;
  openAccountPicker: () => void;
  closeAccountPicker: () => void;
  isDatePickerVisible: boolean;
  openDatePicker: () => void;
  closeDatePicker: () => void;

  selection: JournalSelectionBundle;
  modals?: JournalListModalsProps;
}

export function useJournalSearchViewModel(): JournalSearchViewModel {
  const params = useLocalSearchParams();
  const { workplaceId, defaultCurrencyCode } = useWorkplace();
  const privateMode = useEffectivePrivacyMode();
  const { accounts } = useAccounts(workplaceId);
  const { resolvedHourCycle } = useHourCyclePrefs();
  const isMountedRef = useRef(true);
  const attachRequestLockRef = useRef(false);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );
  const attachInboxId =
    typeof params.attachInboxId === 'string' && params.attachInboxId.length > 0
      ? params.attachInboxId
      : undefined;
  const attachInboxChannel =
    params.attachInboxChannel === 'email' ||
    params.attachInboxChannel === 'voice' ||
    params.attachInboxChannel === 'sms'
      ? params.attachInboxChannel
      : 'sms';
  const attachMode = Boolean(attachInboxId);
  const [attachInboxCache, setAttachInboxCache] = useState<{
    id: string;
    record: PlainInboxRecord | null;
  } | null>(null);
  const attachInbox =
    attachInboxId && attachInboxCache?.id === attachInboxId ? attachInboxCache.record : null;

  useEffect(() => {
    if (!attachInboxId) return;
    let cancelled = false;
    void smsService
      .findInboxRecord(workplaceId, attachInboxId)
      .then(record => {
        if (!cancelled) setAttachInboxCache({ id: attachInboxId, record });
      })
      .catch(error => {
        if (!cancelled) showErrorAlert(error, captureCopy.attachToJournalErrorTitle, true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachInboxId, workplaceId]);

  // Route Params
  const filters = useJournalSearchFilters({
    q: params.q as string,
    startDate: params.startDate as string,
    endDate: params.endDate as string,
    accountIds: params.accountIds as string,
    journalIds: params.journalIds as string,
    journalScope: params.journalScope as string,
    reportScopeLabel: params.reportScopeLabel as string,
    reportScopeStartDate: params.reportScopeStartDate as string,
    reportScopeEndDate: params.reportScopeEndDate as string,
    reportScopeAccountIds: params.reportScopeAccountIds as string,
    minAmount: params.minAmount as string,
    maxAmount: params.maxAmount as string,
    displayType: params.displayType as string,
  });

  const journalsRef = useRef<EnrichedJournal[]>([]);

  const handleAttachJournal = useCallback(
    (journalId: JournalId) => {
      if (!attachInboxId || attachRequestLockRef.current) return;
      const journal = journalsRef.current.find(entry => entry.id === journalId) ?? null;
      const journalLabel =
        journal?.description?.trim() || journal?.semanticLabel?.trim() || 'this journal';
      let confirmSubmitted = false;
      const requestWorkplaceId = workplaceId;
      const requestInboxId = attachInboxId;
      const requestChannel = attachInboxChannel;
      const showConfirm = (inbox: PlainInboxRecord | null) => {
        confirm.show({
          title: captureCopy.attachToJournalConfirmTitle,
          message: buildAttachToJournalConfirmMessage({
            inbox,
            journal,
            journalLabel,
            hourCycle: resolvedHourCycle,
            privateMode,
          }),
          messageContent: (
            <AttachToJournalConfirmContent
              inbox={inbox}
              journal={journal}
              journalLabel={journalLabel}
              hourCycle={resolvedHourCycle}
              defaultCurrencyCode={defaultCurrencyCode}
              privateMode={privateMode}
            />
          ),
          confirmText: captureCopy.attachToJournalConfirmAction,
          onConfirm: () => {
            if (confirmSubmitted || attachRequestLockRef.current) return;
            confirmSubmitted = true;
            attachRequestLockRef.current = true;
            analytics.trackFeatureUsage('sms', 'inbox_accept', {
              channel: requestChannel,
              action: 'attach_to_journal',
            });
            void smsService
              .finalizeManualImport(requestWorkplaceId, requestInboxId, journalId)
              .then(() => {
                if (!isMountedRef.current) return;
                toast.success(
                  requestChannel === 'email'
                    ? captureCopy.attachToJournalSuccessEmail
                    : requestChannel === 'voice'
                      ? captureCopy.attachToJournalSuccessVoice
                      : captureCopy.attachToJournalSuccessSms,
                );
                AppNavigation.back();
              })
              .catch(error => {
                confirmSubmitted = false;
                showErrorAlert(error, captureCopy.attachToJournalErrorTitle, true);
              })
              .finally(() => {
                attachRequestLockRef.current = false;
              });
          },
        });
      };

      if (attachInbox) {
        showConfirm(attachInbox);
        return;
      }

      attachRequestLockRef.current = true;
      void smsService
        .findInboxRecord(requestWorkplaceId, requestInboxId)
        .then(record => {
          attachRequestLockRef.current = false;
          if (!isMountedRef.current) return;
          setAttachInboxCache({ id: requestInboxId, record });
          showConfirm(record);
        })
        .catch(error => {
          attachRequestLockRef.current = false;
          showErrorAlert(error, captureCopy.attachToJournalErrorTitle, true);
        });
    },
    [
      attachInbox,
      attachInboxChannel,
      attachInboxId,
      defaultCurrencyCode,
      privateMode,
      resolvedHourCycle,
      workplaceId,
    ],
  );

  const core = useJournalEntryList({
    workplaceId,
    pageSize: AppConfig.defaults.journalPageSize,
    dateRange: filters.queryDateRange,
    searchQuery: filters.searchQuery,
    queryOptions: filters.queryOptions,
    shareTitle: attachMode ? captureCopy.attachToJournalTitle : 'Search Transactions',
    paginationPolicy: 'always',
    onJournalPress: attachMode ? handleAttachJournal : undefined,
    disableSelection: attachMode,
  });

  const bulkOperations = useJournalsBulkOperations({
    workplaceId,
    journals: core.journals,
    selection: core,
    onShareSelected: core.onShareSelected,
  });

  const itemsCountRef = useRef(core.items.length);
  useEffect(() => {
    itemsCountRef.current = core.items.length;
  }, [core.items.length]);

  useEffect(() => {
    journalsRef.current = core.journals;
  }, [core.journals]);

  useEffect(() => {
    if (!filters.searchQuery && filters.accountIds.length === 0 && !filters.dateRange) return;
    const timer = setTimeout(() => {
      analytics.trackFeatureUsage('search', 'query_executed', {
        query_length: filters.searchQuery.length,
        has_account_filter: filters.accountIds.length > 0,
        account_filter_count: filters.accountIds.length,
        has_date_filter: !!filters.dateRange,
        has_amount_filter: !!(filters.minAmount || filters.maxAmount),
        result_count: itemsCountRef.current,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [
    filters.searchQuery,
    filters.accountIds.length,
    filters.dateRange,
    filters.minAmount,
    filters.maxAmount,
  ]);

  const [isAccountPickerVisible, setIsAccountPickerVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);

  const openAccountPicker = useCallback(() => setIsAccountPickerVisible(true), []);
  const closeAccountPicker = useCallback(() => setIsAccountPickerVisible(false), []);
  const openDatePicker = useCallback(() => setIsDatePickerVisible(true), []);
  const closeDatePicker = useCallback(() => setIsDatePickerVisible(false), []);

  const setDateRange = useCallback(
    (range: DateRange | null, filter: PeriodFilter) => {
      filters.setDateRange(range, filter);
      setIsDatePickerVisible(false);
    },
    [filters],
  );

  const selection = useMemo(
    (): JournalSelectionBundle => ({
      selectedIds: core.selectedIds,
      isSelectionModeActive: core.isSelectionModeActive,
      onLongPressItem: core.onLongPressItem,
      chrome: attachMode
        ? undefined
        : attachSelectionActions(core.selectionChrome, bulkOperations.actions),
    }),
    [
      attachMode,
      core.selectedIds,
      core.isSelectionModeActive,
      core.onLongPressItem,
      core.selectionChrome,
      bulkOperations.actions,
    ],
  );

  return {
    csvExport: attachMode ? undefined : core.csvExport,
    items: core.items,
    isLoading: core.isLoading,
    isLoadingMore: core.isLoadingMore,
    error: core.error,
    retry: core.retry,
    onEndReached: core.onEndReached,
    attachMode,
    ...filters,
    setDateRange,
    hasMore: core.hasMore,
    accounts,
    isAccountPickerVisible,
    openAccountPicker,
    closeAccountPicker,
    isDatePickerVisible,
    openDatePicker,
    closeDatePicker,
    selection,
    modals: attachMode ? undefined : bulkOperations.modals,
  };
}
