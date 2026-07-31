import { AppConfig } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { getAccountIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { confirm, showConfirmationAlert, showErrorAlert, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useCallback, useMemo, useState } from 'react';

export interface UseAccountDetailsActionsOptions {
  accountId: AccountId;
  account: Account | PlainAccount | null;
  accounts: (Account | PlainAccount)[];
  transactionCount: number;
  isDeleted: boolean;
  deleteAccount: (account: Account) => Promise<void>;
  recoverAction: (id: AccountId) => Promise<void>;
  reconcileAccount: (id: AccountId, date: Date) => Promise<Account | null>;
  mergeAccounts: (targetId: AccountId, sourceIds: AccountId[]) => Promise<void>;
}

export function useAccountDetailsActions(options: UseAccountDetailsActionsOptions) {
  const {
    accountId,
    account,
    accounts,
    transactionCount,
    isDeleted,
    deleteAccount,
    recoverAction,
    reconcileAccount,
    mergeAccounts,
  } = options;

  const [isReconcileModalVisible, setIsReconcileModalVisible] = useState(false);
  const [isMergeModalVisible, setIsMergeModalVisible] = useState(false);

  const onDelete = useCallback(() => {
    if (!account) return;
    confirm.show({
      title: 'Delete Account',
      message: 'Are you sure you want to delete this account? This action cannot be undone.',
      destructive: true,
      requiredConfirmationValue: account.name,
      onConfirm: async () => {
        try {
          await deleteAccount(account as Account);
          toast.success('Account has been deleted.', {
            action: {
              label: 'Undo',
              onPress: async () => {
                try {
                  await recoverAction(accountId);
                  toast.success('Account restored.');
                } catch (err) {
                  logger.error('Failed to undo deletion:', err);
                  showErrorAlert('Could not restore account');
                }
              },
            },
          });
          AppNavigation.toAccounts();
        } catch (error) {
          logger.error('Failed to delete account:', error);
          showErrorAlert(
            `Could not delete account: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    });
  }, [account, deleteAccount, accountId, recoverAction]);

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

  const onConfirmReconcile = async () => {
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
  };

  const mergeCandidates = useMemo(() => {
    if (!account) return [];
    return accounts.filter(
      a =>
        a.id !== accountId &&
        a.accountType === account.accountType &&
        a.accountSubtype === account.accountSubtype &&
        a.currencyCode === account.currencyCode &&
        a.deletedAt === null,
    );
  }, [account, accounts, accountId]);

  const onMerge = useCallback(() => {
    if (mergeCandidates.length === 0) {
      toast.info('No eligible accounts found to merge into.');
      return;
    }
    setIsMergeModalVisible(true);
  }, [mergeCandidates.length]);

  const onConfirmMerge = useCallback(
    async (targetAccountId: AccountId) => {
      const target = accounts.find(a => a.id === targetAccountId);
      if (!target || !account) return;

      setIsMergeModalVisible(false);

      confirm.show({
        title: 'Merge Accounts',
        message: `This account has transactions and cannot be deleted directly. Merging will move ALL transactions, planned payments, and rules from "${account.name}" into "${target.name}", and then delete "${account.name}". This action is permanent.`,
        destructive: true,
        requiredConfirmationValue: account.name,
        onConfirm: async () => {
          try {
            await mergeAccounts(targetAccountId, [accountId]);
            toast.success(`Successfully merged into ${target.name}`);
            AppNavigation.toAccounts();
          } catch (error) {
            logger.error('Failed to merge accounts:', error);
            showErrorAlert(
              `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        },
      });
    },
    [account, accountId, accounts, mergeAccounts],
  );

  const onEdit = useCallback(() => {
    if (!account) return;
    const isCategory = account.accountType === 'INCOME' || account.accountType === 'EXPENSE';
    if (isCategory) {
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
    headerActions: {
      canRecover: isDeleted,
      onRecover,
      onEdit,
      onDelete,
      onReconcile,
      onMerge,
      canDelete: !isDeleted && transactionCount === 0,
      canMerge: !isDeleted && transactionCount > 0,
    },
    isReconcileModalVisible,
    setIsReconcileModalVisible,
    onConfirmReconcile,
    isMergeModalVisible,
    setIsMergeModalVisible,
    mergeCandidates,
    onConfirmMerge,
  };
}
