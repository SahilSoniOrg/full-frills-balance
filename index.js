// Polyfill secure randomness for libraries like PostHog (Fixes RangeError on Huawei/Hermes)
import 'react-native-get-random-values';

// Stage 1: Early Bootstrap (Critical Error Tracking)
import { analytics } from './src/services/analytics-service';

// Global anchor for boot performance telemetry
import 'expo-router/entry';
analytics.earlyInitializeSentry();

if (typeof global !== 'undefined') {
  global.__BOOT_START_TIME__ = typeof performance !== 'undefined' ? performance.now() : Date.now();
  global.__HAS_MOUNTED_BEFORE__ = false;
}

if (process.env.EXPO_OS !== 'web') {
  require('react-native-quick-crypto').install();
}
