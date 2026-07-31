import { usePrivacyPrefs } from '@/src/hooks/usePrivacyPrefs';
import { analytics } from '@/src/services/analytics-service';
import { alert, confirm } from '@/src/utils/alerts';
import * as LocalAuthentication from '@/src/utils/auth';
import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';

export interface PrivacySettingsViewModel {
  isPrivacyMode: boolean;
  onTogglePrivacy: () => void;
  isWidgetPrivacyEnabled: boolean;
  onToggleWidgetPrivacy: () => void;
  isAppLockEnabled: boolean;
  onToggleAppLock: () => void;
}

export function usePrivacySettingsViewModel(): PrivacySettingsViewModel {
  const {
    isPrivacyMode,
    setPrivacyMode,
    isAppLockEnabled,
    setAppLockEnabled,
    isWidgetPrivacyEnabled,
    setWidgetPrivacyEnabled,
  } = usePrivacyPrefs();

  const onTogglePrivacy = useCallback(() => {
    const newState = !isPrivacyMode;
    setPrivacyMode(newState);
    analytics.trackFeatureUsage('settings', 'toggle_privacy_mode', {
      new_state: newState,
    });
  }, [isPrivacyMode, setPrivacyMode]);

  const onToggleWidgetPrivacy = useCallback(() => {
    const newState = !isWidgetPrivacyEnabled;
    setWidgetPrivacyEnabled(newState);
    analytics.trackFeatureUsage('settings', 'toggle_widget_privacy', {
      new_state: newState,
    });
  }, [isWidgetPrivacyEnabled, setWidgetPrivacyEnabled]);

  const onToggleAppLock = useCallback(async () => {
    if (isAppLockEnabled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to disable App Lock',
      });
      if (result.success) {
        setAppLockEnabled(false);
      }
    } else {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        if (Platform.OS === 'web') {
          alert.show({
            title: 'Authentication not set up',
            message: 'Your browser does not support Passkeys (WebAuthn).',
            type: 'error',
          });
          return;
        }

        confirm.show({
          title: 'Setup Required',
          message:
            'Your device does not have a screen lock or biometric authentication set up. Please configure one in your device settings to enable App Lock.',
          confirmText: 'Go to Settings',
          cancelText: 'Dismiss',
          onConfirm: () => {
            if (Platform.OS === 'android') {
              Linking.sendIntent('android.settings.SECURITY_SETTINGS').catch(() => {
                Linking.openSettings();
              });
            } else {
              Linking.openSettings();
            }
          },
        });
        return;
      }

      const result = await LocalAuthentication.enrollAsync({
        promptMessage: 'Authenticate to enable App Lock',
      });
      if (result.success) {
        setAppLockEnabled(true);
      }
    }
  }, [isAppLockEnabled, setAppLockEnabled]);

  return {
    isPrivacyMode,
    onTogglePrivacy,
    isWidgetPrivacyEnabled,
    onToggleWidgetPrivacy,
    isAppLockEnabled,
    onToggleAppLock,
  };
}
