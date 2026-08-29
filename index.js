// Polyfill secure randomness for libraries like PostHog (Fixes RangeError on Huawei/Hermes)
import 'react-native-get-random-values';

// Hold the native splash before expo-router boots. Too late and the first
// full-screen frame is visible before safe-area insets apply (FUL-42).
import '@/src/features/app/preventSplashAutoHide';

// Stage 1: Early Bootstrap (Critical Error Tracking)
import { analytics } from '@/src/services/analytics';
import '@/src/features/app/hooks/useFonts';
import { logger } from './src/utils/logger';

// Global anchor for boot performance telemetry
import 'expo-router/entry';

if (process.env.EXPO_OS !== 'web') {
  require('react-native-quick-crypto').install();
}

logger.info('[Boot] JS execution started');

analytics.earlyInitializeSentry();

if (typeof global !== 'undefined') {
  global.__BOOT_START_TIME__ = typeof performance !== 'undefined' ? performance.now() : Date.now();
  global.__HAS_MOUNTED_BEFORE__ = false;
}
