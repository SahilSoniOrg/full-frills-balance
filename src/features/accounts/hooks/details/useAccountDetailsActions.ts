import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { AccountId, AccountType, PlainAccount } from '@/src/types/domain';
import { isCategoryAccountType } from '@/src/utils/accountCategory';
import { showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { DateRange } from '@/src/utils/dateUtils';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useState } from 'react';

export interface UseAccountDetailsActionsOptions {
  accountId: AccountId;
  account: Account | PlainAccount | null;
  accountType: AccountType;
  isDeleted: boolean;
  dateRange: DateRange | null;
  recoverAction: (id: AccountId) => Promise<void>;
  reconcileAccount: (id: AccountId, date: Date) => Promise<Account | null>;
}

export function useAccountDetailsActions(options: UseAccountDetailsActionsOptions) {
  const { accountId, account, accountType, isDeleted, dateRange, recoverAction, reconcileAccount } =
    options;

  const [isReconcileModalVisible, setIsReconcileModalVisible] = useState(false);

  const onBack = useCallback(() => AppNavigation.back(), []);

  const onAuditPress = useCallback(
    () => AppNavigation.toAuditLog({ entityType: 'account', entityId: accountId }),
    [accountId],
  );

  const onAddPress = useCallback(
    () => AppNavigation.toJournalEntry({ sourceAccountId: accountId }),
    [accountId],
  );

  const onSearch = useCallback(
    () =>
      AppNavigation.toJournalSearch({
        accountIds: [accountId],
        ...(dateRange ? { startDate: dateRange.startDate, endDate: dateRange.endDate } : undefined),
      }),
    [accountId, dateRange],
  );

  const onRecover = useCallback(() => {
    showConfirmationAlert(
      'Recover Account',
      'This will restore the deleted account. Continue?',
      async () => {
        try {
          await recoverAction(accountId);
          toast.success('Account has been restored.');
          AppNavigation.replaceToAccountDetails(accountId);
        } catch (error) {
          logger.error('Failed to recover account:', error);
          showErrorAlert(
            `Could not recover account: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    );
  }, [accountId, recoverAction]);

  const onReconcile = useCallback(() => {
    setIsReconcileModalVisible(true);
  }, []);

  const onConfirmReconcile = useCallback(async () => {
    setIsReconcileModalVisible(false);
    try {
      await reconcileAccount(accountId, new Date());
      toast.success(AppConfig.strings.accounts.reconciliation.alert.successMessage);
    } catch (error) {
      logger.error('Failed to reconcile account:', error);
      showErrorAlert(
        `Could not reconcile account: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
    }
  }, [accountId, reconcileAccount]);

  const onEdit = useCallback(() => {
    if (!account) return;
    if (isCategoryAccountType(account.accountType)) {
      AppNavigation.toCategoryForm(accountId, {
        name: account.name,
        type: account.accountType,
        currency: account.currencyCode,
        icon: getAccountIcon(account),
      });
    } else {
      AppNavigation.toAccountForm(accountId, {
        name: account.name,
        type: account.accountType,
        currency: account.currencyCode,
        icon: getAccountIcon(account),
      });
    }
  }, [accountId, account]);

  return {
    onBack,
    onAuditPress,
    onAddPress,
    onReconcile: !isDeleted && !isCategoryAccountType(accountType) ? onReconcile : undefined,
    headerActions: {
      canRecover: isDeleted,
      onRecover,
      onEdit,
      onSearch: isDeleted ? undefined : onSearch,
    },
    isReconcileModalVisible,
    setIsReconcileModalVisible,
    onConfirmReconcile,
  };
}
