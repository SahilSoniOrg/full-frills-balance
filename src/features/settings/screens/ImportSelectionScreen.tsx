import { LoadingView } from '@/src/components/core';
import { Page } from '@/src/design-system';
import { preferences } from '@/src/services/preferences';
import type { SetupJourneyId } from '@/src/services/setup/setupDraftIdentity';
import { AppNavigation } from '@/src/utils/navigation';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

function restoreJourneyFromSource(source?: string): SetupJourneyId {
  if (source === 'settings') return 'settings_restore';
  // Legacy /import-selection?source=onboarding deep links.
  if (source === 'onboarding') {
    return preferences.device.deviceRegistered ? 'empty_device_restore' : 'first_run_restore';
  }
  return 'picker_restore';
}

export default function ImportSelectionScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();

  useEffect(() => {
    AppNavigation.toSetupJourney(restoreJourneyFromSource(source));
  }, [source]);

  return (
    <Page>
      <LoadingView loading />
    </Page>
  );
}
