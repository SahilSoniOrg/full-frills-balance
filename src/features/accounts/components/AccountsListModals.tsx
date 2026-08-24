import { AppearancePickerModal } from '@/src/components/common/AppearancePickerModal';
import { AccountActionSheet } from '@/src/features/accounts/components/AccountActionSheet';
import { BulkRenameAccountsModal } from '@/src/features/accounts/components/BulkRenameAccountsModal';
import { BulkHierarchyMoveModal } from '@/src/features/accounts/components/hierarchy/BulkHierarchyMoveModal';
import { AccountType } from '@/src/types/enums';
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
  onBulkAppearanceSelect,
  onViewDetails,
  onEditAccount,
  onRecolorAccount,
  onReconcileAccount,
  onToggleArchiveAccount,
  onDeleteAccount,
  onAppearanceUpdate,
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

  if (activeModal.type === 'appearance') {
    return (
      <AppearancePickerModal
        visible
        mode="both"
        onClose={onCloseModal}
        onSave={updates => onAppearanceUpdate(updates)}
        selectedIcon={activeModal.account.icon}
        selectedColor={activeModal.account.accountColor}
        accountType={activeModal.account.accountType ?? AccountType.ASSET}
      />
    );
  }

  if (activeModal.type === 'bulkAppearance') {
    return (
      <AppearancePickerModal
        visible
        mode={activeModal.mode}
        title={
          activeModal.mode === 'color'
            ? 'Change Color for Selected Accounts'
            : 'Change Icon for Selected Accounts'
        }
        onClose={onCloseModal}
        onIconSelect={icon => void onBulkAppearanceSelect({ icon })}
        onColorSelect={color => void onBulkAppearanceSelect({ color })}
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
