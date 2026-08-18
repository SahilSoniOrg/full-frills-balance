import type { SelectionAction } from '@/src/components/common/SelectionActionBar';
import { IconName } from '@/src/components/core';
import type { AccountFields as Account } from '@/src/types/domain';
import {
  getBulkHierarchyCandidates,
  type HierarchyCandidateAccount,
} from '@/src/features/accounts/helpers/bulkHierarchyCandidates';
import type { AccountsListActiveModal } from '@/src/features/accounts/hooks/accountsListTypes';
import type { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useSelection } from '@/src/hooks/useSelection';
import { useTheme } from '@/src/hooks/use-theme';
import { analytics } from '@/src/services/analytics-service';
import {
  updateAccounts as updateAccountsCommand,
  type AccountBulkUpdate,
} from '@/src/services/accounts/accountHierarchyCommands';
import { AccountId, AccountType, PlainAccount, WorkplaceId } from '@/src/types/domain';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { resolveAccountAppearance } from '@/src/utils/accountCategory';
import { getAccountIcon } from '@/src/utils/accountIcon';
import { showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback, useMemo } from 'react';

type AccountListItem = Account | PlainAccount;

interface UseAccountsBulkOperationsInput {
  workplaceId?: WorkplaceId;
  accounts: AccountListItem[];
  selection: ReturnType<typeof useSelection<AccountId>>;
  isBulkHierarchyOpen: boolean;
  openModal: (modal: AccountsListActiveModal) => void;
  closeModal: () => void;
  applyArchiveChanges: (changes: {
    toArchive: AccountId[];
    toUnarchive: AccountId[];
  }) => Promise<any>;
}

function buildInverseBulkUpdates(
  requests: AccountBulkUpdate[],
  accountsById: Map<AccountId, AccountListItem>,
): AccountBulkUpdate[] {
  return requests.map(req => {
    const original = accountsById.get(req.accountId);
    const undoUpdates: AccountBulkUpdate['updates'] = {};
    if (original) {
      for (const key of Object.keys(req.updates) as (keyof AccountBulkUpdate['updates'])[]) {
        if (key === 'name') undoUpdates.name = original.name;
        if (key === 'color') undoUpdates.color = original.color ?? '';
        if (key === 'icon') undoUpdates.icon = original.icon as IconName;
        if (key === 'parentAccountId') {
          undoUpdates.parentAccountId = (original.parentAccountId as AccountId) ?? null;
        }
      }
    }
    return { accountId: req.accountId, updates: undoUpdates };
  });
}

export function useAccountsBulkOperations({
  workplaceId,
  accounts,
  selection,
  isBulkHierarchyOpen,
  openModal,
  closeModal,
  applyArchiveChanges,
}: UseAccountsBulkOperationsInput) {
  const { theme, onContrast } = useTheme();
  const accountsById = useMemo(
    () => new Map<AccountId, AccountListItem>(accounts.map(a => [a.id as AccountId, a])),
    [accounts],
  );

  const handleBulkArchive = useCallback(async () => {
    if (!workplaceId || selection.selectedIds.size === 0) return;
    const selectedArray = Array.from(selection.selectedIds);
    const selectedAccountModels = accounts.filter(a =>
      selection.selectedIds.has(a.id as AccountId),
    );
    const anyUnarchived = selectedAccountModels.some(a => !a.archivedAt);
    const toArchive = anyUnarchived ? selectedArray : [];
    const toUnarchive = anyUnarchived ? [] : selectedArray;

    try {
      await applyArchiveChanges({ toArchive, toUnarchive });
      selection.exitSelectionMode();

      analytics.trackFeatureUsage('account', 'bulk_archive', {
        count: selectedArray.length,
        is_archive: anyUnarchived,
      });

      const actionText = anyUnarchived ? 'Archived' : 'Unarchived';
      toast.success(
        `${actionText} ${selectedArray.length} account${selectedArray.length === 1 ? '' : 's'}`,
        {
          action: {
            label: 'Undo',
            onPress: async () => {
              try {
                await applyArchiveChanges({
                  toArchive: toUnarchive,
                  toUnarchive: toArchive,
                });
                toast.success('Archive status reverted');
              } catch (error) {
                showErrorAlert(error, 'Failed to undo archive changes');
              }
            },
          },
        },
      );
    } catch (error) {
      showErrorAlert(error, 'Failed to update account archive status');
    }
  }, [workplaceId, selection, accounts, applyArchiveChanges]);

  const applyBulkUpdate = useCallback(
    async (
      buildUpdates: (accountId: AccountId) => AccountBulkUpdate['updates'],
      options: {
        successMessage: (count: number) => string;
        undoMessage: string;
      },
    ) => {
      if (!workplaceId || selection.selectedIds.size === 0) return;
      const selectedIdsArray = Array.from(selection.selectedIds);
      const requests: AccountBulkUpdate[] = selectedIdsArray.map(accountId => ({
        accountId,
        updates: buildUpdates(accountId),
      }));

      const undoRequests = buildInverseBulkUpdates(requests, accountsById);

      try {
        await updateAccountsCommand(workplaceId, requests);
        selection.exitSelectionMode();
        closeModal();

        toast.success(options.successMessage(requests.length), {
          action: {
            label: 'Undo',
            onPress: async () => {
              try {
                await updateAccountsCommand(workplaceId, undoRequests);
                toast.success(options.undoMessage);
              } catch (error) {
                showErrorAlert(error, `Failed to undo: ${options.undoMessage}`);
              }
            },
          },
        });
      } catch (error) {
        showErrorAlert(error, 'Failed to update selected accounts');
        throw error;
      }
    },
    [selection, workplaceId, closeModal, accountsById],
  );

  const handleBulkAppearanceSelect = useCallback(
    (updates: { icon?: IconName; color?: string }) => {
      analytics.trackFeatureUsage('account', 'bulk_appearance', {
        count: selection.selectedIds.size,
        has_icon: !!updates.icon,
        has_color: !!updates.color,
      });
      return applyBulkUpdate(() => updates, {
        successMessage: count =>
          `Updated ${updates.icon ? 'icon' : 'color'} for ${count} account${count === 1 ? '' : 's'}`,
        undoMessage: 'Appearance changes undone',
      });
    },
    [applyBulkUpdate, selection.selectedIds.size],
  );

  const handleBulkRenameSave = useCallback(
    async (namesByAccountId: Record<AccountId, string>) => {
      if (!workplaceId) return;

      const trimmedEntries = Object.entries(namesByAccountId).map(
        ([id, name]) => [id as AccountId, name.trim()] as const,
      );

      const seenNames = new Set<string>();
      for (const [, name] of trimmedEntries) {
        if (!name) continue;
        const normalized = name.toLowerCase();
        if (seenNames.has(normalized)) {
          const error = new Error(`Duplicate name "${name}" detected among selected accounts`);
          showErrorAlert(error, 'Failed to rename accounts');
          throw error;
        }
        seenNames.add(normalized);
      }

      const requests: AccountBulkUpdate[] = [];

      for (const [accountId, trimmedName] of trimmedEntries) {
        const original = accountsById.get(accountId);
        if (original && original.name !== trimmedName && trimmedName.length > 0) {
          requests.push({ accountId, updates: { name: trimmedName } });
        }
      }

      if (requests.length === 0) {
        selection.exitSelectionMode();
        closeModal();
        return;
      }

      const undoRequests = buildInverseBulkUpdates(requests, accountsById);

      try {
        await updateAccountsCommand(workplaceId, requests);
        selection.exitSelectionMode();
        closeModal();

        analytics.trackFeatureUsage('account', 'bulk_rename', {
          count: requests.length,
        });

        toast.success(`Renamed ${requests.length} account${requests.length === 1 ? '' : 's'}`, {
          action: {
            label: 'Undo',
            onPress: async () => {
              try {
                await updateAccountsCommand(workplaceId, undoRequests);
                toast.success('Rename undone');
              } catch (error) {
                showErrorAlert(error, 'Failed to undo rename');
              }
            },
          },
        });
      } catch (error) {
        showErrorAlert(error, 'Failed to rename selected accounts');
        throw error;
      }
    },
    [workplaceId, accountsById, selection, closeModal],
  );

  const handleBulkHierarchyMoveAssign = useCallback(
    async (parentId: AccountId | null) => {
      if (!workplaceId || selection.selectedIds.size === 0) return;
      analytics.trackFeatureUsage('account', 'bulk_move_hierarchy', {
        count: selection.selectedIds.size,
        has_parent: parentId !== null,
      });
      await applyBulkUpdate(() => ({ parentAccountId: parentId }), {
        successMessage: count => `Moved ${count} account${count === 1 ? '' : 's'} in hierarchy`,
        undoMessage: 'Hierarchy move undone',
      });
    },
    [applyBulkUpdate, selection.selectedIds.size, workplaceId],
  );

  // Lazy computation: only calculate hierarchy candidates when modal is open
  const bulkParentCandidates = useMemo<HierarchyCandidateAccount[]>(() => {
    if (!isBulkHierarchyOpen) return [];
    return getBulkHierarchyCandidates(accounts, selection.selectedIds);
  }, [accounts, selection.selectedIds, isBulkHierarchyOpen]);

  const selectedAccountsList = useMemo<AccountCardViewModel[]>(() => {
    if (selection.selectedIds.size === 0) return [];
    const result: AccountCardViewModel[] = [];
    for (const account of accounts) {
      if (!selection.selectedIds.has(account.id as AccountId)) continue;
      const { categoryColor, accentColor: accountColor } = resolveAccountAppearance(account, theme);
      const textColor = onContrast(accountColor);
      result.push({
        id: account.id as AccountId,
        name: account.name,
        icon: getAccountIcon(account),
        accountType: account.accountType,
        categoryColor,
        accountColor,
        textColor,
        balance: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        showMonthlyStats: false,
        currencyCode: account.currencyCode,
        depth: 0,
        hasChildren: false,
        isExpanded: false,
        isArchived: isAccountArchived(account),
      });
    }
    return result;
  }, [accounts, selection.selectedIds, theme, onContrast]);

  const isMixedAccountTypes = useMemo(() => {
    if (selection.selectedIds.size <= 1) return false;
    let firstType: AccountType | undefined;
    for (const id of selection.selectedIds) {
      const acc = accountsById.get(id);
      if (!acc) continue;
      if (firstType === undefined) {
        firstType = acc.accountType;
      } else if (firstType !== acc.accountType) {
        return true;
      }
    }
    return false;
  }, [selection.selectedIds, accountsById]);

  const selectionActions = useMemo<SelectionAction[]>(() => {
    return [
      {
        name: 'edit' as const,
        label: 'Rename',
        onPress: () => openModal({ type: 'bulkRename' }),
        accessibilityLabel: 'Edit account names',
      },
      {
        name: 'palette' as const,
        label: 'Change Color',
        onPress: () => openModal({ type: 'bulkAppearance', mode: 'color' }),
        accessibilityLabel: 'Change account color',
      },
      {
        name: 'tag' as const,
        label: 'Change Icon',
        onPress: () => openModal({ type: 'bulkAppearance', mode: 'icon' }),
        accessibilityLabel: 'Change account icon',
      },
      {
        name: 'hierarchy' as const,
        label: 'Move Hierarchy',
        onPress: () => openModal({ type: 'bulkHierarchy' }),
        disabled: isMixedAccountTypes,
        accessibilityLabel: isMixedAccountTypes
          ? 'Cannot move accounts of mixed types in hierarchy'
          : 'Move accounts hierarchy',
      },
      {
        name: 'archive' as const,
        label: 'Archive / Unarchive',
        onPress: handleBulkArchive,
        variant: 'surface',
        isPrimary: true,
        accessibilityLabel: 'Archive or unarchive selected accounts',
      },
    ];
  }, [handleBulkArchive, isMixedAccountTypes, openModal]);

  return {
    selectedAccountsList,
    bulkParentCandidates,
    selectionActions,
    handleBulkRenameSave,
    handleBulkHierarchyMoveAssign,
    handleBulkAppearanceSelect,
  };
}
