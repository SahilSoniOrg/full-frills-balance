import { AccountPickerModal } from '@/src/features/accounts';
import { ScreenWithChrome, type ScreenNavChrome } from '@/src/components/layout';
import { AppConfig } from '@/src/constants/app-config';
import { ManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';
import { HierarchyMoveModal } from './hierarchy/HierarchyMoveModal';
import { HierarchyTree } from './hierarchy/HierarchyTree';

export function ManageHierarchyView(vm: ManageHierarchyViewModel & { chrome: ScreenNavChrome }) {
  return (
    <ScreenWithChrome chrome={vm.chrome}>
      <HierarchyTree
        accounts={vm.accounts}
        balancesByAccountId={vm.balancesByAccountId}
        selectedAccountId={vm.selectedAccountId}
        collapsedCategories={vm.collapsedCategories}
        expandedAccountIds={vm.expandedAccountIds}
        accountsByParent={vm.accountsByParent}
        visibleRootAccountsByCategory={vm.visibleRootAccountsByCategory}
        onCreateParent={vm.onCreateParent}
        onSelectAccount={vm.onSelectAccount}
        onRequestAddChild={vm.onRequestAddChild}
        onToggleExpand={vm.onToggleExpand}
        onToggleCategory={vm.onToggleCategory}
        onAssignParent={vm.onAssignParent}
      />

      <AccountPickerModal
        visible={!!vm.addChildParentId}
        accounts={vm.addChildCandidates}
        title={AppConfig.strings.accounts.hierarchy.addChild}
        onClose={vm.onCloseAddChild}
        onSelect={accountId => void vm.onAddChild(accountId)}
      />

      <HierarchyMoveModal
        selectedAccountId={vm.selectedAccountId}
        selectedAccount={vm.selectedAccount}
        parentCandidates={vm.parentCandidates}
        onSelectAccount={vm.onSelectAccount}
        onAssignParent={vm.onAssignParent}
      />
    </ScreenWithChrome>
  );
}
