import { PrivacyToggleButton } from '@/src/components/common/PrivacyToggleButton';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { AppConfig } from '@/src/constants';
import { HubView } from '@/src/features/hub/components/HubView';
import { useHubViewModel } from '@/src/features/hub/hooks/useHubViewModel';
import { withPrivacyScope } from '@/src/contexts/PrivacyScope';
import { useMemo } from 'react';

function HubScreen() {
  const vm = useHubViewModel();

  const chrome = useMemo<TabScreenChrome>(
    () => ({
      screenTitle: AppConfig.strings.dashboard.hub.title,
      headerActions: <PrivacyToggleButton />,
    }),
    [],
  );

  return <HubView {...vm} chrome={chrome} />;
}

export default withPrivacyScope(HubScreen);
