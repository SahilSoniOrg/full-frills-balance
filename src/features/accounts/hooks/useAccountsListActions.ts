import { IconName } from '@/src/components/core';
import type { AccountFields } from '@/src/types/plainDtos';
import {
  resolveAccountListPressAction,
  type AccountsListTab,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import type { AccountsListActiveModal } from '@/src/features/accounts/hooks/accountsListTypes';
import { getAccountIcon } from '@/src/utils/accountIcon';

import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { deleteAccount as deleteAccountCommand } from '@/src/services/accounts/accountDeleteCommands';
import { updateAccounts as updateAccountsCommand } from '@/src/services/accounts/accountHierarchyCommands';
import { AccountBalance } from '@/src/types/domainReadModels';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { confirm, showErrorAlert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { Dispatch, SetStateAction, useCallback } from 'react';

type AccountListItem = AccountFields | PlainAccount;

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
          colorKey: account.color,
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

  const onManageHierarchy = useCallback(() => {
    AppNavigation.toAccountManagement({ filterMode: activeTab });
  }, [activeTab]);

  const onNavigateToAccountDetails = useCallback(
    (account: AccountCardViewModel) => {
      const balance = balancesByAccountId.get(account.id);
      AppNavigation.toAccountDetails(account.id, {
        preview: {
          name: account.name,
          balance: balance?.balance ?? account.balance,
          currency: balance?.currencyCode || account.currencyCode,
          icon: account.icon,
          type: account.accountType,
          colorKey: account.accountColor,
        },
      });
    },
    [balancesByAccountId],
  );

  const onViewDetails = onNavigateToAccountDetails;
  const onReconcileAccount = onNavigateToAccountDetails;

  const onEditAccount = useCallback((account: AccountCardViewModel) => {
    AppNavigation.toAccountForm(account.id);
  }, []);

  const onToggleArchiveAccount = useCallback(
    async (account: AccountCardViewModel) => {
      if (!workplaceId || !applyArchiveChanges) return;
      const isArchiving = !account.isArchived;
      try {
        await applyArchiveChanges({
          toArchive: isArchiving ? [account.id] : [],
          toUnarchive: isArchiving ? [] : [account.id],
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
            await deleteAccountCommand(account.id, workplaceId);
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
      const accountId = activeModal.account.id;
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
