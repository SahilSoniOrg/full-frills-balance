import { reloadAppAsync } from 'expo';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

/**
 * Reloads the JS bundle. Prefer `reloadAppAsync` over `Updates.reloadAsync`:
 * the updates API can hang in release simulator builds and is meant for OTA
 * bundle swaps, not post-import state resets. Older native binaries may not
 * expose the Expo modules global, so keep the updates API as a fallback.
 */
export async function reloadApp(): Promise<void> {
  if (Platform.OS === 'web') {
    window.location.reload();
    return;
  }

  const nativeReload = (globalThis as { expo?: { reloadAppAsync?: unknown } }).expo?.reloadAppAsync;
  if (typeof nativeReload === 'function') {
    try {
      await Promise.race([
        reloadAppAsync('App restart requested'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Native reload timed out')), 2000),
        ),
      ]);
      return;
    } catch {
      // Fall through for binaries without a working Expo reload bridge.
    }
  }

  await Updates.reloadAsync();
}
