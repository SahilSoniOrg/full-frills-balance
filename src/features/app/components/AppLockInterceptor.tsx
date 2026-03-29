import { AppButton, AppText, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import * as LocalAuthentication from '@/src/utils/auth';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

export function AppLockInterceptor({ children }: { children: React.ReactNode }) {
  const { isAppLockEnabled } = useUI();
  const { theme } = useTheme();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const appState = useRef(AppState.currentState);
  const isAuthenticating = useRef(false);
  const lastUnlockTime = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // Don't lock if we are currently showing the auth prompt or just did
        const justUnlocked =
          Date.now() - lastUnlockTime.current < AppConfig.timing.appLockGracePeriodMs;

        if (isAppLockEnabled && !isAuthenticating.current && !justUnlocked) {
          setIsUnlocked(false);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAppLockEnabled]);

  // Trigger authentication on app start or when returning from background
  const handleUnlock = useCallback(async () => {
    // Prevent double prompting if already authenticated or authenticating
    if (isUnlocked || isAuthenticating.current) return;

    isAuthenticating.current = true;

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        lastUnlockTime.current = Date.now();
        setIsUnlocked(true); // Failsafe: if somehow they enabled it without hardware
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Full Frills Balance',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false,
      });
      if (result.success) {
        lastUnlockTime.current = Date.now();
        setIsUnlocked(true);
      }
    } catch (error) {
      // Ensure app isn't completely inaccessible on error
      console.error('AppLock authentication error:', error);
    } finally {
      // Small delay before resetting isAuthenticating to catch delayed app state changes
      setTimeout(() => {
        isAuthenticating.current = false;
      }, AppConfig.timing.appLockAuthTransitionMs);
    }
  }, [isUnlocked]);

  useEffect(() => {
    if (isAppLockEnabled && !isUnlocked) {
      handleUnlock();
    }
  }, [handleUnlock, isAppLockEnabled, isUnlocked]);

  if (isAppLockEnabled && !isUnlocked) {
    return (
      <Screen showBack={false} withPadding>
        <View style={styles.container}>
          <IvyIcon
            name="lock"
            size={100}
            color={theme.surfaceSecondary}
            iconColor={theme.text}
            style={styles.iconContainer}
          />
          <AppText variant="title" weight="bold" style={styles.title}>
            App Locked
          </AppText>
          <AppText variant="body" color="secondary" style={styles.subtitle}>
            Authenticate to access your finances
          </AppText>
          <AppButton onPress={handleUnlock} variant="primary" size="lg">
            Unlock
          </AppButton>
        </View>
      </Screen>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: Spacing.xxl,
    textAlign: 'center',
  },
});
