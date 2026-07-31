import { useUI } from '@/src/contexts/UIContext';
import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { AppConfig } from '@/src/constants/app-config';
import * as LocalAuthentication from '@/src/utils/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const AUTH_COOLDOWN_MS = 2000;

export function useAppLockEngine() {
  const { isAppLockEnabled } = usePrivacyPrefs();
  const { isUnlocked, isAppActive, authenticateSession, setIsAppActive, setIsLockAuthenticating } =
    useUI();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appState = useRef(AppState.currentState);
  const lastUnlockTime = useRef(0);
  const lastAuthAttempt = useRef(0);

  const handleUnlock = useCallback(
    async (isManualTrigger = false) => {
      if (isUnlocked || isAuthenticating) return;

      // Auth Spam Protection:
      // Throttles auto-prompts. Manual clicks bypass this for better UX.
      const now = Date.now();
      if (!isManualTrigger && now - lastAuthAttempt.current < AUTH_COOLDOWN_MS) {
        return;
      }

      setIsAuthenticating(true);
      setIsLockAuthenticating(true);
      setError(null);
      lastAuthAttempt.current = now;

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          lastUnlockTime.current = Date.now();
          authenticateSession(true);
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Full Frills Balance',
          fallbackLabel: 'Use Passcode',
          disableDeviceFallback: false,
        });

        if (result.success) {
          /**
           * ELITE BACKGROUND GUARD:
           * We strictly block the session unlock if the app has been fully
           * backgrounded during the biometric prompt.
           */
          if (AppState.currentState !== 'background') {
            lastUnlockTime.current = Date.now();
            authenticateSession(true);
          } else {
            // If we resolved while minimized, we reset attempt to allow fresh prompt on return
            lastAuthAttempt.current = 0;
          }
        } else {
          // GRANULAR ERROR HANDLING:
          // Providing specific feedback based on the failure type.
          switch (result.error) {
            case 'user_cancel':
            case 'app_cancel':
            case 'system_cancel':
              setError(null); // Don't show error for intentional cancellations
              break;
            case 'lockout':
              setError('Too many attempts. Biometrics locked.');
              break;
            case 'not_enrolled':
              setError('No biometrics set up on this device.');
              break;
            default:
              setError('Authentication failed. Please try again.');
          }
        }
      } catch (err) {
        console.error('[AppLockEngine] Auth error:', err);
        setError('An unexpected error occurred.');
      } finally {
        setIsAuthenticating(false);
        setIsLockAuthenticating(false);
      }
    },
    [isUnlocked, isAuthenticating, authenticateSession, setIsLockAuthenticating],
  );

  useEffect(() => {
    // Correctly initialize state on mount
    setIsAppActive(AppState.currentState === 'active');

    const subscription = AppState.addEventListener('change', nextAppState => {
      const isNowActive = nextAppState === 'active';

      // Update global context state
      setIsAppActive(isNowActive);

      // Transition from background to active
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const gracePeriodPassed =
          Date.now() - lastUnlockTime.current >= AppConfig.timing.appLockGracePeriodMs;

        // If locked/timed-out, ensure we reset the unlocked status in context
        if (isAppLockEnabled && gracePeriodPassed && isUnlocked) {
          authenticateSession(false);
        }
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [isAppLockEnabled, isUnlocked, authenticateSession, setIsAppActive]);

  // ELITE CONSISTENCY:
  // Use our own system-checked 'isAppActive' flag instead of raw AppState snapshot.
  useEffect(() => {
    if (isAppLockEnabled && !isUnlocked && isAppActive) {
      setTimeout(() => handleUnlock(false), 0);
    }
  }, [isAppLockEnabled, isUnlocked, isAppActive, handleUnlock]);

  return {
    isAuthenticating,
    error,
    authenticate: () => handleUnlock(true),
  };
}
