import type { SelectionAction } from '@/src/components/common/SelectionActionBar';
import Journal from '@/src/data/models/Journal';
import type { JournalListModalsProps } from '@/src/features/journal/components/JournalListModals';
import { useSelection } from '@/src/hooks/useSelection';
import {
  bulkChangeJournalAccount as bulkChangeJournalAccountCommand,
  bulkDeleteJournals as bulkDeleteJournalsCommand,
  bulkDuplicateJournals as bulkDuplicateJournalsCommand,
  bulkRenameJournals as bulkRenameJournalsCommand,
  mergeJournals as mergeJournalsCommand,
  undoBulkChangeJournalAccount as undoBulkChangeJournalAccountCommand,
} from '@/src/services/journal/journalBulkCommands';
import { AccountId, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';

export type JournalActiveModal =
  | { type: 'bulkRename'; journals: (Journal | EnrichedJournal)[] }
  | { type: 'merge'; journalIds: JournalId[] }
  | { type: 'bulkChangeAccount'; journalIds: JournalId[] }
  | null;

interface UseJournalsBulkOperationsInput {
  workplaceId?: WorkplaceId;
  journals: (Journal | EnrichedJournal)[];
  selection: ReturnType<typeof useSelection<JournalId>>;
  onShareSelected: () => void;
}

export function useJournalsBulkOperations({
  workplaceId,
  journals,
  selection,
  onShareSelected,
}: UseJournalsBulkOperationsInput) {
  const [activeModal, setActiveModal] = useState<JournalActiveModal>(null);

  const journalsById = useMemo(
    () => new Map<JournalId, Journal | EnrichedJournal>(journals.map(j => [j.id as JournalId, j])),
    [journals],
  );

  const selectedJournals = useMemo(
    () =>
      Array.from(selection.selectedIds)
        .map(id => journalsById.get(id))
        .filter((j): j is Journal | EnrichedJournal => Boolean(j)),
    [selection.selectedIds, journalsById],
  );

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  // 1. Bulk Rename
  const handleOpenBulkRename = useCallback(() => {
    if (selectedJournals.length === 0) return;
    setActiveModal({ type: 'bulkRename', journals: selectedJournals });
  }, [selectedJournals]);

  const handleBulkRenameSave = useCallback(
    async (namesByJournalId: Record<JournalId, string>) => {
      if (!workplaceId) return;

      const trimmedEntries = Object.entries(namesByJournalId).map(
        ([id, name]) => [id as JournalId, name.trim()] as const,
      );
      const renames: Record<JournalId, string> = {};
      for (const [id, name] of trimmedEntries) {
        renames[id] = name;
      }

      try {
        const { renamedCount, inverseRenames } = await bulkRenameJournalsCommand(
          workplaceId,
          renames,
        );
        selection.exitSelectionMode();
        closeModal();

        if (renamedCount === 0) return;

        toast.success(`Updated names for ${renamedCount} transaction(s)`, {
          action: {
            label: 'Undo',
            onPress: async () => {
              try {
                await bulkRenameJournalsCommand(workplaceId, inverseRenames);
                toast.success('Rename undone');
              } catch (error) {
                showErrorAlert(error, 'Failed to undo rename');
              }
            },
          },
        });
      } catch (error) {
        showErrorAlert(error, 'Failed to update transaction names');
      }
    },
    [workplaceId, selection, closeModal],
  );

  // 2. Bulk Duplicate
  const handleBulkDuplicate = useCallback(async () => {
    if (!workplaceId || selection.selectedIds.size === 0) return;
    const ids = Array.from(selection.selectedIds);
    try {
      const duplicated = await bulkDuplicateJournalsCommand(workplaceId, ids);
      selection.exitSelectionMode();
      toast.success(`Duplicated ${duplicated.length} transaction(s)`);
    } catch (error) {
      showErrorAlert(error, 'Failed to duplicate transactions');
    }
  }, [workplaceId, selection]);

  // 3. Merge
  const handleOpenMerge = useCallback(() => {
    if (selection.selectedIds.size < 2) {
      toast.info('Select at least 2 transactions to merge.');
      return;
    }
    setActiveModal({ type: 'merge', journalIds: Array.from(selection.selectedIds) });
  }, [selection.selectedIds]);

  const handleMergeConfirm = useCallback(
    async (params: { description: string; journalDate: number }) => {
      if (!workplaceId || selection.selectedIds.size < 2) return;
      const ids = Array.from(selection.selectedIds);
      try {
        await mergeJournalsCommand(workplaceId, ids, params);
        selection.exitSelectionMode();
        closeModal();
        toast.success(`Successfully merged ${ids.length} transactions into 1`);
      } catch (error) {
        showErrorAlert(error, 'Failed to merge transactions');
      }
    },
    [workplaceId, selection, closeModal],
  );

  // 4. Change Account (Destination / Source)
  const handleOpenChangeAccount = useCallback(() => {
    if (selection.selectedIds.size === 0) return;
    setActiveModal({ type: 'bulkChangeAccount', journalIds: Array.from(selection.selectedIds) });
  }, [selection.selectedIds]);

  const handleBulkChangeAccountSelect = useCallback(
    async (targetLeg: 'debit' | 'credit', newAccountId: AccountId) => {
      if (!workplaceId || selection.selectedIds.size === 0) return;
      const ids = Array.from(selection.selectedIds);
      try {
        const { updatedCount, originalAccountIdByTransactionId } =
          await bulkChangeJournalAccountCommand(workplaceId, ids, targetLeg, newAccountId);
        selection.exitSelectionMode();
        closeModal();
        const legName = targetLeg === 'debit' ? 'Destination' : 'Source';
        toast.success(`Updated ${legName} account for ${updatedCount} transaction(s)`, {
          action: {
            label: 'Undo',
            onPress: async () => {
              try {
                await undoBulkChangeJournalAccountCommand(
                  workplaceId,
                  originalAccountIdByTransactionId,
                );
                toast.success('Account change undone');
              } catch (error) {
                showErrorAlert(error, 'Failed to undo account change');
              }
            },
          },
        });
      } catch (error) {
        showErrorAlert(error, 'Failed to update transaction account');
        throw error;
      }
    },
    [workplaceId, selection, closeModal],
  );

  // 5. Bulk Delete
  const handleBulkDelete = useCallback(() => {
    if (!workplaceId || selection.selectedIds.size === 0) return;
    const ids = Array.from(selection.selectedIds);

    confirm.show({
      title: 'Delete Transactions',
      message: `Are you sure you want to delete ${ids.length} selected transaction${ids.length === 1 ? '' : 's'}? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        try {
          await bulkDeleteJournalsCommand(workplaceId, ids);
          selection.exitSelectionMode();
          toast.success(`Deleted ${ids.length} transaction(s)`);
        } catch (error) {
          showErrorAlert(error, 'Failed to delete transactions');
        }
      },
      onCancel: () => {},
      onClose: () => {},
    });
  }, [workplaceId, selection]);

  // Bulk Selection Actions for SelectionActionBar
  const actions: SelectionAction[] = useMemo(() => {
    const count = selection.selectedIds.size;
    const disabled = count === 0;

    return [
      {
        name: 'edit' as const,
        label: 'Rename',
        onPress: handleOpenBulkRename,
        variant: 'surface',
        disabled,
        accessibilityLabel: 'Edit names of selected transactions',
      },
      {
        name: 'copy' as const,
        label: 'Duplicate',
        onPress: handleBulkDuplicate,
        variant: 'surface',
        disabled,
        accessibilityLabel: 'Duplicate selected transactions',
      },
      {
        name: 'merge' as const,
        label: 'Merge',
        onPress: handleOpenMerge,
        variant: 'surface',
        disabled: count < 2,
        accessibilityLabel: 'Merge selected transactions',
      },
      {
        name: 'swapHorizontal' as const,
        label: 'Change Account',
        onPress: handleOpenChangeAccount,
        variant: 'surface',
        disabled,
        accessibilityLabel: 'Change accounts for selected transactions',
      },
      {
        name: 'share' as const,
        label: 'Share',
        onPress: onShareSelected,
        variant: 'primary',
        isPrimary: true,
        disabled,
        accessibilityLabel: 'Share selected transactions',
      },
      {
        name: 'delete' as const,
        label: 'Delete',
        onPress: handleBulkDelete,
        variant: 'error',
        isPrimary: true,
        disabled,
        accessibilityLabel: 'Delete selected transactions',
      },
    ];
  }, [
    selection.selectedIds.size,
    handleOpenBulkRename,
    handleBulkDuplicate,
    handleOpenMerge,
    handleOpenChangeAccount,
    onShareSelected,
    handleBulkDelete,
  ]);

  const modals = useMemo(
    (): JournalListModalsProps => ({
      activeModal,
      workplaceId,
      onCloseModal: closeModal,
      onBulkRenameSave: handleBulkRenameSave,
      onMergeConfirm: handleMergeConfirm,
      onBulkChangeAccountSelect: handleBulkChangeAccountSelect,
    }),
    [
      activeModal,
      workplaceId,
      closeModal,
      handleBulkRenameSave,
      handleMergeConfirm,
      handleBulkChangeAccountSelect,
    ],
  );

  return {
    activeModal,
    selectedJournals,
    closeModal,
    handleOpenBulkRename,
    handleBulkRenameSave,
    handleBulkDuplicate,
    handleOpenMerge,
    handleMergeConfirm,
    handleOpenChangeAccount,
    handleBulkChangeAccountSelect,
    handleBulkDelete,
    actions,
    modals,
  };
}
