import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountManagementAction } from '@/src/features/accounts/helpers/accountManagementActions';
import { AccountId } from '@/src/types/ids';
import { PlainAccount } from '@/src/types/plainDtos';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { logger } from '@/src/utils/logger';
import { AppNavigation } from '@/src/utils/navigation';
import { isUndeletedAccount, type AccountTreeSnapshot } from '@/src/services/accounts/accountTree';
import { useCallback, useMemo, useState } from 'react';
import { Icon } from '@/src/types/domainIcons';
import { useNavigation } from 'expo-router';

export type DeleteMergeEntityLabel = 'Account' | 'Category';

export type AccountMergePickerModalProps = {
  visible: boolean;
  onClose: () => void;
  accounts: (AccountFields | PlainAccount)[];
  onSelect: (targetAccountId: AccountId) => void;
  title: string;
};

export interface UseAccountDeleteMergeActionsOptions {
  accountId?: AccountId;
  account: AccountFields | null;
  accounts: (AccountFields | PlainAccount)[];
  tree: AccountTreeSnapshot;
  directTransactionCount: number;
  isDeleted: boolean;
  enabled: boolean;
  entityLabel: DeleteMergeEntityLabel;
  deleteAccount: (accountId: AccountId) => Promise<void>;
  disbandGroup: (accountId: AccountId) => Promise<void>;
  /** Forms defer departure until their unsaved-change guard is released. */
  onRemoved?: (leave: () => void) => void;
  recoverAction?: (id: AccountId) => Promise<void>;
  mergeAccounts: (targetId: AccountId, sourceIds: AccountId[]) => Promise<void>;
}

const MERGE_COPY = {
  Account: {
    action: 'Merge Account',
    title: 'Merge Accounts',
    picker: 'Merge Into Account',
    plural: 'accounts',
  },
  Category: {
    action: 'Merge Category',
    title: 'Merge Categories',
    picker: 'Merge Into Category',
    plural: 'categories',
  },
} as const;
const GROUP_MERGE_COPY = {
  action: 'Merge Groups',
  title: 'Merge Groups',
  picker: 'Merge Into Group',
} as const;

export function useAccountDeleteMergeActions(options: UseAccountDeleteMergeActionsOptions) {
  const {
    accountId,
    account,
    accounts,
    tree,
    directTransactionCount,
    isDeleted,
    enabled,
    entityLabel,
    deleteAccount,
    disbandGroup,
    onRemoved,
    recoverAction,
    mergeAccounts,
  } = options;

  const navigation = useNavigation();
  const [isMergeModalVisible, setIsMergeModalVisible] = useState(false);

  const hasLiveChildren = useCallback(
    (id: AccountId) => tree.getChildren(id).some(isUndeletedAccount),
    [tree],
  );
  const isGroup = !!accountId && hasLiveChildren(accountId);
  const mergeCopy = isGroup
    ? { ...MERGE_COPY[entityLabel], ...GROUP_MERGE_COPY }
    : MERGE_COPY[entityLabel];

  const mergeCandidates = useMemo(() => {
    if (!account || !accountId) return [];
    const descendants = tree.getDescendants(accountId);
    return accounts.filter(
      a =>
        a.id !== accountId &&
        isUndeletedAccount(a) &&
        a.accountType === account.accountType &&
        a.accountSubtype === account.accountSubtype &&
        a.currencyCode === account.currencyCode &&
        a.archivedAt == null &&
        hasLiveChildren(a.id) === isGroup &&
        !descendants.has(a.id),
    );
  }, [account, accounts, accountId, tree, hasLiveChildren, isGroup]);

  const active = enabled && !isDeleted && !!account && !!accountId;
  const canDelete = active && directTransactionCount === 0 && !isGroup;
  const canDisband = active && isGroup;
  const canMerge =
    active &&
    account?.archivedAt == null &&
    (isGroup ? mergeCandidates.length > 0 : directTransactionCount > 0);

  const leaveRemovedAccount = useCallback(() => {
    if (!accountId) return;
    const leave = () => AppNavigation.afterAccountRemoval(accountId, navigation);
    if (onRemoved) onRemoved(leave);
    else leave();
  }, [accountId, navigation, onRemoved]);

  const onDelete = useCallback(() => {
    if (!account || !accountId) return;
    confirm.show({
      title: `Delete ${entityLabel}`,
      message: `Are you sure you want to delete this ${entityLabel.toLowerCase()}?`,
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
          leaveRemovedAccount();
        } catch (error) {
          logger.error('Failed to delete account:', error);
          showErrorAlert(
            `Could not delete ${entityLabel.toLowerCase()}: ${error instanceof Error ? error.message : 'Unknown'}`,
          );
        }
      },
    });
  }, [account, accountId, deleteAccount, entityLabel, recoverAction, leaveRemovedAccount]);

  const onDisband = useCallback(() => {
    if (!account || !accountId) return;
    const enclosingGroup = accounts.find(a => a.id === account.parentAccountId);
    const destination = enclosingGroup ? `into "${enclosingGroup.name}"` : 'to the top level';
    confirm.show({
      title: 'Disband Group',
      message: `Remove "${account.name}" and move its sub-accounts ${destination}. Sub-accounts keep their balances and transaction history; nested groups stay intact.`,
      confirmText: 'Disband group',
      destructive: true,
      requiredConfirmationValue: account.name,
      onConfirm: async () => {
        try {
          await disbandGroup(accountId);
          toast.success('Group disbanded. Sub-accounts have been kept.');
          leaveRemovedAccount();
        } catch (error) {
          logger.error('Failed to disband account group:', error);
          showErrorAlert(
            `Could not disband group: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      },
    });
  }, [account, accountId, accounts, disbandGroup, leaveRemovedAccount]);

  const onMerge = useCallback(() => {
    if (mergeCandidates.length === 0) {
      toast.info(`No eligible ${mergeCopy.plural} found to merge into.`);
      return;
    }
    setIsMergeModalVisible(true);
  }, [mergeCandidates.length, mergeCopy.plural]);

  const onConfirmMerge = useCallback(
    async (targetAccountId: AccountId) => {
      const target = mergeCandidates.find(a => a.id === targetAccountId);
      if (!target || !account || !accountId) return;

      setIsMergeModalVisible(false);

      confirm.show({
        title: mergeCopy.title,
        message: isGroup
          ? `Move the sub-accounts and references from "${account.name}" into "${target.name}", then remove "${account.name}". Each sub-account keeps its own transaction history, and nested groups stay intact. This action is permanent.`
          : `This ${entityLabel.toLowerCase()} has transactions and cannot be deleted directly. Merging will move ALL transactions, planned payments, and rules from "${account.name}" into "${target.name}", and then delete "${account.name}". This action is permanent.`,
        destructive: true,
        requiredConfirmationValue: account.name,
        onConfirm: async () => {
          try {
            await mergeAccounts(targetAccountId, [accountId]);
            toast.success(`Successfully merged into ${target.name}`);
            leaveRemovedAccount();
          } catch (error) {
            logger.error('Failed to merge accounts:', error);
            showErrorAlert(
              `Merge failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
          }
        },
      });
    },
    [
      account,
      accountId,
      mergeCandidates,
      entityLabel,
      mergeAccounts,
      mergeCopy.title,
      isGroup,
      leaveRemovedAccount,
    ],
  );

  const closeMergeModal = useCallback(() => {
    setIsMergeModalVisible(false);
  }, []);

  const actions = useMemo(
    (): AccountManagementAction[] => [
      ...(canDisband
        ? [
            {
              label: 'Disband Group',
              icon: Icon.Delete,
              onPress: onDisband,
              tone: 'destructive' as const,
              testID: 'disband-group-button',
            },
          ]
        : []),
      ...(canDelete
        ? [
            {
              label: `Delete ${entityLabel}`,
              icon: Icon.Delete,
              onPress: onDelete,
              tone: 'destructive' as const,
              testID: 'delete-button',
            },
          ]
        : []),
      ...(canMerge
        ? [
            {
              label: mergeCopy.action,
              icon: Icon.Merge,
              onPress: onMerge,
              tone: 'destructive' as const,
              testID: 'merge-button',
            },
          ]
        : []),
    ],
    [canDelete, canDisband, canMerge, entityLabel, mergeCopy.action, onDelete, onDisband, onMerge],
  );

  const mergePickerModal = useMemo((): AccountMergePickerModalProps | null => {
    if (!canMerge) return null;

    return {
      visible: isMergeModalVisible,
      onClose: closeMergeModal,
      accounts: mergeCandidates,
      onSelect: onConfirmMerge,
      title: mergeCopy.picker,
    };
  }, [
    canMerge,
    closeMergeModal,
    isMergeModalVisible,
    mergeCandidates,
    onConfirmMerge,
    mergeCopy.picker,
  ]);

  return {
    actions,
    mergePickerModal,
    onConfirmMerge,
  };
}
