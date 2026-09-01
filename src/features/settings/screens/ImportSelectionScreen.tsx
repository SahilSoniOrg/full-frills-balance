import { LoadingView } from '@/src/components/core';
import { AppNavigation } from '@/src/utils/navigation';
import { preferences } from '@/src/utils/preferences';
import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

export default function ImportSelectionScreen() {
  const { source } = useLocalSearchParams<{ source?: string }>();

  useEffect(() => {
    const journey =
      source === 'settings'
        ? 'settings_restore'
        : source === 'onboarding' && !preferences.device.deviceRegistered
          ? 'first_run_restore'
          : source === 'onboarding'
            ? 'empty_device_restore'
            : 'picker_restore';
    AppNavigation.toSetupJourney(journey);
  }, [source]);

  return <LoadingView loading />;
}
