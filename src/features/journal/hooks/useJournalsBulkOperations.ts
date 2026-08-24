import type {
  ListSelectionChrome,
  SelectionAction,
} from '@/src/components/common/SelectionActionBar';
import type {
  JournalActiveModal,
  JournalListModalsProps,
} from '@/src/features/journal/types/modals';
import { useSelectedItemMap } from '@/src/hooks/useSelectedItemMap';
import { useUndoableAction } from '@/src/hooks/useUndoableAction';
import type { UseSelectionResult } from '@/src/hooks/useSelection';
import {
  bulkChangeJournalAccount as bulkChangeJournalAccountCommand,
  bulkDeleteJournals as bulkDeleteJournalsCommand,
  bulkDuplicateJournals as bulkDuplicateJournalsCommand,
  bulkRestoreJournals as bulkRestoreJournalsCommand,
  bulkRenameJournals as bulkRenameJournalsCommand,
  mergeJournals as mergeJournalsCommand,
  undoBulkChangeJournalAccount as undoBulkChangeJournalAccountCommand,
} from '@/src/services/journal/bulk';
import { AccountId, EnrichedJournal, JournalId, WorkplaceId } from '@/src/types/domain';
import { confirm, showErrorAlert, toast } from '@/src/utils/alerts';
import { useCallback, useMemo, useState } from 'react';

interface UseJournalsBulkOperationsInput {
  workplaceId?: WorkplaceId;
  journals: EnrichedJournal[];
  selection: UseSelectionResult<JournalId>;
  onShareSelected: () => void;
}

export function useJournalsBulkOperations({
  workplaceId,
  journals,
  selection,
  onShareSelected,
}: UseJournalsBulkOperationsInput) {
  const [activeModal, setActiveModal] = useState<JournalActiveModal>(null);
  const openModal = useCallback((modal: JournalActiveModal) => {
    setActiveModal(modal);
  }, []);
  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  const { selectedItems: selectedJournals } = useSelectedItemMap<EnrichedJournal, JournalId>(
    journals,
    selection,
  );
  const runUndoableAction = useUndoableAction(selection.exitSelectionMode, closeModal);

  // 1. Bulk Rename
  const handleOpenBulkRename = useCallback(() => {
    if (selectedJournals.length === 0) return;
    openModal({ type: 'bulkRename', journals: selectedJournals });
  }, [selectedJournals, openModal]);

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

      await runUndoableAction(
        () => bulkRenameJournalsCommand(workplaceId, renames),
        res => bulkRenameJournalsCommand(workplaceId, res.inverseRenames),
        res =>
          res.renamedCount > 0
            ? `Updated names for ${res.renamedCount} journal entr${res.renamedCount === 1 ? 'y' : 'ies'}`
            : '',
        {
          errorMessage: 'Failed to update journal entry names',
          undoSuccessMessage: 'Rename undone',
          onUndoError: error => showErrorAlert(error, 'Failed to undo rename'),
        },
      );
    },
    [workplaceId, runUndoableAction],
  );

  // 2. Bulk Duplicate
  const handleBulkDuplicate = useCallback(async () => {
    if (!workplaceId || selection.selectedIds.size === 0) return;
    const ids = Array.from(selection.selectedIds);

    await runUndoableAction(
      () => bulkDuplicateJournalsCommand(workplaceId, ids),
      duplicated =>
        bulkDeleteJournalsCommand(
          workplaceId,
          duplicated.map(journal => journal.id),
        ),
      duplicated =>
        `Duplicated ${duplicated.length} journal entr${duplicated.length === 1 ? 'y' : 'ies'}`,
      {
        errorMessage: 'Failed to duplicate journal entries',
        undoSuccessMessage: 'Duplicated journal entries removed',
        onUndoError: error => showErrorAlert(error, 'Failed to undo duplication'),
      },
    );
  }, [workplaceId, selection.selectedIds, runUndoableAction]);

  // 3. Merge
  const handleOpenMerge = useCallback(() => {
    if (selection.selectedIds.size < 2) {
      toast.info('Select at least 2 journal entries to merge.');
      return;
    }
    openModal({ type: 'merge', journalIds: Array.from(selection.selectedIds) });
  }, [selection.selectedIds, openModal]);

  const handleMergeConfirm = useCallback(
    async (params: { description: string; journalDate: number }) => {
      if (!workplaceId || selection.selectedIds.size < 2) return;
      const ids = Array.from(selection.selectedIds);
      try {
        await mergeJournalsCommand(workplaceId, ids, params);
        selection.exitSelectionMode();
        closeModal();
        toast.success(`Successfully merged ${ids.length} journal entries into 1`);
      } catch (error) {
        showErrorAlert(error, 'Failed to merge journal entries');
      }
    },
    [workplaceId, selection, closeModal],
  );

  // 4. Change Account (Destination / Source)
  const handleOpenChangeAccount = useCallback(() => {
    if (selection.selectedIds.size === 0) return;
    openModal({ type: 'bulkChangeAccount', journalIds: Array.from(selection.selectedIds) });
  }, [selection.selectedIds, openModal]);

  const handleBulkChangeAccountSelect = useCallback(
    async (targetLeg: 'debit' | 'credit', newAccountId: AccountId) => {
      if (!workplaceId || selection.selectedIds.size === 0) return;
      const ids = Array.from(selection.selectedIds);
      const legName = targetLeg === 'debit' ? 'Destination' : 'Source';

      await runUndoableAction(
        () => bulkChangeJournalAccountCommand(workplaceId, ids, targetLeg, newAccountId),
        res =>
          undoBulkChangeJournalAccountCommand(workplaceId, res.originalAccountIdByTransactionId),
        res =>
          `Updated ${legName} account for ${res.updatedCount} journal entr${res.updatedCount === 1 ? 'y' : 'ies'}`,
        {
          errorMessage: 'Failed to update journal entry account',
          undoSuccessMessage: 'Account change undone',
          onUndoError: error => showErrorAlert(error, 'Failed to undo account change'),
        },
      );
    },
    [workplaceId, selection.selectedIds, runUndoableAction],
  );

  // 5. Bulk Delete
  const handleBulkDelete = useCallback(() => {
    if (!workplaceId || selection.selectedIds.size === 0) return;
    const ids = Array.from(selection.selectedIds);

    confirm.show({
      title: 'Delete Journal Entries',
      message: `Are you sure you want to delete ${ids.length} selected journal entr${ids.length === 1 ? 'y' : 'ies'}?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        await runUndoableAction(
          () => bulkDeleteJournalsCommand(workplaceId, ids),
          token => bulkRestoreJournalsCommand(workplaceId, token),
          `Deleted ${ids.length} journal entr${ids.length === 1 ? 'y' : 'ies'}`,
          {
            errorMessage: 'Failed to delete journal entries',
            undoSuccessMessage: 'Deleted journal entries restored',
            onUndoError: error => showErrorAlert(error, 'Failed to undo deletion'),
          },
        );
      },
      onCancel: () => {},
      onClose: () => {},
    });
  }, [workplaceId, selection, runUndoableAction]);

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

  const handleSelectAll = useCallback(() => {
    selection.selectAll(journals.map(j => j.id));
  }, [selection, journals]);

  const selectionChrome: ListSelectionChrome = useMemo(
    () => ({
      exitSelectionMode: selection.exitSelectionMode,
      selectAll: handleSelectAll,
      clearItems: selection.clearItems,
      onShareSelected,
      actions,
    }),
    [selection.exitSelectionMode, handleSelectAll, selection.clearItems, onShareSelected, actions],
  );

  return {
    selectionChrome,
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
