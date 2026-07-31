import Account from '@/src/data/models/Account';
import {
  resolveAccountListPressAction,
  AccountsListTab,
} from '@/src/features/accounts/helpers/accountsListHelpers';
import { getAccountIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { AccountBalance, AccountId, PlainAccount } from '@/src/types/domain';
import { AppNavigation } from '@/src/utils/navigation';
import { traceService } from '@/src/utils/TraceService';
import { Dispatch, SetStateAction, useCallback } from 'react';

type AccountListItem = Account | PlainAccount;

interface UseAccountsListActionsInput {
  accounts: AccountListItem[];
  balancesByAccountId: Map<AccountId, AccountBalance>;
  expandedAccountIds: Set<AccountId>;
  setExpandedAccountIds: Dispatch<SetStateAction<Set<AccountId>>>;
  activeTab: AccountsListTab;
  togglePrivacyMode: () => void;
}

export function useAccountsListActions({
  accounts,
  balancesByAccountId,
  expandedAccountIds,
  setExpandedAccountIds,
  activeTab,
  togglePrivacyMode,
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

  const onTogglePrivacy = useCallback(() => {
    traceService.startTrace('Toggle Privacy Mode');
    togglePrivacyMode();
  }, [togglePrivacyMode]);

  return {
    onAccountPress,
    onCreateAccount,
    onReorderPress,
    onManageHierarchy,
    onTogglePrivacy,
  };
}
