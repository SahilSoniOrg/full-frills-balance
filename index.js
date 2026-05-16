// Polyfill secure randomness for libraries like PostHog (Fixes RangeError on Huawei/Hermes)
import 'react-native-get-random-values';

// Global anchor for boot performance telemetry
import 'expo-router/entry';

if (typeof global !== 'undefined') {
  global.__BOOT_START_TIME__ = typeof performance !== 'undefined' ? performance.now() : Date.now();
  global.__HAS_MOUNTED_BEFORE__ = false;
}

if (process.env.EXPO_OS !== 'web') {
  require('react-native-quick-crypto').install();
}
