import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { CommitmentsView } from '@/src/features/commitments/components/CommitmentsView';
import { useCommitmentsViewModel } from '@/src/features/commitments/hooks/useCommitmentsViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function CommitmentsScreen() {
  const vm = useCommitmentsViewModel();

  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: 'Commitments',
      showBack: false,
      headerActions: <PrivacyToggleButton />,
      fab: vm.fab,
    }),
    [vm.fab],
  );

  return <CommitmentsView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(CommitmentsScreen);
