import { ManageHierarchyView } from '@/src/features/accounts/components/ManageHierarchyView';
import { useManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';
import React from 'react';

export default function ManageHierarchyScreen() {
    const vm = useManageHierarchyViewModel();
    return <ManageHierarchyView {...vm} />;
}
