import { IconName } from '@/src/components/core';
import Account from '@/src/data/models/Account';
import {
  resolveAccountListPressAction,
  AccountsListTab,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import type { AccountsListActiveModal } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import { getAccountIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { deleteAccount as deleteAccountCommand } from '@/src/services/accounts/accountDeleteCommands';
import { updateAccounts as updateAccountsCommand } from '@/src/services/accounts/accountHierarchyCommands';
import { AccountBalance, AccountId, PlainAccount, WorkplaceId } from '@/src/types/domain';
import { confirm, showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { Dispatch, SetStateAction, useCallback } from 'react';

type AccountListItem = Account | PlainAccount;

interface UseAccountsListActionsInput {
  workplaceId?: WorkplaceId;
  accounts: AccountListItem[];
  balancesByAccountId: Map<AccountId, AccountBalance>;
  expandedAccountIds: Set<AccountId>;
  setExpandedAccountIds: Dispatch<SetStateAction<Set<AccountId>>>;
  activeTab: AccountsListTab;
  activeModal?: AccountsListActiveModal;
  openModal?: (modal: AccountsListActiveModal) => void;
  closeModal?: () => void;
  applyArchiveChanges?: (changes: {
    toArchive: AccountId[];
    toUnarchive: AccountId[];
  }) => Promise<any>;
}

export function useAccountsListActions({
  workplaceId,
  accounts,
  balancesByAccountId,
  expandedAccountIds,
  setExpandedAccountIds,
  activeTab,
  activeModal,
  openModal,
  closeModal,
  applyArchiveChanges,
}: UseAccountsListActionsInput) {
  const onAccountPress = useCallback(
    (accountId: AccountId) => {
      const account = accounts.find(a => a.id === accountId);
      if (!account) return;

      if (resolveAccountListPressAction(accountId, accounts, expandedAccountIds) === 'expand') {
        setExpandedAccountIds(previous => {
          const next = new Set(previous);
          next.add(accountId);
          return next;
        });
        return;
      }

      const balance = balancesByAccountId.get(accountId);
      AppNavigation.toAccountDetails(accountId, {
        preview: {
          name: account.name,
          balance: balance?.balance,
          currency: balance?.currencyCode || account.currencyCode,
          icon: getAccountIcon(account),
          type: account.accountType,
        },
      });
    },
    [accounts, balancesByAccountId, expandedAccountIds, setExpandedAccountIds],
  );

  const onCreateAccount = useCallback(() => {
    if (activeTab === 'categories') {
      AppNavigation.toCategoryCreation();
    } else {
      AppNavigation.toAccountCreation();
    }
  }, [activeTab]);

  const onReorderPress = useCallback(() => {
    AppNavigation.toAccountReorder(activeTab);
  }, [activeTab]);

  const onManageHierarchy = useCallback(() => {
    AppNavigation.toManageHierarchy({ filterMode: activeTab });
  }, [activeTab]);

  const onViewDetails = useCallback(
    (account: AccountCardViewModel) => {
      const balance = balancesByAccountId.get(account.id as AccountId);
      AppNavigation.toAccountDetails(account.id as AccountId, {
        preview: {
          name: account.name,
          balance: balance?.balance ?? account.balance,
          currency: balance?.currencyCode || account.currencyCode,
          icon: account.icon,
          type: account.accountType,
        },
      });
    },
    [balancesByAccountId],
  );

  const onEditAccount = useCallback((account: AccountCardViewModel) => {
    AppNavigation.toAccountForm(account.id);
  }, []);

  const onReconcileAccount = useCallback((account: AccountCardViewModel) => {
    AppNavigation.toAccountDetails(account.id as AccountId);
  }, []);

  const onToggleArchiveAccount = useCallback(
    async (account: AccountCardViewModel) => {
      if (!workplaceId || !applyArchiveChanges) return;
      const isArchiving = !account.isArchived;
      try {
        await applyArchiveChanges({
          toArchive: isArchiving ? [account.id as AccountId] : [],
          toUnarchive: isArchiving ? [] : [account.id as AccountId],
        });
      } catch (error) {
        showErrorAlert(error, 'Failed to update account archive status');
      }
    },
    [applyArchiveChanges, workplaceId],
  );

  const onDeleteAccount = useCallback(
    (account: AccountCardViewModel) => {
      if (!workplaceId) return;
      confirm.show({
        title: 'Delete Account',
        message: `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
        destructive: true,
        confirmText: 'Delete',
        onConfirm: async () => {
          try {
            await deleteAccountCommand(account.id as AccountId, workplaceId);
          } catch (error) {
            showErrorAlert(error, 'Failed to delete account');
          }
        },
      });
    },
    [workplaceId],
  );

  const onRecolorAccount = useCallback(
    (account: AccountCardViewModel) => {
      openModal?.({ type: 'appearance', account });
    },
    [openModal],
  );

  const onAppearanceUpdate = useCallback(
    async (updates: { icon?: IconName; color?: string }) => {
      if (!workplaceId || activeModal?.type !== 'appearance') return;
      const accountId = activeModal.account.id as AccountId;
      try {
        await updateAccountsCommand(workplaceId, [{ accountId, updates }]);
        closeModal?.();
      } catch (error) {
        showErrorAlert(error, 'Failed to update account appearance');
      }
    },
    [activeModal, workplaceId, closeModal],
  );

  return {
    onAccountPress,
    onCreateAccount,
    onReorderPress,
    onManageHierarchy,
    onViewDetails,
    onEditAccount,
    onReconcileAccount,
    onToggleArchiveAccount,
    onDeleteAccount,
    onRecolorAccount,
    onAppearanceUpdate,
  };
}
