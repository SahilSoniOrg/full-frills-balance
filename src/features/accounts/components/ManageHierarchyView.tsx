import { Screen } from '@/src/components/layout';
import { AppConfig } from '@/src/constants/app-config';
import { ManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';
import React from 'react';
import { HierarchyMoveModal } from './hierarchy/HierarchyMoveModal';
import { HierarchyTree } from './hierarchy/HierarchyTree';

export function ManageHierarchyView(vm: ManageHierarchyViewModel) {
    return (
        <Screen title={AppConfig.strings.accounts.hierarchy.title}>
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
                onToggleExpand={vm.onToggleExpand}
                onToggleCategory={vm.onToggleCategory}
                onAssignParent={vm.onAssignParent}
            />

            <HierarchyMoveModal
                selectedAccountId={vm.selectedAccountId}
                selectedAccount={vm.selectedAccount}
                canSelectedAccountBeParent={vm.canSelectedAccountBeParent}
                addChildCandidates={vm.addChildCandidates}
                parentCandidates={vm.parentCandidates}
                balancesByAccountId={vm.balancesByAccountId}
                onSelectAccount={vm.onSelectAccount}
                onAddChild={vm.onAddChild}
                onAssignParent={vm.onAssignParent}
            />
        </Screen>
    );
}
