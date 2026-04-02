import { AppButton, AppText, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Spacing } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { useUI } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { useAppLockEngine } from '@/src/features/app/hooks/useAppLockEngine';
import { MotiView } from 'moti';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import React, { useEffect } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

export function AppLockInterceptor({ children }: { children: React.ReactNode }) {
  const { isAppLockEnabled, hasUnlockedThisSession, isAppCurrentlyLocked, requireRestart } =
    useUI();
  const { theme } = useTheme();

  // Use the extracted logic engine
  const { isAuthenticating, error, authenticate } = useAppLockEngine();

  // BULLETPROOF CONDITIONAL PRIVACY:
  // We only block screenshots while the app is locked or in the task switcher.
  // This allows normal user screenshots inside the app without compromising
  // switcher security (black screen).
  useEffect(() => {
    const applyPrivacy = async () => {
      try {
        if (isAppCurrentlyLocked) {
          await preventScreenCaptureAsync();
        } else {
          await allowScreenCaptureAsync();
        }
      } catch (err) {
        console.warn('[AppLockInterceptor] Screen capture toggle failed:', err);
      }
    };
    applyPrivacy();
  }, [isAppCurrentlyLocked]);

  // SESSION GUARD:
  // Delayed mount for cold-boot protection. once session is "hot", we keep
  // the children mounted to preserve state during fast switches.
  const shouldRenderChildren = !isAppLockEnabled || hasUnlockedThisSession;

  const handlePanicReset = () => {
    requireRestart({ type: 'RESET' });
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.surface }]}>
      {/* The main app content (with session guard) */}
      {shouldRenderChildren && (
        <MotiView
          animate={{
            opacity: isAppCurrentlyLocked ? 0 : 1,
            scale: isAppCurrentlyLocked ? 0.98 : 1,
          }}
          transition={{
            type: 'timing',
            duration: AppConfig.timing.appLockFadeDurationMs,
          }}
          style={styles.contentContainer}
        >
          {children}
        </MotiView>
      )}

      {/* 
        The native Modal shell for the Lock Screen.
        Using native Modal is mandatory for iOS deep-link security layering.
      */}
      <Modal
        visible={isAppCurrentlyLocked}
        transparent={false}
        animationType={Platform.OS === 'ios' ? 'fade' : 'none'}
        statusBarTranslucent
      >
        <View style={[styles.root, { backgroundColor: theme.surface }]}>
          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              type: 'timing',
              duration: AppConfig.timing.appLockFadeDurationMs,
            }}
            style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]}
          >
            <Screen showBack={false} withPadding>
              <View style={styles.container}>
                <MotiView
                  from={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'timing', duration: 400, delay: 100 }}
                  style={[styles.iconContainer, { backgroundColor: theme.surfaceSecondary }]}
                >
                  <IvyIcon name="lock" size={48} color="transparent" iconColor={theme.text} />
                </MotiView>

                <AppText variant="title" weight="bold" style={styles.title}>
                  App Locked
                </AppText>

                {/* FAILURE UI FEEDBACK: Providing clear reasons if lock persists */}
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                  {error || 'Authenticate to access your finances'}
                </AppText>

                <View style={{ marginTop: Spacing.xs, gap: Spacing.md }}>
                  <AppButton
                    onPress={authenticate}
                    variant="primary"
                    size="lg"
                    loading={isAuthenticating}
                  >
                    Unlock
                  </AppButton>

                  {/* ELITE ESCAPE HATCH: Emergency reset path for broken biometrics */}
                  <AppButton onPress={handlePanicReset} variant="ghost" size="sm">
                    Reset App
                  </AppButton>
                </View>
              </View>
            </Screen>
          </MotiView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: Spacing.xxl,
    textAlign: 'center',
    maxWidth: 240,
  },
});
