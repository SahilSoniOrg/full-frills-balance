import React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useUI } from '@/src/contexts/UIContext';

/**
 * Manages the transition from Splash Screen to the Application UI.
 */
export function BootManager() {
  const { isAppReady } = useUI();

  React.useEffect(() => {
    if (isAppReady) {
      SplashScreen.hideAsync().catch(() => {
        /* ignore */
      });
    }
  }, [isAppReady]);

  return null;
}
