import { AppearancePickerModal } from '@/src/components/common/AppearancePickerModal';
import { IconName } from '@/src/components/core';
import { AccountActionSheet } from '@/src/features/accounts/components/AccountActionSheet';
import { BulkRenameAccountsModal } from '@/src/features/accounts/components/BulkRenameAccountsModal';
import { BulkHierarchyMoveModal } from '@/src/features/accounts/components/hierarchy/BulkHierarchyMoveModal';
import type { HierarchyCandidateAccount } from '@/src/features/accounts/helpers/bulkHierarchyCandidates';
import type { AccountsListActiveModal } from '@/src/features/accounts/hooks/useAccountsListViewModel';
import type { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { AccountId, AccountType } from '@/src/types/domain';

export interface AccountsListModalsProps {
  activeModal: AccountsListActiveModal;
  onCloseModal: () => void;
  selectedAccountsList: AccountCardViewModel[];
  selectedCount: number;
  bulkParentCandidates: HierarchyCandidateAccount[];
  onBulkRenameSave: (namesByAccountId: Record<AccountId, string>) => Promise<void> | void;
  onBulkHierarchyMoveAssign: (parentId: AccountId | null) => Promise<void> | void;
  onBulkAppearanceSelect: (updates: { icon?: IconName; color?: string }) => Promise<void> | void;
  onViewDetails?: (account: AccountCardViewModel) => void;
  onEditAccount?: (account: AccountCardViewModel) => void;
  onRecolorAccount?: (account: AccountCardViewModel) => void;
  onReconcileAccount?: (account: AccountCardViewModel) => void;
  onToggleArchiveAccount?: (account: AccountCardViewModel) => void;
  onDeleteAccount?: (account: AccountCardViewModel) => void;
  onAppearanceUpdate: (updates: { icon?: IconName; color?: string }) => Promise<void> | void;
}

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
