import type { AccountFields } from '@/src/types/domain';
import type { ScreenHeaderActionItem } from '@/src/components/common/ScreenHeaderActions';
import type { AccountMergePickerModalProps } from '@/src/features/accounts/components/AccountFormEditModals';
import { AccountId, PlainAccount } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { useTheme } from '@/src/hooks/use-theme';
import { useCallback, useMemo, useState } from 'react';

export type DeleteMergeEntityLabel = 'Account' | 'Category';

export interface UseAccountDeleteMergeActionsOptions {
  accountId?: AccountId;
  account: AccountFields | null;
  accounts: (AccountFields | PlainAccount)[];
  transactionCount: number;
  isDeleted: boolean;
  enabled: boolean;
  entityLabel: DeleteMergeEntityLabel;
  deleteAccount: (accountId: AccountId) => Promise<void>;
  recoverAction?: (id: AccountId) => Promise<void>;
  mergeAccounts: (targetId: AccountId, sourceIds: AccountId[]) => Promise<void>;
}

export function useAccountDeleteMergeActions(options: UseAccountDeleteMergeActionsOptions) {
  const {
    accountId,
    account,
    accounts,
    transactionCount,
    isDeleted,
    enabled,
    entityLabel,
    deleteAccount,
    recoverAction,
    mergeAccounts,
  } = options;

  const { theme } = useTheme();
  const [isMergeModalVisible, setIsMergeModalVisible] = useState(false);

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

  const canDelete = enabled && !isDeleted && transactionCount === 0;
  const canMerge = enabled && !isDeleted && transactionCount > 0;

  const onDelete = useCallback(() => {
    if (!account || !accountId) return;
    confirm.show({
      title: `Delete ${entityLabel}`,
      message: `Are you sure you want to delete this ${entityLabel.toLowerCase()}? This action cannot be undone.`,
      destructive: true,
      requiredConfirmationValue: account.name,
      onConfirm: async () => {
        try {
          await deleteAccount(accountId);
          toast.success(`${entityLabel} has been deleted.`, {
            action: recoverAction
              ? {
                  label: 'Undo',
                  onPress: async () => {
                    try {
                      await recoverAction(accountId);
                      toast.success(`${entityLabel} restored.`);
                    } catch (err) {
                      logger.error('Failed to undo deletion:', err);
                      showErrorAlert(`Could not restore ${entityLabel.toLowerCase()}`);
                    }
                  },
                }
              : undefined,
          });
          AppNavigation.toAccounts();
        } catch (error) {
          logger.error('Failed to delete account:', error);
          showErrorAlert(
            `Could not delete ${entityLabel.toLowerCase()}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    });
  }, [account, accountId, deleteAccount, entityLabel, recoverAction]);

  const mergeEntityPlural = entityLabel === 'Account' ? 'accounts' : 'categories';
  const mergeTitle = entityLabel === 'Account' ? 'Merge Accounts' : 'Merge Categories';

  const onMerge = useCallback(() => {
    if (mergeCandidates.length === 0) {
      toast.info(`No eligible ${mergeEntityPlural} found to merge into.`);
      return;
    }
    setIsMergeModalVisible(true);
  }, [mergeCandidates.length, mergeEntityPlural]);

  const onConfirmMerge = useCallback(
    async (targetAccountId: AccountId) => {
      const target = accounts.find(a => a.id === targetAccountId);
      if (!target || !account || !accountId) return;

      setIsMergeModalVisible(false);

      confirm.show({
        title: mergeTitle,
        message: `This ${entityLabel.toLowerCase()} has transactions and cannot be deleted directly. Merging will move ALL transactions, planned payments, and rules from "${account.name}" into "${target.name}", and then delete "${account.name}". This action is permanent.`,
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
    [account, accountId, accounts, entityLabel, mergeAccounts, mergeTitle],
  );

  const closeMergeModal = useCallback(() => {
    setIsMergeModalVisible(false);
  }, []);

  const headerActionItems = useMemo((): ScreenHeaderActionItem[] => {
    if (canDelete) {
      return [
        {
          name: 'delete',
          onPress: onDelete,
          variant: 'surface',
          iconColor: theme.error,
          testID: 'delete-button',
          accessibilityLabel: `Delete ${entityLabel}`,
        },
      ];
    }
    if (canMerge) {
      return [
        {
          name: 'merge',
          onPress: onMerge,
          variant: 'surface',
          iconColor: theme.error,
          testID: 'merge-button',
          accessibilityLabel: `Merge ${entityLabel}`,
        },
      ];
    }
    return [];
  }, [canDelete, canMerge, entityLabel, onDelete, onMerge, theme.error]);

  const mergePickerModal = useMemo((): AccountMergePickerModalProps | null => {
    if (!canMerge) return null;

    return {
      visible: isMergeModalVisible,
      onClose: closeMergeModal,
      accounts: mergeCandidates,
      onSelect: onConfirmMerge,
      title: 'Merge Into Account',
    };
  }, [canMerge, closeMergeModal, isMergeModalVisible, mergeCandidates, onConfirmMerge]);

  return {
    headerActionItems,
    mergePickerModal,
    onConfirmMerge,
  };
}
