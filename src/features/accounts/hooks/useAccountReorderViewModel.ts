import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import Account from '@/src/data/models/Account';
import {
  accountIdsMatch,
  applyPendingOrder,
  buildSortedAccounts,
  computeReorderMove,
} from '@/src/features/accounts/hooks/accountReorderUtils';
import { useAccountActions, useAccounts } from '@/src/features/accounts/hooks/useAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import { AccountId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export interface AccountReorderViewModel {
  theme: ReturnType<typeof useTheme>['theme'];
  accounts: Account[];
  isLoading: boolean;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onBack: () => void;
  title: string;
}

export function useAccountReorderViewModel(): AccountReorderViewModel {
  const { theme } = useTheme();
  const { workplaceId } = useWorkplace();
  const { accounts: sourceAccounts, isLoading } = useAccounts(workplaceId);
  const { updateAccountOrder } = useAccountActions(workplaceId);
  /** Optimistic id order over the live list — never mirror source into useState. */
  const [pendingOrder, setPendingOrder] = useState<AccountId[] | null>(null);

  const params = useLocalSearchParams<{ filterMode?: 'accounts' | 'categories' }>();
  const filterMode = params.filterMode || 'accounts';

  const baseSorted = useMemo(
    () => buildSortedAccounts(sourceAccounts, filterMode),
    [sourceAccounts, filterMode],
  );

  const sourceIds = useMemo(() => baseSorted.map(a => a.id as AccountId), [baseSorted]);

  // Live list caught up: clear overlay via render-time adjust (not a sync effect).
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  if (pendingOrder !== null && accountIdsMatch(sourceIds, pendingOrder)) {
    setPendingOrder(null);
  }

  const activePendingOrder =
    pendingOrder !== null && !accountIdsMatch(sourceIds, pendingOrder) ? pendingOrder : null;

  const accounts = useMemo(
    () => applyPendingOrder(baseSorted, activePendingOrder),
    [baseSorted, activePendingOrder],
  );

  const onMove = useCallback(
    async (index: number, direction: 'up' | 'down') => {
      const move = computeReorderMove(accounts, index, direction);
      if (!move) return;

      setPendingOrder(move.nextAccounts.map(a => a.id as AccountId));

      try {
        await updateAccountOrder(move.item, move.newOrderNum);
        // Keep overlay until sourceIds match (cleared during render above).
      } catch (error) {
        logger.error('Failed to update account order:', error);
        setPendingOrder(null);
      }
    },
    [accounts, updateAccountOrder],
  );

  const onBack = useCallback(() => {
    AppNavigation.back();
  }, []);

  return {
    theme,
    accounts,
    isLoading,
    onMove,
    onBack,
    title: filterMode === 'categories' ? 'Reorder Categories' : 'Reorder Accounts',
  };
}
