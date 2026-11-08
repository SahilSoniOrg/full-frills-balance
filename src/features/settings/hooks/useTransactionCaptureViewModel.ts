import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import {
  listCaptureItems,
  countCaptureReviewItems,
  setCaptureMerchantOpen,
  setCaptureDescriptionDefault,
  listCaptureCategoryDefaults,
  saveCaptureCategoryDefault,
  removeCaptureCategoryDefault,
  listCaptureDescriptionDefaults,
  confirmCaptureCategories,
  saveHistoricalCaptureCategoryDefault,
  resolveCaptureCategoryDefaultConflict,
  subscribeToCaptureChanges,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { transactionCaptureService } from '@/src/services/transaction-intelligence/transactionCaptureService';
import { useCaptureMutationRunner } from '@/src/features/settings/hooks/useCaptureMutationRunner';
import { analytics } from '@/src/services/analytics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import type { CaptureReviewItem } from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';

type CaptureSettings = Awaited<ReturnType<typeof transactionCaptureService.getSettings>>;
type CaptureItems = Awaited<ReturnType<typeof listCaptureItems>>;
type CategoryDefaults = Awaited<ReturnType<typeof listCaptureCategoryDefaults>>;
type DescriptionDefaults = ReturnType<typeof listCaptureDescriptionDefaults>;
type CaptureSnapshot = {
  workplaceId: WorkplaceId;
  settings: CaptureSettings;
  reviewCount: number;
  review: CaptureItems['review'];
  defaulted: CaptureItems['defaulted'];
  categoryDefaults: CategoryDefaults;
  descriptionDefaults: DescriptionDefaults;
  categoryCandidates: CaptureItems['categoryCandidates'];
  descriptionCandidates: CaptureItems['descriptionCandidates'];
  possibleMerchantMatches: CaptureItems['possibleMerchantMatches'];
  historicalCategorySuggestions: CaptureItems['historicalCategorySuggestions'];
  mixedHistoricalCategoryPatterns: CaptureItems['mixedHistoricalCategoryPatterns'];
  mixedHistoricalCategoryCount: CaptureItems['mixedHistoricalCategoryCount'];
};

export function useTransactionCaptureViewModel({
  loadReviewItems = false,
  loadCategoryDefaults = false,
  loadHistoricalSuggestions = false,
}: {
  loadReviewItems?: boolean;
  loadCategoryDefaults?: boolean;
  loadHistoricalSuggestions?: boolean;
} = {}) {
  const { workplaceId } = useWorkplace();
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<CaptureSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [settingsError, setSettingsError] = useState(false);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const [settings, items, reviewCount, categoryDefaults] = await Promise.allSettled([
        transactionCaptureService.getSettings(workplaceId),
        loadReviewItems
          ? listCaptureItems(workplaceId, { includeHistorical: loadHistoricalSuggestions })
          : Promise.resolve(null),
        countCaptureReviewItems(workplaceId),
        loadCategoryDefaults ? listCaptureCategoryDefaults(workplaceId) : Promise.resolve([]),
      ]);
      if (request !== generation.current) return;
      setSettingsError(settings.status === 'rejected');
      setError(
        settings.status === 'rejected' ||
          items.status === 'rejected' ||
          reviewCount.status === 'rejected' ||
          categoryDefaults.status === 'rejected',
      );
      if (settings.status === 'fulfilled') {
        setSnapshot({
          workplaceId,
          settings: settings.value,
          reviewCount:
            items.status === 'fulfilled' && items.value
              ? items.value.review.length
              : reviewCount.status === 'fulfilled'
                ? reviewCount.value
                : 0,
          review: items.status === 'fulfilled' && items.value ? items.value.review : [],
          defaulted: items.status === 'fulfilled' && items.value ? items.value.defaulted : [],
          categoryDefaults: categoryDefaults.status === 'fulfilled' ? categoryDefaults.value : [],
          descriptionDefaults: listCaptureDescriptionDefaults(workplaceId),
          categoryCandidates:
            items.status === 'fulfilled' && items.value ? items.value.categoryCandidates : [],
          descriptionCandidates:
            items.status === 'fulfilled' && items.value ? items.value.descriptionCandidates : [],
          possibleMerchantMatches:
            items.status === 'fulfilled' && items.value ? items.value.possibleMerchantMatches : [],
          historicalCategorySuggestions:
            items.status === 'fulfilled' && items.value
              ? items.value.historicalCategorySuggestions
              : [],
          mixedHistoricalCategoryPatterns:
            items.status === 'fulfilled' && items.value
              ? items.value.mixedHistoricalCategoryPatterns
              : [],
          mixedHistoricalCategoryCount:
            items.status === 'fulfilled' && items.value
              ? items.value.mixedHistoricalCategoryCount
              : 0,
        });
      }
    } catch {
      if (request === generation.current) {
        setError(true);
        setSettingsError(true);
      }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [workplaceId, loadReviewItems, loadCategoryDefaults, loadHistoricalSuggestions]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const unsubscribe = subscribeToCaptureChanges(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 250);
      });
      return () => {
        unsubscribe();
        if (timer) clearTimeout(timer);
        ++generation.current;
      };
    }, [refresh]),
  );

  const current = snapshot?.workplaceId === workplaceId ? snapshot : null;
  const mutations = useCaptureMutationRunner(workplaceId, generation, refresh);

  const onToggleEnabled = useCallback(
    (enabled: boolean) => {
      if (loading || settingsError) return;
      const operation = async (currentWorkplaceId: WorkplaceId) => {
        await transactionCaptureService.setEnabled(currentWorkplaceId, enabled);
        analytics.trackFeatureUsage('transaction_capture', 'toggle_enabled', { enabled });
      };
      const options = {
        errorMessage: (cause: unknown) =>
          cause instanceof Error ? cause.message : strings.loadError,
      };
      if (enabled) {
        mutations.confirmAndRun(
          {
            title: strings.enableTitle,
            message: strings.enableMessage,
            confirmText: strings.enableAction,
            cancelText: strings.cancel,
          },
          operation,
          options,
        );
      } else {
        void mutations.run(operation, options);
      }
    },
    [loading, settingsError, mutations],
  );

  return {
    workplaceId,
    enabled: current?.settings.enabled ?? false,
    enabledAt: current?.settings.enabledAt,
    needsAccountSetup: current?.settings.needsAccountSetup ?? false,
    reviewCount: current?.reviewCount ?? 0,
    review: current?.review ?? [],
    defaulted: current?.defaulted ?? [],
    categoryDefaults: current?.categoryDefaults ?? [],
    descriptionDefaults: current?.descriptionDefaults ?? [],
    categoryCandidates: current?.categoryCandidates ?? [],
    descriptionCandidates: current?.descriptionCandidates ?? [],
    possibleMerchantMatches: current?.possibleMerchantMatches ?? [],
    historicalCategorySuggestions: current?.historicalCategorySuggestions ?? [],
    mixedHistoricalCategoryPatterns: current?.mixedHistoricalCategoryPatterns ?? [],
    mixedHistoricalCategoryCount: current?.mixedHistoricalCategoryCount ?? 0,
    loading: loading || (!current && !error),
    busy: mutations.busy,
    error,
    settingsError,
    onToggleEnabled,
    onRetry: refresh,
    onConfigureAccounts: async () => {
      if (loading || settingsError) return;
      await mutations.run(
        async currentWorkplaceId => {
          await transactionCaptureService.configureNewAccounts(currentWorkplaceId);
          analytics.trackFeatureUsage('transaction_capture', 'accounts_configured');
        },
        {
          errorMessage: cause => (cause instanceof Error ? cause.message : strings.loadError),
        },
      );
    },
    onSetMerchantOpen: (merchant: string, open: boolean) =>
      mutations.run(async currentWorkplaceId => {
        await setCaptureMerchantOpen(currentWorkplaceId, merchant, open);
        analytics.trackFeatureUsage('transaction_capture', 'merchant_open_toggled', {
          enabled: open,
        });
      }),
    onSetHistoricalMerchantsOpen: (pattern: HistoricalCategoryPattern, open: boolean) =>
      mutations.run(async currentWorkplaceId => {
        await setCaptureMerchantOpen(currentWorkplaceId, pattern.merchant, open);
        analytics.trackFeatureUsage('transaction_capture', 'merchant_open_toggled', {
          enabled: open,
        });
      }),
    onConfirmCategories: (item: CaptureReviewItem) => {
      if (!item.confirmCategoryKey) return;
      void mutations.run(
        async currentWorkplaceId => {
          await confirmCaptureCategories(
            currentWorkplaceId,
            item.journalId,
            item.confirmCategoryKey!,
          );
          analytics.trackFeatureUsage('transaction_capture', 'category_confirmed');
        },
        { errorMessage: () => strings.categoryChanged },
      );
    },
    onRememberCategory: (item: CaptureReviewItem) => {
      const choice = item.suggestedDefault;
      if (!choice || !item.suggestedCategoryName || !item.suggestedDefaultAccountName) return;
      mutations.confirmAndRun(
        {
          title: strings.rememberCategoryTitle,
          message: strings.rememberCategoryMessage(
            item.suggestedCategoryName,
            choice.merchant,
            item.suggestedDefaultAccountName,
            choice.currencyCode,
            choice.kind,
          ),
          confirmText: strings.rememberCategoryAction,
          cancelText: strings.cancel,
        },
        async currentWorkplaceId => {
          await saveCaptureCategoryDefault(currentWorkplaceId, item.journalId, choice);
          analytics.trackFeatureUsage('transaction_capture', 'category_default_saved', {
            kind: choice.kind,
          });
        },
        { errorMessage: () => strings.categoryChanged },
      );
    },
    onRememberHistoricalCategory: (pattern: HistoricalCategoryPattern) => {
      const category = pattern.categories.length === 1 ? pattern.categories[0] : undefined;
      if (!category) return;
      mutations.confirmAndRun(
        {
          title: strings.rememberHistoricalCategoryTitle,
          message: strings.rememberHistoricalCategoryMessage(
            category.name,
            pattern.merchant,
            pattern.financialAccountName,
            pattern.currencyCode,
            pattern.kind,
            pattern.journalCount,
            pattern.sourceCount,
          ),
          confirmText: strings.rememberCategoryAction,
          cancelText: strings.cancel,
        },
        async currentWorkplaceId => {
          await saveHistoricalCaptureCategoryDefault(
            currentWorkplaceId,
            pattern.key,
            category.accountId,
          );
          analytics.trackFeatureUsage('transaction_capture', 'category_default_saved', {
            kind: pattern.kind,
          });
        },
        { errorMessage: () => strings.categoryChanged },
      );
    },
    onForgetCategory: (key: string) =>
      mutations.run(async currentWorkplaceId => {
        await removeCaptureCategoryDefault(currentWorkplaceId, key);
        analytics.trackFeatureUsage('transaction_capture', 'category_default_removed');
      }),
    onResolveCategoryDefaultConflict: (key: string, categoryAccountId: AccountId) =>
      mutations.run(async currentWorkplaceId => {
        await resolveCaptureCategoryDefaultConflict(currentWorkplaceId, key, categoryAccountId);
        analytics.trackFeatureUsage('transaction_capture', 'category_default_saved');
      }),
    onSetDescriptionDefault: (key: string, description?: string) => {
      const operation = async (currentWorkplaceId: WorkplaceId) => {
        await setCaptureDescriptionDefault(currentWorkplaceId, key, description);
        analytics.trackFeatureUsage('transaction_capture', 'description_default_set', {
          enabled: !!description,
        });
      };
      if (!description) {
        void mutations.run(operation);
        return;
      }
      mutations.confirmAndRun(
        {
          title: strings.rememberNameTitle,
          message: strings.rememberNameMessage,
          confirmText: strings.rememberNameAction,
          cancelText: strings.cancel,
        },
        operation,
      );
    },
  };
}

export type TransactionCaptureViewModel = ReturnType<typeof useTransactionCaptureViewModel>;
