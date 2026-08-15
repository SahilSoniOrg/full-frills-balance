import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import {
  accountIdsMatch,
  applyPendingOrder,
  buildSortedAccounts,
  computeReorderMove,
} from '@/src/features/accounts/hooks/accountReorderUtils';
import { useAccountActions } from '@/src/features/accounts/hooks/useAccountActions';
import { useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import { AccountId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import {
  useArchiveScopedAccounts,
  useArchiveVisibility,
} from '@/src/contexts/ArchiveVisibilityScope';
import { useCallback, useMemo, useState } from 'react';

export interface AccountReorderViewModel {
  theme: ReturnType<typeof useTheme>['theme'];
  accounts: Account[];
  isLoading: boolean;
  /** False while archived siblings are hidden — orderNums must use the full set. */
  canReorder: boolean;
  accountsForArchiveToggle: Account[];
  onMove: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
  title: string;
}

export function useAccountReorderViewModel(): AccountReorderViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const { accounts: sourceAccounts, isLoading } = useAccounts(workplaceId);
  const { updateAccountOrder } = useAccountActions(workplaceId);
  const { showArchived } = useArchiveVisibility();
  /** Optimistic id order over the live list — never mirror source into useState. */
  const [pendingOrder, setPendingOrder] = useState<AccountId[] | null>(null);

  const params = useLocalSearchParams<{ filterMode?: 'accounts' | 'categories' }>();
  const filterMode = params.filterMode || 'accounts';

  const baseSorted = useMemo(
    () => buildSortedAccounts(sourceAccounts, filterMode),
    [sourceAccounts, filterMode],
  );

  // Canonical sibling order (includes archived). Moves always use this set.
  const sourceIds = useMemo(() => baseSorted.map(a => a.id as AccountId), [baseSorted]);

  // Live list caught up: clear overlay via render-time adjust (not a sync effect).
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (pendingOrder !== null && accountIdsMatch(sourceIds, pendingOrder)) {
    setPendingOrder(null);
  }

  const activePendingOrder =
    pendingOrder !== null && !accountIdsMatch(sourceIds, pendingOrder) ? pendingOrder : null;

  const orderedAccounts = useMemo(
    () => applyPendingOrder(baseSorted, activePendingOrder),
    [baseSorted, activePendingOrder],
  );

  // Display may hide archived. Reorder only when the displayed order matches the
  // canonical sibling set (show archived, or none are archived).
  const { visibleAccounts: accounts, hasArchivedAccounts } =
    useArchiveScopedAccounts(orderedAccounts);
  const canReorder = showArchived || !hasArchivedAccounts;

  const onMove = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      if (!canReorder) return;

      // Index is into the displayed list, which equals the full ordered set when canReorder.
      const move = computeReorderMove(orderedAccounts, index, direction);
      if (!move) return;

      setPendingOrder(move.nextAccounts.map(a => a.id as AccountId));

      try {
        await updateAccountOrder(move.item, move.newOrderNum);
        analytics.trackFeatureUsage('account', 'reorder', {
          filter_mode: filterMode,
          direction,
        });
        // Keep overlay until sourceIds match (cleared during render above).
      } catch (error) {
        logger.error('Failed to update account order:', error);
        setPendingOrder(null);
      }
    },
    [canReorder, filterMode, orderedAccounts, updateAccountOrder],
  );

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  return {
    theme,
    accounts,
    isLoading,
    canReorder,
    accountsForArchiveToggle: orderedAccounts,
    onMove,
    onBack,
    title: filterMode === 'categories' ? 'Reorder Categories' : 'Reorder Accounts',
  };
}
