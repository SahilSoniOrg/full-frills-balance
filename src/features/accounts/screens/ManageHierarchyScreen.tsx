import type { ScreenNavChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants/app-config';
import { ManageHierarchyView } from '@/src/features/accounts/components/ManageHierarchyView';
import { useManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';

const chrome: ScreenNavChrome = {
  screenTitle: AppConfig.strings.accounts.hierarchy.title,
  showBack: true,
  backIcon: 'back',
};

export default function ManageHierarchyScreen() {
  const vm = useManageHierarchyViewModel();
  return <ManageHierarchyView {...vm} chrome={chrome} />;
}
