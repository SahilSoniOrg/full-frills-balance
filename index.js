// Polyfill secure randomness for libraries like PostHog (Fixes RangeError on Huawei/Hermes)
import 'react-native-get-random-values';

// Stage 1: Early Bootstrap (Critical Error Tracking)
import * as SplashScreen from 'expo-splash-screen';
import { analytics, navigationIntegration } from '@/src/services/analytics';
import '@/src/features/app/hooks/useFonts';
import { logger } from './src/utils/logger';

// Global anchor for boot performance telemetry
import 'expo-router/entry';

if (process.env.EXPO_OS !== 'web') {
  require('react-native-quick-crypto').install();
}

logger.info('[Boot] JS execution started');

// Prevent splash from hiding until we control it
SplashScreen.preventAutoHideAsync().catch(() => {});
analytics.earlyInitializeSentry();

if (typeof global !== 'undefined') {
  global.__BOOT_START_TIME__ = typeof performance !== 'undefined' ? performance.now() : Date.now();
  global.__HAS_MOUNTED_BEFORE__ = false;
}
