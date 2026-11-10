import { transactionCaptureStrings as strings } from '@/src/constants/copy/domains/transactionCaptureStrings';
import { useCaptureMutationRunner } from '@/src/features/settings/hooks/useCaptureMutationRunner';
import {
  confirmCaptureCategories,
  removeCaptureCategoryDefault,
  resolveCaptureCategoryDefaultConflict,
  saveCaptureCategoryDefault,
  saveHistoricalCaptureCategoryDefault,
  setCaptureDescriptionDefault,
  setCaptureMerchantOpen,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { transactionCaptureService } from '@/src/services/transaction-intelligence/transactionCaptureService';
import { analytics } from '@/src/services/analytics';
import type { CaptureReviewItem } from '@/src/data/repositories/journal/JournalCaptureQueries';
import type { HistoricalCategoryPattern } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useCaptureMutations(
  workplaceId: WorkplaceId,
  refresh: () => Promise<void>,
  options: { loading: boolean; settingsError: boolean },
) {
  const mutationEpoch = useRef(0);
  const mutations = useCaptureMutationRunner(workplaceId, mutationEpoch, refresh);

  useEffect(
    () => () => {
      ++mutationEpoch.current;
    },
    [workplaceId],
  );

  const onToggleEnabled = useCallback(
    (enabled: boolean) => {
      if (options.loading || options.settingsError) return;
      const operation = async (currentWorkplaceId: WorkplaceId) => {
        await transactionCaptureService.setEnabled(currentWorkplaceId, enabled);
        analytics.trackFeatureUsage('transaction_capture', 'toggle_enabled', { enabled });
      };
      const runOptions = {
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
          runOptions,
        );
      } else {
        void mutations.run(operation, runOptions);
      }
    },
    [options.loading, options.settingsError, mutations],
  );

  const onConfigureAccounts = useCallback(async () => {
    if (options.loading || options.settingsError) return;
    await mutations.run(
      async currentWorkplaceId => {
        await transactionCaptureService.configureNewAccounts(currentWorkplaceId);
        analytics.trackFeatureUsage('transaction_capture', 'accounts_configured');
      },
      {
        errorMessage: cause => (cause instanceof Error ? cause.message : strings.loadError),
      },
    );
  }, [options.loading, options.settingsError, mutations]);

  return useMemo(
    () => ({
      busy: mutations.busy,
      onToggleEnabled,
      onConfigureAccounts,
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
            confirmText: strings.rememberHistoricalCategoryAction,
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
    }),
    [mutations, onConfigureAccounts, onToggleEnabled],
  );
}
