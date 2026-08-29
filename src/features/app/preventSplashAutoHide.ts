import * as SplashScreen from 'expo-splash-screen';

// Must be imported before `expo-router/entry`. Calling preventAutoHide after
// the router boots is too late: the native splash can already be gone, leaving
// one full-screen frame before safe-area insets apply.
SplashScreen.preventAutoHideAsync().catch(() => {});

try {
  SplashScreen.setOptions({ duration: 0, fade: false });
} catch {
  // setOptions is a no-op on web and in some test environments.
}
