import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { HierarchyMoveModal } from '@/src/features/accounts/components/hierarchy/HierarchyMoveModal';
import { AccountManagementTreeList } from '@/src/features/accounts/components/hierarchy/AccountManagementTreeList';
import { useAccountManagementViewModel } from '@/src/features/accounts/hooks/useAccountManagementViewModel';

export function AccountManagementView({
  vm,
  chrome,
}: {
  vm: ReturnType<typeof useAccountManagementViewModel>;
  chrome: ScreenNavChrome;
}) {
  if (vm.isLoading) return null;
  return (
    <ScreenWithChrome chrome={chrome}>
      <AccountManagementTreeList
        accounts={vm.accounts}
        rows={vm.treeRows}
        balancesByAccountId={vm.balancesByAccountId}
        pendingAccountIds={vm.pendingAccountIds}
        pendingPreviews={vm.pendingPreviews}
        isDraftDirty={vm.isDraftDirty}
        pendingChangeCount={vm.pendingChangeCount}
        isSavingDraft={vm.isSavingDraft}
        isOrganizing={vm.isOrganizing}
        onDrop={vm.onDrop}
        onSaveDraft={vm.onSaveDraft}
        onDiscardDraft={vm.onDiscardDraft}
        onSelectAccount={vm.onSelectAccount}
        onToggleExpand={vm.onToggleExpand}
        onToggleTypeSection={vm.onToggleTypeSection}
        onCreateParent={vm.onCreateParent}
        onToggleOrganize={vm.onToggleOrganize}
      />
      <HierarchyMoveModal
        selectedAccountId={vm.selectedAccountId}
        selectedAccount={vm.selectedAccount}
        parentCandidates={vm.parentCandidates}
        isSaving={vm.isSavingDraft}
        onSelectAccount={vm.onSelectAccount}
        onAssignParent={vm.onAssignParent}
        onDismiss={vm.onMoveModalDismiss}
      />
    </ScreenWithChrome>
  );
}
