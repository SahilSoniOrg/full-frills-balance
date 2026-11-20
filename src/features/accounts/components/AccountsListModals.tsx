import { AccountActionSheet } from '@/src/features/accounts/components/AccountActionSheet';
import { BulkRenameAccountsModal } from '@/src/features/accounts/components/BulkRenameAccountsModal';
import { BulkHierarchyMoveModal } from '@/src/features/accounts/components/hierarchy/BulkHierarchyMoveModal';
import type { AccountsListModalsProps } from '@/src/features/accounts/hooks/accountsListTypes';

export type { AccountsListModalsProps };

export function AccountsListModals({
  activeModal,
  onCloseModal,
  selectedAccountsList,
  selectedCount,
  bulkParentCandidates,
  onBulkRenameSave,
  onBulkHierarchyMoveAssign,
  onViewDetails,
  onEditAccount,
  onRecolorAccount,
  onReconcileAccount,
  onToggleArchiveAccount,
  onDeleteAccount,
}: AccountsListModalsProps) {
  if (!activeModal) return null;

  if (activeModal.type === 'actionSheet') {
    return (
      <AccountActionSheet
        visible
        account={activeModal.account}
        onClose={onCloseModal}
        onViewDetails={onViewDetails}
        onEdit={onEditAccount}
        onRecolor={onRecolorAccount}
        onReconcile={onReconcileAccount}
        onToggleArchive={onToggleArchiveAccount}
        onDelete={onDeleteAccount}
      />
    );
  }

  if (activeModal.type === 'bulkRename') {
    return (
      <BulkRenameAccountsModal
        visible
        accounts={selectedAccountsList}
        onClose={onCloseModal}
        onSave={onBulkRenameSave}
      />
    );
  }

  if (activeModal.type === 'bulkHierarchy') {
    return (
      <BulkHierarchyMoveModal
        visible
        selectedCount={selectedCount}
        parentCandidates={bulkParentCandidates}
        onClose={onCloseModal}
        onAssignParent={onBulkHierarchyMoveAssign}
      />
    );
  }

  return null;
}
